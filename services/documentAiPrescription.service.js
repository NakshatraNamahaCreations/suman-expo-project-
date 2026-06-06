"use strict";

/**
 * Document AI Form Parser service for prescription table extraction.
 *
 * Uses the Google Document AI Form Parser processor to extract table rows
 * with correct column-to-field mapping. Each medicine gets its own
 * frequency, duration, and quantity — no cross-row contamination.
 *
 * Falls back to single-line text extraction when the processor returns
 * fewer than 3 table medicines (degraded image, rotated scan, etc.).
 */

const { DocumentProcessorServiceClient } = require("@google-cloud/documentai").v1;

const PROJECT_ID   = process.env.DOCUMENT_AI_PROJECT_ID;
const LOCATION     = process.env.DOCUMENT_AI_LOCATION || "us";
const PROCESSOR_ID = process.env.DOCUMENT_AI_PROCESSOR_ID;

// Use region-specific endpoint to avoid cross-region latency / auth errors
const docAiClient = new DocumentProcessorServiceClient({
  apiEndpoint: `${LOCATION}-documentai.googleapis.com`,
});

// ─── Low-level text helpers ───────────────────────────────────────────────────

/**
 * Extract the text for a single table cell using its textAnchor segments.
 */
function getCellText(docText, cell) {
  if (!cell?.layout?.textAnchor?.textSegments?.length) return "";
  return cell.layout.textAnchor.textSegments
    .map((seg) =>
      docText.substring(
        Number(seg.startIndex) || 0,
        Number(seg.endIndex) || 0
      )
    )
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Identify the column index for each prescription field by scanning the
 * header row texts. Returns positional defaults if no header is detected.
 */
function identifyColumns(headerTexts) {
  const cols = { name: 0, dose: 1, frequency: 2, instruction: 3, duration: 4, qty: 5 };
  headerTexts.forEach((text, i) => {
    const t = text.toLowerCase();
    if (/brand|strength|medicine|name/i.test(t)) cols.name = i;
    else if (/dose/i.test(t))                   cols.dose = i;
    else if (/freq/i.test(t))                   cols.frequency = i;
    else if (/instruct/i.test(t))               cols.instruction = i;
    else if (/duration/i.test(t))               cols.duration = i;
    else if (/qty|quantity/i.test(t))           cols.qty = i;
  });
  return cols;
}

// ─── Field parsers ────────────────────────────────────────────────────────────

function parseDoseCount(doseText) {
  const n = parseInt(String(doseText).match(/\d+/)?.[0] || "1", 10);
  return n > 0 ? n : 1;
}

function parseFreqPerDay(freqText) {
  const clean = String(freqText)
    .replace(/\s+/g, "")
    .replace(/[–—|_]/g, "-");
  const m = clean.match(/(\d)-(\d)-(\d)/);
  if (!m) return 0;
  return parseInt(m[1]) + parseInt(m[2]) + parseInt(m[3]);
}

function getDurationDays(text) {
  if (!text) return 0;
  const s = String(text).toLowerCase();
  const n = parseInt(s.match(/\d+/)?.[0] || "0", 10);
  if (!n) return 0;
  if (s.includes("month")) return n * 30;
  if (s.includes("week"))  return n * 7;
  if (s.includes("day"))   return n;
  return 0;
}

function cleanDurationLabel(raw) {
  const m = String(raw).match(
    /\d+\s*(?:month|months|month\(s\)|day|days|day\(s\)|week|weeks|week\(s\))/i
  );
  if (!m) return "";
  return m[0]
    .trim()
    .replace(/months?/i,  "Month(s)")
    .replace(/days?/i,    "Day(s)")
    .replace(/weeks?/i,   "Week(s)");
}

function cleanFrequency(raw) {
  const clean = String(raw)
    .replace(/\s+/g, "")
    .replace(/[–—|_]/g, "-");
  const m = clean.match(/\d-\d-\d/);
  return m ? m[0] : "";
}

function cleanDose(raw) {
  const m = String(raw).match(/(\d+)\s*(tablet|tab|capsule|cap)/i);
  if (!m) return "";
  const unit = /cap/i.test(m[2]) ? "Capsule" : "Tablet";
  return `${m[1]} ${unit}`;
}

function cleanInstruction(raw) {
  const s = String(raw).toLowerCase();
  if (s.includes("before food")) return "Before Food";
  if (s.includes("after food"))  return "After Food";
  if (s.includes("after meal"))  return "After Food";
  if (s.includes("before meal")) return "Before Food";
  if (s.includes("with food"))   return "With Food";
  return raw.trim();
}

function looksLikeMedicineLine(text) {
  return /\b(TABLET|TAB|CAPSULE|CAP|SYRUP|INJECTION|INJ|CREAM|OINTMENT|DROP|DROPS)\b/i.test(
    text
  );
}

/**
 * Quantity = dose_count × freq_per_day × duration_days
 * Returns null if any component is zero.
 */
function calculateQty(dose, frequency, durationDays) {
  const doseCount  = parseDoseCount(dose);
  const freqPerDay = parseFreqPerDay(frequency);
  if (!freqPerDay || !durationDays) return null;
  return doseCount * freqPerDay * durationDays;
}

/**
 * Build a standardised medicine row object from parsed field values.
 */
function buildMedicineRow({
  medicineName,
  dose,
  frequency,
  instruction,
  durationLabel,
  durationDays,
  qtyFromTable,
}) {
  const calculatedQty  = calculateQty(dose, frequency, durationDays);
  const prescriptionQty = qtyFromTable || calculatedQty;

  return {
    medicineName,
    name: medicineName,
    dose,
    frequency,
    freqLabel:     frequency,
    instruction,
    durationLabel,
    durationDays,
    duration:      durationDays,
    prescriptionQty,
    calculatedQty,
    quantity:      prescriptionQty,
    orderQty:      prescriptionQty,
    requiredQty:   prescriptionQty,
  };
}

// ─── Table-based extraction (primary) ─────────────────────────────────────────

function extractFromTables(document) {
  const docText = document.text || "";
  const medicines = [];
  const seen = new Set();

  for (const page of document.pages || []) {
    for (const table of page.tables || []) {
      // Build column map from header rows (if present)
      const headerTexts = (table.headerRows || []).flatMap((row) =>
        (row.cells || []).map((cell) => getCellText(docText, cell))
      );
      const cols = identifyColumns(headerTexts);

      for (const bodyRow of table.bodyRows || []) {
        const cells   = bodyRow.cells || [];
        const cellAt  = (idx) =>
          idx >= 0 && idx < cells.length
            ? getCellText(docText, cells[idx])
            : "";

        const rawName = cellAt(cols.name);
        if (!rawName || !looksLikeMedicineLine(rawName)) continue;

        // Remove leading row number (1. / 2. / etc.)
        const medicineName = rawName.replace(/^\d+[\.\)]\s*/, "").trim();
        if (medicineName.length < 3) continue;

        // Dedup across tables on the same page
        const key = medicineName.toUpperCase().replace(/\s+/g, "");
        if (seen.has(key)) continue;
        seen.add(key);

        const doseRaw  = cellAt(cols.dose);
        const freqRaw  = cellAt(cols.frequency);
        const instrRaw = cellAt(cols.instruction);
        const durRaw   = cellAt(cols.duration);
        const qtyRaw   = cellAt(cols.qty);

        const dose         = cleanDose(doseRaw) || doseRaw.trim() || "1 Tablet";
        const frequency    = cleanFrequency(freqRaw) || freqRaw.trim();
        const instruction  = cleanInstruction(instrRaw);
        const durationLabel = cleanDurationLabel(durRaw) || durRaw.trim();
        const durationDays  = getDurationDays(durationLabel);
        const qtyFromTable  = parseInt(qtyRaw.replace(/[^\d]/g, ""), 10) || null;

        console.log(
          `📋 [DocAI-Table] ${medicineName} | dose: ${dose} | freq: ${frequency} | dur: ${durationLabel} | qty: ${qtyFromTable}`
        );

        medicines.push(
          buildMedicineRow({ medicineName, dose, frequency, instruction, durationLabel, durationDays, qtyFromTable })
        );
      }
    }
  }

  return medicines;
}

// ─── Text-based fallback (single-line window, no cross-contamination) ─────────

function extractFromText(docText) {
  const lines = docText.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  const medicines = [];
  const seen = new Set();

  for (const line of lines) {
    if (!looksLikeMedicineLine(line)) continue;

    // Strip leading row number
    const stripped = line.replace(/^\d+[\.\)]\s*/, "");

    // Stop medicine name before any field indicator
    const stopMatch = stripped.match(
      /\s+(?:\d+\s*(?:tablet|tab|capsule|cap)|\d-\d-\d|after\s+food|before\s+food|\d+\s*(?:month|day|week)|\d{1,2}\/\d{1,2}\/\d{2,4}|[\s-]+\d{2,}[.,]\d{2,})/i
    );
    const medicineName = (stopMatch
      ? stripped.substring(0, stopMatch.index)
      : stripped
    ).trim();

    if (!medicineName || medicineName.length < 3) continue;

    const key = medicineName.toUpperCase().replace(/\s+/g, "");
    if (seen.has(key)) continue;
    seen.add(key);

    const dose          = cleanDose(line) || "1 Tablet";
    const frequency     = cleanFrequency(line);
    const instruction   = cleanInstruction(line);
    const durationLabel = cleanDurationLabel(line);
    const durationDays  = getDurationDays(durationLabel);

    // Prefer explicit "6 Month(s) 180" qty pattern on the same line
    const qtySuffix = line.match(
      /(?:\d+\s*(?:month|months|month\(s\)|day|days|day\(s\)|week|weeks|week\(s\)))\s+(\d{1,4})\b/i
    );
    const qtyFromTable = qtySuffix ? parseInt(qtySuffix[1], 10) : null;

    console.log(
      `📋 [DocAI-Text] ${medicineName} | dose: ${dose} | freq: ${frequency} | dur: ${durationLabel} | qty: ${qtyFromTable}`
    );

    medicines.push(
      buildMedicineRow({ medicineName, dose, frequency, instruction, durationLabel, durationDays, qtyFromTable })
    );
  }

  return medicines;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Process a prescription image / PDF with Google Document AI Form Parser.
 *
 * @param {Buffer} imageBuffer  Raw file buffer
 * @param {string} mimeType     MIME type e.g. "image/jpeg" or "application/pdf"
 * @returns {{ extractedText: string, medicines: Array }}
 */
async function extractPrescriptionData(imageBuffer, mimeType) {
  if (!PROJECT_ID || !PROCESSOR_ID) {
    throw new Error(
      "Document AI not configured — set DOCUMENT_AI_PROJECT_ID and DOCUMENT_AI_PROCESSOR_ID in .env"
    );
  }

  const processorName = `projects/${PROJECT_ID}/locations/${LOCATION}/processors/${PROCESSOR_ID}`;

  console.log(`🤖 Calling Document AI Form Parser: ${processorName}`);

  const [response] = await docAiClient.processDocument({
    name: processorName,
    rawDocument: {
      content: imageBuffer.toString("base64"),
      mimeType: mimeType || "image/jpeg",
    },
  });

  const document = response.document;
  if (!document) throw new Error("Document AI returned no document");

  const extractedText = document.text || "";

  // Primary: extract from detected table structure (preserves column mapping)
  let medicines  = extractFromTables(document);
  let usedMethod = "table";

  if (medicines.length < 3) {
    console.log(
      `⚠️  Document AI table found only ${medicines.length} medicine(s) — falling back to text extraction`
    );
    medicines  = extractFromText(extractedText);
    usedMethod = "text-fallback";
  }

  console.log(
    `✅ Document AI extraction complete: ${medicines.length} medicine(s) via [${usedMethod}]`
  );

  return { extractedText, medicines };
}

module.exports = { extractPrescriptionData };

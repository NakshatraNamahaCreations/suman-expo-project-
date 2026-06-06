"use strict";

/**
 * Document AI Form Parser service for prescription table extraction.
 *
 * Primary path  → reads detected table cells (exact column mapping, zero cross-contamination)
 * Fallback path → medicine-to-medicine text blocks (no fixed-width window)
 *
 * Key rules:
 *  • Medicine name is the FULL text from the Brand/Strength column — never truncated to "TABLET".
 *  • Frequency / Duration / Qty come from that medicine's own table row only.
 *  • qty = Qty column value   OR   doseCount × freqPerDay × durationDays
 */

const { DocumentProcessorServiceClient } = require("@google-cloud/documentai").v1;

const PROJECT_ID   = process.env.DOCUMENT_AI_PROJECT_ID;
const LOCATION     = process.env.DOCUMENT_AI_LOCATION || "us";
const PROCESSOR_ID = process.env.DOCUMENT_AI_PROCESSOR_ID;

const docAiClient = new DocumentProcessorServiceClient({
  apiEndpoint: `${LOCATION}-documentai.googleapis.com`,
});

// ─── Cell text helper ─────────────────────────────────────────────────────────

function getCellText(docText, cell) {
  if (!cell?.layout?.textAnchor?.textSegments?.length) return "";
  return cell.layout.textAnchor.textSegments
    .map((seg) =>
      docText.substring(Number(seg.startIndex) || 0, Number(seg.endIndex) || 0)
    )
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

// ─── Column identifier ────────────────────────────────────────────────────────

/**
 * Map column header text → column index.
 * Falls back to positional defaults when no header is found.
 */
function identifyColumns(headerTexts) {
  // Positional defaults that match the Dr Haroon Rashid prescription layout:
  //   col 0 = (row#) Brand & Strength   col 1 = Dose   col 2 = Frequency
  //   col 3 = Instruction               col 4 = Duration   col 5 = Qty
  const cols = { name: 0, dose: 1, frequency: 2, instruction: 3, duration: 4, qty: 5 };

  headerTexts.forEach((text, i) => {
    const t = text.toLowerCase().trim();
    if (/brand|strength|medicine|name/i.test(t))  cols.name        = i;
    else if (/^dose/i.test(t))                     cols.dose        = i;
    else if (/freq/i.test(t))                      cols.frequency   = i;
    else if (/instruct/i.test(t))                  cols.instruction = i;
    else if (/duration/i.test(t))                  cols.duration    = i;
    else if (/qty|quantity/i.test(t))              cols.qty         = i;
  });

  return cols;
}

// ─── Field parsers ────────────────────────────────────────────────────────────

function parseDoseCount(raw) {
  const n = parseInt(String(raw).match(/\d+/)?.[0] || "1", 10);
  return n > 0 ? n : 1;
}

function parseFreqPerDay(raw) {
  // Accept "1-0-1", "1 - 0 - 1", "1–0–1" etc.
  const clean = String(raw)
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
    .replace(/months?(\(s\))?/i, "Month(s)")
    .replace(/days?(\(s\))?/i,   "Day(s)")
    .replace(/weeks?(\(s\))?/i,  "Week(s)");
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

function calculateQty(dose, frequency, durationDays) {
  const doseCount  = parseDoseCount(dose);
  const freqPerDay = parseFreqPerDay(frequency);
  if (!freqPerDay || !durationDays) return null;
  return doseCount * freqPerDay * durationDays;
}

function buildMedicineRow({ medicineName, dose, frequency, instruction, durationLabel, durationDays, qtyFromTable }) {
  const calculatedQty   = calculateQty(dose, frequency, durationDays);
  const prescriptionQty = qtyFromTable || calculatedQty;

  return {
    medicineName,
    name:          medicineName,
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

// ─── Header / non-medicine cell detector ─────────────────────────────────────

const HEADER_PATTERN = /^(brand|strength|dose|frequency|freq|instruction|duration|qty|quantity|rx|#|no\.?|s\.?no\.?)$/i;

function isHeaderCell(text) {
  return HEADER_PATTERN.test(text.trim());
}

// ─── Medicine line detector (for text fallback) ───────────────────────────────

function looksLikeMedicineLine(text) {
  // Explicit type keyword (most prescriptions)
  if (/\b(TABLET|TAB|CAPSULE|CAP|SYRUP|INJECTION|INJ|CREAM|OINTMENT|DROP|DROPS)\b/i.test(text)) return true;
  // Numbered list entry that also has a frequency pattern — catches any medicine format
  if (/^\d+[\.\)]\s+[A-Z]{2}/.test(text.trim()) && /\d\s*-\s*\d\s*-\s*\d/.test(text)) return true;
  return false;
}

// ─── Table-based extraction (primary) ─────────────────────────────────────────

function extractFromTables(document) {
  const docText = document.text || "";
  const medicines = [];
  const seen = new Set();

  for (const page of document.pages || []) {
    for (const table of page.tables || []) {
      const headerTexts = (table.headerRows || []).flatMap((row) =>
        (row.cells || []).map((cell) => getCellText(docText, cell))
      );
      const cols = identifyColumns(headerTexts);

      for (const bodyRow of table.bodyRows || []) {
        const cells  = bodyRow.cells || [];
        const cellAt = (idx) =>
          idx >= 0 && idx < cells.length ? getCellText(docText, cells[idx]) : "";

        // Get the medicine name cell.
        // If col 0 is just a row number (e.g. "1."), the real name is in col 1.
        let rawName = cellAt(cols.name);
        if (/^\d+\.?\s*$/.test(rawName.trim())) {
          rawName = cellAt(cols.name + 1) || rawName;
        }

        if (!rawName || rawName.length < 2) continue;

        // Skip cells that look like column headers (in case Document AI includes
        // the header row inside bodyRows)
        if (isHeaderCell(rawName)) continue;

        // Full medicine name — strip leading row number only
        const medicineName = rawName.replace(/^\d+[\.\)]\s*/, "").trim();
        if (medicineName.length < 2) continue;

        const key = medicineName.toUpperCase().replace(/\s+/g, "");
        if (seen.has(key)) continue;
        seen.add(key);

        const doseRaw       = cellAt(cols.dose);
        const freqRaw       = cellAt(cols.frequency);
        const instrRaw      = cellAt(cols.instruction);
        const durRaw        = cellAt(cols.duration);
        const qtyRaw        = cellAt(cols.qty);

        const dose          = cleanDose(doseRaw) || doseRaw.trim() || "1 Tablet";
        const frequency     = cleanFrequency(freqRaw) || freqRaw.replace(/\s+/g, "").trim();
        const instruction   = cleanInstruction(instrRaw);
        const durationLabel = cleanDurationLabel(durRaw) || durRaw.trim();
        const durationDays  = getDurationDays(durationLabel);
        const qtyFromTable  = parseInt(qtyRaw.replace(/[^\d]/g, ""), 10) || null;

        console.log(
          `📋 [Table] "${medicineName}" | dose:${dose} | freq:${frequency} | dur:${durationLabel}(${durationDays}d) | qty:${qtyFromTable}`
        );

        medicines.push(buildMedicineRow({
          medicineName, dose, frequency, instruction, durationLabel, durationDays, qtyFromTable,
        }));
      }
    }
  }

  return medicines;
}

// ─── Text-based fallback (medicine-to-medicine blocks) ────────────────────────

/**
 * For each medicine line, collect ALL lines up to the NEXT medicine line.
 * This means each medicine's block contains only its own data regardless of
 * how many OCR lines span one prescription row.
 */
function extractFromText(docText) {
  const lines = docText.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  const medicines = [];
  const seen = new Set();

  // Step 1: find index of every medicine line
  const medLineIndices = lines.reduce((acc, line, i) => {
    if (looksLikeMedicineLine(line)) acc.push(i);
    return acc;
  }, []);

  // Step 2: for each medicine, its data block = from its line to the line before the next medicine
  for (let j = 0; j < medLineIndices.length; j++) {
    const startIdx = medLineIndices[j];
    const endIdx   = j + 1 < medLineIndices.length
      ? medLineIndices[j + 1]       // stop at next medicine
      : Math.min(startIdx + 6, lines.length); // or max 6 lines for the last one

    const currentLine = lines[startIdx];
    // Build block from this medicine's lines ONLY
    const block = lines.slice(startIdx, endIdx).join(" ");

    // Extract medicine name from the first line, stopping before any column data
    const stripped  = currentLine.replace(/^\d+[\.\)]\s*/, "");
    const stopMatch = stripped.match(
      /\s+(?:\d+\s*(?:tablet|tab|capsule|cap)|\d\s*-\s*\d\s*-\s*\d|after\s+food|before\s+food|\d+\s*(?:month|day|week)|\d{1,2}\/\d{1,2}\/\d{2,4}|[\s-]+\d{2,}[.,]\d{2,})/i
    );
    const medicineName = (stopMatch
      ? stripped.substring(0, stopMatch.index)
      : stripped
    ).trim();

    if (!medicineName || medicineName.length < 2) continue;
    const key = medicineName.toUpperCase().replace(/\s+/g, "");
    if (seen.has(key)) continue;
    seen.add(key);

    const dose          = cleanDose(block) || "1 Tablet";
    const frequency     = cleanFrequency(block);
    const instruction   = cleanInstruction(block);
    const durationLabel = cleanDurationLabel(block);
    const durationDays  = getDurationDays(durationLabel);

    // Prefer "6 Month(s) 180" pattern (Qty immediately after duration on same line)
    const qtySuffix = block.match(
      /(?:\d+\s*(?:month|months|month\(s\)|day|days|day\(s\)|week|weeks|week\(s\)))\s+(\d{1,4})\b/i
    );
    const qtyFromTable = qtySuffix ? parseInt(qtySuffix[1], 10) : null;

    console.log(
      `📋 [Text] "${medicineName}" | dose:${dose} | freq:${frequency} | dur:${durationLabel}(${durationDays}d) | qty:${qtyFromTable}`
    );

    medicines.push(buildMedicineRow({
      medicineName, dose, frequency, instruction, durationLabel, durationDays, qtyFromTable,
    }));
  }

  return medicines;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * @param {Buffer} imageBuffer
 * @param {string} mimeType  e.g. "image/jpeg" | "application/pdf"
 * @returns {{ extractedText: string, medicines: Array }}
 */
async function extractPrescriptionData(imageBuffer, mimeType) {
  if (!PROJECT_ID || !PROCESSOR_ID) {
    throw new Error(
      "Document AI not configured — set DOCUMENT_AI_PROJECT_ID and DOCUMENT_AI_PROCESSOR_ID in .env"
    );
  }

  const processorName = `projects/${PROJECT_ID}/locations/${LOCATION}/processors/${PROCESSOR_ID}`;
  console.log(`🤖 Document AI processor: ${processorName}`);

  const [response] = await docAiClient.processDocument({
    name: processorName,
    rawDocument: {
      content:  imageBuffer.toString("base64"),
      mimeType: mimeType || "image/jpeg",
    },
  });

  const document = response.document;
  if (!document) throw new Error("Document AI returned no document");

  const extractedText = document.text || "";

  // Count detected tables for diagnostics
  const tableCount = (document.pages || []).reduce(
    (n, p) => n + (p.tables || []).length, 0
  );
  console.log(`📊 Document AI detected ${tableCount} table(s)`);

  // Primary: table-structured extraction
  let medicines  = extractFromTables(document);
  let usedMethod = "table";

  if (medicines.length < 3) {
    console.log(
      `⚠️  Table extraction found ${medicines.length} medicine(s) — using text fallback`
    );
    medicines  = extractFromText(extractedText);
    usedMethod = "text-fallback";
  }

  console.log(
    `✅ Extraction complete: ${medicines.length} medicine(s) via [${usedMethod}]`
  );

  return { extractedText, medicines };
}

module.exports = { extractPrescriptionData };

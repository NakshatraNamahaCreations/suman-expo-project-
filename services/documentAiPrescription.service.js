"use strict";

/**
 * Document AI Form Parser service for prescription table extraction.
 *
 * Primary path  → table cell extraction (exact per-row column mapping)
 * Fallback path → medicine-to-medicine text blocks
 *
 * Key field rules:
 *  • Medicine name  = full text from Brand/Strength column (includes "TABLET" prefix)
 *  • freq / duration / qty = from that medicine's OWN row/block only
 *  • prescriptionQty = Qty column OR doseCount × freqPerDay × durationDays
 */

const { DocumentProcessorServiceClient } = require("@google-cloud/documentai").v1;

const PROJECT_ID   = process.env.DOCUMENT_AI_PROJECT_ID;
const LOCATION     = process.env.DOCUMENT_AI_LOCATION || "us";
const PROCESSOR_ID = process.env.DOCUMENT_AI_PROCESSOR_ID;

const docAiClient = new DocumentProcessorServiceClient({
  apiEndpoint: `${LOCATION}-documentai.googleapis.com`,
});

// ─── Cell text ────────────────────────────────────────────────────────────────

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

// ─── Column identification ────────────────────────────────────────────────────

function identifyColumns(headerTexts) {
  // Positional defaults for the Dr Haroon Rashid prescription layout:
  //   col 0 = Brand & Strength (with optional row number)
  //   col 1 = Dose   col 2 = Frequency   col 3 = Instruction
  //   col 4 = Duration   col 5 = Qty
  const cols = { name: 0, dose: 1, frequency: 2, instruction: 3, duration: 4, qty: 5 };
  headerTexts.forEach((text, i) => {
    const t = text.toLowerCase().trim();
    if (/brand|strength|medicine|drug/i.test(t))  cols.name        = i;
    else if (/^dose|strength.*dose/i.test(t))      cols.dose        = i;
    else if (/freq/i.test(t))                      cols.frequency   = i;
    else if (/instruct|timing/i.test(t))           cols.instruction = i;
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
  const clean = String(raw).replace(/\s+/g, "").replace(/[–—|_]/g, "-");
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
  const clean = String(raw).replace(/\s+/g, "").replace(/[–—|_]/g, "-");
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
  if (s.includes("empty stomach")) return "Empty Stomach";
  return "";
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

// ─── Helpers ──────────────────────────────────────────────────────────────────

// Text that signals a column header cell, NOT a medicine
const HEADER_CELL_RE =
  /^(brand|strength|dose|frequency|freq|instruction|timing|duration|qty|quantity|rx|#|no\.?|s\.?no\.?|sl\.?\s*no\.?)$/i;

function isHeaderCell(text) {
  return HEADER_CELL_RE.test(text.trim());
}

// Investigation / lab-report keywords that should STOP name extraction
const INVESTIGATION_RE =
  /\b(hemoglobin|leukocytes|platelet|creatinine|uric.acid|cholesterol|glucose|hba1c|hs.?crp|ecg|echo|ppbs|hbaic|fbs|tlc|dlc)\b/i;

function looksLikeMedicineLine(text) {
  if (INVESTIGATION_RE.test(text)) return false;
  if (/\b(TABLET|TAB|CAPSULE|CAP|SYRUP|SYP|INJECTION|INJ|CREAM|OINTMENT|DROP|DROPS)\b/i.test(text)) return true;
  // Numbered list entry + frequency pattern (catches any medicine without explicit type)
  if (/^\d+[\.\)]\s+[A-Z]{2}/.test(text.trim()) && /\d\s*-\s*\d\s*-\s*\d/.test(text)) return true;
  return false;
}

// ─── Table-based extraction (primary) ────────────────────────────────────────

function processRow(docText, cells, cols) {
  const cellAt = (idx) =>
    idx >= 0 && idx < cells.length ? getCellText(docText, cells[idx]) : "";

  const rawName = cellAt(cols.name);
  if (!rawName || rawName.length < 2) return null;
  if (isHeaderCell(rawName)) return null;

  // Strip leading row number (e.g. "1. " or "1) ")
  const medicineName = rawName.replace(/^\d+[\.\)]\s*/, "").trim();
  if (medicineName.length < 2) return null;

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
    `📋 [Table] "${medicineName}" | dose:${dose} | freq:${frequency} | ` +
    `dur:${durationLabel}(${durationDays}d) | qty:${qtyFromTable}`
  );

  return buildMedicineRow({ medicineName, dose, frequency, instruction, durationLabel, durationDays, qtyFromTable });
}

function extractFromTables(document) {
  const docText  = document.text || "";
  const medicines = [];
  const seen     = new Set();

  for (const page of document.pages || []) {
    for (const table of page.tables || []) {
      // ── Step 1: identify columns from header rows ─────────────────────────
      const headerTexts = (table.headerRows || []).flatMap((row) =>
        (row.cells || []).map((cell) => getCellText(docText, cell))
      );
      let cols = identifyColumns(headerTexts);

      // ── Step 2: detect row-number column (offset ALL indices if col 0 = "1.", "2."…)
      // Check the first available body row (or header row if no body rows).
      const firstBodyRow = (table.bodyRows || [])[0];
      if (firstBodyRow && cols.name === 0) {
        const col0 = getCellText(docText, firstBodyRow.cells?.[0]);
        if (/^\d+\.?\s*$/.test(col0.trim())) {
          // col 0 is just a row number → shift every index right by 1
          cols = {
            name:        cols.name        + 1,
            dose:        cols.dose        + 1,
            frequency:   cols.frequency   + 1,
            instruction: cols.instruction + 1,
            duration:    cols.duration    + 1,
            qty:         cols.qty         + 1,
          };
          console.log(`🔢 Detected row-number column — shifted all col indices by +1`);
        }
      }

      // ── Step 3: process ALL rows (header + body)
      //    Document AI sometimes puts the first data row into headerRows.
      //    We process both; isHeaderCell() will skip genuine header cells.
      const allRows = [
        ...(table.headerRows || []).flatMap((r) => [r.cells || []]),
        ...(table.bodyRows   || []).flatMap((r) => [r.cells || []]),
      ];

      for (const cells of allRows) {
        const med = processRow(docText, cells, cols);
        if (!med) continue;

        const key = med.medicineName.toUpperCase().replace(/\s+/g, "");
        if (seen.has(key)) continue;
        seen.add(key);
        medicines.push(med);
      }
    }
  }

  return medicines;
}

// ─── Text-based fallback (medicine-to-medicine blocks) ───────────────────────

// Stop extraction of medicine name at these patterns
const NAME_STOP_RE =
  /\s+(?:\d+\s*(?:tablet|tab|capsule|cap)|\d\s*-\s*\d\s*-\s*\d|after\s+food|before\s+food|empty\s+stomach|\d+\s*(?:month|day|week)|\d{1,2}\/\d{1,2}\/\d{2,4}|[-\s]+\d{2,}[.,]\d{2,})/i;

// Lines that are investigation results / lab values — stop the block here
const INVESTIGATION_LINE_RE =
  /\b(hemoglobin|leukocytes|platelet|creatinine|uric.acid|investigation|result|hba1c|hs.?crp|ecg|echo)\b/i;

function extractFromText(docText) {
  const rawLines = docText.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  const medicines = [];
  const seen = new Set();

  // Find indices of every medicine line
  const medIndices = rawLines.reduce((acc, line, i) => {
    if (looksLikeMedicineLine(line)) acc.push(i);
    return acc;
  }, []);

  if (medIndices.length === 0) return medicines;

  for (let j = 0; j < medIndices.length; j++) {
    const startIdx = medIndices[j];

    // Block ends at the next medicine line OR at an investigation/lab line
    let endIdx = j + 1 < medIndices.length
      ? medIndices[j + 1]
      : Math.min(startIdx + 8, rawLines.length);

    // Clip block if we hit investigation text
    for (let k = startIdx + 1; k < endIdx; k++) {
      if (INVESTIGATION_LINE_RE.test(rawLines[k])) {
        endIdx = k;
        break;
      }
    }

    const currentLine = rawLines[startIdx];
    const block = rawLines.slice(startIdx, endIdx).join(" ");

    // Extract medicine name from the first line only
    const stripped  = currentLine.replace(/^\d+[\.\)]\s*/, "");
    const stopMatch = stripped.match(NAME_STOP_RE);
    const medicineName = (stopMatch
      ? stripped.substring(0, stopMatch.index)
      : stripped
    ).trim();

    if (!medicineName || medicineName.length < 2) continue;
    if (INVESTIGATION_RE.test(medicineName)) continue;

    const key = medicineName.toUpperCase().replace(/\s+/g, "");
    if (seen.has(key)) continue;
    seen.add(key);

    const dose          = cleanDose(block) || "1 Tablet";
    const frequency     = cleanFrequency(block);
    const instruction   = cleanInstruction(block);
    const durationLabel = cleanDurationLabel(block);
    const durationDays  = getDurationDays(durationLabel);

    // Qty: a standalone number (2-4 digits) that comes right after a duration
    const qtySuffix = block.match(
      /(?:\d+\s*(?:month|months|month\(s\)|day|days|day\(s\)|week|weeks|week\(s\)))\s+(\d{1,4})\b/i
    );
    const qtyFromTable = qtySuffix ? parseInt(qtySuffix[1], 10) : null;

    console.log(
      `📋 [Text] "${medicineName}" | dose:${dose} | freq:${frequency} | ` +
      `dur:${durationLabel}(${durationDays}d) | qty:${qtyFromTable}`
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
 * @param {string} mimeType  "image/jpeg" | "image/png" | "application/pdf"
 * @returns {{ extractedText: string, medicines: Array }}
 */
async function extractPrescriptionData(imageBuffer, mimeType) {
  if (!PROJECT_ID || !PROCESSOR_ID) {
    throw new Error(
      "Document AI not configured — set DOCUMENT_AI_PROJECT_ID and DOCUMENT_AI_PROCESSOR_ID in .env"
    );
  }

  const processorName = `projects/${PROJECT_ID}/locations/${LOCATION}/processors/${PROCESSOR_ID}`;
  console.log(`🤖 Document AI: ${processorName}`);

  const [response] = await docAiClient.processDocument({
    name: processorName,
    rawDocument: {
      content:  imageBuffer.toString("base64"),
      mimeType: mimeType || "image/jpeg",
    },
  });

  const doc = response.document;
  if (!doc) throw new Error("Document AI returned no document");

  const extractedText = doc.text || "";

  const tableCount = (doc.pages || []).reduce((n, p) => n + (p.tables || []).length, 0);
  const headerRowCount = (doc.pages || []).reduce(
    (n, p) => n + (p.tables || []).reduce((m, t) => m + (t.headerRows || []).length, 0), 0
  );
  const bodyRowCount = (doc.pages || []).reduce(
    (n, p) => n + (p.tables || []).reduce((m, t) => m + (t.bodyRows || []).length, 0), 0
  );
  console.log(
    `📊 Document AI: ${tableCount} table(s), ${headerRowCount} header row(s), ${bodyRowCount} body row(s)`
  );
  console.log(`📄 Raw text (first 600 chars):\n${extractedText.substring(0, 600)}`);

  // Primary: table extraction
  let medicines  = extractFromTables(doc);
  let usedMethod = "table";

  if (medicines.length < 3) {
    console.log(`⚠️  Table extraction yielded ${medicines.length} → using text fallback`);
    medicines  = extractFromText(extractedText);
    usedMethod = "text-fallback";
  }

  console.log(`✅ Extraction done: ${medicines.length} medicine(s) via [${usedMethod}]`);
  return { extractedText, medicines };
}

module.exports = { extractPrescriptionData };

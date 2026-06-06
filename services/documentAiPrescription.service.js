"use strict";

/**
 * Google Document AI Form Parser — prescription medicine extractor.
 *
 * PRIMARY:  table cell extraction  (row-locked, zero cross-contamination)
 * FALLBACK: medicine-to-medicine text blocks
 *
 * Fixed issues vs. previous version:
 *  1. apiEndpoint now passed so requests reach us-documentai.googleapis.com
 *  2. buildMedicineRow no longer returns null for missing freq/duration —
 *     rows with partial data are kept (empty string / 0 for missing fields)
 *  3. Table is no longer skipped when header columns are not detected;
 *     positional defaults (col 0 = medicine, 1 = dose, …) are used instead
 *  4. Row-number column (col 0 = "1.", "2."…) shifts ALL column indices by +1
 */

const { DocumentProcessorServiceClient } = require("@google-cloud/documentai").v1;

const LOCATION     = process.env.DOCUMENT_AI_LOCATION || "us";
const PROJECT_ID   = process.env.DOCUMENT_AI_PROJECT_ID;
const PROCESSOR_ID = process.env.DOCUMENT_AI_PROCESSOR_ID;

// Must specify the regional endpoint — without it the client contacts the
// global endpoint which cannot serve US-region processors.
const client = new DocumentProcessorServiceClient({
  apiEndpoint: `${LOCATION}-documentai.googleapis.com`,
});

// ─── Text extraction from a cell layout ──────────────────────────────────────

function getTextFromLayout(document, layout) {
  if (!layout?.textAnchor?.textSegments?.length) return "";
  const full = document.text || "";
  return layout.textAnchor.textSegments
    .map((seg) => full.substring(Number(seg.startIndex) || 0, Number(seg.endIndex) || 0))
    .join("")
    .replace(/\n/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// ─── Column-header matching ───────────────────────────────────────────────────

function normalizeHeader(v = "") {
  return String(v).toLowerCase().replace(/[^a-z0-9]/g, "");
}

function findHeaderIndex(headers, names) {
  const norm = headers.map(normalizeHeader);
  for (const name of names) {
    const n = normalizeHeader(name);
    const i = norm.findIndex((h) => h === n || h.includes(n));
    if (i >= 0) return i;
  }
  return -1;
}

// ─── Field cleaners ───────────────────────────────────────────────────────────

function cleanMedicineName(v = "") {
  return String(v)
    .replace(/^\d+[\.\)]?\s*/, "")   // strip leading row-number
    .replace(/\bRx\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanDose(v = "") {
  const m = String(v).match(/(\d+)\s*(tablet|tab|capsule|cap|ml|drop|drops|spoon|unit)/i);
  if (!m) return String(v).trim() || "1 Tablet";
  const qty  = m[1];
  const lower = m[0].toLowerCase();
  let unit = "Tablet";
  if (lower.includes("cap"))    unit = "Capsule";
  else if (lower.includes("ml"))    unit = "ml";
  else if (lower.includes("drop"))  unit = "Drops";
  else if (lower.includes("spoon")) unit = "Spoon";
  else if (lower.includes("unit"))  unit = "Unit";
  return `${qty} ${unit}`;
}

function cleanFrequency(v = "") {
  const text = String(v)
    .replace(/\s+/g, "")
    .replace(/[–—]/g, "-")
    .replace(/[|_]/g, "-")
    .replace(/[Oo]/g, "0");
  const m = text.match(/\d-\d-\d/);
  return m ? m[0] : "";
}

function cleanInstruction(v = "") {
  const s = String(v).toLowerCase();
  if (s.includes("after food"))    return "After Food";
  if (s.includes("before food"))   return "Before Food";
  if (s.includes("after meal"))    return "After Food";
  if (s.includes("before meal"))   return "Before Food";
  if (s.includes("with food"))     return "With Food";
  if (s.includes("empty stomach")) return "Empty Stomach";
  return String(v).replace(/\s+/g, " ").trim();
}

function cleanDurationLabel(v = "") {
  const m = String(v).match(
    /\d+\s*(month|months|month\(s\)|day|days|day\(s\)|week|weeks|week\(s\))/i
  );
  if (!m) return "";
  return m[0]
    .trim()
    .replace(/months?(\(s\))?/i, "Month(s)")
    .replace(/days?(\(s\))?/i,   "Day(s)")
    .replace(/weeks?(\(s\))?/i,  "Week(s)");
}

function getDurationDays(text = "") {
  const s = String(text).toLowerCase();
  const n = Number(s.match(/\d+/)?.[0] || 0);
  if (!n) return 0;
  if (s.includes("month")) return n * 30;
  if (s.includes("week"))  return n * 7;
  if (s.includes("day"))   return n;
  return 0;
}

function parseDoseCount(v = "") {
  return Number(String(v).match(/\d+/)?.[0] || 1) || 1;
}

function parseFreqPerDay(v = "") {
  const parts = String(v).split("-").map((n) => Number(n) || 0);
  return parts.length === 3 ? parts.reduce((s, n) => s + n, 0) : 0;
}

function calculateQty(dose, frequency, durationDays) {
  const d = parseDoseCount(dose);
  const f = parseFreqPerDay(frequency);
  if (!durationDays || !f) return 0;
  return d * f * durationDays;
}

// ─── Row builder ──────────────────────────────────────────────────────────────

function buildMedicineRow({ medicineName, dose, frequency, instruction, durationLabel, qtyFromTable }) {
  const name   = cleanMedicineName(medicineName || "");
  if (!name) return null;                          // skip truly empty rows only

  const doseVal  = cleanDose(dose || "");
  const freqVal  = cleanFrequency(frequency || "");
  const instrVal = cleanInstruction(instruction || "");
  const durLabel = cleanDurationLabel(durationLabel || "");
  const durDays  = getDurationDays(durLabel);

  const calcQty  = calculateQty(doseVal, freqVal, durDays);
  const finalQty = Number(qtyFromTable || 0) || calcQty || 0;

  console.log(
    `📋 "${name}" | dose:${doseVal} | freq:${freqVal} | dur:${durLabel}(${durDays}d) | qty:${finalQty}`
  );

  return {
    medicineName: name,
    name,
    dose:          doseVal,
    frequency:     freqVal,
    freqLabel:     freqVal,
    instruction:   instrVal,
    durationLabel: durLabel,
    durationDays:  durDays,
    duration:      durDays,
    prescriptionQty: finalQty || null,
    calculatedQty:   calcQty  || null,
    quantity:        finalQty || null,
    orderQty:        finalQty || null,
    requiredQty:     finalQty || null,
  };
}

// ─── Table extraction (primary) ───────────────────────────────────────────────

function parseTablesFromDocument(document) {
  const medicines = [];
  const seen      = new Set();

  for (const page of document.pages || []) {
    for (const table of page.tables || []) {

      // Collect header text
      const headerTexts = (table.headerRows || []).flatMap((row) =>
        (row.cells || []).map((cell) => getTextFromLayout(document, cell.layout))
      );

      // Try to find named columns; fall back to positional defaults.
      // Defaults match the Dr Haroon Rashid prescription column order:
      //   col 0 = Brand & Strength, 1 = Dose, 2 = Frequency,
      //   col 3 = Instruction, 4 = Duration, 5 = Qty
      let nameIdx  = findHeaderIndex(headerTexts, ["brandstrength","brand","medicine","drug","name"]);
      let doseIdx  = findHeaderIndex(headerTexts, ["dose"]);
      let freqIdx  = findHeaderIndex(headerTexts, ["frequency","freq"]);
      let instrIdx = findHeaderIndex(headerTexts, ["instruction","food","timing"]);
      let durIdx   = findHeaderIndex(headerTexts, ["duration"]);
      let qtyIdx   = findHeaderIndex(headerTexts, ["qty","quantity"]);

      // ── Detect row-number column BEFORE applying defaults ──────────────────
      // If col 0 of the first body row is just "1.", "2.", … shift all indices.
      const firstBodyRow = (table.bodyRows || [])[0];
      let offset = 0;
      if (firstBodyRow) {
        const col0 = getTextFromLayout(document, firstBodyRow.cells?.[0]?.layout);
        if (/^\d+\.?\s*$/.test(col0.trim())) {
          offset = 1;
          console.log(`🔢 Row-number column detected — shifting all indices by +1`);
        }
      }

      // Apply positional defaults (only for columns that weren't found in headers)
      if (nameIdx  < 0) nameIdx  = 0 + offset;
      if (doseIdx  < 0) doseIdx  = 1 + offset;
      if (freqIdx  < 0) freqIdx  = 2 + offset;
      if (instrIdx < 0) instrIdx = 3 + offset;
      if (durIdx   < 0) durIdx   = 4 + offset;
      if (qtyIdx   < 0) qtyIdx   = 5 + offset;

      // ── Process ALL rows (headerRows + bodyRows) ───────────────────────────
      // Document AI sometimes misclassifies the first data row as a header row,
      // which would cause it to be missed. Process both, let isHeaderCell()
      // skip genuine column-header text.
      const allCellArrays = [
        ...(table.headerRows || []).map((r) => r.cells || []),
        ...(table.bodyRows   || []).map((r) => r.cells || []),
      ];

      for (const cells of allCellArrays) {
        const get = (idx) =>
          idx >= 0 && idx < cells.length
            ? getTextFromLayout(document, cells[idx]?.layout)
            : "";

        const rawName = get(nameIdx);
        if (!rawName || rawName.length < 2) continue;

        // Skip actual column-header text (e.g. "Brand & Strength", "Dose", …)
        if (/^(brand|strength|dose|frequency|freq|instruction|duration|qty|quantity|rx|#|no\.?|s\.?no\.?)$/i.test(rawName.trim())) {
          continue;
        }

        const medicineName = rawName.replace(/^\d+[\.\)]\s*/, "").trim();
        if (medicineName.length < 2) continue;

        const key = medicineName.toUpperCase().replace(/\s+/g, "");
        if (seen.has(key)) continue;
        seen.add(key);

        const med = buildMedicineRow({
          medicineName,
          dose:          get(doseIdx),
          frequency:     get(freqIdx),
          instruction:   get(instrIdx),
          durationLabel: get(durIdx),
          qtyFromTable:  Number(get(qtyIdx).replace(/[^\d]/g, "") || 0) || 0,
        });

        if (med) medicines.push(med);
      }
    }
  }

  return medicines;
}

// ─── Text fallback ────────────────────────────────────────────────────────────

// Stop medicine name here (dose / frequency / food timing)
const NAME_STOP_RE =
  /\s+(?:\d+\s*(?:tablet|tab|capsule|cap)|\d\s*-\s*\d\s*-\s*\d|after\s+food|before\s+food|\d+\s*(?:month|day|week)|\d{1,2}\/\d{1,2}\/\d{2,4})/i;

// Investigation / lab lines — stop block here
const LAB_LINE_RE =
  /\b(hemoglobin|leukocyte|platelet|creatinine|uric.acid|investigation|hba1c|hs.?crp|ecg|echo|ppbs|fbs)\b/i;

function looksLikeMedicineLine(text) {
  if (LAB_LINE_RE.test(text)) return false;
  if (/\b(TABLET|TAB|CAPSULE|CAP|SYRUP|SYP|INJECTION|INJ|CREAM|OINTMENT|DROP|DROPS)\b/i.test(text)) return true;
  if (/^\d+[\.\)]\s+[A-Z]{2}/.test(text.trim()) && /\d\s*-\s*\d\s*-\s*\d/.test(text)) return true;
  return false;
}

function parsePrescriptionRowsFromText(fullText = "") {
  const lines = String(fullText)
    .split(/\n+/)
    .map((l) => l.trim())
    .filter(Boolean);

  const medicines = [];
  const seen = new Set();

  // Find indices of all medicine lines
  const medIndices = lines.reduce((acc, line, i) => {
    if (looksLikeMedicineLine(line)) acc.push(i);
    return acc;
  }, []);

  for (let j = 0; j < medIndices.length; j++) {
    const start = medIndices[j];

    // Block ends at next medicine line OR lab text OR max 8 lines
    let end = j + 1 < medIndices.length
      ? medIndices[j + 1]
      : Math.min(start + 8, lines.length);

    for (let k = start + 1; k < end; k++) {
      if (LAB_LINE_RE.test(lines[k])) { end = k; break; }
    }

    const firstLine = lines[start];
    const block = lines.slice(start, end).join(" ");

    // Medicine name from the first line only
    const stripped  = firstLine.replace(/^\d+[\.\)]\s*/, "");
    const stopMatch = stripped.match(NAME_STOP_RE);
    const medName   = (stopMatch ? stripped.substring(0, stopMatch.index) : stripped).trim();

    if (!medName || medName.length < 2) continue;
    if (LAB_LINE_RE.test(medName)) continue;

    const key = medName.toUpperCase().replace(/\s+/g, "");
    if (seen.has(key)) continue;
    seen.add(key);

    // Qty: a number that appears right after a duration token
    const qtyAfterDur = block.match(
      /(?:\d+\s*(?:month|months|month\(s\)|day|days|day\(s\)|week|weeks|week\(s\)))\s+(\d{1,4})\b/i
    );

    const med = buildMedicineRow({
      medicineName:  medName,
      dose:          block,
      frequency:     block,
      instruction:   block,
      durationLabel: block,
      qtyFromTable:  qtyAfterDur ? Number(qtyAfterDur[1]) : 0,
    });

    if (med) medicines.push(med);
  }

  return medicines;
}

// ─── Public API ───────────────────────────────────────────────────────────────

async function extractPrescriptionData(imageBuffer, mimeType) {
  if (!PROJECT_ID || !PROCESSOR_ID) {
    throw new Error(
      "Missing Document AI config: set DOCUMENT_AI_PROJECT_ID and DOCUMENT_AI_PROCESSOR_ID in .env"
    );
  }

  const processorName = `projects/${PROJECT_ID}/locations/${LOCATION}/processors/${PROCESSOR_ID}`;
  console.log(`🤖 Document AI: ${processorName}`);

  const [result] = await client.processDocument({
    name: processorName,
    rawDocument: {
      content:  imageBuffer.toString("base64"),
      mimeType: mimeType || "image/jpeg",
    },
  });

  const doc          = result.document || {};
  const extractedText = doc.text || "";

  const tableCount = (doc.pages || []).reduce((n, p) => n + (p.tables || []).length, 0);
  const bodyCount  = (doc.pages || []).reduce(
    (n, p) => n + (p.tables || []).reduce((m, t) => m + (t.bodyRows || []).length, 0), 0
  );
  console.log(`📊 Tables: ${tableCount}  body rows: ${bodyCount}`);
  console.log(`📄 Text (first 500):\n${extractedText.substring(0, 500)}`);

  let medicines  = parseTablesFromDocument(doc);
  let usedMethod = "table";

  if (medicines.length < 3) {
    console.log(`⚠️ Table extraction: ${medicines.length} — using text fallback`);
    medicines  = parsePrescriptionRowsFromText(extractedText);
    usedMethod = "text-fallback";
  }

  console.log(`✅ ${medicines.length} medicine(s) via [${usedMethod}]`);
  return { extractedText, medicines };
}

module.exports = { extractPrescriptionData };

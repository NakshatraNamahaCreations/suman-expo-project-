"use strict";

/**
 * Google Document AI Form Parser — prescription medicine extractor.
 *
 * PRIMARY  : table cell extraction  (row-locked, zero cross-contamination)
 * FALLBACK : medicine-to-medicine text blocks when no table is detected
 */

const { DocumentProcessorServiceClient } = require("@google-cloud/documentai").v1;

const LOCATION     = process.env.DOCUMENT_AI_LOCATION   || "us";
const PROJECT_ID   = process.env.DOCUMENT_AI_PROJECT_ID;
const PROCESSOR_ID = process.env.DOCUMENT_AI_PROCESSOR_ID;

// Regional endpoint is REQUIRED — without it requests fail for US processors
const client = new DocumentProcessorServiceClient({
  apiEndpoint: `${LOCATION}-documentai.googleapis.com`,
});

// ─── Text extraction helpers ──────────────────────────────────────────────────

function getTextFromLayout(document, layout) {
  if (!layout?.textAnchor?.textSegments?.length) return "";
  const full = document.text || "";
  return layout.textAnchor.textSegments
    .map((s) => full.substring(Number(s.startIndex) || 0, Number(s.endIndex) || 0))
    .join("")
    .replace(/\n/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// ─── Header detection ─────────────────────────────────────────────────────────

function normalizeHeader(v) {
  return String(v).toLowerCase().replace(/[^a-z0-9]/g, "");
}

function findHeaderIndex(headerCells, keywords) {
  const normalized = headerCells.map((h) => normalizeHeader(h));
  for (const kw of keywords) {
    const n = normalizeHeader(kw);
    const i = normalized.findIndex((h) => h === n || h.includes(n));
    if (i >= 0) return i;
  }
  return -1;
}

// ─── Field cleaners ───────────────────────────────────────────────────────────

function cleanMedicineName(v) {
  return String(v || "")
    .replace(/^\d+[\.\)]\s*/, "")   // strip leading row-number  ("1." / "2)")
    .replace(/\bRx\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanDose(v) {
  const text = String(v || "").trim();
  const m = text.match(/(\d+)\s*(tablet|tab|capsule|cap|ml|drop|drops|spoon|unit)/i);
  if (!m) return text || "1 Tablet";
  const qty  = m[1];
  const raw  = m[2].toLowerCase();
  let unit   = "Tablet";
  if (raw.startsWith("cap"))   unit = "Capsule";
  else if (raw === "ml")       unit = "ml";
  else if (raw.startsWith("drop")) unit = "Drops";
  else if (raw.startsWith("spoon")) unit = "Spoon";
  else if (raw === "unit")     unit = "Unit";
  return `${qty} ${unit}`;
}

function cleanFrequency(v) {
  const text = String(v || "")
    .replace(/\s+/g, "")
    .replace(/[–—]/g, "-")
    .replace(/[|_]/g, "-")
    .replace(/[Oo]/g, "0");        // OCR often confuses O with 0
  const m = text.match(/\d-\d-\d/);
  return m ? m[0] : "";
}

function cleanInstruction(v) {
  const s = String(v || "").toLowerCase();
  if (s.includes("after food")    || s.includes("after meal"))   return "After Food";
  if (s.includes("before food")   || s.includes("before meal"))  return "Before Food";
  if (s.includes("with food"))     return "With Food";
  if (s.includes("empty stomach")) return "Empty Stomach";
  return String(v || "").replace(/\s+/g, " ").trim();
}

function cleanDurationLabel(v) {
  const m = String(v || "").match(
    /\d+\s*(month|months|month\(s\)|day|days|day\(s\)|week|weeks|week\(s\))/i
  );
  if (!m) return "";
  return m[0]
    .trim()
    .replace(/months?(\(s\))?/i, "Month(s)")
    .replace(/days?(\(s\))?/i,   "Day(s)")
    .replace(/weeks?(\(s\))?/i,  "Week(s)");
}

function getDurationDays(label) {
  const s = String(label || "").toLowerCase();
  const n = Number(s.match(/\d+/)?.[0] || 0);
  if (!n) return 0;
  if (s.includes("month")) return n * 30;
  if (s.includes("week"))  return n * 7;
  if (s.includes("day"))   return n;
  return 0;
}

function parseDoseCount(v) {
  return Number(String(v || "").match(/\d+/)?.[0] || 1) || 1;
}

function parseFreqPerDay(v) {
  const parts = String(v || "").split("-").map((n) => Number(n) || 0);
  return parts.length === 3 ? parts.reduce((s, n) => s + n, 0) : 0;
}

function calcQty(dose, frequency, durationDays) {
  const d = parseDoseCount(dose);
  const f = parseFreqPerDay(frequency);
  if (!durationDays || !f) return 0;
  return d * f * durationDays;
}

// ─── Row builder ──────────────────────────────────────────────────────────────

function buildMedicineRow({ medicineName, dose, frequency, instruction, durationLabel, qtyFromTable }) {
  const name = cleanMedicineName(medicineName || "");
  if (!name) return null;

  const doseVal  = cleanDose(dose || "");
  const freqVal  = cleanFrequency(frequency || "");
  const instrVal = cleanInstruction(instruction || "");
  const durLabel = cleanDurationLabel(durationLabel || "");
  const durDays  = getDurationDays(durLabel);
  const calcQ    = calcQty(doseVal, freqVal, durDays);
  const finalQty = Number(qtyFromTable || 0) || calcQ || 0;

  console.log(`📋 "${name}" | dose:${doseVal} | freq:${freqVal} | dur:${durLabel}(${durDays}d) | qty:${finalQty}`);

  return {
    medicineName:    name,
    name,
    dose:            doseVal,
    frequency:       freqVal,
    freqLabel:       freqVal,
    instruction:     instrVal,
    durationLabel:   durLabel,
    durationDays:    durDays,
    duration:        durDays,
    prescriptionQty: finalQty || null,
    calculatedQty:   calcQ    || null,
    quantity:        finalQty || null,
    orderQty:        finalQty || null,
    requiredQty:     finalQty || null,
  };
}

// ─── Table extraction (primary) ───────────────────────────────────────────────

const REAL_HEADER_RE = /^(brand|strength|dose|frequency|freq|instruction|duration|qty|quantity|rx|#|no\.?|s\.?no\.?|medicine|drug|name)$/i;

function parseTablesFromDocument(document) {
  const medicines = [];
  const seen      = new Set();

  for (const page of document.pages || []) {
    for (const table of page.tables || []) {

      // Collect header text from the actual header rows
      const headerTexts = (table.headerRows || []).flatMap((row) =>
        (row.cells || []).map((cell) => getTextFromLayout(document, cell.layout))
      );

      // Attempt named-column detection; fall back to positional defaults.
      // Positional order for typical Tamil Nadu prescription tables:
      //   col 0 = Brand & Strength  col 1 = Dose  col 2 = Frequency
      //   col 3 = Instruction       col 4 = Duration  col 5 = Qty
      let nameIdx  = findHeaderIndex(headerTexts, ["brandstrength","brand","medicine","drug","name","rx"]);
      let doseIdx  = findHeaderIndex(headerTexts, ["dose"]);
      let freqIdx  = findHeaderIndex(headerTexts, ["frequency","freq"]);
      let instrIdx = findHeaderIndex(headerTexts, ["instruction","food","timing","remarks"]);
      let durIdx   = findHeaderIndex(headerTexts, ["duration","period"]);
      let qtyIdx   = findHeaderIndex(headerTexts, ["qty","quantity"]);

      // Detect row-number column — if col 0 of the first body row is "1.", "2.", …
      // shift ALL positional defaults right by 1.
      const firstBodyRow = (table.bodyRows || [])[0];
      let offset = 0;
      if (firstBodyRow) {
        const col0 = getTextFromLayout(document, firstBodyRow.cells?.[0]?.layout);
        if (/^\d+\.?\s*$/.test(col0.trim())) {
          offset = 1;
          console.log("🔢 Row-number column detected — shifting column indices +1");
        }
      }

      if (nameIdx  < 0) nameIdx  = 0 + offset;
      if (doseIdx  < 0) doseIdx  = 1 + offset;
      if (freqIdx  < 0) freqIdx  = 2 + offset;
      if (instrIdx < 0) instrIdx = 3 + offset;
      if (durIdx   < 0) durIdx   = 4 + offset;
      if (qtyIdx   < 0) qtyIdx   = 5 + offset;

      // Process headerRows + bodyRows together.
      // Document AI sometimes places the first data row in headerRows.
      const allRows = [
        ...(table.headerRows || []),
        ...(table.bodyRows   || []),
      ];

      for (const row of allRows) {
        const cells = row.cells || [];
        const get   = (idx) =>
          idx >= 0 && idx < cells.length
            ? getTextFromLayout(document, cells[idx]?.layout)
            : "";

        const rawName = get(nameIdx);
        if (!rawName || rawName.length < 2) continue;

        // Skip actual column-header cells
        if (REAL_HEADER_RE.test(rawName.trim())) continue;

        const medName = rawName.replace(/^\d+[\.\)]\s*/, "").trim();
        if (medName.length < 2) continue;

        const key = medName.toUpperCase().replace(/\s+/g, "");
        if (seen.has(key)) continue;
        seen.add(key);

        const med = buildMedicineRow({
          medicineName:  medName,
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

const LAB_LINE_RE     = /\b(hemoglobin|leukocyte|platelet|creatinine|uric[\s-]?acid|investigation|hba1c|hs[\s-]?crp|ecg|echo|ppbs|fbs)\b/i;
const MED_KEYWORD_RE  = /\b(TABLET|TAB|CAPSULE|CAP|SYRUP|SYP|INJECTION|INJ|CREAM|OINTMENT|DROP|DROPS)\b/i;
const TEXT_FREQ_RE    = /\b(\d)\s*[-–—|_]\s*(\d)\s*[-–—|_]\s*(\d)\b/;
const TEXT_DUR_RE     = /\b(\d+)\s*(month|months|day|days|week|weeks)\b/i;

// Stop-pattern for medicine name (dose/freq/food timing)
const NAME_STOP_RE = /\s+(?:\d+\s*(?:tablet|tab|capsule|cap)|\d\s*[-–—]\s*\d\s*[-–—]\s*\d|after\s+food|before\s+food|\d+\s*(?:month|day|week))/i;

function parsePrescriptionRowsFromText(fullText) {
  const lines = String(fullText || "")
    .split(/\n+/)
    .map((l) => l.trim())
    .filter(Boolean);

  const medicines = [];
  const seen = new Set();

  // Identify medicine lines
  const medIndices = lines.reduce((acc, line, i) => {
    if (!LAB_LINE_RE.test(line) && (MED_KEYWORD_RE.test(line) || TEXT_FREQ_RE.test(line))) {
      acc.push(i);
    }
    return acc;
  }, []);

  for (let j = 0; j < medIndices.length; j++) {
    const start = medIndices[j];
    let end = j + 1 < medIndices.length
      ? medIndices[j + 1]
      : Math.min(start + 6, lines.length);

    // Clip block at any lab/investigation line
    for (let k = start + 1; k < end; k++) {
      if (LAB_LINE_RE.test(lines[k])) { end = k; break; }
    }

    const firstLine = lines[start];
    const block     = lines.slice(start, end).join(" ");

    // Extract medicine name
    const stripped  = firstLine.replace(/^\d+[\.\)]\s*/, "");
    const stopMatch = stripped.match(NAME_STOP_RE);
    const medName   = (stopMatch ? stripped.substring(0, stopMatch.index) : stripped).trim();

    if (!medName || medName.length < 2) continue;
    if (LAB_LINE_RE.test(medName)) continue;

    const key = medName.toUpperCase().replace(/\s+/g, "");
    if (seen.has(key)) continue;
    seen.add(key);

    // Extract freq from block
    const freqM = block.match(TEXT_FREQ_RE);
    const freqVal = freqM ? `${freqM[1]}-${freqM[2]}-${freqM[3]}` : "";

    // Extract duration from block
    const durM = block.match(TEXT_DUR_RE);
    let durLabel = "";
    let durDays  = 0;
    if (durM) {
      const n = parseInt(durM[1], 10);
      const u = durM[2].toLowerCase();
      if (u.startsWith("month")) { durLabel = `${n} Month(s)`; durDays = n * 30; }
      else if (u.startsWith("week")) { durLabel = `${n} Week(s)`; durDays = n * 7; }
      else                           { durLabel = `${n} Day(s)`;  durDays = n;     }
    }

    // Qty: number appearing right after a duration token
    const qtyAfterDurM = block.match(/\d+\s*(?:month|months|day|days|week|weeks)\s+(\d{1,4})\b/i);

    const med = buildMedicineRow({
      medicineName:  medName,
      dose:          block,
      frequency:     freqVal || block,
      instruction:   block,
      durationLabel: durLabel || block,
      qtyFromTable:  qtyAfterDurM ? Number(qtyAfterDurM[1]) : 0,
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
  console.log(`🤖 Document AI processor: ${processorName}`);

  const [result] = await client.processDocument({
    name:        processorName,
    rawDocument: {
      content:  imageBuffer.toString("base64"),
      mimeType: mimeType || "image/jpeg",
    },
  });

  const doc           = result.document || {};
  const extractedText = doc.text || "";

  const tableCount = (doc.pages || []).reduce((n, p) => n + (p.tables || []).length, 0);
  const bodyCount  = (doc.pages || []).reduce(
    (n, p) => n + (p.tables || []).reduce((m, t) => m + (t.bodyRows || []).length, 0), 0
  );

  console.log(`📊 Document AI: ${tableCount} table(s), ${bodyCount} body row(s)`);
  console.log(`📄 Extracted text (first 400 chars):\n${extractedText.substring(0, 400)}`);

  // Primary: table extraction
  let medicines  = parseTablesFromDocument(doc);
  let usedMethod = "table";

  // Fallback: text block extraction when table gives < 3 medicines
  if (medicines.length < 3) {
    console.log(`⚠️ Table extraction found only ${medicines.length} medicine(s) — using text fallback`);
    medicines  = parsePrescriptionRowsFromText(extractedText);
    usedMethod = "text-fallback";
  }

  console.log(`✅ ${medicines.length} medicine(s) extracted via [${usedMethod}]`);
  return { extractedText, medicines };
}

module.exports = { extractPrescriptionData };

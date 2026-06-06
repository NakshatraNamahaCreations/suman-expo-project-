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

const client = new DocumentProcessorServiceClient({
  apiEndpoint: `${LOCATION}-documentai.googleapis.com`,
});

// ─── Text helpers ─────────────────────────────────────────────────────────────

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
  const normalized = headerCells.map(normalizeHeader);
  for (const kw of keywords) {
    const n = normalizeHeader(kw);
    const i = normalized.findIndex((h) => h === n || h.includes(n));
    if (i >= 0) return i;
  }
  return -1;
}

// ─── Patterns ─────────────────────────────────────────────────────────────────

// Pure freq pattern: "1-0-1", "0 - 0 - 1", etc.
const PURE_FREQ_RE = /^\s*\d\s*[-–—|]\s*\d\s*[-–—|]\s*\d\s*$/;

// Freq pattern anywhere in text
const FREQ_RE = /\b(\d)\s*[-–—|_]\s*(\d)\s*[-–—|_]\s*(\d)\b/;

// Duration pattern
const DUR_RE = /\b(\d+)\s*(month|months|day|days|week|weeks)\b/i;

// Lab/investigation lines — skip entirely
const LAB_LINE_RE = /\b(hemoglobin|leukocyte|platelet|creatinine|uric[\s-]?acid|investigation|hba1c|hs[\s-]?crp|ecg|echo|ppbs|fbs)\b/i;

// Medicine keyword (TABLET, CAP, etc.)
const MED_KEYWORD_RE = /\b(TABLET|TAB|CAPSULE|CAP|SYRUP|SYP|INJECTION|INJ|CREAM|OINTMENT|DROP|DROPS)\b/i;

// Table header keywords to skip
const HEADER_RE = /^(brand|strength|dose|frequency|freq|instruction|duration|qty|quantity|rx|#|s\.?no\.?|no\.?|medicine|drug|name)$/i;

// ─── Field cleaners ───────────────────────────────────────────────────────────

function cleanMedicineName(v) {
  return String(v || "")
    .replace(/^\d+[\.\)]\s*/, "")     // strip leading row-number "1." "2)"
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
  if (raw.startsWith("cap"))        unit = "Capsule";
  else if (raw === "ml")            unit = "ml";
  else if (raw.startsWith("drop"))  unit = "Drops";
  else if (raw.startsWith("spoon")) unit = "Spoon";
  else if (raw === "unit")          unit = "Unit";
  return `${qty} ${unit}`;
}

function cleanFrequency(v) {
  const raw = String(v || "").trim();
  if (!raw) return "";

  // ── 1. Digit N-N-N pattern ─────────────────────────────────────────────────
  // After removing spaces, replace every non-alphanumeric character with "-".
  // This handles ASCII hyphens, Unicode minus signs, en/em dashes, slashes —
  // whatever separator Document AI happens to emit.  Letters are preserved so
  // the abbreviation steps below (OD/BD/TDS) can still fire.
  const forDigit = raw
    .replace(/\s+/g, "")
    .replace(/[^a-zA-Z0-9]/g, "-")   // any non-alphanum separator → "-"
    .replace(/[Oo]/g, "0")            // OCR: letter O → digit 0
    .replace(/[Il]/g, "1");           // OCR: letter I/l → digit 1
  const m = forDigit.match(/\d-\d-\d/);
  if (m) return m[0];

  // ── 2. Space-separated digits "1 0 1" ─────────────────────────────────────
  const spaceM = raw.match(/\b(\d)\s+(\d)\s+(\d)\b/);
  if (spaceM) return `${spaceM[1]}-${spaceM[2]}-${spaceM[3]}`;

  // ── 3. Abbreviations — exact after stripping spaces / dots / slashes ───────
  // Handles "B.D", "O.D", "T.D.S", "H/S", "B D", etc.
  const norm = raw.toUpperCase().replace(/[\s\.\-\/]/g, "");
  if (norm === "OD")                                     return "1-0-0";
  if (norm === "BD" || norm === "BID")                   return "1-0-1";
  if (norm === "TDS" || norm === "TID" || norm === "TD") return "1-1-1";
  if (norm === "QID" || norm === "QD")                   return "1-1-1";
  if (norm === "HS" || norm === "SOS")                   return "0-0-1";

  // ── 4. Word-boundary — handles "BD (Twice Daily)", "OD - once a day", etc. ─
  // IMPORTANT: Do NOT add natural-language words (MORNING, NIGHT, TWICE…) here.
  // This function is also used when scanning non-freq cells; those words appear
  // legitimately in instruction cells ("At Night", "Once After Food") and would
  // produce false-positive frequencies.  Natural language is handled separately
  // only for the dedicated frequency column — see parseTablesFromDocument.
  const u = raw.toUpperCase();
  if (/\bOD\b/.test(u))         return "1-0-0";
  if (/\b(BD|BID)\b/.test(u))   return "1-0-1";
  if (/\b(TDS|TID)\b/.test(u))  return "1-1-1";
  if (/\bQID\b/.test(u))        return "1-1-1";
  if (/\bHS\b/.test(u))         return "0-0-1";
  if (/\bSOS\b/.test(u))        return "0-0-1";

  return "";
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
  const n = Number(String(v || "").match(/\d+/)?.[0] || 1);
  return (n > 0 ? n : 1);
}

function parseFreqPerDay(v) {
  const parts = String(v || "").split("-").map((x) => parseInt(x, 10));
  if (parts.length === 3 && parts.every((x) => !isNaN(x))) {
    return parts.reduce((s, n) => s + n, 0);
  }
  return 0;
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

  // Skip row if name IS a frequency pattern (e.g. "1-0-1", "0-0-1")
  if (PURE_FREQ_RE.test(name)) return null;

  const doseVal  = cleanDose(dose || "");
  const freqVal  = cleanFrequency(frequency || "");
  const instrVal = cleanInstruction(instruction || "");
  const durLabel = cleanDurationLabel(durationLabel || "");
  const durDays  = getDurationDays(durLabel);
  const calcQ    = calcQty(doseVal, freqVal, durDays);
  const finalQty = (Number(qtyFromTable) > 0 ? Number(qtyFromTable) : 0) || calcQ || 0;

  console.log(
    `  📋 "${name}" | dose:${doseVal} | freq:${freqVal || "(none)"} | dur:${durLabel || "(none)"}(${durDays}d) | calcQty:${calcQ} | finalQty:${finalQty}`
  );

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

function parseTablesFromDocument(document) {
  const medicines = [];
  const seen      = new Set();

  for (const page of document.pages || []) {
    for (const table of (page.tables || [])) {

      // Collect header cell texts
      const headerTexts = (table.headerRows || []).flatMap((row) =>
        (row.cells || []).map((cell) => getTextFromLayout(document, cell.layout))
      );

      console.log(`\n📊 Table headers: [${headerTexts.join(" | ")}]`);

      // ── Step 1: find column indices from header text ─────────────────────
      let nameIdx  = findHeaderIndex(headerTexts, ["brandstrength","brand","medicine","drug","name","rx"]);
      let doseIdx  = findHeaderIndex(headerTexts, ["dose"]);
      let freqIdx  = findHeaderIndex(headerTexts, ["frequency","freq"]);
      let instrIdx = findHeaderIndex(headerTexts, ["instruction","food","timing","remarks"]);
      let durIdx   = findHeaderIndex(headerTexts, ["duration","period"]);
      let qtyIdx   = findHeaderIndex(headerTexts, ["qty","quantity"]);

      console.log(`   Named cols found → name:${nameIdx} dose:${doseIdx} freq:${freqIdx} instr:${instrIdx} dur:${durIdx} qty:${qtyIdx}`);

      // ── Step 2: detect row-number column offset ───────────────────────────
      // The header row may NOT include the row-number column (e.g. headers are
      // ["Brand & Strength","Dose","Frequency","Instruction","Duration","Qty"]
      // — 6 cells) but every data row starts with "1.", "2.", … — 7 cells.
      // In that case the named indices are off by 1 for the data rows and MUST
      // be shifted.  We compare header column count with data column count.
      const firstBodyRow = (table.bodyRows || [])[0];
      let offset = 0;
      if (firstBodyRow) {
        const col0 = getTextFromLayout(document, firstBodyRow.cells?.[0]?.layout);
        if (/^\d+\.?\s*$/.test(col0.trim())) {
          const headerCols = headerTexts.length;
          const dataCols   = (firstBodyRow.cells || []).length;
          // Only apply offset when header row is shorter than data row
          // (i.e. header doesn't have the row-number column)
          if (dataCols > headerCols || headerCols === 0) {
            offset = 1;
            console.log(`🔢 Row-number offset=1 (header cols:${headerCols}, data cols:${dataCols})`);
          }
        }
      }

      // ── Step 3: apply offset to ALL found indices ─────────────────────────
      // Whether a column was found by name OR will use a positional default,
      // we must shift by offset because data rows have an extra row-number cell.
      if (offset > 0) {
        if (nameIdx  >= 0) nameIdx  += offset;
        if (doseIdx  >= 0) doseIdx  += offset;
        if (freqIdx  >= 0) freqIdx  += offset;
        if (instrIdx >= 0) instrIdx += offset;
        if (durIdx   >= 0) durIdx   += offset;
        if (qtyIdx   >= 0) qtyIdx   += offset;
      }

      // ── Step 4: positional defaults for columns not found in headers ──────
      if (nameIdx  < 0) nameIdx  = 0 + offset;
      if (doseIdx  < 0) doseIdx  = 1 + offset;
      if (freqIdx  < 0) freqIdx  = 2 + offset;
      if (instrIdx < 0) instrIdx = 3 + offset;
      if (durIdx   < 0) durIdx   = 4 + offset;
      if (qtyIdx   < 0) qtyIdx   = 5 + offset;

      console.log(`   Final col map → name:${nameIdx} dose:${doseIdx} freq:${freqIdx} instr:${instrIdx} dur:${durIdx} qty:${qtyIdx}`);

      // Process headerRows + bodyRows together (Document AI sometimes puts first data row in headerRows)
      const allRows = [
        ...(table.headerRows || []),
        ...(table.bodyRows   || []),
      ];

      for (const row of allRows) {
        const cells = row.cells || [];
        const get   = (idx) =>
          (idx >= 0 && idx < cells.length)
            ? getTextFromLayout(document, cells[idx]?.layout)
            : "";

        // Log all cell values for diagnosis
        const allCellTexts = cells.map((c, i) => `[${i}]:${getTextFromLayout(document, c?.layout)}`).join(" ");
        console.log(`   Row cells: ${allCellTexts}`);

        const rawName = get(nameIdx);
        if (!rawName || rawName.length < 2) continue;

        // Skip actual column-header text
        if (HEADER_RE.test(rawName.trim())) continue;

        // Skip rows where cell looks like a pure frequency pattern
        if (PURE_FREQ_RE.test(rawName.trim())) {
          console.log(`   ⏭️  Skip: "${rawName}" looks like a frequency pattern`);
          continue;
        }

        const medName = rawName.replace(/^\d+[\.\)]\s*/, "").trim();
        if (medName.length < 2) continue;

        // Skip if name is a pure freq pattern after cleanup
        if (PURE_FREQ_RE.test(medName)) continue;

        const key = medName.toUpperCase().replace(/\s+/g, "");
        if (seen.has(key)) continue;
        seen.add(key);

        // Get frequency from dedicated column
        let freqRaw = get(freqIdx);
        console.log(`   🔍 freq col[${freqIdx}] raw: "${freqRaw}"`);

        // Natural language on the dedicated freq column ONLY — NOT inside cleanFrequency,
        // because those words (MORNING, NIGHT, ONCE…) appear legitimately in instruction
        // cells and would cause false positives during the cell scan.
        if (!cleanFrequency(freqRaw) && freqRaw.trim()) {
          const u = freqRaw.toUpperCase();
          const nlFreq =
            /\bTWICE\b/.test(u)                                       ? "1-0-1" :
            /\bTHRICE\b|THREE\s+TIMES/.test(u)                        ? "1-1-1" :
            /\b(REQUIRED|SOS|NEEDED|AS\s+WHEN|WHEN\s+REQUIRED)\b/.test(u) ? "0-0-1" :
            /\bWEEK\b/.test(u)                                         ? "0-0-1" :
            /\bONCE\b/.test(u) || /\bDAILY\b/.test(u)                 ? "1-0-0" :
            (/\bMORNING\b/.test(u) && !/\bNIGHT\b/.test(u))           ? "1-0-0" :
            (/\bNIGHT\b/.test(u)   && !/\bMORNING\b/.test(u))         ? "0-0-1" :
            /\bBEDTIME\b/.test(u)                                      ? "0-0-1" : "";
          if (nlFreq) {
            console.log(`   🔍 freq NL resolved: "${freqRaw}" → "${nlFreq}"`);
            freqRaw = nlFreq;
          }
        }

        // If still unrecognized, scan other cells — but SKIP the name cell (brand names
        // like "CEZIN OD" contain "OD") and the instruction cell ("At Night" contains
        // "Night") to avoid false positives.
        if (!cleanFrequency(freqRaw)) {
          for (let ci = 0; ci < cells.length; ci++) {
            if (ci === nameIdx || ci === instrIdx) continue;
            const cellText = getTextFromLayout(document, cells[ci]?.layout);
            if (cleanFrequency(cellText)) {
              console.log(`   🔍 freq found in cell[${ci}]: "${cellText}"`);
              freqRaw = cellText; break;
            }
          }
          // Last resort: digit pattern embedded in the name (e.g. "MOMATE 0.1% 0-0-1")
          if (!cleanFrequency(freqRaw)) {
            const freqInName = rawName.match(FREQ_RE);
            if (freqInName) {
              console.log(`   🔍 freq extracted from name: "${freqInName[0]}"`);
              freqRaw = freqInName[0];
            }
          }
        }

        if (!cleanFrequency(freqRaw)) {
          console.log(`   ⚠️  freq UNRESOLVED for "${medName}" — cell was: "${get(freqIdx)}"`);
        }

        // Get duration — dedicated column first, then scan all cells
        let durRaw = get(durIdx);
        if (!cleanDurationLabel(durRaw)) {
          for (const cell of cells) {
            const cellText = getTextFromLayout(document, cell?.layout);
            if (cleanDurationLabel(cellText)) { durRaw = cellText; break; }
          }
        }

        // Safe qty extraction — avoids concatenating digits from merged cells.
        // e.g. "6 Month(s) 180" → must give 180, NOT 6180.
        const qtyStr  = get(qtyIdx).trim();
        const qtyNums = (qtyStr.match(/\d+/g) || []).map(Number);
        let qtyRaw = 0;
        if (qtyNums.length > 1) {
          // Multiple numbers: duration digit(s) come first, qty is LAST
          qtyRaw = qtyNums[qtyNums.length - 1];
        } else if (qtyNums.length === 1 && !/\b(month|day|week)\b/i.test(qtyStr)) {
          // Single number with no duration word: it really is the qty
          qtyRaw = qtyNums[0];
        }
        // Single number inside duration text (e.g. "6 Month(s)") → qtyRaw stays 0
        // → buildMedicineRow will fall back to calculated qty (dose × freq × days)
        console.log(`   qty cell: "${qtyStr}" → qtyRaw:${qtyRaw}`);

        // Qty-based freq inference (last resort): when every other approach fails,
        // compute tablets-per-day = prescriptionQty ÷ (dose × durationDays).
        // This correctly infers CLOPI A → 360/(1×180)=2/day → "1-0-1".
        // NOTE: timing (M/A/N) can't be inferred from qty alone — only the count.
        if (!cleanFrequency(freqRaw) && qtyRaw > 0) {
          const inferDurDays = getDurationDays(cleanDurationLabel(durRaw));
          if (inferDurDays > 0) {
            const doseCount = Number((get(doseIdx).match(/\d+/) || ["1"])[0]) || 1;
            const perDay    = Math.round(qtyRaw / (doseCount * inferDurDays));
            const inferred  =
              perDay >= 3 ? "1-1-1" :
              perDay === 2 ? "1-0-1" :
              perDay === 1 ? "1-0-0" : "";
            if (inferred) {
              freqRaw = inferred;
              console.log(`   🔍 freq inferred: ${qtyRaw}÷(${doseCount}×${inferDurDays}d)=${perDay}/day → "${inferred}"`);
            }
          }
        }

        const med = buildMedicineRow({
          medicineName:  medName,
          dose:          get(doseIdx),
          frequency:     freqRaw,
          instruction:   get(instrIdx),
          durationLabel: durRaw,
          qtyFromTable:  qtyRaw,
        });

        if (med) medicines.push(med);
      }
    }
  }

  return medicines;
}

// ─── Text fallback ────────────────────────────────────────────────────────────

const NAME_STOP_RE = /\s+(?:\d+\s*(?:tablet|tab|capsule|cap)|\d\s*[-–—]\s*\d\s*[-–—]\s*\d|after\s+food|before\s+food|\d+\s*(?:month|day|week))/i;

function parsePrescriptionRowsFromText(fullText) {
  const lines = String(fullText || "")
    .split(/\n+/)
    .map((l) => l.trim())
    .filter(Boolean);

  const medicines = [];
  const seen = new Set();

  const medIndices = lines.reduce((acc, line, i) => {
    // Skip lab lines
    if (LAB_LINE_RE.test(line)) return acc;
    // Skip lines that ARE a pure freq pattern — "1-0-1" alone is NOT a medicine
    if (PURE_FREQ_RE.test(line)) return acc;
    // Must contain a medicine keyword OR a freq pattern AND contain at least one letter-word
    if ((MED_KEYWORD_RE.test(line) || FREQ_RE.test(line)) && /[a-zA-Z]{2,}/.test(line)) {
      acc.push(i);
    }
    return acc;
  }, []);

  for (let j = 0; j < medIndices.length; j++) {
    const start = medIndices[j];
    let end = j + 1 < medIndices.length
      ? medIndices[j + 1]
      : Math.min(start + 6, lines.length);

    for (let k = start + 1; k < end; k++) {
      if (LAB_LINE_RE.test(lines[k])) { end = k; break; }
    }

    const firstLine = lines[start];
    const block     = lines.slice(start, end).join(" ");

    const stripped  = firstLine.replace(/^\d+[\.\)]\s*/, "");
    const stopMatch = stripped.match(NAME_STOP_RE);
    const medName   = (stopMatch ? stripped.substring(0, stopMatch.index) : stripped).trim();

    if (!medName || medName.length < 2) continue;
    if (LAB_LINE_RE.test(medName)) continue;
    if (PURE_FREQ_RE.test(medName)) continue;

    const key = medName.toUpperCase().replace(/\s+/g, "");
    if (seen.has(key)) continue;
    seen.add(key);

    const freqM = block.match(FREQ_RE);
    const freqRaw = freqM ? `${freqM[1]}-${freqM[2]}-${freqM[3]}` : "";

    const durM = block.match(DUR_RE);
    let durLabel = "";
    if (durM) {
      const n = parseInt(durM[1], 10);
      const u = durM[2].toLowerCase();
      if (u.startsWith("month")) durLabel = `${n} Month(s)`;
      else if (u.startsWith("week")) durLabel = `${n} Week(s)`;
      else durLabel = `${n} Day(s)`;
    }

    const qtyAfterDurM = block.match(/\d+\s*(?:month|months|day|days|week|weeks)\s+(\d{1,4})\b/i);

    const med = buildMedicineRow({
      medicineName:  medName,
      dose:          block,
      frequency:     freqRaw,
      instruction:   block,
      durationLabel: durLabel,
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
  console.log(`\n🤖 Document AI: ${processorName}`);

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
  console.log(`📄 Full extracted text:\n${extractedText}\n`);

  let medicines  = parseTablesFromDocument(doc);
  let usedMethod = "table";

  if (medicines.length < 3) {
    console.log(`\n⚠️  Table extraction: ${medicines.length} result(s) — switching to text fallback`);
    medicines  = parsePrescriptionRowsFromText(extractedText);
    usedMethod = "text-fallback";
  }

  console.log(`\n✅ Final: ${medicines.length} medicine(s) via [${usedMethod}]`);
  return { extractedText, medicines };
}

module.exports = { extractPrescriptionData };

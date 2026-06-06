const { DocumentProcessorServiceClient } =
  require("@google-cloud/documentai").v1;

const client = new DocumentProcessorServiceClient();

/**
 * Google Document AI Form Parser service.
 * Returns row-wise prescription medicines:
 * medicineName, dose, frequency, instruction, duration, quantity.
 */

function getTextFromLayout(document, layout) {
  if (!layout?.textAnchor?.textSegments?.length) return "";

  const fullText = document.text || "";

  return layout.textAnchor.textSegments
    .map((segment) => {
      const start = Number(segment.startIndex || 0);
      const end = Number(segment.endIndex || 0);
      return fullText.substring(start, end);
    })
    .join("")
    .replace(/\n/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeHeader(value = "") {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function findHeaderIndex(headers = [], names = []) {
  const normalizedHeaders = headers.map(normalizeHeader);

  for (const name of names) {
    const normalizedName = normalizeHeader(name);

    const exactIndex = normalizedHeaders.findIndex(
      (header) => header === normalizedName
    );
    if (exactIndex >= 0) return exactIndex;

    const partialIndex = normalizedHeaders.findIndex((header) =>
      header.includes(normalizedName)
    );
    if (partialIndex >= 0) return partialIndex;
  }

  return -1;
}

function cleanMedicineName(value = "") {
  return String(value || "")
    .replace(/^\d+[\.\)]?\s*/, "")
    .replace(/\bRx\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanDose(value = "") {
  const text = String(value || "").trim();

  const match = text.match(/\d+\s*(tablet|tab|capsule|cap|ml|drop|drops|spoon|unit)/i);

  if (match) {
    const qty = match[0].match(/\d+/)?.[0] || "1";
    const lower = match[0].toLowerCase();

    let unit = "Tablet";
    if (lower.includes("cap")) unit = "Capsule";
    else if (lower.includes("ml")) unit = "ml";
    else if (lower.includes("drop")) unit = "Drops";
    else if (lower.includes("spoon")) unit = "Spoon";
    else if (lower.includes("unit")) unit = "Unit";

    return `${qty} ${unit}`;
  }

  return text || "1 Tablet";
}

function cleanFrequency(value = "") {
  const text = String(value || "")
    .replace(/\s+/g, "")
    .replace(/[–—]/g, "-")
    .replace(/\|/g, "-")
    .replace(/_/g, "-")
    .replace(/[Oo]/g, "0");

  const match = text.match(/\d-\d-\d/);

  return match ? match[0] : "";
}

function cleanInstruction(value = "") {
  const text = String(value || "").toLowerCase();

  if (text.includes("after food")) return "After Food";
  if (text.includes("before food")) return "Before Food";
  if (text.includes("after meal")) return "After Food";
  if (text.includes("before meal")) return "Before Food";
  if (text.includes("with food")) return "With Food";

  return String(value || "").replace(/\s+/g, " ").trim();
}

function cleanDurationLabel(value = "") {
  const text = String(value || "").replace(/\s+/g, " ").trim();

  const match = text.match(
    /\d+\s*(month|months|month\(s\)|day|days|day\(s\)|week|weeks|week\(s\))/i
  );

  if (!match) return "";

  let result = match[0].trim();

  result = result.replace(/months?/i, "Month(s)");
  result = result.replace(/days?/i, "Day(s)");
  result = result.replace(/weeks?/i, "Week(s)");

  return result;
}

function getDurationDays(durationText = "") {
  const text = String(durationText || "").toLowerCase();
  const number = Number(text.match(/\d+/)?.[0] || 0);

  if (!number) return 0;

  if (text.includes("month")) return number * 30;
  if (text.includes("week")) return number * 7;
  if (text.includes("day")) return number;

  return 0;
}

function parseDoseCount(dose = "") {
  return Number(String(dose || "").match(/\d+/)?.[0] || 1) || 1;
}

function parseFrequencyCount(frequency = "") {
  const parts = String(frequency || "")
    .split("-")
    .map((n) => Number(n) || 0);

  if (parts.length !== 3) return 0;

  return parts.reduce((sum, n) => sum + n, 0);
}

function calculateQuantity({ dose, frequency, durationDays }) {
  const doseCount = parseDoseCount(dose);
  const perDay = parseFrequencyCount(frequency);

  if (!durationDays || !perDay) return 0;

  return doseCount * perDay * durationDays;
}

function getQtyFromText(value = "") {
  const text = String(value || "").trim();
  const qty = Number(text.match(/\d+/)?.[0] || 0);
  return qty || 0;
}

function buildMedicineRow({
  medicineName,
  dose,
  frequency,
  instruction,
  durationLabel,
  qtyFromTable,
  debugRow,
}) {
  const cleanName = cleanMedicineName(medicineName || "");
  const cleanDoseValue = cleanDose(dose || "");
  const cleanFrequencyValue = cleanFrequency(frequency || "");
  const cleanInstructionValue = cleanInstruction(instruction || "");
  const cleanDurationValue = cleanDurationLabel(durationLabel || "");
  const durationDays = getDurationDays(cleanDurationValue);

  const calculatedQty = calculateQuantity({
    dose: cleanDoseValue,
    frequency: cleanFrequencyValue,
    durationDays,
  });

  const finalQty = Number(qtyFromTable || 0) || calculatedQty || 0;

  if (!cleanName || !cleanFrequencyValue || !durationDays) return null;

  return {
    medicineName: cleanName,
    name: cleanName,

    dose: cleanDoseValue,
    frequency: cleanFrequencyValue,
    freqLabel: cleanFrequencyValue,
    instruction: cleanInstructionValue,

    durationLabel: cleanDurationValue,
    durationDays,
    duration: durationDays,

    prescriptionQty: finalQty,
    calculatedQty,
    quantity: finalQty,
    orderQty: finalQty,
    requiredQty: finalQty,

    debugRow: debugRow || null,
  };
}

/**
 * Parse actual Document AI table output.
 */
function parseTablesFromDocument(document) {
  const rawTables = [];
  const medicines = [];

  for (const page of document.pages || []) {
    for (const table of page.tables || []) {
      const headers = [];

      for (const headerRow of table.headerRows || []) {
        for (const cell of headerRow.cells || []) {
          headers.push(getTextFromLayout(document, cell.layout));
        }
      }

      const rows = [];

      for (const bodyRow of table.bodyRows || []) {
        const row = [];

        for (const cell of bodyRow.cells || []) {
          row.push(getTextFromLayout(document, cell.layout));
        }

        rows.push(row);
      }

      rawTables.push({ headers, rows });

      const medicineIndex = findHeaderIndex(headers, [
        "brandstrength",
        "brand",
        "medicine",
        "drug",
        "name",
      ]);

      const doseIndex = findHeaderIndex(headers, ["dose"]);
      const frequencyIndex = findHeaderIndex(headers, ["frequency", "freq"]);
      const instructionIndex = findHeaderIndex(headers, ["instruction", "food"]);
      const durationIndex = findHeaderIndex(headers, ["duration"]);
      const qtyIndex = findHeaderIndex(headers, ["qty", "quantity"]);

      if (
        medicineIndex < 0 ||
        doseIndex < 0 ||
        frequencyIndex < 0 ||
        durationIndex < 0
      ) {
        continue;
      }

      for (const row of rows) {
        const medicineName = row[medicineIndex] || "";
        const dose = row[doseIndex] || "";
        const frequency = row[frequencyIndex] || "";
        const instruction =
          instructionIndex >= 0 ? row[instructionIndex] || "" : "";
        const durationLabel = row[durationIndex] || "";
        const qtyFromTable =
          qtyIndex >= 0 ? getQtyFromText(row[qtyIndex] || "") : 0;

        const med = buildMedicineRow({
          medicineName,
          dose,
          frequency,
          instruction,
          durationLabel,
          qtyFromTable,
          debugRow: row,
        });

        if (med) medicines.push(med);
      }
    }
  }

  return { rawTables, medicines };
}

/**
 * Fallback parser when Document AI does not return table cells.
 * It is only a fallback. The primary source is Document AI table cells.
 */
function parsePrescriptionRowsFromText(fullText = "") {
  const lines = String(fullText || "")
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);

  const rxIndex = lines.findIndex((line) => /^rx\b/i.test(line));
  const start = rxIndex >= 0 ? rxIndex + 1 : 0;

  const endIndex = lines.findIndex((line, index) => {
    if (index <= start) return false;
    return /investigation|next follow|signature|doctor/i.test(line);
  });

  const relevantLines = lines.slice(start, endIndex > start ? endIndex : lines.length);

  const rows = [];
  const rowRegex =
    /^(\d+[\.\)]?\s*)?(.+?)\s+(\d+\s*(?:tablet|tab|capsule|cap|ml|drop|drops|spoon|unit))\s+(\d\s*[-–—]\s*\d\s*[-–—]\s*\d)\s+(After Food|Before Food|With Food|After Meal|Before Meal)?\s*(\d+\s*(?:Month\(s\)|Months?|Day\(s\)|Days?|Week\(s\)|Weeks?))\s+(\d+)?/i;

  for (const line of relevantLines) {
    const match = line.match(rowRegex);

    if (!match) continue;

    const med = buildMedicineRow({
      medicineName: match[2],
      dose: match[3],
      frequency: match[4],
      instruction: match[5] || "",
      durationLabel: match[6],
      qtyFromTable: getQtyFromText(match[7] || ""),
      debugRow: line,
    });

    if (med) rows.push(med);
  }

  return rows;
}

async function extractPrescriptionData(imageBuffer, mimeType) {
  const projectId =
    process.env.DOCUMENT_AI_PROJECT_ID ||
    process.env.GCP_PROJECT_ID ||
    process.env.GOOGLE_CLOUD_PROJECT_ID;

  const location = process.env.DOCUMENT_AI_LOCATION || "us";
  const processorId = process.env.DOCUMENT_AI_PROCESSOR_ID;

  if (!projectId || !processorId) {
    throw new Error(
      "Missing Document AI config. Add DOCUMENT_AI_PROJECT_ID, DOCUMENT_AI_LOCATION and DOCUMENT_AI_PROCESSOR_ID in .env"
    );
  }

  const name = `projects/${projectId}/locations/${location}/processors/${processorId}`;

  const request = {
    name,
    rawDocument: {
      content: imageBuffer.toString("base64"),
      mimeType: mimeType || "image/jpeg",
    },
  };

  const [result] = await client.processDocument(request);
  const document = result.document || {};
  const extractedText = document.text || "";

  const tableResult = parseTablesFromDocument(document);
  let medicines = tableResult.medicines || [];

  if (medicines.length === 0) {
    console.log("⚠️ Document AI table cells empty. Trying text fallback parser.");
    medicines = parsePrescriptionRowsFromText(extractedText);
  }

  return {
    extractedText,
    rawTables: tableResult.rawTables || [],
    medicines,
  };
}

module.exports = {
  extractPrescriptionData,
};

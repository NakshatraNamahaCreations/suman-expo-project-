const fs = require("fs");
const axios = require("axios");
const vision = require("@google-cloud/vision");
const Medicine = require("../models/Medicine");
const UserPrescriptionFile = require("../models/UserPrescriptionFile");
const { deleteFromCloudinary } = require("../config/cloudinary");

const client = new vision.ImageAnnotatorClient();

/**
 * Save prescription file info to UserPrescriptionFile collection.
 */
async function saveUserPrescriptionFile({
  userId,
  patientId,
  cloudinaryUrl,
  publicId,
  mimeType,
  fileName,
  fileSize,
}) {
  try {
    const fileType = mimeType?.includes("pdf")
      ? "pdf"
      : mimeType?.startsWith("image/")
        ? "image"
        : "other";

    const doc = await UserPrescriptionFile.create({
      userId,
      patientId: patientId || null,
      cloudinaryUrl,
      publicId,
      fileType,
      mimeType: mimeType || "",
      originalFileName: fileName || "",
      fileSize: fileSize || 0,
    });

    console.log(`✅ Prescription file saved for user ${userId}: ${doc._id}`);
    return doc;
  } catch (err) {
    console.error("⚠️ Could not save UserPrescriptionFile:", err.message);
    return null;
  }
}

exports.extractMedicinesFromPrescription = async (req, res) => {
  let cloudinaryPublicId = null;
  let cloudinaryUrl = null;

  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "No file uploaded",
      });
    }

    cloudinaryPublicId = req.file.filename;
    cloudinaryUrl = req.file.path;

    const fileName = req.file.originalname;
    const mimeType = req.file.mimetype;
    const fileSize = req.file.size || 0;

    const userId = req.body?.userId || null;
    const patientId = req.body?.patientId || null;

    console.log(`\n📄 Processing: ${fileName}`);
    console.log(`📄 MIME Type: ${mimeType}`);
    console.log(`☁️ Cloudinary URL: ${cloudinaryUrl}`);
    console.log(`☁️ Cloudinary Public ID: ${cloudinaryPublicId}`);

    if (!cloudinaryUrl || !cloudinaryPublicId) {
      return res.status(400).json({
        success: false,
        message: "File upload to Cloudinary failed",
      });
    }

    let imageBuffer;

    try {
      const response = await axios.get(cloudinaryUrl, {
        responseType: "arraybuffer",
        timeout: 30000,
      });

      imageBuffer = Buffer.from(response.data);
    } catch (fetchError) {
      console.error("❌ Error fetching file from Cloudinary:", fetchError.message);

      try {
        await deleteFromCloudinary(cloudinaryPublicId, "auto");
      } catch (deleteError) {
        console.error(
          "Warning: Could not delete file from Cloudinary:",
          deleteError.message
        );
      }

      return res.status(400).json({
        success: false,
        message: "Failed to process the uploaded file. Please try again.",
      });
    }

    if (!imageBuffer || imageBuffer.length === 0) {
      try {
        await deleteFromCloudinary(cloudinaryPublicId, "auto");
      } catch (deleteError) {
        console.error(
          "Warning: Could not delete empty file from Cloudinary:",
          deleteError.message
        );
      }

      return res.status(400).json({
        success: false,
        message: "Uploaded file is empty",
      });
    }

    let extractedText = "";
    let visionResult = null;

    try {
      const request = {
        image: {
          content: imageBuffer,
        },
        features: [
          {
            type: "DOCUMENT_TEXT_DETECTION",
          },
        ],
        imageContext: {
          languageHints: ["en"],
        },
      };

      const [result] = await client.annotateImage(request);
      visionResult = result;

      if (result.fullTextAnnotation && result.fullTextAnnotation.text) {
        extractedText = result.fullTextAnnotation.text;
      } else if (result.textAnnotations && result.textAnnotations.length > 0) {
        extractedText = result.textAnnotations
          .map((item) => item.description)
          .join("\n");
      }
    } catch (ocrError) {
      console.error("❌ OCR Error:", ocrError.message);

      try {
        await deleteFromCloudinary(cloudinaryPublicId, "auto");
        console.log("✅ Cleaned up prescription from Cloudinary after OCR error");
      } catch (deleteError) {
        console.error(
          "Warning: Could not delete file from Cloudinary:",
          deleteError.message
        );
      }

      return res.status(400).json({
        success: false,
        message:
          "Could not read the prescription. Please upload a clear image or PDF.",
      });
    }

    if (!extractedText || extractedText.trim().length === 0) {
      let savedFileOnNoText = null;

      if (userId) {
        savedFileOnNoText = await saveUserPrescriptionFile({
          userId,
          patientId,
          cloudinaryUrl,
          publicId: cloudinaryPublicId,
          mimeType,
          fileName,
          fileSize,
        });
      } else {
        try {
          await deleteFromCloudinary(cloudinaryPublicId, "auto");
        } catch (deleteError) {
          console.error(
            "Warning: Could not delete file from Cloudinary:",
            deleteError.message
          );
        }
      }

      return res.json({
        success: true,
        message: "No text found in image",
        extractedText: "",
        extractedMedicines: [],
        matchedMedicines: [],
        medicines: [],
        matchedCount: 0,
        prescriptionUrl: userId ? cloudinaryUrl : null,
        publicId: userId ? cloudinaryPublicId : null,
        prescriptionFileId: savedFileOnNoText?._id || null,
        prescriptionFile: savedFileOnNoText
          ? {
            _id: savedFileOnNoText._id,
            cloudinaryUrl: savedFileOnNoText.cloudinaryUrl,
            publicId: savedFileOnNoText.publicId,
            fileType: savedFileOnNoText.fileType,
            originalFileName: savedFileOnNoText.originalFileName,
          }
          : null,
      });
    }

    console.log(`✅ Extracted ${extractedText.length} characters`);
    console.log("\n🧾 RAW OCR TEXT START");
    console.log(extractedText);
    console.log("🧾 RAW OCR TEXT END\n");

    const extractedMedicines = extractMedicineRowsFromPrescription(
      extractedText,
      visionResult
    );

    console.log(
      "🧾 FINAL OCR MEDICINES:",
      JSON.stringify(extractedMedicines, null, 2)
    );

    if (extractedMedicines.length === 0) {
      let savedFileOnNoMeds = null;

      if (userId) {
        savedFileOnNoMeds = await saveUserPrescriptionFile({
          userId,
          patientId,
          cloudinaryUrl,
          publicId: cloudinaryPublicId,
          mimeType,
          fileName,
          fileSize,
        });
      } else {
        try {
          await deleteFromCloudinary(cloudinaryPublicId, "auto");
        } catch (deleteError) {
          console.error(
            "Warning: Could not delete file from Cloudinary:",
            deleteError.message
          );
        }
      }

      return res.json({
        success: true,
        message: "No medicines found",
        extractedText,
        extractedMedicines: [],
        matchedMedicines: [],
        medicines: [],
        matchedCount: 0,
        prescriptionUrl: userId ? cloudinaryUrl : null,
        publicId: userId ? cloudinaryPublicId : null,
        prescriptionFileId: savedFileOnNoMeds?._id || null,
        prescriptionFile: savedFileOnNoMeds
          ? {
            _id: savedFileOnNoMeds._id,
            cloudinaryUrl: savedFileOnNoMeds.cloudinaryUrl,
            publicId: savedFileOnNoMeds.publicId,
            fileType: savedFileOnNoMeds.fileType,
            originalFileName: savedFileOnNoMeds.originalFileName,
          }
          : null,
      });
    }

    console.log("🔗 Matching OCR medicines with database by medicine name only...");

    const matchedMedicines = await matchMedicinesWithDatabase(extractedMedicines);

    console.log(`✅ Matched ${matchedMedicines.length} medicines`);
    console.log(
      "💊 FINAL MATCHED MEDICINES:",
      JSON.stringify(matchedMedicines, null, 2)
    );

    let savedPrescriptionFile = null;

    if (userId) {
      savedPrescriptionFile = await saveUserPrescriptionFile({
        userId,
        patientId,
        cloudinaryUrl,
        publicId: cloudinaryPublicId,
        mimeType,
        fileName,
        fileSize,
      });
    }

    return res.json({
      success: true,
      message:
        matchedMedicines.length > 0
          ? `Found ${matchedMedicines.length} matching medicine(s)`
          : "No matching medicines found in database",

      extractedText,
      extractedMedicines,
      matchedMedicines,
      medicines: matchedMedicines,
      matchedCount: matchedMedicines.length,

      prescriptionUrl: cloudinaryUrl,
      publicId: cloudinaryPublicId,

      prescriptionFileId: savedPrescriptionFile?._id || null,
      prescriptionFile: savedPrescriptionFile
        ? {
          _id: savedPrescriptionFile._id,
          cloudinaryUrl: savedPrescriptionFile.cloudinaryUrl,
          publicId: savedPrescriptionFile.publicId,
          fileType: savedPrescriptionFile.fileType,
          originalFileName: savedPrescriptionFile.originalFileName,
        }
        : null,
    });
  } catch (error) {
    console.error("❌ Prescription extraction error:", error);

    if (cloudinaryPublicId) {
      try {
        await deleteFromCloudinary(cloudinaryPublicId, "auto");
        console.log("✅ Cleaned up prescription from Cloudinary after error");
      } catch (deleteError) {
        console.error(
          "Warning: Could not delete file from Cloudinary:",
          deleteError.message
        );
      }
    }

    return res.status(500).json({
      success: false,
      message: error.message || "Server error while reading prescription",
    });
  }
};

function normalizeText(text = "") {
  return String(text)
    .toLowerCase()
    .trim()
    .replace(/[^\w\s.%/-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeMedicineName(text = "") {
  return String(text)
    .toUpperCase()
    .replace(/[^\w\s.%/-]/g, " ")
    .replace(
      /\b(TABLET|TAB|CAPSULE|CAP|INJECTION|INJ|CREAM|OINTMENT|SYRUP|DROP|DROPS)\b/g,
      " "
    )
    .replace(/\s+/g, " ")
    .trim();
}

function cleanMedicineName(text = "") {
  let value = String(text || "").trim();

  value = value.replace(/^\d+[\.\)]\s*/, "");
  value = value.replace(/\s+/g, " ");
  value = value.replace(/[^\w\s.%/-]/g, " ");
  value = value.replace(/\s+/g, " ").trim();

  return value;
}

function cleanFrequency(value = "") {
  if (!value) return "";

  const text = String(value)
    .replace(/\s+/g, "")
    .replace(/[–—]/g, "-")
    .replace(/\|/g, "-")
    .replace(/_/g, "-");

  const match = text.match(/\d-\d-\d/);

  return match ? match[0] : "";
}

function cleanDurationLabel(value = "") {
  if (!value) return "";

  const text = String(value).replace(/\s+/g, " ").trim();

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
  if (!durationText) return 0;

  if (typeof durationText === "number") return durationText;

  const text = String(durationText).toLowerCase();
  const numberMatch = text.match(/\d+/);
  const number = numberMatch ? Number(numberMatch[0]) : 0;

  if (!number) return 0;

  if (text.includes("month")) return number * 30;
  if (text.includes("week")) return number * 7;
  if (text.includes("day")) return number;

  return 0;
}

function cleanInstruction(value = "") {
  if (!value) return "";

  const text = String(value).toLowerCase();

  if (text.includes("after food")) return "After Food";
  if (text.includes("before food")) return "Before Food";
  if (text.includes("after meal")) return "After Food";
  if (text.includes("before meal")) return "Before Food";
  if (text.includes("with food")) return "With Food";

  return "";
}

function cleanDose(value = "") {
  if (!value) return "";

  const text = String(value).trim();

  const tabletMatch = text.match(/\d+\s*(tablet|tab|capsule|cap)/i);

  if (tabletMatch) {
    const qty = tabletMatch[0].match(/\d+/)?.[0] || "1";

    const unit = tabletMatch[0].toLowerCase().includes("cap")
      ? "Capsule"
      : "Tablet";

    return `${qty} ${unit}`;
  }

  if (/to\s*apply/i.test(text)) return "To Apply";

  return "";
}

function isHeaderOrInvalidLine(line = "") {
  const text = line.toLowerCase();

  const skipWords = [
    "brand",
    "strength",
    "dose",
    "frequency",
    "instruction",
    "duration",
    "investigation",
    "signature",
    "doctor",
    "patient",
    "date",
    "age",
    "notes",
    "footer",
    "prescription",
    "mobile",
    "address",
    "hospital",
    "chief complaints",
    "past history",
    "observations",
    "diagnosis",
    "vitals",
    "uid",
  ];

  if (!line || line.trim().length < 3) return true;
  if (skipWords.some((word) => text.includes(word))) return true;
  if (/^\d+$/.test(line.trim())) return true;

  return false;
}

function looksLikeMedicineLine(line = "") {
  const text = line.trim();

  if (isHeaderOrInvalidLine(text)) return false;

  return /\b(TABLET|TAB|CAPSULE|CAP|CREAM|SYRUP|INJECTION|INJ|OINTMENT|DROP|DROPS)\b/i.test(
    text
  );
}

function cleanRowMedicineName(value = "") {
  return String(value || "")
    .replace(/^\d+[\.\)]?\s*/, "")
    .replace(/\bRx\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

function parseDoseCount(doseText = "") {
  const text = String(doseText || "").toLowerCase();

  const match = text.match(/\d+/);

  return match ? Number(match[0]) || 1 : 1;
}

function parseFrequencyCount(frequency = "") {
  const parts = String(frequency || "")
    .replace(/[–—]/g, "-")
    .split("-")
    .map((n) => Number(n) || 0);

  if (parts.length !== 3) return 0;

  return parts.reduce((sum, value) => sum + value, 0);
}

function calculatePrescriptionQuantity({
  dose = "",
  frequency = "",
  durationDays = 0,
}) {
  const doseCount = parseDoseCount(dose);
  const frequencyCount = parseFrequencyCount(frequency);

  if (!durationDays || !frequencyCount) return 0;

  return doseCount * frequencyCount * durationDays;
}

function extractPrescriptionQty(block = "") {
  const text = String(block || "");

  const afterDuration = text.match(
    /(?:\d+\s*(?:month|months|month\(s\)|day|days|day\(s\)|week|weeks|week\(s\)))\s+(\d{1,4})\b/i
  );

  if (afterDuration) {
    const qty = Number(afterDuration[1]);
    if (qty > 0 && qty <= 9999) return qty;
  }

  const allNumbers = [...text.matchAll(/\b(\d{1,4})\b/g)];

  if (allNumbers.length > 0) {
    const lastNumber = Number(allNumbers[allNumbers.length - 1][1]);
    if (lastNumber > 0 && lastNumber <= 9999) return lastNumber;
  }

  return null;
}

function getPrescriptionSectionLines(text = "") {
  const rawLines = String(text || "")
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);

  const startIndex = rawLines.findIndex(
    (line) =>
      /^rx\b/i.test(line) || /\bbrand\s*&?\s*strength\b/i.test(line)
  );

  const endIndex = rawLines.findIndex((line, index) => {
    if (startIndex >= 0 && index <= startIndex) return false;

    return /\binvestigation\b|\bnext\s+follow|\bsignature\b|\bdoctor\b|\bregards\b/i.test(
      line
    );
  });

  const from = startIndex >= 0 ? startIndex + 1 : 0;
  const to = endIndex > from ? endIndex : rawLines.length;

  return rawLines.slice(from, to);
}

function extractMedicineNameFromBlock(line = "") {
  let value = cleanMedicineName(line);

  value = value.replace(/^\d+[\.\)]\s*/, "");

  const stopPatterns = [
    /\s+\d+\s*(tablet|tab|capsule|cap)\b/i,
    /\s+\d-\d-\d\b/i,
    /\s+after\s+food\b/i,
    /\s+before\s+food\b/i,
    /\s+\d+\s*(month|months|day|days|week|weeks)\b/i,
  ];

  for (const pattern of stopPatterns) {
    const match = value.match(pattern);

    if (match && match.index > 0) {
      value = value.substring(0, match.index).trim();
    }
  }

  return value;
}

/**
 * Google Vision words with bounding boxes.
 */
function getVisionWords(result) {
  const words = [];

  const pages = result?.fullTextAnnotation?.pages || [];

  for (const page of pages) {
    for (const block of page.blocks || []) {
      for (const paragraph of block.paragraphs || []) {
        for (const word of paragraph.words || []) {
          const wordText = (word.symbols || [])
            .map((symbol) => symbol.text || "")
            .join("")
            .trim();

          if (!wordText) continue;

          const vertices = word.boundingBox?.vertices || [];

          const xs = vertices.map((v) => v.x || 0);
          const ys = vertices.map((v) => v.y || 0);

          const minX = Math.min(...xs);
          const maxX = Math.max(...xs);
          const minY = Math.min(...ys);
          const maxY = Math.max(...ys);

          words.push({
            text: wordText,
            x: minX,
            y: minY,
            maxX,
            maxY,
            centerX: (minX + maxX) / 2,
            centerY: (minY + maxY) / 2,
          });
        }
      }
    }
  }

  return words;
}

/**
 * Group OCR words into visual table rows using y-position.
 */
function groupWordsIntoRows(words) {
  const sortedWords = [...words].sort((a, b) => a.centerY - b.centerY);

  const rows = [];
  const Y_TOLERANCE = 14;

  for (const word of sortedWords) {
    let row = rows.find(
      (item) => Math.abs(item.centerY - word.centerY) <= Y_TOLERANCE
    );

    if (!row) {
      row = {
        centerY: word.centerY,
        words: [],
      };
      rows.push(row);
    }

    row.words.push(word);

    row.centerY =
      row.words.reduce((sum, item) => sum + item.centerY, 0) / row.words.length;
  }

  return rows
    .map((row) => {
      const sorted = row.words.sort((a, b) => a.x - b.x);

      return {
        ...row,
        words: sorted,
        text: sorted.map((word) => word.text).join(" "),
      };
    })
    .sort((a, b) => a.centerY - b.centerY);
}

function findTableHeaderRow(rows) {
  return rows.find((row) => {
    const text = row.text.toLowerCase();

    return (
      text.includes("brand") &&
      text.includes("dose") &&
      text.includes("frequency") &&
      text.includes("duration")
    );
  });
}

function findColumnX(headerRow, columnName) {
  if (!headerRow) return null;

  const word = headerRow.words.find((item) =>
    item.text.toLowerCase().includes(columnName.toLowerCase())
  );

  return word ? word.x : null;
}

function getWordsBetweenX(words, startX, endX) {
  return words
    .filter((word) => {
      if (startX !== null && word.centerX < startX) return false;
      if (endX !== null && word.centerX >= endX) return false;
      return true;
    })
    .map((word) => word.text)
    .join(" ")
    .trim();
}

/**
 * Main fixed parser:
 * First tries Vision table row parser.
 * If table parser fails, uses text fallback parser.
 */
function extractMedicineRowsFromPrescription(text, visionResult = null) {
  const visionRows = extractMedicineRowsFromVisionTable(visionResult);

  if (visionRows && visionRows.length > 0) {
    console.log("✅ Medicines extracted using Vision table row parser");

    const unique = [];

    for (const med of visionRows) {
      const key = normalizeMedicineName(med.medicineName);

      const exists = unique.some(
        (item) => normalizeMedicineName(item.medicineName) === key
      );

      if (!exists) unique.push(med);
    }

    return unique;
  }

  console.log("⚠️ Vision table parser failed. Using fallback parser.");

  const rxLines = getPrescriptionSectionLines(text);
  const medicines = [];

  for (const line of rxLines) {
    if (!looksLikeMedicineLine(line)) continue;

    const medicineName = extractMedicineNameFromBlock(line);

    if (!medicineName || medicineName.length < 3) continue;

    const dose = cleanDose(line) || "1 Tablet";
    const frequency = cleanFrequency(line) || "";
    const instruction = cleanInstruction(line) || "";
    const durationLabel = cleanDurationLabel(line) || "";
    const durationDays = getDurationDays(durationLabel);

    const calculatedQty = calculatePrescriptionQuantity({
      dose,
      frequency,
      durationDays,
    });

    const prescriptionQty = extractPrescriptionQty(line) || calculatedQty || 0;

    medicines.push({
      medicineName,
      name: medicineName,

      dose,
      frequency,
      freqLabel: frequency,
      instruction,

      duration: durationDays,
      durationDays,
      durationLabel,

      prescriptionQty: prescriptionQty || null,
      calculatedQty: calculatedQty || 0,
      quantity: prescriptionQty || calculatedQty || 0,
      orderQty: prescriptionQty || calculatedQty || 0,
      requiredQty: prescriptionQty || calculatedQty || 0,
    });
  }

  const unique = [];

  for (const med of medicines) {
    const key = normalizeMedicineName(med.medicineName);

    const exists = unique.some(
      (item) => normalizeMedicineName(item.medicineName) === key
    );

    if (!exists) unique.push(med);
  }

  return unique;
}

/**
 * Vision table parser:
 * Parses each medicine using same row x-position.
 */
function extractMedicineRowsFromVisionTable(result) {
  const words = getVisionWords(result);

  if (!words.length) return [];

  const rows = groupWordsIntoRows(words);
  const headerRow = findTableHeaderRow(rows);

  if (!headerRow) {
    console.log("⚠️ Prescription table header row not found");
    return [];
  }

  const doseX = findColumnX(headerRow, "dose");
  const frequencyX = findColumnX(headerRow, "frequency");
  const instructionX = findColumnX(headerRow, "instruction");
  const durationX = findColumnX(headerRow, "duration");
  const qtyX = findColumnX(headerRow, "qty");

  if (!doseX || !frequencyX || !instructionX || !durationX || !qtyX) {
    console.log("⚠️ Prescription table column positions missing", {
      doseX,
      frequencyX,
      instructionX,
      durationX,
      qtyX,
    });
    return [];
  }

  const medicineRows = rows.filter((row) => {
    if (row.centerY <= headerRow.centerY) return false;

    const text = row.text.toLowerCase();

    if (
      text.includes("investigation") ||
      text.includes("next follow") ||
      text.includes("signature") ||
      text.includes("doctor") ||
      text.includes("regards")
    ) {
      return false;
    }

    return looksLikeMedicineLine(row.text);
  });

  const medicines = [];

  for (const row of medicineRows) {
    const rowWords = row.words;

    const medicineNameRaw = getWordsBetweenX(rowWords, null, doseX - 5);
    const doseRaw = getWordsBetweenX(rowWords, doseX - 5, frequencyX - 5);
    const frequencyRaw = getWordsBetweenX(
      rowWords,
      frequencyX - 5,
      instructionX - 5
    );
    const instructionRaw = getWordsBetweenX(
      rowWords,
      instructionX - 5,
      durationX - 5
    );
    const durationRaw = getWordsBetweenX(rowWords, durationX - 5, qtyX - 5);
    const qtyRaw = getWordsBetweenX(rowWords, qtyX - 5, null);

    const medicineName = cleanRowMedicineName(medicineNameRaw);

    if (!medicineName || medicineName.length < 3) continue;

    const dose = cleanDose(doseRaw) || "1 Tablet";
    const frequency = cleanFrequency(frequencyRaw);
    const instruction = cleanInstruction(instructionRaw);
    const durationLabel = cleanDurationLabel(durationRaw);
    const durationDays = getDurationDays(durationLabel);

    const calculatedQty = calculatePrescriptionQuantity({
      dose,
      frequency,
      durationDays,
    });

    const qtyMatch = String(qtyRaw || "").match(/\d+/);
    const prescriptionQty = qtyMatch
      ? Number(qtyMatch[0])
      : calculatedQty || 0;

    medicines.push({
      medicineName,
      name: medicineName,

      dose,
      frequency,
      freqLabel: frequency,
      instruction,

      duration: durationDays,
      durationDays,
      durationLabel,

      prescriptionQty: prescriptionQty || null,
      calculatedQty: calculatedQty || 0,
      quantity: prescriptionQty || calculatedQty || 0,
      orderQty: prescriptionQty || calculatedQty || 0,
      requiredQty: prescriptionQty || calculatedQty || 0,

      debugRowText: row.text,
      debugColumns: {
        medicineNameRaw,
        doseRaw,
        frequencyRaw,
        instructionRaw,
        durationRaw,
        qtyRaw,
      },
    });
  }

  return medicines;
}

function getMedicineMatchScore(ocrName = "", dbName = "") {
  const ocr = normalizeMedicineName(ocrName);
  const db = normalizeMedicineName(dbName);

  if (!ocr || !db) return 0;

  if (ocr === db) return 100;

  const ocrTokens = ocr.split(" ").filter(Boolean);
  const dbTokens = db.split(" ").filter(Boolean);

  if (!ocrTokens.length || !dbTokens.length) return 0;

  if (ocrTokens[0] !== dbTokens[0]) {
    return 0;
  }

  let common = 0;

  for (const token of ocrTokens) {
    if (dbTokens.includes(token)) {
      common += 1;
    }
  }

  return Math.round((common / ocrTokens.length) * 100);
}

async function matchMedicinesWithDatabase(extractedMedicines) {
  const matched = [];

  try {
    const MIN_MATCH_SCORE = 90;

    const dbMedicines = await Medicine.find({
      status: "Active",
    }).lean();

    for (const ocrMed of extractedMedicines) {
      const ocrName = ocrMed.medicineName || ocrMed.name || "";

      let bestMatch = null;
      let bestScore = 0;

      for (const dbMed of dbMedicines) {
        const dbName = dbMed.description || dbMed.name || "";
        const score = getMedicineMatchScore(ocrName, dbName);

        if (score > bestScore) {
          bestScore = score;
          bestMatch = dbMed;
        }
      }

      if (bestMatch && bestScore >= MIN_MATCH_SCORE) {
        const durationDays =
          ocrMed.durationDays || getDurationDays(ocrMed.durationLabel) || 0;

        const calculatedQty =
          ocrMed.calculatedQty ||
          calculatePrescriptionQuantity({
            dose: ocrMed.dose,
            frequency: ocrMed.frequency,
            durationDays,
          });

        const prescriptionQty =
          ocrMed.prescriptionQty || calculatedQty || 0;

        matched.push({
          _id: bestMatch._id.toString(),
          medicineId: bestMatch._id.toString(),

          description: bestMatch.description,
          name: bestMatch.description,

          mfr: bestMatch.mfr || "N/A",
          vendor: bestMatch.vendor || "N/A",
          pack: bestMatch.pack || "N/A",

          price: bestMatch.newMrp || bestMatch.price || 0,
          mrp: bestMatch.newMrp || bestMatch.mrp || 0,
          newMrp: bestMatch.newMrp || 0,

          netValue: bestMatch.netValue || 0,
          taxableValue: bestMatch.taxableValue || 0,

          /**
           * qty = DB stock quantity only.
           */
          qty: bestMatch.qty || 0,
          stock: bestMatch.qty || 0,
          inStock: (bestMatch.qty || 0) > 0,

          gstPercent: bestMatch.gstPercent || 5,

          dose: ocrMed.dose || "",
          frequency: ocrMed.frequency || "",
          freqLabel: ocrMed.frequency || "",
          instruction: ocrMed.instruction || "",

          duration: durationDays,
          durationDays,
          durationLabel: ocrMed.durationLabel || "",

          /**
           * Frontend order quantity ku idha use pannu.
           */
          prescriptionQty: prescriptionQty || null,
          calculatedQty: calculatedQty || 0,
          quantity: prescriptionQty || calculatedQty || 0,
          orderQty: prescriptionQty || calculatedQty || 0,
          requiredQty: prescriptionQty || calculatedQty || 0,

          ocrMedicineName: ocrName,
          matchScore: bestScore,

          debugRowText: ocrMed.debugRowText || "",
          debugColumns: ocrMed.debugColumns || null,
        });
      } else {
        console.log(
          `⚠️ Medicine not matched with DB: ${ocrName} | Best score: ${bestScore}`
        );
      }
    }
  } catch (error) {
    console.error("Database error:", error.message);
  }

  return matched;
}
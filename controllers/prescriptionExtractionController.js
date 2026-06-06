const axios = require("axios");
const Medicine = require("../models/Medicine");
const UserPrescriptionFile = require("../models/UserPrescriptionFile");
const { deleteFromCloudinary } = require("../config/cloudinary");
const { extractPrescriptionData } = require("../services/documentAiPrescription.service");

/**
 * This controller uses Google Document AI Form Parser.
 * Old Google Vision OCR logic is removed because it does not preserve table rows/columns.
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
      console.error("❌ Error fetching Cloudinary file:", fetchError.message);

      await safeDeleteCloudinary(cloudinaryPublicId);

      return res.status(400).json({
        success: false,
        message: "Failed to process the uploaded file. Please try again.",
      });
    }

    if (!imageBuffer || imageBuffer.length === 0) {
      await safeDeleteCloudinary(cloudinaryPublicId);

      return res.status(400).json({
        success: false,
        message: "Uploaded file is empty",
      });
    }

    let extractedText = "";
    let extractedMedicines = [];
    let rawTables = [];

    try {
      console.log("🤖 Processing prescription with Google Document AI Form Parser...");

      const docAiResult = await extractPrescriptionData(imageBuffer, mimeType);

      extractedText = docAiResult.extractedText || "";
      extractedMedicines = docAiResult.medicines || [];
      rawTables = docAiResult.rawTables || [];

      console.log("✅ DOCUMENT AI RAW TABLES:");
      console.log(JSON.stringify(rawTables, null, 2));

      console.log("✅ DOCUMENT AI EXTRACTED MEDICINES:");
      console.log(JSON.stringify(extractedMedicines, null, 2));
    } catch (docAiError) {
      console.error("❌ Document AI Error:", docAiError);

      await safeDeleteCloudinary(cloudinaryPublicId);

      return res.status(400).json({
        success: false,
        message:
          "Could not read the prescription table. Please upload a clearer prescription image.",
        error: docAiError.message,
      });
    }

    if (!extractedText || extractedText.trim().length === 0) {
      const savedFile = await handleNoExtractionFileSave({
        userId,
        patientId,
        cloudinaryUrl,
        cloudinaryPublicId,
        mimeType,
        fileName,
        fileSize,
      });

      return res.json({
        success: true,
        message: "No text found in prescription",
        extractedText: "",
        extractedMedicines: [],
        matchedMedicines: [],
        medicines: [],
        matchedCount: 0,
        prescriptionUrl: userId ? cloudinaryUrl : null,
        publicId: userId ? cloudinaryPublicId : null,
        prescriptionFileId: savedFile?._id || null,
        prescriptionFile: buildPrescriptionFileResponse(savedFile),
      });
    }

    if (extractedMedicines.length === 0) {
      const savedFile = await handleNoExtractionFileSave({
        userId,
        patientId,
        cloudinaryUrl,
        cloudinaryPublicId,
        mimeType,
        fileName,
        fileSize,
      });

      return res.json({
        success: true,
        message: "No medicines found in prescription table",
        extractedText,
        rawTables,
        extractedMedicines: [],
        matchedMedicines: [],
        medicines: [],
        matchedCount: 0,
        prescriptionUrl: userId ? cloudinaryUrl : null,
        publicId: userId ? cloudinaryPublicId : null,
        prescriptionFileId: savedFile?._id || null,
        prescriptionFile: buildPrescriptionFileResponse(savedFile),
      });
    }

    console.log("🔗 Matching Document AI medicines with database...");

    const matchedMedicines = await matchMedicinesWithDatabase(extractedMedicines);

    console.log(`✅ Matched ${matchedMedicines.length} medicines`);
    console.log("💊 FINAL MATCHED MEDICINES:");
    console.log(JSON.stringify(matchedMedicines, null, 2));

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
      rawTables,
      extractedMedicines,

      matchedMedicines,
      medicines: matchedMedicines,
      matchedCount: matchedMedicines.length,

      prescriptionUrl: cloudinaryUrl,
      publicId: cloudinaryPublicId,

      prescriptionFileId: savedPrescriptionFile?._id || null,
      prescriptionFile: buildPrescriptionFileResponse(savedPrescriptionFile),
    });
  } catch (error) {
    console.error("❌ Prescription extraction error:", error);

    if (cloudinaryPublicId) {
      await safeDeleteCloudinary(cloudinaryPublicId);
    }

    return res.status(500).json({
      success: false,
      message: error.message || "Server error while reading prescription",
    });
  }
};

async function safeDeleteCloudinary(publicId) {
  try {
    if (publicId) {
      await deleteFromCloudinary(publicId, "auto");
      console.log("✅ Cleaned up prescription from Cloudinary");
    }
  } catch (deleteError) {
    console.error("Warning: Could not delete Cloudinary file:", deleteError.message);
  }
}

async function handleNoExtractionFileSave({
  userId,
  patientId,
  cloudinaryUrl,
  cloudinaryPublicId,
  mimeType,
  fileName,
  fileSize,
}) {
  if (userId) {
    return saveUserPrescriptionFile({
      userId,
      patientId,
      cloudinaryUrl,
      publicId: cloudinaryPublicId,
      mimeType,
      fileName,
      fileSize,
    });
  }

  await safeDeleteCloudinary(cloudinaryPublicId);
  return null;
}

function buildPrescriptionFileResponse(savedFile) {
  if (!savedFile) return null;

  return {
    _id: savedFile._id,
    cloudinaryUrl: savedFile.cloudinaryUrl,
    publicId: savedFile.publicId,
    fileType: savedFile.fileType,
    originalFileName: savedFile.originalFileName,
  };
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

function getDurationDays(durationText = "") {
  if (!durationText) return 0;

  if (typeof durationText === "number") return durationText;

  const text = String(durationText).toLowerCase();
  const number = Number(text.match(/\d+/)?.[0] || 0);

  if (!number) return 0;
  if (text.includes("month")) return number * 30;
  if (text.includes("week")) return number * 7;
  if (text.includes("day")) return number;

  return 0;
}

function parseDoseCount(doseText = "") {
  return Number(String(doseText || "").match(/\d+/)?.[0] || 1) || 1;
}

function parseFrequencyCount(frequency = "") {
  const parts = String(frequency || "")
    .split("-")
    .map((n) => Number(n) || 0);

  if (parts.length !== 3) return 0;

  return parts.reduce((sum, n) => sum + n, 0);
}

function calculatePrescriptionQty({ dose, frequency, durationDays }) {
  const doseCount = parseDoseCount(dose);
  const perDay = parseFrequencyCount(frequency);

  if (!durationDays || !perDay) return 0;

  return doseCount * perDay * durationDays;
}

function getMedicineMatchScore(ocrName = "", dbName = "") {
  const ocr = normalizeMedicineName(ocrName);
  const db = normalizeMedicineName(dbName);

  if (!ocr || !db) return 0;

  if (ocr === db) return 100;

  if (ocr.includes(db) || db.includes(ocr)) return 95;

  const ocrTokens = ocr.split(" ").filter((token) => token.length > 1);
  const dbTokens = db.split(" ").filter((token) => token.length > 1);

  if (!ocrTokens.length || !dbTokens.length) return 0;

  let common = 0;

  for (const token of ocrTokens) {
    if (dbTokens.includes(token)) {
      common += 1;
    }
  }

  return Math.round((common / Math.max(ocrTokens.length, dbTokens.length)) * 100);
}

async function matchMedicinesWithDatabase(extractedMedicines) {
  const matched = [];

  try {
    const MIN_MATCH_SCORE = 70;

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
          Number(ocrMed.durationDays || 0) ||
          getDurationDays(ocrMed.durationLabel) ||
          0;

        const calculatedQty =
          Number(ocrMed.calculatedQty || 0) ||
          calculatePrescriptionQty({
            dose: ocrMed.dose,
            frequency: ocrMed.frequency,
            durationDays,
          });

        const prescriptionQty =
          Number(ocrMed.prescriptionQty || 0) ||
          Number(ocrMed.quantity || 0) ||
          Number(ocrMed.orderQty || 0) ||
          calculatedQty ||
          0;

        matched.push({
          _id: bestMatch._id.toString(),
          medicineId: bestMatch._id.toString(),

          description: bestMatch.description,
          name: bestMatch.description,

          mfr: bestMatch.mfr || "N/A",
          vendor: bestMatch.vendor || "N/A",
          pack: bestMatch.pack || "N/A",
          batchNo: bestMatch.batchNo || "",
          hsnCode: bestMatch.hsnCode || "",

          price: bestMatch.newMrp || bestMatch.price || 0,
          mrp: bestMatch.newMrp || bestMatch.mrp || 0,
          newMrp: bestMatch.newMrp || 0,

          netValue: bestMatch.netValue || bestMatch.newMrp || 0,
          taxableValue: bestMatch.taxableValue || 0,
          gstPercent: bestMatch.gstPercent || 5,

          // DB stock only.
          qty: bestMatch.qty || 0,
          stock: bestMatch.qty || 0,
          availableQuantity: bestMatch.qty || 0,
          inStock: (bestMatch.qty || 0) > 0,

          // Prescription table data.
          dose: ocrMed.dose || "1 Tablet",
          frequency: ocrMed.frequency || "",
          freqLabel: ocrMed.freqLabel || ocrMed.frequency || "",
          instruction: ocrMed.instruction || "",

          duration: durationDays,
          durationDays,
          durationLabel: ocrMed.durationLabel || "",

          // Order quantity only.
          prescriptionQty: prescriptionQty || null,
          calculatedQty: calculatedQty || null,
          quantity: prescriptionQty || calculatedQty || null,
          orderQty: prescriptionQty || calculatedQty || null,
          requiredQty: prescriptionQty || calculatedQty || null,

          ocrMedicineName: ocrName,
          matchScore: bestScore,
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

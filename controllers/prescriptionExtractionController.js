"use strict";

const axios  = require("axios");
const Medicine = require("../models/Medicine");
const UserPrescriptionFile = require("../models/UserPrescriptionFile");
const { deleteFromCloudinary } = require("../config/cloudinary");
const { extractPrescriptionData } = require("../services/documentAiPrescription.service");

// ─── Name normaliser ──────────────────────────────────────────────────────────
// Strips dosage-form prefixes ONLY — used for DB matching, not for display.
// "TABLET ANGIORELAX 2.6" → "ANGIORELAX 2.6" so it matches DB entry "ANGIORELAX 2.6"

const FORM_PREFIX_RE =
  /\b(TABLET|TAB|CAPSULE|CAP|INJECTION|INJ|CREAM|OINTMENT|SYRUP|SYP|DROP|DROPS)\b/gi;

function normalizeMedicineName(text = "") {
  return String(text)
    .toUpperCase()
    .replace(FORM_PREFIX_RE, " ")
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// ─── Fuzzy match score 0–100 ──────────────────────────────────────────────────

const MIN_MATCH_SCORE = 75;

function getMedicineMatchScore(ocrName = "", dbName = "") {
  const ocr = normalizeMedicineName(ocrName);
  const db  = normalizeMedicineName(dbName);

  if (!ocr || !db) return 0;
  if (ocr === db)  return 100;

  const ocrTokens = ocr.split(" ").filter(Boolean);
  const dbTokens  = db.split(" ").filter(Boolean);

  if (!ocrTokens.length || !dbTokens.length) return 0;

  // Primary word must match (or one must contain the other)
  if (ocrTokens[0] !== dbTokens[0]) {
    if (!ocr.includes(dbTokens[0]) && !db.includes(ocrTokens[0])) return 0;
  }

  // Token overlap score
  let common = 0;
  for (const t of ocrTokens) {
    if (dbTokens.includes(t)) common++;
  }
  const overlapScore =
    (common / Math.max(ocrTokens.length, dbTokens.length)) * 100;

  // Substring bonus
  const subScore = ocr.includes(db) || db.includes(ocr) ? 90 : 0;

  return Math.round(Math.max(overlapScore, subScore));
}

// ─── Database matching ────────────────────────────────────────────────────────

async function matchMedicinesWithDatabase(ocrMedicines) {
  const matched = [];

  try {
    const dbMedicines = await Medicine.find({ status: "Active" }).lean();

    for (const ocrMed of ocrMedicines) {
      const ocrName = ocrMed.medicineName || ocrMed.name || "";
      if (!ocrName) continue;

      let bestMatch = null;
      let bestScore = 0;

      for (const dbMed of dbMedicines) {
        const score = getMedicineMatchScore(
          ocrName,
          dbMed.description || dbMed.name || ""
        );
        if (score > bestScore) {
          bestScore = score;
          bestMatch = dbMed;
        }
      }

      if (bestMatch && bestScore >= MIN_MATCH_SCORE) {
        const durationDays = ocrMed.durationDays || 0;

        matched.push({
          // ── DB identity ──────────────────────────────────────────────────
          _id:        bestMatch._id.toString(),
          medicineId: bestMatch._id.toString(),

          // ── Display name (from DB) ───────────────────────────────────────
          description: bestMatch.description,
          name:        bestMatch.description,

          // ── DB meta ──────────────────────────────────────────────────────
          mfr:    bestMatch.mfr    || "N/A",
          vendor: bestMatch.vendor || "N/A",
          pack:   bestMatch.pack   || "N/A",

          // ── Pricing ───────────────────────────────────────────────────────
          price:        bestMatch.newMrp || bestMatch.mrp || 0,
          mrp:          bestMatch.newMrp || bestMatch.mrp || 0,
          newMrp:       bestMatch.newMrp || 0,
          netValue:     bestMatch.netValue     || 0,
          taxableValue: bestMatch.taxableValue || 0,

          // ── DB STOCK ONLY ─────────────────────────────────────────────────
          qty:               bestMatch.qty || 0,   // DB stock
          stock:             bestMatch.qty || 0,   // DB stock (alias)
          availableQuantity: bestMatch.qty || 0,   // DB stock (alias)
          inStock:           (bestMatch.qty || 0) > 0,

          gstPercent: bestMatch.gstPercent || 5,
          hsnCode:    bestMatch.hsnCode    || "",
          batchNo:    bestMatch.batchNo    || "",

          // ── OCR clinical fields (per-row, never mixed) ────────────────────
          dose:          ocrMed.dose          || "",
          frequency:     ocrMed.frequency     || "",
          freqLabel:     ocrMed.frequency     || ocrMed.freqLabel || "",
          instruction:   ocrMed.instruction   || "",
          durationLabel: ocrMed.durationLabel || "",
          durationDays,
          duration:      durationDays,

          // ── PRESCRIPTION QTY ONLY (never DB stock) ────────────────────────
          prescriptionQty: ocrMed.prescriptionQty || null,
          calculatedQty:   ocrMed.calculatedQty   || null,
          quantity:        ocrMed.quantity         || ocrMed.prescriptionQty || null,
          orderQty:        ocrMed.orderQty         || ocrMed.prescriptionQty || null,
          requiredQty:     ocrMed.requiredQty      || ocrMed.prescriptionQty || null,

          // ── Match metadata ────────────────────────────────────────────────
          ocrMedicineName: ocrName,
          matchScore:      bestScore,
        });
      } else {
        console.log(`⚠️  No DB match: "${ocrName}" (best score: ${bestScore})`);
      }
    }
  } catch (err) {
    console.error("DB match error:", err.message);
  }

  return matched;
}

// ─── Save prescription file record ───────────────────────────────────────────

async function maybeSaveFile({
  userId, patientId, cloudinaryUrl, cloudinaryPublicId, mimeType, fileName, fileSize,
}) {
  if (!userId) return null;
  try {
    const fileType = mimeType?.includes("pdf") ? "pdf" : "image";
    return await UserPrescriptionFile.create({
      userId,
      patientId: patientId || null,
      cloudinaryUrl,
      publicId: cloudinaryPublicId,
      fileType,
      mimeType,
      originalFileName: fileName,
      fileSize,
    });
  } catch (err) {
    console.error("Error saving prescription file record:", err.message);
    return null;
  }
}

// ─── Main handler ─────────────────────────────────────────────────────────────

exports.extractMedicinesFromPrescription = async (req, res) => {
  // multer-storage-cloudinary: req.file.path = Cloudinary URL, req.file.filename = public_id
  const cloudinaryUrl      = req.file?.path;
  const cloudinaryPublicId = req.file?.filename;
  const mimeType           = req.file?.mimetype   || "image/jpeg";
  const fileName           = req.file?.originalname || "prescription";
  const fileSize           = req.file?.size        || 0;
  const userId             = req.body?.userId    || req.query?.userId    || null;
  const patientId          = req.body?.patientId || req.query?.patientId || null;

  if (!cloudinaryUrl) {
    return res.status(400).json({ success: false, message: "No file uploaded" });
  }

  console.log(`\n📄 Prescription upload: ${fileName} (${mimeType})`);
  console.log(`   Cloudinary URL: ${cloudinaryUrl}`);

  // ── 1. Download image buffer from Cloudinary ──────────────────────────────
  let imageBuffer;
  try {
    const dl = await axios.get(cloudinaryUrl, {
      responseType: "arraybuffer",
      timeout:      30_000,
    });
    imageBuffer = Buffer.from(dl.data);
    console.log(`✅ Downloaded ${imageBuffer.length} bytes from Cloudinary`);
  } catch (dlErr) {
    console.error("❌ Cloudinary download error:", dlErr.message);
    try { await deleteFromCloudinary(cloudinaryPublicId, "auto"); } catch {}
    return res.status(400).json({
      success: false,
      message: "Could not retrieve uploaded file. Please try again.",
    });
  }

  // ── 2. Document AI extraction ──────────────────────────────────────────────
  let extractedText      = "";
  let extractedMedicines = [];

  try {
    const docResult     = await extractPrescriptionData(imageBuffer, mimeType);
    extractedText       = docResult.extractedText;
    extractedMedicines  = docResult.medicines || [];
  } catch (docErr) {
    console.error("❌ Document AI error:", docErr.message);
    try { await deleteFromCloudinary(cloudinaryPublicId, "auto"); } catch {}
    return res.status(400).json({
      success: false,
      message:
        "Could not read the prescription. Please upload a clear, well-lit image or PDF.",
    });
  }

  console.log(`✅ Document AI: ${extractedText.length} chars, ${extractedMedicines.length} medicine(s)`);

  // ── 3. Empty text ──────────────────────────────────────────────────────────
  if (!extractedText || extractedText.trim().length === 0) {
    await maybeSaveFile({ userId, patientId, cloudinaryUrl, cloudinaryPublicId, mimeType, fileName, fileSize });
    return res.json({
      success: true,
      message: "No text found in image",
      extractedText: "",
      extractedMedicines: [],
      matchedMedicines: [],
      medicines: [],
      matchedCount: 0,
      prescriptionUrl: cloudinaryUrl,
      publicId: cloudinaryPublicId,
    });
  }

  // ── 4. No medicines extracted ──────────────────────────────────────────────
  if (extractedMedicines.length === 0) {
    await maybeSaveFile({ userId, patientId, cloudinaryUrl, cloudinaryPublicId, mimeType, fileName, fileSize });
    return res.json({
      success: true,
      message: "No medicines found in prescription",
      extractedText,
      extractedMedicines: [],
      matchedMedicines: [],
      medicines: [],
      matchedCount: 0,
      prescriptionUrl: cloudinaryUrl,
      publicId: cloudinaryPublicId,
    });
  }

  // ── 5. Match with Medicine database ───────────────────────────────────────
  console.log("🔗 Matching medicines with database…");
  const matchedMedicines = await matchMedicinesWithDatabase(extractedMedicines);
  console.log(`✅ Matched ${matchedMedicines.length} / ${extractedMedicines.length}`);

  // ── 6. Save prescription file record ──────────────────────────────────────
  const savedFile = await maybeSaveFile({
    userId, patientId, cloudinaryUrl, cloudinaryPublicId, mimeType, fileName, fileSize,
  });

  return res.json({
    success: true,
    message:
      matchedMedicines.length > 0
        ? `Found ${matchedMedicines.length} medicine(s)`
        : "No matching medicines found in our database",
    extractedText,
    extractedMedicines,
    matchedMedicines,
    medicines: matchedMedicines,
    matchedCount: matchedMedicines.length,
    prescriptionUrl:    cloudinaryUrl,
    publicId:           cloudinaryPublicId,
    prescriptionFileId: savedFile?._id || null,
    prescriptionFile: savedFile
      ? {
          _id:              savedFile._id,
          cloudinaryUrl:    savedFile.cloudinaryUrl,
          publicId:         savedFile.publicId,
          fileType:         savedFile.fileType,
          originalFileName: savedFile.originalFileName,
        }
      : null,
  });
};

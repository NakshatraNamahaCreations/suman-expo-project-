"use strict";

const axios      = require("axios");
const Medicine   = require("../models/Medicine");
const UserPrescriptionFile = require("../models/UserPrescriptionFile");
const { deleteFromCloudinary } = require("../config/cloudinary");
const { extractPrescriptionData } = require("../services/documentAiPrescription.service");

// ─── Name normaliser (strips dosage-form prefix for matching only) ─────────────

function normalizeMedicineName(text = "") {
  return String(text)
    .toUpperCase()
    .replace(/[^\w\s.%/-]/g, " ")
    .replace(
      /\b(TABLET|TAB|CAPSULE|CAP|INJECTION|INJ|CREAM|OINTMENT|SYRUP|SYP|DROP|DROPS)\b/g,
      " "
    )
    .replace(/\s+/g, " ")
    .trim();
}

// ─── Fuzzy match score 0–100 ──────────────────────────────────────────────────

const MIN_MATCH_SCORE = 50;

function getMedicineMatchScore(ocrName = "", dbName = "") {
  const ocr = normalizeMedicineName(ocrName);
  const db  = normalizeMedicineName(dbName);

  if (!ocr || !db) return 0;
  if (ocr === db)  return 100;

  const ocrTokens = ocr.split(" ").filter(Boolean);
  const dbTokens  = db.split(" ").filter(Boolean);

  if (!ocrTokens.length || !dbTokens.length) return 0;

  // First significant token must match
  if (ocrTokens[0] !== dbTokens[0]) {
    if (!ocr.includes(dbTokens[0]) && !db.includes(ocrTokens[0])) return 0;
  }

  // Token overlap score
  let common = 0;
  for (const t of ocrTokens) {
    if (dbTokens.includes(t)) common++;
  }
  const overlapScore = (common / Math.max(ocrTokens.length, dbTokens.length)) * 100;

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
        const score = getMedicineMatchScore(ocrName, dbMed.description || dbMed.name || "");
        if (score > bestScore) {
          bestScore = score;
          bestMatch = dbMed;
        }
      }

      if (bestMatch && bestScore >= MIN_MATCH_SCORE) {
        const durationDays = ocrMed.durationDays || 0;

        matched.push({
          // ── DB identity ──
          _id:        bestMatch._id.toString(),
          medicineId: bestMatch._id.toString(),

          // ── DB medicine info ──
          description: bestMatch.description,
          name:        bestMatch.description,

          mfr:    bestMatch.mfr    || "N/A",
          vendor: bestMatch.vendor || "N/A",
          pack:   bestMatch.pack   || "N/A",
          batchNo: bestMatch.batchNo || "",
          hsnCode: bestMatch.hsnCode || "",

          // ── Pricing ──
          price:        bestMatch.newMrp || 0,
          mrp:          bestMatch.newMrp || 0,
          newMrp:       bestMatch.newMrp || 0,
          netValue:     bestMatch.netValue     || 0,
          taxableValue: bestMatch.taxableValue || 0,
          gstPercent:   bestMatch.gstPercent   || 5,

          // ── DB stock (NEVER confuse with prescription qty) ──
          qty:               bestMatch.qty || 0,   // DB stock
          stock:             bestMatch.qty || 0,   // DB stock
          availableQuantity: bestMatch.qty || 0,   // DB stock
          inStock:           (bestMatch.qty || 0) > 0,

          // ── OCR prescription data ──
          dose:          ocrMed.dose          || "",
          frequency:     ocrMed.frequency     || "",
          freqLabel:     ocrMed.frequency     || ocrMed.freqLabel || "",
          instruction:   ocrMed.instruction   || "",
          durationLabel: ocrMed.durationLabel || "",
          durationDays,
          duration:      durationDays,
          qtyPerDose:    ocrMed.qtyPerDose    || 1,

          // ── Prescription order quantities (NEVER DB stock) ──
          prescriptionQty: ocrMed.prescriptionQty || null,
          calculatedQty:   ocrMed.calculatedQty   || null,
          quantity:        ocrMed.quantity         || ocrMed.prescriptionQty || ocrMed.calculatedQty || null,
          orderQty:        ocrMed.orderQty         || ocrMed.prescriptionQty || ocrMed.calculatedQty || null,
          requiredQty:     ocrMed.requiredQty      || ocrMed.prescriptionQty || ocrMed.calculatedQty || null,

          ocrMedicineName: ocrName,
          matchScore:      bestScore,
        });
      } else {
        console.log(`⚠️ No DB match: "${ocrName}" (best score ${bestScore})`);
      }
    }
  } catch (err) {
    console.error("DB match error:", err.message);
  }

  return matched;
}

// ─── Main handler ─────────────────────────────────────────────────────────────

exports.extractMedicinesFromPrescription = async (req, res) => {
  const cloudinaryUrl      = req.file?.path;
  const cloudinaryPublicId = req.file?.filename;
  const mimeType           = req.file?.mimetype     || "image/jpeg";
  const fileName           = req.file?.originalname || "prescription";
  const fileSize           = req.file?.size         || 0;
  const userId             = req.body?.userId   || req.query?.userId   || null;
  const patientId          = req.body?.patientId || req.query?.patientId || null;

  if (!cloudinaryUrl) {
    return res.status(400).json({ success: false, message: "No file uploaded" });
  }

  console.log(`\n📄 Prescription upload: ${fileName} (${mimeType})`);
  console.log(`   Cloudinary URL: ${cloudinaryUrl}`);

  // ── 1. Download image buffer from Cloudinary ────────────────────────────────
  let imageBuffer;
  try {
    const dl = await axios.get(cloudinaryUrl, { responseType: "arraybuffer", timeout: 30000 });
    imageBuffer = Buffer.from(dl.data);
    console.log(`✅ Downloaded ${imageBuffer.length} bytes from Cloudinary`);
  } catch (dlErr) {
    console.error("❌ Cloudinary download error:", dlErr.message);
    try { await deleteFromCloudinary(cloudinaryPublicId, "auto"); } catch { }
    return res.status(400).json({
      success: false,
      message: "Could not retrieve uploaded file. Please try again.",
    });
  }

  // ── 2. Document AI extraction ─────────────────────────────────────────────
  let extractedText      = "";
  let extractedMedicines = [];
  let rawTables          = [];

  try {
    const docAiResult  = await extractPrescriptionData(imageBuffer, mimeType);
    extractedText      = docAiResult.extractedText;
    extractedMedicines = docAiResult.medicines  || [];
    rawTables          = docAiResult.rawTables  || [];
  } catch (docAiErr) {
    console.error("❌ Document AI error:", docAiErr.message);
    try { await deleteFromCloudinary(cloudinaryPublicId, "auto"); } catch { }
    return res.status(400).json({
      success: false,
      message: "Could not read the prescription. Please upload a clear, well-lit image or PDF.",
    });
  }

  console.log(`\n✅ Document AI done: ${extractedText.length} chars, ${extractedMedicines.length} medicine(s)`);

  // ── 3. Handle empty text ──────────────────────────────────────────────────
  if (!extractedText || extractedText.trim().length === 0) {
    await maybeSaveFile({ userId, patientId, cloudinaryUrl, cloudinaryPublicId, mimeType, fileName, fileSize });
    return res.json({
      success: true,
      message: "No text found in image",
      extractedText: "",
      rawTables,
      extractedMedicines: [],
      matchedMedicines: [],
      medicines: [],
      matchedCount: 0,
      prescriptionUrl: cloudinaryUrl,
      publicId: cloudinaryPublicId,
    });
  }

  // ── 4. Handle no medicines ────────────────────────────────────────────────
  if (extractedMedicines.length === 0) {
    await maybeSaveFile({ userId, patientId, cloudinaryUrl, cloudinaryPublicId, mimeType, fileName, fileSize });
    return res.json({
      success: true,
      message: "No medicines found in prescription",
      extractedText,
      rawTables,
      extractedMedicines: [],
      matchedMedicines: [],
      medicines: [],
      matchedCount: 0,
      prescriptionUrl: cloudinaryUrl,
      publicId: cloudinaryPublicId,
    });
  }

  // ── 5. Match with database ────────────────────────────────────────────────
  console.log("\n🔗 Matching extracted medicines with MongoDB...");
  const matchedMedicines = await matchMedicinesWithDatabase(extractedMedicines);

  console.log(`\n✅ FINAL MATCHED MEDICINES (${matchedMedicines.length} / ${extractedMedicines.length}):`);
  matchedMedicines.forEach((m, i) => {
    console.log(`  [${i + 1}] medicine name  : "${m.description}"`);
    console.log(`       ocrName       : "${m.ocrMedicineName}"`);
    console.log(`       frequency     : ${m.frequency}`);
    console.log(`       durationLabel : ${m.durationLabel}`);
    console.log(`       durationDays  : ${m.durationDays}`);
    console.log(`       prescriptionQty: ${m.prescriptionQty}`);
    console.log(`       DB stock (qty) : ${m.qty}`);
    console.log(`       matchScore    : ${m.matchScore}`);
  });

  // ── 6. Save to user's prescription library ────────────────────────────────
  const savedFile = await maybeSaveFile({
    userId, patientId, cloudinaryUrl, cloudinaryPublicId, mimeType, fileName, fileSize,
  });

  return res.json({
    success: true,
    message: matchedMedicines.length > 0
      ? `Found ${matchedMedicines.length} medicine(s)`
      : "No matching medicines found in our database",
    extractedText,
    rawTables,
    extractedMedicines,
    matchedMedicines,
    medicines: matchedMedicines,
    matchedCount: matchedMedicines.length,
    prescriptionUrl: cloudinaryUrl,
    publicId: cloudinaryPublicId,
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

// ─── Helper ───────────────────────────────────────────────────────────────────

async function maybeSaveFile({ userId, patientId, cloudinaryUrl, cloudinaryPublicId, mimeType, fileName, fileSize }) {
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
    console.error("Error saving prescription file:", err.message);
    return null;
  }
}

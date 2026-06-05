
// const fs = require("fs");
// const axios = require("axios");
// const vision = require("@google-cloud/vision");
// const Medicine = require("../models/Medicine");
// const UserPrescriptionFile = require("../models/UserPrescriptionFile");
// const { deleteFromCloudinary } = require("../config/cloudinary");

// const client = new vision.ImageAnnotatorClient();

// /**
//  * Save prescription file info to UserPrescriptionFile collection.
//  * Called only when extraction succeeds and userId is provided.
//  */
// async function saveUserPrescriptionFile({ userId, patientId, cloudinaryUrl, publicId, mimeType, fileName, fileSize }) {
//   try {
//     const fileType = mimeType?.includes("pdf")
//       ? "pdf"
//       : mimeType?.startsWith("image/")
//         ? "image"
//         : "other";

//     const doc = await UserPrescriptionFile.create({
//       userId,
//       patientId: patientId || null,
//       cloudinaryUrl,
//       publicId,
//       fileType,
//       mimeType: mimeType || "",
//       originalFileName: fileName || "",
//       fileSize: fileSize || 0,
//     });
//     console.log(`✅ Prescription file saved for user ${userId}: ${doc._id}`);
//     return doc;
//   } catch (err) {
//     // Non-fatal — log and continue
//     console.error("⚠️ Could not save UserPrescriptionFile:", err.message);
//     return null;
//   }
// }

// exports.extractMedicinesFromPrescription = async (req, res) => {
//   let cloudinaryPublicId = null;
//   let cloudinaryUrl = null;

//   try {
//     if (!req.file) {
//       return res.status(400).json({
//         success: false,
//         message: "No file uploaded",
//       });
//     }

//     // Get file info from Cloudinary (multer-storage-cloudinary provides this)
//     cloudinaryPublicId = req.file.filename; // Cloudinary public_id
//     cloudinaryUrl = req.file.path; // Cloudinary secure URL
//     const fileName = req.file.originalname;
//     const mimeType = req.file.mimetype;
//     const fileSize = req.file.size || 0;
//     // Optional userId & patientId — when provided the file is saved to the user's prescription library
//     const userId = req.body?.userId || null;
//     const patientId = req.body?.patientId || null;

//     console.log(`\n📄 Processing: ${fileName}`);
//     console.log(`📄 MIME Type: ${mimeType}`);
//     console.log(`☁️ Cloudinary URL: ${cloudinaryUrl}`);
//     console.log(`☁️ Cloudinary Public ID: ${cloudinaryPublicId}`);

//     if (!cloudinaryUrl || !cloudinaryPublicId) {
//       return res.status(400).json({
//         success: false,
//         message: "File upload to Cloudinary failed",
//       });
//     }

//     console.log("🔍 Extracting text with Google Vision DOCUMENT_TEXT_DETECTION...");

//     // Fetch image from Cloudinary URL and convert to buffer
//     let imageBuffer;
//     try {
//       const response = await axios.get(cloudinaryUrl, {
//         responseType: "arraybuffer",
//         timeout: 30000,
//       });
//       imageBuffer = Buffer.from(response.data);
//     } catch (fetchError) {
//       console.error("❌ Error fetching file from Cloudinary:", fetchError.message);
//       // Delete from Cloudinary if fetch fails
//       try {
//         await deleteFromCloudinary(cloudinaryPublicId, "auto");
//       } catch (deleteError) {
//         console.error("Warning: Could not delete file from Cloudinary:", deleteError.message);
//       }
//       return res.status(400).json({
//         success: false,
//         message: "Failed to process the uploaded file. Please try again.",
//       });
//     }

//     if (!imageBuffer || imageBuffer.length === 0) {
//       // Delete from Cloudinary if buffer is empty
//       try {
//         await deleteFromCloudinary(cloudinaryPublicId, "auto");
//       } catch (deleteError) {
//         console.error("Warning: Could not delete empty file from Cloudinary:", deleteError.message);
//       }
//       return res.status(400).json({
//         success: false,
//         message: "Uploaded file is empty",
//       });
//     }

//     let extractedText = "";

//     try {
//       const request = {
//         image: {
//           content: imageBuffer,
//         },
//         features: [
//           {
//             type: "DOCUMENT_TEXT_DETECTION",
//           },
//         ],
//         imageContext: {
//           languageHints: ["en"],
//         },
//       };

//       const [result] = await client.annotateImage(request);

//       if (result.fullTextAnnotation && result.fullTextAnnotation.text) {
//         extractedText = result.fullTextAnnotation.text;
//       } else if (result.textAnnotations && result.textAnnotations.length > 0) {
//         extractedText = result.textAnnotations
//           .map((item) => item.description)
//           .join("\n");
//       }
//     } catch (ocrError) {
//       console.error("❌ OCR Error:", ocrError.message);

//       // Clean up from Cloudinary on OCR error
//       try {
//         await deleteFromCloudinary(cloudinaryPublicId, "auto");
//         console.log("✅ Cleaned up prescription from Cloudinary after OCR error");
//       } catch (deleteError) {
//         console.error("Warning: Could not delete file from Cloudinary:", deleteError.message);
//       }

//       return res.status(400).json({
//         success: false,
//         message: "Could not read the prescription. Please upload a clear image or PDF.",
//       });
//     }

//     if (!extractedText || extractedText.trim().length === 0) {
//       // If userId provided, save the file to user's library before any cleanup
//       let savedFileOnNoText = null;
//       if (userId) {
//         savedFileOnNoText = await saveUserPrescriptionFile({
//           userId, patientId, cloudinaryUrl, publicId: cloudinaryPublicId,
//           mimeType, fileName, fileSize,
//         });
//         console.log("📁 Saved prescription file to user library (no text found)");
//       } else {
//         // No user — clean up orphaned file from Cloudinary
//         try {
//           await deleteFromCloudinary(cloudinaryPublicId, "auto");
//           console.log("✅ Cleaned up prescription from Cloudinary (no text found, no user)");
//         } catch (deleteError) {
//           console.error("Warning: Could not delete file from Cloudinary:", deleteError.message);
//         }
//       }

//       return res.json({
//         success: true,
//         message: "No text found in image",
//         extractedText: "",
//         extractedMedicines: [],
//         matchedMedicines: [],
//         medicines: [],
//         matchedCount: 0,
//         prescriptionUrl: userId ? cloudinaryUrl : null,
//         publicId: userId ? cloudinaryPublicId : null,
//         prescriptionFileId: savedFileOnNoText?._id || null,
//         prescriptionFile: savedFileOnNoText
//           ? {
//             _id: savedFileOnNoText._id,
//             cloudinaryUrl: savedFileOnNoText.cloudinaryUrl,
//             publicId: savedFileOnNoText.publicId,
//             fileType: savedFileOnNoText.fileType,
//             originalFileName: savedFileOnNoText.originalFileName,
//           }
//           : null,
//       });
//     }

//     console.log(`✅ Extracted ${extractedText.length} characters`);
//     console.log("\n🧾 RAW OCR TEXT START");
//     console.log(extractedText);
//     console.log("🧾 RAW OCR TEXT END\n");

//     const extractedMedicines = extractMedicineRowsFromPrescription(extractedText);

//     console.log("🧾 FINAL OCR MEDICINES:", JSON.stringify(extractedMedicines, null, 2));

//     if (extractedMedicines.length === 0) {
//       // If userId provided, save the file to user's library before any cleanup
//       let savedFileOnNoMeds = null;
//       if (userId) {
//         savedFileOnNoMeds = await saveUserPrescriptionFile({
//           userId, patientId, cloudinaryUrl, publicId: cloudinaryPublicId,
//           mimeType, fileName, fileSize,
//         });
//         console.log("📁 Saved prescription file to user library (no medicines found)");
//       } else {
//         // No user — clean up orphaned file from Cloudinary
//         try {
//           await deleteFromCloudinary(cloudinaryPublicId, "auto");
//           console.log("✅ Cleaned up prescription from Cloudinary (no medicines found, no user)");
//         } catch (deleteError) {
//           console.error("Warning: Could not delete file from Cloudinary:", deleteError.message);
//         }
//       }

//       return res.json({
//         success: true,
//         message: "No medicines found",
//         extractedText,
//         extractedMedicines: [],
//         matchedMedicines: [],
//         medicines: [],
//         matchedCount: 0,
//         prescriptionUrl: userId ? cloudinaryUrl : null,
//         publicId: userId ? cloudinaryPublicId : null,
//         prescriptionFileId: savedFileOnNoMeds?._id || null,
//         prescriptionFile: savedFileOnNoMeds
//           ? {
//             _id: savedFileOnNoMeds._id,
//             cloudinaryUrl: savedFileOnNoMeds.cloudinaryUrl,
//             publicId: savedFileOnNoMeds.publicId,
//             fileType: savedFileOnNoMeds.fileType,
//             originalFileName: savedFileOnNoMeds.originalFileName,
//           }
//           : null,
//       });
//     }

//     console.log("🔗 Matching OCR medicines with database by medicine name only...");

//     const matchedMedicines = await matchMedicinesWithDatabase(extractedMedicines);

//     console.log(`✅ Matched ${matchedMedicines.length} medicines`);
//     console.log("💊 FINAL MATCHED MEDICINES:", JSON.stringify(matchedMedicines, null, 2));

//     // ── Save prescription file to user's library (if userId provided) ───────
//     let savedPrescriptionFile = null;
//     if (userId) {
//       savedPrescriptionFile = await saveUserPrescriptionFile({
//         userId,
//         patientId,
//         cloudinaryUrl,
//         publicId: cloudinaryPublicId,
//         mimeType,
//         fileName,
//         fileSize,
//       });
//     }

//     return res.json({
//       success: true,
//       message:
//         matchedMedicines.length > 0
//           ? `Found ${matchedMedicines.length} matching medicine(s)`
//           : "No matching medicines found in database",

//       extractedText,
//       extractedMedicines,
//       matchedMedicines,
//       medicines: matchedMedicines,
//       matchedCount: matchedMedicines.length,

//       // Cloudinary file information
//       prescriptionUrl: cloudinaryUrl,
//       publicId: cloudinaryPublicId,

//       // Saved prescription file reference (null if userId not provided)
//       prescriptionFileId: savedPrescriptionFile?._id || null,
//       prescriptionFile: savedPrescriptionFile
//         ? {
//           _id: savedPrescriptionFile._id,
//           cloudinaryUrl: savedPrescriptionFile.cloudinaryUrl,
//           publicId: savedPrescriptionFile.publicId,
//           fileType: savedPrescriptionFile.fileType,
//           originalFileName: savedPrescriptionFile.originalFileName,
//         }
//         : null,
//     });
//   } catch (error) {
//     console.error("❌ Prescription extraction error:", error);

//     // Try to clean up from Cloudinary on error
//     if (cloudinaryPublicId) {
//       try {
//         await deleteFromCloudinary(cloudinaryPublicId, "auto");
//         console.log("✅ Cleaned up prescription from Cloudinary after error");
//       } catch (deleteError) {
//         console.error("Warning: Could not delete file from Cloudinary:", deleteError.message);
//       }
//     }

//     return res.status(500).json({
//       success: false,
//       message: error.message || "Server error while reading prescription",
//     });
//   }
// }

// function normalizeText(text = "") {
//   return String(text)
//     .toLowerCase()
//     .trim()
//     .replace(/[^\w\s.%/-]/g, " ")
//     .replace(/\s+/g, " ")
//     .trim();
// }

// function normalizeMedicineName(text = "") {
//   return String(text)
//     .toUpperCase()
//     .replace(/[^\w\s.%/-]/g, " ")
//     .replace(
//       /\b(TABLET|TAB|CAPSULE|CAP|INJECTION|INJ|CREAM|OINTMENT|SYRUP|DROP|DROPS)\b/g,
//       " "
//     )
//     .replace(/\s+/g, " ")
//     .trim();
// }

// function cleanMedicineName(text = "") {
//   let value = String(text || "").trim();

//   value = value.replace(/^\d+[\.\)]\s*/, "");
//   value = value.replace(/\s+/g, " ");
//   value = value.replace(/[^\w\s.%/-]/g, " ");
//   value = value.replace(/\s+/g, " ").trim();

//   return value;
// }

// function cleanFrequency(value = "") {
//   if (!value) return "";

//   const text = String(value)
//     .replace(/\s+/g, "")
//     .replace(/[–—]/g, "-")
//     .replace(/\|/g, "-")
//     .replace(/_/g, "-");

//   const match = text.match(/\d-\d-\d/);

//   return match ? match[0] : "";
// }

// function cleanDurationLabel(value = "") {
//   if (!value) return "";

//   const text = String(value).replace(/\s+/g, " ").trim();

//   const match = text.match(
//     /\d+\s*(month|months|month\(s\)|day|days|day\(s\)|week|weeks|week\(s\))/i
//   );

//   if (!match) return "";

//   let result = match[0].trim();

//   result = result.replace(/months?/i, "Month(s)");
//   result = result.replace(/days?/i, "Day(s)");
//   result = result.replace(/weeks?/i, "Week(s)");

//   return result;
// }

// /**
//  * Extract the explicit Qty number written in the prescription Qty column.
//  * Prescriptions typically print: "6 Month(s) 180" where 180 is the Qty.
//  */
// function extractPrescriptionQty(block = "") {
//   const text = String(block);

//   // Pattern: number directly after duration — "6 Month(s) 180" or "15 Day(s) 15"
//   const afterDuration = text.match(
//     /(?:\d+\s*(?:month|months|month\(s\)|day|days|day\(s\)|week|weeks|week\(s\)))\s+(\d{1,4})\b/i
//   );
//   if (afterDuration) {
//     const qty = parseInt(afterDuration[1], 10);
//     if (qty > 0 && qty <= 9999) return qty;
//   }

//   // Fallback: last standalone 2-4 digit number in the block
//   const allNums = [...text.matchAll(/\b(\d{2,4})\b/g)];
//   if (allNums.length > 0) {
//     const last = parseInt(allNums[allNums.length - 1][1], 10);
//     if (last >= 10 && last <= 9999) return last;
//   }

//   return null;
// }

// function getDurationDays(durationText = "") {
//   if (!durationText) return 0;

//   if (typeof durationText === "number") return durationText;

//   const text = String(durationText).toLowerCase();
//   const numberMatch = text.match(/\d+/);
//   const number = numberMatch ? Number(numberMatch[0]) : 0;

//   if (!number) return 0;

//   if (text.includes("month")) return number * 30;
//   if (text.includes("week")) return number * 7;
//   if (text.includes("day")) return number;

//   return 0;
// }

// function cleanInstruction(value = "") {
//   if (!value) return "";

//   const text = String(value).toLowerCase();

//   if (text.includes("after food")) return "After Food";
//   if (text.includes("before food")) return "Before Food";
//   if (text.includes("after meal")) return "After Food";
//   if (text.includes("before meal")) return "Before Food";
//   if (text.includes("with food")) return "With Food";

//   return "";
// }

// function cleanDose(value = "") {
//   if (!value) return "";

//   const text = String(value).trim();

//   const tabletMatch = text.match(/\d+\s*(tablet|tab|capsule|cap)/i);

//   if (tabletMatch) {
//     const qty = tabletMatch[0].match(/\d+/)?.[0] || "1";

//     const unit = tabletMatch[0].toLowerCase().includes("cap")
//       ? "Capsule"
//       : "Tablet";

//     return `${qty} ${unit}`;
//   }

//   if (/to\s*apply/i.test(text)) return "To Apply";

//   return "";
// }

// function isHeaderOrInvalidLine(line = "") {
//   const text = line.toLowerCase();

//   const skipWords = [
//     "brand",
//     "strength",
//     "dose",
//     "frequency",
//     "instruction",
//     "duration",
//     "investigation",
//     "signature",
//     "doctor",
//     "patient",
//     "date",
//     "age",
//     "notes",
//     "footer",
//     "prescription",
//     "mobile",
//     "address",
//     "hospital",
//   ];

//   if (!line || line.trim().length < 3) return true;
//   if (skipWords.some((word) => text.includes(word))) return true;
//   if (/^\d+$/.test(line.trim())) return true;

//   return false;
// }

// function looksLikeMedicineLine(line = "") {
//   const text = line.trim();

//   if (isHeaderOrInvalidLine(text)) return false;

//   return /\b(TABLET|TAB|CAPSULE|CAP|CREAM|SYRUP|INJECTION|INJ|OINTMENT|DROP|DROPS)\b/i.test(
//     text
//   );
// }

// function extractMedicineRowsFromPrescription(text) {
//   const rawLines = text
//     .split(/\n+/)
//     .map((line) => line.trim())
//     .filter(Boolean);

//   const medicines = [];

//   for (let i = 0; i < rawLines.length; i++) {
//     const currentLine = rawLines[i];

//     if (!looksLikeMedicineLine(currentLine)) continue;

//     const nextLines = rawLines.slice(i, i + 8);
//     const block = nextLines.join(" ");

//     const medicineName = extractMedicineNameFromBlock(currentLine);
//     const dose = extractDoseFromBlock(block);
//     const frequency = extractFrequencyFromBlock(block, nextLines);
//     const instruction = extractInstructionFromBlock(block);
//     const durationLabel = extractDurationFromBlock(block, nextLines);
//     const durationDays = getDurationDays(durationLabel);
//     const prescriptionQty = extractPrescriptionQty(block);

//     if (!medicineName || medicineName.length < 3) continue;

//     const row = {
//       medicineName,
//       name: medicineName,

//       dose: dose || "",
//       frequency: frequency || "",
//       freqLabel: frequency || "",
//       instruction: instruction || "",

//       // duration is days number
//       duration: durationDays,
//       durationDays,

//       // original text from prescription
//       durationLabel: durationLabel || "",

//       // Qty as explicitly written in the prescription Qty column
//       prescriptionQty: prescriptionQty || null,
//     };

//     medicines.push(row);
//   }

//   const unique = [];

//   for (const med of medicines) {
//     const key = normalizeMedicineName(med.medicineName);

//     const exists = unique.some(
//       (item) => normalizeMedicineName(item.medicineName) === key
//     );

//     if (!exists) unique.push(med);
//   }

//   return unique;
// }

// function extractMedicineNameFromBlock(line = "") {
//   let value = cleanMedicineName(line);

//   value = value.replace(/^\d+[\.\)]\s*/, "");

//   const stopPatterns = [
//     /\s+\d+\s*(tablet|tab|capsule|cap)\b/i,
//     /\s+\d-\d-\d\b/i,
//     /\s+after\s+food\b/i,
//     /\s+before\s+food\b/i,
//     /\s+\d+\s*(month|months|day|days|week|weeks)\b/i,
//   ];

//   for (const pattern of stopPatterns) {
//     const match = value.match(pattern);

//     if (match && match.index > 0) {
//       value = value.substring(0, match.index).trim();
//     }
//   }

//   return value;
// }

// function extractDoseFromBlock(block = "") {
//   const dose = cleanDose(block);

//   if (dose) return dose;

//   if (/cream/i.test(block) && /apply/i.test(block)) return "To Apply";

//   return "";
// }

// function extractFrequencyFromBlock(block = "", lines = []) {
//   const blockFreq = cleanFrequency(block);

//   if (blockFreq) return blockFreq;

//   for (const line of lines) {
//     const freq = cleanFrequency(line);
//     if (freq) return freq;
//   }

//   return "";
// }

// function extractInstructionFromBlock(block = "") {
//   return cleanInstruction(block);
// }

// function extractDurationFromBlock(block = "", lines = []) {
//   const blockDuration = cleanDurationLabel(block);

//   if (blockDuration) return blockDuration;

//   for (const line of lines) {
//     const duration = cleanDurationLabel(line);
//     if (duration) return duration;
//   }

//   return "";
// }

// function getMedicineMatchScore(ocrName = "", dbName = "") {
//   const ocr = normalizeMedicineName(ocrName);
//   const db = normalizeMedicineName(dbName);

//   if (!ocr || !db) return 0;

//   if (ocr === db) return 100;

//   const ocrTokens = ocr.split(" ").filter(Boolean);
//   const dbTokens = db.split(" ").filter(Boolean);

//   if (!ocrTokens.length || !dbTokens.length) return 0;

//   // Main first medicine word must match.
//   // Example:
//   // OCR HEART ACT should not match HHFEXO.
//   if (ocrTokens[0] !== dbTokens[0]) {
//     return 0;
//   }

//   let common = 0;

//   for (const token of ocrTokens) {
//     if (dbTokens.includes(token)) {
//       common += 1;
//     }
//   }

//   const score = Math.round((common / ocrTokens.length) * 100);

//   return score;
// }

// async function matchMedicinesWithDatabase(extractedMedicines) {
//   const matched = [];

//   try {
//     const MIN_MATCH_SCORE = 90;

//     // Stock should not be used for matching.
//     // Low stock medicine can show if medicine name is correctly matched.
//     const dbMedicines = await Medicine.find({
//       status: "Active",
//     }).lean();

//     for (const ocrMed of extractedMedicines) {
//       const ocrName = ocrMed.medicineName || ocrMed.name || "";

//       let bestMatch = null;
//       let bestScore = 0;

//       for (const dbMed of dbMedicines) {
//         const dbName = dbMed.description || dbMed.name || "";
//         const score = getMedicineMatchScore(ocrName, dbName);

//         if (score > bestScore) {
//           bestScore = score;
//           bestMatch = dbMed;
//         }
//       }

//       if (bestMatch && bestScore >= MIN_MATCH_SCORE) {
//         const durationDays =
//           ocrMed.durationDays ||
//           getDurationDays(ocrMed.durationLabel) ||
//           0;

//         matched.push({
//           _id: bestMatch._id.toString(),
//           medicineId: bestMatch._id.toString(),

//           description: bestMatch.description,
//           name: bestMatch.description,

//           mfr: bestMatch.mfr || "N/A",
//           vendor: bestMatch.vendor || "N/A",
//           pack: bestMatch.pack || "N/A",

//           price: bestMatch.newMrp || bestMatch.price || 0,
//           mrp: bestMatch.newMrp || bestMatch.mrp || 0,

//           // Stock is only display info, not matching condition
//           qty: bestMatch.qty || 0,
//           stock: bestMatch.qty || 0,
//           inStock: (bestMatch.qty || 0) > 0,

//           gstPercent: bestMatch.gstPercent || 5,

//           dose: ocrMed.dose || "",
//           frequency: ocrMed.frequency || "",
//           freqLabel: ocrMed.frequency || "",
//           instruction: ocrMed.instruction || "",

//           // Duration in days
//           duration: durationDays,
//           durationDays,

//           // Original OCR duration text
//           durationLabel: ocrMed.durationLabel || "",

//           // Qty directly from the prescription's Qty column (null if not found)
//           prescriptionQty: ocrMed.prescriptionQty || null,

//           ocrMedicineName: ocrName,
//           matchScore: bestScore,
//         });
//       } else {
//         console.log(
//           `⚠️ Medicine not matched with DB: ${ocrName} | Best score: ${bestScore}`
//         );
//       }
//     }
//   } catch (error) {
//     console.error("Database error:", error.message);
//   }

//   return matched;
// }


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

    console.log("🔍 Extracting text with Google Vision DOCUMENT_TEXT_DETECTION...");

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
        console.error("Warning: Could not delete file from Cloudinary:", deleteError.message);
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
        console.error("Warning: Could not delete empty file from Cloudinary:", deleteError.message);
      }

      return res.status(400).json({
        success: false,
        message: "Uploaded file is empty",
      });
    }

    let extractedText = "";

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
        console.error("Warning: Could not delete file from Cloudinary:", deleteError.message);
      }

      return res.status(400).json({
        success: false,
        message: "Could not read the prescription. Please upload a clear image or PDF.",
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

        console.log("📁 Saved prescription file to user library (no text found)");
      } else {
        try {
          await deleteFromCloudinary(cloudinaryPublicId, "auto");
          console.log("✅ Cleaned up prescription from Cloudinary (no text found, no user)");
        } catch (deleteError) {
          console.error("Warning: Could not delete file from Cloudinary:", deleteError.message);
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

    const extractedMedicines = extractMedicineRowsFromPrescription(extractedText);

    console.log("🧾 FINAL OCR MEDICINES:", JSON.stringify(extractedMedicines, null, 2));

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

        console.log("📁 Saved prescription file to user library (no medicines found)");
      } else {
        try {
          await deleteFromCloudinary(cloudinaryPublicId, "auto");
          console.log("✅ Cleaned up prescription from Cloudinary (no medicines found, no user)");
        } catch (deleteError) {
          console.error("Warning: Could not delete file from Cloudinary:", deleteError.message);
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
    console.log("💊 FINAL MATCHED MEDICINES:", JSON.stringify(matchedMedicines, null, 2));

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
        console.error("Warning: Could not delete file from Cloudinary:", deleteError.message);
      }
    }

    return res.status(500).json({
      success: false,
      message: error.message || "Server error while reading prescription",
    });
  }
};

/* -------------------------------------------------------------------------- */
/*                            TEXT CLEANING HELPERS                           */
/* -------------------------------------------------------------------------- */

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

function parseDoseCount(doseText = "") {
  const text = String(doseText || "").toLowerCase();
  const match = text.match(/(\d+)\s*(tablet|tab|capsule|cap)/i);
  return match ? Number(match[1]) || 1 : 1;
}

function getFrequencyPerDay(freq = "") {
  const cleaned = cleanFrequency(freq);

  if (!cleaned) return 0;

  const parts = cleaned.split("-").map((n) => Number(n) || 0);

  return (parts[0] || 0) + (parts[1] || 0) + (parts[2] || 0);
}

function calculatePrescriptionQty({ dose, frequency, durationLabel, directQty }) {
  const direct = Number(directQty);

  if (direct > 0 && direct <= 9999) {
    return direct;
  }

  const doseCount = parseDoseCount(dose);
  const perDay = getFrequencyPerDay(frequency);
  const durationDays = getDurationDays(durationLabel);

  if (!doseCount || !perDay || !durationDays) return null;

  return doseCount * perDay * durationDays;
}

/* -------------------------------------------------------------------------- */
/*                         FIXED PRESCRIPTION PARSING                         */
/* -------------------------------------------------------------------------- */

function getPrescriptionRxSection(text = "") {
  const raw = String(text || "");

  const startIndex = raw.search(/\bRx\b/i);
  const endIndex = raw.search(
    /Investigation|Investigation Results|Next followup|Next follow up|signature|doctor/i
  );

  if (startIndex >= 0 && endIndex > startIndex) {
    return raw.slice(startIndex, endIndex);
  }

  if (startIndex >= 0) {
    return raw.slice(startIndex);
  }

  return raw;
}

function isHeaderOrInvalidLine(line = "") {
  const text = String(line || "").toLowerCase();

  const skipWords = [
    "brand",
    "strength",
    "dose",
    "frequency",
    "instruction",
    "duration",
    "qty",
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
  ];

  if (!line || line.trim().length < 3) return true;
  if (skipWords.some((word) => text.includes(word))) return true;
  if (/^\d+$/.test(line.trim())) return true;

  return false;
}

function looksLikeMedicineLine(line = "") {
  const text = String(line || "").trim();

  if (isHeaderOrInvalidLine(text)) return false;

  return /\b(TABLET|TAB|CAPSULE|CAP|CREAM|SYRUP|INJECTION|INJ|OINTMENT|DROP|DROPS)\b/i.test(
    text
  );
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

function extractAllMedicineNames(rxText = "") {
  const rawLines = String(rxText || "")
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);

  const names = [];

  for (const line of rawLines) {
    if (!looksLikeMedicineLine(line)) continue;

    const name = extractMedicineNameFromBlock(line);

    if (name && name.length >= 3) {
      names.push(name);
    }
  }

  return names;
}

function extractAllDoses(rxText = "") {
  const matches = [
    ...String(rxText || "").matchAll(/\b(\d+\s*(?:Tablet|Tab|Capsule|Cap))\b/gi),
  ];

  return matches.map((m) => cleanDose(m[1]) || m[1]);
}

function extractAllFrequencies(rxText = "") {
  const matches = [
    ...String(rxText || "").matchAll(
      /\b([0-9]\s*[-–—]\s*[0-9]\s*[-–—]\s*[0-9])\b/g
    ),
  ];

  return matches.map((m) =>
    m[1]
      .replace(/\s+/g, "")
      .replace(/[–—]/g, "-")
  );
}

function extractAllInstructions(rxText = "") {
  const text = String(rxText || "");
  const matches = [...text.matchAll(/\b(After Food|Before Food|With Food)\b/gi)];

  return matches.map((m) => cleanInstruction(m[1]));
}

function extractAllDurationsWithQty(rxText = "") {
  const text = String(rxText || "");

  const matches = [
    ...text.matchAll(
      /\b(\d+\s*(?:Month\(s\)|Months?|Day\(s\)|Days?|Week\(s\)|Weeks?))\s+(\d{1,4})?\b/gi
    ),
  ];

  return matches.map((m) => {
    const durationLabel = cleanDurationLabel(m[1]);
    const prescriptionQty = m[2] ? Number(m[2]) : null;

    return {
      durationLabel,
      durationDays: getDurationDays(durationLabel),
      prescriptionQty:
        prescriptionQty && prescriptionQty > 0 && prescriptionQty <= 9999
          ? prescriptionQty
          : null,
    };
  });
}

function extractMedicineRowsFromPrescription(text) {
  const rxText = getPrescriptionRxSection(text);

  const medicineNames = extractAllMedicineNames(rxText);
  const doses = extractAllDoses(rxText);
  const frequencies = extractAllFrequencies(rxText);
  const instructions = extractAllInstructions(rxText);
  const durations = extractAllDurationsWithQty(rxText);

  console.log("📌 Parsed table columns:");
  console.log("Medicine Names:", medicineNames);
  console.log("Doses:", doses);
  console.log("Frequencies:", frequencies);
  console.log("Instructions:", instructions);
  console.log("Durations:", durations);

  const medicines = medicineNames.map((medicineName, index) => {
    const dose = doses[index] || "1 Tablet";
    const frequency = frequencies[index] || "";
    const instruction = instructions[index] || "";
    const durationData = durations[index] || {};

    const durationLabel = durationData.durationLabel || "";
    const durationDays =
      durationData.durationDays || getDurationDays(durationLabel) || 0;

    const prescriptionQty = calculatePrescriptionQty({
      dose,
      frequency,
      durationLabel,
      directQty: durationData.prescriptionQty,
    });

    return {
      medicineName,
      name: medicineName,

      dose,
      frequency,
      freqLabel: frequency,
      instruction,

      duration: durationDays,
      durationDays,
      durationLabel,

      prescriptionQty,
      totalQty: prescriptionQty,
      calculatedQty: prescriptionQty,
    };
  });

  const unique = [];

  for (const med of medicines) {
    const key = normalizeMedicineName(med.medicineName);

    const exists = unique.some(
      (item) => normalizeMedicineName(item.medicineName) === key
    );

    if (!exists) unique.push(med);
  }

  console.log("✅ FIXED EXTRACTED MEDICINES:", JSON.stringify(unique, null, 2));

  return unique;
}

/* -------------------------------------------------------------------------- */
/*                              DATABASE MATCHING                             */
/* -------------------------------------------------------------------------- */

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
          ocrMed.durationDays ||
          getDurationDays(ocrMed.durationLabel) ||
          0;

        const finalPrescriptionQty =
          ocrMed.prescriptionQty ||
          ocrMed.totalQty ||
          ocrMed.calculatedQty ||
          null;

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
          netValue: bestMatch.netValue || bestMatch.newMrp || bestMatch.price || 0,
          sellingPrice:
            bestMatch.sellingPrice ||
            bestMatch.netValue ||
            bestMatch.newMrp ||
            bestMatch.price ||
            0,

          qty: bestMatch.qty || 0,
          stock: bestMatch.qty || 0,
          availableQuantity: bestMatch.qty || 0,
          availableQty: bestMatch.qty || 0,
          inStock: (bestMatch.qty || 0) > 0,

          gstPercent: bestMatch.gstPercent || 5,

          dose: ocrMed.dose || "",
          frequency: ocrMed.frequency || "",
          freqLabel: ocrMed.frequency || "",
          instruction: ocrMed.instruction || "",

          duration: durationDays,
          durationDays,
          durationLabel: ocrMed.durationLabel || "",

          prescriptionQty: finalPrescriptionQty,
          totalQty: finalPrescriptionQty,
          calculatedQty: finalPrescriptionQty,

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

// const fs = require("fs");
// const vision = require("@google-cloud/vision");
// const Medicine = require("../models/Medicine");

// const client = new vision.ImageAnnotatorClient();

// exports.extractMedicinesFromPrescription = async (req, res) => {
//   let filePath = null;

//   try {
//     if (!req.file) {
//       return res.status(400).json({ success: false, message: "No file uploaded" });
//     }

//     filePath = req.file.path;
//     const fileName = req.file.originalname;
//     const mimeType = req.file.mimetype;

//     console.log(`\n📄 Processing: ${fileName}`);

//     // Validate file
//     if (!fs.existsSync(filePath)) {
//       return res.status(400).json({ success: false, message: "File not found" });
//     }

//     const stats = fs.statSync(filePath);
//     if (stats.size === 0) {
//       if (filePath) fs.unlinkSync(filePath);
//       return res.status(400).json({ success: false, message: "File is empty" });
//     }

//     // Extract text using Google Vision
//     console.log("🔍 Extracting text with Google Vision OCR...");
//     const imageBuffer = fs.readFileSync(filePath);

//     let extractedText = "";
//     try {
//       const request = {
//         image: { content: imageBuffer },
//         features: [{ type: "TEXT_DETECTION" }],
//       };

//       const [result] = await client.annotateImage(request);

//       if (result.fullTextAnnotation && result.fullTextAnnotation.text) {
//         extractedText = result.fullTextAnnotation.text;
//       } else if (result.textAnnotations && result.textAnnotations.length > 0) {
//         extractedText = result.textAnnotations.map(t => t.description).join("\n");
//       }
//     } catch (ocrError) {
//       console.error("OCR Error:", ocrError.message);
//       if (filePath) fs.unlinkSync(filePath);
//       return res.status(400).json({ success: false, message: "Could not read the prescription. Please upload a clear image or PDF." });
//     }

//     if (!extractedText || extractedText.trim().length === 0) {
//       if (filePath) fs.unlinkSync(filePath);
//       return res.json({ success: true, message: "No text found in image", extractedText: "", matchedMedicines: [], matchedCount: 0 });
//     }

//     console.log(`✅ Extracted ${extractedText.length} characters`);

//     // Extract medicine names
//     const medicineNames = extractMedicineNames(extractedText);
//     console.log(`💊 Found ${medicineNames.length} medicine names`);

//     if (medicineNames.length === 0) {
//       if (filePath) fs.unlinkSync(filePath);
//       return res.json({ success: true, message: "No medicines found", extractedText, matchedMedicines: [], matchedCount: 0 });
//     }

//     // Match with database
//     console.log("🔗 Matching with database...");
//     const matchedMedicines = await matchMedicinesWithDatabase(medicineNames);
//     console.log(`✅ Matched ${matchedMedicines.length} medicines`);

//     // Cleanup
//     if (filePath && fs.existsSync(filePath)) fs.unlinkSync(filePath);

//     return res.json({
//       success: true,
//       message: matchedMedicines.length > 0 ? `Found ${matchedMedicines.length} medicine(s)` : "No matching medicines found",
//       extractedText,
//       extractedMedicines: medicineNames,
//       matchedMedicines,
//       matchedCount: matchedMedicines.length,
//     });
//   } catch (error) {
//     console.error("Error:", error.message);
//     if (filePath && fs.existsSync(filePath)) fs.unlinkSync(filePath);
//     return res.status(500).json({ success: false, message: "Server error" });
//   }
// };

// function normalizeText(text) {
//   return text.toLowerCase().trim().replace(/\s+/g, " ").replace(/[^\w\s]/g, "").trim();
// }

// function extractMedicineNames(text) {
//   const lines = text.split("\n");
//   const medicines = [];
//   const skipWords = ["investigation", "signature", "doctor", "patient", "date", "age", "notes", "footer"];

//   for (const line of lines) {
//     let med = line.trim();

//     if (!med || med.length < 3) continue;
//     if (skipWords.some(w => med.toLowerCase().includes(w))) continue;
//     if (/^\d+$/.test(med)) continue;

//     // Remove numbering
//     med = med.replace(/^\d+[\.\)]\s*/, "");

//     // Extract medicine name before dosage/quantity/frequency
//     med = med.split(/\s+(\d+-\d+-\d+|\d+\s*(tablet|capsule|mg|ml|gm|drop|days?|weeks?|morning|evening|night|bd|td|od))/i)[0];

//     med = med.trim().replace(/[^\w\s\-]/g, "").trim();

//     if (med && med.length >= 3 && /[a-zA-Z]/.test(med) && !medicines.includes(med)) {
//       medicines.push(med);
//     }
//   }

//   return medicines;
// }

// async function matchMedicinesWithDatabase(medicineNames) {
//   const matched = [];

//   try {
//     const dbMedicines = await Medicine.find({ status: "Active" }).lean();

//     for (const name of medicineNames) {
//       const normalized = normalizeText(name);

//       const dbMed = dbMedicines.find(m => normalizeText(m.description) === normalized);

//       if (dbMed) {
//         matched.push({
//           _id: dbMed._id.toString(),
//           medicineId: dbMed._id.toString(),
//           description: dbMed.description,
//           name: dbMed.description,
//           mfr: dbMed.mfr || "N/A",
//           vendor: dbMed.vendor || "N/A",
//           pack: dbMed.pack || "N/A",
//           price: dbMed.newMrp || 0,
//           mrp: dbMed.newMrp || 0,
//           qty: dbMed.qty || 0,
//           inStock: (dbMed.qty || 0) > 0,
//           gstPercent: dbMed.gstPercent || 5,
//         });
//       }
//     }
//   } catch (error) {
//     console.error("Database error:", error.message);
//   }

//   return matched;
// }


// const fs = require("fs");
// const vision = require("@google-cloud/vision");
// const Medicine = require("../models/Medicine");

// const client = new vision.ImageAnnotatorClient();

// exports.extractMedicinesFromPrescription = async (req, res) => {
//   let filePath = null;

//   try {
//     if (!req.file) {
//       return res.status(400).json({
//         success: false,
//         message: "No file uploaded",
//       });
//     }

//     filePath = req.file.path;
//     const fileName = req.file.originalname;
//     const mimeType = req.file.mimetype;

//     console.log(`\n📄 Processing: ${fileName}`);
//     console.log(`📄 MIME Type: ${mimeType}`);

//     if (!fs.existsSync(filePath)) {
//       return res.status(400).json({
//         success: false,
//         message: "File not found",
//       });
//     }

//     const stats = fs.statSync(filePath);

//     if (stats.size === 0) {
//       safeDeleteFile(filePath);
//       return res.status(400).json({
//         success: false,
//         message: "File is empty",
//       });
//     }

//     console.log("🔍 Extracting text with Google Vision DOCUMENT_TEXT_DETECTION...");

//     const imageBuffer = fs.readFileSync(filePath);

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

//       safeDeleteFile(filePath);

//       return res.status(400).json({
//         success: false,
//         message:
//           "Could not read the prescription. Please upload a clear image or PDF.",
//       });
//     }

//     if (!extractedText || extractedText.trim().length === 0) {
//       safeDeleteFile(filePath);

//       return res.json({
//         success: true,
//         message: "No text found in image",
//         extractedText: "",
//         extractedMedicines: [],
//         matchedMedicines: [],
//         matchedCount: 0,
//       });
//     }

//     console.log(`✅ Extracted ${extractedText.length} characters`);
//     console.log("\n🧾 RAW OCR TEXT START");
//     console.log(extractedText);
//     console.log("🧾 RAW OCR TEXT END\n");

//     const extractedMedicines = extractMedicineRowsFromPrescription(extractedText);

//     console.log(
//       "🧾 FINAL OCR MEDICINES:",
//       JSON.stringify(extractedMedicines, null, 2)
//     );

//     if (extractedMedicines.length === 0) {
//       safeDeleteFile(filePath);

//       return res.json({
//         success: true,
//         message: "No medicines found",
//         extractedText,
//         extractedMedicines: [],
//         matchedMedicines: [],
//         matchedCount: 0,
//       });
//     }

//     console.log("🔗 Matching with database...");

//     const matchedMedicines = await matchMedicinesWithDatabase(extractedMedicines);

//     console.log(`✅ Matched ${matchedMedicines.length} medicines`);
//     console.log(
//       "💊 FINAL MATCHED MEDICINES:",
//       JSON.stringify(matchedMedicines, null, 2)
//     );

//     safeDeleteFile(filePath);

//     return res.json({
//       success: true,
//       message:
//         matchedMedicines.length > 0
//           ? `Found ${matchedMedicines.length} medicine(s)`
//           : "No matching medicines found",
//       extractedText,
//       extractedMedicines,
//       matchedMedicines,
//       matchedCount: matchedMedicines.length,
//     });
//   } catch (error) {
//     console.error("❌ Prescription extraction error:", error);

//     safeDeleteFile(filePath);

//     return res.status(500).json({
//       success: false,
//       message: error.message || "Server error while reading prescription",
//     });
//   }
// };

// function safeDeleteFile(filePath) {
//   try {
//     if (filePath && fs.existsSync(filePath)) {
//       fs.unlinkSync(filePath);
//     }
//   } catch (error) {
//     console.error("File delete error:", error.message);
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
//     .replace(/\b(TAB|TABLET|CAP|CAPSULE|INJ|INJECTION|CREAM|OINTMENT|SYRUP|DROP|DROPS)\b/g, " ")
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

// function cleanDuration(value = "") {
//   if (!value) return "";

//   let text = String(value)
//     .replace(/\s+/g, " ")
//     .trim();

//   const match = text.match(/\d+\s*(month|months|month\(s\)|day|days|day\(s\)|week|weeks|week\(s\))/i);

//   if (!match) return "";

//   let result = match[0].trim();

//   result = result.replace(/months?/i, "Month(s)");
//   result = result.replace(/days?/i, "Day(s)");
//   result = result.replace(/weeks?/i, "Week(s)");

//   return result;
// }

// function getDurationDays(durationText = "") {
//   if (!durationText) return 0;

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
//     const duration = extractDurationFromBlock(block, nextLines);

//     if (!medicineName || medicineName.length < 3) continue;

//     const row = {
//       medicineName,
//       name: medicineName,
//       dose: dose || "",
//       frequency: frequency || "",
//       instruction: instruction || "",
//       duration: duration || "",
//       durationDays: getDurationDays(duration),
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
//   const blockDuration = cleanDuration(block);

//   if (blockDuration) return blockDuration;

//   for (const line of lines) {
//     const duration = cleanDuration(line);
//     if (duration) return duration;
//   }

//   return "";
// }

// function getMedicineMatchScore(ocrName = "", dbName = "") {
//   const a = normalizeMedicineName(ocrName);
//   const b = normalizeMedicineName(dbName);

//   if (!a || !b) return 0;

//   if (a === b) return 100;

//   if (a.includes(b) || b.includes(a)) return 90;

//   const aTokens = a.split(" ").filter((token) => token.length > 1);
//   const bTokens = b.split(" ").filter((token) => token.length > 1);

//   let common = 0;

//   for (const token of aTokens) {
//     if (bTokens.includes(token)) {
//       common += 1;
//     }
//   }

//   const maxTokens = Math.max(aTokens.length, bTokens.length);

//   if (!maxTokens) return 0;

//   return Math.round((common / maxTokens) * 100);
// }

// async function matchMedicinesWithDatabase(extractedMedicines) {
//   const matched = [];

//   try {
//     const dbMedicines = await Medicine.find({ status: "Active" }).lean();

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

//       if (bestMatch && bestScore >= 60) {
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
//           qty: bestMatch.qty || 0,
//           stock: bestMatch.qty || 0,
//           inStock: (bestMatch.qty || 0) > 0,
//           gstPercent: bestMatch.gstPercent || 5,

//           dose: ocrMed.dose || "",
//           frequency: ocrMed.frequency || "",
//           freqLabel: ocrMed.frequency || "",
//           instruction: ocrMed.instruction || "",
//           duration: ocrMed.duration || "",
//           durationLabel: ocrMed.duration || "",
//           durationDays: ocrMed.durationDays || getDurationDays(ocrMed.duration),

//           ocrMedicineName: ocrName,
//           matchScore: bestScore,
//         });
//       } else {
//         console.log(`⚠️ No DB match for OCR medicine: ${ocrName}`);
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
 * Called only when extraction succeeds and userId is provided.
 */
async function saveUserPrescriptionFile({ userId, patientId, cloudinaryUrl, publicId, mimeType, fileName, fileSize }) {
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
    // Non-fatal — log and continue
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

    // Get file info from Cloudinary (multer-storage-cloudinary provides this)
    cloudinaryPublicId = req.file.filename; // Cloudinary public_id
    cloudinaryUrl = req.file.path; // Cloudinary secure URL
    const fileName = req.file.originalname;
    const mimeType = req.file.mimetype;
    const fileSize = req.file.size || 0;
    // Optional userId & patientId — when provided the file is saved to the user's prescription library
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

    // Fetch image from Cloudinary URL and convert to buffer
    let imageBuffer;
    try {
      const response = await axios.get(cloudinaryUrl, {
        responseType: "arraybuffer",
        timeout: 30000,
      });
      imageBuffer = Buffer.from(response.data);
    } catch (fetchError) {
      console.error("❌ Error fetching file from Cloudinary:", fetchError.message);
      // Delete from Cloudinary if fetch fails
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
      // Delete from Cloudinary if buffer is empty
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
    let visionFullTextAnnotation = null;

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

      // Store full annotation (includes per-word bounding boxes for spatial extraction)
      visionFullTextAnnotation = result.fullTextAnnotation || null;

      if (result.fullTextAnnotation && result.fullTextAnnotation.text) {
        extractedText = result.fullTextAnnotation.text;
      } else if (result.textAnnotations && result.textAnnotations.length > 0) {
        extractedText = result.textAnnotations
          .map((item) => item.description)
          .join("\n");
      }
    } catch (ocrError) {
      console.error("❌ OCR Error:", ocrError.message);

      // Clean up from Cloudinary on OCR error
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
      // If userId provided, save the file to user's library before any cleanup
      let savedFileOnNoText = null;
      if (userId) {
        savedFileOnNoText = await saveUserPrescriptionFile({
          userId, patientId, cloudinaryUrl, publicId: cloudinaryPublicId,
          mimeType, fileName, fileSize,
        });
        console.log("📁 Saved prescription file to user library (no text found)");
      } else {
        // No user — clean up orphaned file from Cloudinary
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

    // Spatial extraction uses actual bounding-box positions → each medicine gets
    // only its own row's frequency/duration/qty.  Fall back to text-only if it
    // finds fewer than 3 medicines (e.g., older image without usable bounding boxes).
    let extractedMedicines =
      (visionFullTextAnnotation &&
        extractMedicineRowsFromPrescriptionSpatial(visionFullTextAnnotation)) ||
      extractMedicineRowsFromPrescription(extractedText);

    console.log("🧾 FINAL OCR MEDICINES:", JSON.stringify(extractedMedicines, null, 2));

    if (extractedMedicines.length === 0) {
      // If userId provided, save the file to user's library before any cleanup
      let savedFileOnNoMeds = null;
      if (userId) {
        savedFileOnNoMeds = await saveUserPrescriptionFile({
          userId, patientId, cloudinaryUrl, publicId: cloudinaryPublicId,
          mimeType, fileName, fileSize,
        });
        console.log("📁 Saved prescription file to user library (no medicines found)");
      } else {
        // No user — clean up orphaned file from Cloudinary
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

    // ── Save prescription file to user's library (if userId provided) ───────
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

      // Cloudinary file information
      prescriptionUrl: cloudinaryUrl,
      publicId: cloudinaryPublicId,

      // Saved prescription file reference (null if userId not provided)
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

    // Try to clean up from Cloudinary on error
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
}

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

/**
 * Extract the explicit Qty number written in the prescription Qty column.
 * Prescriptions typically print: "6 Month(s) 180" where 180 is the Qty.
 */
function extractPrescriptionQty(block = "") {
  const text = String(block);

  // Pattern: number directly after duration — "6 Month(s) 180" or "15 Day(s) 15"
  const afterDuration = text.match(
    /(?:\d+\s*(?:month|months|month\(s\)|day|days|day\(s\)|week|weeks|week\(s\)))\s+(\d{1,4})\b/i
  );
  if (afterDuration) {
    const qty = parseInt(afterDuration[1], 10);
    if (qty > 0 && qty <= 9999) return qty;
  }

  // Fallback: last standalone 2-4 digit number in the block
  const allNums = [...text.matchAll(/\b(\d{2,4})\b/g)];
  if (allNums.length > 0) {
    const last = parseInt(allNums[allNums.length - 1][1], 10);
    if (last >= 10 && last <= 9999) return last;
  }

  return null;
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

// ─── Spatial (bounding-box) extraction ────────────────────────────────────────

function extractWordsWithPositions(fullTextAnnotation) {
  const words = [];
  if (!fullTextAnnotation || !fullTextAnnotation.pages) return words;
  for (const page of fullTextAnnotation.pages) {
    for (const block of (page.blocks || [])) {
      for (const paragraph of (block.paragraphs || [])) {
        for (const word of (paragraph.words || [])) {
          if (!word.boundingBox || !word.boundingBox.vertices) continue;
          const verts = word.boundingBox.vertices;
          const xs = verts.map((v) => v.x || 0);
          const ys = verts.map((v) => v.y || 0);
          const xMin = Math.min(...xs);
          const yMin = Math.min(...ys);
          const xMax = Math.max(...xs);
          const yMax = Math.max(...ys);
          const text = (word.symbols || []).map((s) => s.text || "").join("");
          if (text.trim()) {
            words.push({
              text,
              x: xMin,
              y: yMin,
              width: xMax - xMin,
              height: yMax - yMin,
              midY: (yMin + yMax) / 2,
            });
          }
        }
      }
    }
  }
  return words;
}

function groupWordsIntoRowObjects(words, yTolerance) {
  const sorted = [...words].sort((a, b) => a.midY - b.midY);
  const rows = [];

  for (const word of sorted) {
    let matched = false;
    for (let r = rows.length - 1; r >= 0; r--) {
      // Compare against anchorY (first word's Y), NOT a running average.
      // Running averages drift and cascade-merge adjacent table rows.
      if (Math.abs(word.midY - rows[r].anchorY) <= yTolerance) {
        rows[r].words.push(word);
        matched = true;
        break;
      }
    }
    if (!matched) {
      rows.push({ anchorY: word.midY, words: [word] });
    }
  }

  return rows.map((row) => {
    const sortedWords = row.words.sort((a, b) => a.x - b.x);
    return {
      anchorY: row.anchorY,
      words: sortedWords,
      text: sortedWords.map((w) => w.text).join(" "),
    };
  });
}

/**
 * Primary extraction: uses Google Vision bounding-box data to group words into
 * their actual table rows, then extracts frequency/duration/qty from each row.
 * Returns null if fewer than 3 medicines found (triggers text-based fallback).
 */
function extractMedicineRowsFromPrescriptionSpatial(fullTextAnnotation) {
  const words = extractWordsWithPositions(fullTextAnnotation);
  if (!words.length) return null;

  // Adaptive row-height tolerance based on median word height
  const heights = words
    .map((w) => w.height)
    .filter((h) => h > 0)
    .sort((a, b) => a - b);
  const medianH = heights[Math.floor(heights.length / 2)] || 20;
  const tightT = Math.max(medianH * 0.8, 10);

  const rows = groupWordsIntoRowObjects(words, tightT);
  const medicines = [];

  for (const row of rows) {
    const rowText = row.text;
    if (!looksLikeMedicineLine(rowText)) continue;

    const medicineName = extractMedicineNameFromBlock(rowText);
    if (!medicineName || medicineName.length < 3) continue;

    // Reject rows where the name still looks like investigation/non-medicine content
    // (date in name, lab decimal values, or suspiciously long combined name)
    const isGarbled =
      medicineName.length > 60 ||
      /\d{1,2}\/\d{1,2}\/\d{2,4}/.test(medicineName) ||
      /\d{2,}[.,]\d{2,}/.test(medicineName) ||
      /(HEMOGLOBIN|LEUKOCYTES|CREATININE|HBA1C|INVESTIGATION)/i.test(medicineName);
    if (isGarbled) {
      console.log(`⚠️ Skipping garbled spatial row: "${medicineName.substring(0, 50)}..."`);
      continue;
    }

    // All fields come from the SAME spatial row — no cross-row contamination
    const dose = extractDoseFromBlock(rowText);
    const frequency = extractFrequencyFromBlock(rowText, [rowText]);
    const instruction = extractInstructionFromBlock(rowText);
    const durationLabel = extractDurationFromBlock(rowText, [rowText]);
    const durationDays = getDurationDays(durationLabel);
    const prescriptionQty = extractPrescriptionQty(rowText);

    medicines.push({
      medicineName,
      name: medicineName,
      dose: dose || "",
      frequency: frequency || "",
      freqLabel: frequency || "",
      instruction: instruction || "",
      duration: durationDays,
      durationDays,
      durationLabel: durationLabel || "",
      prescriptionQty: prescriptionQty || null,
    });
  }

  const unique = [];
  for (const med of medicines) {
    const key = normalizeMedicineName(med.medicineName);
    if (!unique.some((item) => normalizeMedicineName(item.medicineName) === key)) {
      unique.push(med);
    }
  }

  console.log(`🔲 Spatial extraction found ${unique.length} medicine rows`);
  return unique.length >= 3 ? unique : null;
}

// ─── Text-based extraction (fallback) ─────────────────────────────────────────

function extractMedicineRowsFromPrescription(text) {
  const rawLines = text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);

  const medicines = [];

  for (let i = 0; i < rawLines.length; i++) {
    const currentLine = rawLines[i];

    if (!looksLikeMedicineLine(currentLine)) continue;

    // Limit to current line + 1 next line only — wider windows contaminate
    // this medicine's data with the next medicine's frequency/duration/qty
    const nextLines = rawLines.slice(i, i + 2);
    const block = nextLines.join(" ");

    const medicineName = extractMedicineNameFromBlock(currentLine);
    const dose = extractDoseFromBlock(block);
    const frequency = extractFrequencyFromBlock(block, nextLines);
    const instruction = extractInstructionFromBlock(block);
    const durationLabel = extractDurationFromBlock(block, nextLines);
    const durationDays = getDurationDays(durationLabel);
    const prescriptionQty = extractPrescriptionQty(block);

    if (!medicineName || medicineName.length < 3) continue;

    const row = {
      medicineName,
      name: medicineName,

      dose: dose || "",
      frequency: frequency || "",
      freqLabel: frequency || "",
      instruction: instruction || "",

      // duration is days number
      duration: durationDays,
      durationDays,

      // original text from prescription
      durationLabel: durationLabel || "",

      // Qty as explicitly written in the prescription Qty column
      prescriptionQty: prescriptionQty || null,
    };

    medicines.push(row);
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

function extractMedicineNameFromBlock(line = "") {
  let value = cleanMedicineName(line);

  value = value.replace(/^\d+[\.\)]\s*/, "");

  const stopPatterns = [
    /\s+\d+\s*(tablet|tab|capsule|cap)\b/i,
    /\s+\d-\d-\d\b/i,
    /\s+after\s+food\b/i,
    /\s+before\s+food\b/i,
    /\s+\d+\s*(month|months|day|days|week|weeks)\b/i,
    // Investigation / lab-result markers that bleed into the last table row
    /\s+\d{1,2}\/\d{1,2}\/\d{2,4}\b/,  // date  e.g. 01/04/2026
    /[\s-]+\d{2,}[.,]\d{2,}/,            // decimal value e.g. 13.80, 9900.00
  ];

  for (const pattern of stopPatterns) {
    const match = value.match(pattern);

    if (match && match.index > 0) {
      value = value.substring(0, match.index).trim();
    }
  }

  return value;
}

function extractDoseFromBlock(block = "") {
  const dose = cleanDose(block);

  if (dose) return dose;

  if (/cream/i.test(block) && /apply/i.test(block)) return "To Apply";

  return "";
}

function extractFrequencyFromBlock(block = "", lines = []) {
  const blockFreq = cleanFrequency(block);

  if (blockFreq) return blockFreq;

  for (const line of lines) {
    const freq = cleanFrequency(line);
    if (freq) return freq;
  }

  return "";
}

function extractInstructionFromBlock(block = "") {
  return cleanInstruction(block);
}

function extractDurationFromBlock(block = "", lines = []) {
  const blockDuration = cleanDurationLabel(block);

  if (blockDuration) return blockDuration;

  for (const line of lines) {
    const duration = cleanDurationLabel(line);
    if (duration) return duration;
  }

  return "";
}

function getMedicineMatchScore(ocrName = "", dbName = "") {
  const ocr = normalizeMedicineName(ocrName);
  const db = normalizeMedicineName(dbName);

  if (!ocr || !db) return 0;

  if (ocr === db) return 100;

  const ocrTokens = ocr.split(" ").filter(Boolean);
  const dbTokens = db.split(" ").filter(Boolean);

  if (!ocrTokens.length || !dbTokens.length) return 0;

  // Main first medicine word must match.
  // Example:
  // OCR HEART ACT should not match HHFEXO.
  if (ocrTokens[0] !== dbTokens[0]) {
    return 0;
  }

  let common = 0;

  for (const token of ocrTokens) {
    if (dbTokens.includes(token)) {
      common += 1;
    }
  }

  const score = Math.round((common / ocrTokens.length) * 100);

  return score;
}

async function matchMedicinesWithDatabase(extractedMedicines) {
  const matched = [];

  try {
    const MIN_MATCH_SCORE = 90;

    // Stock should not be used for matching.
    // Low stock medicine can show if medicine name is correctly matched.
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

          // DB stored values — send as-is (no MRP fallback so the app
          // shows the actual netValue, not the per-unit price)
          netValue:     bestMatch.netValue     || 0,
          taxableValue: bestMatch.taxableValue || 0,

          // Stock is only display info, not matching condition
          qty: bestMatch.qty || 0,
          stock: bestMatch.qty || 0,
          inStock: (bestMatch.qty || 0) > 0,

          gstPercent: bestMatch.gstPercent || 5,

          dose: ocrMed.dose || "",
          frequency: ocrMed.frequency || "",
          freqLabel: ocrMed.frequency || "",
          instruction: ocrMed.instruction || "",

          // Duration in days
          duration: durationDays,
          durationDays,

          // Original OCR duration text
          durationLabel: ocrMed.durationLabel || "",

          // Qty directly from the prescription's Qty column (null if not found)
          prescriptionQty: ocrMed.prescriptionQty || null,

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
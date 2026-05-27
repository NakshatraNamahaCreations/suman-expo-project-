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
const { deleteFromCloudinary } = require("../config/cloudinary");

const client = new vision.ImageAnnotatorClient();

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
      // Clean up from Cloudinary when no text extracted
      try {
        await deleteFromCloudinary(cloudinaryPublicId, "auto");
        console.log("✅ Cleaned up prescription from Cloudinary (no text found)");
      } catch (deleteError) {
        console.error("Warning: Could not delete file from Cloudinary:", deleteError.message);
      }

      return res.json({
        success: true,
        message: "No text found in image",
        extractedText: "",
        extractedMedicines: [],
        matchedMedicines: [],
        medicines: [],
        matchedCount: 0,
        prescriptionUrl: cloudinaryUrl, // Return URL for reference
        publicId: cloudinaryPublicId,
      });
    }

    console.log(`✅ Extracted ${extractedText.length} characters`);
    console.log("\n🧾 RAW OCR TEXT START");
    console.log(extractedText);
    console.log("🧾 RAW OCR TEXT END\n");

    const extractedMedicines = extractMedicineRowsFromPrescription(extractedText);

    console.log("🧾 FINAL OCR MEDICINES:", JSON.stringify(extractedMedicines, null, 2));

    if (extractedMedicines.length === 0) {
      // Clean up from Cloudinary when no medicines found
      try {
        await deleteFromCloudinary(cloudinaryPublicId, "auto");
        console.log("✅ Cleaned up prescription from Cloudinary (no medicines found)");
      } catch (deleteError) {
        console.error("Warning: Could not delete file from Cloudinary:", deleteError.message);
      }

      return res.json({
        success: true,
        message: "No medicines found",
        extractedText,
        extractedMedicines: [],
        matchedMedicines: [],
        medicines: [],
        matchedCount: 0,
        prescriptionUrl: cloudinaryUrl, // Return URL for reference
        publicId: cloudinaryPublicId,
      });
    }

    console.log("🔗 Matching OCR medicines with database by medicine name only...");

    const matchedMedicines = await matchMedicinesWithDatabase(extractedMedicines);

    console.log(`✅ Matched ${matchedMedicines.length} medicines`);
    console.log("💊 FINAL MATCHED MEDICINES:", JSON.stringify(matchedMedicines, null, 2));

    // NOTE: Cloudinary file is kept for reference/history.
    // To delete after extraction, uncomment the code below:
    // try {
    //   await deleteFromCloudinary(cloudinaryPublicId, "auto");
    //   console.log("✅ Cleaned up prescription from Cloudinary after processing");
    // } catch (deleteError) {
    //   console.error("Warning: Could not delete file from Cloudinary:", deleteError.message);
    // }

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

function extractMedicineRowsFromPrescription(text) {
  const rawLines = text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);

  const medicines = [];

  for (let i = 0; i < rawLines.length; i++) {
    const currentLine = rawLines[i];

    if (!looksLikeMedicineLine(currentLine)) continue;

    const nextLines = rawLines.slice(i, i + 8);
    const block = nextLines.join(" ");

    const medicineName = extractMedicineNameFromBlock(currentLine);
    const dose = extractDoseFromBlock(block);
    const frequency = extractFrequencyFromBlock(block, nextLines);
    const instruction = extractInstructionFromBlock(block);
    const durationLabel = extractDurationFromBlock(block, nextLines);
    const durationDays = getDurationDays(durationLabel);

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
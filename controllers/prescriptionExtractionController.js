
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

    const extractedMedicines = extractMedicineRowsFromPrescription(extractedText);

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

  // Must contain a medicine-type keyword
  if (!/\b(TABLET|TAB|CAPSULE|CAP|CREAM|SYRUP|INJECTION|INJ|OINTMENT|DROP|DROPS)\b/i.test(text)) {
    return false;
  }

  // Reject dosage lines: a line starting with "N Tablet/Tab" is a dose/data row,
  // not a medicine name.  e.g. "2 Tablet 0-0-1 After Food 2 Month(s) 120"
  // Without this guard, dose lines are treated as medicine boundaries and shrink
  // each medicine's block to a single name-only line.
  if (/^\d+\s+(tablet|tab|capsule|cap)\b/i.test(text)) {
    return false;
  }

  return true;
}

/**
 * Scan the full Rx section for all "N Month(s) QTY" / "N Day(s) QTY" patterns
 * in document order. Returns one {durationLabel, durationDays, prescriptionQty}
 * object per match — one per medicine row in a well-formatted table.
 *
 * Lookahead (?![\d\/]) prevents matching dates like "28/9/2026" where the
 * qty digit is immediately followed by "/" (no whitespace between them).
 * Note: this is (?![\d\/]) NOT (?!\s*[\d\/]) — the \s* variant incorrectly
 * consumed newlines, which caused qty numbers at end-of-line to be rejected.
 */
function extractAllDurationQtyPairs(text) {
  const pairs = [];
  const pattern = /(\d+)\s*(?:month(?:s|\(s\))?|day(?:s|\(s\))?|week(?:s|\(s\))?)\s+(\d{1,4})(?![\d\/])/gi;
  let m;
  while ((m = pattern.exec(text)) !== null) {
    const num   = parseInt(m[1], 10);
    const qty   = parseInt(m[2], 10);
    const full  = m[0].toLowerCase();
    let durationDays = 0;
    if (full.includes("month"))      durationDays = num * 30;
    else if (full.includes("week"))  durationDays = num * 7;
    else if (full.includes("day"))   durationDays = num;
    if (qty >= 10 && qty <= 9999 && durationDays > 0) {
      const durationLabel = full.includes("month") ? `${num} Month(s)` :
                            full.includes("week")  ? `${num} Week(s)`  :
                                                     `${num} Day(s)`;
      pairs.push({ durationLabel, durationDays, prescriptionQty: qty });
    }
  }
  return pairs;
}

/**
 * Crop the raw OCR text to just the Rx table section.
 * Stops before investigation results, followup notes, and footer text
 * so those lines cannot contaminate the medicine data.
 */
function extractRxSection(text) {
  // End at the first of these markers
  const endMarkers = [
    /\bInvestigation\s+Results?\b/i,
    /\bNext\s+followup\b/i,
    /\bAll\s+Medications\s+are\b/i,
    /\bPatient\s+has\s+been\s+explained\b/i,
    /\bR\s*G\s+Pharma\b/i,
  ];
  let end = text.length;
  for (const re of endMarkers) {
    const idx = text.search(re);
    if (idx > 0 && idx < end) end = idx;
  }

  // Start just before the Rx header line
  const rxIdx = text.search(/(?:^|\n)\s*Rx\b/i);
  const start = rxIdx >= 0 ? rxIdx : 0;

  return text.substring(start, end);
}

/**
 * Collect all TABLET/CAPSULE medicine-name lines in document order.
 * Each line is deduplicated by normalised name.
 */
function extractAllMedicineNamesFromSection(rxText) {
  const names = [];
  for (const line of rxText.split(/\n/).map(l => l.trim()).filter(Boolean)) {
    if (!looksLikeMedicineLine(line)) continue;
    const name = extractMedicineNameFromBlock(line);
    if (!name || name.length < 3) continue;
    const key = normalizeMedicineName(name);
    if (!names.some(n => normalizeMedicineName(n) === key)) names.push(name);
  }
  return names;
}

/**
 * Collect all "N Tablet" / "N Capsule" doses in document order.
 * Only matches when a digit immediately precedes the unit word so that
 * "TABLET MEDICINE_NAME" (no leading digit) is never captured.
 */
function extractAllDosesFromSection(rxText) {
  const doses = [];
  const re = /\b(\d+)\s*(tablet|tab|capsule|cap)\b/gi;
  let m;
  while ((m = re.exec(rxText)) !== null) {
    const n = parseInt(m[1], 10);
    if (n < 1 || n > 20) continue; // ignore implausible doses
    const unit = /cap/i.test(m[2]) ? "Capsule" : "Tablet";
    doses.push(`${n} ${unit}`);
  }
  return doses;
}

/**
 * Collect all X-X-X frequency strings in document order.
 * Uses single-digit slots (0–9) which is standard for M-A-N notation.
 */
function extractAllFrequenciesFromSection(rxText) {
  const freqs = [];
  const re = /\b(\d)\s*[-–—]\s*(\d)\s*[-–—]\s*(\d)\b/g;
  let m;
  while ((m = re.exec(rxText)) !== null) {
    freqs.push(`${m[1]}-${m[2]}-${m[3]}`);
  }
  return freqs;
}

/**
 * Collect "After Food" / "Before Food" instructions in document order.
 */
function extractAllInstructionsFromSection(rxText) {
  const insts = [];
  const re = /\b(after\s+food|before\s+food|with\s+food|after\s+meal|before\s+meal)\b/gi;
  let m;
  while ((m = re.exec(rxText)) !== null) {
    const v = m[0].toLowerCase();
    insts.push(v.includes("before") ? "Before Food" : v.includes("with") ? "With Food" : "After Food");
  }
  return insts;
}

/**
 * Per-medicine block extraction.
 *
 * Strategy:
 * 1. Crop to the Rx table section only (removes investigation/followup contamination).
 * 2. Find every medicine-name line using the improved looksLikeMedicineLine()
 *    which now rejects dose lines ("2 Tablet 0-0-1…") as boundaries.
 * 3. Each medicine's block = lines from its name line up to the NEXT medicine
 *    name line (or end of Rx section, whichever comes first).
 * 4. Extract dose, freq, instruction, duration, qty from that block only.
 *
 * This guarantees each medicine gets its own row data with no cross-row bleed.
 */
function extractMedicineRowsFromPrescription(text) {
  // Crop to Rx section — prevents "Next followup after 6 Month(s)" etc.
  // from contaminating the last medicine's block.
  const rxText   = extractRxSection(text);
  const rawLines = rxText.split(/\n/).map(l => l.trim()).filter(Boolean);

  // Collect line indices for MEDICINE NAME lines only.
  // Dose lines ("2 Tablet 0-0-1 …") are now excluded by looksLikeMedicineLine.
  const medLineIndices = [];
  for (let i = 0; i < rawLines.length; i++) {
    if (looksLikeMedicineLine(rawLines[i])) medLineIndices.push(i);
  }

  console.log(`📋 Rx section: ${rxText.length} chars | ${rawLines.length} lines | ${medLineIndices.length} medicine lines`);

  const medicines = [];

  for (let mi = 0; mi < medLineIndices.length; mi++) {
    const i           = medLineIndices[mi];
    const currentLine = rawLines[i];

    // Block: from this medicine's name line to the next medicine's name line.
    // Because dose lines are no longer treated as medicine boundaries, each
    // block contains the full row data for exactly one medicine.
    const nextMedLine = mi + 1 < medLineIndices.length
      ? medLineIndices[mi + 1]
      : rawLines.length;
    const blockEnd  = Math.min(nextMedLine, i + 20);
    const nextLines = rawLines.slice(i, blockEnd);
    const block     = nextLines.join(" ");

    const medicineName  = extractMedicineNameFromBlock(currentLine);
    if (!medicineName || medicineName.length < 3) continue;

    const dose          = extractDoseFromBlock(block);
    const frequency     = extractFrequencyFromBlock(block, nextLines);
    const instruction   = extractInstructionFromBlock(block);
    const durationLabel = extractDurationFromBlock(block, nextLines);
    const durationDays  = getDurationDays(durationLabel);
    const prescriptionQty = extractPrescriptionQty(block);

    console.log(`  [${mi + 1}] ${medicineName}: ${dose || "-"}, ${frequency || "-"}, ${durationLabel || "-"}(${durationDays}d), qty=${prescriptionQty}`);

    medicines.push({
      medicineName,
      name: medicineName,
      dose:          dose       || "",
      frequency:     frequency  || "",
      freqLabel:     frequency  || "",
      instruction:   instruction || "",
      duration:      durationDays,
      durationDays,
      durationLabel: durationLabel || "",
      prescriptionQty: prescriptionQty || null,
    });
  }

  // Deduplicate by normalised name
  const unique = [];
  for (const med of medicines) {
    const key = normalizeMedicineName(med.medicineName);
    if (!unique.some(u => normalizeMedicineName(u.medicineName) === key)) {
      unique.push(med);
    }
  }

  console.log(`✅ Extracted ${unique.length} unique medicines`);
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
          newMrp: bestMatch.newMrp || 0,

          // DB stored batch-level values (as-is from medicine document)
          netValue: bestMatch.netValue || 0,
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




const fs = require("fs");
const Medicine = require("../models/Medicine");
const extractTextFromPDF = require("../utils/simplePdfReader");
const extractTextWithGoogleVision = require("../utils/googleVisionOCR");
const extractTextWithTesseract = require("../utils/tesseractOCR");

/**
 * Normalize text for matching
 */
function normalizeText(text) {
  return text
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[^\w\s]/g, "")
    .trim();
}

/**
 * Extract medicine names from prescription OCR text
 */
function extractBrandStrengthValues(text) {
  const lines = text.split("\n");
  const brandStrengthValues = [];

  console.log("\n" + "=".repeat(80));
  console.log("EXTRACTING MEDICINE NAMES");
  console.log("=".repeat(80));

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i].trim();

    if (!line || line.length < 3) continue;

    if (line.toLowerCase().includes("investigation") ||
        line.toLowerCase().includes("signature") ||
        line.toLowerCase().includes("doctor")) break;

    if (line.match(/^[-_]{3,}/) || /^\d+$/.test(line)) continue;
    if (line.match(/^(No|Sr|Date|Age|Gender|Vitals|Weight|Pulse|BP|Temperature)/i)) continue;

    let medName = "";

    if (line.includes("|")) {
      const parts = line.split("|").map(p => p.trim());
      medName = parts.length >= 2 ? parts[1] : parts[0];
    } else {
      medName = line.replace(/^\d+[\.\)]\s*/, "");

      const doseMatch = medName.match(/\s+(\d+-\d+-\d+)/);
      if (doseMatch) {
        medName = medName.substring(0, doseMatch.index);
      } else {
        const qtyMatch = medName.match(/\s+(\d+\s*(tablet|capsule|mg|ml|grams?|drops?))/i);
        if (qtyMatch) {
          medName = medName.substring(0, qtyMatch.index);
        } else {
          const durMatch = medName.match(/\s+(\d+\s*(days?|weeks?|months?))/i);
          if (durMatch) {
            medName = medName.substring(0, durMatch.index);
          }
        }
      }
    }

    medName = medName.trim().replace(/\s+/g, " ");

    if (medName &&
        medName.length >= 2 &&
        /[a-zA-Z]/.test(medName) &&
        !medName.match(/^(tablet|capsule|cream|syrup|medicine|after|before|food)/i) &&
        !medName.match(/^\d+$/)) {

      if (!brandStrengthValues.includes(medName)) {
        brandStrengthValues.push(medName);
        console.log("✅ Extracted: " + medName);
      }
    }
  }

  console.log("\n✅ Total medicines extracted: " + brandStrengthValues.length);
  console.log("=".repeat(80) + "\n");

  return brandStrengthValues;
}

/**
 * Match extracted medicine with database using normalizedName field
 */
function findMatchInDatabase(extractedName, dbMedicines) {
  const extractedNormalized = normalizeText(extractedName);

  console.log("Searching for: \"" + extractedName + "\" → Normalized: \"" + extractedNormalized + "\"");

  for (const dbMed of dbMedicines) {
    if (dbMed.normalizedName && dbMed.normalizedName === extractedNormalized) {
      console.log("✅ MATCH: " + dbMed.description);
      return dbMed;
    }

    if (dbMed.description) {
      const dbNormalized = normalizeText(dbMed.description);
      if (dbNormalized === extractedNormalized) {
        console.log("✅ MATCH: " + dbMed.description);
        return dbMed;
      }
    }
  }

  console.log("❌ NO MATCH");
  return null;
}

exports.extractMedicines = async (req, res) => {
  let filePath = null;

  try {
    console.log("\n" + "=".repeat(80));
    console.log("PRESCRIPTION UPLOAD & OCR PROCESSING");
    console.log("=".repeat(80));

    if (!req.file) {
      return res.json({
        success: false,
        message: "No file uploaded",
        matchedCount: 0,
        matchedMedicines: [],
      });
    }

    filePath = req.file.path;
    const fileName = req.file.originalname;
    const mimeType = req.file.mimetype;

    console.log("📄 File: " + fileName);
    console.log("📝 MIME Type: " + mimeType);

    const isPDF = mimeType.includes("pdf") || fileName.toLowerCase().endsWith(".pdf");
    const isImage = mimeType.includes("image") || [".jpg", ".jpeg", ".png", ".webp"].some(ext => fileName.toLowerCase().endsWith(ext));

    if (!isPDF && !isImage) {
      if (filePath && fs.existsSync(filePath)) fs.unlinkSync(filePath);
      return res.json({
        success: false,
        message: "Invalid file type. Please upload PDF, JPG, PNG, or WEBP.",
        matchedCount: 0,
        matchedMedicines: [],
      });
    }

    console.log("📋 File Type: " + (isPDF ? "PDF" : "Image"));

    // Validate file
    console.log("🔍 Validating file...");

    if (!fs.existsSync(filePath)) {
      if (filePath && fs.existsSync(filePath)) fs.unlinkSync(filePath);
      return res.json({
        success: false,
        message: "File not found. Please try uploading again.",
        matchedCount: 0,
        matchedMedicines: [],
      });
    }

    const fileStats = fs.statSync(filePath);
    const fileSizeMB = (fileStats.size / (1024 * 1024)).toFixed(2);
    console.log("📊 File size: " + fileSizeMB + " MB");

    if (fileStats.size === 0) {
      if (filePath && fs.existsSync(filePath)) fs.unlinkSync(filePath);
      return res.json({
        success: false,
        message: "File is empty. Please upload a valid prescription.",
        matchedCount: 0,
        matchedMedicines: [],
      });
    }

    if (fileStats.size > 50 * 1024 * 1024) {
      if (filePath && fs.existsSync(filePath)) fs.unlinkSync(filePath);
      return res.json({
        success: false,
        message: "File is too large (max 50MB).",
        matchedCount: 0,
        matchedMedicines: [],
      });
    }

    // Extract text from prescription
    console.log("📖 Extracting text from prescription...");
    let extractedText = "";
    const ocrErrors = {};

    if (isImage) {
      console.log("🖼️  Processing image with Google Cloud Vision...");
      try {
        extractedText = await extractTextWithGoogleVision(filePath);
        console.log("✅ Google Vision extraction successful: " + extractedText.length + " characters");
      } catch (googleErr) {
        console.error("⚠️  Google Vision failed: " + googleErr.message);
        ocrErrors.googleVision = googleErr.message;

        console.log("🔄 Attempting Tesseract fallback...");
        try {
          extractedText = await extractTextWithTesseract(filePath);
          console.log("✅ Tesseract extraction successful: " + extractedText.length + " characters");
        } catch (tesseractErr) {
          console.error("❌ Both OCR methods failed for image");
          if (filePath && fs.existsSync(filePath)) fs.unlinkSync(filePath);

          return res.json({
            success: false,
            message: "Could not read the prescription image. Please ensure the image is clear and text is legible.",
            extractedText: "",
            matchedMedicines: [],
            matchedCount: 0,
          });
        }
      }
    } else if (isPDF) {
      console.log("📕 Processing PDF...");
      try {
        console.log("1️⃣  Trying pdf-parse for text extraction...");
        extractedText = await extractTextFromPDF(filePath);

        if (extractedText && extractedText.length > 100) {
          console.log("✅ PDF text extracted: " + extractedText.length + " characters");
        } else {
          console.log("⚠️  PDF returned minimal text (" + (extractedText?.length || 0) + " chars) - likely scanned PDF");
          extractedText = "";
        }
      } catch (pdfErr) {
        console.error("⚠️  pdf-parse failed: " + pdfErr.message);
        ocrErrors.pdfParse = pdfErr.message;
      }

      // Fallback to Google Vision for scanned PDFs
      if (!extractedText || extractedText.length < 100) {
        console.log("2️⃣  Trying Google Cloud Vision OCR...");
        try {
          extractedText = await extractTextWithGoogleVision(filePath);
          console.log("✅ Google Vision extraction successful: " + extractedText.length + " characters");
        } catch (googleErr) {
          console.error("❌ Both extraction methods failed for PDF");
          if (filePath && fs.existsSync(filePath)) fs.unlinkSync(filePath);

          return res.json({
            success: false,
            message: "Could not read the PDF. Try uploading a clear image instead.",
            extractedText: "",
            matchedMedicines: [],
            matchedCount: 0,
          });
        }
      }
    }

    // Validate extracted text
    if (!extractedText || extractedText.trim().length === 0) {
      if (filePath && fs.existsSync(filePath)) fs.unlinkSync(filePath);
      return res.json({
        success: false,
        message: "No text found in prescription. Please upload a clearer image.",
        extractedText: "",
        matchedMedicines: [],
        matchedCount: 0,
      });
    }

    // Extract medicine names from OCR text
    console.log("\n📋 STEP 1: Extracting medicine names from text...");
    const extractedMedicines = extractBrandStrengthValues(extractedText);

    if (extractedMedicines.length === 0) {
      console.log("⚠️  No medicines found in prescription text");
      if (filePath && fs.existsSync(filePath)) fs.unlinkSync(filePath);
      return res.json({
        success: false,
        message: "No medicines found in prescription.",
        extractedText: extractedText,
        extractedMedicines: [],
        matchedMedicines: [],
        matchedCount: 0,
      });
    }

    console.log("✅ Found " + extractedMedicines.length + " potential medicines");

    // Load all medicines from database
    console.log("\n💾 STEP 2: Loading medicines from database...");
    const dbMedicines = await Medicine.find({ status: "Active" }).lean();
    console.log("✅ Loaded " + dbMedicines.length + " active medicines from database");

    // Match extracted medicines with database
    console.log("\n🔄 STEP 3: Matching medicines with database...");
    console.log("-".repeat(80));

    const matchedMedicines = [];
    const unmatchedMedicines = [];

    for (const extractedMed of extractedMedicines) {
      const dbMed = findMatchInDatabase(extractedMed, dbMedicines);

      if (dbMed) {
        matchedMedicines.push({
          _id: dbMed._id.toString(),
          medicineId: dbMed._id.toString(),
          description: dbMed.description,
          name: dbMed.description,
          mfr: dbMed.mfr || "N/A",
          vendor: dbMed.vendor || "N/A",
          pack: dbMed.pack || "N/A",
          batchNo: dbMed.batchNo || "",
          hsnCode: dbMed.hsnCode || "",
          price: dbMed.newMrp || 0,
          mrp: dbMed.newMrp || 0,
          netValue: dbMed.netValue || dbMed.newMrp || 0,
          qty: dbMed.qty || 0,
          stock: dbMed.qty || 0,
          inStock: (dbMed.qty || 0) > 0,
          gstPercent: dbMed.gstPercent || 5,
          discPercent: dbMed.discPercent || 0,
        });
      } else {
        unmatchedMedicines.push({
          name: extractedMed,
        });
      }
    }

    console.log("-".repeat(80));
    console.log("\n✅ MATCHING COMPLETE");
    console.log("   Matched: " + matchedMedicines.length);
    console.log("   Unmatched: " + unmatchedMedicines.length);

    // Cleanup file
    if (filePath && fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    console.log("\n" + "=".repeat(80));
    console.log("OCR PROCESSING COMPLETE");
    console.log("=".repeat(80));
    console.log("✅ Success: " + (matchedMedicines.length > 0));
    console.log("✅ Extracted: " + extractedMedicines.length + " medicines");
    console.log("✅ Matched: " + matchedMedicines.length + " medicines");
    console.log("✅ Text: " + extractedText.length + " characters");
    console.log("=".repeat(80) + "\n");

    return res.json({
      success: true,
      message: matchedMedicines.length > 0
        ? `Found ${matchedMedicines.length} matching medicine(s)`
        : "No matching medicines found.",
      extractedText: extractedText,
      extractedMedicines: extractedMedicines,
      matchedMedicines: matchedMedicines,
      matchedCount: matchedMedicines.length,
      unmatchedCount: unmatchedMedicines.length,
      totalExtracted: extractedMedicines.length,
    });

  } catch (error) {
    console.error("\n❌ ERROR: " + error.message);
    console.error("Stack: " + error.stack);

    if (filePath && fs.existsSync(filePath)) {
      try {
        fs.unlinkSync(filePath);
      } catch (e) {
        console.error("Failed to cleanup file: " + e.message);
      }
    }

    return res.status(500).json({
      success: false,
      message: "Server error processing prescription. Please try again.",
      extractedText: "",
      extractedMedicines: [],
      matchedMedicines: [],
      matchedCount: 0,
    });
  }
};

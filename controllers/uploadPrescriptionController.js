const fs = require("fs");
const Medicine = require("../models/Medicine");
const extractTextFromPDF = require("../utils/simplePdfReader");
const extractTextWithGoogleVision = require("../utils/googleVisionOCR");
const extractTextWithTesseract = require("../utils/tesseractOCR");
const extractTextFromImagePDF = require("../utils/ocrExtractor");
const extractTextWithAlternativeOCR = require("../utils/alternativeOCR");

/**
 * Normalize text for matching
 * - Convert to lowercase
 * - Remove extra spaces
 * - Remove special characters
 */
function normalizeText(text) {
  return text
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ") // Normalize multiple spaces to single space
    .replace(/[^\w\s]/g, "") // Remove special characters, keep only letters, numbers, spaces
    .trim();
}

/**
 * Extract Brand & Strength values from prescription text
 * Looks for the Brand & Strength column and extracts medicine names
 */
function extractBrandStrengthValues(text) {
  const lines = text.split("\n");
  const brandStrengthValues = [];

  console.log("\n" + "=".repeat(80));
  console.log("EXTRACTING BRAND & STRENGTH VALUES");
  console.log("=".repeat(80));

  let startIdx = -1;

  // Find Brand & Strength header or similar
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].toLowerCase();
    // Look for table headers containing medicine/brand/strength info
    if ((line.includes("brand") || line.includes("medicine")) &&
        (line.includes("strength") || line.includes("dosage") || line.includes("duration"))) {
      startIdx = i;
      console.log("Found prescription table header at line " + (i + 1));
      console.log("Header: " + lines[i]);
      break;
    }
  }

  if (startIdx === -1) {
    console.log("WARNING: Could not find prescription table header");
    return [];
  }

  // Extract medicines from lines after header
  for (let i = startIdx + 1; i < lines.length; i++) {
    let line = lines[i].trim();

    // Stop conditions
    if (!line || line === "") continue;
    if (line.match(/^[-_]{3,}/)) continue; // Separator lines
    if (line.toLowerCase().includes("doctor") || line.toLowerCase().includes("signature")) break;
    if (line.toLowerCase().includes("medlink") || line.toLowerCase().includes("note")) break;

    // Skip if it looks like a header row
    if (line.match(/^(No|Sr|Medicine|Brand|Dosage|Duration|Frequency|Quantity|Strength)/i)) continue;

    let medName = "";

    // Handle pipe-separated columns
    if (line.includes("|")) {
      const parts = line.split("|").map(p => p.trim());
      // Get second column (usually the medicine/brand name)
      if (parts.length >= 2) {
        medName = parts[1];
      } else if (parts.length >= 1) {
        medName = parts[0];
      }
    } else {
      // Handle space-separated or continuous text
      // Pattern: "1 Paracetamol 500mg 1-0-1 30 days 60"
      // Or: "Paracetamol 500mg 1-0-1 30 days"

      // Remove leading row number if present
      medName = line.replace(/^\d+[\.\)]\s*/, "");

      // Extract up to dosage pattern (1-0-1 or similar)
      const dosageMatch = medName.match(/\s+(\d+-\d+-\d+)/);
      if (dosageMatch) {
        medName = medName.substring(0, dosageMatch.index);
      } else {
        // Extract up to duration/days pattern
        const daysMatch = medName.match(/\s+\d+\s+(days?|tabs?|capsules?|ml)/i);
        if (daysMatch) {
          medName = medName.substring(0, daysMatch.index);
        } else {
          // Take first reasonable part (before 2+ spaces)
          const parts = medName.split(/\s{2,}/);
          medName = parts[0];
        }
      }
    }

    // Clean up: trim and remove extra spaces
    medName = medName.trim();
    medName = medName.replace(/\s+/g, " ");

    // Validate: must have letters and be at least 2 characters
    if (medName && medName.length >= 3 && /[a-zA-Z]/.test(medName)) {
      // Additional check: should not be a number-only line
      if (!/^\d+$/.test(medName)) {
        brandStrengthValues.push(medName);
        console.log("Extracted: " + medName);
      }
    }
  }

  console.log("\nTotal Brand & Strength values extracted: " + brandStrengthValues.length);
  console.log("=".repeat(80) + "\n");

  return brandStrengthValues;
}

/**
 * Match extracted medicine with database
 * Uses both medicine.description and medicine.normalizedName
 */
function findMatchInDatabase(extractedName, dbMedicines) {
  const extractedNormalized = normalizeText(extractedName);

  console.log("Searching for: \"" + extractedName + "\"");
  console.log("Normalized: \"" + extractedNormalized + "\"");

  // Try to find exact match using normalized names
  for (const dbMed of dbMedicines) {
    // Match 1: Compare with medicine.normalizedName (if it exists)
    if (dbMed.normalizedName) {
      if (dbMed.normalizedName === extractedNormalized) {
        console.log("MATCH (via normalizedName): " + dbMed.description);
        return dbMed;
      }
    }

    // Match 2: Normalize description and compare
    if (dbMed.description) {
      const dbNormalized = normalizeText(dbMed.description);
      if (dbNormalized === extractedNormalized) {
        console.log("MATCH (via description): " + dbMed.description);
        return dbMed;
      }
    }
  }

  console.log("NO MATCH found");
  return null;
}

exports.extractMedicines = async (req, res) => {
  let filePath = null;

  try {
    console.log("\n" + "=".repeat(80));
    console.log("PDF PRESCRIPTION UPLOAD");
    console.log("=".repeat(80));

    if (!req.file) {
      return res.json({
        success: false,
        message: "No file uploaded",
        matchedCount: 0,
        medicines: [],
      });
    }

    filePath = req.file.path;
    const fileName = req.file.originalname;
    const mimeType = req.file.mimetype;

    console.log("File: " + fileName);
    console.log("MIME Type: " + mimeType);

    const isPDF = mimeType.includes("pdf") || fileName.toLowerCase().endsWith(".pdf");

    if (!isPDF) {
      if (filePath && fs.existsSync(filePath)) fs.unlinkSync(filePath);
      return res.json({
        success: false,
        message: "Only PDF files are supported. Please upload a prescription PDF.",
        matchedCount: 0,
        medicines: [],
      });
    }

    // Extract text from PDF
    console.log("Extracting text from PDF...");
    console.log("File path: " + filePath);
    console.log("File exists: " + fs.existsSync(filePath));
    if (fs.existsSync(filePath)) {
      console.log("File size: " + fs.statSync(filePath).size + " bytes");
    }

    let pdfText = "";

    try {
      pdfText = await extractTextFromPDF(filePath);
      console.log("✅ PDF text extracted using pdf-parse: " + pdfText.length + " characters\n");
    } catch (pdfErr) {
      console.log("PDF text extraction failed: " + pdfErr.message);
      console.log("Attempting Google Cloud Vision OCR for scanned PDF...\n");

      try {
        pdfText = await extractTextWithGoogleVision(filePath);
        console.log("✅ Google Cloud Vision OCR extraction successful: " + pdfText.length + " characters\n");
      } catch (googleErr) {
        console.error("\n⚠️ Google Cloud Vision OCR failed: " + googleErr.message);
        console.log("Attempting Tesseract.js OCR extraction...\n");

        try {
          pdfText = await extractTextWithTesseract(filePath);
          console.log("✅ Tesseract.js OCR extraction successful: " + pdfText.length + " characters\n");
        } catch (tesseractErr) {
          console.error("\n⚠️ Tesseract.js OCR failed: " + tesseractErr.message);
          console.log("Attempting OCR.space API extraction...\n");

          try {
            pdfText = await extractTextFromImagePDF(filePath);
            console.log("✅ OCR.space API extraction successful: " + pdfText.length + " characters\n");
          } catch (ocrErr) {
            console.error("\n⚠️ OCR.space API failed: " + ocrErr.message);
            console.log("Attempting fallback to alternative OCR service...\n");

            try {
              pdfText = await extractTextWithAlternativeOCR(filePath);
              console.log("✅ Alternative OCR extraction successful: " + pdfText.length + " characters\n");
            } catch (altOcrErr) {
              console.error("\n❌ ALL OCR METHODS FAILED");
              console.error("=".repeat(80));
              console.error("Google Vision Error: " + googleErr.message);
              console.error("Tesseract.js Error: " + tesseractErr.message);
              console.error("OCR.space API Error: " + ocrErr.message);
              console.error("Alternative OCR Error: " + altOcrErr.message);
              console.error("=".repeat(80));

              if (filePath && fs.existsSync(filePath)) fs.unlinkSync(filePath);

              return res.json({
                success: false,
                message: "Could not extract text from prescription. All OCR methods failed. Please use a text-based PDF or contact support.",
                brandStrength: [],
                extractedCount: 0,
                matchedCount: 0,
                unmatchedCount: 0,
                medicines: [],
                unmatchedMedicines: [],
              });
            }
          }
        }
      }
    }

    if (!pdfText || pdfText.trim().length === 0) {
      if (filePath && fs.existsSync(filePath)) fs.unlinkSync(filePath);
      return res.json({
        success: false,
        message: "PDF is empty or unreadable",
        matchedCount: 0,
        medicines: [],
        extractedMedicines: [],
      });
    }

    // Extract Brand & Strength values from prescription
    const brandStrengthValues = extractBrandStrengthValues(pdfText);

    if (brandStrengthValues.length === 0) {
      console.log("WARNING: No Brand & Strength values found in prescription");
      if (filePath && fs.existsSync(filePath)) fs.unlinkSync(filePath);
      return res.json({
        success: false,
        message: "No medicines found in Brand & Strength column",
        brandStrength: [],
        extractedCount: 0,
        matchedCount: 0,
        unmatchedCount: 0,
        medicines: [],
      });
    }

    // Log extracted Brand & Strength
    console.log("STEP 1: Extracted " + brandStrengthValues.length + " Brand & Strength values\n");

    // Load all medicines from database
    console.log("STEP 2: Loading medicines from database...");
    const dbMedicines = await Medicine.find({}).lean();
    console.log("Total in database: " + dbMedicines.length + " medicines\n");

    // Match Brand & Strength values with database medicines
    console.log("STEP 3: Matching Brand & Strength values with database...");
    console.log("-".repeat(80));

    const matchedMedicines = [];
    const unmatchedMedicines = [];

    for (const brandStrength of brandStrengthValues) {
      console.log("Checking: " + brandStrength);
      const dbMedicine = findMatchInDatabase(brandStrength, dbMedicines);

      if (dbMedicine) {
        console.log("  MATCHED: " + dbMedicine.description);
        matchedMedicines.push({
          medicineId: dbMedicine._id.toString(),
          name: dbMedicine.description,
          description: dbMedicine.description,
          mfr: dbMedicine.mfr || "N/A",
          price: dbMedicine.netValue || dbMedicine.newMrp || 0,
          mrp: dbMedicine.newMrp || 0,
          qty: dbMedicine.qty || 0,
          stock: dbMedicine.qty || 0,
          pack: dbMedicine.pack || "N/A",
          gstPercent: dbMedicine.gstPercent || 0,
          discPercent: dbMedicine.discPercent || 0,
          vendor: dbMedicine.vendor || "N/A",
          batchNo: dbMedicine.batchNo || "",
          hsnCode: dbMedicine.hsnCode || "",
        });
      } else {
        console.log("  NO MATCH");
        unmatchedMedicines.push({
          name: brandStrength,
        });
      }
    }

    console.log("-".repeat(80));
    console.log("\nSTEP 4: MATCHING RESULTS");
    console.log("Matched: " + matchedMedicines.length);
    console.log("Unmatched: " + unmatchedMedicines.length);

    if (unmatchedMedicines.length > 0) {
      console.log("\nUnmatched Brand & Strength values:");
      unmatchedMedicines.forEach((med, i) => {
        console.log("  " + (i + 1) + ". " + med.name);
      });
    }

    // Cleanup file
    if (filePath && fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    console.log("\n" + "=".repeat(80));
    console.log("FINAL: BRAND & STRENGTH VALUES EXTRACTED");
    console.log("=".repeat(80));
    brandStrengthValues.forEach((val, i) => {
      console.log((i + 1) + ". " + val);
    });
    console.log("=".repeat(80) + "\n");

    return res.json({
      success: true,
      message: "Brand & Strength extracted successfully",
      brandStrength: brandStrengthValues,
      extractedCount: brandStrengthValues.length,
      matchedCount: matchedMedicines.length,
      unmatchedCount: unmatchedMedicines.length,
      medicines: matchedMedicines,
      unmatchedMedicines: unmatchedMedicines,
    });

  } catch (error) {
    console.error("ERROR: " + error.message);
    console.error("Stack: " + error.stack);

    if (filePath && fs.existsSync(filePath)) {
      try {
        fs.unlinkSync(filePath);
      } catch (e) {}
    }

    return res.status(500).json({
      success: false,
      message: error.message || "Server error processing prescription",
      brandStrength: [],
      extractedCount: 0,
      matchedCount: 0,
      unmatchedCount: 0,
      medicines: [],
      unmatchedMedicines: [],
    });
  }
};

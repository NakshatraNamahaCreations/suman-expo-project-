const fs = require("fs");
const Medicine = require("../models/Medicine");
const extractTextFromPDF = require("../utils/simplePdfReader");

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
 * Extract medicine names from prescription table (Medicine/Brand & Strength column)
 */
function extractMedicinesFromPrescription(text) {
  const lines = text.split("\n").map(l => l.trim()).filter(l => l);
  const medicines = [];

  console.log("Looking for prescription table...");
  let startIdx = -1;

  // Find prescription table header - look for lines with table columns
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].toLowerCase();
    if ((line.includes("medicine") || line.includes("brand")) &&
        (line.includes("dosage") || line.includes("duration") || line.includes("strength"))) {
      startIdx = i;
      console.log("Found prescription table at line " + (i + 1));
      break;
    }
  }

  if (startIdx === -1) {
    console.log("WARNING: Could not find prescription table");
    return [];
  }

  // Extract medicines from lines after header
  for (let i = startIdx + 1; i < lines.length; i++) {
    const line = lines[i];

    // Stop at footer or signature sections
    if (line.toLowerCase().includes("doctor") || line.toLowerCase().includes("signature") ||
        line.toLowerCase().includes("medlink") || line === "") continue;

    // Skip separator lines
    if (line.match(/^[-_]{3,}$/)) continue;

    // Skip header-like lines
    if (line.match(/^(No|Medicine|Dosage|Duration|Brand|Strength|Quantity)/i)) continue;

    let medName = line.trim();

    // Handle pipe-separated columns (table format)
    if (line.includes("|")) {
      const parts = line.split("|");
      if (parts.length >= 2) {
        // Medicine is typically the 2nd column
        medName = parts[1].trim();
      }
    } else {
      // Handle space-separated table format
      // Pattern: 1 Paracetamol 500mg 1-0-1 30 days 60
      const parts = line.split(/\s+/);
      if (parts.length >= 2 && /^\d+$/.test(parts[0])) {
        // Remove the leading number (row number)
        parts.shift();
        // Get everything before dosage pattern (1-0-1 format)
        let remaining = parts.join(" ");
        const dosageMatch = remaining.match(/\s*(\d+-\d+-\d+)/);
        if (dosageMatch) {
          medName = remaining.substring(0, dosageMatch.index).trim();
        } else {
          medName = parts.join(" ").split(/\s{2,}/)[0];
        }
      }
    }

    // Clean up the medicine name
    medName = medName.trim();

    // Validate medicine name (should have letters and be reasonably long)
    if (medName && medName.length >= 2 && /[a-zA-Z]/.test(medName)) {
      medicines.push(medName);
      console.log("Extracted medicine: " + medName);
    }
  }

  return medicines;
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
    let pdfText = "";

    try {
      pdfText = await extractTextFromPDF(filePath);
      console.log("PDF text extracted: " + pdfText.length + " characters\n");
    } catch (pdfErr) {
      console.log("PDF extraction error: " + pdfErr.message);
      if (filePath && fs.existsSync(filePath)) fs.unlinkSync(filePath);

      return res.json({
        success: false,
        message: "Could not read PDF. Please ensure it's a text-based PDF (not scanned/image-based).",
        matchedCount: 0,
        medicines: [],
      });
    }

    if (!pdfText || pdfText.trim().length === 0) {
      if (filePath && fs.existsSync(filePath)) fs.unlinkSync(filePath);
      return res.json({
        success: false,
        message: "PDF is empty or unreadable",
        matchedCount: 0,
        medicines: [],
      });
    }

    // Extract medicines from prescription table
    console.log("STEP 1: Extracting medicines from prescription table...");
    const extractedMedicines = extractMedicinesFromPrescription(pdfText);
    console.log("Total extracted: " + extractedMedicines.length + " medicines\n");

    if (extractedMedicines.length === 0) {
      if (filePath && fs.existsSync(filePath)) fs.unlinkSync(filePath);
      return res.json({
        success: false,
        message: "No medicines found in prescription",
        matchedCount: 0,
        medicines: [],
        extractedMedicines: [],
      });
    }

    // Load all medicines from database
    console.log("STEP 2: Loading medicines from database...");
    const dbMedicines = await Medicine.find({}).lean();
    console.log("Total in database: " + dbMedicines.length + " medicines\n");

    // Match extracted medicines with database
    console.log("STEP 3: Matching extracted medicines with database...");
    console.log("-".repeat(80));

    const matchedMedicines = [];
    const unmatchedMedicines = [];

    for (const extractedName of extractedMedicines) {
      console.log("");
      const dbMedicine = findMatchInDatabase(extractedName, dbMedicines);

      if (dbMedicine) {
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
        unmatchedMedicines.push({
          name: extractedName,
        });
      }
    }

    console.log("-".repeat(80));
    console.log("\nSTEP 4: MATCHING RESULTS");
    console.log("Matched: " + matchedMedicines.length);
    console.log("Unmatched: " + unmatchedMedicines.length);

    if (unmatchedMedicines.length > 0) {
      console.log("\nUnmatched medicines:");
      unmatchedMedicines.forEach((med, i) => {
        console.log("  " + (i + 1) + ". " + med.name);
      });
    }

    // Cleanup file
    if (filePath && fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    console.log("\n" + "=".repeat(80));
    console.log("EXTRACTED MEDICINES FROM PRESCRIPTION:");
    console.log("=".repeat(80));
    extractedMedicines.forEach((med, i) => {
      console.log((i + 1) + ". " + med);
    });
    console.log("=".repeat(80) + "\n");

    return res.json({
      success: matchedMedicines.length > 0,
      message: matchedMedicines.length > 0
        ? "Found " + matchedMedicines.length + " matching medicine(s) in inventory"
        : "Medicines extracted, no matches found in database",
      extractedMedicines: extractedMedicines,
      extractedCount: extractedMedicines.length,
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
      matchedCount: 0,
      medicines: [],
      extractedMedicines: [],
    });
  }
};

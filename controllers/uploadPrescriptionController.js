const fs = require("fs");
const Medicine = require("../models/Medicine");
const extractTextFromPDF = require("../utils/pdfReader");

/**
 * MINIMAL FRESH IMPLEMENTATION
 * Simple PDF upload → Extract text → Extract medicines → Match → Return results
 */

exports.extractMedicines = async (req, res) => {
  let filePath = null;

  try {
    console.log("\n" + "═".repeat(80));
    console.log("📥 PDF PRESCRIPTION UPLOAD");
    console.log("═".repeat(80));

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "No file uploaded",
        matchedCount: 0,
        medicines: [],
      });
    }

    filePath = req.file.path;
    console.log(`📄 File: ${req.file.originalname}`);
    console.log(`📁 Path: ${filePath}`);
    console.log(`📊 Size: ${req.file.size} bytes\n`);

    // STEP 1: Extract text from PDF
    console.log("STEP 1️⃣ Reading PDF...");
    let pdfText = "";

    try {
      pdfText = await extractTextFromPDF(filePath);
      console.log(`✅ PDF read successfully (${pdfText.length} characters)\n`);
    } catch (err) {
      console.error(`❌ PDF read failed: ${err.message}`);
      throw new Error("Could not read PDF file");
    }

    if (!pdfText || pdfText.trim().length === 0) {
      throw new Error("PDF is empty or unreadable");
    }

    // STEP 2: Extract medicines from Brand & Strength section ONLY
    console.log("STEP 2️⃣ Extracting medicines from 'Brand & Strength' section...");
    const extractedMedicines = extractBrandStrengthMedicines(pdfText);
    console.log(`✅ Extracted ${extractedMedicines.length} medicines from Brand & Strength\n`);

    if (extractedMedicines.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No medicines found in 'Brand & Strength' section",
        matchedCount: 0,
        medicines: [],
      });
    }

    // Log extracted medicines
    console.log("📋 EXTRACTED MEDICINE NAMES:");
    extractedMedicines.forEach((med, i) => {
      console.log(`   ${i + 1}. "${med}"`);
    });
    console.log("");

    // STEP 3: Load database medicines
    console.log("STEP 3️⃣ Loading medicines from database...");
    const dbMedicines = await Medicine.find({ status: "Active" });
    console.log(`✅ Loaded ${dbMedicines.length} medicines\n`);

    // STEP 4: Match medicines (EXACT MATCH ONLY)
    console.log("STEP 4️⃣ Matching with medicine.description (EXACT MATCH)...");
    console.log("─".repeat(80));

    const matchedMedicines = [];

    for (const extractedName of extractedMedicines) {
      console.log(`\n🔍 Searching for: "${extractedName}"`);

      // EXACT MATCH: Case-insensitive comparison
      const dbMedicine = dbMedicines.find(
        med => med.description.toUpperCase().trim() === extractedName.toUpperCase().trim()
      );

      if (dbMedicine) {
        console.log(`✅ EXACT MATCH FOUND: "${dbMedicine.description}"`);
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
        console.log(`❌ NO MATCH: "${extractedName}" not found in database`);
      }
    }

    console.log("\n" + "─".repeat(80));
    console.log(`\n📊 MATCHING RESULTS:`);
    console.log(`   ✅ Matched: ${matchedMedicines.length}`);
    console.log(`   ❌ Unmatched: ${extractedMedicines.length - matchedMedicines.length}\n`);

    // Clean up uploaded file
    if (filePath && fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    console.log("═".repeat(80) + "\n");

    // Return response
    return res.json({
      success: matchedMedicines.length > 0,
      message: matchedMedicines.length > 0
        ? `Found ${matchedMedicines.length} matching medicine${matchedMedicines.length !== 1 ? 's' : ''} in inventory`
        : "No matching medicines found",
      matchedCount: matchedMedicines.length,
      medicines: matchedMedicines,
    });

  } catch (error) {
    console.error(`\n❌ ERROR: ${error.message}\n`);

    if (filePath && fs.existsSync(filePath)) {
      try { fs.unlinkSync(filePath); } catch (e) {}
    }

    return res.status(400).json({
      success: false,
      message: error.message || "Failed to process prescription PDF",
      matchedCount: 0,
      medicines: [],
    });
  }
};

/**
 * Extract ONLY Brand & Strength medicine names from prescription
 * Ignores Dose, Frequency, Instruction, Duration, and other columns
 *
 * From table like:
 * Sr. | Brand & Strength          | Dose    | Frequency | Instruction | Duration
 * 1.  | TABLET TRIPLE HEART OPEN  | ...     | ...       | ...         | ...
 *
 * Returns ONLY: ["TABLET TRIPLE HEART OPEN", ...]
 */
function extractBrandStrengthMedicines(text) {
  const lines = text.split("\n").map(l => l.trim()).filter(l => l.length > 0);

  // Find "Brand & Strength" header line
  let headerIdx = -1;
  let brandStrengthColIndex = -1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].toLowerCase();
    if (line.includes("brand") && line.includes("strength")) {
      headerIdx = i;
      break;
    }
  }

  if (headerIdx === -1) {
    console.log("❌ Could not find 'Brand & Strength' column header");
    return [];
  }

  console.log(`✅ Found 'Brand & Strength' header at line ${headerIdx + 1}`);

  // Extract medicines starting from the next line after header
  const medicines = [];
  const endMarkers = ["investigation", "observation", "diagnosis", "note", "instruction detail", "instruction", "signature"];

  for (let i = headerIdx + 1; i < lines.length; i++) {
    const line = lines[i].trim();

    // Stop if we hit another section
    if (endMarkers.some(marker => line.toLowerCase().includes(marker)) && line.length < 50) {
      console.log(`✅ Reached end of medicines section at: "${line}"`);
      break;
    }

    // Skip empty lines
    if (!line || line.length === 0) continue;

    // Skip lines that are clearly headers or separators
    if (line.toLowerCase().includes("sr.") || line.includes("─") || line.includes("–") || line.includes("_")) {
      continue;
    }

    // Extract the first column (Brand & Strength) - before the second column starts
    // The medicine name is usually the first item, followed by | or multiple spaces, or next columns
    let medicineName = extractFirstColumn(line);

    if (medicineName && medicineName.length >= 3 && /[a-zA-Z]/.test(medicineName)) {
      // Remove any trailing dose/frequency info that might be on same line
      medicineName = medicineName
        .replace(/\s*\|\s*.*/g, "") // Remove anything after |
        .replace(/\s{2,}.*/g, "") // Remove text after 2+ spaces (usually next column)
        .trim();

      // Remove leading numbers (1., 2), etc)
      medicineName = medicineName.replace(/^\d+[\.\)]\s*/, "").trim();

      if (medicineName.length >= 3) {
        medicines.push(medicineName);
      }
    }
  }

  return medicines;
}

/**
 * Extract first column from a table row
 * Handles pipes (|) and multiple spaces as column separators
 */
function extractFirstColumn(line) {
  // If pipe-separated, get first part
  if (line.includes("|")) {
    const parts = line.split("|");
    return parts[0].trim();
  }

  // If multiple spaces, get text before spaces
  const match = line.match(/^([^\s].*?)(\s{2,}|$)/);
  if (match) {
    return match[1].trim();
  }

  return line.trim();
}

// No additional matching functions needed - exact match is done inline in main function

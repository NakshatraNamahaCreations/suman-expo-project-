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
    console.log("\n" + "=".repeat(80));
    console.log("PDF PRESCRIPTION UPLOAD");
    console.log("=".repeat(80));

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "No file uploaded",
        matchedCount: 0,
        medicines: [],
      });
    }

    filePath = req.file.path;
    console.log("File: " + req.file.originalname);
    console.log("Path: " + filePath);
    console.log("Size: " + req.file.size + " bytes\n");

    // STEP 1: Extract text from PDF
    console.log("STEP 1: Reading PDF...");
    let pdfText = "";

    try {
      pdfText = await extractTextFromPDF(filePath);
      console.log("PDF read successfully (" + pdfText.length + " characters)\n");
    } catch (err) {
      console.error("PDF read failed: " + err.message);
      throw new Error("Could not read PDF file");
    }

    if (!pdfText || pdfText.trim().length === 0) {
      throw new Error("PDF is empty or unreadable");
    }

    // STEP 2: Extract medicines from Brand & Strength section
    console.log("STEP 2: Extracting medicines from Brand & Strength section...");
    const extractedMedicines = extractBrandStrengthMedicines(pdfText);
    console.log("Extracted " + extractedMedicines.length + " medicines\n");

    if (extractedMedicines.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No medicines found in Brand & Strength section",
        matchedCount: 0,
        medicines: [],
      });
    }

    // Log extracted medicines
    console.log("EXTRACTED MEDICINE NAMES:");
    extractedMedicines.forEach((med, i) => {
      console.log("  " + (i + 1) + ". " + med);
    });
    console.log("");

    // STEP 3: Load database medicines
    console.log("STEP 3: Loading medicines from database...");
    const dbMedicines = await Medicine.find({ status: "Active" });
    console.log("Loaded " + dbMedicines.length + " medicines\n");

    // STEP 4: Match medicines (EXACT MATCH)
    console.log("STEP 4: Matching with medicine.description (EXACT MATCH)...");
    console.log("-".repeat(80));

    const matchedMedicines = [];

    for (const extractedName of extractedMedicines) {
      console.log("\nSearching for: " + extractedName);

      const dbMedicine = dbMedicines.find(
        med => med.description && med.description.toUpperCase().trim() === extractedName.toUpperCase().trim()
      );

      if (dbMedicine) {
        console.log("MATCH FOUND: " + dbMedicine.description);
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
        console.log("NO MATCH FOUND");
      }
    }

    console.log("\n" + "-".repeat(80));
    console.log("\nMATCHING RESULTS:");
    console.log("Matched: " + matchedMedicines.length);
    console.log("Unmatched: " + (extractedMedicines.length - matchedMedicines.length) + "\n");

    // Clean up file
    if (filePath && fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    console.log("=".repeat(80) + "\n");

    return res.json({
      success: matchedMedicines.length > 0,
      message: matchedMedicines.length > 0
        ? "Found " + matchedMedicines.length + " matching medicine(s) in inventory"
        : "No matching medicines found",
      matchedCount: matchedMedicines.length,
      medicines: matchedMedicines,
    });

  } catch (error) {
    console.error("\nERROR: " + error.message + "\n");
    console.error("Stack: " + error.stack);

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
 */
function extractBrandStrengthMedicines(text) {
  try {
    const lines = text.split("\n").map(l => l.trim()).filter(l => l.length > 0);
    let headerIdx = -1;

    // Find "Brand & Strength" header
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].toLowerCase();
      if (line.includes("brand") && line.includes("strength")) {
        headerIdx = i;
        console.log("Found Brand & Strength header");
        break;
      }
    }

    if (headerIdx === -1) {
      console.log("Could not find Brand & Strength header");
      return [];
    }

    const medicines = [];
    const endMarkers = ["investigation", "observation", "diagnosis", "note", "instruction"];

    for (let i = headerIdx + 1; i < lines.length; i++) {
      const line = lines[i].trim();

      // Stop at section end
      if (endMarkers.some(m => line.toLowerCase().includes(m)) && line.length < 50) {
        break;
      }

      if (!line || line.length === 0) continue;
      if (line.includes("─") || line.includes("–") || line.includes("_")) continue;
      if (line.toLowerCase().includes("sr.")) continue;

      // Get first column (before pipe or multiple spaces)
      let medName = line;

      if (line.includes("|")) {
        medName = line.split("|")[0].trim();
      } else {
        const parts = line.split(/\s{2,}/);
        medName = parts[0].trim();
      }

      // Remove leading number
      medName = medName.replace(/^\d+[\.\)]\s*/, "").trim();

      // Validate
      if (medName.length >= 3 && /[a-zA-Z]/.test(medName)) {
        medicines.push(medName);
      }
    }

    return medicines;
  } catch (error) {
    console.error("Error extracting medicines:", error.message);
    return [];
  }
}

// No additional matching functions needed - exact match is done inline in main function

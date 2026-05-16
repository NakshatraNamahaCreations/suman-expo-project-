const fs = require("fs");
const Medicine = require("../models/Medicine");
const extractTextFromPDF = require("../utils/pdfReader");

exports.extractMedicines = async (req, res) => {
  let filePath = null;

  try {
    console.log("\n========== PRESCRIPTION UPLOAD START ==========");

    // Check file
    if (!req.file) {
      console.log("ERROR: No file uploaded");
      return res.status(400).json({
        success: false,
        message: "No file uploaded",
        matchedCount: 0,
        medicines: [],
      });
    }

    filePath = req.file.path;
    console.log("File received: " + req.file.originalname);
    console.log("File path: " + filePath);

    // Extract text
    console.log("Extracting text from PDF...");
    let pdfText = "";

    try {
      pdfText = await extractTextFromPDF(filePath);
      console.log("Text extracted: " + pdfText.length + " chars");
    } catch (pdfErr) {
      console.log("ERROR in PDF extraction: " + pdfErr.message);
      throw new Error("Failed to extract text from PDF");
    }

    if (!pdfText || pdfText.trim().length === 0) {
      console.log("ERROR: PDF text is empty");
      throw new Error("No text extracted from PDF");
    }

    // Extract medicines
    console.log("Extracting medicines...");
    const medicines = extractMedicinesFromText(pdfText);
    console.log("Medicines found: " + medicines.length);

    if (medicines.length === 0) {
      console.log("ERROR: No medicines extracted");
      if (filePath && fs.existsSync(filePath)) fs.unlinkSync(filePath);
      return res.json({
        success: false,
        message: "No medicines found in Brand & Strength section",
        matchedCount: 0,
        medicines: [],
      });
    }

    // List extracted medicines
    console.log("Extracted medicines:");
    medicines.forEach((m, i) => {
      console.log("  " + (i + 1) + ". " + m);
    });

    // Get medicines from database
    console.log("Loading medicines from database...");
    const dbMedicines = await Medicine.find().lean();
    console.log("Total medicines in database: " + dbMedicines.length);

    // Match medicines
    console.log("Matching medicines...");
    const matched = [];

    for (const med of medicines) {
      const found = dbMedicines.find(db =>
        db.description && db.description.toUpperCase() === med.toUpperCase()
      );

      if (found) {
        console.log("MATCH: " + med);
        matched.push({
          medicineId: found._id.toString(),
          name: found.description,
          description: found.description,
          mfr: found.mfr || "N/A",
          price: found.netValue || found.newMrp || 0,
          mrp: found.newMrp || 0,
          qty: found.qty || 0,
          stock: found.qty || 0,
          pack: found.pack || "N/A",
          gstPercent: found.gstPercent || 0,
          discPercent: found.discPercent || 0,
          vendor: found.vendor || "N/A",
          batchNo: found.batchNo || "",
          hsnCode: found.hsnCode || "",
        });
      } else {
        console.log("NO MATCH: " + med);
      }
    }

    console.log("Matched: " + matched.length + " / " + medicines.length);

    // Cleanup
    if (filePath && fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    console.log("========== PRESCRIPTION UPLOAD COMPLETE ==========\n");

    return res.json({
      success: matched.length > 0,
      message: matched.length > 0
        ? "Found " + matched.length + " matching medicines"
        : "No matching medicines found",
      matchedCount: matched.length,
      medicines: matched,
    });

  } catch (error) {
    console.log("ERROR: " + error.message);
    console.log("Stack: " + error.stack);

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
    });
  }
};

function extractMedicinesFromText(text) {
  const lines = text.split("\n").map(l => l.trim()).filter(l => l);
  let startIdx = -1;

  for (let i = 0; i < lines.length; i++) {
    if (lines[i].toLowerCase().includes("brand") && lines[i].toLowerCase().includes("strength")) {
      startIdx = i;
      break;
    }
  }

  if (startIdx === -1) return [];

  const medicines = [];
  const endMarkers = ["investigation", "observation", "diagnosis"];

  for (let i = startIdx + 1; i < lines.length; i++) {
    const line = lines[i];

    if (endMarkers.some(m => line.toLowerCase().includes(m))) break;
    if (!line || line.length === 0) continue;
    if (line.includes("---") || line.includes("---")) continue;

    let medName = line;

    if (line.includes("|")) {
      medName = line.split("|")[0];
    } else {
      const parts = line.split(/\s{2,}/);
      medName = parts[0];
    }

    medName = medName.replace(/^\d+[\.\)]\s*/, "").trim();

    if (medName.length >= 3 && /[a-zA-Z]/.test(medName)) {
      medicines.push(medName);
    }
  }

  return medicines;
}

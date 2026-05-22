const fs = require("fs");
const vision = require("@google-cloud/vision");
const Medicine = require("../models/Medicine");

const client = new vision.ImageAnnotatorClient();

exports.extractMedicinesFromPrescription = async (req, res) => {
  let filePath = null;

  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: "No file uploaded" });
    }

    filePath = req.file.path;
    const fileName = req.file.originalname;
    const mimeType = req.file.mimetype;

    console.log(`\n📄 Processing: ${fileName}`);

    // Validate file
    if (!fs.existsSync(filePath)) {
      return res.status(400).json({ success: false, message: "File not found" });
    }

    const stats = fs.statSync(filePath);
    if (stats.size === 0) {
      if (filePath) fs.unlinkSync(filePath);
      return res.status(400).json({ success: false, message: "File is empty" });
    }

    // Extract text using Google Vision
    console.log("🔍 Extracting text with Google Vision OCR...");
    const imageBuffer = fs.readFileSync(filePath);

    let extractedText = "";
    try {
      const request = {
        image: { content: imageBuffer },
        features: [{ type: "TEXT_DETECTION" }],
      };

      const [result] = await client.annotateImage(request);

      if (result.fullTextAnnotation && result.fullTextAnnotation.text) {
        extractedText = result.fullTextAnnotation.text;
      } else if (result.textAnnotations && result.textAnnotations.length > 0) {
        extractedText = result.textAnnotations.map(t => t.description).join("\n");
      }
    } catch (ocrError) {
      console.error("OCR Error:", ocrError.message);
      if (filePath) fs.unlinkSync(filePath);
      return res.status(400).json({ success: false, message: "Could not read the prescription. Please upload a clear image or PDF." });
    }

    if (!extractedText || extractedText.trim().length === 0) {
      if (filePath) fs.unlinkSync(filePath);
      return res.json({ success: true, message: "No text found in image", extractedText: "", matchedMedicines: [], matchedCount: 0 });
    }

    console.log(`✅ Extracted ${extractedText.length} characters`);

    // Extract medicine names
    const medicineNames = extractMedicineNames(extractedText);
    console.log(`💊 Found ${medicineNames.length} medicine names`);

    if (medicineNames.length === 0) {
      if (filePath) fs.unlinkSync(filePath);
      return res.json({ success: true, message: "No medicines found", extractedText, matchedMedicines: [], matchedCount: 0 });
    }

    // Match with database
    console.log("🔗 Matching with database...");
    const matchedMedicines = await matchMedicinesWithDatabase(medicineNames);
    console.log(`✅ Matched ${matchedMedicines.length} medicines`);

    // Cleanup
    if (filePath && fs.existsSync(filePath)) fs.unlinkSync(filePath);

    return res.json({
      success: true,
      message: matchedMedicines.length > 0 ? `Found ${matchedMedicines.length} medicine(s)` : "No matching medicines found",
      extractedText,
      extractedMedicines: medicineNames,
      matchedMedicines,
      matchedCount: matchedMedicines.length,
    });
  } catch (error) {
    console.error("Error:", error.message);
    if (filePath && fs.existsSync(filePath)) fs.unlinkSync(filePath);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

function normalizeText(text) {
  return text.toLowerCase().trim().replace(/\s+/g, " ").replace(/[^\w\s]/g, "").trim();
}

function extractMedicineNames(text) {
  const lines = text.split("\n");
  const medicines = [];
  const skipWords = ["investigation", "signature", "doctor", "patient", "date", "age", "notes", "footer"];

  for (const line of lines) {
    let med = line.trim();

    if (!med || med.length < 3) continue;
    if (skipWords.some(w => med.toLowerCase().includes(w))) continue;
    if (/^\d+$/.test(med)) continue;

    // Remove numbering
    med = med.replace(/^\d+[\.\)]\s*/, "");

    // Extract medicine name before dosage/quantity/frequency
    med = med.split(/\s+(\d+-\d+-\d+|\d+\s*(tablet|capsule|mg|ml|gm|drop|days?|weeks?|morning|evening|night|bd|td|od))/i)[0];

    med = med.trim().replace(/[^\w\s\-]/g, "").trim();

    if (med && med.length >= 3 && /[a-zA-Z]/.test(med) && !medicines.includes(med)) {
      medicines.push(med);
    }
  }

  return medicines;
}

async function matchMedicinesWithDatabase(medicineNames) {
  const matched = [];

  try {
    const dbMedicines = await Medicine.find({ status: "Active" }).lean();

    for (const name of medicineNames) {
      const normalized = normalizeText(name);

      const dbMed = dbMedicines.find(m => normalizeText(m.description) === normalized);

      if (dbMed) {
        matched.push({
          _id: dbMed._id.toString(),
          medicineId: dbMed._id.toString(),
          description: dbMed.description,
          name: dbMed.description,
          mfr: dbMed.mfr || "N/A",
          vendor: dbMed.vendor || "N/A",
          pack: dbMed.pack || "N/A",
          price: dbMed.newMrp || 0,
          mrp: dbMed.newMrp || 0,
          qty: dbMed.qty || 0,
          inStock: (dbMed.qty || 0) > 0,
          gstPercent: dbMed.gstPercent || 5,
        });
      }
    }
  } catch (error) {
    console.error("Database error:", error.message);
  }

  return matched;
}

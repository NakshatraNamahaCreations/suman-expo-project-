const fs = require("fs");
const Medicine = require("../models/Medicine");
const extractTextFromPDF = require("../utils/pdfReader");

/**
 * FRESH IMPLEMENTATION: PDF Prescription Upload
 *
 * Flow:
 * 1. Receive PDF file from mobile app
 * 2. Extract text from PDF using pdf-parse
 * 3. Parse extracted text to get medicine names (Brand & Strength)
 * 4. Match medicine names with database
 * 5. Return matched and unmatched medicines
 */

/* ════════════════════════════════════════════════════════════════
   STEP 1: Extract medicine names from prescription text
   ════════════════════════════════════════════════════════════════ */
function extractMedicineNamesFromText(text) {
  console.log("\n" + "═".repeat(80));
  console.log("🔍 EXTRACTING MEDICINE NAMES FROM TEXT");
  console.log("═".repeat(80));

  if (!text || text.length === 0) {
    console.log("❌ No text provided");
    return [];
  }

  console.log(`📄 Text length: ${text.length} characters`);

  const lines = text.split("\n").map(line => line.trim()).filter(line => line.length > 0);
  console.log(`📋 Total lines: ${lines.length}`);

  // Look for "Brand & Strength" section
  let brandStrengthStartIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    const lower = lines[i].toLowerCase();
    if (lower.includes("brand") && lower.includes("strength")) {
      brandStrengthStartIdx = i;
      console.log(`✓ Found "Brand & Strength" header at line ${i}`);
      break;
    }
  }

  // If "Brand & Strength" section not found, return empty
  if (brandStrengthStartIdx === -1) {
    console.log("⚠️  'Brand & Strength' header not found in prescription");
    return [];
  }

  // Find where the Brand & Strength section ends (look for other headers like "Investigation", "Diagnosis", etc.)
  let endIdx = lines.length;
  const endMarkers = ["investigation", "observation", "diagnosis", "note", "advice", "instruction"];

  for (let i = brandStrengthStartIdx + 1; i < lines.length; i++) {
    const lower = lines[i].toLowerCase();
    if (endMarkers.some(marker => lower.includes(marker))) {
      endIdx = i;
      console.log(`✓ Found section end at line ${i}`);
      break;
    }
  }

  // Extract medicine names from Brand & Strength section
  const medicineLines = lines.slice(brandStrengthStartIdx + 1, endIdx);
  console.log(`\n📊 Processing ${medicineLines.length} lines from Brand & Strength section`);

  const medicines = [];
  const formTypes = /^(tablet|capsule|syrup|injection|cream|gel|ointment|drops|liquid|cap|tab|inj)/i;

  for (let i = 0; i < medicineLines.length; i++) {
    const line = medicineLines[i];

    // Skip empty lines and lines that are too short
    if (!line || line.length < 3) continue;

    // Skip lines that look like table headers or metadata
    if (/^\s*dose|frequency|duration|instruction|food|meal/i.test(line)) continue;

    let medicineName = line;

    // Remove leading numbers (1., 2), etc.)
    medicineName = medicineName.replace(/^\d+[\.\)]\s*/, "").trim();

    // Extract first column (before multiple spaces or tabs)
    const firstColMatch = medicineName.match(/^([^\t\s]{1,}(?:\s+[^\t\s]{1,})*?)(?:\t|\s{2,}|$)/);
    if (firstColMatch) {
      medicineName = firstColMatch[1].trim();
    }

    // Remove form type prefix (TABLET, CAPSULE, etc.)
    medicineName = medicineName.replace(formTypes, "").trim();

    // Clean up
    medicineName = medicineName.replace(/[,;:\.\?\!]*$/, "").replace(/\s+/g, " ").trim();

    // Skip if too short
    if (medicineName.length < 3) continue;

    // Skip if no letters
    if (!/[a-zA-Z]/.test(medicineName)) continue;

    // Skip common non-medicine words
    const skipWords = ["dose", "freq", "duration", "instruction", "food", "meal"];
    if (skipWords.some(w => medicineName.toLowerCase() === w)) continue;

    medicines.push(medicineName);
    console.log(`   [${medicines.length}] ${medicineName}`);
  }

  console.log(`\n✅ EXTRACTED ${medicines.length} MEDICINE NAMES`);
  console.log("═".repeat(80));

  return medicines;
}

/* ════════════════════════════════════════════════════════════════
   STEP 2: Match extracted medicine names with database
   ════════════════════════════════════════════════════════════════ */
function normalizeName(name) {
  return name
    .toLowerCase()
    .trim()
    .replace(/\b(tablet|capsule|syrup|injection|cream|gel|ointment|drops|liquid|cap|tab|inj)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

function matchMedicineWithDatabase(extractedName, dbMedicines) {
  if (!extractedName || extractedName.trim().length < 3) return null;

  const searchNorm = normalizeName(extractedName);
  const searchTokens = searchNorm.split(/\s+/).filter(t => t.length >= 2);

  // Strategy 1: Exact normalized match
  let match = dbMedicines.find(med => {
    const descNorm = normalizeName(med.description || "");
    return descNorm === searchNorm;
  });
  if (match) {
    console.log(`   ✅ EXACT MATCH: "${extractedName}" → "${match.description}"`);
    return match;
  }

  // Strategy 2: All tokens appear in database medicine
  if (searchTokens.length > 0) {
    match = dbMedicines.find(med => {
      const descNorm = normalizeName(med.description || "");
      return searchTokens.every(token => descNorm.includes(token));
    });
    if (match) {
      console.log(`   ✅ TOKEN MATCH: "${extractedName}" → "${match.description}"`);
      return match;
    }
  }

  // Strategy 3: Substring match
  if (searchNorm.length >= 4) {
    match = dbMedicines.find(med => {
      const descNorm = normalizeName(med.description || "");
      return descNorm.includes(searchNorm) || searchNorm.includes(descNorm);
    });
    if (match) {
      console.log(`   ✅ SUBSTRING MATCH: "${extractedName}" → "${match.description}"`);
      return match;
    }
  }

  console.log(`   ❌ NO MATCH: "${extractedName}"`);
  return null;
}

/* ════════════════════════════════════════════════════════════════
   MAIN CONTROLLER: Extract Medicines from PDF
   ════════════════════════════════════════════════════════════════ */
exports.extractMedicines = async (req, res) => {
  let filePath = null;

  try {
    console.log("\n" + "═".repeat(80));
    console.log("📥 PDF PRESCRIPTION UPLOAD - NEW IMPLEMENTATION");
    console.log("═".repeat(80));

    // Validate file
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "No file uploaded",
        medicines: [],
        unmatchedMedicines: [],
      });
    }

    filePath = req.file.path;
    const fileName = req.file.originalname;
    const mimeType = req.file.mimetype;

    console.log(`\n📄 FILE INFO:`);
    console.log(`   Name: ${fileName}`);
    console.log(`   Type: ${mimeType}`);
    console.log(`   Path: ${filePath}`);

    // STEP 1: Extract text from PDF
    console.log(`\n📖 READING PDF FILE...`);
    let extractedText = "";

    try {
      extractedText = await extractTextFromPDF(filePath);
      console.log(`✅ PDF text extracted: ${extractedText.length} characters`);
    } catch (err) {
      console.error(`❌ PDF extraction failed: ${err.message}`);
      extractedText = "";
    }

    // If no text extracted
    if (!extractedText || extractedText.trim().length === 0) {
      console.log("❌ Could not extract text from PDF");
      fs.unlinkSync(filePath);
      return res.status(400).json({
        success: false,
        message: "Could not extract text from PDF. The file might be corrupted or in an unsupported format.",
        medicines: [],
        unmatchedMedicines: [],
      });
    }

    // Log extracted text
    console.log(`\n📋 EXTRACTED TEXT (first 500 chars):`);
    console.log("─".repeat(80));
    console.log(extractedText.substring(0, 500));
    console.log("─".repeat(80));

    // STEP 2: Extract medicine names from the text
    const extractedMedicines = extractMedicineNamesFromText(extractedText);

    if (extractedMedicines.length === 0) {
      console.log("\n⚠️  No medicines could be extracted from the 'Brand & Strength' section");
      fs.unlinkSync(filePath);
      return res.status(400).json({
        success: false,
        message: "No medicines found in the 'Brand & Strength' section of the prescription.",
        medicines: [],
        unmatchedMedicines: [],
      });
    }

    // STEP 3: Load all medicines from database
    console.log(`\n📚 LOADING DATABASE MEDICINES...`);
    const dbMedicines = await Medicine.find({});
    console.log(`✅ Loaded ${dbMedicines.length} medicines from database`);

    // STEP 4: Match extracted medicines with database
    console.log(`\n🔗 MATCHING WITH DATABASE:`);
    console.log("─".repeat(80));

    const matchedMedicines = [];
    const unmatchedMedicines = [];

    for (const medName of extractedMedicines) {
      const dbMatch = matchMedicineWithDatabase(medName, dbMedicines);

      if (dbMatch) {
        matchedMedicines.push({
          medicineId: dbMatch._id.toString(),
          name: dbMatch.description,
          description: dbMatch.description,
          mfr: dbMatch.mfr || "Unknown",
          price: dbMatch.newMrp || dbMatch.price || 0,
          stock: dbMatch.qty || 0,
          unit: dbMatch.unit || "tablets",
          extractedName: medName,
        });
      } else {
        unmatchedMedicines.push({
          name: medName,
        });
      }
    }

    console.log("─".repeat(80));

    // STEP 5: Prepare response
    console.log(`\n📊 RESULTS:`);
    console.log(`   ✅ Matched: ${matchedMedicines.length}`);
    console.log(`   ❌ Unmatched: ${unmatchedMedicines.length}`);

    // Clean up uploaded file
    try {
      fs.unlinkSync(filePath);
    } catch (err) {
      console.warn("⚠️  Could not delete uploaded file");
    }

    console.log("\n✅ REQUEST COMPLETED SUCCESSFULLY");
    console.log("═".repeat(80) + "\n");

    res.json({
      success: true,
      message: matchedMedicines.length > 0
        ? `✓ Found ${matchedMedicines.length} matching medicine(s)`
        : "No matching medicines found in database",
      medicines: matchedMedicines,
      unmatchedMedicines: unmatchedMedicines,
      matchedCount: matchedMedicines.length,
      unmatchedCount: unmatchedMedicines.length,
    });

  } catch (error) {
    console.error("\n" + "═".repeat(80));
    console.error("❌ FATAL ERROR");
    console.error("═".repeat(80));
    console.error("Error:", error.message);
    console.error("Stack:", error.stack?.substring(0, 300));
    console.error("═".repeat(80) + "\n");

    // Clean up if file exists
    if (filePath) {
      try {
        fs.unlinkSync(filePath);
      } catch (err) {
        console.warn("⚠️  Could not delete uploaded file");
      }
    }

    res.status(500).json({
      success: false,
      message: "Error processing prescription file",
      error: error.message,
      medicines: [],
      unmatchedMedicines: [],
    });
  }
};

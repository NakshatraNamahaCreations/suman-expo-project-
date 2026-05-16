const Prescription = require("../models/Prescription");
const Medicine = require("../models/Medicine");
const fs = require("fs");
const XLSX = require("xlsx");
const extractTextFromPDF = require("../utils/pdfReader");
const { extractTextFromImage, parsePrescriptionText } = require("../utils/imageOCR");

/* ════════════════════════════════════════════════════════════════
   HELPER: Simple Medicine Matching
   ════════════════════════════════════════════════════════════════ */
function matchMedicineToDatabase(medicineName, dbMedicines) {
  if (!medicineName || medicineName.trim().length < 2) return null;

  const searchName = medicineName.toLowerCase().trim();

  // Strategy 1: Exact match (100% match)
  let match = dbMedicines.find(
    (med) => (med.description || "").toLowerCase() === searchName
  );
  if (match) {
    console.log(`     ✓ Strategy 1 (Exact): "${medicineName}" → "${match.description}"`);
    return match;
  }

  // Strategy 2: Partial match - check if search string is contained in description
  match = dbMedicines.find((med) => {
    const desc = (med.description || "").toLowerCase();
    return desc.includes(searchName) || searchName.includes(desc);
  });
  if (match) {
    console.log(`     ✓ Strategy 2 (Partial): "${medicineName}" → "${match.description}"`);
    return match;
  }

  // Strategy 3: Token matching - split by spaces and match tokens
  const searchTokens = searchName.split(/\s+/).filter((t) => t.length >= 2);
  if (searchTokens.length > 0) {
    let bestMatch = null;
    let bestScore = 0;

    for (const med of dbMedicines) {
      const desc = (med.description || "").toLowerCase();
      const matchingTokens = searchTokens.filter((token) =>
        desc.includes(token)
      );
      const score = matchingTokens.length / searchTokens.length;

      if (score > bestScore && score >= 0.4) {
        bestScore = score;
        bestMatch = med;
      }
    }

    if (bestMatch) {
      console.log(`     ✓ Strategy 3 (Token ${(bestMatch ? 100 * bestScore : 0).toFixed(0)}%): "${medicineName}" → "${bestMatch.description}"`);
      return bestMatch;
    }
  }

  console.log(`     ✗ No match: "${medicineName}"`);
  return null;
}

/* ════════════════════════════════════════════════════════════════
   EXTRACT MEDICINES FROM UPLOADED FILE
   ════════════════════════════════════════════════════════════════ */
exports.extractMedicines = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "No file uploaded",
      });
    }

    const { mimetype, path: filePath } = req.file;
    console.log(
      `\n📥 Processing file: ${req.file.originalname} (${mimetype})`
    );

    // Load all active medicines from database
    const dbMedicines = await Medicine.find({ status: "Active" }).lean();
    console.log(`📚 Loaded ${dbMedicines.length} medicines from database`);

    let extractedMedicines = [];
    let extractedText = "";
    let extractedDoctor = null;
    let fileType = "unknown";

    // ══════════════════════════════════════════════════════════════
    // PROCESS BASED ON FILE TYPE
    // ══════════════════════════════════════════════════════════════

    if (mimetype.includes("pdf")) {
      fileType = "pdf";
      console.log("📄 Processing PDF file...");
      try {
        extractedText = await extractTextFromPDF(filePath);
        console.log(
          `   ✓ Extracted ${extractedText?.length || 0} characters from PDF`
        );
      } catch (err) {
        console.error("   ✗ PDF extraction failed:", err.message);
      }
    } else if (mimetype.startsWith("image/")) {
      fileType = "image";
      console.log("📷 Processing image file...");
      try {
        extractedText = await extractTextFromImage(filePath);
        console.log(
          `   ✓ Extracted ${extractedText?.length || 0} characters from image`
        );
      } catch (err) {
        console.error("   ✗ Image extraction failed:", err.message);
      }
    } else if (
      mimetype.includes("spreadsheet") ||
      mimetype.includes("excel") ||
      mimetype.includes("csv")
    ) {
      fileType = "excel";
      console.log("📊 Processing Excel/CSV file...");
      try {
        const wb = XLSX.readFile(filePath);
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(ws, { header: 1 });

        // Extract medicine names from rows
        for (let i = 1; i < rows.length; i++) {
          const row = rows[i];
          if (!row || row.length === 0) continue;

          // Get first column as medicine name
          const medName = String(row[0] || "").trim();
          if (medName.length >= 2) {
            extractedMedicines.push({
              name: medName,
              frequency: "1-0-1",
              duration: 5,
            });
          }
        }
        console.log(`   ✓ Extracted ${extractedMedicines.length} medicines`);
      } catch (err) {
        console.error("   ✗ Excel extraction failed:", err.message);
      }
    }

    // ══════════════════════════════════════════════════════════════
    // EXTRACT MEDICINES FROM TEXT
    // ══════════════════════════════════════════════════════════════
    if (extractedText && extractedMedicines.length === 0) {
      console.log("🔍 Extracting medicine names from text...");

      // Use parsePrescriptionText to extract structured data
      const parsed = parsePrescriptionText(extractedText);
      if (parsed && parsed.medicines && parsed.medicines.length > 0) {
        extractedMedicines = parsed.medicines;
        extractedDoctor = parsed.doctor || null;
        console.log(`   ✓ Extracted ${extractedMedicines.length} medicines`);
        if (extractedDoctor) console.log(`   ✓ Doctor: ${extractedDoctor}`);
      } else {
        // Fallback: Extract lines that look like medicine names
        const lines = extractedText.split("\n");
        for (const line of lines) {
          const cleaned = line
            .replace(/^[-•*]\s*/, "") // Remove bullets
            .replace(/^\d+[.)]\s*/, "") // Remove numbering
            .trim();

          if (cleaned.length >= 3 && cleaned.length < 100) {
            // Basic medicine name validation
            const hasLetters = /[a-zA-Z]/.test(cleaned);
            const notHeader = !/doctor|patient|date|signature|clinic/i.test(
              cleaned
            );

            if (hasLetters && notHeader) {
              extractedMedicines.push({
                name: cleaned,
                frequency: "1-0-1",
                duration: 5,
              });
            }
          }
        }
        console.log(`   ✓ Extracted ${extractedMedicines.length} lines`);
      }
    }

    // ══════════════════════════════════════════════════════════════
    // MATCH EXTRACTED MEDICINES WITH DATABASE
    // ══════════════════════════════════════════════════════════════
    console.log("\n🔗 Matching medicines with database...");

    const matchedMedicines = [];
    const unmatchedMedicines = [];

    const seenMedicines = new Set();

    for (const med of extractedMedicines) {
      const dbMatch = matchMedicineToDatabase(med.name, dbMedicines);

      if (dbMatch) {
        const medKey = dbMatch._id.toString();
        if (seenMedicines.has(medKey)) {
          console.log(`     (Already added, skipping duplicate)`);
          continue;
        }
        seenMedicines.add(medKey);

        // Parse frequency to calculate daily doses
        let dailyDoses = 2;
        if (med.frequency) {
          const parts = med.frequency.split("-").map((p) => parseInt(p) || 0);
          dailyDoses = parts.reduce((a, b) => a + b, 0);
          if (dailyDoses === 0) dailyDoses = 2;
        }

        const duration = med.duration || 5;
        const qty = dailyDoses * duration;

        matchedMedicines.push({
          medicineId: dbMatch._id.toString(),
          name: dbMatch.description,
          description: dbMatch.description,
          mfr: dbMatch.mfr || "",
          price: dbMatch.newMrp || 0,
          stock: dbMatch.qty || 0,
          frequency: med.frequency || "1-0-1",
          duration,
          qty,
        });
      } else {
        unmatchedMedicines.push({
          name: med.name,
        });
      }
    }

    console.log(
      `\n📊 Results: ${matchedMedicines.length} matched, ${unmatchedMedicines.length} unmatched`
    );

    // Clean up uploaded file
    try {
      fs.unlinkSync(filePath);
    } catch (err) {
      console.warn("Warning: Could not delete uploaded file");
    }

    // ══════════════════════════════════════════════════════════════
    // RETURN RESPONSE
    // ══════════════════════════════════════════════════════════════
    const baseResponse = {
      success: true,
      fileType,
      matchedCount: matchedMedicines.length,
      unmatchedCount: unmatchedMedicines.length,
      doctor: extractedDoctor || "To be verified",
      medicines: matchedMedicines,
      unmatchedMedicines,
    };

    if (matchedMedicines.length > 0) {
      baseResponse.message = `✓ Found ${matchedMedicines.length} matching medicine(s) in your inventory`;
      res.json(baseResponse);
    } else {
      baseResponse.message =
        "No matching medicines found in your inventory database. Please check the prescription or add these medicines to your inventory.";
      res.json(baseResponse);
    }
  } catch (error) {
    console.error("\n❌ EXTRACTION ERROR:", error);
    try {
      fs.unlinkSync(req.file?.path);
    } catch {}
    res.status(500).json({
      success: false,
      message: "Error processing prescription file",
      error: error.message,
    });
  }
};

/* ════════════════════════════════════════════════════════════════
   SAVE PRESCRIPTION (After extraction and review)
   ════════════════════════════════════════════════════════════════ */
exports.savePrescription = async (req, res) => {
  try {
    const { medicines, doctor, patientId } = req.body;

    if (!medicines || medicines.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No medicines provided",
      });
    }

    // Save prescription
    const prescription = new Prescription({
      doctor: doctor || "Unknown Doctor",
      patientId,
      date: new Date(),
      meds: medicines.map((m) => ({
        medicine: m.medicineId,
        freq: m.frequency || { m: 1, a: 0, n: 1 },
        duration: m.duration || 5,
        qty: m.qty || 1,
      })),
    });

    await prescription.save();

    res.json({
      success: true,
      message: "Prescription saved successfully",
      prescription,
    });
  } catch (error) {
    console.error("Save prescription error:", error);
    res.status(500).json({
      success: false,
      message: "Error saving prescription",
      error: error.message,
    });
  }
};

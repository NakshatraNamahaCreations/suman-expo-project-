const Prescription = require("../models/Prescription");
const Medicine = require("../models/Medicine");
const fs = require("fs");
const XLSX = require("xlsx");
const extractTextFromPDF = require("../utils/pdfReader");
const { extractTextFromImage, parsePrescriptionText } = require("../utils/imageOCR");

/* ════════════════════════════════════════════════════════════════
   HELPER: Extract medicines from Brand & Strength column
   ════════════════════════════════════════════════════════════════ */
function extractBrandAndStrengthMedicines(text) {
  if (!text || text.length < 10) return [];

  console.log("\n🔍 Extracting medicines from Brand & Strength column...");

  const medicines = [];
  const lines = text.split("\n");
  let inMedicineSection = false;
  let medicineLines = [];

  // Find the Brand & Strength section
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lowerLine = line.toLowerCase();

    // Look for "Brand & Strength" header
    if (lowerLine.includes("brand") && lowerLine.includes("strength")) {
      console.log(`   Found Brand & Strength header at line ${i}`);
      inMedicineSection = true;
      continue;
    }

    // Stop when we reach other sections
    if (inMedicineSection && (lowerLine.includes("investigation") || lowerLine.includes("diagnosis") || lowerLine.includes("observation"))) {
      break;
    }

    // Collect medicine lines - look for numbered entries or tab-separated values
    if (inMedicineSection && line.trim().length > 2) {
      medicineLines.push(line);
    }
  }

  console.log(`   Collected ${medicineLines.length} lines from medicine section`);

  // Extract medicines from collected lines
  for (const line of medicineLines) {
    // Skip header and empty lines
    if (line.toLowerCase().includes("brand") || line.toLowerCase().includes("dose") || line.toLowerCase().includes("frequency")) {
      continue;
    }

    // Extract medicine name from line
    // Could be: "1. TABLET CETIRIZINE 10 MG" or "TABLET CETIRIZINE 10 MG \t ..."
    let medName = line.trim();

    // Remove leading numbers and dots (1., 2., etc.)
    medName = medName.replace(/^\d+[.):\s-]+/, "").trim();

    // Remove tab-separated content (keep only first part before tabs)
    if (medName.includes("\t")) {
      medName = medName.split("\t")[0].trim();
    }

    // Skip if line contains dose/frequency indicators - we only want medicine names
    if (/^\d+\s*[-–]\s*\d|frequency|dose|instruction|duration|days?|tablet|capsule|ml|mg/i.test(medName)) {
      // This might be a header or metadata, parse the medicine name part
      const match = medName.match(/^([A-Z\s]+(?:TABLET|CAPSULE|SYRUP|INJECTION|CREAM|GEL|OINTMENT|LOTION)[A-Z0-9\s]*)/i);
      if (match) {
        medName = match[1].trim();
      } else {
        continue;
      }
    }

    // Clean medicine name
    medName = medName
      .replace(/\s+/g, " ") // Normalize spaces
      .replace(/[^a-zA-Z0-9\s%-]/g, "") // Remove special characters
      .trim();

    // Validate medicine name
    if (medName.length >= 4 && /[A-Z]/i.test(medName)) {
      if (!medicines.includes(medName)) {
        medicines.push(medName);
        console.log(`   ✓ Extracted: "${medName}"`);
      }
    }
  }

  if (medicines.length === 0) {
    console.log(`   ⚠️  No medicines found in Brand & Strength section`);
  }

  return medicines;
}

/* ════════════════════════════════════════════════════════════════
   HELPER: Smart Medicine Matching (Brand & Strength focused)
   ════════════════════════════════════════════════════════════════ */
function matchMedicineToDatabase(medicineName, dbMedicines) {
  if (!medicineName || medicineName.trim().length < 2) return null;

  const searchName = medicineName.toLowerCase().trim();
  // Remove common prefixes and suffixes
  const normalized = searchName
    .replace(/^(tablet|capsule|syrup|injection|cream|gel|ointment|lotion|powder|drops|spray)\s+/i, "")
    .replace(/\s+(tablet|capsule|syrup|injection|cream|gel|ointment|lotion|powder|drops|spray)$/i, "")
    .toLowerCase()
    .trim();

  console.log(`     Searching: "${medicineName}" (normalized: "${normalized}")`);

  // Strategy 1: Exact match on description
  let match = dbMedicines.find(
    (med) => (med.description || "").toLowerCase() === searchName
  );
  if (match) {
    console.log(`     ✓ Strategy 1 (Exact): "${medicineName}" → "${match.description}"`);
    return match;
  }

  // Strategy 2: Exact match on normalized (without form type)
  match = dbMedicines.find((med) => {
    const descNorm = (med.description || "")
      .toLowerCase()
      .replace(/^(tablet|capsule|syrup|injection|cream|gel|ointment|lotion|powder|drops|spray)\s+/i, "")
      .replace(/\s+(tablet|capsule|syrup|injection|cream|gel|ointment|lotion|powder|drops|spray)$/i, "")
      .trim();
    return descNorm === normalized;
  });
  if (match) {
    console.log(`     ✓ Strategy 2 (Normalized): "${medicineName}" → "${match.description}"`);
    return match;
  }

  // Strategy 3: Partial substring match
  match = dbMedicines.find((med) => {
    const desc = (med.description || "").toLowerCase();
    // Check if any significant part of the medicine name is in the description
    if (searchName.length > 5 && desc.includes(searchName)) return true;
    if (normalized.length > 5 && desc.includes(normalized)) return true;
    return false;
  });
  if (match) {
    console.log(`     ✓ Strategy 3 (Substring): "${medicineName}" → "${match.description}"`);
    return match;
  }

  // Strategy 4: Token matching with at least 50% match
  const searchTokens = normalized
    .split(/\s+/)
    .filter((t) => t.length >= 2 && !/^\d+$/.test(t)); // Exclude pure numbers

  if (searchTokens.length > 0) {
    let bestMatch = null;
    let bestScore = 0;

    for (const med of dbMedicines) {
      const desc = (med.description || "").toLowerCase();
      const descTokens = desc.split(/\s+/).filter((t) => t.length >= 2);

      // Count matching tokens
      const matchingTokens = searchTokens.filter((token) =>
        descTokens.some((dToken) => dToken.includes(token) || token.includes(dToken))
      );

      const score = matchingTokens.length / searchTokens.length;

      if (score > bestScore && score >= 0.5) {
        bestScore = score;
        bestMatch = med;
      }
    }

    if (bestMatch) {
      console.log(
        `     ✓ Strategy 4 (Token ${(bestScore * 100).toFixed(0)}%): "${medicineName}" → "${bestMatch.description}"`
      );
      return bestMatch;
    }
  }

  console.log(`     ✗ No match found for: "${medicineName}"`);
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

      // Strategy 1: Try to extract from Brand & Strength column
      let brandStrengthMedicines = extractBrandAndStrengthMedicines(extractedText);

      if (brandStrengthMedicines.length > 0) {
        console.log(`   ✓ Found ${brandStrengthMedicines.length} medicines in Brand & Strength column`);
        extractedMedicines = brandStrengthMedicines.map((name) => ({
          name,
          frequency: "1-0-1",
          duration: 5,
        }));
      } else {
        // Strategy 2: Use parsePrescriptionText as fallback
        console.log(`   Trying parsePrescriptionText as fallback...`);
        const parsed = parsePrescriptionText(extractedText);
        if (parsed && parsed.medicines && parsed.medicines.length > 0) {
          extractedMedicines = parsed.medicines;
          extractedDoctor = parsed.doctor || null;
          console.log(`   ✓ Extracted ${extractedMedicines.length} medicines from parsed text`);
          if (extractedDoctor) console.log(`   ✓ Doctor: ${extractedDoctor}`);
        } else {
          // Strategy 3: Fallback to line-by-line extraction
          console.log(`   Trying line-by-line extraction as final fallback...`);
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
          console.log(`   ✓ Extracted ${extractedMedicines.length} lines from text`);
        }
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

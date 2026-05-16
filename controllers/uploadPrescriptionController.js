const Prescription = require("../models/Prescription");
const Medicine = require("../models/Medicine");
const fs = require("fs");
const XLSX = require("xlsx");
const extractTextFromPDF = require("../utils/pdfReader");
const { extractTextFromImage, parsePrescriptionText } = require("../utils/imageOCR");

/* ════════════════════════════════════════════════════════════════
   HELPER: Extract medicines from Brand & Strength column (Table Parsing)
   ════════════════════════════════════════════════════════════════ */
function extractBrandAndStrengthMedicines(text) {
  if (!text || text.length < 10) {
    console.log("⚠️  Text too short to parse");
    return [];
  }

  console.log("\n" + "=".repeat(80));
  console.log("🔍 EXTRACTING MEDICINES FROM PRESCRIPTION");
  console.log("=".repeat(80));

  const medicines = [];
  const allLines = text.split("\n");

  console.log(`📄 Total lines in raw text: ${allLines.length}`);

  // Medicine prefix patterns
  const medPrefixPattern = /^(tablet|capsule|syrup|injection|cream|gel|ointment|drops|suspension|spray|patch|liquid|powder)\s+/i;
  const numberedPattern = /^\d+[\.\)]\s*/;

  // Find the "Brand & Strength" header line (optional - some PDFs have it)
  let headerLineIdx = -1;
  for (let i = 0; i < allLines.length; i++) {
    const line = allLines[i];
    if (line.toLowerCase().includes("brand") && line.toLowerCase().includes("strength")) {
      headerLineIdx = i;
      console.log(`\n✓ Found "Brand & Strength" header at line ${i}`);
      break;
    }
  }

  if (headerLineIdx === -1) {
    console.log("\n⚠️  'Brand & Strength' header not found - will extract medicines from any medicine-looking lines");
  }

  // Find where the medicine table ends (look for "Investigation", "Observation", etc.)
  let tableEndIdx = allLines.length;
  const endMarkers = ["investigation", "observation", "diagnosis", "note", "sign", "advice", "instruction", "follow"];

  if (headerLineIdx !== -1) {
    // If we found a table header, look for the end
    for (let i = headerLineIdx + 1; i < allLines.length; i++) {
      const lower = allLines[i].toLowerCase().trim();
      if (lower.length > 5 && endMarkers.some(marker => lower.includes(marker))) {
        tableEndIdx = i;
        console.log(`✓ Found table end at line ${i}`);
        break;
      }
    }
    console.log(`\n📋 Processing lines ${headerLineIdx + 1} to ${tableEndIdx - 1}`);
  } else {
    // If no header found, process all lines looking for medicine patterns
    console.log(`\n📋 Scanning all ${allLines.length} lines for medicine patterns`);
  }

  console.log("-".repeat(80));

  // Determine which lines to process
  const linesToProcess = headerLineIdx !== -1
    ? allLines.slice(headerLineIdx + 1, tableEndIdx)
    : allLines;

  // Process each line
  for (let i = 0; i < linesToProcess.length; i++) {
    const rawLine = linesToProcess[i];

    // Skip empty lines
    if (!rawLine || rawLine.trim().length < 3) {
      continue;
    }

    console.log(`\n[Line ${i}] "${rawLine.substring(0, 100)}${rawLine.length > 100 ? '...' : ''}"`);

    let medName = rawLine.trim();

    // Remove leading number (1., 2., 1), 2), etc.)
    medName = medName.replace(numberedPattern, "").trim();

    // Now extract only the Brand & Strength part (before other columns)
    // Columns are typically separated by 2+ spaces or tabs
    const columnSeparator = medName.match(/\t+|\s{2,}/);
    if (columnSeparator && columnSeparator.index > 0) {
      medName = medName.substring(0, columnSeparator.index).trim();
      console.log(`  After extracting first column: "${medName}"`);
    }

    // Check if line starts with medicine form type (TABLET, CAPSULE, etc)
    const hasMedicineForm = medPrefixPattern.test(medName);

    // Clean up
    medName = medName
      .replace(/\s+/g, " ") // Normalize spaces
      .replace(/[,;:\.\?\!]+$/, "") // Remove trailing punctuation
      .trim();

    // Skip if empty after cleaning
    if (medName.length < 4) {
      console.log(`  ❌ SKIP: Too short (${medName.length} chars)`);
      continue;
    }

    // Must have at least some letters
    if (!/[a-zA-Z]/i.test(medName)) {
      console.log(`  ❌ SKIP: No letters found`);
      continue;
    }

    // Must not be just common metadata
    const metadata = ["dose", "freq", "frequency", "duration", "instruction", "instructions", "food", "meal", "day", "days", "hrs", "hours", "times", "morning", "afternoon", "evening", "night", "route"];
    if (metadata.includes(medName.toLowerCase())) {
      console.log(`  ❌ SKIP: Metadata word`);
      continue;
    }

    // If we found a medicine form (TABLET, CAPSULE, etc), likely a medicine
    // Or if it looks like a proper medicine name
    const isMedicineLike = hasMedicineForm ||
      (/^[A-Z]/i.test(medName) && (medName.match(/[a-zA-Z]{3,}/g) || []).length >= 1);

    if (!isMedicineLike) {
      console.log(`  ❌ SKIP: Doesn't look like a medicine`);
      continue;
    }

    // Check for duplicates
    if (medicines.some(m => m.toLowerCase() === medName.toLowerCase())) {
      console.log(`  ℹ️  SKIP: Duplicate`);
      continue;
    }

    medicines.push(medName);
    console.log(`  ✅ ADDED: "${medName}"`);
  }

  console.log("\n" + "=".repeat(80));
  console.log(`📊 MEDICINES EXTRACTED: ${medicines.length}`);
  if (medicines.length > 0) {
    medicines.forEach((med, idx) => {
      console.log(`   ${idx + 1}. "${med}"`);
    });
  } else {
    console.log("   (none found)");
  }
  console.log("=".repeat(80) + "\n");

  return medicines;
}

/* ════════════════════════════════════════════════════════════════
   HELPER: Medicine Matching - Simple and Reliable
   ════════════════════════════════════════════════════════════════ */
function matchMedicineToDatabase(medicineName, dbMedicines) {
  if (!medicineName || medicineName.trim().length < 3) return null;

  const searchLower = medicineName.toLowerCase().trim();

  console.log(`\n     ┌─ Matching: "${medicineName}"`);

  // Remove form types (tablet, capsule, cream, etc) for comparison
  const removeFormTypes = (str) => {
    return str
      .replace(/\b(tablet|capsule|syrup|injection|cream|gel|ointment|lotion|powder|drops|spray|suspension|patch|liquid|solution|injection|inhaler|medicine|medicament)\b/gi, "")
      .trim();
  };

  // Normalize dosages (10 mg -> 10mg, 10 MG -> 10mg)
  const normalizeDosage = (str) => {
    return str
      .replace(/\s+([a-z]*g|iu|units?|%|mcg)\b/gi, "$1") // "10 mg" -> "10mg"
      .replace(/\s+([a-z]*g|iu|units?|%|mcg)/gi, "$1"); // case-insensitive
  };

  const afterRemoveForm = removeFormTypes(searchLower);
  const searchCleaned = normalizeDosage(afterRemoveForm);

  console.log(`     ├─ After removeFormTypes: "${afterRemoveForm}"`);
  console.log(`     ├─ After normalizeDosage: "${searchCleaned}"`);

  // Show database medicines for debugging
  console.log(`     ├─ Checking ${dbMedicines.length} database medicines...`);

  // Strategy 1: Case-insensitive exact match
  let match = dbMedicines.find(
    (med) => (med.description || "").toLowerCase() === searchLower
  );
  if (match) {
    console.log(`     └─ ✓ EXACT MATCH: "${match.description}"`);
    return match;
  }

  // Strategy 2: Match after removing form types and normalizing dosages
  match = dbMedicines.find((med) => {
    const descCleaned = normalizeDosage(removeFormTypes((med.description || "").toLowerCase()));
    return descCleaned === searchCleaned;
  });
  if (match) {
    console.log(`     └─ ✓ FORM-AND-DOSAGE-NORMALIZED MATCH: "${match.description}"`);
    return match;
  }

  // Strategy 3: Check if one is substring of the other (must be significant length)
  if (searchCleaned.length >= 4) {
    match = dbMedicines.find((med) => {
      const desc = normalizeDosage(removeFormTypes((med.description || "").toLowerCase()));
      return desc.includes(searchCleaned) || searchCleaned.includes(desc);
    });
    if (match) {
      console.log(`       ✓ SUBSTRING MATCH: "${match.description}"`);
      return match;
    }
  }

  // Strategy 4: Token-based matching - get main tokens (medicine name, strength)
  // Extract medicine name tokens (exclude pure numbers and dosage units)
  const searchTokens = searchCleaned
    .split(/\s+/)
    .filter((t) => {
      // Keep tokens that are:
      // - At least 2 chars, AND
      // - Either: not pure digits OR not dosage units
      if (t.length < 2) return false;
      if (/^\d+$/.test(t)) return false; // Exclude pure numbers like "10"
      return true;
    });

  if (searchTokens.length >= 1) {
    // Find a medicine where all search tokens appear in description
    match = dbMedicines.find((med) => {
      const desc = normalizeDosage(removeFormTypes((med.description || "").toLowerCase()));
      return searchTokens.every((token) => desc.includes(token));
    });
    if (match) {
      console.log(`       ✓ ALL-TOKENS MATCH: "${match.description}"`);
      return match;
    }
  }

  // Strategy 5: Partial token matching - at least 50% of tokens must match
  if (searchTokens.length >= 1) {
    let bestMatch = null;
    let bestScore = 0;

    for (const med of dbMedicines) {
      const desc = normalizeDosage(removeFormTypes((med.description || "").toLowerCase()));
      const descTokens = desc.split(/\s+/).filter((t) => t.length >= 2 && !/^\d+$/.test(t));

      const matchingTokens = searchTokens.filter((token) =>
        descTokens.some((dToken) => dToken === token || dToken.includes(token) || token.includes(dToken))
      );

      const score = searchTokens.length > 0 ? matchingTokens.length / searchTokens.length : 0;

      if (score > bestScore && score >= 0.5) {
        bestScore = score;
        bestMatch = med;
      }
    }

    if (bestMatch) {
      console.log(`       ✓ PARTIAL-TOKENS MATCH (${(bestScore * 100).toFixed(0)}%): "${bestMatch.description}"`);
      return bestMatch;
    }
  }

  console.log(`     └─ ✗ NO MATCH FOUND`);

  // Debug: Show top database medicines for comparison
  console.log(`     └─ Top 3 database medicines for reference:`);
  dbMedicines.slice(0, 3).forEach((med, idx) => {
    const descCleaned = normalizeDosage(removeFormTypes((med.description || "").toLowerCase()));
    console.log(`        ${idx + 1}. "${med.description}" → cleaned: "${descCleaned}"`);
  });

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

    // Load ALL medicines from database (regardless of status)
    const dbMedicines = await Medicine.find({}).lean();
    console.log(`📚 Loaded ${dbMedicines.length} medicines from database (all statuses)`);

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
        extractedMedicines.length === 0
          ? "No medicines could be extracted from the prescription. Please ensure the prescription is clear and contains medicine names."
          : `No matching medicines found in your inventory database. ${unmatchedMedicines.length} medicine(s) not found: ${unmatchedMedicines.map(m => m.name).join(", ")}. Please check the prescription or add these medicines to your inventory.`;
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

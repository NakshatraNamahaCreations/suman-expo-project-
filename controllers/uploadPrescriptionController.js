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

  console.log("\n" + "═".repeat(80));
  console.log("🔍 EXTRACTING MEDICINES FROM BRAND & STRENGTH COLUMN");
  console.log("═".repeat(80));

  const medicines = [];
  const allLines = text.split("\n");

  console.log(`📄 Total lines: ${allLines.length}`);

  // Form types to recognize and remove
  const formTypes = ["tablet", "capsule", "syrup", "injection", "cream", "gel", "ointment", "lotion", "powder", "drops", "spray", "suspension", "patch", "liquid", "solution", "inhaler", "cap", "tab", "inj", "amp"];
  const formPattern = new RegExp(`^(${formTypes.join("|")})\\s+`, "i");

  // Find Brand & Strength header
  let startIdx = -1;
  let endIdx = allLines.length;

  for (let i = 0; i < allLines.length; i++) {
    const line = allLines[i].toLowerCase();
    if (line.includes("brand") && line.includes("strength")) {
      startIdx = i;
      console.log(`✓ Found "Brand & Strength" header at line ${i}`);
      break;
    }
  }

  // Find where table ends
  if (startIdx !== -1) {
    const endMarkers = ["investigation", "observation", "diagnosis", "note", "advice", "instruction", "sign", "symptom"];
    for (let i = startIdx + 1; i < allLines.length; i++) {
      const lower = allLines[i].toLowerCase().trim();
      if (lower.length > 5 && endMarkers.some(m => lower.includes(m))) {
        endIdx = i;
        console.log(`✓ Found table end at line ${i}`);
        break;
      }
    }
  }

  console.log(`📋 Processing lines ${startIdx + 1} to ${endIdx - 1}`);
  console.log("─".repeat(80));

  const linesToProcess = startIdx !== -1
    ? allLines.slice(startIdx + 1, endIdx)
    : allLines;

  const seenMedicines = new Set();

  for (let i = 0; i < linesToProcess.length; i++) {
    const rawLine = linesToProcess[i].trim();

    // Skip empty lines
    if (!rawLine || rawLine.length < 2) continue;

    console.log(`[${i}] "${rawLine.substring(0, 90)}${rawLine.length > 90 ? "..." : ""}"`);

    let medName = rawLine;

    // Remove leading numbers (1., 2), etc.)
    medName = medName.replace(/^\d+[\.\)]\s*/, "").trim();

    // Extract first column (before multiple spaces or tabs)
    const firstColMatch = medName.match(/^([^\t\s]{1,}(?:\s+[^\t\s]{1,})*?)(?:\t|\s{2,}|$)/);
    if (firstColMatch) {
      medName = firstColMatch[1].trim();
    }

    // Remove form type prefix
    const formMatch = medName.match(formPattern);
    if (formMatch) {
      medName = medName.substring(formMatch[0].length).trim();
      console.log(`   Form removed: "${medName}"`);
    }

    // Clean up whitespace and punctuation
    medName = medName
      .replace(/\s+/g, " ")
      .replace(/[,;:\.\?\!]*$/, "")
      .trim();

    // Validate
    if (medName.length < 3) {
      console.log(`   ❌ Too short`);
      continue;
    }

    if (!/[a-zA-Z]/i.test(medName)) {
      console.log(`   ❌ No letters`);
      continue;
    }

    // Skip common non-medicine words
    const skipWords = ["dose", "freq", "frequency", "duration", "instruction", "food", "meal", "morning", "afternoon", "evening", "night", "after", "before"];
    if (skipWords.some(w => medName.toLowerCase() === w)) {
      console.log(`   ❌ Skip word`);
      continue;
    }

    // Check for duplicates
    const nameLower = medName.toLowerCase();
    if (seenMedicines.has(nameLower)) {
      console.log(`   ℹ️  Duplicate`);
      continue;
    }

    seenMedicines.add(nameLower);
    medicines.push(medName);
    console.log(`   ✅ EXTRACTED: "${medName}"`);
  }

  console.log("\n" + "═".repeat(80));
  console.log(`📊 TOTAL MEDICINES EXTRACTED: ${medicines.length}`);
  if (medicines.length > 0) {
    medicines.forEach((med, idx) => {
      console.log(`   [${idx + 1}] ${med}`);
    });
  } else {
    console.log("   (none found)");
  }
  console.log("═".repeat(80) + "\n");

  return medicines;
}

/* ════════════════════════════════════════════════════════════════
   HELPER: Normalize medicine name for matching
   ════════════════════════════════════════════════════════════════ */
function normalizeMedicineName(str) {
  if (!str) return "";

  return str
    .toLowerCase()
    .trim()
    // Remove form types
    .replace(/\b(tablet|capsule|syrup|injection|cream|gel|ointment|lotion|powder|drops|spray|suspension|patch|liquid|solution|inhaler|cap|tab|inj)\b/gi, "")
    // Normalize spacing around numbers and units
    .replace(/\s+(\d+)\s*([a-z]*g|iu|units?|%|mcg)\b/gi, "$1$2") // "10 mg" → "10mg"
    .replace(/\s+/g, " ") // Multiple spaces to single
    .trim();
}

/* ════════════════════════════════════════════════════════════════
   HELPER: Medicine Matching with improved normalization
   ════════════════════════════════════════════════════════════════ */
function matchMedicineToDatabase(medicineName, dbMedicines) {
  if (!medicineName || medicineName.trim().length < 3) return null;

  const searchNorm = normalizeMedicineName(medicineName);

  console.log(`\n     Matching: "${medicineName}"`);
  console.log(`     Normalized: "${searchNorm}"`);

  // Strategy 1: Exact match after normalization
  let match = dbMedicines.find((med) => {
    const descNorm = normalizeMedicineName(med.description || "");
    return descNorm === searchNorm;
  });
  if (match) {
    console.log(`     ✓ EXACT MATCH: "${match.description}"`);
    return match;
  }

  // Strategy 2: Substring match (either direction)
  if (searchNorm.length >= 4) {
    match = dbMedicines.find((med) => {
      const descNorm = normalizeMedicineName(med.description || "");
      return (
        descNorm.includes(searchNorm) ||
        searchNorm.includes(descNorm)
      );
    });
    if (match) {
      console.log(`     ✓ SUBSTRING MATCH: "${match.description}"`);
      return match;
    }
  }

  // Strategy 3: Token-based matching
  const searchTokens = searchNorm
    .split(/\s+/)
    .filter((t) => t.length >= 2 && !/^\d+$/.test(t));

  console.log(`     Tokens: [${searchTokens.join(", ")}]`);

  if (searchTokens.length >= 1) {
    // Find medicine where ALL search tokens appear
    match = dbMedicines.find((med) => {
      const descNorm = normalizeMedicineName(med.description || "");
      return searchTokens.every((token) => descNorm.includes(token));
    });
    if (match) {
      console.log(`     ✓ ALL-TOKENS MATCH: "${match.description}"`);
      return match;
    }

    // Find best partial match (80%+ tokens match)
    let bestMatch = null;
    let bestScore = 0;

    for (const med of dbMedicines) {
      const descNorm = normalizeMedicineName(med.description || "");
      const descTokens = descNorm.split(/\s+/).filter((t) => t.length >= 2);

      const matchingTokens = searchTokens.filter((sToken) =>
        descTokens.some((dToken) => dToken === sToken || dToken.includes(sToken))
      );

      const score = searchTokens.length > 0
        ? matchingTokens.length / searchTokens.length
        : 0;

      if (score > bestScore && score >= 0.8) {
        bestScore = score;
        bestMatch = med;
      }
    }

    if (bestMatch) {
      console.log(`     ✓ PARTIAL MATCH (${(bestScore * 100).toFixed(0)}%): "${bestMatch.description}"`);
      return bestMatch;
    }
  }

  console.log(`     ✗ NO MATCH FOUND`);
  return null;
}

/* ════════════════════════════════════════════════════════════════
   EXTRACT MEDICINES FROM UPLOADED FILE
   ════════════════════════════════════════════════════════════════ */
exports.extractMedicines = async (req, res) => {
  try {
    console.log("\n" + "═".repeat(80));
    console.log("📥 EXTRACT MEDICINES API CALLED");
    console.log("═".repeat(80));

    if (!req.file) {
      console.log("❌ No file in request");
      return res.status(400).json({
        success: false,
        message: "No file uploaded",
      });
    }

    const { mimetype, path: filePath, originalname } = req.file;
    console.log(`File Name: ${originalname}`);
    console.log(`File Path: ${filePath}`);
    console.log(`MIME Type: ${mimetype}`);
    console.log(`File Exists: ${fs.existsSync(filePath)}`);

    // Load ALL medicines from database (regardless of status)
    console.log("\n📚 Loading medicines from database...");
    const dbMedicines = await Medicine.find({}).lean();
    console.log(`✅ Loaded ${dbMedicines.length} medicines`);

    let extractedMedicines = [];
    let extractedText = "";
    let extractedDoctor = null;
    let fileType = "unknown";

    // ══════════════════════════════════════════════════════════════
    // PROCESS BASED ON FILE TYPE
    // ══════════════════════════════════════════════════════════════

    console.log("\n🔍 Determining file type and extraction method...");

    if (mimetype.includes("pdf")) {
      fileType = "pdf";
      console.log("📄 FILE TYPE: PDF");
      console.log("📄 Attempting PDF extraction...");
      try {
        console.log(`   Calling extractTextFromPDF...`);

        // Set a timeout for PDF extraction (10 seconds max)
        const extractionPromise = extractTextFromPDF(filePath);
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error("PDF extraction timeout")), 10000)
        );

        extractedText = await Promise.race([extractionPromise, timeoutPromise]);
        console.log(`   ✅ Extraction completed. Text length: ${extractedText?.length || 0}`);
        if (extractedText && extractedText.length > 0) {
          console.log(`   First 200 chars: ${extractedText.substring(0, 200)}`);
        }
      } catch (err) {
        console.error(`   ❌ Extraction error: ${err.message}`);
        console.error(`   Stack: ${err.stack?.substring(0, 200)}`);
        // Don't re-throw - continue with what we have
        extractedText = "";
      }
    } else if (mimetype.startsWith("image/")) {
      fileType = "image";
      console.log("📷 Processing image file...");
      try {
        console.log(`   Calling extractTextFromImage...`);

        // Set a timeout for image extraction (8 seconds max)
        const extractionPromise = extractTextFromImage(filePath);
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error("Image extraction timeout")), 8000)
        );

        extractedText = await Promise.race([extractionPromise, timeoutPromise]);
        console.log(
          `   ✓ Extracted ${extractedText?.length || 0} characters from image`
        );
      } catch (err) {
        console.error("   ✗ Image extraction failed:", err.message);
        extractedText = "";
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
    if (!extractedText || extractedText.trim().length === 0) {
      console.log("\n❌ NO TEXT EXTRACTED FROM FILE");
      console.log("   Text extraction returned empty");
    } else {
      console.log(`\n📝 EXTRACTED TEXT RECEIVED`);
      console.log(`   Length: ${extractedText.length} characters`);
      console.log(`   First 500 chars:\n${extractedText.substring(0, 500)}`);
      console.log(`   ...\n`);

      console.log("🔍 STRATEGY 1: Extracting medicines from Brand & Strength column...");
      let brandStrengthMedicines = extractBrandAndStrengthMedicines(extractedText);

      if (brandStrengthMedicines.length > 0) {
        console.log(`\n✅ STRATEGY 1 SUCCESS: Found ${brandStrengthMedicines.length} medicines`);
        extractedMedicines = brandStrengthMedicines.map((name) => ({
          name,
          frequency: "1-0-1",
          duration: 5,
        }));
      } else {
        console.log(`\n⚠️  STRATEGY 1 FAILED: No medicines found`);

        // Strategy 2: Use parsePrescriptionText as fallback
        console.log(`\n🔍 STRATEGY 2: Using parsePrescriptionText as fallback...`);
        const parsed = parsePrescriptionText(extractedText);
        if (parsed && parsed.medicines && parsed.medicines.length > 0) {
          extractedMedicines = parsed.medicines;
          extractedDoctor = parsed.doctor || null;
          console.log(`✅ STRATEGY 2 SUCCESS: Found ${extractedMedicines.length} medicines`);
          extractedMedicines.forEach((med, idx) => {
            console.log(`   ${idx + 1}. ${med.name} (${med.frequency})`);
          });
          if (extractedDoctor) console.log(`   Doctor: ${extractedDoctor}`);
        } else {
          console.log(`⚠️  STRATEGY 2 FAILED: No medicines found`);

          // Strategy 3: Fallback to line-by-line extraction
          console.log(`\n🔍 STRATEGY 3: Line-by-line extraction as final fallback...`);
          const lines = extractedText.split("\n");
          console.log(`   Total lines: ${lines.length}`);

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
          console.log(`✅ STRATEGY 3 SUCCESS: Extracted ${extractedMedicines.length} lines`);
          if (extractedMedicines.length > 0) {
            extractedMedicines.forEach((med, idx) => {
              console.log(`   ${idx + 1}. ${med.name}`);
            });
          }
        }
      }
    }

    // ══════════════════════════════════════════════════════════════
    // MATCH EXTRACTED MEDICINES WITH DATABASE
    // ══════════════════════════════════════════════════════════════
    console.log("\n" + "═".repeat(80));
    console.log("🔗 MATCHING EXTRACTED MEDICINES WITH DATABASE");
    console.log("═".repeat(80));

    const matchedMedicines = [];
    const unmatchedMedicines = [];

    const seenMedicines = new Set();

    console.log(`\n📊 Processing ${extractedMedicines.length} extracted medicines:\n`);

    for (let idx = 0; idx < extractedMedicines.length; idx++) {
      const med = extractedMedicines[idx];
      console.log(`[${idx + 1}] EXTRACTED: "${med.name}"`);
      const dbMatch = matchMedicineToDatabase(med.name, dbMedicines);

      if (dbMatch) {
        const medKey = dbMatch._id.toString();
        if (seenMedicines.has(medKey)) {
          console.log(`     ⚠️  Already added (duplicate), skipping\n`);
          continue;
        }
        seenMedicines.add(medKey);

        console.log(`     ✅ MATCHED: "${dbMatch.description}"`);
        console.log(`        ID: ${dbMatch._id}`);
        console.log(`        Mfr: ${dbMatch.mfr || "Unknown"}`);
        console.log(`        Price: ₹${dbMatch.newMrp || 0}`);
        console.log(`        Stock: ${dbMatch.qty || 0} units\n`);

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
        console.log(`     ❌ NO MATCH FOUND\n`);
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
    console.log("\n" + "═".repeat(80));
    console.log("📤 SENDING RESPONSE TO CLIENT");
    console.log("═".repeat(80));

    const baseResponse = {
      success: true,
      fileType,
      matchedCount: matchedMedicines.length,
      unmatchedCount: unmatchedMedicines.length,
      doctor: extractedDoctor || "To be verified",
      medicines: matchedMedicines,
      unmatchedMedicines,
    };

    if (!extractedText || extractedText.length === 0) {
      console.log("⚠️  No text extracted from file - PDF extraction failed");
      baseResponse.message = "Could not extract text from PDF. The file might be corrupted or in an unsupported format. Try uploading an image instead.";
    } else if (extractedMedicines.length === 0) {
      console.log("⚠️  Text extracted but no medicines found in Brand & Strength column");
      baseResponse.message = "Text was extracted from the PDF, but no medicine names could be found. Please ensure the prescription contains a 'Brand & Strength' column with medicine names.";
    } else if (matchedMedicines.length > 0) {
      baseResponse.message = `✓ Found ${matchedMedicines.length} matching medicine(s) in your inventory`;
    } else if (unmatchedMedicines.length > 0) {
      baseResponse.message = `Extracted ${extractedMedicines.length} medicine name(s), but none matched your inventory database. Please add these medicines or check the database.`;
    } else {
      baseResponse.message = "No medicines could be extracted from the prescription.";
    }

    console.log(`✅ Response: ${baseResponse.matchedCount} matched, ${baseResponse.unmatchedCount} unmatched`);
    console.log("═".repeat(80));

    // Clean up uploaded file
    try {
      fs.unlinkSync(filePath);
      console.log("✓ Uploaded file cleaned up");
    } catch (err) {
      console.warn("⚠️  Could not delete uploaded file");
    }

    res.json(baseResponse);

  } catch (error) {
    console.error("\n" + "═".repeat(80));
    console.error("❌ EXTRACTION ERROR");
    console.error("═".repeat(80));
    console.error("Error:", error.message);
    console.error("Stack:", error.stack?.substring(0, 300));
    console.error("═".repeat(80));

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

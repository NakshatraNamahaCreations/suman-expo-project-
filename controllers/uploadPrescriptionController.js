  const Prescription = require("../models/Prescription");
  const Medicine = require("../models/Medicine");
  const fs = require("fs");
  const XLSX = require("xlsx");

  const extractTextFromPDF = require("../utils/pdfReader");
  const generateStyledPDF = require("../utils/generateStyledPDF");
  const { extractTextFromImage, parsePrescriptionText } = require("../utils/imageOCR");



  exports.savePrescription = async (req, res) => {
    try {
      const {
        rxId,
        doctor,
        medicines,
        subtotal,
        gst,
        total
      } = req.body;


    if (!medicines || medicines.length === 0) {
    return res.status(400).json({
      success: false,
      message: "No medicines found in prescription"
    });
  }


      const savedPrescription = await Prescription.create({
        rxId,
        doctor,
        date: new Date(),
        
        meds: medicines
        .filter(m => m.medicineId) // 🔥 IMPORTANT     
        .map(m => ({
          medicine: m.medicineId,
          qty: m.qty,
          freq: m.freq,
          duration: m.duration,
          price: m.price,
          subtotal: m.subtotal
        })),
        subtotal,
        gst,
        total,
        payStatus: "Unpaid"
      });

      res.json({
        success: true,
        prescriptionId: savedPrescription._id
      });

    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  };


  // ============================
  // IMAGE PRESCRIPTION UPLOAD (camera/gallery)
  // ============================
  exports.processImagePrescription = async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: "No file uploaded" });
      }

      const filePath = req.file.path;
      const dbMedicines = await Medicine.find({ status: "Active" });
      const matchedMeds = [];

      // Helper: match parsed medicine name to DB for pricing
      const findDBMatch = (medName) => {
        const search = medName.toLowerCase().replace(/\s+/g, "");
        if (search.length < 3) return null;
        return dbMedicines.find((dbMed) => {
          const dbBase = dbMed.name.toLowerCase().replace(/\s*\d+\s*mg|\s*\d+\s*ml/g, "").replace(/\s+/g, "");
          return dbBase.includes(search) || search.includes(dbBase);
        });
      };

      // ── STEP 1: OCR (OCR.space API → Tesseract fallback) ──
      let extractedText = "";
      try {
        extractedText = await extractTextFromImage(filePath);
      } catch (ocrErr) {
        console.log("OCR failed:", ocrErr.message);
      }

      // ── STEP 2: Parse structured medicines from text ──
      const parsed = parsePrescriptionText(extractedText);
      const addedNames = new Set();

      for (const parsedMed of parsed.medicines) {
        const dbMatch = findDBMatch(parsedMed.name);
        const price = dbMatch ? (dbMatch.sellingPrice || dbMatch.price || 0) : 0;
        const name = dbMatch?.name || parsedMed.name;

        addedNames.add(name.toLowerCase());
        const stock = dbMatch?.stock ?? 0;
        matchedMeds.push({
          medicineId: dbMatch?._id || null,
          name,
          category: dbMatch?.category || "Tablet",
          unit: dbMatch?.unit || "Tablet",
          dosage: parsedMed.dosage,
          freq: parsedMed.freq,
          freqLabel: parsedMed.freqLabel,
          duration: parsedMed.duration,
          qty: parsedMed.qty,
          price,
          subtotal: parsedMed.qty * price,
          stock,
          inStock: stock >= parsedMed.qty,
        });
      }

      // ── STEP 3: ALWAYS scan OCR text against DB medicines ──
      // This catches medicines the parser missed (table formats, no prefix, etc.)
      if (extractedText) {
        // Extract all durations mentioned in the text for context
        const allDurations = [];
      const durRegex = /\b(\d{1,3})\s*(?:days?|d\b)\b/gi;
        let dm;
        while ((dm = durRegex.exec(extractedText)) !== null) {
          allDurations.push(parseInt(dm[1], 10));
        }

        // Frequency patterns in the full text
        const freqInText = /1\s*[-–—.,]\s*0\s*[-–—.,]\s*1/i.test(extractedText) ? { m: 1, a: 0, n: 1, label: "1-0-1" }
          : /1\s*[-–—.,]\s*1\s*[-–—.,]\s*1/i.test(extractedText) ? { m: 1, a: 1, n: 1, label: "1-1-1" }
          : /\bbd\b|\btwice/i.test(extractedText) ? { m: 1, a: 0, n: 1, label: "1-0-1" }
          : /\btds\b|\bthrice/i.test(extractedText) ? { m: 1, a: 1, n: 1, label: "1-1-1" }
          : { m: 1, a: 0, n: 1, label: "1-0-1" };

        for (const med of dbMedicines) {
          if (addedNames.has(med.name.toLowerCase())) continue;

          const baseName = med.name.toLowerCase().replace(/\s*\d+\s*mg|\s*\d+\s*ml/g, "").trim();
          if (baseName.length < 3) continue;

          // Check if medicine name appears in OCR text
          if (extractedText.includes(baseName)) {
            // Try to find a duration near this medicine in the text
            const medIdx = extractedText.indexOf(baseName);
            const nearbyText = extractedText.substring(Math.max(0, medIdx - 50), medIdx + baseName.length + 80);
        
        
    const nearDur = nearbyText.match(/(\d{1,3})\s*(?:days?)/i);

  let duration = 5;

  if (nearDur) {
    duration = parseInt(nearDur[1], 10);

    // 🔥 FIX: handle merged values like 130
    const freqMatch = nearbyText.match(/(\d)[-–—.,](\d)[-–—.,](\d)/);

    if (freqMatch && duration > 90) {
      const freqDigits = freqMatch[1] + freqMatch[2] + freqMatch[3]; // "101"

      if (duration.toString().startsWith(freqDigits)) {
        // remove frequency part from duration
        duration = parseInt(duration.toString().slice(freqDigits.length), 10);
      }
    }
  }
            // Try to find frequency near this medicine
            let freq = { ...freqInText };
            let freqLabel = freqInText.label;
            const nearFreq = nearbyText.match(/(\d)\s*[-–—.,]\s*(\d)\s*[-–—.,]\s*(\d)/);
            if (nearFreq) {
              freq = { m: parseInt(nearFreq[1]), a: parseInt(nearFreq[2]), n: parseInt(nearFreq[3]) };
              freqLabel = `${freq.m}-${freq.a}-${freq.n}`;
            }

            const daily = freq.m + freq.a + freq.n;
            const qty = daily * duration;
            const price = med.sellingPrice || med.price || 0;

            addedNames.add(med.name.toLowerCase());
            matchedMeds.push({
              medicineId: med._id,
              name: med.name,
              category: med.category,
              unit: med.unit,
              dosage: "",
              freq,
              freqLabel,
              duration,
              qty,
              price,
              subtotal: qty * price,
              stock: med.stock || 0,
              inStock: (med.stock || 0) >= qty,
            });
          }
        }
      }

      // Only keep medicines that matched database (have a medicineId)
      const validMeds = matchedMeds.filter(m => m.medicineId);
      console.log(`Final matched: ${matchedMeds.length} raw → ${validMeds.length} valid`, validMeds.map(m => `${m.name} ${m.freqLabel} ${m.duration}d qty:${m.qty} ₹${m.subtotal}`));

      const subtotal = validMeds.reduce((sum, m) => sum + m.subtotal, 0);
      const gst = Math.round(subtotal * 0.05 * 100) / 100;
      const total = subtotal + gst;

      
      // Clean up uploaded file
      try { fs.unlinkSync(filePath); } catch {}

      res.json({
        success: true,
        message: validMeds.length > 0
          ? `Found ${validMeds.length} medicine(s) in prescription`
          : "Prescription uploaded. Our pharmacist will verify and add medicines.",
        prescription: {
          rxId: `RX-${Date.now()}`,
          doctor: parsed.doctor || "To be verified",
          date: new Date().toISOString(),
          medsCount: validMeds.length,
          medicines: validMeds,
          subtotal,
          gst,
          total,
        },
      });
    } catch (error) {
      console.error("IMAGE UPLOAD ERROR:", error);
      res.status(500).json({ message: "Error processing image", error: error.message });
    }
  };

  // ============================
  // PDF PRESCRIPTION UPLOAD
  // ============================
  exports.processPDFPrescription = async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: "No file uploaded" });
      }

      const filePath = req.file.path;

      // Extract text from PDF
      const text = await extractTextFromPDF(filePath);
      console.log("PDF EXTRACTED TEXT:", text);

      // Parse medicines
      const parsed = parsePrescriptionText(text);
      const dbMedicines = await Medicine.find({ status: "Active" });
      const matchedMeds = [];
      const addedNames = new Set();

      const findDBMatch = (medName) => {
        const search = medName.toLowerCase().replace(/\s+/g, "");
        if (search.length < 3) return null;
        return dbMedicines.find((dbMed) => {
          const dbBase = dbMed.name.toLowerCase().replace(/\s*\d+\s*mg|\s*\d+\s*ml/g, "").replace(/\s+/g, "");
          return dbBase.includes(search) || search.includes(dbBase);
        });
      };

      // From parser
      for (const parsedMed of parsed.medicines) {
        const dbMatch = findDBMatch(parsedMed.name);
        const price = dbMatch ? (dbMatch.sellingPrice || dbMatch.price || 0) : 0;
        const name = dbMatch?.name || parsedMed.name;
        addedNames.add(name.toLowerCase());
        matchedMeds.push({
          medicineId: dbMatch?._id || null,
          name,
          category: dbMatch?.category || "Tablet",
          unit: dbMatch?.unit || "Tablet",
          dosage: parsedMed.dosage,
          freq: parsedMed.freq,
          freqLabel: parsedMed.freqLabel,
          duration: parsedMed.duration,
          qty: parsedMed.qty,
          price,
          subtotal: parsedMed.qty * price,
          stock: dbMatch?.stock || 0,
          inStock: (dbMatch?.stock || 0) >= parsedMed.qty,
        });
      }

      // Fallback: text match against DB
      if (matchedMeds.length === 0 && text) {
        for (const med of dbMedicines) {
          const baseName = med.name.toLowerCase().replace(/\s*\d+\s*mg|\s*\d+\s*ml/g, "").trim();
          if (baseName.length >= 4 && text.includes(baseName) && !addedNames.has(med.name.toLowerCase())) {
            const freq = { m: 1, a: 0, n: 1 };
            const duration = 5;
            const daily = 2;
            const qty = daily * duration;
            const price = med.sellingPrice || med.price || 0;
            addedNames.add(med.name.toLowerCase());
            matchedMeds.push({
              medicineId: med._id, name: med.name, category: med.category, unit: med.unit,
              dosage: "", freq, freqLabel: "1-0-1", duration, qty, price, subtotal: qty * price,
              stock: med.stock || 0, inStock: (med.stock || 0) >= qty,
            });
          }
        }
      }

      console.log(`PDF matched ${matchedMeds.length} medicines`);

      const subtotal = matchedMeds.reduce((sum, m) => sum + m.subtotal, 0);
      const gst = Math.round(subtotal * 0.05 * 100) / 100;
      const total = subtotal + gst;

      // Clean up
      try { fs.unlinkSync(filePath); } catch {}

      res.json({
        success: true,
        message: matchedMeds.length > 0
          ? `Found ${matchedMeds.length} medicine(s) in PDF`
          : "PDF uploaded. Our pharmacist will verify.",
        prescription: {
          rxId: `RX-${Date.now()}`,
          doctor: parsed.doctor || "To be verified",
          date: new Date().toISOString(),
          medsCount: matchedMeds.length,
          medicines: matchedMeds,
          subtotal,
          gst,
          total,
        },
      });
    } catch (error) {
      console.error("PDF UPLOAD ERROR:", error);
      res.status(500).json({ message: "Error processing PDF", error: error.message });
    }
  };

// ============================
// UNIFIED MEDICINE EXTRACTION
// (Handles PDF, Image, Excel)
// ============================
exports.extractMedicines = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: "No file uploaded" });
    }

    const { mimetype, path: filePath } = req.file;
    console.log("📥 Extracting medicines from file:", { mimetype, filePath });

    let matchedMeds = [];
    let doctor = "To be verified";
    let fileType = "unknown";

    const dbMedicines = await Medicine.find({ status: "Active" });
    console.log(`📚 Loaded ${dbMedicines.length} medicines from database`);

    // ── Helper: Match medicine names to DB ──
    const findDBMatch = (medName) => {
      const search = medName.toLowerCase().replace(/\s+/g, "");
      if (search.length < 3) return null;
      return dbMedicines.find((dbMed) => {
        const dbBase = dbMed.name.toLowerCase().replace(/\s*\d+\s*mg|\s*\d+\s*ml/g, "").replace(/\s+/g, "");
        return dbBase.includes(search) || search.includes(dbBase);
      });
    };

    // ── Helper: Build matched medicine object ──
    const buildMedicineObj = (name, dbMatch, freq, duration) => {
      const daily = freq.m + freq.a + freq.n;
      const qty = daily * duration;
      const price = dbMatch ? (dbMatch.sellingPrice || dbMatch.price || 0) : 0;
      const stock = dbMatch?.stock || 0;
      return {
        medicineId: dbMatch?._id || null,
        name: dbMatch?.name || name,
        category: dbMatch?.category || "Tablet",
        unit: dbMatch?.unit || "tablets",
        dosage: "",
        freq,
        freqLabel: `${freq.m}-${freq.a}-${freq.n}`,
        duration,
        qty,
        price,
        subtotal: qty * price,
        stock,
        inStock: stock >= qty,
      };
    };

    // ── EXCEL EXTRACTION ──
    if (mimetype.includes("spreadsheet") || mimetype.includes("excel")) {
      fileType = "excel";
      console.log("📊 Processing as EXCEL file");
      try {
        const wb = XLSX.readFile(filePath);
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(ws, { header: 1 });

        // Find medicine name column (auto-detect header)
        const headers = (rows[0] || []).map(h => String(h || "").toLowerCase().trim());
        const medColIdx = headers.findIndex(h =>
          h.includes("medicine") || h.includes("drug") || h.includes("name") || h.includes("tablet")
        );
        const col = medColIdx >= 0 ? medColIdx : 0;
        const startRow = medColIdx >= 0 ? 1 : 0;

        // Extract medicine names
        const medNames = rows.slice(startRow)
          .map(r => String(r[col] || "").trim())
          .filter(n => n.length >= 3 && /[a-zA-Z]/.test(n));

        // Match medicines (default: 1-0-1 frequency, 5 day duration)
        const addedNames = new Set();
        for (const medName of medNames) {
          const dbMatch = findDBMatch(medName);
          if (!dbMatch || addedNames.has(dbMatch.name.toLowerCase())) continue;

          addedNames.add(dbMatch.name.toLowerCase());
          matchedMeds.push(buildMedicineObj(medName, dbMatch, { m: 1, a: 0, n: 1 }, 5));
        }
      } catch (err) {
        console.error("Excel extraction error:", err.message);
        // Fall through to error handling
      }
    }
    // ── PDF EXTRACTION ──
    else if (mimetype.includes("pdf")) {
      fileType = "pdf";
      console.log("📄 Processing as PDF file");
      let parsed = { medicines: [], doctor: null };
      let text = "";

      try {
        text = await extractTextFromPDF(filePath);
        console.log(`📄 Extracted text length: ${text?.length || 0} characters`);
        if (text && text.length > 20) {
          console.log(`📄 Text sample (first 200 chars): ${text.substring(0, 200)}`);
        }
        parsed = parsePrescriptionText(text);
        console.log(`📄 Parsed medicines: ${parsed.medicines?.length || 0}, doctor: ${parsed.doctor || "not found"}`);
        doctor = parsed.doctor || doctor;
      } catch (pdfErr) {
        console.error("❌ PDF extraction failed:", pdfErr.message);
        // Continue with empty medicines
      }

      const addedNames = new Set();
      for (const parsedMed of parsed.medicines) {
        const dbMatch = findDBMatch(parsedMed.name);
        if (addedNames.has((dbMatch?.name || parsedMed.name).toLowerCase())) continue;

        addedNames.add((dbMatch?.name || parsedMed.name).toLowerCase());
        matchedMeds.push(buildMedicineObj(parsedMed.name, dbMatch, parsedMed.freq || { m: 1, a: 0, n: 1 }, parsedMed.duration || 5));
      }

      // Fallback: scan full text for more medicines
      if (matchedMeds.length === 0 && text) {
        for (const med of dbMedicines) {
          const baseName = med.name.toLowerCase().replace(/\s*\d+\s*mg|\s*\d+\s*ml/g, "").trim();
          if (baseName.length >= 4 && text.includes(baseName) && !addedNames.has(med.name.toLowerCase())) {
            addedNames.add(med.name.toLowerCase());
            matchedMeds.push(buildMedicineObj(med.name, med, { m: 1, a: 0, n: 1 }, 5));
          }
        }
      }
    }
    // ── IMAGE EXTRACTION ──
    else if (mimetype.startsWith("image/")) {
      fileType = "image";
      console.log("📷 Processing as IMAGE file");
      let parsed = { medicines: [], doctor: null };
      let text = "";

      try {
        text = await extractTextFromImage(filePath);
        console.log(`📷 Extracted text length: ${text?.length || 0} characters`);
        if (text && text.length > 20) {
          console.log(`📷 Text sample (first 200 chars): ${text.substring(0, 200)}`);
        }
        parsed = parsePrescriptionText(text);
        console.log(`📷 Parsed medicines: ${parsed.medicines?.length || 0}, doctor: ${parsed.doctor || "not found"}`);
        doctor = parsed.doctor || doctor;
      } catch (imgErr) {
        console.error("❌ Image extraction failed:", imgErr.message);
        // Continue with empty medicines
      }

      const addedNames = new Set();
      for (const parsedMed of parsed.medicines) {
        const dbMatch = findDBMatch(parsedMed.name);
        if (addedNames.has((dbMatch?.name || parsedMed.name).toLowerCase())) continue;

        addedNames.add((dbMatch?.name || parsedMed.name).toLowerCase());
        matchedMeds.push(buildMedicineObj(parsedMed.name, dbMatch, parsedMed.freq || { m: 1, a: 0, n: 1 }, parsedMed.duration || 5));
      }

      // Fallback: scan full text
      if (matchedMeds.length === 0 && text) {
        for (const med of dbMedicines) {
          const baseName = med.name.toLowerCase().replace(/\s*\d+\s*mg|\s*\d+\s*ml/g, "").trim();
          if (baseName.length >= 4 && text.includes(baseName) && !addedNames.has(med.name.toLowerCase())) {
            addedNames.add(med.name.toLowerCase());
            matchedMeds.push(buildMedicineObj(med.name, med, { m: 1, a: 0, n: 1 }, 5));
          }
        }
      }
    } else {
      console.warn(`⚠️  Unrecognized file type: ${mimetype}`);
      console.log("Supported types: spreadsheet/excel, pdf, image/*");
    }

    // Only keep medicines that matched the database
    const validMeds = matchedMeds.filter(m => m.medicineId);
    console.log(`✅ Found ${validMeds.length} matched medicines from ${matchedMeds.length} total medicines`);

    // Clean up uploaded file
    try {
      fs.unlinkSync(filePath);
      console.log("🗑️  File cleaned up successfully");
    } catch (err) {
      console.error("Error deleting file:", err.message);
    }

    const subtotal = validMeds.reduce((sum, m) => sum + m.subtotal, 0);
    const gst = Math.round(subtotal * 0.05 * 100) / 100;
    const total = subtotal + gst;

    res.json({
      success: true,
      fileType,
      message: validMeds.length > 0
        ? `Found ${validMeds.length} medicine(s)`
        : "File uploaded. No medicines matched in database.",
      prescription: {
        rxId: `RX-${Date.now()}`,
        doctor,
        date: new Date().toISOString(),
        medsCount: validMeds.length,
        medicines: validMeds,
        subtotal,
        gst,
        total,
      },
    });
  } catch (error) {
    console.error("MEDICINE EXTRACTION ERROR:", error);
    try { fs.unlinkSync(req.file?.path); } catch {}
    res.status(500).json({ success: false, message: "Error processing file", error: error.message });
  }
};

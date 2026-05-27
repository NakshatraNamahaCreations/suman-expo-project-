const Medicine = require("../models/Medicine");
const XLSX = require("xlsx");
const fs = require("fs");


/* ── pagination helper ───────────────────────────────────────── */
function paginate(query) {
  const page = Math.max(1, parseInt(query.page) || 1);
  const raw = parseInt(query.limit);
  const all = raw === 0;
  const limit = all ? 0 : Math.min(Math.max(raw || 10, 1), 100);
  const skip = all ? 0 : (page - 1) * limit;
  return { page, limit, skip, all };
}


/* ===============================
   BULK UPLOAD MEDICINES (EXCEL)
================================ */
exports.uploadMedicinesExcel = async (req, res) => {
  try {
    if (!req.file) {
      console.error("❌ No file uploaded");
      return res.status(400).json({ message: "Excel file required" });
    }

    console.log("📁 File received:", {
      filename: req.file.filename,
      mimetype: req.file.mimetype,
      size: req.file.size
    });

    let workbook;
    try {
      // Support both memoryStorage (buffer) and diskStorage (path)
      if (req.file.buffer) {
        workbook = XLSX.read(req.file.buffer, { type: "buffer", defval: "" });
      } else if (req.file.path) {
        const fileData = fs.readFileSync(req.file.path);
        workbook = XLSX.read(fileData, { type: "buffer", defval: "" });
        // Clean up temp file after reading
        fs.unlinkSync(req.file.path);
      } else {
        return res.status(400).json({ message: "No file data available" });
      }
      console.log("✅ XLSX file parsed successfully");
    } catch (xlsxError) {
      console.error("❌ XLSX parsing error:", xlsxError.message);
      if (req.file.path) {
        try { fs.unlinkSync(req.file.path); } catch {}
      }
      return res.status(400).json({
        message: "Invalid Excel file",
        error: xlsxError.message
      });
    }

    console.log("📚 Available sheets:", workbook.SheetNames);

    // Try to find the sheet with data (skip Instructions, Settings, etc.)
    let sheet = null;
    let sheetName = null;

    for (let i = 0; i < workbook.SheetNames.length; i++) {
      const name = workbook.SheetNames[i];
      console.log(`Checking sheet: ${name}`);

      if (name.toLowerCase().includes('instruction') || name.toLowerCase().includes('guide')) {
        console.log(`  → Skipping ${name} (instructions/guide)`);
        continue;
      }

      const testSheet = workbook.Sheets[name];
      if (!testSheet) continue;

      sheet = testSheet;
      sheetName = name;
      console.log(`  → Using sheet: ${name}`);
      break;
    }

    if (!sheet) {
      return res.status(400).json({ message: "No data found in Excel file. Please check the file has data rows." });
    }

    // Detect header row — template may have title/empty rows before actual headers
    let data;
    try {
      const KNOWN_HEADERS = ["description", "product name", "medicine name", "name", "item name"];
      const allRows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });

      // Scan first 10 rows for the row containing a known header
      let headerRowIdx = 0;
      for (let i = 0; i < Math.min(allRows.length, 10); i++) {
        const row = allRows[i].map(c => String(c).trim().toLowerCase());
        if (row.some(cell => KNOWN_HEADERS.includes(cell))) {
          headerRowIdx = i;
          console.log(`  → Found header row at index ${i}`);
          break;
        }
      }

      data = XLSX.utils.sheet_to_json(sheet, {
        defval: "",
        blankrows: false,
        range: headerRowIdx,
      });
      console.log(`✅ Sheet parsed: ${sheetName} with ${data ? data.length : 0} rows (header at row ${headerRowIdx + 1})`);
    } catch (parseError) {
      console.error("❌ Sheet parsing error:", parseError.message);
      return res.status(400).json({
        message: "Failed to parse sheet data",
        error: parseError.message
      });
    }

    // Debug: Log detected columns and data
    if (!data || !Array.isArray(data)) {
      return res.status(400).json({ message: "Invalid data format in sheet" });
    }

    console.log("📋 Sheet name:", sheetName);
    console.log("📋 Detected columns:", data.length > 0 ? Object.keys(data[0]) : "No data");
    console.log("📊 Total data rows found:", data.length);

    if (data.length === 0) {
      return res.status(400).json({ message: "No data rows found. Ensure the sheet contains medicine data." });
    }

    // ✅ CLEAN FUNCTION (remove spaces, tabs, multiple spaces)
    const clean = (val) => {
      if (val === null || val === undefined) return "";
      return String(val).replace(/\s+/g, " ").trim();
    };

    // ✅ CLEAN WHOLE ROW (VERY IMPORTANT)
    const cleanRow = (row) => {
      const cleaned = {};
      for (let key in row) {
        cleaned[clean(key)] = clean(row[key]);
      }
      return cleaned;
    };

    // ✅ HELPER: Find value by multiple possible column names (case-insensitive)
    const findField = (row, ...possibleNames) => {
      const lowerRow = {};
      for (let key in row) {
        lowerRow[key.toLowerCase()] = row[key];
      }

      for (let name of possibleNames) {
        const lowerName = name.toLowerCase();
        if (lowerRow[lowerName] !== undefined && lowerRow[lowerName] !== null && lowerRow[lowerName] !== '') {
          return lowerRow[lowerName];
        }
      }
      return null;
    };

    // ✅ FIELD MAPPING: Excel columns to database fields
    const fieldMappings = {
      mfr: ['mfr', 'manufacturer', 'mfac name'],
      vendor: ['vendor', 'vendor name', 'supplier', 'supplier name'],
      description: ['description', 'product name', 'medicine name', 'name', 'item name'],
      category: ['category', 'type'],
      qty: ['qty', 'quantity', 'stock', 'qnty'],
      pack: ['pack', 'pack size', 'packing'],
      batchNo: ['batch no', 'batchno', 'batch number', 'batch'],
      expDate: ['exp. date', 'exp date', 'expiry date', 'expiry', 'expdate'],
      oldMrp: ['old mrp', 'oldmrp', 'old mrp price', 'previous mrp', 'previous price'],
      newMrp: ['new mrp', 'newmrp', 'new mrp price', 'mrp', 'selling price', 'price'],
      tradePrice: ['trade price', 'tradeprice', 'cost price', 'cost', 'purchase price'],
      discPercent: ['disc %', 'discount %', 'discount percent', 'discount'],
      free: ['free', 'free units'],
      scmDisc: ['scm disc', 'scmdisc', 'scm discount'],
      taxableValue: ['taxable value', 'taxablevalue', 'taxable', 'without tax'],
      gstPercent: ['gst %', 'gst%', 'gst percent', 'tax percent'],
      netValue: ['net value', 'netvalue', 'net', 'final value'],
      hsnCode: ['hsn code', 'hsncode', 'hsn'],
      status: ['status']
    };

    let parsedData = [];

    for (let row of data) {
      // ✅ CLEAN ENTIRE ROW
      const r = cleanRow(row);

      // ✅ TRY TO FIND DESCRIPTION (required field)
      const description = findField(r, ...fieldMappings.description);
      if (!description) {
        console.log("⚠️ Skipping row - no Description found:", r);
        continue;
      }

      const normalize = (str) => clean(str).toLowerCase();
      const normalizedName = normalize(description);

      const existing = await Medicine.findOne({ normalizedName });

      // ✅ EXTRACT ALL FIELDS USING MAPPINGS
      const mfr = findField(r, ...fieldMappings.mfr) || "";
      const vendor = findField(r, ...fieldMappings.vendor) || "";
      const category = findField(r, ...fieldMappings.category) || "";
      const batchNo = findField(r, ...fieldMappings.batchNo) || "";
      const expDate = findField(r, ...fieldMappings.expDate) || "";
      const qty = Number(findField(r, ...fieldMappings.qty) || 0);
      const pack = findField(r, ...fieldMappings.pack) || "";
      const oldMrp = Number(findField(r, ...fieldMappings.oldMrp) || 0);
      const newMrp = Number(findField(r, ...fieldMappings.newMrp) || 0);
      const tradePrice = Number(findField(r, ...fieldMappings.tradePrice) || 0);
      const discPercent = Number(findField(r, ...fieldMappings.discPercent) || 0);
      const free = Number(findField(r, ...fieldMappings.free) || 0);
      const scmDisc = Number(findField(r, ...fieldMappings.scmDisc) || 0);
      const taxableValue = Number(findField(r, ...fieldMappings.taxableValue) || 0);
      const gstPercent = Number(findField(r, ...fieldMappings.gstPercent) || 5);
      const netValue = Number(findField(r, ...fieldMappings.netValue) || 0);
      const hsnCode = findField(r, ...fieldMappings.hsnCode) || "";
      const status = findField(r, ...fieldMappings.status) || "Active";

      const payload = {
        mfr,
        vendor,
        description,
        category,
        batchNo,
        expDate,
        qty,
        pack,
        oldMrp,
        newMrp,
        tradePrice,
        discPercent,
        free,
        scmDisc,
        taxableValue,
        gstPercent,
        netValue,
        hsnCode,
        status,
      };

      parsedData.push({
        ...payload,
        exists: !!existing,
        id: existing?._id || null
      });
    }

    return res.json({
      success: true,
      data: parsedData
    });

  } catch (error) {
    console.error("❌ Excel parsing error:", error);
    res.status(500).json({
      message: "Excel parsing failed",
      error: error.message,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};


exports.bulkSaveMedicines = async (req, res) => {
  try {
    const medicines = req.body.medicines;
    const { vendorId, vendorName } = req.body;

    let created = 0;
    let updated = 0;

    for (let item of medicines) {
      const { id, exists, ...cleanData } = item;

      // Ensure vendor is set
      if (vendorName && !cleanData.vendor) {
        cleanData.vendor = vendorName;
      }

      if (id) {
        const updatedData = {
          ...cleanData,
          normalizedName: cleanData.description
            ?.toLowerCase()
            .replace(/\s+/g, " ")
            .trim()
        };

        await Medicine.findByIdAndUpdate(id, updatedData);
        updated++;
      } else {
        const normalizedName = cleanData.description
          ?.toLowerCase()
          .replace(/\s+/g, " ")
          .trim();

        await Medicine.findOneAndUpdate(
          { normalizedName },
          {
            ...cleanData,
            normalizedName
          },
          { upsert: true, new: true }
        );
        created++;
      }
    }

    res.json({
      success: true,
      created,
      updated,
      vendor: vendorName
    });

  } catch (error) {
    res.status(500).json({
      message: "Bulk save failed",
      error: error.message
    });
  }
};

/* ===============================
   CREATE MEDICINE
================================ */

exports.createMedicine = async (req, res) => {
  try {
    const data = req.body;

    // Handle newMrp fallback from price field (backward compat)
    if (!data.newMrp && data.price) {
      data.newMrp = data.price;
    }

    const medicine = await Medicine.create(data);

    res.status(201).json(medicine);

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};



/* ===============================
   GET ALL MEDICINES (paginated when params present)
================================ */
exports.getMedicines = async (req, res) => {
  try {
    const hasPageParams = req.query.page || req.query.limit;

    if (!hasPageParams) {
      // Legacy: return raw array for backward compat (mobile app, dashboard)
      const medicines = await Medicine.find().sort({ createdAt: -1 });
      return res.json(medicines);
    }

    // Paginated response
    const { page, limit, skip, all } = paginate(req.query);
    const { search, status, mfr } = req.query;
    const filter = {};

    if (status) filter.status = status;
    if (mfr) filter.mfr = { $regex: mfr, $options: "i" };
    if (search) {
      filter.$or = [
        { description: { $regex: search, $options: "i" } },
        { mfr: { $regex: search, $options: "i" } },
      ];
    }

    let q = Medicine.find(filter).sort({ createdAt: -1 });
    if (!all) q = q.skip(skip).limit(limit);

    const [medicines, total] = await Promise.all([q, Medicine.countDocuments(filter)]);

    res.json({
      success: true,
      data: medicines,
      pagination: {
        page: all ? 1 : page,
        limit: all ? total : limit,
        total,
        totalPages: all ? 1 : Math.ceil(total / limit) || 1,
      },
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};


/* ===============================
   GET SINGLE MEDICINE
================================ */
exports.getMedicineById = async (req, res) => {
  try {
    const medicine = await Medicine.findById(req.params.id);

    if (!medicine) {
      return res.status(404).json({ message: "Medicine not found" });
    }

    res.json(medicine);

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

/* ===============================
   UPDATE MEDICINE
================================ */
exports.updateMedicine = async (req, res) => {
  try {

    if (!req.body.newMrp && req.body.price) {
      req.body.newMrp = req.body.price;
    }

    const updatedData = {
      ...req.body,
      normalizedName: req.body.description
        ?.toLowerCase()
        .replace(/\s+/g, " ")
        .trim()
    };

    const medicine = await Medicine.findByIdAndUpdate(
      req.params.id,
      updatedData,
      { new: true, runValidators: true }
    );

    res.json(medicine);

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};


/* ===============================
   DELETE MEDICINE
================================ */
exports.deleteMedicine = async (req, res) => {
  try {
    const medicine = await Medicine.findByIdAndDelete(req.params.id);

    if (!medicine) {
      return res.status(404).json({ message: "Medicine not found" });
    }

    res.json({ message: "Medicine deleted successfully" });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};


/* ===============================
   DELETE ALL MEDICINES
================================ */
exports.deleteAllMedicines = async (req, res) => {
  try {
    const result = await Medicine.deleteMany({});
    res.json({
      success: true,
      message: `All medicines deleted successfully`,
      deletedCount: result.deletedCount,
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};


/* ===============================
   ADJUST STOCK
================================ */
exports.adjustStock = async (req, res) => {
  try {
    const { type, quantity } = req.body;

    // 🔍 Validate medicine
    const medicine = await Medicine.findById(req.params.id);
    if (!medicine) {
      return res.status(404).json({ message: "Medicine not found" });
    }

    // 🔍 Validate type
    if (!["add", "reduce"].includes(type)) {
      return res.status(400).json({ message: "Invalid type. Use 'add' or 'reduce'" });
    }

    // 🔍 Validate quantity
    const qty = Number(quantity);
    if (!qty || qty <= 0) {
      return res.status(400).json({ message: "Invalid quantity" });
    }

    // ➕ Add stock
    if (type === "add") {
      medicine.qty += qty;
    }

    // ➖ Reduce stock
    if (type === "reduce") {
      if (medicine.qty < qty) {
        return res.status(400).json({ message: "Insufficient stock" });
      }

      medicine.qty -= qty;
    }

    // 💾 Save changes
    await medicine.save();

    return res.json({
      success: true,
      message: "Stock updated successfully",
      medicine,
    });

  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Stock update failed",
      error: error.message,
    });
  }
};

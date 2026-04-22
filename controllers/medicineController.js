const Medicine = require("../models/Medicine");
const XLSX = require("xlsx");


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
      return res.status(400).json({ message: "Excel file required" });
    }

    const workbook = XLSX.read(req.file.buffer, { type: "buffer", defval: "" });

    // Try to find the sheet with data (skip Instructions, Settings, etc.)
    let sheet = null;
    let sheetName = null;

    for (let i = 0; i < workbook.SheetNames.length; i++) {
      const name = workbook.SheetNames[i];
      if (name.toLowerCase().includes('instruction') || name.toLowerCase().includes('guide')) {
        continue;
      }

      const testSheet = workbook.Sheets[name];
      const testData = XLSX.utils.sheet_to_json(testSheet, { defval: "" });

      // Use first sheet with actual data rows
      if (testData.length > 1) { // At least 1 data row (excluding header)
        sheet = testSheet;
        sheetName = name;
        break;
      }
    }

    if (!sheet) {
      return res.status(400).json({ message: "No data found in Excel file. Please check the 'Medicines' sheet has data rows." });
    }

    // Parse with header row in row 1, data starting from row 2
    const data = XLSX.utils.sheet_to_json(sheet, {
      defval: "",
      blankrows: false
    });

    // Debug: Log detected columns and data
    console.log("📋 Sheet name:", sheetName);
    console.log("📋 Detected columns:", data.length > 0 ? Object.keys(data[0]) : "No data");
    console.log("📊 Total data rows found:", data.length);

    if (data.length === 0) {
      return res.status(400).json({ message: "No data rows found. Ensure row 2 onwards contains medicine data." });
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

    let parsedData = [];

    for (let row of data) {
      // ✅ CLEAN ENTIRE ROW
      const r = cleanRow(row);

      // Try multiple column names for each field
      const name = findField(r, 'medicine name', 'name', 'product name', 'medicine_name', 'product_name');
      if (!name) {
        console.log("⚠️ Skipping row - no medicine name found:", r);
        continue;
      }

      const normalize = (str) =>
        clean(str).toLowerCase();

      const normalizedName = normalize(name);

      const existing = await Medicine.findOne({
        normalizedName
      });

      // ✅ CATEGORY-BASED UNIT VALIDATION
      const categoryUnitMap = {
        tablet: ["tablets", "capsules"],
        capsule: ["capsules", "tablets"],
        syrup: ["ml"],
        liquid: ["ml", "litre"],
        injection: ["ml"],
        ointment: ["grams"],
        dressing: ["sheets"],
        device: ["pieces"],
        "medical device": ["pieces"]
      };

      const categoryRaw = findField(r, 'category', 'type') || "Tablet";
      const category = Object.keys(categoryUnitMap).find(k => k.toLowerCase() === categoryRaw.toLowerCase()) || "Tablet";
      const allowedUnits = categoryUnitMap[category.toLowerCase()] || ["tablets"];

      const unitField = findField(r, 'unit', 'unit type', 'unit_type', 'measurement');

      // More flexible unit matching (handle singular/plural, spaces, etc.)
      let unit = allowedUnits[0]; // Default to first allowed unit
      if (unitField) {
        const normalizedField = unitField.toLowerCase().trim().replace(/s$/, ''); // Remove trailing 's' for plural
        const matchedUnit = allowedUnits.find(u =>
          u.toLowerCase() === unitField.toLowerCase() || // Exact match
          u.toLowerCase().replace(/s$/, '') === normalizedField // Match without plural 's'
        );
        if (matchedUnit) unit = matchedUnit;
      }

      const doseAmount = Number(findField(r, 'dose amount', 'doseamount', 'dose_amount', 'dose') || 1);
      const costPrice = Number(findField(r, 'cost price', 'costprice', 'cost_price', 'cost', 'cp') || 0);
      const sellingPrice = Number(findField(r, 'selling price', 'sellingprice', 'selling_price', 'price', 'sp') || 0);
      const stock = Number(findField(r, 'stock', 'quantity', 'qty') || 0);
      const minStock = Number(findField(r, 'min stock', 'minstock', 'min_stock', 'minimum stock', 'reorder point') || 10);
      const status = findField(r, 'status') || "Active";

      const payload = {
        name,
        category,
        unit,
        doseAmount,
        costPrice,
        sellingPrice,
        stock,
        minStock,
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
    res.status(500).json({
      message: "Excel parsing failed",
      error: error.message,
    });
  }
};


exports.bulkSaveMedicines = async (req, res) => {
  try {
    const medicines = req.body.medicines;

    let created = 0;
    let updated = 0;

for (let item of medicines) {
  const { id, exists, ...cleanData } = item;

  if (id) {
   const updatedData = {
  ...cleanData,
  normalizedName: cleanData.name
    ?.toLowerCase()
    .replace(/\s+/g, " ")
    .trim()
};

await Medicine.findByIdAndUpdate(id, updatedData);
    updated++;
  } else {
   const normalizedName = cleanData.name
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
      updated
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

    // Fix sellingPrice fallback
    if (!data.sellingPrice && data.price) {
      data.sellingPrice = data.price;
    }

    // Inactive validation
    if (data.status === "Inactive" && !data.inactiveReason) {
      return res.status(400).json({
        message: "Reason required for inactive medicine"
      });
    }

    // ✅ CATEGORY-UNIT VALIDATION
    const categoryUnitMap = {
      Tablet: ["tablets", "capsules"],
      Capsule: ["capsules", "tablets"],
      Syrup: ["ml"],
      Liquid: ["ml", "litre"],
      Injection: ["ml"],
      Ointment: ["grams"],
      Dressing: ["sheets"],
      Device: ["pieces"],
      "Medical Device": ["pieces"]
    };

    const { category, unit } = data;

    if (categoryUnitMap[category]) {
      if (!categoryUnitMap[category].includes(unit)) {
        return res.status(400).json({
          message: `Invalid unit '${unit}' for category '${category}'`
        });
      }
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
    const { search, status, category } = req.query;
    const filter = {};

    if (status) filter.status = status;
    if (category) filter.category = { $regex: category, $options: "i" };
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: "i" } },
        { category: { $regex: search, $options: "i" } },
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

    if (!req.body.sellingPrice && req.body.price) {
      req.body.sellingPrice = req.body.price;
    }

    // ✅ ADD SAME VALIDATION
    const categoryUnitMap = {
      Tablet: ["tablets", "capsules"],
      Capsule: ["capsules", "tablets"],
      Syrup: ["ml"],
      Liquid: ["ml", "litre"],
      Injection: ["ml"],
      Ointment: ["grams"],
      Dressing: ["sheets"],
      Device: ["pieces"],
      "Medical Device": ["pieces"]
    };

    const { category, unit } = req.body;

    if (categoryUnitMap[category]) {
      if (!categoryUnitMap[category].includes(unit)) {
        return res.status(400).json({
          message: `Invalid unit '${unit}' for category '${category}'`
        });
      }
    }

const updatedData = {
  ...req.body,
  normalizedName: req.body.name
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
      medicine.stock += qty;
    }

    // ➖ Reduce stock
    if (type === "reduce") {
      if (medicine.stock < qty) {
        return res.status(400).json({ message: "Insufficient stock" });
      }

      medicine.stock -= qty;

      // 📊 Update demand tracking
      medicine.demand30 = (medicine.demand30 || 0) + qty;
      medicine.demand90 = (medicine.demand90 || 0) + qty;
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

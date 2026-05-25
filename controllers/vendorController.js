const Vendor = require("../models/Vendor");

// Get all vendors with pagination and filtering
exports.getAllVendors = async (req, res) => {
  try {
    const { search = "", page = 1, limit = 10, status } = req.query;
    const skip = (page - 1) * limit;

    const query = {};

    if (search) {
      query.name = { $regex: search, $options: "i" };
    }

    if (status) {
      query.status = status;
    }

    const vendors = await Vendor.find(query)
      .skip(skip)
      .limit(parseInt(limit))
      .sort({ createdAt: -1 });

    const total = await Vendor.countDocuments(query);

    res.json({
      success: true,
      data: vendors,
      pagination: {
        total,
        page: parseInt(page),
        pages: Math.ceil(total / limit),
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// Get single vendor by ID
exports.getVendorById = async (req, res) => {
  try {
    const vendor = await Vendor.findById(req.params.id);
    if (!vendor) {
      return res.status(404).json({ success: false, message: "Vendor not found" });
    }
    res.json({ success: true, data: vendor });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// Create new vendor
exports.createVendor = async (req, res) => {
  try {
    const { name, description, status } = req.body;

    if (!name) {
      return res.status(400).json({ success: false, message: "Vendor name is required" });
    }

    const existingVendor = await Vendor.findOne({ name: { $regex: `^${name}$`, $options: "i" } });
    if (existingVendor) {
      return res.status(400).json({ success: false, message: "Vendor already exists" });
    }

    const vendor = new Vendor({
      name: name.trim(),
      description: description || "",
      status: status || "Active",
    });

    await vendor.save();
    res.status(201).json({ success: true, data: vendor, message: "Vendor created successfully" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// Update vendor
exports.updateVendor = async (req, res) => {
  try {
    const { name, description, status } = req.body;
    const vendor = await Vendor.findById(req.params.id);

    if (!vendor) {
      return res.status(404).json({ success: false, message: "Vendor not found" });
    }

    if (name && name !== vendor.name) {
      const existingVendor = await Vendor.findOne({ name: { $regex: `^${name}$`, $options: "i" } });
      if (existingVendor) {
        return res.status(400).json({ success: false, message: "Vendor name already exists" });
      }
      vendor.name = name.trim();
    }

    if (description !== undefined) {
      vendor.description = description;
    }

    if (status) {
      vendor.status = status;
    }

    vendor.updatedAt = new Date();
    await vendor.save();
    res.json({ success: true, data: vendor, message: "Vendor updated successfully" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// Delete vendor
exports.deleteVendor = async (req, res) => {
  try {
    const vendor = await Vendor.findById(req.params.id);

    if (!vendor) {
      return res.status(404).json({ success: false, message: "Vendor not found" });
    }

    await Vendor.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: "Vendor deleted successfully" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// Get all active vendors (for dropdowns in bulk upload)
exports.getActiveVendors = async (req, res) => {
  try {
    const vendors = await Vendor.find({ status: "Active" }).sort({ name: 1 });
    res.json({ success: true, data: vendors });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

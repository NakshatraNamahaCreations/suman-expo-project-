const Category = require("../models/Category");
const multer = require("multer");
const path = require("path");
const fs = require("fs");

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "uploads/");
  },
  filename: (req, file, cb) => {
    const name = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, name + path.extname(file.originalname));
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|webp/i;
    if (!allowedTypes.test(file.mimetype)) {
      return cb(new Error("Only image files are allowed"));
    }
    cb(null, true);
  },
});

exports.getAllCategories = async (req, res) => {
  try {
    const { search, status, page = 1, limit = 10 } = req.query;
    const filter = {};

    if (search) {
      filter.name = { $regex: search, $options: "i" };
    }

    if (status) {
      filter.status = status;
    }

    const skip = (page - 1) * limit;
    const total = await Category.countDocuments(filter);
    const categories = await Category.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    res.json({
      success: true,
      data: categories,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / limit),
      },
    });
  } catch (err) {
    console.error("Error fetching categories:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.getCategoryById = async (req, res) => {
  try {
    const category = await Category.findById(req.params.id);
    if (!category) {
      return res.status(404).json({ success: false, message: "Category not found" });
    }
    res.json({ success: true, data: category });
  } catch (err) {
    console.error("Error fetching category:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.createCategory = async (req, res) => {
  try {
    const { name, description, status } = req.body;

    if (!name || name.trim() === "") {
      return res.status(400).json({ success: false, message: "Category name is required" });
    }

    const existing = await Category.findOne({ name: name.trim() });
    if (existing) {
      return res.status(400).json({ success: false, message: "Category already exists" });
    }

    let image = "";
    if (req.file) {
      image = `/uploads/${req.file.filename}`;
    }

    const category = new Category({
      name: name.trim(),
      description: description || "",
      image,
      status: status || "Active",
    });

    await category.save();
    res.status(201).json({ success: true, data: category, message: "Category created successfully" });
  } catch (err) {
    if (req.file) {
      fs.unlink(`uploads/${req.file.filename}`, () => {});
    }
    console.error("Error creating category:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.updateCategory = async (req, res) => {
  try {
    const { name, description, status } = req.body;
    const category = await Category.findById(req.params.id);

    if (!category) {
      if (req.file) {
        fs.unlink(`uploads/${req.file.filename}`, () => {});
      }
      return res.status(404).json({ success: false, message: "Category not found" });
    }

    if (name && name.trim() !== "") {
      const existing = await Category.findOne({
        name: name.trim(),
        _id: { $ne: req.params.id },
      });
      if (existing) {
        if (req.file) {
          fs.unlink(`uploads/${req.file.filename}`, () => {});
        }
        return res.status(400).json({ success: false, message: "Category name already exists" });
      }
      category.name = name.trim();
    }

    if (description !== undefined) {
      category.description = description;
    }

    if (status) {
      category.status = status;
    }

    if (req.file) {
      if (category.image) {
        const oldPath = category.image.replace(/^\//, "");
        fs.unlink(oldPath, () => {});
      }
      category.image = `/uploads/${req.file.filename}`;
    }

    await category.save();
    res.json({ success: true, data: category, message: "Category updated successfully" });
  } catch (err) {
    if (req.file) {
      fs.unlink(`uploads/${req.file.filename}`, () => {});
    }
    console.error("Error updating category:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.deleteCategory = async (req, res) => {
  try {
    const category = await Category.findByIdAndDelete(req.params.id);

    if (!category) {
      return res.status(404).json({ success: false, message: "Category not found" });
    }

    if (category.image) {
      const imagePath = category.image.replace(/^\//, "");
      fs.unlink(imagePath, () => {});
    }

    res.json({ success: true, message: "Category deleted successfully" });
  } catch (err) {
    console.error("Error deleting category:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.uploadMiddleware = upload.single("image");

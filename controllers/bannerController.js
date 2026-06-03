const Banner = require("../models/Banner");
const { deleteFromCloudinary } = require("../config/cloudinary");

/* GET /api/banners
   Public — mobile app fetches all active banners */
exports.getBanners = async (req, res) => {
  try {
    const banners = await Banner.find({ isActive: true })
      .sort({ displayOrder: 1, createdAt: 1 })
      .lean();
    return res.json({ success: true, data: banners });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
};

/* GET /api/banners/all
   Admin — returns all banners (including inactive) */
exports.getAllBanners = async (req, res) => {
  try {
    const banners = await Banner.find().sort({ displayOrder: 1, createdAt: 1 }).lean();
    return res.json({ success: true, data: banners });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
};

/* POST /api/banners/upload
   Admin — uploads a banner image to Cloudinary and saves the record.
   Uses multer-cloudinary middleware (bannerUpload.single("image")) */
exports.uploadBanner = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: "No image file provided" });
    }

    const count = await Banner.countDocuments();
    const banner = await Banner.create({
      imageUrl:     req.file.path,
      publicId:     req.file.filename,
      title:        req.body.title || "",
      isActive:     true,
      displayOrder: count,
    });

    return res.status(201).json({ success: true, data: banner });
  } catch (err) {
    console.error("❌ Banner upload error:", err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
};

/* DELETE /api/banners/:id
   Admin — deletes banner record + Cloudinary image */
exports.deleteBanner = async (req, res) => {
  try {
    const banner = await Banner.findById(req.params.id);
    if (!banner) return res.status(404).json({ success: false, message: "Banner not found" });

    try { await deleteFromCloudinary(banner.publicId, "image"); } catch (_) {}
    await banner.deleteOne();

    return res.json({ success: true, message: "Banner deleted" });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
};

/* PATCH /api/banners/:id/toggle
   Admin — toggle isActive */
exports.toggleBanner = async (req, res) => {
  try {
    const banner = await Banner.findById(req.params.id);
    if (!banner) return res.status(404).json({ success: false, message: "Banner not found" });
    banner.isActive = !banner.isActive;
    await banner.save();
    return res.json({ success: true, data: banner });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
};

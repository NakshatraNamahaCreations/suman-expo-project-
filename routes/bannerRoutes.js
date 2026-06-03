const express = require("express");
const router = express.Router();
const ctrl = require("../controllers/bannerController");
const { createCloudinaryUpload } = require("../middleware/cloudinaryUpload");

const bannerUpload = createCloudinaryUpload("banners");

// Public — mobile app
router.get("/", ctrl.getBanners);

// Admin
router.get("/all", ctrl.getAllBanners);
router.post("/upload", bannerUpload.single("image"), ctrl.uploadBanner);
router.delete("/:id", ctrl.deleteBanner);
router.patch("/:id/toggle", ctrl.toggleBanner);

module.exports = router;

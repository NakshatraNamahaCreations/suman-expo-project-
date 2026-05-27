const router = require("express").Router();
const { prescriptionUpload } = require("../middleware/cloudinaryUpload");
const { extractMedicinesFromPrescription } = require("../controllers/prescriptionExtractionController");
const { authMiddleware } = require("../middleware/auth");

// Health check for upload endpoint
router.get("/health", (req, res) => {
  res.json({ status: "ok", service: "upload", storage: "cloudinary" });
});

// Upload endpoint with Cloudinary - error handling included in middleware
// Auth middleware to capture userId
router.post(
  "/extract-medicines",
  authMiddleware,
  (req, res, next) => {
    prescriptionUpload.single("prescription")(req, res, (err) => {
      if (err) {
        console.error("❌ Upload middleware error:", err.message);
        return res.status(400).json({
          success: false,
          message: err.message || "File upload failed. Please check the file format and size.",
        });
      }
      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: "No file received. Please upload a prescription file.",
        });
      }
      next();
    });
  },
  extractMedicinesFromPrescription
);

module.exports = router;

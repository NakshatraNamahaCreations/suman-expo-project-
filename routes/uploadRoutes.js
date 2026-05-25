const router = require("express").Router();
const upload = require("../middleware/upload");
const { extractMedicinesFromPrescription } = require("../controllers/prescriptionExtractionController");

// Health check for upload endpoint
router.get("/health", (req, res) => {
  res.json({ status: "ok", service: "upload" });
});

// Upload endpoint with error handling
router.post("/extract-medicines", (req, res, next) => {
  upload.single("prescription")(req, res, (err) => {
    if (err) {
      console.error("Upload middleware error:", err.message);
      return res.status(400).json({ success: false, message: err.message });
    }
    next();
  });
}, extractMedicinesFromPrescription);

module.exports = router;

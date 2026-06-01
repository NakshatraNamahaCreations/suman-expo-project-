const express = require("express");
const router = express.Router();
const UserPrescriptionFile = require("../models/UserPrescriptionFile");
const { prescriptionUpload } = require("../middleware/cloudinaryUpload");
const { deleteFromCloudinary } = require("../config/cloudinary");

/* ══════════════════════════════════════════════════════════════
   GET /api/user-prescriptions/:userId
   Fetch all prescription files uploaded by a specific user.
══════════════════════════════════════════════════════════════ */
router.get("/:userId", async (req, res) => {
  try {
    const { userId } = req.params;

    if (!userId) {
      return res.status(400).json({ success: false, message: "userId is required" });
    }

    const files = await UserPrescriptionFile.find({ userId })
      .sort({ createdAt: -1 })
      .lean();

    return res.json({ success: true, data: files });
  } catch (err) {
    console.error("❌ Error fetching user prescriptions:", err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

/* ══════════════════════════════════════════════════════════════
   POST /api/user-prescriptions/upload
   Upload a prescription file directly (without OCR extraction).
   Use this for storing files that don't need medicine extraction.
   Body: multipart/form-data  { prescription: File, userId: string }
══════════════════════════════════════════════════════════════ */
router.post(
  "/upload",
  (req, res, next) => {
    prescriptionUpload.single("prescription")(req, res, (err) => {
      if (err) {
        console.error("❌ Upload error:", err.message);
        return res.status(400).json({
          success: false,
          message: err.message || "File upload failed",
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
  async (req, res) => {
    try {
      const { userId, patientId, patientName } = req.body;

      if (!userId) {
        // Clean up uploaded file from Cloudinary
        try {
          await deleteFromCloudinary(req.file.filename, "auto");
        } catch (_) {}
        return res.status(400).json({ success: false, message: "userId is required" });
      }

      const cloudinaryUrl = req.file.path;
      const publicId = req.file.filename;
      const mimeType = req.file.mimetype || "";
      const fileName = req.file.originalname || "";
      const fileSize = req.file.size || 0;

      const fileType = mimeType.includes("pdf")
        ? "pdf"
        : mimeType.startsWith("image/")
          ? "image"
          : "other";

      const doc = await UserPrescriptionFile.create({
        userId,
        patientId: patientId || null,
        patientName: patientName || "",
        cloudinaryUrl,
        publicId,
        fileType,
        mimeType,
        originalFileName: fileName,
        fileSize,
      });

      return res.status(201).json({
        success: true,
        message: "Prescription file uploaded successfully",
        data: {
          _id: doc._id,
          userId: doc.userId,
          patientId: doc.patientId,
          patientName: doc.patientName,
          cloudinaryUrl: doc.cloudinaryUrl,
          publicId: doc.publicId,
          fileType: doc.fileType,
          originalFileName: doc.originalFileName,
          createdAt: doc.createdAt,
        },
      });
    } catch (err) {
      console.error("❌ Error saving user prescription:", err.message);
      // Try to clean up
      if (req.file?.filename) {
        try {
          await deleteFromCloudinary(req.file.filename, "auto");
        } catch (_) {}
      }
      return res.status(500).json({ success: false, error: err.message });
    }
  }
);

/* ══════════════════════════════════════════════════════════════
   PATCH /api/user-prescriptions/:id/patient
   Attach a patientId to an existing prescription file.
   Body: { patientId: string, patientName?: string }
══════════════════════════════════════════════════════════════ */
router.patch("/:id/patient", async (req, res) => {
  try {
    const { patientId, patientName } = req.body;
    if (!patientId) {
      return res.status(400).json({ success: false, message: "patientId is required" });
    }
    const doc = await UserPrescriptionFile.findByIdAndUpdate(
      req.params.id,
      { patientId, ...(patientName ? { patientName } : {}) },
      { new: true }
    );
    if (!doc) {
      return res.status(404).json({ success: false, message: "Prescription file not found" });
    }
    return res.json({ success: true, data: doc });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

/* ══════════════════════════════════════════════════════════════
   DELETE /api/user-prescriptions/:id
   Delete a prescription file by its DB document ID.
══════════════════════════════════════════════════════════════ */
router.delete("/:id", async (req, res) => {
  try {
    const doc = await UserPrescriptionFile.findById(req.params.id);
    if (!doc) {
      return res.status(404).json({ success: false, message: "Prescription file not found" });
    }

    // Remove from Cloudinary
    try {
      await deleteFromCloudinary(doc.publicId, "auto");
    } catch (cdnErr) {
      console.error("⚠️ Cloudinary delete failed:", cdnErr.message);
    }

    await UserPrescriptionFile.findByIdAndDelete(req.params.id);

    return res.json({ success: true, message: "Prescription file deleted" });
  } catch (err) {
    console.error("❌ Error deleting prescription file:", err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;

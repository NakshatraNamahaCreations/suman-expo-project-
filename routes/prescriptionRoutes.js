const router = require("express").Router();
const ctrl   = require("../controllers/prescriptionController");
const Prescription = require("../models/Prescription");
const { authMiddleware } = require("../middleware/auth");
const { deleteFromCloudinary } = require("../config/cloudinary");

// Stats for tab header cards
router.get("/stats", ctrl.getPrescriptionStats);

// Cleanup unpaid orphaned prescriptions
router.delete("/cleanup", ctrl.cleanUnusedPrescriptions);

// 📱 User prescription endpoints (auth required)

/**
 * Get all prescriptions uploaded by the current user
 * GET /api/prescriptions/my-prescriptions
 */
router.get("/my-prescriptions", authMiddleware, async (req, res) => {
  try {
    const userId = req.user?.id || req.userId;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "User ID not found in request",
      });
    }

    const prescriptions = await Prescription.find({ userId })
      .select("_id prescriptionUrl prescriptionPublicId fileOriginalName fileMimetype fileSize uploadedAt createdAt")
      .sort({ createdAt: -1 })
      .lean();

    return res.json({
      success: true,
      data: prescriptions,
      count: prescriptions.length,
    });
  } catch (error) {
    console.error("❌ Error fetching user prescriptions:", error.message);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch prescriptions",
    });
  }
});

/**
 * Delete a prescription file uploaded by the user
 * DELETE /api/prescriptions/my-prescriptions/:prescriptionId
 */
router.delete("/my-prescriptions/:prescriptionId", authMiddleware, async (req, res) => {
  try {
    const { prescriptionId } = req.params;
    const userId = req.user?.id || req.userId;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "User ID not found in request",
      });
    }

    const prescription = await Prescription.findById(prescriptionId);

    if (!prescription) {
      return res.status(404).json({
        success: false,
        message: "Prescription not found",
      });
    }

    // Check if prescription belongs to this user
    if (prescription.userId !== userId) {
      return res.status(403).json({
        success: false,
        message: "Not authorized to delete this prescription",
      });
    }

    // Delete from Cloudinary if file exists
    if (prescription.prescriptionPublicId) {
      try {
        await deleteFromCloudinary(prescription.prescriptionPublicId, "auto");
        console.log(`✅ Deleted prescription file from Cloudinary: ${prescription.prescriptionPublicId}`);
      } catch (deleteError) {
        console.error("Warning: Could not delete file from Cloudinary:", deleteError.message);
      }
    }

    // Delete from database
    await Prescription.findByIdAndDelete(prescriptionId);

    return res.json({
      success: true,
      message: "Prescription deleted successfully",
    });
  } catch (error) {
    console.error("❌ Error deleting prescription:", error.message);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to delete prescription",
    });
  }
});

// CRUD
router.post("/",    ctrl.createPrescription);
router.get("/",     ctrl.getPrescriptions);
router.get("/:id",  ctrl.getPrescriptionById);
router.put("/:id",  ctrl.updatePrescription);
router.delete("/:id", ctrl.deletePrescription);

// Actions
router.patch("/:id/status",          ctrl.updatePrescriptionStatus);
router.post("/:id/renew",            ctrl.renewPrescription);
router.post("/:id/process-payment",  ctrl.processPayment);

module.exports = router;

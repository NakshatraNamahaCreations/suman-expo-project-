const express = require("express");
const router  = express.Router();
const PatientLog = require("../models/PatientLog");
const PatientDetails = require("../models/PatientDetails");

/* POST /api/patient-logs — record an action and apply it */
router.post("/", async (req, res) => {
  try {
    const { patientDbId, actionType, reason = "", performedBy = "Admin" } = req.body;
    if (!patientDbId || !actionType) {
      return res.status(400).json({ success: false, message: "patientDbId and actionType are required" });
    }

    const patient = await PatientDetails.findById(patientDbId);
    if (!patient) return res.status(404).json({ success: false, message: "Patient not found" });

    // Apply the action
    if (actionType === "Active")   { patient.isActive = true;  await patient.save(); }
    if (actionType === "Inactive") { patient.isActive = false; await patient.save(); }
    if (actionType === "Delete") {
      patient.isDeleted = true;
      patient.deletedAt = new Date();
      await patient.save();
    }

    // Save log
    await PatientLog.create({
      patientId:    patient.patientId   || "",
      patientDbId:  patient._id.toString(),
      patientName:  patient.name        || "",
      mobileNumber: patient.primaryPhone || patient.phone || "",
      actionType,
      reason,
      performedBy,
      performedAt: new Date(),
    });

    res.json({ success: true, message: `Patient ${actionType} action logged successfully` });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/* GET /api/patient-logs — list all logs */
router.get("/", async (req, res) => {
  try {
    const { page = 1, limit = 100 } = req.query;
    const skip = (page - 1) * limit;
    const [logs, total] = await Promise.all([
      PatientLog.find().sort({ performedAt: -1 }).skip(Number(skip)).limit(Number(limit)).lean(),
      PatientLog.countDocuments(),
    ]);
    res.json({ success: true, data: logs, total });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;

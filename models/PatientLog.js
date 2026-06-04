const mongoose = require("mongoose");

const patientLogSchema = new mongoose.Schema(
  {
    patientId:    { type: String, default: "" },
    patientDbId:  { type: String, default: "" },
    patientName:  { type: String, default: "" },
    mobileNumber: { type: String, default: "" },
    actionType:   { type: String, enum: ["Active", "Inactive", "Delete"], required: true },
    reason:       { type: String, default: "" },
    performedBy:  { type: String, default: "Admin" },
    performedAt:  { type: Date,   default: Date.now },
  },
  { timestamps: true }
);

patientLogSchema.index({ performedAt: -1 });

module.exports = mongoose.model("PatientLog", patientLogSchema);

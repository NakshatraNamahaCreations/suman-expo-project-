const mongoose = require("mongoose");

const medSchema = new mongoose.Schema({
  medicine: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Medicine",
    required: true,
  },
  duration: { type: Number, required: true },
  freq: {
    m: { type: Number, default: 0 },
    a: { type: Number, default: 0 },
    n: { type: Number, default: 0 },
  },
  qty: Number,
  price: Number,
  subtotal: Number,
  unit: String,
  doseAmount: { type: Number, default: 1 },
});

const prescriptionSchema = new mongoose.Schema(
  {
    rxId: { type: String, unique: true },

    // User who uploaded the prescription
    userId: {
      type: String,
      required: true,
      index: true,
      description: "ID of the user who uploaded the prescription"
    },

    doctor: String,
    start: Date,
    expiry: Date,
    subtotal: Number,
    gst: Number,
    discount: { type: Number, default: 0 },
    total: Number,
    payStatus: {
      type: String,
      enum: ["Unpaid", "Paid"],
      default: "Unpaid",
    },
    orderStatus: {
      type: String,
      enum: ["Pending", "Processing", "Packed", "Shipped", "Delivered"],
      default: "Pending",
    },
    meds: [medSchema],

    // Cloudinary file storage
    prescriptionUrl: {
      type: String,
      description: "Cloudinary secure URL to the prescription file"
    },
    prescriptionPublicId: {
      type: String,
      description: "Cloudinary public ID for the prescription file (for deletion)"
    },

    // Deprecated: Local file storage (kept for backward compatibility)
    filePath: {
      type: String,
      description: "Path to the uploaded prescription file (PDF/Image) - deprecated, use prescriptionUrl"
    },
    fileOriginalName: {
      type: String,
      description: "Original file name as uploaded by user"
    },
    fileMimetype: {
      type: String,
      description: "MIME type of the uploaded file"
    },
    fileSize: {
      type: Number,
      description: "File size in bytes"
    },
    uploadedAt: {
      type: Date,
      description: "When the prescription file was uploaded"
    }
  },
  { timestamps: true }
);

/* ── INDEXES for fast queries at scale ── */

prescriptionSchema.index({ payStatus: 1, orderStatus: 1 });
prescriptionSchema.index({ createdAt: -1 });
prescriptionSchema.index({ userId: 1, createdAt: -1 }); // For fetching user prescriptions

module.exports = mongoose.model("Prescription", prescriptionSchema);
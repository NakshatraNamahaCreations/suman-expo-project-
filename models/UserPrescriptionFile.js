const mongoose = require("mongoose");

/**
 * UserPrescriptionFile — stores every prescription file a user uploads.
 * Files are hosted on Cloudinary (permanent URLs — survive app restarts & deploys).
 */
const userPrescriptionFileSchema = new mongoose.Schema(
  {
    userId: {
      type: String,
      required: true,
      index: true,
    },

    /* Cloudinary details */
    cloudinaryUrl: {
      type: String,
      required: true,
    },
    publicId: {
      type: String,
      required: true,
    },

    /* File metadata */
    fileType: {
      type: String,
      enum: ["image", "pdf", "other"],
      default: "image",
    },
    mimeType: {
      type: String,
      default: "",
    },
    originalFileName: {
      type: String,
      default: "",
    },
    fileSize: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true }
);

userPrescriptionFileSchema.index({ userId: 1, createdAt: -1 });

module.exports = mongoose.model("UserPrescriptionFile", userPrescriptionFileSchema);

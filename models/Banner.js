const mongoose = require("mongoose");

const bannerSchema = new mongoose.Schema(
  {
    imageUrl:     { type: String, required: true },
    publicId:     { type: String, required: true },
    title:        { type: String, default: "" },
    isActive:     { type: Boolean, default: true },
    displayOrder: { type: Number, default: 0 },
  },
  { timestamps: true }
);

bannerSchema.index({ isActive: 1, displayOrder: 1 });

module.exports = mongoose.model("Banner", bannerSchema);

const mongoose = require("mongoose");

const customerReviewSchema = new mongoose.Schema(
  {
    customerName: { type: String, required: true, trim: true },
    rating:       { type: Number, required: true, min: 1, max: 5, default: 5 },
    review:       { type: String, required: true, trim: true },
    isActive:     { type: Boolean, default: true },
  },
  { timestamps: true }
);

customerReviewSchema.index({ isActive: 1, createdAt: -1 });

module.exports = mongoose.model("CustomerReview", customerReviewSchema);

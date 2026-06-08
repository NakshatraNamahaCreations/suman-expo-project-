const mongoose = require("mongoose");

const sectionSchema = new mongoose.Schema(
  { title: { type: String, required: true }, description: { type: String, required: true } },
  { _id: false }
);

const healthArticleSchema = new mongoose.Schema(
  {
    title:            { type: String, required: true, trim: true },
    shortDescription: { type: String, required: true, trim: true },
    readingTime:      { type: String, required: true, trim: true },
    image:            { type: String, default: "" },
    imagePublicId:    { type: String, default: "" },
    sections:         [sectionSchema],
    status:           { type: String, enum: ["Active", "Inactive"], default: "Active" },
  },
  { timestamps: true }
);

module.exports = mongoose.model("HealthArticle", healthArticleSchema);

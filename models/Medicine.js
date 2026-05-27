const mongoose = require("mongoose");

const medicineSchema = new mongoose.Schema(
  {
    /* MEDICINE IDENTIFICATION */
    mfr: {
      type: String,
      default: ""
    },

    vendor: {
      type: String,
      default: "",
      trim: true,
      index: true
    },

    description: {
      type: String,
      required: true,
      trim: true
    },

    /* BATCH & EXPIRY */
    batchNo: {
      type: String,
      default: ""
    },

    expDate: {
      type: String,
      default: ""
    },

    /* PACK & INVENTORY */
    pack: {
      type: String,
      default: ""
    },

    qty: {
      type: Number,
      default: 0
    },

    /* PRICING */
    oldMrp: {
      type: Number,
      default: 0
    },

    newMrp: {
      type: Number,
      default: 0
    },

    tradePrice: {
      type: Number,
      default: 0
    },

    /* DISCOUNTS & TAX */
    discPercent: {
      type: Number,
      default: 0
    },

    free: {
      type: Number,
      default: 0
    },

    scmDisc: {
      type: Number,
      default: 0
    },

    taxableValue: {
      type: Number,
      default: 0
    },

    gstPercent: {
      type: Number,
      default: 5
    },

    netValue: {
      type: Number,
      default: 0
    },

    /* CLASSIFICATION */
    hsnCode: {
      type: String,
      default: ""
    },

    /* SEARCH & UNIQUENESS */
    normalizedName: {
      type: String,
      lowercase: true,
      trim: true,
      index: true,
      unique: true
    },

    /* STATUS */
    status: {
      type: String,
      enum: ["Active", "Inactive"],
      default: "Active"
    },

    /* CLOUDINARY IMAGE STORAGE */
    imageUrl: {
      type: String,
      default: null
    },

    imagePublicId: {
      type: String,
      default: null
    },

    images: [
      {
        url: String,
        publicId: String,
        uploadedAt: { type: Date, default: Date.now }
      }
    ]
  },
  { timestamps: true }
);

/* ===============================
   PRICE VIRTUAL (for backward compat)
================================ */
medicineSchema.virtual("price").get(function () {
  return this.newMrp;
});

/* ===============================
   PROFIT MARGIN
================================ */
medicineSchema.virtual("profitPerUnit").get(function () {
  return (this.newMrp || 0) - (this.tradePrice || 0);
});

medicineSchema.virtual("profitMargin").get(function () {
  if (!this.newMrp) return 0;
  return Math.round(((this.newMrp - (this.tradePrice || 0)) / this.newMrp) * 100);
});

/* ===============================
   PRE-SAVE HOOK
================================ */
medicineSchema.pre("save", function () {
  if (this.description) {
    this.normalizedName = this.description
      .toLowerCase()
      .trim()
      .replace(/\s+/g, " ")
      .replace(/[^\w\s]/g, "")
      .trim();
  }
});

/* ── INDEXES for fast queries at scale ── */
medicineSchema.index({ description: 1 });
medicineSchema.index({ mfr: 1 });
medicineSchema.index({ hsnCode: 1 });
medicineSchema.index({ status: 1 });

medicineSchema.set("toJSON", { virtuals: true });
medicineSchema.set("toObject", { virtuals: true });

module.exports = mongoose.model("Medicine", medicineSchema);

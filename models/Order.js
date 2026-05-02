const mongoose = require("mongoose");

const orderSchema = new mongoose.Schema(
  {
    orderId: {
      type: String,
      unique: true,
    },

    invoiceNumber: {
      type: String,
      unique: true,
    },

    invoiceStatus: {
      type: String,
      enum: ["Pending", "Generated"],
      default: "Pending",
    },

    invoiceDate: Date,

    userId: {
      type: String,
      required: true,
      index: true,
    },

    prescription: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Prescription",
    },

    patient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "PatientDetails",
    },

    // ✅ SNAPSHOT (IMMUTABLE DATA)
    patientDetails: {
      patientId: String,
      name: String,
      phone: String,
      secondaryPhone: String,
      gender: String,
      orderingFor: String,
    },

    addressDetails: {
      fullAddress: String,
      city: String,
      state: String,
      pincode: String,
    },

    subtotal: {
      type: Number,
      default: 0,
    },

    deliveryFee: {
      type: Number,
      default: 0,
    },

    gst: {
      type: Number,
      default: 0,
    },

    totalAmount: {
      type: Number,
      required: true,
    },

    // 🔥 ITEMS
    items: [
      {
        medicineId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Medicine",
        },

        /* CORE FIELDS */
        itemName: {
          type: String,
          default: ""
        },

        qty: {
          type: Number,
          required: true,
        },

        price: {
          type: Number,
          required: true,
        },

        subtotal: {
          type: Number,
          default: 0,
        },

        /* DOSAGE */
        duration: {
          type: Number,
          default: 0,
        },

        freq: {
          m: { type: Number, default: 0 },
          a: { type: Number, default: 0 },
          n: { type: Number, default: 0 },
        },

        /* MEDICINE SNAPSHOT FIELDS */
        mfCode: {
          type: String,
          default: ""
        },

        mfacName: {
          type: String,
          default: ""
        },

        itemCode: {
          type: String,
          default: ""
        },

        hsnCode: {
          type: String,
          default: ""
        },

        batchNo: {
          type: String,
          default: ""
        },

        expDate: {
          type: String,
          default: ""
        },

        packOf: {
          type: String,
          default: ""
        },

        oldMrpPrice: {
          type: Number,
          default: 0
        },

        discount: {
          type: Number,
          default: 0
        },

        withoutTax: {
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
        }
      },
    ],

    // 🔥 UNMATCHED MEDICINES (for pharmacist review)
    unmatchedMedicines: [
      {
        name: String,
        dosage: String,
        duration: Number,
        qty: Number,
        unit: String,
      },
    ],

    // 🔥 PHARMACIST REVIEW FLAG
    pharmacistReview: {
      type: Boolean,
      default: false,
    },

    // 🔥 RAZORPAY DETAILS
    razorpayOrderId: {
      type: String,
      index: true, // ✅ faster search
    },

    razorpayPaymentId: {
      type: String,
      index: true,
    },

    razorpaySignature: {
      type: String,
    },

    // 🔥 PAYMENT STATUS
    paymentStatus: {
      type: String,
      enum: ["Pending", "Paid", "Failed"],
      default: "Pending",
      index: true,
    },

    paymentDate: Date,

    // 🔥 ORDER STATUS
    orderStatus: {
      type: String,
      enum: ["Created", "Processing", "Packed", "Shipped", "Delivered", "PendingPharmacistReview"],
      default: "Created",
      index: true,
    },
    orderSource: {
    type: String,
    enum: ["admin", "mobile"],
    default: "mobile"
    },
    isDeleted: {
      type: Boolean,
      default: false
    },
    deliveryAddress: {
      type: String,
      default: "",
    },

    deliveredAt: Date,
  },
  { timestamps: true }
);

/* ── INDEXES ── */
orderSchema.index({ orderStatus: 1, createdAt: -1 });
orderSchema.index({ paymentStatus: 1, createdAt: -1 });
orderSchema.index({ prescription: 1 });
orderSchema.index({ createdAt: -1 });
orderSchema.index({ "patientDetails.name": 1 });

/* ── AUTO GENERATE IDS ── */
orderSchema.pre("save", function () {
  if (!this.orderId) {
    this.orderId = "ORD-" + Date.now();
  }

  if (!this.invoiceNumber) {
    this.invoiceNumber = "INV-" + Date.now();
  }
});

module.exports = mongoose.model("Order", orderSchema);
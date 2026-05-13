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
      age: Number,
      email: String,
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

        /* CORE FIELDS - from Order Summary */
        name: {
          type: String,
          default: ""
        },

        description: {
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

        netValue: {
          type: Number,
          default: 0
        },

        subtotal: {
          type: Number,
          default: 0,
        },

        /* DOSAGE & DURATION */
        duration: {
          type: Number,
          default: 0,
        },

        frequency: {
          type: String,
          default: ""
        },

        freq: {
          m: { type: Number, default: 0 },
          a: { type: Number, default: 0 },
          n: { type: Number, default: 0 },
        },

        /* GST BREAKDOWN */
        gstPercent: {
          type: Number,
          default: 5
        },

        basePrice: {
          type: Number,
          default: 0
        },

        gstAmount: {
          type: Number,
          default: 0
        },

        cgst: {
          type: Number,
          default: 0
        },

        sgst: {
          type: Number,
          default: 0
        },

        /* MEDICINE SNAPSHOT FIELDS */
        mfr: {
          type: String,
          default: ""
        },

        pack: {
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

        oldMrp: {
          type: Number,
          default: 0
        },

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
      enum: ["Created", "Processing", "Packed", "Shipped", "Delivered", "Cancelled", "PendingPharmacistReview"],
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
function generateOrderId() {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let result = "CX-";
  for (let i = 0; i < 8; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

orderSchema.pre("save", function () {
  if (!this.orderId) {
    this.orderId = generateOrderId();
  }

  if (!this.invoiceNumber) {
    this.invoiceNumber = "INV-" + Date.now();
  }
});

module.exports = mongoose.model("Order", orderSchema);
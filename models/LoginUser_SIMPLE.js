const mongoose = require("mongoose");

// ════════════════════════════════════════════════════
// LOGIN USER SCHEMA - SIMPLE VERSION
// ════════════════════════════════════════════════════
const loginUserSchema = new mongoose.Schema(
  {
    // ──── Phone Number (Unique, Primary Key) ────
    phone: {
      type: String,
      required: true,
      unique: true,
      match: /^[0-9]{10}$/, // Must be exactly 10 digits
      index: true, // For fast lookups
    },

    // ──── User Name (Optional) ────
    name: {
      type: String,
      default: null,
    },

    // ──── Email (Optional) ────
    email: {
      type: String,
      sparse: true,
    },

    // ──── OTP Information ────
    otp: {
      code: String, // 4-digit OTP
      createdAt: Date, // When OTP was generated
      expiresAt: Date, // When OTP expires (10 minutes)
      attempts: {
        type: Number,
        default: 0, // Failed attempt counter
      },
      verified: {
        type: Boolean,
        default: false,
      },
    },

    // ──── Verification Status ────
    isPhoneVerified: {
      type: Boolean,
      default: false,
      index: true,
    },

    // ──── Account Status ────
    status: {
      type: String,
      enum: ["active", "inactive", "blocked"],
      default: "active",
    },

    // ──── Status Change Tracking ────
    statusRemark: String,
    statusChangedAt: Date,

    // ──── Login Tracking ────
    lastLogin: Date,
    lastOtpRequestAt: Date,

    // ──── Timestamps ────
    createdAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
    updatedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true } // Auto-update updatedAt on save
);

// ════════════════════════════════════════════════════
// INDEXES - For Fast Queries
// ════════════════════════════════════════════════════
loginUserSchema.index({ phone: 1 });
loginUserSchema.index({ isPhoneVerified: 1 });
loginUserSchema.index({ status: 1 });

// ════════════════════════════════════════════════════
// METHOD: Don't expose OTP in JSON response
// ════════════════════════════════════════════════════
loginUserSchema.methods.toJSON = function () {
  const obj = this.toObject();
  delete obj.otp; // Remove sensitive OTP data
  return obj;
};

// ════════════════════════════════════════════════════
// EXPORT MODEL
// ════════════════════════════════════════════════════
module.exports = mongoose.model("LoginUser", loginUserSchema);

/*
════════════════════════════════════════════════════
EXAMPLE DOCUMENT IN DATABASE
════════════════════════════════════════════════════

{
  _id: ObjectId("507f1f77bcf86cd799439011"),
  phone: "9876543210",              // User's phone number
  name: "John Doe",                 // User's name (optional)
  email: "john@example.com",        // User's email (optional)

  otp: {                            // OTP info (cleared after verification)
    code: "1234",
    createdAt: 2026-05-21T10:30:00Z,
    expiresAt: 2026-05-21T10:40:00Z,
    attempts: 0,
    verified: false
  },

  isPhoneVerified: true,            // Is phone verified?
  status: "active",                 // Account status
  lastLogin: 2026-05-21T10:30:00Z, // Last login time

  createdAt: 2026-05-20T15:00:00Z,
  updatedAt: 2026-05-21T10:30:00Z
}

════════════════════════════════════════════════════
*/

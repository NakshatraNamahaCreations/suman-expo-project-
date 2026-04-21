const mongoose = require("mongoose");

const loginUserSchema = new mongoose.Schema(
  {
    phone: {
      type: String,
      required: true,
      unique: true,
      match: /^[0-9]{10}$/,
      index: true,
    },
    name: {
      type: String,
      default: null,
    },
    email: {
      type: String,
      sparse: true,
    },
    otp: {
      code: String,
      createdAt: Date,
      expiresAt: Date,
      attempts: {
        type: Number,
        default: 0,
      },
      verified: {
        type: Boolean,
        default: false,
      },
    },
    isPhoneVerified: {
      type: Boolean,
      default: false,
    },
    status: {
      type: String,
      enum: ["active", "inactive", "blocked"],
      default: "active",
    },
    lastLogin: Date,
    lastOtpRequestAt: Date,
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
  { timestamps: true }
);

// Index for quick lookups
loginUserSchema.index({ phone: 1 });
loginUserSchema.index({ isPhoneVerified: 1 });

// Remove OTP from JSON response
loginUserSchema.methods.toJSON = function () {
  const obj = this.toObject();
  delete obj.otp;
  return obj;
};

module.exports = mongoose.model("LoginUser", loginUserSchema);

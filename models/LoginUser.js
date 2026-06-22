const mongoose = require("mongoose");

const loginUserSchema = new mongoose.Schema(
  {
    phone: {
      type: String,
      unique: true,
      sparse: true,
      match: /^[0-9]{10}$/,
      index: true,
      default: null,
    },
    name: {
      type: String,
      default: null,
    },
    email: {
      type: String,
      sparse: true,
      default: null,
    },
    password: {
      type: String,
      default: null,
    },
    secondaryPhone: {
      type: String,
      default: null,
      validate: {
        validator: (v) => !v || /^[0-9]{10}$/.test(v),
        message: "Secondary phone must be 10 digits",
      },
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
    statusRemark: String,
    statusChangedAt: Date,
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

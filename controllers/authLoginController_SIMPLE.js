const jwt = require("jsonwebtoken");
const axios = require("axios");
const LoginUser = require("../models/LoginUser");

// ════════════════════════════════════════════════════
// CONFIGURATION
// ════════════════════════════════════════════════════
const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key";
const JWT_EXPIRE = process.env.JWT_EXPIRE || "7d";
const OTP_EXPIRY = parseInt(process.env.OTP_EXPIRY_MINUTES || "10") * 60 * 1000;
const MAX_ATTEMPTS = parseInt(process.env.MAX_OTP_ATTEMPTS || "5");

// MSG91 Configuration
const MSG91_BASE_URL = process.env.MSG91_BASE_URL || "https://control.msg91.com/api/sendhttp.php";
const MSG91_AUTH_KEY = process.env.MSG91_AUTH_KEY;
const MSG91_ROUTE = process.env.MSG91_ROUTE || "4";
const MSG91_SENDER_ID = process.env.MSG91_SENDER_ID || "RGMEDL";

// ════════════════════════════════════════════════════
// HELPER: Send OTP via MSG91
// ════════════════════════════════════════════════════
async function sendOTPViaMSG91(phone, otp, name) {
  try {
    // Your custom template message
    const message = `Dear ${name}, your OTP for RG MEDLINK login is ${otp}. Valid for 10 minutes. Do not share this OTP with anyone. RG Pharma`;

    // Send SMS using MSG91 API
    const response = await axios.get(MSG91_BASE_URL, {
      params: {
        authkey: MSG91_AUTH_KEY,
        mobiles: `91${phone}`, // Add country code 91 for India
        message: message,
        route: MSG91_ROUTE,
        sender: MSG91_SENDER_ID,
      },
    });

    console.log(`✅ SMS sent to ${phone}:`, response.data);
    return { success: true, message: "OTP sent successfully" };
  } catch (error) {
    console.error(`❌ SMS Error for ${phone}:`, error.message);
    return { success: false, message: "Failed to send SMS" };
  }
}

// ════════════════════════════════════════════════════
// STEP 1: SEND OTP
// ════════════════════════════════════════════════════
exports.sendOTP = async (req, res) => {
  try {
    const { phone } = req.body;

    // ──── Validate Phone ────
    if (!phone) {
      return res.status(400).json({
        success: false,
        message: "Phone number is required",
      });
    }

    // Phone must be exactly 10 digits
    if (!/^\d{10}$/.test(phone)) {
      return res.status(400).json({
        success: false,
        message: "Invalid phone. Must be 10 digits (e.g., 9876543210)",
      });
    }

    // ──── Generate 4-Digit OTP ────
    const otp = Math.floor(1000 + Math.random() * 9000).toString();
    const createdAt = new Date();
    const expiresAt = new Date(Date.now() + OTP_EXPIRY);

    // ──── Find or Create User ────
    let user = await LoginUser.findOne({ phone });

    if (!user) {
      // New user - create account
      user = new LoginUser({
        phone,
        name: null,
        otp: {
          code: otp,
          createdAt,
          expiresAt,
          attempts: 0,
          verified: false,
        },
        lastOtpRequestAt: createdAt,
      });
    } else {
      // Existing user - update OTP
      user.otp = {
        code: otp,
        createdAt,
        expiresAt,
        attempts: 0,
        verified: false,
      };
      user.lastOtpRequestAt = createdAt;
    }

    // Save to database
    await user.save();

    // ──── Send SMS via MSG91 ────
    const smsResult = await sendOTPViaMSG91(phone, otp, user.name || "User");

    // ──── Return Response ────
    console.log(`📱 [OTP] Phone: ${phone}, OTP: ${otp}, Name: ${user.name || "New User"}`);

    res.json({
      success: smsResult.success,
      message: smsResult.message,
      phone,
      otp: {
        code: otp, // For development testing
        expiresAt,
      },
    });
  } catch (error) {
    console.error("❌ Send OTP Error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to send OTP",
      error: error.message,
    });
  }
};

// ════════════════════════════════════════════════════
// STEP 2: VERIFY OTP
// ════════════════════════════════════════════════════
exports.verifyOTP = async (req, res) => {
  try {
    const { phone, otp } = req.body;

    // ──── Validate Input ────
    if (!phone || !otp) {
      return res.status(400).json({
        success: false,
        message: "Phone and OTP are required",
      });
    }

    // ──── Find User ────
    const user = await LoginUser.findOne({ phone });

    if (!user || !user.otp) {
      return res.status(400).json({
        success: false,
        message: "OTP expired or not sent. Please request a new OTP.",
      });
    }

    // ──── Check OTP Expiry ────
    if (new Date() > user.otp.expiresAt) {
      user.otp = null;
      await user.save();
      return res.status(400).json({
        success: false,
        message: "OTP expired. Please request a new one.",
      });
    }

    // ──── Check Max Attempts ────
    user.otp.attempts = (user.otp.attempts || 0) + 1;
    if (user.otp.attempts > MAX_ATTEMPTS) {
      user.otp = null;
      await user.save();
      return res.status(400).json({
        success: false,
        message: "Too many wrong attempts. Please request a new OTP.",
      });
    }

    // ──── Verify OTP Code ────
    if (user.otp.code !== otp) {
      await user.save();
      const remaining = MAX_ATTEMPTS - user.otp.attempts;
      return res.status(400).json({
        success: false,
        message: `Invalid OTP. ${remaining} attempts remaining.`,
      });
    }

    // ──── OTP Verified! Generate JWT Token ────
    user.isPhoneVerified = true;
    user.otp = null;
    user.lastLogin = new Date();
    await user.save();

    const token = jwt.sign(
      {
        userId: user._id.toString(),
        phone: user.phone,
      },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRE }
    );

    console.log(`✅ User logged in: ${phone} (${user.name || "No name"})`);

    res.json({
      success: true,
      message: "OTP verified successfully",
      token,
      userId: user._id.toString(),
      phone: user.phone,
      name: user.name,
      requiresName: !user.name, // True if name is not set
    });
  } catch (error) {
    console.error("❌ Verify OTP Error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to verify OTP",
      error: error.message,
    });
  }
};

// ════════════════════════════════════════════════════
// GET USER PROFILE (Protected Route)
// ════════════════════════════════════════════════════
exports.getUserProfile = async (req, res) => {
  try {
    const userId = req.user?.userId;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    const user = await LoginUser.findById(userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    res.json({
      success: true,
      data: user,
    });
  } catch (error) {
    console.error("❌ Get Profile Error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch profile",
    });
  }
};

// ════════════════════════════════════════════════════
// UPDATE USER NAME (Protected Route)
// ════════════════════════════════════════════════════
exports.updateUserName = async (req, res) => {
  try {
    const userId = req.user?.userId;
    const { name } = req.body;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    if (!name || name.trim() === "") {
      return res.status(400).json({
        success: false,
        message: "Name is required",
      });
    }

    const user = await LoginUser.findByIdAndUpdate(
      userId,
      { name: name.trim(), updatedAt: new Date() },
      { new: true }
    );

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    res.json({
      success: true,
      message: "Name updated successfully",
      data: user,
    });
  } catch (error) {
    console.error("❌ Update Name Error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update name",
    });
  }
};

// ════════════════════════════════════════════════════
// LOGOUT
// ════════════════════════════════════════════════════
exports.logout = async (req, res) => {
  try {
    // Token cleared on frontend in AsyncStorage
    res.json({
      success: true,
      message: "Logged out successfully",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Logout failed",
    });
  }
};

const jwt = require("jsonwebtoken");
const LoginUser = require("../models/LoginUser");

const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key";
const JWT_EXPIRE = process.env.JWT_EXPIRE || "7d";

/* ════════════════════════════════════════════════════
   SEND OTP - Step 1
════════════════════════════════════════════════════ */
exports.sendOTP = async (req, res) => {
  try {
    const { phone } = req.body;

    // Validate phone
    if (!phone) {
      return res.status(400).json({
        success: false,
        message: "Phone number is required",
      });
    }

    if (!/^\d{10}$/.test(phone)) {
      return res.status(400).json({
        success: false,
        message: "Invalid phone number. Must be 10 digits.",
      });
    }

    // Generate 4-digit OTP
    const otp = Math.floor(1000 + Math.random() * 9000).toString();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

    // Find or create user
    let user = await LoginUser.findOne({ phone });

    if (!user) {
      // New user - create account
      user = new LoginUser({
        phone,
        name: null,
        otp: {
          code: otp,
          createdAt: new Date(),
          expiresAt,
          attempts: 0,
          verified: false,
        },
        lastOtpRequestAt: new Date(),
      });
    } else {
      // Existing user - update OTP
      user.otp = {
        code: otp,
        createdAt: new Date(),
        expiresAt,
        attempts: 0,
        verified: false,
      };
      user.lastOtpRequestAt = new Date();
    }

    await user.save();

    console.log(`[OTP] Phone: ${phone}, OTP: ${otp}`);

    res.json({
      success: true,
      message: "OTP sent successfully",
      phone,
      otp: process.env.NODE_ENV === "development" ? otp : undefined, // Dev only
    });
  } catch (err) {
    console.error("Send OTP error:", err);
    res.status(500).json({
      success: false,
      message: "Failed to send OTP",
    });
  }
};

/* ════════════════════════════════════════════════════
   VERIFY OTP - Step 2
════════════════════════════════════════════════════ */
exports.verifyOTP = async (req, res) => {
  try {
    const { phone, otp } = req.body;

    // Validate
    if (!phone || !otp) {
      return res.status(400).json({
        success: false,
        message: "Phone and OTP are required",
      });
    }

    // Find user
    const user = await LoginUser.findOne({ phone });

    if (!user || !user.otp) {
      return res.status(400).json({
        success: false,
        message: "OTP expired or not sent. Please request a new OTP.",
      });
    }

    // Check OTP expiry
    if (new Date() > user.otp.expiresAt) {
      user.otp = null;
      await user.save();
      return res.status(400).json({
        success: false,
        message: "OTP expired. Please request a new one.",
      });
    }

    // Check max attempts
    user.otp.attempts = (user.otp.attempts || 0) + 1;
    if (user.otp.attempts > 5) {
      user.otp = null;
      await user.save();
      return res.status(400).json({
        success: false,
        message: "Too many wrong attempts. Please request a new OTP.",
      });
    }

    // Verify OTP
    if (user.otp.code !== otp) {
      await user.save();
      const remaining = 5 - user.otp.attempts;
      return res.status(400).json({
        success: false,
        message: `Invalid OTP. ${remaining} attempts remaining.`,
      });
    }

    // OTP verified ✓
    user.isPhoneVerified = true;
    user.otp = null;
    user.lastLogin = new Date();
    await user.save();

    // Generate JWT token
    const token = jwt.sign(
      {
        userId: user._id.toString(),
        phone: user.phone,
      },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRE }
    );

    res.json({
      success: true,
      message: "OTP verified successfully",
      token,
      userId: user._id.toString(),
      phone: user.phone,
      name: user.name,
      requiresName: !user.name, // True if name is not set
    });
  } catch (err) {
    console.error("Verify OTP error:", err);
    res.status(500).json({
      success: false,
      message: "Failed to verify OTP",
    });
  }
};

/* ════════════════════════════════════════════════════
   GET USER PROFILE
════════════════════════════════════════════════════ */
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
  } catch (err) {
    console.error("Get profile error:", err);
    res.status(500).json({
      success: false,
      message: "Failed to fetch profile",
    });
  }
};

/* ════════════════════════════════════════════════════
   UPDATE USER NAME
════════════════════════════════════════════════════ */
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
  } catch (err) {
    console.error("Update name error:", err);
    res.status(500).json({
      success: false,
      message: "Failed to update name",
    });
  }
};

/* ════════════════════════════════════════════════════
   LOGOUT
════════════════════════════════════════════════════ */
exports.logout = async (req, res) => {
  try {
    // Logout is handled on frontend by clearing token
    res.json({
      success: true,
      message: "Logged out successfully",
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: "Logout failed",
    });
  }
};

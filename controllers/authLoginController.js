const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const LoginUser = require("../models/LoginUser");
const sms = require("../utils/sms");

const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key";
const JWT_EXPIRE = process.env.JWT_EXPIRE || "7d";

const OTP_EXPIRY_MINUTES = Number(process.env.OTP_EXPIRY_MINUTES || 10);
const MAX_OTP_ATTEMPTS = Number(process.env.MAX_OTP_ATTEMPTS || 5);

/* ════════════════════════════════════════════════════
   HELPERS
════════════════════════════════════════════════════ */

const cleanIndianPhone = (phone) => {
  const cleaned = String(phone || "").replace(/\D/g, "");

  // If user sends 91XXXXXXXXXX, remove 91
  if (cleaned.length === 12 && cleaned.startsWith("91")) {
    return cleaned.slice(2);
  }

  // If user sends 0XXXXXXXXXX, remove 0
  if (cleaned.length === 11 && cleaned.startsWith("0")) {
    return cleaned.slice(1);
  }

  return cleaned;
};

const generateOtp = () => {
  return Math.floor(1000 + Math.random() * 9000).toString();
};

const createOtpObject = (otp) => {
  return {
    code: otp,
    createdAt: new Date(),
    expiresAt: new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000),
    attempts: 0,
    verified: false,
  };
};

const createToken = (user) => {
  return jwt.sign(
    {
      userId: user._id.toString(),
      phone: user.phone,
    },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRE }
  );
};

/* ════════════════════════════════════════════════════
   SEND OTP
════════════════════════════════════════════════════ */

exports.sendOTP = async (req, res) => {
  try {
    console.log("\n════════════════════════════════════════");
    console.log("[SEND-OTP] API HIT");
    console.log("[SEND-OTP] Body:", JSON.stringify(req.body, null, 2));
    console.log("════════════════════════════════════════");

    const rawPhone = req.body.phone;
    const phone = cleanIndianPhone(rawPhone);

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
        receivedPhone: rawPhone,
        cleanedPhone: phone,
      });
    }

    const otp = generateOtp();
    const otpData = createOtpObject(otp);

    console.log("[SEND-OTP] Clean Phone:", phone);
    console.log("[SEND-OTP] OTP Generated:", otp);
    console.log("[SEND-OTP] OTP Expiry Minutes:", OTP_EXPIRY_MINUTES);

    let user = await LoginUser.findOne({ phone });

    if (!user) {
      console.log("[SEND-OTP] New user creating:", phone);

      user = new LoginUser({
        phone,
        name: null,
        otp: otpData,
        lastOtpRequestAt: new Date(),
        isPhoneVerified: false,
        status: "active",
      });
    } else {
      console.log("[SEND-OTP] Existing user found:", phone);

      if (user.status === "blocked") {
        return res.status(403).json({
          success: false,
          message: "Your account is blocked. Please contact support.",
        });
      }

      if (user.status === "inactive") {
        return res.status(403).json({
          success: false,
          message: "Your account is inactive. Please contact support.",
        });
      }

      user.otp = otpData;
      user.lastOtpRequestAt = new Date();
    }

    await user.save();

    console.log("[SEND-OTP] OTP saved in database");
    console.log("[SEND-OTP] Calling MSG91...");
    console.log("[SEND-OTP] MSG91 Phone:", phone);
    console.log("[SEND-OTP] MSG91 OTP:", otp);
    console.log("[SEND-OTP] MSG91 Name:", user.name || "User");

    try {
      const smsResult = await sms.sendOTP(phone, otp, user.name || "User");

      console.log("[SEND-OTP] MSG91 call succeeded");
      console.log(
        "[SEND-OTP] MSG91 Result:",
        JSON.stringify(smsResult, null, 2)
      );

      return res.status(200).json({
        success: true,
        message: "OTP sent successfully",
        phone,
        expiresInMinutes: OTP_EXPIRY_MINUTES,
      });
    } catch (smsErr) {
      console.error("[SEND-OTP] MSG91 call FAILED");
      console.error("[SEND-OTP] Error Message:", smsErr.message);

      // Remove OTP if SMS failed, so user cannot verify an OTP they never received
      user.otp = null;
      await user.save();

      return res.status(500).json({
        success: false,
        message: "Failed to send OTP via SMS. Please try again.",
        error: smsErr.message,
      });
    }
  } catch (err) {
    console.error("[SEND-OTP] Controller error:", err);

    return res.status(500).json({
      success: false,
      message: "Failed to send OTP",
      error: err.message,
    });
  }
};

/* ════════════════════════════════════════════════════
   VERIFY OTP
════════════════════════════════════════════════════ */

exports.verifyOTP = async (req, res) => {
  try {
    console.log("\n════════════════════════════════════════");
    console.log("[VERIFY-OTP] API HIT");
    console.log("[VERIFY-OTP] Body:", JSON.stringify(req.body, null, 2));
    console.log("════════════════════════════════════════");

    const phone = cleanIndianPhone(req.body.phone);
    const otp = String(req.body.otp || "").trim();

    if (!phone || !otp) {
      return res.status(400).json({
        success: false,
        message: "Phone and OTP are required",
      });
    }

    if (!/^\d{10}$/.test(phone)) {
      return res.status(400).json({
        success: false,
        message: "Invalid phone number. Must be 10 digits.",
      });
    }

    if (!/^\d{4,6}$/.test(otp)) {
      return res.status(400).json({
        success: false,
        message: "Invalid OTP format.",
      });
    }

    const user = await LoginUser.findOne({ phone });

    if (!user || !user.otp) {
      return res.status(400).json({
        success: false,
        message: "OTP expired or not sent. Please request a new OTP.",
      });
    }

    if (user.status === "blocked") {
      return res.status(403).json({
        success: false,
        message: "Your account is blocked. Please contact support.",
      });
    }

    if (user.status === "inactive") {
      return res.status(403).json({
        success: false,
        message: "Your account is inactive. Please contact support.",
      });
    }

    if (new Date() > new Date(user.otp.expiresAt)) {
      user.otp = null;
      await user.save();

      return res.status(400).json({
        success: false,
        message: "OTP expired. Please request a new one.",
      });
    }

    user.otp.attempts = (user.otp.attempts || 0) + 1;

    if (user.otp.attempts > MAX_OTP_ATTEMPTS) {
      user.otp = null;
      await user.save();

      return res.status(400).json({
        success: false,
        message: "Too many wrong attempts. Please request a new OTP.",
      });
    }

    if (String(user.otp.code) !== otp) {
      await user.save();

      const remaining = Math.max(MAX_OTP_ATTEMPTS - user.otp.attempts, 0);

      return res.status(400).json({
        success: false,
        message: `Invalid OTP. ${remaining} attempts remaining.`,
      });
    }

    user.isPhoneVerified = true;
    user.otp = null;
    user.lastLogin = new Date();
    await user.save();

    const token = createToken(user);

    console.log("[VERIFY-OTP] OTP verified successfully:", phone);

    return res.status(200).json({
      success: true,
      message: "OTP verified successfully",
      token,
      userId: user._id.toString(),
      phone: user.phone,
      name: user.name,
      requiresName: !user.name,
    });
  } catch (err) {
    console.error("[VERIFY-OTP] Error:", err);

    return res.status(500).json({
      success: false,
      message: "Failed to verify OTP",
      error: err.message,
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

    const user = await LoginUser.findById(userId).select("-otp");

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    return res.status(200).json({
      success: true,
      data: user,
    });
  } catch (err) {
    console.error("[GET-PROFILE] Error:", err);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch profile",
      error: err.message,
    });
  }
};

/* ════════════════════════════════════════════════════
   UPDATE USER NAME
════════════════════════════════════════════════════ */

exports.updateUserName = async (req, res) => {
  try {
    const userId = req.user?.userId;
    const { name, secondaryPhone } = req.body;

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

    if (secondaryPhone && !/^[0-9]{10}$/.test(secondaryPhone)) {
      return res.status(400).json({ success: false, message: "Secondary phone must be 10 digits" });
    }

    const updateData = { name: name.trim(), updatedAt: new Date() };
    if (secondaryPhone !== undefined) updateData.secondaryPhone = secondaryPhone || null;

    const user = await LoginUser.findByIdAndUpdate(
      userId,
      updateData,
      { new: true }
    ).select("-otp");

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Name updated successfully",
      data: user,
    });
  } catch (err) {
    console.error("[UPDATE-NAME] Error:", err);

    return res.status(500).json({
      success: false,
      message: "Failed to update name",
      error: err.message,
    });
  }
};

/* ════════════════════════════════════════════════════
   LOGOUT
════════════════════════════════════════════════════ */

exports.logout = async (req, res) => {
  try {
    return res.status(200).json({
      success: true,
      message: "Logged out successfully",
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: "Logout failed",
      error: err.message,
    });
  }
};

/* ════════════════════════════════════════════════════
   ADMIN: GET ALL LOGIN USERS
════════════════════════════════════════════════════ */

exports.getAllLoginUsers = async (req, res) => {
  try {
    const users = await LoginUser.find().select("-otp").sort({ lastLogin: -1 });

    const loginUsers = users.map((user) => ({
      _id: user._id,
      phone: user.phone,
      name: user.name,
      isPhoneVerified: user.isPhoneVerified,
      status: user.status,
      statusRemark: user.statusRemark,
      lastLogin: user.lastLogin,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      daysAgo: user.lastLogin
        ? Math.floor(
          (new Date() - new Date(user.lastLogin)) /
          (1000 * 60 * 60 * 24)
        )
        : null,
    }));

    return res.status(200).json({
      success: true,
      data: loginUsers,
    });
  } catch (err) {
    console.error("[GET-ALL-LOGIN-USERS] Error:", err);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch login users",
      error: err.message,
    });
  }
};

/* ════════════════════════════════════════════════════
   ADMIN: CREATE LOGIN USER
════════════════════════════════════════════════════ */

exports.adminCreateUser = async (req, res) => {
  try {
    const phone = cleanIndianPhone(req.body.phone);
    const { name } = req.body;

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

    const existingUser = await LoginUser.findOne({ phone });

    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: "User already exists with this phone",
        data: existingUser,
      });
    }

    const user = await LoginUser.create({
      phone,
      name: name || null,
      isPhoneVerified: false,
      status: "active",
    });

    return res.status(201).json({
      success: true,
      message: "User created successfully",
      data: user,
    });
  } catch (err) {
    console.error("[ADMIN-CREATE-USER] Error:", err);

    return res.status(500).json({
      success: false,
      message: "Failed to create user",
      error: err.message,
    });
  }
};

/* ════════════════════════════════════════════════════
   ADMIN: UPDATE USER STATUS
════════════════════════════════════════════════════ */

exports.updateUserStatus = async (req, res) => {
  try {
    const { userId } = req.params;
    const { status, remark } = req.body;

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: "User ID is required",
      });
    }

    const validStatuses = ["active", "inactive", "blocked"];

    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Invalid status. Must be: active, inactive, or blocked",
      });
    }

    const user = await LoginUser.findByIdAndUpdate(
      userId,
      {
        status,
        statusRemark: remark || "",
        statusChangedAt: new Date(),
      },
      { new: true }
    ).select("-otp");

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    console.log(`[STATUS] User ${user.phone} status changed to ${status}`);

    return res.status(200).json({
      success: true,
      message: `User status updated to ${status}`,
      data: user,
    });
  } catch (err) {
    console.error("[UPDATE-USER-STATUS] Error:", err);

    return res.status(500).json({
      success: false,
      message: "Failed to update user status",
      error: err.message,
    });
  }
};

/* ════════════════════════════════════════════════════
   ADMIN: DELETE USER
════════════════════════════════════════════════════ */

exports.deleteUser = async (req, res) => {
  try {
    const { userId } = req.params;

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: "User ID is required",
      });
    }

    const user = await LoginUser.findByIdAndDelete(userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    console.log(`[DELETE] User ${user.phone} deleted by admin`);

    return res.status(200).json({
      success: true,
      message: "User deleted successfully",
      data: {
        phone: user.phone,
        name: user.name,
        deletedAt: new Date(),
      },
    });
  } catch (err) {
    console.error("[DELETE-USER] Error:", err);

    return res.status(500).json({
      success: false,
      message: "Failed to delete user",
      error: err.message,
    });
  }
};

/* ════════════════════════════════════════════════════
   EMAIL REGISTER
════════════════════════════════════════════════════ */
exports.emailRegister = async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ success: false, message: "Name, email and password are required" });
    }
    if (password.length < 6) {
      return res.status(400).json({ success: false, message: "Password must be at least 6 characters" });
    }
    const cleanEmail = email.trim().toLowerCase();
    const existing = await LoginUser.findOne({ email: cleanEmail });
    if (existing) {
      return res.status(400).json({ success: false, message: "Email already registered. Please login." });
    }
    const hashedPassword = await bcrypt.hash(password, 10);
    const user = new LoginUser({
      name: name.trim(),
      email: cleanEmail,
      password: hashedPassword,
      isPhoneVerified: false,
      status: "active",
    });
    await user.save();
    const token = jwt.sign({ userId: user._id.toString(), email: user.email }, JWT_SECRET, { expiresIn: JWT_EXPIRE });
    return res.json({
      success: true,
      token,
      userId: user._id.toString(),
      name: user.name,
      email: user.email,
      requiresName: false,
    });
  } catch (err) {
    console.error("[EMAIL-REGISTER] Error:", err);
    return res.status(500).json({ success: false, message: "Registration failed", error: err.message });
  }
};

/* ════════════════════════════════════════════════════
   EMAIL LOGIN
════════════════════════════════════════════════════ */
exports.emailLogin = async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ success: false, message: "Email and password are required" });
    }
    const cleanEmail = email.trim().toLowerCase();
    const user = await LoginUser.findOne({ email: cleanEmail });
    if (!user) {
      return res.status(400).json({ success: false, message: "Email not registered. Please create an account." });
    }
    if (!user.password) {
      return res.status(400).json({ success: false, message: "This account uses phone OTP login." });
    }
    if (user.status === "blocked") {
      return res.status(403).json({ success: false, message: "Account is blocked. Contact support." });
    }
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ success: false, message: "Incorrect password." });
    }
    user.lastLogin = new Date();
    await user.save();
    const token = jwt.sign({ userId: user._id.toString(), email: user.email }, JWT_SECRET, { expiresIn: JWT_EXPIRE });
    return res.json({
      success: true,
      token,
      userId: user._id.toString(),
      name: user.name,
      email: user.email,
      requiresName: !user.name,
    });
  } catch (err) {
    console.error("[EMAIL-LOGIN] Error:", err);
    return res.status(500).json({ success: false, message: "Login failed", error: err.message });
  }
};
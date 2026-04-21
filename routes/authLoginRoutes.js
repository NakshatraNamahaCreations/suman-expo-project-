const express = require("express");
const router = express.Router();
const {
  sendOTP,
  verifyOTP,
  getUserProfile,
  updateUserName,
  logout,
} = require("../controllers/authLoginController");
const { authMiddleware } = require("../middleware/auth");

/* ════════════════════════════════════════════════════
   PUBLIC ROUTES (No Auth Required)
════════════════════════════════════════════════════ */

/**
 * POST /api/auth-login/send-otp
 * Send OTP to phone number
 *
 * Request: { phone: "9876543210" }
 * Response: { success: true, phone: "9876543210", otp: "1234" (dev only) }
 */
router.post("/send-otp", sendOTP);

/**
 * POST /api/auth-login/verify-otp
 * Verify OTP and get JWT token
 *
 * Request: { phone: "9876543210", otp: "1234" }
 * Response: {
 *   success: true,
 *   token: "jwt...",
 *   userId: "...",
 *   phone: "9876543210",
 *   name: "John" or null,
 *   requiresName: true/false
 * }
 */
router.post("/verify-otp", verifyOTP);

/* ════════════════════════════════════════════════════
   PROTECTED ROUTES (Auth Required)
════════════════════════════════════════════════════ */

/**
 * GET /api/auth-login/profile
 * Get current user's profile
 *
 * Headers: { Authorization: "Bearer <token>" }
 * Response: { success: true, data: { _id, phone, name, email, ... } }
 */
router.get("/profile", authMiddleware, getUserProfile);

/**
 * PUT /api/auth-login/update-name
 * Update user's name
 *
 * Headers: { Authorization: "Bearer <token>" }
 * Request: { name: "John Doe" }
 * Response: { success: true, message: "...", data: { updated user } }
 */
router.put("/update-name", authMiddleware, updateUserName);

/**
 * POST /api/auth-login/logout
 * Logout current session
 *
 * Response: { success: true, message: "Logged out successfully" }
 */
router.post("/logout", authMiddleware, logout);

module.exports = router;

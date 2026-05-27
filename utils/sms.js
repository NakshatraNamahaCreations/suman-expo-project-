const axios = require("axios");

/**
 * Send OTP via MSG91
 * @param {string} phone  - 10-digit number (no country code)
 * @param {string} otp    - 4-digit OTP
 * @param {string} name   - User's name for template variable ##name##
 */
const sendOTP = async (phone, otp, name = "User") => {
  const url = `${process.env.MSG91_BASE_URL}/otp`;
  const params = {
    authkey:     process.env.MSG91_AUTH_KEY,
    template_id: process.env.MSG91_TEMPLATE_ID,
    mobile:      `91${phone}`,
    otp,
    otp_expiry:  process.env.OTP_EXPIRY_MINUTES || 10,
    sender:      process.env.MSG91_SENDER_ID,
    name,
  };

  console.log(`[MSG91] Sending OTP to 91${phone}`);

  const response = await axios.get(url, { params });

  console.log(`[MSG91] Response:`, JSON.stringify(response.data));

  if (response.data?.type !== "success") {
    throw new Error(response.data?.message || "MSG91 rejected the request");
  }

  return response.data;
};

module.exports = { sendOTP };

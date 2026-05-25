const axios = require('axios');

/**
 * Send OTP via MSG91 SMS service
 * @param {string} phone - 10-digit phone number without country code
 * @param {string} otp - OTP code to send
 * @param {string} name - User's name for template variable
 * @returns {Promise<object>} MSG91 API response
 */
const sendOTP = async (phone, otp, name = 'User') => {
  const params = {
    template_id: process.env.MSG91_TEMPLATE_ID,
    mobile: `91${phone}`,
    authkey: process.env.MSG91_AUTH_KEY,
    otp,
    otp_expiry: process.env.OTP_EXPIRY_MINUTES || 10,
    sender: process.env.MSG91_SENDER_ID,
    name,
  };

  try {
    console.log(`[MSG91 Send OTP] Request URL: ${process.env.MSG91_BASE_URL}/otp`);
    console.log(`[MSG91 Send OTP] Phone: ${phone}, Name: ${name}`);

    const response = await axios.get(`${process.env.MSG91_BASE_URL}/otp`, { params });

    console.log(`[MSG91 Send OTP] Success Response:`, JSON.stringify(response.data, null, 2));
    return response.data;
  } catch (error) {
    console.error(`[MSG91 Send OTP Error] Phone: ${phone}`);
    console.error(`[MSG91 Send OTP Error] Status:`, error.response?.status);
    console.error(`[MSG91 Send OTP Error] Response:`, JSON.stringify(error.response?.data, null, 2));
    throw error;
  }
};

/**
 * Verify OTP via MSG91 SMS service
 * @param {string} phone - 10-digit phone number without country code
 * @param {string} otp - OTP code to verify
 * @returns {Promise<object>} MSG91 API response
 */
const verifyOTP = async (phone, otp) => {
  const params = {
    authkey: process.env.MSG91_AUTH_KEY,
    mobile: `91${phone}`,
    otp,
  };

  try {
    console.log(`[MSG91 Verify OTP] Request URL: ${process.env.MSG91_BASE_URL}/otp/verify`);
    console.log(`[MSG91 Verify OTP] Phone: ${phone}`);

    const response = await axios.get(`${process.env.MSG91_BASE_URL}/otp/verify`, { params });

    console.log(`[MSG91 Verify OTP] Success Response:`, JSON.stringify(response.data, null, 2));
    return response.data;
  } catch (error) {
    console.error(`[MSG91 Verify OTP Error] Phone: ${phone}`);
    console.error(`[MSG91 Verify OTP Error] Status:`, error.response?.status);
    console.error(`[MSG91 Verify OTP Error] Response:`, JSON.stringify(error.response?.data, null, 2));
    throw error;
  }
};

module.exports = { sendOTP, verifyOTP };

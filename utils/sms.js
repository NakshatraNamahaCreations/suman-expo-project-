const axios = require('axios');

/**
 * Send OTP via MSG91 SMS service
 * @param {string} phone - 10-digit phone number without country code
 * @param {string} otp - OTP code to send
 * @param {string} name - User's name for template variable
 * @returns {Promise<object>} MSG91 API response
 */
const sendOTP = async (phone, otp, name = 'User') => {
  try {
    const response = await axios.get(`${process.env.MSG91_BASE_URL}/otp`, {
      params: {
        template_id: process.env.MSG91_TEMPLATE_ID,
        mobile: `91${phone}`,
        authkey: process.env.MSG91_AUTH_KEY,
        otp,
        otp_expiry: process.env.OTP_EXPIRY_MINUTES || 10,
        sender: process.env.MSG91_SENDER_ID,
        name,
      },
    });

    console.log(`[MSG91 Send OTP] Phone: ${phone}, Status:`, response.data?.type || 'success');
    return response.data;
  } catch (error) {
    console.error(`[MSG91 Send OTP Error] Phone: ${phone}`, error.response?.data || error.message);
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
  try {
    const response = await axios.get(`${process.env.MSG91_BASE_URL}/otp/verify`, {
      params: {
        authkey: process.env.MSG91_AUTH_KEY,
        mobile: `91${phone}`,
        otp,
      },
    });

    console.log(`[MSG91 Verify OTP] Phone: ${phone}, Status:`, response.data?.type || 'unknown');
    return response.data;
  } catch (error) {
    console.error(`[MSG91 Verify OTP Error] Phone: ${phone}`, error.response?.data || error.message);
    throw error;
  }
};

module.exports = { sendOTP, verifyOTP };

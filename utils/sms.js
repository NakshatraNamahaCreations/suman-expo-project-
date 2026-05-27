const axios = require("axios");

/**
 * Send OTP via MSG91 SendOTP API
 * phone must be 10 digit Indian mobile number without country code
 */
const sendOTP = async (phone, otp, name = "User") => {
  const BASE_URL = process.env.MSG91_BASE_URL || "https://control.msg91.com/api/v5";
  const AUTH_KEY = process.env.MSG91_AUTH_KEY;
  const TEMPLATE_ID = process.env.MSG91_TEMPLATE_ID;
  const OTP_EXPIRY = process.env.OTP_EXPIRY_MINUTES || "10";

  console.log("════════════════════════════════════════");
  console.log("[MSG91] ENV CHECK");
  console.log("MSG91_BASE_URL:", BASE_URL || "MISSING");
  console.log("MSG91_AUTH_KEY:", AUTH_KEY ? "LOADED" : "MISSING");
  console.log("MSG91_TEMPLATE_ID:", TEMPLATE_ID ? "LOADED" : "MISSING");
  console.log("OTP_EXPIRY:", OTP_EXPIRY);
  console.log("════════════════════════════════════════");

  if (!AUTH_KEY || !TEMPLATE_ID) {
    throw new Error("MSG91_AUTH_KEY or MSG91_TEMPLATE_ID missing in .env");
  }

  const cleanPhone = String(phone || "").replace(/\D/g, "");

  if (!/^\d{10}$/.test(cleanPhone)) {
    throw new Error("Invalid phone number. Phone must be 10 digits.");
  }

  const cleanOtp = String(otp || "").replace(/\D/g, "");

  if (!/^\d{4,6}$/.test(cleanOtp)) {
    throw new Error("Invalid OTP. OTP must be 4 to 6 digits.");
  }

  const mobile = `91${cleanPhone}`;
  const url = `${BASE_URL}/otp`;

  const params = {
    template_id: TEMPLATE_ID,
    mobile,
    authkey: AUTH_KEY,
    otp: cleanOtp,
    otp_expiry: OTP_EXPIRY,

    // Template variable for ##name##
    name: name || "User",
  };

  console.log("[MSG91 OTP REQUEST]");
  console.log("URL:", url);
  console.log("Mobile:", mobile);
  console.log("OTP:", cleanOtp);
  console.log("Params:", {
    ...params,
    authkey: "HIDDEN",
  });

  try {
    const response = await axios.post(url, null, {
      params,
      timeout: 15000,
      headers: {
        accept: "application/json",
      },
    });

    console.log("[MSG91 OTP RESPONSE]");
    console.log("HTTP Status:", response.status);
    console.log("Body:", JSON.stringify(response.data, null, 2));

    const type = response.data?.type;
    const message = response.data?.message;

    if (type !== "success") {
      throw new Error(message || JSON.stringify(response.data));
    }

    return {
      success: true,
      mobile,
      data: response.data,
    };
  } catch (error) {
    console.error("[MSG91 OTP ERROR]");
    console.error("Message:", error.message);
    console.error("HTTP Status:", error.response?.status);
    console.error("Response:", JSON.stringify(error.response?.data, null, 2));

    throw new Error(
      error.response?.data?.message ||
      error.response?.data?.type ||
      error.message ||
      "MSG91 OTP send failed"
    );
  }
};

module.exports = { sendOTP };
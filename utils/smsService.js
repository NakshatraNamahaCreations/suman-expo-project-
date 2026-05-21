const axios = require("axios");

/**
 * Generate OTP message from template
 * Template: "Dear ##name##, your OTP for RG MEDLINK login is ##OTP##. Valid for 10 minutes. Do not share this OTP with anyone. RG Pharma"
 */
function generateOTPMessage(otp, name = "User") {
  const template = "Dear ##name##, your OTP for RG MEDLINK login is ##OTP##. Valid for 10 minutes. Do not share this OTP with anyone. RG Pharma";
  return template
    .replace("##name##", name || "User")
    .replace("##OTP##", otp);
}

/**
 * Send OTP via SMS
 * Supports: MSG91, Twilio, or Console logging for development
 *
 * @param {string} phone - 10-digit phone number
 * @param {string} otp - 4-digit OTP code
 * @param {string} name - User's name (optional, defaults to "User")
 */
exports.sendOTPSMS = async (phone, otp, name = "User") => {
  try {
    const IS_DEV = process.env.NODE_ENV !== "production";
    const SMS_PROVIDER = process.env.SMS_PROVIDER || "console"; // "msg91", "twilio", or "console"

    // Development mode: log to console
    if (IS_DEV || SMS_PROVIDER === "console") {
      const message = generateOTPMessage(otp, name);
      console.log(`\n📱 [OTP] Phone: ${phone}`);
      console.log(`📱 [OTP] Name: ${name}`);
      console.log(`📱 [OTP] Code: ${otp}`);
      console.log(`📝 [SMS] ${message}\n`);
      return { success: true, message: "OTP logged (dev mode)" };
    }

    // MSG91 SMS Integration
    if (SMS_PROVIDER === "msg91") {
      return await sendViaMSG91(phone, otp, name);
    }

    // Twilio SMS Integration
    if (SMS_PROVIDER === "twilio") {
      return await sendViaTwilio(phone, otp, name);
    }

    console.log(`❌ Unknown SMS provider: ${SMS_PROVIDER}`);
    return { success: false, message: "SMS provider not configured" };
  } catch (err) {
    console.error("❌ SMS Service Error:", err.message);
    return { success: false, message: "Failed to send SMS", error: err.message };
  }
};

/**
 * Send OTP via MSG91
 * Requires: MSG91_API_KEY, MSG91_ROUTE (default: 4 for transactional)
 */
async function sendViaMSG91(phone, otp, name = "User") {
  const apiKey = process.env.MSG91_API_KEY;
  const route = process.env.MSG91_ROUTE || "4";

  if (!apiKey) {
    console.error("❌ MSG91_API_KEY not configured in .env");
    return { success: false, message: "MSG91 API key not configured" };
  }

  try {
    const message = generateOTPMessage(otp, name);
    const url = `https://control.msg91.com/api/sendhttp.php`;

    const response = await axios.get(url, {
      params: {
        authkey: apiKey,
        mobiles: `91${phone}`, // Add country code
        message: message,
        route: route,
        sender: process.env.MSG91_SENDER_ID || "RGMEDL",
      },
    });

    console.log(`✅ SMS sent via MSG91 to ${phone}:`, response.data);
    return { success: true, message: "OTP sent via SMS", provider: "msg91" };
  } catch (err) {
    console.error("❌ MSG91 Error:", err.message);
    return { success: false, message: "Failed to send SMS via MSG91", error: err.message };
  }
}

/**
 * Send OTP via Twilio
 * Requires: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER
 */
async function sendViaTwilio(phone, otp, name = "User") {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const fromNumber = process.env.TWILIO_PHONE_NUMBER;

  if (!accountSid || !authToken || !fromNumber) {
    console.error("❌ Twilio credentials not configured in .env");
    return { success: false, message: "Twilio credentials not configured" };
  }

  try {
    const message = generateOTPMessage(otp, name);
    const toNumber = `+91${phone}`;

    const response = await axios.post(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
      {
        From: fromNumber,
        To: toNumber,
        Body: message,
      },
      {
        auth: {
          username: accountSid,
          password: authToken,
        },
      }
    );

    console.log(`✅ SMS sent via Twilio to ${phone}:`, response.data.sid);
    return { success: true, message: "OTP sent via SMS", provider: "twilio", sid: response.data.sid };
  } catch (err) {
    console.error("❌ Twilio Error:", err.message);
    return { success: false, message: "Failed to send SMS via Twilio", error: err.message };
  }
}

/**
 * Verify if SMS service is properly configured
 */
exports.verifySMSConfig = () => {
  const SMS_PROVIDER = process.env.SMS_PROVIDER || "console";
  const IS_DEV = process.env.NODE_ENV !== "production";

  if (IS_DEV || SMS_PROVIDER === "console") {
    return { configured: true, provider: "console (development mode)", warning: "OTPs will be logged to console" };
  }

  if (SMS_PROVIDER === "msg91") {
    if (!process.env.MSG91_API_KEY) {
      return { configured: false, provider: "MSG91", error: "MSG91_API_KEY not found in .env" };
    }
    return { configured: true, provider: "MSG91" };
  }

  if (SMS_PROVIDER === "twilio") {
    if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN || !process.env.TWILIO_PHONE_NUMBER) {
      return { configured: false, provider: "Twilio", error: "Twilio credentials not found in .env" };
    }
    return { configured: true, provider: "Twilio" };
  }

  return { configured: false, provider: SMS_PROVIDER, error: `Unknown SMS provider: ${SMS_PROVIDER}` };
};

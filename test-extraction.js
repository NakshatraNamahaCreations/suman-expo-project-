// Simple test to debug PDF and image extraction
require("dotenv").config();

const fs = require("fs");
const path = require("path");

// Check environment
console.log("🔍 Testing extraction setup...");
console.log("Node version:", process.version);
console.log("OCR_API_KEY:", process.env.OCR_API_KEY ? "SET" : "NOT SET");
console.log("Current dir:", __dirname);

// Test that modules load
try {
  const pdfParse = require("pdf-parse");
  console.log("✅ pdf-parse loaded");
} catch (e) {
  console.log("❌ pdf-parse failed to load:", e.message);
}

try {
  const XLSX = require("xlsx");
  console.log("✅ xlsx loaded");
} catch (e) {
  console.log("❌ xlsx failed to load:", e.message);
}

try {
  const Tesseract = require("tesseract.js");
  console.log("✅ tesseract.js loaded");
} catch (e) {
  console.log("❌ tesseract.js failed to load:", e.message);
}

// Test fetch availability
console.log("\n🔍 Testing fetch API...");
if (typeof fetch === "undefined") {
  console.log("❌ fetch is not defined");
} else {
  console.log("✅ fetch is available");

  // Test a simple fetch call to verify it works
  (async () => {
    try {
      console.log("\n🔍 Testing OCR.space API connectivity...");
      const testKey = process.env.OCR_API_KEY;
      if (!testKey) {
        console.log("❌ OCR_API_KEY not set, skipping API test");
        return;
      }

      // Test with a simple text-only image encoded as base64
      const testBase64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

      const formBody = new URLSearchParams();
      formBody.append("apikey", testKey);
      formBody.append("base64Image", `data:image/png;base64,${testBase64}`);
      formBody.append("language", "eng");
      formBody.append("OCREngine", "1");

      console.log("📤 Sending test request to OCR.space...");
      const response = await fetch("https://api.ocr.space/parse/image", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: formBody.toString(),
      });

      console.log(`📬 Response status: ${response.status} ${response.statusText}`);

      if (!response.ok) {
        const text = await response.text();
        console.log("❌ HTTP error:", text.substring(0, 200));
        return;
      }

      const result = await response.json();
      console.log("✅ API responded with JSON");
      console.log("Response keys:", Object.keys(result));

      if (result.IsErroredOnProcessing) {
        console.log("❌ OCR API error:", result.ErrorMessage);
      } else {
        console.log("✅ OCR API call successful");
      }

    } catch (err) {
      console.log("❌ Fetch test failed:", err.message);
    }
  })();
}

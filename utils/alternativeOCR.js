const axios = require("axios");
const fs = require("fs");
const path = require("path");

/**
 * Extract text from image using free-online-ocr.com API
 * Alternative when other OCR services fail
 */
const extractTextWithAlternativeOCR = async (filePath) => {
  try {
    console.log("\n" + "=".repeat(80));
    console.log("ATTEMPTING ALTERNATIVE OCR (free-online-ocr.com)");
    console.log("=".repeat(80));

    if (!fs.existsSync(filePath)) {
      throw new Error("File not found: " + filePath);
    }

    const fileStats = fs.statSync(filePath);
    const fileSizeBytes = fileStats.size;
    const fileSizeMB = (fileSizeBytes / (1024 * 1024)).toFixed(2);

    console.log("File path: " + filePath);
    console.log("File size: " + fileSizeBytes + " bytes (" + fileSizeMB + " MB)");

    // Read file as base64
    const fileBuffer = fs.readFileSync(filePath);
    const base64File = fileBuffer.toString("base64");

    console.log("Sending to alternative OCR service (free-online-ocr.com)...");

    // Using FormData for multipart upload
    const FormData = require("form-data");
    const form = new FormData();
    form.append("file", Buffer.from(fileBuffer), path.basename(filePath));
    form.append("language", "eng");

    const response = await axios.post(
      "https://api.free-online-ocr.com/parse/image",
      form,
      {
        headers: form.getHeaders(),
        timeout: 60000,
      }
    );

    console.log("Alternative OCR Response Status: " + response.status);

    let extractedText = "";

    // Handle different response formats
    if (response.data.ParsedText) {
      extractedText = response.data.ParsedText;
    } else if (response.data.text) {
      extractedText = response.data.text;
    } else if (typeof response.data === "string") {
      extractedText = response.data;
    } else {
      throw new Error("Unexpected response format from OCR service");
    }

    extractedText = extractedText.trim();

    if (!extractedText || extractedText.length === 0) {
      throw new Error("No text extracted from alternative OCR");
    }

    console.log("✅ ALTERNATIVE OCR SUCCESSFUL!");
    console.log("Extracted text length: " + extractedText.length + " characters\n");

    return extractedText;

  } catch (error) {
    console.error("\n❌ ALTERNATIVE OCR FAILED");
    console.error("Error: " + error.message);
    throw error;
  }
};

module.exports = extractTextWithAlternativeOCR;

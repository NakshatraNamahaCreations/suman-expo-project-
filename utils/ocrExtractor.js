const fs = require("fs");
const path = require("path");
const axios = require("axios");

const extractTextFromImagePDF = async (filePath) => {
  try {
    if (!fs.existsSync(filePath)) {
      throw new Error("File not found: " + filePath);
    }

    const fileStats = fs.statSync(filePath);
    const fileSizeBytes = fileStats.size;
    const fileSizeMB = (fileSizeBytes / (1024 * 1024)).toFixed(2);

    console.log("\n" + "=".repeat(80));
    console.log("ATTEMPTING OCR EXTRACTION");
    console.log("=".repeat(80));
    console.log("File path: " + filePath);
    console.log("File size: " + fileSizeBytes + " bytes (" + fileSizeMB + " MB)");

    // Check file size - OCR.space has limits
    if (fileSizeBytes > 50 * 1024 * 1024) {
      throw new Error("File too large for OCR (" + fileSizeMB + " MB). Maximum is 50 MB.");
    }

    // Read file as base64
    console.log("Reading file into buffer...");
    const fileBuffer = fs.readFileSync(filePath);
    const base64File = fileBuffer.toString("base64");
    console.log("File converted to Base64: " + base64File.length + " characters");

    console.log("Sending to OCR.space API...");
    console.log("API endpoint: https://api.ocr.space/parse/image");

    // Send to OCR.space API with base64 encoded file
    const response = await axios.post(
      "https://api.ocr.space/parse/image",
      {
        apikey: "K87899142372222",
        base64Image: "data:application/pdf;base64," + base64File,
        isOverlayRequired: false,
        language: "eng",
        filetype: "PDF",
      },
      {
        headers: {
          "Content-Type": "application/json",
        },
        timeout: 120000,
      }
    );

    console.log("\n✅ OCR API Response received");
    console.log("Response Status: " + response.status);

    const ocrData = response.data;

    // Log all response fields for debugging
    console.log("Response Fields:");
    console.log("  IsErroredOnProcessing: " + ocrData.IsErroredOnProcessing);
    console.log("  ErrorMessage: " + (ocrData.ErrorMessage || "none"));
    console.log("  ParsedText length: " + (ocrData.ParsedText ? ocrData.ParsedText.length : 0));
    console.log("  DetectedLanguage: " + (ocrData.DetectedLanguage || "none"));

    // Check for errors
    if (ocrData.IsErroredOnProcessing === true) {
      throw new Error("OCR Processing Error: " + (ocrData.ErrorMessage || "Unknown error from OCR.space"));
    }

    // Check if text was extracted
    if (!ocrData.ParsedText || ocrData.ParsedText.trim().length === 0) {
      console.warn("WARNING: OCR returned success but ParsedText is empty");
      throw new Error("OCR returned empty text. The image may not contain readable text.");
    }

    const extractedText = ocrData.ParsedText.trim();
    console.log("\n✅ OCR EXTRACTION SUCCESSFUL!");
    console.log("Extracted text length: " + extractedText.length + " characters");
    console.log("\nExtracted text preview (first 800 chars):");
    console.log("--------------------------------------------");
    console.log(extractedText.substring(0, 800));
    console.log("--------------------------------------------\n");

    return extractedText;

  } catch (error) {
    console.error("\n❌ OCR EXTRACTION FAILED");
    console.error("=".repeat(80));
    console.error("Error Type: " + error.constructor.name);
    console.error("Error Message: " + error.message);

    // Log detailed API error info
    if (error.response) {
      console.error("\nAPI Response Details:");
      console.error("  HTTP Status: " + error.response.status);
      console.error("  Response Data: " + JSON.stringify(error.response.data, null, 2));
    }

    // Log network error
    if (error.code) {
      console.error("Network Error Code: " + error.code);
    }

    console.error("=".repeat(80) + "\n");

    throw error;
  }
};

module.exports = extractTextFromImagePDF;

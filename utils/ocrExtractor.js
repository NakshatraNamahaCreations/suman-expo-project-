const fs = require("fs");
const path = require("path");
const axios = require("axios");

const extractTextFromImagePDF = async (filePath) => {
  try {
    if (!fs.existsSync(filePath)) {
      throw new Error("File not found: " + filePath);
    }

    console.log("\nAttempting OCR extraction...");
    console.log("File path: " + filePath);
    console.log("File exists: " + fs.existsSync(filePath));
    console.log("File size: " + fs.statSync(filePath).size + " bytes");

    // Read file as base64
    const fileBuffer = fs.readFileSync(filePath);
    const base64File = fileBuffer.toString("base64");

    console.log("Using OCR.space API (base64 upload)...");

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
        timeout: 120000, // 120 second timeout for large files
      }
    );

    console.log("OCR API Response Status: " + response.status);
    const ocrData = response.data;

    console.log("OCR Response IsErroredOnProcessing: " + ocrData.IsErroredOnProcessing);
    console.log("OCR Response ErrorMessage: " + (ocrData.ErrorMessage || "none"));

    if (ocrData.IsErroredOnProcessing) {
      throw new Error("OCR API Error: " + (ocrData.ErrorMessage || "Unknown error"));
    }

    if (!ocrData.ParsedText) {
      throw new Error("No text extracted from OCR - ParsedText is empty");
    }

    const extractedText = ocrData.ParsedText.trim();
    console.log("OCR extraction successful!");
    console.log("Extracted text length: " + extractedText.length + " characters");
    console.log("Extracted text preview (first 500 chars):\n" + extractedText.substring(0, 500));

    return extractedText;
  } catch (error) {
    console.error("OCR Extraction Error: " + error.message);
    if (error.response) {
      console.error("API Response Status: " + error.response.status);
      console.error("API Response Data: " + JSON.stringify(error.response.data));
    }
    throw error;
  }
};

module.exports = extractTextFromImagePDF;

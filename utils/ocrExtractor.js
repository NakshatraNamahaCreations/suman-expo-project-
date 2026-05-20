const fs = require("fs");
const path = require("path");
const FormData = require("form-data");
const axios = require("axios");

const extractTextFromImagePDF = async (filePath) => {
  try {
    if (!fs.existsSync(filePath)) {
      throw new Error("File not found");
    }

    console.log("Attempting OCR extraction from image-based PDF...");
    console.log("Using OCR.space API for text extraction");

    // Create form data with file
    const formData = new FormData();
    const fileStream = fs.createReadStream(filePath);
    formData.append("filename", path.basename(filePath));
    formData.append("apikey", "K87899142372222"); // OCR.space free API key
    formData.append("isOverlayRequired", "false");
    formData.append("language", "eng");
    formData.append("file", fileStream);

    // Send to OCR.space API
    const response = await axios.post(
      "https://api.ocr.space/parse/image",
      formData,
      {
        headers: formData.getHeaders(),
        timeout: 60000, // 60 second timeout
      }
    );

    const ocrData = response.data;

    if (!ocrData.IsErroredOnProcessing && ocrData.ParsedText) {
      const extractedText = ocrData.ParsedText.trim();
      console.log("OCR extraction successful: " + extractedText.length + " characters");
      return extractedText;
    } else {
      throw new Error(ocrData.ErrorMessage || "OCR processing failed");
    }
  } catch (error) {
    console.error("OCR Extraction Error: " + error.message);
    throw error;
  }
};

module.exports = extractTextFromImagePDF;

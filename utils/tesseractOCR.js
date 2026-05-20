const Tesseract = require("tesseract.js");
const fs = require("fs");
const path = require("path");

const extractTextWithTesseract = async (filePath) => {
  try {
    console.log("\n" + "=".repeat(80));
    console.log("ATTEMPTING TESSERACT OCR EXTRACTION");
    console.log("=".repeat(80));

    if (!fs.existsSync(filePath)) {
      throw new Error("File not found: " + filePath);
    }

    const fileStats = fs.statSync(filePath);
    const fileSizeBytes = fileStats.size;
    const fileSizeMB = (fileSizeBytes / (1024 * 1024)).toFixed(2);

    console.log("File path: " + filePath);
    console.log("File size: " + fileSizeBytes + " bytes (" + fileSizeMB + " MB)");
    console.log("Using local Tesseract.js for OCR (no external API)...");

    const imageData = fs.readFileSync(filePath);
    const base64Image = imageData.toString("base64");
    const dataUrl = "data:image/png;base64," + base64Image;

    console.log("Starting Tesseract OCR worker...");

    const result = await Tesseract.recognize(dataUrl, "eng", {
      logger: (m) => {
        if (m.status === "recognizing text") {
          console.log("  OCR Progress: " + Math.round(m.progress * 100) + "%");
        }
      },
    });

    const extractedText = result.data.text;

    if (!extractedText || extractedText.trim().length === 0) {
      throw new Error("Tesseract returned empty text");
    }

    console.log("\n✅ TESSERACT OCR SUCCESSFUL!");
    console.log("Extracted text length: " + extractedText.length + " characters");
    console.log("\nExtracted text preview (first 500 chars):");
    console.log("--------------------------------------------");
    console.log(extractedText.substring(0, 500));
    console.log("--------------------------------------------\n");

    return extractedText;

  } catch (error) {
    console.error("\n❌ TESSERACT OCR FAILED");
    console.error("=".repeat(80));
    console.error("Error: " + error.message);
    console.error("=".repeat(80) + "\n");
    throw error;
  }
};

module.exports = extractTextWithTesseract;

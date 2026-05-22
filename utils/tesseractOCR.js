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

    const fileBuffer = fs.readFileSync(filePath);
    const base64Data = fileBuffer.toString("base64");
    const isPDF = filePath.toLowerCase().endsWith(".pdf");
    const ext = path.extname(filePath).toLowerCase();

    if (isPDF) {
      console.log("⚠️ WARNING: Tesseract is not suitable for PDF files");
      console.log("Tesseract.js is designed for image OCR, not PDF parsing");
      console.log("PDF files should be processed by Google Cloud Vision or pdf-parse");
      throw new Error("Tesseract.js cannot process PDF files. Use Google Vision for PDFs.");
    }

    // Determine MIME type for images
    let mimeType = "image/png";
    if (ext === ".jpg" || ext === ".jpeg") {
      mimeType = "image/jpeg";
    } else if (ext === ".png") {
      mimeType = "image/png";
    } else if (ext === ".gif") {
      mimeType = "image/gif";
    } else if (ext === ".webp") {
      mimeType = "image/webp";
    }

    console.log("Detected file type: " + mimeType);
    console.log("Starting Tesseract OCR worker...");

    const dataUrl = "data:" + mimeType + ";base64," + base64Data;

    const result = await Tesseract.recognize(dataUrl, "eng", {
      logger: (m) => {
        if (m.status === "recognizing text") {
          console.log("  OCR Progress: " + Math.round(m.progress * 100) + "%");
        }
      },
    });

    const extractedText = (result.data.text || "").trim();

    if (!extractedText || extractedText.length === 0) {
      throw new Error("Tesseract returned empty text - file may be unreadable or contains no text");
    }

    console.log("\n✅ TESSERACT OCR SUCCESSFUL!");
    console.log("Extracted text length: " + extractedText.length + " characters\n");

    return extractedText;

  } catch (error) {
    console.error("\n❌ TESSERACT OCR FAILED");
    console.error("=".repeat(80));
    console.error("Error: " + error.message);
    console.error("Stack: " + error.stack?.substring(0, 300));
    console.error("=".repeat(80) + "\n");
    throw error;
  }
};

module.exports = extractTextWithTesseract;

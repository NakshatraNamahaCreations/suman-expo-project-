const fs = require("fs");
const path = require("path");
const pdfParse = require("pdf-parse");

// Simple PDF to text using pdf-parse with better error handling
const extractTextFromPdfWithFallback = async (filePath) => {
  try {
    console.log("\n" + "=".repeat(80));
    console.log("PDF-TO-TEXT EXTRACTION (pdf-parse)");
    console.log("=".repeat(80));

    if (!fs.existsSync(filePath)) {
      throw new Error("File not found: " + filePath);
    }

    const dataBuffer = fs.readFileSync(filePath);
    console.log("File size: " + dataBuffer.length + " bytes");

    const pdfData = await pdfParse(dataBuffer);
    const text = (pdfData.text || "").trim();

    console.log("PDF Pages: " + pdfData.numpages);
    console.log("Text extracted: " + text.length + " characters");

    if (!text || text.length === 0) {
      console.log("⚠️ No text found - PDF appears to be scanned/image-based");
      throw new Error("PDF is image-based (scanned). Requires OCR processing.");
    }

    console.log("✅ PDF text extraction successful!\n");
    return {
      success: true,
      text: text,
      pageCount: pdfData.numpages,
      method: "pdf-parse",
    };

  } catch (error) {
    console.log("⚠️ PDF text extraction failed: " + error.message);
    return {
      success: false,
      error: error.message,
      method: "pdf-parse",
    };
  }
};

// Convert PDF pages to images and process with Google Vision
// Note: This is a simplified version - for production, use pdf2pic or similar
const processPdfWithGoogleVision = async (filePath, googleVisionFn) => {
  try {
    console.log("\n" + "=".repeat(80));
    console.log("PROCESSING PDF WITH GOOGLE VISION OCR");
    console.log("=".repeat(80));

    if (!fs.existsSync(filePath)) {
      throw new Error("File not found: " + filePath);
    }

    // First, try to extract text using pdf-parse
    console.log("\n[Step 1] Attempting text-based PDF extraction...");
    const textResult = await extractTextFromPdfWithFallback(filePath);

    if (textResult.success) {
      console.log("✅ Successfully extracted text from PDF using pdf-parse\n");
      return {
        success: true,
        text: textResult.text,
        method: "pdf-parse",
        pageCount: textResult.pageCount,
      };
    }

    // If text extraction failed, try Google Vision OCR
    console.log("\n[Step 2] Text extraction failed, attempting Google Vision OCR...");
    console.log("Note: Ensure your PDF is a valid file and Google Cloud credentials are configured\n");

    // For Google Vision to process PDF, we need to send it properly
    // The file should be processed as binary content
    const extractedText = await googleVisionFn(filePath);

    if (extractedText && extractedText.length > 0) {
      console.log("✅ Successfully extracted text from PDF using Google Vision\n");
      return {
        success: true,
        text: extractedText,
        method: "google-vision",
        pageCount: 1, // We can't determine page count from Vision API
      };
    } else {
      throw new Error("Google Vision returned empty text");
    }

  } catch (error) {
    console.error("\n❌ PDF processing failed: " + error.message);
    throw error;
  }
};

module.exports = {
  extractTextFromPdfWithFallback,
  processPdfWithGoogleVision,
};

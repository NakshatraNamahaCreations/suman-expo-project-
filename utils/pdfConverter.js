const fs = require("fs");
const path = require("path");
const pdfParse = require("pdf-parse");

/**
 * Validate and process PDF files for prescription extraction
 * Handles text-based and scanned PDFs
 */

const extractTextFromPdfDirect = async (filePath) => {
  try {
    if (!fs.existsSync(filePath)) {
      throw new Error("File not found");
    }

    const dataBuffer = fs.readFileSync(filePath);

    // Validate PDF structure
    if (!dataBuffer.toString('utf8', 0, 4).includes('%PDF')) {
      throw new Error("Invalid PDF file format");
    }

    const pdfData = await pdfParse(dataBuffer);
    const text = (pdfData.text || "").trim();

    console.log("PDF Pages: " + pdfData.numpages);
    console.log("Text extracted: " + text.length + " characters");

    if (!text || text.length === 0) {
      return null; // PDF is image-based, needs OCR
    }

    return {
      text: text,
      pageCount: pdfData.numpages,
      method: "direct",
    };
  } catch (error) {
    console.error("Direct text extraction error: " + error.message);
    return null;
  }
};

const getPdfPageCount = async (filePath) => {
  try {
    if (!fs.existsSync(filePath)) {
      throw new Error("File not found");
    }

    const dataBuffer = fs.readFileSync(filePath);
    const pdfData = await pdfParse(dataBuffer);

    return pdfData.numpages;
  } catch (error) {
    console.error("Error getting PDF page count: " + error.message);
    throw error;
  }
};

/**
 * Process PDF with OCR fallback
 * Uses direct extraction first, then Google Vision
 */
const processPdfWithOcr = async (filePath, googleVisionFn) => {
  try {
    console.log("\n" + "=".repeat(80));
    console.log("PROCESSING PDF WITH COMPREHENSIVE OCR");
    console.log("=".repeat(80));

    // Validate file exists and is readable
    if (!fs.existsSync(filePath)) {
      throw new Error("File not found: " + filePath);
    }

    const fileStats = fs.statSync(filePath);
    console.log("File size: " + fileStats.size + " bytes");

    // Validate PDF format
    const fileBuffer = fs.readFileSync(filePath);
    if (!fileBuffer.toString('utf8', 0, 4).includes('%PDF')) {
      throw new Error("Invalid PDF file - not a valid PDF document");
    }

    // Step 1: Try direct text extraction
    console.log("\n[Step 1] Attempting direct PDF text extraction...");
    const directResult = await extractTextFromPdfDirect(filePath);

    if (directResult && directResult.text && directResult.text.length > 0) {
      console.log("✅ Successfully extracted text directly from PDF");
      console.log("Text length: " + directResult.text.length + " characters\n");
      return {
        success: true,
        text: directResult.text,
        method: "direct-text",
        pageCount: directResult.pageCount,
      };
    }

    console.log("⚠️ No text found in PDF - appears to be image-based (scanned)");

    // Step 2: Try Google Vision OCR
    console.log("\n[Step 2] Attempting Google Cloud Vision OCR...");

    try {
      const ocrText = await googleVisionFn(filePath);

      if (ocrText && ocrText.length > 0) {
        console.log("✅ Successfully extracted text using Google Vision OCR");
        console.log("Text length: " + ocrText.length + " characters\n");
        return {
          success: true,
          text: ocrText,
          method: "google-vision-ocr",
          pageCount: await getPdfPageCount(filePath),
        };
      } else {
        throw new Error("Google Vision returned empty text");
      }
    } catch (visionErr) {
      console.error("⚠️ Google Vision OCR failed: " + visionErr.message);

      // Step 3: Provide helpful feedback instead of failing completely
      console.log("\n[Step 3] Manual intervention suggested");
      console.log("Google Vision could not process this PDF.");
      console.log("This can happen when:");
      console.log("  1) PDF is corrupted or encrypted");
      console.log("  2) PDF contains scanned images without clear text");
      console.log("  3) Image quality is too low for OCR");

      throw new Error(
        "PDF OCR failed. " +
        "Please try: (1) Taking a clear PHOTO of the prescription instead, " +
        "(2) Uploading as JPG/PNG image, " +
        "(3) Ensuring the PDF is not encrypted or corrupted."
      );
    }

  } catch (error) {
    console.error("\n❌ PDF PROCESSING FAILED");
    console.error("=".repeat(80));
    console.error("Error: " + error.message);
    console.error("=".repeat(80));
    throw error;
  }
};

/**
 * Validate if PDF is processable before attempting extraction
 */
const validatePdfFile = async (filePath) => {
  try {
    if (!fs.existsSync(filePath)) {
      return {
        valid: false,
        error: "File not found",
      };
    }

    const fileStats = fs.statSync(filePath);

    if (fileStats.size === 0) {
      return {
        valid: false,
        error: "PDF file is empty",
      };
    }

    if (fileStats.size > 50 * 1024 * 1024) {
      return {
        valid: false,
        error: "PDF file is too large (max 50MB)",
      };
    }

    const fileBuffer = fs.readFileSync(filePath);
    const header = fileBuffer.toString('utf8', 0, 4);

    if (!header.includes('%PDF')) {
      return {
        valid: false,
        error: "Not a valid PDF file",
      };
    }

    // Check if PDF is encrypted (has /Encrypt tag)
    const pdfText = fileBuffer.toString('utf8');
    if (pdfText.includes('/Encrypt')) {
      return {
        valid: false,
        error: "PDF is password-protected/encrypted",
      };
    }

    return {
      valid: true,
      size: fileStats.size,
      sizeInMB: (fileStats.size / (1024 * 1024)).toFixed(2),
    };
  } catch (error) {
    return {
      valid: false,
      error: error.message,
    };
  }
};

module.exports = {
  extractTextFromPdfDirect,
  getPdfPageCount,
  processPdfWithOcr,
  validatePdfFile,
};

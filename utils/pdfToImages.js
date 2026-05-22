const fs = require("fs");
const path = require("path");
const pdfParse = require("pdf-parse");

/**
 * Extract PDF pages as image-like data for Google Vision processing
 * Since we can't easily convert PDFs to images without system dependencies,
 * this utility uses a workaround: sends PDF in chunks to Google Vision
 */

const convertPdfForGoogleVision = async (filePath) => {
  try {
    console.log("\n" + "=".repeat(80));
    console.log("PREPARING PDF FOR GOOGLE VISION OCR");
    console.log("=".repeat(80));

    if (!fs.existsSync(filePath)) {
      throw new Error("File not found: " + filePath);
    }

    const dataBuffer = fs.readFileSync(filePath);
    const fileSize = dataBuffer.length;

    console.log("File size: " + fileSize + " bytes");
    console.log("Processing PDF for Google Vision API...");

    // Parse PDF to get page count and content
    try {
      const pdfData = await pdfParse(dataBuffer);
      console.log("PDF Pages: " + pdfData.numpages);
      console.log("PDF metadata: " + JSON.stringify(pdfData.metadata || {}));
    } catch (e) {
      console.log("Could not parse PDF metadata, continuing...");
    }

    // Return the buffer for Google Vision processing
    // We'll send it as a document image
    return {
      success: true,
      buffer: dataBuffer,
      mimeType: "application/pdf",
      size: fileSize,
    };

  } catch (error) {
    console.error("PDF conversion error: " + error.message);
    throw error;
  }
};

/**
 * Alternative: Process PDF using a workaround with Google Vision
 * Since direct PDF processing fails, we'll use a different approach
 */
const processPdfWithVisionWorkaround = async (filePath, visionClient) => {
  try {
    console.log("\n" + "=".repeat(80));
    console.log("PDF VISION PROCESSING (Workaround Method)");
    console.log("=".repeat(80));

    if (!fs.existsSync(filePath)) {
      throw new Error("File not found");
    }

    const fileBuffer = fs.readFileSync(filePath);

    // Try using the gcs URI method if we have cloud storage
    // Otherwise, use the content bytes method with different feature types
    console.log("Attempting Vision API with PDF content...");

    const request = {
      requests: [
        {
          image: {
            content: fileBuffer,
          },
          features: [
            {
              type: "TEXT_DETECTION", // Try TEXT_DETECTION instead of DOCUMENT_TEXT_DETECTION
            },
          ],
          imageContext: {
            languageHints: ["en"],
          },
        },
      ],
    };

    console.log("Sending to Google Cloud Vision API...");
    const results = await visionClient.batchAnnotateImages(request);

    if (results[0].responses && results[0].responses.length > 0) {
      const response = results[0].responses[0];

      if (response.error) {
        throw new Error("Vision API error: " + response.error.message);
      }

      // For TEXT_DETECTION, use textAnnotations instead of fullTextAnnotation
      let extractedText = "";

      if (response.fullTextAnnotation && response.fullTextAnnotation.text) {
        extractedText = response.fullTextAnnotation.text.trim();
      } else if (response.textAnnotations && response.textAnnotations.length > 0) {
        // Combine all text annotations
        extractedText = response.textAnnotations
          .map((annotation) => annotation.description || "")
          .filter((text) => text.length > 0)
          .join("\n")
          .trim();
      }

      if (extractedText && extractedText.length > 0) {
        console.log("✅ Vision API text extraction successful: " + extractedText.length + " characters\n");
        return extractedText;
      } else {
        throw new Error("Vision API returned no text");
      }
    } else {
      throw new Error("Vision API returned no responses");
    }

  } catch (error) {
    console.error("Vision workaround failed: " + error.message);
    throw error;
  }
};

module.exports = {
  convertPdfForGoogleVision,
  processPdfWithVisionWorkaround,
};

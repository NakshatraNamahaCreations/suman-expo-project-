const vision = require("@google-cloud/vision");
const fs = require("fs");

const extractTextWithGoogleVision = async (filePath) => {
  try {
    console.log("\n" + "=".repeat(80));
    console.log("ATTEMPTING GOOGLE CLOUD VISION OCR");
    console.log("=".repeat(80));

    if (!fs.existsSync(filePath)) {
      throw new Error("File not found: " + filePath);
    }

    if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      throw new Error("Google Cloud Vision credentials not configured. Set GOOGLE_APPLICATION_CREDENTIALS environment variable.");
    }

    const fileStats = fs.statSync(filePath);
    const fileSizeBytes = fileStats.size;
    const fileSizeMB = (fileSizeBytes / (1024 * 1024)).toFixed(2);

    console.log("File path: " + filePath);
    console.log("File size: " + fileSizeBytes + " bytes (" + fileSizeMB + " MB)");
    console.log("Using Google Cloud Vision for OCR...");

    const client = new vision.ImageAnnotatorClient();

    const request = {
      image: {
        content: fs.readFileSync(filePath),
      },
    };

    console.log("Sending to Google Cloud Vision API...");
    const results = await client.documentTextDetection(request);
    const fullTextAnnotation = results[0].fullTextAnnotation;

    if (!fullTextAnnotation || !fullTextAnnotation.text) {
      throw new Error("No text detected by Google Vision");
    }

    const extractedText = fullTextAnnotation.text.trim();

    if (!extractedText || extractedText.length === 0) {
      throw new Error("Google Vision returned empty text");
    }

    console.log("✅ GOOGLE VISION OCR SUCCESSFUL!");
    console.log("Extracted text length: " + extractedText.length + " characters\n");

    return extractedText;

  } catch (error) {
    console.error("\n❌ GOOGLE VISION OCR FAILED");
    console.error("=".repeat(80));
    console.error("Error: " + error.message);
    console.error("=".repeat(80) + "\n");
    throw error;
  }
};

module.exports = extractTextWithGoogleVision;

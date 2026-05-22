const vision = require("@google-cloud/vision");
const fs = require("fs");
const path = require("path");

const extractTextWithGoogleVision = async (filePath) => {
  try {
    console.log("\n" + "=".repeat(80));
    console.log("GOOGLE CLOUD VISION OCR");
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
    const ext = path.extname(filePath).toLowerCase();
    const isPDF = ext === ".pdf";

    console.log("File path: " + filePath);
    console.log("File size: " + fileSizeBytes + " bytes (" + fileSizeMB + " MB)");
    console.log("File type: " + (isPDF ? "PDF" : "Image"));
    console.log("Using TEXT_DETECTION for OCR...");

    const client = new vision.ImageAnnotatorClient();
    const fileBuffer = fs.readFileSync(filePath);

    let extractedText = "";

    if (isPDF) {
      // For PDFs, use batchAnnotateImages for better compatibility
      console.log("Processing PDF with batchAnnotateImages...");

      const request = {
        requests: [
          {
            image: {
              content: fileBuffer,
            },
            features: [
              {
                type: "TEXT_DETECTION",
              },
            ],
            imageContext: {
              languageHints: ["en", "hi"],
            },
          },
        ],
      };

      console.log("Sending PDF to Google Cloud Vision API...");

      try {
        const results = await client.batchAnnotateImages(request);

        if (results && results[0] && results[0].responses && results[0].responses.length > 0) {
          const response = results[0].responses[0];

          if (response.error) {
            throw new Error("Vision API error: " + response.error.message);
          }

          // Try fullTextAnnotation first
          if (response.fullTextAnnotation && response.fullTextAnnotation.text) {
            extractedText = response.fullTextAnnotation.text.trim();
            console.log("✅ Text extracted from fullTextAnnotation: " + extractedText.length + " characters");
          }

          // If fullTextAnnotation is empty, try textAnnotations
          if (!extractedText && response.textAnnotations && response.textAnnotations.length > 0) {
            console.log("Attempting textAnnotations fallback...");
            extractedText = response.textAnnotations
              .map((annotation) => annotation.description || "")
              .filter((text) => text.length > 0)
              .join("\n")
              .trim();
            console.log("✅ Text extracted from textAnnotations: " + extractedText.length + " characters");
          }
        }
      } catch (batchErr) {
        console.log("⚠️ batchAnnotateImages failed, trying annotateImage...");

        // Fallback to annotateImage for single image mode
        try {
          const singleRequest = {
            image: {
              content: fileBuffer,
            },
            features: [
              {
                type: "TEXT_DETECTION",
              },
            ],
            imageContext: {
              languageHints: ["en", "hi"],
            },
          };

          const singleResults = await client.annotateImage(singleRequest);

          if (singleResults.fullTextAnnotation && singleResults.fullTextAnnotation.text) {
            extractedText = singleResults.fullTextAnnotation.text.trim();
            console.log("✅ Text extracted via annotateImage: " + extractedText.length + " characters");
          }

          // If fullTextAnnotation is empty, try textAnnotations
          if (!extractedText && singleResults.textAnnotations && singleResults.textAnnotations.length > 0) {
            extractedText = singleResults.textAnnotations
              .map((annotation) => annotation.description || "")
              .filter((text) => text.length > 0)
              .join("\n")
              .trim();
          }
        } catch (singleErr) {
          throw batchErr; // Throw original batch error
        }
      }
    } else {
      // For images, use standard annotateImage
      console.log("Processing image with annotateImage...");

      const request = {
        image: {
          content: fileBuffer,
        },
        features: [
          {
            type: "TEXT_DETECTION",
          },
        ],
        imageContext: {
          languageHints: ["en", "hi"],
        },
      };

      console.log("Sending image to Google Cloud Vision API...");
      const results = await client.annotateImage(request);

      // Try fullTextAnnotation first
      if (results.fullTextAnnotation && results.fullTextAnnotation.text) {
        extractedText = results.fullTextAnnotation.text.trim();
        console.log("✅ Text extracted from fullTextAnnotation: " + extractedText.length + " characters");
      }

      // If fullTextAnnotation is empty, try textAnnotations fallback
      if (!extractedText && results.textAnnotations && results.textAnnotations.length > 0) {
        console.log("Attempting textAnnotations fallback...");
        extractedText = results.textAnnotations
          .map((annotation) => annotation.description || "")
          .filter((text) => text.length > 0)
          .join("\n")
          .trim();
        console.log("✅ Text extracted from textAnnotations: " + extractedText.length + " characters");
      }
    }

    if (!extractedText || extractedText.length === 0) {
      console.log("⚠️ Google Vision returned no text for this file");
      throw new Error("Google Vision could not extract text - file may be blank, unreadable, or in unsupported format");
    }

    console.log("✅ GOOGLE VISION OCR SUCCESSFUL!");
    console.log("Extracted text length: " + extractedText.length + " characters");
    console.log("First 100 chars: " + extractedText.substring(0, 100) + "...\n");

    return extractedText;

  } catch (error) {
    console.error("\n❌ GOOGLE VISION OCR FAILED");
    console.error("=".repeat(80));
    console.error("Error: " + error.message);
    if (error.code) {
      console.error("Error Code: " + error.code);
    }
    console.error("=".repeat(80) + "\n");
    throw error;
  }
};

module.exports = extractTextWithGoogleVision;

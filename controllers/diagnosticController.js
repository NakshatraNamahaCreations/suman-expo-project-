const fs = require("fs");
const extractTextFromPDF = require("../utils/simplePdfReader");
const extractTextWithGoogleVision = require("../utils/googleVisionOCR");
const extractTextWithTesseract = require("../utils/tesseractOCR");
const extractTextFromImagePDF = require("../utils/ocrExtractor");
const extractTextWithAlternativeOCR = require("../utils/alternativeOCR");

exports.testOCRMethods = async (req, res) => {
  let filePath = null;

  try {
    console.log("\n" + "=".repeat(80));
    console.log("OCR DIAGNOSTIC TEST");
    console.log("=".repeat(80));

    if (!req.file) {
      return res.json({
        success: false,
        message: "No file uploaded",
        results: [],
      });
    }

    filePath = req.file.path;
    const fileName = req.file.originalname;

    console.log("Testing file: " + fileName);
    console.log("File path: " + filePath);
    console.log("File size: " + req.file.size + " bytes\n");

    const results = {};

    // Test 1: pdf-parse
    console.log("\n🔍 TEST 1: pdf-parse");
    try {
      const text = await extractTextFromPDF(filePath);
      results.pdfParse = {
        success: true,
        message: "✅ Success",
        textLength: text.length,
        preview: text.substring(0, 100),
      };
      console.log("✅ PASSED - Extracted " + text.length + " characters");
    } catch (err) {
      results.pdfParse = {
        success: false,
        error: err.message,
      };
      console.log("❌ FAILED - " + err.message);
    }

    // Test 2: Google Cloud Vision
    console.log("\n🔍 TEST 2: Google Cloud Vision");
    try {
      const hasCredentials = !!process.env.GOOGLE_APPLICATION_CREDENTIALS;
      console.log("Credentials configured: " + (hasCredentials ? "YES" : "NO"));

      if (!hasCredentials) {
        results.googleVision = {
          success: false,
          error: "GOOGLE_APPLICATION_CREDENTIALS not set",
        };
        console.log("⚠️  SKIPPED - No credentials configured");
      } else {
        const text = await extractTextWithGoogleVision(filePath);
        results.googleVision = {
          success: true,
          message: "✅ Success",
          textLength: text.length,
          preview: text.substring(0, 100),
        };
        console.log("✅ PASSED - Extracted " + text.length + " characters");
      }
    } catch (err) {
      results.googleVision = {
        success: false,
        error: err.message,
      };
      console.log("❌ FAILED - " + err.message);
    }

    // Test 3: Tesseract.js
    console.log("\n🔍 TEST 3: Tesseract.js");
    try {
      const text = await extractTextWithTesseract(filePath);
      results.tesseract = {
        success: true,
        message: "✅ Success",
        textLength: text.length,
        preview: text.substring(0, 100),
      };
      console.log("✅ PASSED - Extracted " + text.length + " characters");
    } catch (err) {
      results.tesseract = {
        success: false,
        error: err.message,
      };
      console.log("❌ FAILED - " + err.message);
    }

    // Test 4: OCR.space API
    console.log("\n🔍 TEST 4: OCR.space API");
    try {
      const text = await extractTextFromImagePDF(filePath);
      results.ocrSpace = {
        success: true,
        message: "✅ Success",
        textLength: text.length,
        preview: text.substring(0, 100),
      };
      console.log("✅ PASSED - Extracted " + text.length + " characters");
    } catch (err) {
      results.ocrSpace = {
        success: false,
        error: err.message,
      };
      console.log("❌ FAILED - " + err.message);
    }

    // Test 5: Alternative OCR
    console.log("\n🔍 TEST 5: Alternative OCR");
    try {
      const text = await extractTextWithAlternativeOCR(filePath);
      results.alternativeOcr = {
        success: true,
        message: "✅ Success",
        textLength: text.length,
        preview: text.substring(0, 100),
      };
      console.log("✅ PASSED - Extracted " + text.length + " characters");
    } catch (err) {
      results.alternativeOcr = {
        success: false,
        error: err.message,
      };
      console.log("❌ FAILED - " + err.message);
    }

    // Cleanup
    if (filePath && fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    console.log("\n" + "=".repeat(80));
    console.log("DIAGNOSTIC SUMMARY");
    console.log("=".repeat(80));

    const summary = {
      success: true,
      message: "Diagnostic test completed",
      testFile: fileName,
      results: results,
      summary: {
        passed: Object.values(results).filter(r => r.success).length,
        failed: Object.values(results).filter(r => !r.success).length,
        credentials: {
          googleVision: !!process.env.GOOGLE_APPLICATION_CREDENTIALS,
        },
      },
      recommendations: getRecommendations(results),
    };

    return res.json(summary);

  } catch (error) {
    console.error("DIAGNOSTIC ERROR: " + error.message);

    if (filePath && fs.existsSync(filePath)) {
      try {
        fs.unlinkSync(filePath);
      } catch (e) {}
    }

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

function getRecommendations(results) {
  const recommendations = [];

  if (results.pdfParse?.success) {
    recommendations.push("✅ Text-based PDF extraction working - Use text-based PDFs");
  } else {
    recommendations.push("❌ Text-based PDF extraction failing - Likely using scanned PDF");
  }

  if (results.googleVision?.error?.includes("not configured")) {
    recommendations.push("⚠️  Google Vision not configured - Set GOOGLE_APPLICATION_CREDENTIALS environment variable");
  } else if (results.googleVision?.success) {
    recommendations.push("✅ Google Vision working - Scanned PDFs should work");
  } else if (results.googleVision?.error) {
    recommendations.push("❌ Google Vision failing - Check credentials or credentials error: " + results.googleVision.error);
  }

  if (results.tesseract?.success) {
    recommendations.push("✅ Tesseract.js working - Local OCR available");
  } else if (results.tesseract?.error) {
    recommendations.push("❌ Tesseract.js failing - " + results.tesseract.error);
  }

  if (!results.pdfParse?.success && !results.googleVision?.success && !results.tesseract?.success) {
    recommendations.push("🔴 CRITICAL: All primary OCR methods failing - Try converting PDF to text-based or use manual selection");
  }

  return recommendations;
}

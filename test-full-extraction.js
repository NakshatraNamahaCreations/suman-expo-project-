// Full extraction test with actual files
require("dotenv").config();

const fs = require("fs");
const path = require("path");
const { extractTextFromImage, parsePrescriptionText } = require("./utils/imageOCR");
const extractTextFromPDF = require("./utils/pdfReader");

console.log("🔍 Full Extraction Test\n");

(async () => {
  // Test 1: Create a simple test image
  console.log("📝 Test 1: Creating a test image with medicine names...");

  // Create a very simple 1x1 pixel image (PNG format with text-like content)
  // For a real test, you'd need an actual prescription image
  const testImagePath = path.join(__dirname, "test-image.png");
  const testPdfPath = path.join(__dirname, "test-pdf.pdf");

  // Check if we have test files
  if (fs.existsSync(testImagePath)) {
    console.log(`\n✅ Found test image at ${testImagePath}`);
    console.log("🔍 Testing image extraction...");
    try {
      const text = await extractTextFromImage(testImagePath);
      console.log(`✅ Extracted ${text.length} characters from image`);
      if (text.length > 0) {
        console.log("Sample text:", text.substring(0, 200));
        const parsed = parsePrescriptionText(text);
        console.log(`✅ Parsed ${parsed.medicines.length} medicines`);
        parsed.medicines.forEach(m => console.log(`  - ${m.name} ${m.dosage || ''} ${m.freqLabel} ${m.duration}d qty:${m.qty}`));
      }
    } catch (err) {
      console.log("❌ Image extraction failed:", err.message);
    }
  } else {
    console.log(`⚠️  No test image found at ${testImagePath}`);
    console.log("📝 To test with an actual image:");
    console.log("   1. Place a prescription image at:", testImagePath);
    console.log("   2. Re-run this test");
  }

  if (fs.existsSync(testPdfPath)) {
    console.log(`\n✅ Found test PDF at ${testPdfPath}`);
    console.log("🔍 Testing PDF extraction...");
    try {
      const text = await extractTextFromPDF(testPdfPath);
      console.log(`✅ Extracted ${text.length} characters from PDF`);
      if (text.length > 0) {
        console.log("Sample text:", text.substring(0, 200));
        const parsed = parsePrescriptionText(text);
        console.log(`✅ Parsed ${parsed.medicines.length} medicines`);
        parsed.medicines.forEach(m => console.log(`  - ${m.name} ${m.dosage || ''} ${m.freqLabel} ${m.duration}d qty:${m.qty}`));
      }
    } catch (err) {
      console.log("❌ PDF extraction failed:", err.message);
    }
  } else {
    console.log(`\n⚠️  No test PDF found at ${testPdfPath}`);
    console.log("📝 To test with an actual PDF:");
    console.log("   1. Place a prescription PDF at:", testPdfPath);
    console.log("   2. Re-run this test");
  }

  // Test 2: Test OCR with a base64 image
  console.log("\n\n📝 Test 2: Testing OCR.space API directly with base64 image...");
  try {
    // This is a 1x1 white PNG image encoded as base64
    // In real tests, you'd use an actual prescription image
    const base64Data = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

    const formBody = new URLSearchParams();
    formBody.append("apikey", process.env.OCR_API_KEY);
    formBody.append("base64Image", `data:image/png;base64,${base64Data}`);
    formBody.append("language", "eng");
    formBody.append("OCREngine", "1");

    const response = await fetch("https://api.ocr.space/parse/image", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: formBody.toString(),
    });

    const result = await response.json();
    console.log(`✅ OCR API responded: exit code ${result.OCRExitCode}, time: ${result.ProcessingTimeInMilliseconds}ms`);
    if (result.ParsedResults && result.ParsedResults[0]) {
      const text = result.ParsedResults[0].ParsedText || "";
      console.log(`✅ Extracted ${text.length} characters`);
      if (text.length > 0) {
        console.log("Extracted text:", text);
      }
    }
  } catch (err) {
    console.log("❌ Direct API test failed:", err.message);
  }

  console.log("\n✅ Test complete!");
})();

const pdfParseLib = require("pdf-parse");
const fs = require("fs");

// 🔥 IMPORT YOUR OCR FUNCTION
const { extractTextFromImage } = require("./imageOCR");

const pdfParse = pdfParseLib.default || pdfParseLib;

const extractTextFromPDF = async (filePath) => {
  console.log("\n" + "═".repeat(80));
  console.log("📄 PDF TEXT EXTRACTION (TEST MODE - SIMPLE)");
  console.log("═".repeat(80));
  console.log(`File Path: ${filePath}`);
  console.log(`File Exists: ${fs.existsSync(filePath)}`);

  try {
    if (!fs.existsSync(filePath)) {
      throw new Error("PDF file does not exist");
    }

    const stats = fs.statSync(filePath);
    console.log(`File Size: ${stats.size} bytes`);

    // Try simple pdf-parse with timeout
    console.log("\n📄 Parsing PDF (with 30s timeout)...");

    let pdfText = "";
    const parsePromise = (async () => {
      try {
        const dataBuffer = fs.readFileSync(filePath);
        console.log(`   Buffer Read: ${dataBuffer.length} bytes`);
        const pdfData = await pdfParse(dataBuffer);
        console.log(`   ✓ Pages: ${pdfData.numpages}`);
        return pdfData.text || "";
      } catch (err) {
        console.log(`   ❌ pdf-parse error: ${err.message}`);
        return "";
      }
    })();

    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error("PDF parsing timeout")), 30000)
    );

    try {
      pdfText = await Promise.race([parsePromise, timeoutPromise]);
    } catch (timeErr) {
      console.log(`   ⚠️  Timeout or error: ${timeErr.message}`);
      pdfText = "";
    }

    if (pdfText && pdfText.trim().length > 20) {
      console.log(`✅ TEXT EXTRACTED: ${pdfText.length} characters`);
      console.log("\n📋 First 500 chars:");
      console.log("-".repeat(80));
      console.log(pdfText.substring(0, 500));
      console.log("-".repeat(80));
      console.log("═".repeat(80));
      return pdfText;
    }

    console.log(`⚠️  PDF parse returned ${pdfText?.length || 0} chars, trying OCR...`);

    // Try OCR as fallback
    console.log("\n🔥 FALLBACK: Attempting OCR...");
    try {
      const ocrText = await extractTextFromImage(filePath);
      if (ocrText && ocrText.trim().length > 0) {
        console.log(`✅ OCR SUCCESS: ${ocrText.length} characters`);
        console.log("═".repeat(80));
        return ocrText;
      }
    } catch (ocrErr) {
      console.log(`❌ OCR failed: ${ocrErr.message}`);
    }

    // If we get here, return empty - controller will handle it
    console.log("❌ No text could be extracted");
    console.log("═".repeat(80));
    return "";

  } catch (err) {
    console.error(`\n❌ FATAL ERROR: ${err.message}`);
    console.error("═".repeat(80));
    return "";
  }
};

module.exports = extractTextFromPDF;

const pdfParseLib = require("pdf-parse");
const fs = require("fs");

// 🔥 IMPORT YOUR OCR FUNCTION
const { extractTextFromImage } = require("./imageOCR");

const pdfParse = pdfParseLib.default || pdfParseLib;

const extractTextFromPDF = async (filePath) => {
  console.log("\n" + "═".repeat(80));
  console.log("📄 PDF TEXT EXTRACTION");
  console.log("═".repeat(80));
  console.log(`File Path: ${filePath}`);
  console.log(`File Exists: ${fs.existsSync(filePath)}`);

  try {
    if (!fs.existsSync(filePath)) {
      throw new Error("PDF file does not exist at path: " + filePath);
    }

    const stats = fs.statSync(filePath);
    console.log(`File Size: ${stats.size} bytes`);

    const dataBuffer = fs.readFileSync(filePath);
    console.log(`Buffer Read: ${dataBuffer.length} bytes`);

    console.log("\n📄 Parsing PDF with pdf-parse...");
    const pdfData = await pdfParse(dataBuffer);
    console.log(`✓ PDF Parse Success`);
    console.log(`  Pages: ${pdfData.numpages}`);
    console.log(`  Extracted Text Length: ${pdfData.text?.length || 0} characters`);

    const text = pdfData.text?.trim();

    // ✅ If PDF has readable text
    if (text && text.length > 20) {
      console.log(`\n✅ TEXT EXTRACTED SUCCESSFULLY: ${text.length} characters`);
      console.log("\n📋 EXTRACTED TEXT (first 1000 chars):");
      console.log("-".repeat(80));
      console.log(text.substring(0, 1000));
      console.log("-".repeat(80));
      console.log("═".repeat(80));
      return text;
    }

    console.log(`\n⚠️  TEXT TOO SHORT: ${text?.length || 0} characters`);
    console.log(`   Falling back to OCR...`);
    throw new Error("Empty or insufficient PDF text");

  } catch (err) {
    console.log(`\n❌ PDF PARSE ERROR: ${err.message}`);

    // 🔥 FALLBACK TO OCR
    console.log("\n🔥 FALLBACK: Attempting OCR extraction...");
    try {
      const ocrText = await extractTextFromImage(filePath);

      if (!ocrText || ocrText.length === 0) {
        console.log(`⚠️  OCR returned empty text`);
        throw new Error("OCR extraction returned no text");
      }

      console.log(`✅ OCR EXTRACTION SUCCESS: ${ocrText.length} characters`);
      console.log("\n📋 OCR EXTRACTED TEXT (first 1000 chars):");
      console.log("-".repeat(80));
      console.log(ocrText.substring(0, 1000));
      console.log("-".repeat(80));
      console.log("═".repeat(80));
      return ocrText;
    } catch (ocrErr) {
      console.log(`\n❌ OCR EXTRACTION ALSO FAILED: ${ocrErr.message}`);
      console.log("═".repeat(80));
      throw new Error(`PDF and OCR extraction failed`);
    }
  }
};

module.exports = extractTextFromPDF;
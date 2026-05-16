const pdfParseLib = require("pdf-parse");
const fs = require("fs");

// 🔥 IMPORT YOUR OCR FUNCTION
const { extractTextFromImage } = require("./imageOCR");

const pdfParse = pdfParseLib.default || pdfParseLib;

const extractTextFromPDF = async (filePath) => {
  console.log("\n📄 ═══════════════════════════════════");
  console.log("📄 PDF EXTRACTION STARTING");
  console.log("📄 ═══════════════════════════════════");
  console.log(`   File Path: ${filePath}`);
  console.log(`   File Exists: ${fs.existsSync(filePath)}`);

  try {
    if (!fs.existsSync(filePath)) {
      throw new Error("PDF file does not exist at path: " + filePath);
    }

    const stats = fs.statSync(filePath);
    console.log(`   File Size: ${stats.size} bytes`);

    const dataBuffer = fs.readFileSync(filePath);
    console.log(`   Buffer Read: ${dataBuffer.length} bytes`);

    console.log("   📄 Parsing with pdf-parse...");
    const pdfData = await pdfParse(dataBuffer);
    console.log(`   ✓ Parse Success: ${pdfData.numpages} pages, ${pdfData.text?.length || 0} chars`);

    const text = pdfData.text?.trim();

    // ✅ If PDF has readable text
    if (text && text.length > 20) {
      console.log(`   ✅ TEXT EXTRACTED: ${text.length} characters`);
      console.log("📄 ═══════════════════════════════════");
      return text;
    }

    console.log(`   ⚠️  TEXT TOO SHORT: ${text?.length || 0} chars, trying OCR...`);
    throw new Error("Empty or insufficient PDF text");

  } catch (err) {
    console.log(`   ❌ PDF PARSE ERROR: ${err.message}`);
    console.log(`      Stack: ${err.stack?.substring(0, 300)}`);

    // 🔥 FALLBACK TO OCR
    console.log("   🔥 Attempting OCR fallback...");
    try {
      const ocrText = await extractTextFromImage(filePath);
      console.log(`   🔥 OCR SUCCESS: ${ocrText?.length || 0} characters`);
      console.log("📄 ═══════════════════════════════════");
      return ocrText;
    } catch (ocrErr) {
      console.log(`   🔥 OCR ALSO FAILED: ${ocrErr.message}`);
      console.log("📄 ═══════════════════════════════════");
      throw new Error(`PDF and OCR extraction failed: ${err.message} | ${ocrErr.message}`);
    }
  }
};

module.exports = extractTextFromPDF;
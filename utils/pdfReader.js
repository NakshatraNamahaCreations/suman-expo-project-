const pdfParseLib = require("pdf-parse");
const fs = require("fs");

// 🔥 IMPORT YOUR OCR FUNCTION
const { extractTextFromImage } = require("./imageOCR");

const pdfParse = pdfParseLib.default || pdfParseLib;

const extractTextFromPDF = async (filePath) => {
  console.log("📄 Starting PDF extraction:", { filePath, fileExists: fs.existsSync(filePath) });

  try {
    if (!fs.existsSync(filePath)) {
      throw new Error("PDF file does not exist at path: " + filePath);
    }

    const stats = fs.statSync(filePath);
    console.log(`📄 PDF file size: ${stats.size} bytes`);

    const dataBuffer = fs.readFileSync(filePath);
    console.log(`📄 File read successfully, buffer size: ${dataBuffer.length} bytes`);

    console.log("📄 Parsing PDF with pdf-parse...");
    const pdfData = await pdfParse(dataBuffer);
    console.log(`📄 pdf-parse completed, pages: ${pdfData.numpages}, text length: ${pdfData.text?.length || 0}`);

    const text = pdfData.text?.trim();

    // ✅ If PDF has readable text
    if (text && text.length > 20) {
      console.log(`✅ PDF parsed successfully, extracted ${text.length} characters`);
      return text.toLowerCase();
    }

    console.log(`⚠️  PDF text too short (${text?.length || 0} chars), falling back to OCR`);
    throw new Error("Empty or insufficient PDF text");

  } catch (err) {
    console.log("❌ PDF parse failed → using OCR");
    console.log("Error details:", { message: err.message, stack: err.stack?.substring(0, 200) });

    // 🔥 FALLBACK TO OCR
    console.log("🔥 Attempting OCR fallback...");
    const ocrText = await extractTextFromImage(filePath);
    console.log(`🔥 OCR fallback returned: ${ocrText?.length || 0} characters`);

    return ocrText.toLowerCase();
  }
};

module.exports = extractTextFromPDF;
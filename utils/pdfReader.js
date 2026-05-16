const pdfParseLib = require("pdf-parse");
const fs = require("fs");
const path = require("path");
const { extractTextFromImage } = require("./imageOCR");

const pdfParse = pdfParseLib.default || pdfParseLib;

const extractTextFromPDF = async (filePath) => {
  console.log("\n" + "═".repeat(80));
  console.log("📄 PDF TEXT EXTRACTION");
  console.log("═".repeat(80));
  console.log(`File: ${filePath}`);
  console.log(`Exists: ${fs.existsSync(filePath)}`);

  try {
    if (!fs.existsSync(filePath)) {
      console.log("❌ File not found");
      throw new Error("PDF file not found");
    }

    const stats = fs.statSync(filePath);
    console.log(`Size: ${stats.size} bytes`);

    console.log("Reading file...");
    const dataBuffer = fs.readFileSync(filePath);
    console.log(`Buffer: ${dataBuffer.length} bytes`);

    console.log("Parsing PDF with pdf-parse...");
    let pdfData;
    let text = "";

    try {
      pdfData = await pdfParse(dataBuffer);
      text = (pdfData.text || "").trim();
      console.log(`✓ PDF parsed: ${pdfData.numpages} pages, ${text.length} chars extracted`);
    } catch (parseErr) {
      console.error(`⚠️  pdf-parse error: ${parseErr.message}`);
      pdfData = null;
      text = "";
    }

    // If PDF parsing returned text, use it
    if (text && text.length > 100) {
      console.log("\n✅ TEXT EXTRACTED FROM PDF");
      console.log("\n" + "─".repeat(80));
      console.log("📋 EXTRACTED TEXT (full):");
      console.log("─".repeat(80));
      console.log(text);
      console.log("─".repeat(80));
      console.log("═".repeat(80));
      return text;
    }

    // If PDF parsing returned little/no text, try OCR
    if (!text || text.length < 100) {
      console.log("\n⚠️  PDF text too short or empty, attempting OCR...");
      console.log("   This might be a scanned/image-based PDF");

      try {
        console.log("\n   Attempting OCR extraction...");
        const ocrText = await extractTextFromImage(filePath);

        if (ocrText && ocrText.trim().length > 50) {
          console.log(`\n✅ OCR EXTRACTION SUCCESSFUL`);
          console.log(`   Extracted ${ocrText.length} characters`);
          console.log("\n" + "─".repeat(80));
          console.log("📋 EXTRACTED TEXT (via OCR):");
          console.log("─".repeat(80));
          console.log(ocrText);
          console.log("─".repeat(80));
          console.log("═".repeat(80));
          return ocrText;
        } else {
          console.log(`⚠️  OCR returned insufficient text (${ocrText?.length || 0} chars)`);
        }
      } catch (ocrErr) {
        console.error(`❌ OCR error: ${ocrErr.message}`);
      }

      // Both failed
      if (!text && (!pdfData || pdfData.numpages === 0)) {
        throw new Error("Could not extract text from PDF using pdf-parse or OCR");
      }

      // Return whatever we got
      if (text) return text;
      throw new Error("PDF is image-based and OCR extraction failed");
    }

    return text;

  } catch (err) {
    console.error(`\n❌ PDF EXTRACTION FAILED: ${err.message}`);
    console.error(`   Stack: ${err.stack?.substring(0, 300)}`);
    console.log("═".repeat(80));
    throw err;
  }
};

module.exports = extractTextFromPDF;

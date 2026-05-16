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

    // If PDF parsing returned any text at all, use it (even if short)
    if (text && text.length > 20) {
      console.log("\n✅ TEXT EXTRACTED FROM PDF");
      console.log("\n" + "─".repeat(80));
      console.log("📋 EXTRACTED TEXT (from pdf-parse):");
      console.log("─".repeat(80));
      console.log(text);
      console.log("─".repeat(80));
      console.log("═".repeat(80));
      return text;
    }

    // If pdf-parse returned very little text, log warning but don't try OCR
    // OCR is too slow on free tier servers and causes timeouts
    if (!text || text.length < 20) {
      console.log("\n⚠️  PDF text extraction minimal or empty");
      console.log("   Skipping OCR (too slow on free tier server)");
      console.log("   Returning what pdf-parse extracted");

      if (text && text.length > 0) {
        console.log(`   Found ${text.length} characters`);
        return text;
      }

      // If truly nothing, throw error
      if (!pdfData || pdfData.numpages === 0) {
        throw new Error("Could not extract text from PDF - file may be corrupted or image-based");
      }

      throw new Error("PDF text extraction returned empty string");
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

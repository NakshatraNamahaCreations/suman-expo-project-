const pdfParseLib = require("pdf-parse");
const fs = require("fs");

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
      return "";
    }

    const stats = fs.statSync(filePath);
    console.log(`Size: ${stats.size} bytes`);

    console.log("Reading file...");
    const dataBuffer = fs.readFileSync(filePath);
    console.log(`Buffer: ${dataBuffer.length} bytes`);

    console.log("Parsing PDF...");
    const pdfData = await pdfParse(dataBuffer);
    const text = (pdfData.text || "").trim();

    console.log(`✓ Pages: ${pdfData.numpages}, Text: ${text.length} chars`);

    // Print the full extracted text
    console.log("\n" + "─".repeat(80));
    console.log("📋 FULL EXTRACTED PDF TEXT:");
    console.log("─".repeat(80));
    console.log(text);
    console.log("─".repeat(80));

    console.log("\n═".repeat(80));

    return text;

  } catch (err) {
    console.error(`❌ Error: ${err.message}`);
    console.log("═".repeat(80));
    return "";
  }
};

module.exports = extractTextFromPDF;
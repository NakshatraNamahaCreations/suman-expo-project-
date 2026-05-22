const pdfParseLib = require("pdf-parse");
const fs = require("fs");

const extractTextFromPDF = async (filePath) => {
  try {
    if (!fs.existsSync(filePath)) {
      throw new Error("PDF file not found");
    }

    const dataBuffer = fs.readFileSync(filePath);
    const pdfData = await pdfParseLib(dataBuffer);
    const text = (pdfData.text || "").trim();

    console.log("PDF Pages: " + pdfData.numpages);
    console.log("Text extracted: " + text.length + " chars");

    if (!text || text.trim().length === 0) {
      console.log("⚠️ PDF appears to be image-based (scanned) - no text found");
      console.log("Will use Google Vision OCR for scanned PDFs");
      throw new Error("PDF is image-based (scanned PDF). Needs OCR processing.");
    }

    return text;

  } catch (error) {
    console.error("PDF Extraction Error: " + error.message);
    throw error;
  }
};

module.exports = extractTextFromPDF;

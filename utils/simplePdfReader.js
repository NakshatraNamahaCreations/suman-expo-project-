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

    if (!text || text.length < 50) {
      console.log("WARNING: PDF appears to be image-based (scanned)");
      console.log("To use scanned prescriptions, please convert PDF to text-based format first");
      console.log("Or upload a clear photo of the prescription instead");
      throw new Error("PDF is image-based. Please use text-based PDF or upload a photo.");
    }

    return text;

  } catch (error) {
    console.error("PDF Extraction Error: " + error.message);
    throw error;
  }
};

module.exports = extractTextFromPDF;

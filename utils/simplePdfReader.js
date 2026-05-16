const pdfParseLib = require("pdf-parse");
const fs = require("fs");

const extractTextFromPDF = async (filePath) => {
  console.log("SimplePdfReader: Starting extraction...");
  console.log("File path: " + filePath);
  console.log("File exists: " + fs.existsSync(filePath));

  try {
    // Check file exists
    if (!fs.existsSync(filePath)) {
      throw new Error("PDF file does not exist: " + filePath);
    }

    // Read file
    console.log("Reading file...");
    const dataBuffer = fs.readFileSync(filePath);
    console.log("File size: " + dataBuffer.length + " bytes");

    // Parse PDF
    console.log("Parsing PDF with pdf-parse...");
    const pdfData = await pdfParseLib(dataBuffer);
    console.log("PDF parsed successfully");
    console.log("Pages: " + pdfData.numpages);

    // Extract text
    let text = (pdfData.text || "").trim();
    console.log("Text extracted: " + text.length + " characters");

    if (!text || text.length === 0) {
      throw new Error("No text extracted from PDF");
    }

    return text;

  } catch (error) {
    console.error("SimplePdfReader Error: " + error.message);
    console.error("Stack: " + error.stack);
    throw error;
  }
};

module.exports = extractTextFromPDF;

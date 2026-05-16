const pdfParseLib = require("pdf-parse");
const fs = require("fs");
const Tesseract = require("tesseract.js");

const extractTextFromPDF = async (filePath) => {
  console.log("\n===== PDF TEXT EXTRACTION =====");
  console.log("File: " + filePath);

  try {
    if (!fs.existsSync(filePath)) {
      throw new Error("File not found");
    }

    const dataBuffer = fs.readFileSync(filePath);
    console.log("File size: " + dataBuffer.length + " bytes");

    // Try to parse PDF and extract text
    console.log("Parsing PDF...");
    const pdfData = await pdfParseLib(dataBuffer);
    let text = (pdfData.text || "").trim();

    console.log("PDF Pages: " + pdfData.numpages);
    console.log("Text found: " + text.length + " characters");

    // If text was extracted, return it
    if (text && text.length > 50) {
      console.log("Result: Text-based PDF - extraction successful");
      console.log("===== END PDF EXTRACTION =====\n");
      return text;
    }

    // If no text, the PDF is likely image-based (scanned)
    console.log("\nPDF appears to be IMAGE-BASED (scanned)");
    console.log("Attempting OCR with Tesseract.js...");
    console.log("NOTE: This may take 30-60 seconds for the first run...\n");

    // Try OCR with timeout
    try {
      const ocrPromise = Tesseract.recognize(dataBuffer, "eng", {
        logger: m => {
          if (m.status === "recognizing") {
            const progress = Math.round(m.progress * 100);
            console.log("OCR Progress: " + progress + "%");
          }
        }
      });

      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error("OCR timeout (60s)")), 60000)
      );

      const result = await Promise.race([ocrPromise, timeoutPromise]);
      const ocrText = (result.data.text || "").trim();

      console.log("OCR extracted: " + ocrText.length + " characters");

      if (ocrText && ocrText.length > 50) {
        console.log("Result: Image-based PDF - OCR successful");
        console.log("===== END PDF EXTRACTION =====\n");
        return ocrText;
      } else {
        console.log("OCR returned insufficient text");
        throw new Error("OCR returned no text from PDF");
      }

    } catch (ocrErr) {
      console.log("OCR Error: " + ocrErr.message);
      throw new Error("PDF is image-based but OCR failed: " + ocrErr.message);
    }

  } catch (error) {
    console.error("Extraction Error: " + error.message);
    console.log("===== END PDF EXTRACTION =====\n");
    throw error;
  }
};

module.exports = extractTextFromPDF;

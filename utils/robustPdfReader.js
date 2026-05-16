const pdfParseLib = require("pdf-parse");
const fs = require("fs");
const Tesseract = require("tesseract.js");

const extractTextFromPDF = async (filePath) => {
  console.log("\n===== PDF TEXT EXTRACTION =====");
  console.log("File: " + filePath);

  try {
    if (!fs.existsSync(filePath)) {
      throw new Error("File not found: " + filePath);
    }

    const stats = fs.statSync(filePath);
    console.log("Size: " + stats.size + " bytes");

    // Step 1: Try pdf-parse
    console.log("\nStep 1: Trying pdf-parse...");
    const dataBuffer = fs.readFileSync(filePath);
    const pdfData = await pdfParseLib(dataBuffer);
    let text = (pdfData.text || "").trim();

    console.log("Pages: " + pdfData.numpages);
    console.log("Text extracted: " + text.length + " chars");

    // If text found, return it
    if (text && text.length > 50) {
      console.log("SUCCESS: pdf-parse extracted text");
      console.log("===== END PDF EXTRACTION =====\n");
      return text;
    }

    // Step 2: If no text, PDF might be image-based
    console.log("\nStep 2: PDF appears to be image-based. Attempting OCR...");
    console.log("NOTE: OCR is experimental, may take time...");

    try {
      // Try to extract images from PDF and OCR them
      const { createCanvas } = require("canvas");
      const pdf = require("pdfjs-dist");

      console.log("Extracting images from PDF...");
      const pdfDoc = await pdf.getDocument(dataBuffer).promise;
      const numPages = pdfDoc.numPages;
      console.log("Total pages: " + numPages);

      let allText = "";

      for (let pageNum = 1; pageNum <= Math.min(numPages, 3); pageNum++) {
        console.log("Processing page " + pageNum + "...");
        const page = await pdfDoc.getPage(pageNum);
        const viewport = page.getViewport({ scale: 2 });

        const canvas = createCanvas(viewport.width, viewport.height);
        const context = canvas.getContext("2d");

        const renderContext = {
          canvasContext: context,
          viewport: viewport,
        };

        await page.render(renderContext).promise;
        const imageData = canvas.toDataURL("image/png");

        // OCR the image
        console.log("Running OCR on page " + pageNum + "...");
        const ocrResult = await Tesseract.recognize(imageData, "eng");
        const pageText = (ocrResult.data.text || "").trim();
        console.log("OCR text: " + pageText.length + " chars from page " + pageNum);

        allText += pageText + "\n";
      }

      if (allText.length > 50) {
        console.log("SUCCESS: OCR extracted " + allText.length + " chars");
        console.log("===== END PDF EXTRACTION =====\n");
        return allText;
      }

    } catch (ocrErr) {
      console.log("OCR approach failed: " + ocrErr.message);
    }

    // Step 3: Fallback - return even if small amount of text
    if (text && text.length > 0) {
      console.log("Returning limited text: " + text.length + " chars");
      console.log("===== END PDF EXTRACTION =====\n");
      return text;
    }

    throw new Error("Could not extract text from PDF (no text or image content found)");

  } catch (error) {
    console.error("ERROR: " + error.message);
    console.error("===== END PDF EXTRACTION =====\n");
    throw error;
  }
};

module.exports = extractTextFromPDF;

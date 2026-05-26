const fs = require("fs");
const path = require("path");
const vision = require("@google-cloud/vision");
const { Storage } = require("@google-cloud/storage");
const Medicine = require("../models/Medicine");

const bucketName = process.env.GOOGLE_CLOUD_BUCKET;

if (!bucketName) {
  console.warn("⚠️ GOOGLE_CLOUD_BUCKET is not set in .env");
}

const visionClient = new vision.ImageAnnotatorClient();
const storage = new Storage({
  projectId: process.env.GOOGLE_CLOUD_PROJECT_ID,
});

exports.extractMedicinesFromPrescription = async (req, res) => {
  let filePath = null;

  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "No file uploaded",
      });
    }

    filePath = req.file.path;

    const fileName = req.file.originalname;
    const mimeType = req.file.mimetype;

    console.log("\n📄 Processing Prescription");
    console.log("File Name:", fileName);
    console.log("MIME Type:", mimeType);
    console.log("File Path:", filePath);

    if (!fs.existsSync(filePath)) {
      return res.status(400).json({
        success: false,
        message: "Uploaded file not found",
      });
    }

    const stats = fs.statSync(filePath);

    if (stats.size === 0) {
      cleanupLocalFile(filePath);

      return res.status(400).json({
        success: false,
        message: "Uploaded file is empty",
      });
    }

    let extractedText = "";

    if (mimeType === "application/pdf") {
      console.log("📄 PDF detected. Running Google Vision PDF OCR...");
      extractedText = await extractTextFromPdfUsingGcs(filePath, fileName);
    } else if (mimeType && mimeType.startsWith("image/")) {
      console.log("🖼️ Image detected. Running Google Vision Image OCR...");
      extractedText = await extractTextFromImage(filePath);
    } else {
      cleanupLocalFile(filePath);

      return res.status(400).json({
        success: false,
        message: "Unsupported file type. Please upload JPG, PNG, WEBP or PDF.",
      });
    }

    cleanupLocalFile(filePath);

    if (!extractedText || extractedText.trim().length === 0) {
      return res.json({
        success: true,
        message: "No text found in prescription",
        extractedText: "",
        extractedMedicines: [],
        matchedMedicines: [],
        matchedCount: 0,
        unmatchedCount: 0,
      });
    }

    console.log(`✅ Extracted ${extractedText.length} characters`);

    const medicineNames = extractMedicineNames(extractedText);

    console.log(`💊 Found ${medicineNames.length} possible medicine names`);

    if (medicineNames.length === 0) {
      return res.json({
        success: true,
        message: "No medicines found",
        extractedText,
        extractedMedicines: [],
        matchedMedicines: [],
        matchedCount: 0,
        unmatchedCount: 0,
      });
    }

    console.log("🔗 Matching with database...");

    const matchedMedicines = await matchMedicinesWithDatabase(medicineNames);

    console.log(`✅ Matched ${matchedMedicines.length} medicines`);

    return res.json({
      success: true,
      message:
        matchedMedicines.length > 0
          ? `Found ${matchedMedicines.length} medicine(s)`
          : "No matching medicines found",
      extractedText,
      extractedMedicines: medicineNames,
      matchedMedicines,
      matchedCount: matchedMedicines.length,
      unmatchedCount: Math.max(medicineNames.length - matchedMedicines.length, 0),
    });
  } catch (error) {
    console.error("❌ Prescription extraction error:", error.message);
    console.error(error);

    cleanupLocalFile(filePath);

    return res.status(500).json({
      success: false,
      message: error.message || "Server error while extracting prescription",
    });
  }
};

async function extractTextFromImage(filePath) {
  try {
    const imageBuffer = fs.readFileSync(filePath);

    const request = {
      image: {
        content: imageBuffer,
      },
      features: [
        {
          type: "DOCUMENT_TEXT_DETECTION",
        },
      ],
    };

    const [result] = await visionClient.annotateImage(request);

    if (result.fullTextAnnotation && result.fullTextAnnotation.text) {
      return result.fullTextAnnotation.text;
    }

    if (result.textAnnotations && result.textAnnotations.length > 0) {
      return result.textAnnotations.map((item) => item.description).join("\n");
    }

    return "";
  } catch (error) {
    console.error("Image OCR Error:", error.message);

    throw new Error(
      "Could not read image prescription. Please upload a clear image."
    );
  }
}

async function extractTextFromPdfUsingGcs(filePath, originalFileName) {
  if (!bucketName) {
    throw new Error("GOOGLE_CLOUD_BUCKET is missing in environment variables");
  }

  const bucket = storage.bucket(bucketName);

  const safeName = path
    .basename(originalFileName || "prescription.pdf")
    .replace(/[^a-zA-Z0-9.\-_]/g, "_");

  const uniqueId = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;

  const inputGcsFileName = `prescriptions/input/${uniqueId}-${safeName}`;
  const outputPrefix = `prescriptions/output/${uniqueId}/`;

  const inputGcsUri = `gs://${bucketName}/${inputGcsFileName}`;
  const outputGcsUri = `gs://${bucketName}/${outputPrefix}`;

  try {
    console.log("☁️ Uploading PDF to GCS:", inputGcsUri);

    await bucket.upload(filePath, {
      destination: inputGcsFileName,
      metadata: {
        contentType: "application/pdf",
      },
    });

    const request = {
      requests: [
        {
          inputConfig: {
            gcsSource: {
              uri: inputGcsUri,
            },
            mimeType: "application/pdf",
          },
          features: [
            {
              type: "DOCUMENT_TEXT_DETECTION",
            },
          ],
          outputConfig: {
            gcsDestination: {
              uri: outputGcsUri,
            },
            batchSize: 2,
          },
        },
      ],
    };

    console.log("🔍 Starting Vision PDF OCR...");

    const [operation] = await visionClient.asyncBatchAnnotateFiles(request);

    await operation.promise();

    console.log("✅ Vision PDF OCR completed");

    const [files] = await bucket.getFiles({
      prefix: outputPrefix,
    });

    if (!files || files.length === 0) {
      throw new Error("No OCR output generated from PDF");
    }

    let fullText = "";

    for (const file of files) {
      if (!file.name.endsWith(".json")) continue;

      console.log("📥 Reading OCR output:", file.name);

      const [contents] = await file.download();
      const json = JSON.parse(contents.toString("utf8"));

      const responses = json.responses || [];

      for (const response of responses) {
        if (
          response.fullTextAnnotation &&
          response.fullTextAnnotation.text
        ) {
          fullText += response.fullTextAnnotation.text + "\n";
        }
      }
    }

    await cleanupGcsFolder(bucket, outputPrefix);
    await deleteGcsFile(bucket, inputGcsFileName);

    return fullText.trim();
  } catch (error) {
    console.error("PDF OCR Error:", error.message);

    try {
      await cleanupGcsFolder(bucket, outputPrefix);
      await deleteGcsFile(bucket, inputGcsFileName);
    } catch (cleanupError) {
      console.error("GCS cleanup after error failed:", cleanupError.message);
    }

    throw new Error(
      "Could not read PDF prescription. Please upload a clear PDF or image."
    );
  }
}

function normalizeText(text) {
  return String(text || "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[^\w\s]/g, "")
    .trim();
}

function extractMedicineNames(text) {
  const lines = text.split("\n");
  const medicines = [];

  const skipWords = [
    "investigation",
    "signature",
    "doctor",
    "dr",
    "patient",
    "date",
    "age",
    "notes",
    "footer",
    "hospital",
    "clinic",
    "address",
    "phone",
    "mobile",
    "email",
    "rx",
    "prescription",
    "diagnosis",
    "advice",
    "follow",
    "review",
    "blood",
    "test",
    "lab",
    "bill",
    "invoice",
  ];

  for (const line of lines) {
    let med = line.trim();

    if (!med || med.length < 3) continue;

    const lower = med.toLowerCase();

    if (skipWords.some((word) => lower.includes(word))) continue;
    if (/^\d+$/.test(med)) continue;

    med = med.replace(/^\d+[\.\)]\s*/, "");

    med = med.replace(
      /^(tab|tablet|cap|capsule|syrup|inj|injection|drops|drop|cream|ointment)\.?\s+/i,
      ""
    );

    med = med.split(
      /\s+(\d+-\d+-\d+|\d+\s*(tablet|tab|capsule|cap|mg|mcg|ml|gm|g|drop|drops|days?|weeks?|months?|morning|evening|night|daily|bd|td|tid|od|sos|hs|after food|before food|bf|af))/i
    )[0];

    med = med.trim().replace(/[^\w\s\-]/g, "").trim();

    if (
      med &&
      med.length >= 3 &&
      /[a-zA-Z]/.test(med) &&
      !medicines.some((item) => normalizeText(item) === normalizeText(med))
    ) {
      medicines.push(med);
    }
  }

  return medicines;
}

async function matchMedicinesWithDatabase(medicineNames) {
  const matched = [];

  try {
    const dbMedicines = await Medicine.find({ status: "Active" }).lean();

    for (const name of medicineNames) {
      const normalizedName = normalizeText(name);

      if (!normalizedName) continue;

      const dbMed = dbMedicines.find((medicine) => {
        const description = normalizeText(medicine.description || "");
        const medName = normalizeText(medicine.name || "");
        const brand = normalizeText(medicine.brand || "");
        const composition = normalizeText(medicine.composition || "");

        const dbSearchText = `${description} ${medName} ${brand} ${composition}`.trim();

        return (
          dbSearchText === normalizedName ||
          dbSearchText.includes(normalizedName) ||
          normalizedName.includes(description) ||
          normalizedName.includes(medName)
        );
      });

      if (dbMed) {
        const medicineId = dbMed._id.toString();

        const alreadyAdded = matched.some((item) => item._id === medicineId);

        if (!alreadyAdded) {
          matched.push({
            _id: medicineId,
            medicineId,
            description: dbMed.description || dbMed.name || "",
            name: dbMed.description || dbMed.name || "",
            mfr: dbMed.mfr || "N/A",
            vendor: dbMed.vendor || "N/A",
            pack: dbMed.pack || "N/A",
            batchNo: dbMed.batchNo || "",
            hsnCode: dbMed.hsnCode || "",
            price: dbMed.newMrp || dbMed.price || dbMed.mrp || 0,
            mrp: dbMed.newMrp || dbMed.mrp || 0,
            qty: dbMed.qty || 0,
            stock: dbMed.qty || 0,
            inStock: (dbMed.qty || 0) > 0,
            gstPercent: dbMed.gstPercent || 5,
          });
        }
      }
    }
  } catch (error) {
    console.error("Database matching error:", error.message);
  }

  return matched;
}

function cleanupLocalFile(filePath) {
  try {
    if (filePath && fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch (error) {
    console.error("Local file cleanup error:", error.message);
  }
}

async function deleteGcsFile(bucket, fileName) {
  try {
    const file = bucket.file(fileName);
    const [exists] = await file.exists();

    if (exists) {
      await file.delete();
      console.log("🧹 Deleted GCS file:", fileName);
    }
  } catch (error) {
    console.error("Delete GCS file error:", error.message);
  }
}

async function cleanupGcsFolder(bucket, prefix) {
  try {
    const [files] = await bucket.getFiles({
      prefix,
    });

    await Promise.all(
      files.map(async (file) => {
        await file.delete();
      })
    );

    if (files.length > 0) {
      console.log(`🧹 Deleted ${files.length} GCS output files`);
    }
  } catch (error) {
    console.error("GCS folder cleanup error:", error.message);
  }
}
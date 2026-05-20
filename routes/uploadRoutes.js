const router = require("express").Router();
const multer = require("multer");
const path = require("path");

const uploadController = require("../controllers/uploadPrescriptionController");
const diagnosticController = require("../controllers/diagnosticController");

const storage = multer.diskStorage({
  destination: "uploads/",
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || ".jpg";
    cb(null, `${Date.now()}-${Math.round(Math.random() * 1e6)}${ext}`);
  },
});

// File filter to accept PDF, images, and Excel files
const fileFilter = (req, file, cb) => {
  const allowed = [
    "application/pdf",
    "image/jpeg",
    "image/jpg",
    "image/png",
    "image/webp",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.ms-excel",
    "text/csv",
    "application/octet-stream",
  ];

  if (allowed.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error(`File type not allowed: ${file.mimetype}`), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB for PDFs and spreadsheets
});

// Middleware to log file uploads
const logUpload = (req, res, next) => {
  if (req.file) {
    console.log(`\n📤 FILE UPLOAD RECEIVED`);
    console.log(`   Original Name: ${req.file.originalname}`);
    console.log(`   Saved Path: ${req.file.path}`);
    console.log(`   File Size: ${req.file.size} bytes`);
    console.log(`   MIME Type: ${req.file.mimetype}`);
  } else {
    console.log(`\n⚠️  NO FILE IN REQUEST for: ${req.path}`);
  }
  next();
};

// Unified medicine extraction (PDF, Excel, Image)
router.post(
  "/extract-medicines",
  upload.single("file"),
  logUpload,
  uploadController.extractMedicines
);

// Diagnostic endpoint to test OCR methods
router.post(
  "/test-ocr",
  upload.single("file"),
  logUpload,
  diagnosticController.testOCRMethods
);

module.exports = router;

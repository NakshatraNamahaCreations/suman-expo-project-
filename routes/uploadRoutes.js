const router = require("express").Router();
const multer = require("multer");
const path = require("path");

const uploadController = require("../controllers/uploadPrescriptionController");

const storage = multer.diskStorage({
  destination: "uploads/",
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || ".jpg";
    cb(null, `${Date.now()}-${Math.round(Math.random() * 1e6)}${ext}`);
  },
});
const upload = multer({ storage });

// Middleware to log file uploads
const logUpload = (req, res, next) => {
  if (req.file) {
    console.log(`📤 File uploaded: ${req.file.originalname}`);
    console.log(`   Path: ${req.file.path}`);
    console.log(`   Size: ${req.file.size} bytes`);
    console.log(`   Mimetype: ${req.file.mimetype}`);
  } else {
    console.log(`⚠️  No file in request for: ${req.path}`);
  }
  next();
};

// PDF prescription upload
router.post(
  "/upload-prescription",
  upload.single("file"),
  logUpload,
  uploadController.processPDFPrescription
);

// Image prescription upload (camera/gallery)
router.post(
  "/upload-image",
  upload.single("file"),
  logUpload,
  uploadController.processImagePrescription
);

// Unified medicine extraction (PDF, Excel, Image)
router.post(
  "/extract-medicines",
  upload.single("file"),
  logUpload,
  uploadController.extractMedicines
);

module.exports = router;

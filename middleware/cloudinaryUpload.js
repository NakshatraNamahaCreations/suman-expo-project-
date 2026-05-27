const multer = require("multer");
const { CloudinaryStorage } = require("multer-storage-cloudinary");
const cloudinary = require("cloudinary").v2;

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

/**
 * Create Cloudinary storage with specified folder
 * @param {string} folder - Cloudinary folder name (e.g., 'prescriptions', 'medicines', 'admin')
 * @returns {CloudinaryStorage} Configured Cloudinary storage
 */
const createCloudinaryStorage = (folder = "uploads") => {
  return new CloudinaryStorage({
    cloudinary: cloudinary,
    params: {
      folder: folder,
      resource_type: "auto", // auto-detect (image, video, etc)
      use_filename: true,
      unique_filename: true,
    },
  });
};

/**
 * File filter to validate file types
 */
const fileFilter = (req, file, cb) => {
  const allowedMimes = [
    // Images
    "image/jpeg",
    "image/jpg",
    "image/png",
    "image/webp",
    "image/gif",
    // PDFs
    "application/pdf",
    // Excel files
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.ms-excel",
    // CSV
    "text/csv",
  ];

  if (allowedMimes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(
      new Error(
        `Invalid file type: ${file.mimetype}. Allowed types: images (JPEG, PNG, WebP, GIF), PDF, Excel, CSV`
      ),
      false
    );
  }
};

/**
 * Create Cloudinary upload middleware for specific folder
 * @param {string} folder - Cloudinary folder name
 * @returns {Object} Multer middleware configured for Cloudinary
 */
const createCloudinaryUpload = (folder = "uploads") => {
  return multer({
    storage: createCloudinaryStorage(folder),
    fileFilter,
    limits: {
      fileSize: 50 * 1024 * 1024, // 50MB max file size
    },
  });
};

// Pre-configured uploads for common use cases
const prescriptionUpload = createCloudinaryUpload("prescriptions");
const medicineUpload = createCloudinaryUpload("medicines");
const adminUpload = createCloudinaryUpload("admin");
const documentUpload = createCloudinaryUpload("documents");

module.exports = {
  createCloudinaryUpload,
  prescriptionUpload,
  medicineUpload,
  adminUpload,
  documentUpload,
};

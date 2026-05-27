const router = require("express").Router();
const {
  medicineUpload,
  adminUpload,
  documentUpload,
  createCloudinaryUpload,
} = require("../middleware/cloudinaryUpload");
const {
  deleteFromCloudinary,
  getCloudinaryFileInfo,
  generateSecureUrl,
} = require("../config/cloudinary");

/**
 * Health check
 */
router.get("/health", (req, res) => {
  res.json({
    status: "ok",
    service: "cloudinary-uploads",
    timestamp: new Date().toISOString(),
  });
});

/**
 * Upload medicine image
 * POST /api/cloudinary/medicine-image
 * Body: { image: File }
 */
router.post("/medicine-image", (req, res, next) => {
  medicineUpload.single("image")(req, res, (err) => {
    if (err) {
      console.error("❌ Medicine image upload error:", err.message);
      return res.status(400).json({
        success: false,
        message: err.message || "Failed to upload medicine image",
      });
    }
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "No image file received",
      });
    }
    next();
  });
}, async (req, res) => {
  try {
    const { medicineId } = req.body;

    return res.json({
      success: true,
      message: "Medicine image uploaded successfully",
      data: {
        medicineId,
        imageUrl: req.file.path,
        publicId: req.file.filename,
        size: req.file.size,
        format: req.file.mimetype,
        uploadedAt: new Date(),
      },
    });
  } catch (error) {
    console.error("❌ Error processing medicine upload:", error.message);

    // Clean up on error
    if (req.file && req.file.filename) {
      try {
        await deleteFromCloudinary(req.file.filename, "image");
      } catch (deleteError) {
        console.error("Warning: Could not clean up file:", deleteError.message);
      }
    }

    return res.status(500).json({
      success: false,
      message: error.message || "Server error during upload",
    });
  }
});

/**
 * Upload admin file (multiple file types)
 * POST /api/cloudinary/admin-upload
 * Body: { file: File }
 */
router.post("/admin-upload", (req, res, next) => {
  adminUpload.single("file")(req, res, (err) => {
    if (err) {
      console.error("❌ Admin file upload error:", err.message);
      return res.status(400).json({
        success: false,
        message: err.message || "Failed to upload file",
      });
    }
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "No file received",
      });
    }
    next();
  });
}, async (req, res) => {
  try {
    const { purpose, category } = req.body;

    return res.json({
      success: true,
      message: "File uploaded successfully to Cloudinary",
      data: {
        fileName: req.file.originalname,
        fileUrl: req.file.path,
        publicId: req.file.filename,
        size: req.file.size,
        mimeType: req.file.mimetype,
        purpose: purpose || "general",
        category: category || "uncategorized",
        uploadedAt: new Date(),
      },
    });
  } catch (error) {
    console.error("❌ Error processing admin upload:", error.message);

    // Clean up on error
    if (req.file && req.file.filename) {
      try {
        await deleteFromCloudinary(req.file.filename, "auto");
      } catch (deleteError) {
        console.error("Warning: Could not clean up file:", deleteError.message);
      }
    }

    return res.status(500).json({
      success: false,
      message: error.message || "Server error during upload",
    });
  }
});

/**
 * Delete file from Cloudinary
 * DELETE /api/cloudinary/file/:publicId
 * Params: { publicId: string }
 */
router.delete("/file/:publicId", async (req, res) => {
  try {
    const { publicId } = req.params;
    const { resourceType } = req.body;

    if (!publicId) {
      return res.status(400).json({
        success: false,
        message: "Public ID is required",
      });
    }

    const result = await deleteFromCloudinary(
      publicId,
      resourceType || "auto"
    );

    return res.json({
      success: true,
      message: "File deleted successfully from Cloudinary",
      data: result,
    });
  } catch (error) {
    console.error("❌ Error deleting file:", error.message);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to delete file",
    });
  }
});

/**
 * Get file information from Cloudinary
 * GET /api/cloudinary/file-info/:publicId
 */
router.get("/file-info/:publicId", async (req, res) => {
  try {
    const { publicId } = req.params;

    if (!publicId) {
      return res.status(400).json({
        success: false,
        message: "Public ID is required",
      });
    }

    const result = await getCloudinaryFileInfo(publicId);

    return res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error("❌ Error fetching file info:", error.message);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch file info",
    });
  }
});

/**
 * Generate optimized URL with transformations
 * POST /api/cloudinary/generate-url
 * Body: { publicId: string, width?: number, height?: number, quality?: string, format?: string }
 */
router.post("/generate-url", async (req, res) => {
  try {
    const { publicId, width, height, quality, format, crop } = req.body;

    if (!publicId) {
      return res.status(400).json({
        success: false,
        message: "Public ID is required",
      });
    }

    const transformations = {};
    if (width) transformations.width = width;
    if (height) transformations.height = height;
    if (quality) transformations.quality = quality;
    if (format) transformations.fetch_format = format;
    if (crop) transformations.crop = crop;

    // Add auto optimization if not specified
    if (!quality) transformations.quality = "auto";
    if (!format) transformations.fetch_format = "auto";

    const url = generateSecureUrl(publicId, transformations);

    return res.json({
      success: true,
      data: {
        originalPublicId: publicId,
        optimizedUrl: url,
        transformations,
      },
    });
  } catch (error) {
    console.error("❌ Error generating URL:", error.message);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to generate URL",
    });
  }
});

/**
 * Upload document (CSV, Excel, PDF)
 * POST /api/cloudinary/document
 */
router.post("/document", (req, res, next) => {
  documentUpload.single("document")(req, res, (err) => {
    if (err) {
      console.error("❌ Document upload error:", err.message);
      return res.status(400).json({
        success: false,
        message: err.message || "Failed to upload document",
      });
    }
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "No document received",
      });
    }
    next();
  });
}, async (req, res) => {
  try {
    const { documentType, title } = req.body;

    return res.json({
      success: true,
      message: "Document uploaded successfully",
      data: {
        title: title || req.file.originalname,
        documentType: documentType || "unknown",
        documentUrl: req.file.path,
        publicId: req.file.filename,
        size: req.file.size,
        format: req.file.originalname.split(".").pop(),
        uploadedAt: new Date(),
      },
    });
  } catch (error) {
    console.error("❌ Error processing document upload:", error.message);

    // Clean up on error
    if (req.file && req.file.filename) {
      try {
        await deleteFromCloudinary(req.file.filename, "raw");
      } catch (deleteError) {
        console.error("Warning: Could not clean up file:", deleteError.message);
      }
    }

    return res.status(500).json({
      success: false,
      message: error.message || "Server error during upload",
    });
  }
});

module.exports = router;

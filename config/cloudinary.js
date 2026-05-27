const cloudinary = require("cloudinary").v2;

// Configure Cloudinary with credentials from environment variables
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

/**
 * Upload file to Cloudinary
 * @param {string} filePath - Local file path
 * @param {string} folder - Cloudinary folder name (e.g., 'prescriptions', 'medicines', 'admin')
 * @param {string} resourceType - Type of resource (auto, image, video, raw)
 * @returns {Promise<Object>} Cloudinary upload response
 */
exports.uploadToCloudinary = async (filePath, folder = "uploads", resourceType = "auto") => {
  try {
    console.log(`☁️ Uploading to Cloudinary folder: ${folder}`);

    const result = await cloudinary.uploader.upload(filePath, {
      folder: folder,
      resource_type: resourceType,
      overwrite: false,
      use_filename: true,
      unique_filename: true,
      timeout: 120000, // 2 minute timeout
    });

    console.log(`✅ File uploaded successfully to Cloudinary`);
    console.log(`   Public ID: ${result.public_id}`);
    console.log(`   URL: ${result.secure_url}`);

    return {
      success: true,
      public_id: result.public_id,
      url: result.secure_url,
      originalUrl: result.url,
      cloudinaryId: result.public_id,
      size: result.bytes,
      format: result.format,
      resourceType: result.resource_type,
      mimeType: result.mime_type,
    };
  } catch (error) {
    console.error("❌ Cloudinary upload error:", error.message);
    throw new Error(`Failed to upload file to Cloudinary: ${error.message}`);
  }
};

/**
 * Delete file from Cloudinary
 * @param {string} publicId - Cloudinary public ID of the file
 * @param {string} resourceType - Type of resource (image, video, raw)
 * @returns {Promise<Object>} Cloudinary delete response
 */
exports.deleteFromCloudinary = async (publicId, resourceType = "image") => {
  try {
    if (!publicId) {
      throw new Error("Public ID is required for deletion");
    }

    console.log(`🗑️ Deleting from Cloudinary: ${publicId}`);

    const result = await cloudinary.uploader.destroy(publicId, {
      resource_type: resourceType,
    });

    if (result.result === "ok") {
      console.log(`✅ File deleted successfully from Cloudinary: ${publicId}`);
      return { success: true, publicId };
    } else {
      throw new Error(`Deletion failed with result: ${result.result}`);
    }
  } catch (error) {
    console.error("❌ Cloudinary delete error:", error.message);
    throw new Error(`Failed to delete file from Cloudinary: ${error.message}`);
  }
};

/**
 * Get file information from Cloudinary
 * @param {string} publicId - Cloudinary public ID
 * @returns {Promise<Object>} File information
 */
exports.getCloudinaryFileInfo = async (publicId) => {
  try {
    const result = await cloudinary.api.resource(publicId);
    return {
      success: true,
      publicId: result.public_id,
      url: result.secure_url,
      size: result.bytes,
      format: result.format,
    };
  } catch (error) {
    console.error("❌ Cloudinary info fetch error:", error.message);
    throw new Error(`Failed to get file info from Cloudinary: ${error.message}`);
  }
};

/**
 * Generate secure Cloudinary URL with transformations
 * @param {string} publicId - Cloudinary public ID
 * @param {Object} options - Cloudinary transformation options
 * @returns {string} Secure URL with transformations
 */
exports.generateSecureUrl = (publicId, options = {}) => {
  return cloudinary.url(publicId, {
    secure: true,
    ...options,
  });
};

module.exports = cloudinary;

# Cloudinary Integration Guide

## Overview
This guide explains how to use Cloudinary for image and file storage throughout the RGMedlink application.

## ✅ Completed Setup
- ✅ Cloudinary configuration with environment variables
- ✅ Upload middleware with Cloudinary storage
- ✅ Prescription upload integration
- ✅ Error handling and cleanup
- ✅ Secure URLs and transformations

## 📁 File Structure
```
RGMedlink_Backend/
├── config/
│   └── cloudinary.js              # Cloudinary configuration & utilities
├── middleware/
│   ├── upload.js                  # OLD: Local disk storage (deprecated)
│   └── cloudinaryUpload.js        # NEW: Cloudinary storage
├── routes/
│   └── uploadRoutes.js            # Updated to use Cloudinary
└── controllers/
    └── prescriptionExtractionController.js  # Updated for Cloudinary
```

## 🔧 Usage Examples

### 1. Basic Upload (Prescription)
```javascript
const { prescriptionUpload } = require("../middleware/cloudinaryUpload");

router.post("/extract-medicines", 
  (req, res, next) => {
    prescriptionUpload.single("prescription")(req, res, (err) => {
      if (err) {
        return res.status(400).json({ success: false, message: err.message });
      }
      next();
    });
  },
  extractMedicinesFromPrescription
);
```

### 2. Use Other Pre-configured Uploads
```javascript
const { 
  prescriptionUpload,  // For prescriptions
  medicineUpload,      // For medicine images
  adminUpload,         // For admin panel uploads
  documentUpload       // For general documents
} = require("../middleware/cloudinaryUpload");

// Medicine image upload
router.post("/upload-medicine-image", 
  medicineUpload.single("image"), 
  handleMedicineUpload
);

// Admin file upload
router.post("/admin-upload", 
  adminUpload.single("file"), 
  handleAdminUpload
);
```

### 3. Create Custom Upload Middleware
```javascript
const { createCloudinaryUpload } = require("../middleware/cloudinaryUpload");

// Create for specific folder
const galleryUpload = createCloudinaryUpload("gallery");
const bannersUpload = createCloudinaryUpload("banners");

router.post("/upload-gallery", galleryUpload.single("image"), handler);
router.post("/upload-banner", bannersUpload.single("banner"), handler);
```

### 4. Upload & Get File Info
```javascript
const { uploadToCloudinary, deleteFromCloudinary } = require("../config/cloudinary");
const fs = require("fs");

// Handle multiple file uploads
async function handleBulkUpload(req, res) {
  try {
    const uploadedFiles = [];

    for (const file of req.files) {
      const result = await uploadToCloudinary(
        file.path,
        "bulk-uploads",  // Folder name
        "auto"           // Resource type
      );

      uploadedFiles.push({
        originalName: file.originalname,
        cloudinaryUrl: result.url,
        publicId: result.public_id,
        size: result.size,
      });

      // Delete local temp file
      fs.unlinkSync(file.path);
    }

    return res.json({
      success: true,
      files: uploadedFiles,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
}
```

### 5. Delete File from Cloudinary
```javascript
const { deleteFromCloudinary } = require("../config/cloudinary");

async function deleteUploadedFile(req, res) {
  try {
    const { publicId } = req.body;

    const result = await deleteFromCloudinary(publicId, "image");

    return res.json({
      success: true,
      message: "File deleted successfully",
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
}
```

### 6. Generate Transformed URLs
```javascript
const { generateSecureUrl } = require("../config/cloudinary");

// Create thumbnail
const thumbnail = generateSecureUrl("prescriptions/rx_001", {
  width: 200,
  height: 200,
  crop: "fill",
});

// Optimize for web
const webOptimized = generateSecureUrl("medicines/med_001", {
  quality: "auto",
  fetch_format: "auto",
});

// Add watermark
const watermarked = generateSecureUrl("documents/doc_001", {
  overlay: "cloudinary_logo",
  opacity: 50,
});

console.log(thumbnail);
console.log(webOptimized);
console.log(watermarked);
```

## 📱 Frontend Integration

### React Native App (Medicine Display)
```javascript
// Use Cloudinary URL directly
<Image
  source={{ uri: medicine.imageUrl }} // From Cloudinary
  style={{ width: 200, height: 200 }}
/>

// With fallback
<Image
  source={{
    uri: medicine.imageUrl || 'https://res.cloudinary.com/dddc5vq0h/image/upload/v1234567890/default-medicine.png'
  }}
  style={{ width: 200, height: 200 }}
/>
```

### Admin Panel (Upload & Display)
```javascript
// Upload medicine image
const handleMedicineImageUpload = async (file) => {
  const formData = new FormData();
  formData.append("image", file);

  const response = await fetch("/api/medicines/upload-image", {
    method: "POST",
    body: formData,
  });

  const data = await response.json();
  
  if (data.success) {
    // Save publicId and URL to database
    await updateMedicineImage(medicineId, {
      imageUrl: data.imageUrl,
      publicId: data.publicId,
    });
  }
};

// Display with optimization
<img
  src={`${medicine.imageUrl}?w=300&h=300&fit=fill&q=auto&f=auto`}
  alt={medicine.name}
  style={{ width: 300, height: 300 }}
/>
```

## 🗄️ Database Schema Updates

### Medicine Model
```javascript
// Add these fields to medicine schema
const medicineSchema = new Schema({
  // ... existing fields ...
  
  // Cloudinary image storage
  imageUrl: {
    type: String,
    default: null,
  },
  imagePublicId: {
    type: String,
    default: null, // Store Cloudinary public_id for deletion
  },
  
  // Multiple images support
  images: [{
    url: String,
    publicId: String,
    uploadedAt: { type: Date, default: Date.now },
  }],
});

// Add methods for image management
medicineSchema.methods.deleteImage = async function() {
  if (this.imagePublicId) {
    const { deleteFromCloudinary } = require("../config/cloudinary");
    await deleteFromCloudinary(this.imagePublicId, "image");
    this.imageUrl = null;
    this.imagePublicId = null;
  }
};

medicineSchema.methods.setCloudinaryImage = function(url, publicId) {
  this.imageUrl = url;
  this.imagePublicId = publicId;
};
```

### Prescription Model (if storing prescriptions)
```javascript
const prescriptionSchema = new Schema({
  // ... existing fields ...
  
  // Cloudinary prescription storage
  prescriptionUrl: {
    type: String,
    default: null,
  },
  prescriptionPublicId: {
    type: String,
    default: null,
  },
  
  // Upload metadata
  uploadedAt: { type: Date, default: Date.now },
  uploadedBy: { type: String }, // User ID
});
```

## 🔐 Security Best Practices

1. **API Keys** - Never expose in client-side code
   - Always upload through backend routes
   - Use signed URLs for downloads
   - Implement rate limiting on upload endpoints

2. **File Validation**
   ```javascript
   // Already implemented in middleware
   const allowedMimes = [
     'image/jpeg', 'image/png', 'image/webp',
     'application/pdf',
     'application/vnd.ms-excel',
     'text/csv'
   ];
   ```

3. **Size Limits**
   ```javascript
   limits: { fileSize: 50 * 1024 * 1024 } // 50MB max
   ```

4. **Folder Organization**
   - `/prescriptions` - User prescriptions
   - `/medicines` - Medicine images
   - `/admin` - Admin uploads
   - `/documents` - General documents

## 📊 Monitoring & Cleanup

### Check Cloudinary Usage
```javascript
const cloudinary = require("cloudinary").v2;

async function getStorageStats() {
  const result = await cloudinary.api.usage();
  console.log("Storage used:", result.media_limits.used_bytes);
  console.log("Transformations:", result.transformations);
}
```

### Automated Cleanup (Optional)
```javascript
// Delete old prescriptions (older than 30 days)
const moment = require("moment");
const thirtyDaysAgo = moment().subtract(30, "days").toDate();

const oldPrescriptions = await Prescription.find({
  uploadedAt: { $lt: thirtyDaysAgo }
});

for (const prescription of oldPrescriptions) {
  await deleteFromCloudinary(prescription.prescriptionPublicId, "auto");
  await prescription.deleteOne();
}
```

## ✨ Advanced Features

### 1. Image Optimization
```javascript
// Auto-optimize images
const optimizedUrl = generateSecureUrl(publicId, {
  quality: "auto",      // Optimize quality
  fetch_format: "auto", // Serve best format (WebP, AVIF, etc)
  width: 300,
  crop: "fill",
});
```

### 2. Responsive Images
```javascript
// Different sizes for different devices
const srcSet = `
  ${generateSecureUrl(publicId, { width: 300 })} 300w,
  ${generateSecureUrl(publicId, { width: 600 })} 600w,
  ${generateSecureUrl(publicId, { width: 1200 })} 1200w
`;
```

### 3. Video Support
```javascript
// Upload video (e.g., medicine instructions)
const { createCloudinaryUpload } = require("../middleware/cloudinaryUpload");
const videoUpload = createCloudinaryUpload("medicine-videos");

router.post("/upload-medicine-video", videoUpload.single("video"), handler);
```

## 🐛 Troubleshooting

### Issue: Upload fails with 400 error
**Solution**: Check file format is in allowed list. Valid formats:
- Images: JPEG, PNG, WebP, GIF
- Documents: PDF, Excel, CSV

### Issue: File not visible after upload
**Solution**: Ensure you're using the `secure_url` from response, not `url`

### Issue: Cloudinary quota exceeded
**Solution**: Delete old files or upgrade Cloudinary plan

## 📝 Environment Variables
```env
CLOUDINARY_CLOUD_NAME=dddc5vq0h
CLOUDINARY_API_KEY=116394761469567
CLOUDINARY_API_SECRET=pnoqRlbCwBbzQpKYyHlgPav4UQ0
```

## 🚀 Migration from Local Storage

If you have existing local files:
```javascript
const fs = require("fs");
const path = require("path");
const { uploadToCloudinary } = require("../config/cloudinary");

async function migrateLocalFiles(localDirectory) {
  const files = fs.readdirSync(localDirectory);
  
  for (const file of files) {
    const filePath = path.join(localDirectory, file);
    
    try {
      const result = await uploadToCloudinary(
        filePath,
        "legacy-uploads",
        "auto"
      );
      
      console.log(`✅ Migrated: ${file} -> ${result.url}`);
      
      // Delete local file after successful upload
      fs.unlinkSync(filePath);
    } catch (error) {
      console.error(`❌ Failed to migrate ${file}:`, error.message);
    }
  }
}
```

## 📞 Support
For issues with Cloudinary, visit: https://cloudinary.com/documentation
For API reference: https://cloudinary.com/documentation/image_upload_api_reference

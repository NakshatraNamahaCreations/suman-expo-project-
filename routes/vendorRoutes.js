const express = require("express");
const vendorController = require("../controllers/vendorController");

const router = express.Router();

// Public route for getting active vendors (for dropdowns)
router.get("/active", vendorController.getActiveVendors);

// Protected routes (auth middleware applied in server.js)
router.get("/", vendorController.getAllVendors);
router.get("/:id", vendorController.getVendorById);
router.post("/", vendorController.createVendor);
router.put("/:id", vendorController.updateVendor);
router.delete("/:id", vendorController.deleteVendor);

module.exports = router;

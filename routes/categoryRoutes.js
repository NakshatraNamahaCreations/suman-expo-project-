const router = require("express").Router();
const categoryController = require("../controllers/categoryController");

// Get all categories (with filters)
router.get("/", categoryController.getAllCategories);

// Get single category by ID
router.get("/:id", categoryController.getCategoryById);

// Create new category with image upload
router.post(
  "/",
  categoryController.uploadMiddleware,
  categoryController.createCategory
);

// Update category with optional image
router.put(
  "/:id",
  categoryController.uploadMiddleware,
  categoryController.updateCategory
);

// Delete category
router.delete("/:id", categoryController.deleteCategory);

module.exports = router;

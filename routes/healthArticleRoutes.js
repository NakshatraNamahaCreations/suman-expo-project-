const router = require("express").Router();
const ctrl   = require("../controllers/healthArticleController");
const { createCloudinaryUpload } = require("../middleware/cloudinaryUpload");

const upload = createCloudinaryUpload("health-articles");

router.get("/",     ctrl.getAll);
router.get("/:id",  ctrl.getById);
router.post("/",    upload.single("image"), ctrl.create);
router.put("/:id",  upload.single("image"), ctrl.update);
router.delete("/:id", ctrl.remove);

module.exports = router;

const router = require("express").Router();
const upload = require("../middleware/upload");
const { extractMedicinesFromPrescription } = require("../controllers/prescriptionExtractionController");

router.post("/extract-medicines", upload.single("file"), extractMedicinesFromPrescription);

module.exports = router;

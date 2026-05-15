const router = require("express").Router();
const report = require("../controllers/reportController");

router.get("/sales", report.getSalesSummary);
router.get("/orders", report.getOrdersTrend);
router.get("/revenue", report.getRevenueTrend);
router.get("/inventory", report.getInventoryReport);
router.get("/ca-report", report.getCAReport);

module.exports = router;
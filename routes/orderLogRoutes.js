const express = require("express");
const router  = express.Router();
const OrderLog = require("../models/OrderLog");

/* GET /api/order-logs — all deleted order logs, newest first */
router.get("/", async (req, res) => {
  try {
    const { page = 1, limit = 50 } = req.query;
    const skip = (page - 1) * limit;
    const [logs, total] = await Promise.all([
      OrderLog.find().sort({ deletedAt: -1 }).skip(Number(skip)).limit(Number(limit)).lean(),
      OrderLog.countDocuments(),
    ]);
    res.json({ success: true, data: logs, total });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;

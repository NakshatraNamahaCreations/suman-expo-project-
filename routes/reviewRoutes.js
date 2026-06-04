const express = require("express");
const router  = express.Router();
const Review  = require("../models/CustomerReview");

/* Public — mobile app fetches active reviews */
router.get("/", async (req, res) => {
  try {
    const reviews = await Review.find({ isActive: true }).sort({ createdAt: -1 }).lean();
    res.json({ success: true, data: reviews });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

/* Admin — all reviews (active + inactive) */
router.get("/all", async (req, res) => {
  try {
    const reviews = await Review.find().sort({ createdAt: -1 }).lean();
    res.json({ success: true, data: reviews });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

/* Create */
router.post("/", async (req, res) => {
  try {
    const { customerName, rating, review, isActive } = req.body;
    if (!customerName || !review) return res.status(400).json({ success: false, message: "customerName and review are required" });
    const doc = await Review.create({ customerName, rating: Number(rating) || 5, review, isActive: isActive !== false });
    res.status(201).json({ success: true, data: doc });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

/* Update */
router.put("/:id", async (req, res) => {
  try {
    const { customerName, rating, review, isActive } = req.body;
    const doc = await Review.findByIdAndUpdate(
      req.params.id,
      { customerName, rating: Number(rating) || 5, review, isActive },
      { new: true, runValidators: true }
    );
    if (!doc) return res.status(404).json({ success: false, message: "Review not found" });
    res.json({ success: true, data: doc });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

/* Toggle active */
router.patch("/:id/toggle", async (req, res) => {
  try {
    const doc = await Review.findById(req.params.id);
    if (!doc) return res.status(404).json({ success: false, message: "Review not found" });
    doc.isActive = !doc.isActive;
    await doc.save();
    res.json({ success: true, data: doc });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

/* Delete */
router.delete("/:id", async (req, res) => {
  try {
    const doc = await Review.findByIdAndDelete(req.params.id);
    if (!doc) return res.status(404).json({ success: false, message: "Review not found" });
    res.json({ success: true, message: "Review deleted" });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

module.exports = router;

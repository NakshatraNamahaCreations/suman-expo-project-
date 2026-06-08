const HealthArticle = require("../models/HealthArticle");

/* ── helpers ── */
function paginate(q) {
  const page  = Math.max(1, parseInt(q.page)  || 1);
  const limit = Math.min(Math.max(parseInt(q.limit) || 20, 1), 100);
  return { page, limit, skip: (page - 1) * limit };
}

function parseSections(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  try { return JSON.parse(raw); } catch { return []; }
}

/* GET /api/health-articles
   Public — mobile app and admin panel use this.
   ?status=Active  ?page=1  ?limit=20  */
exports.getAll = async (req, res) => {
  try {
    const { status, search } = req.query;
    const { page, limit, skip } = paginate(req.query);
    const filter = {};
    if (status) filter.status = status;
    if (search) filter.title = { $regex: search, $options: "i" };

    const [articles, total] = await Promise.all([
      HealthArticle.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      HealthArticle.countDocuments(filter),
    ]);
    res.json({ success: true, data: articles, total, page, limit });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

/* GET /api/health-articles/:id  — Public */
exports.getById = async (req, res) => {
  try {
    const article = await HealthArticle.findById(req.params.id).lean();
    if (!article) return res.status(404).json({ success: false, message: "Article not found" });
    res.json({ success: true, data: article });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

/* POST /api/health-articles  — Admin */
exports.create = async (req, res) => {
  try {
    const { title, shortDescription, readingTime, status } = req.body;
    if (!title?.trim())            return res.status(400).json({ success: false, message: "Title is required" });
    if (!shortDescription?.trim()) return res.status(400).json({ success: false, message: "Short description is required" });
    if (!readingTime?.trim())      return res.status(400).json({ success: false, message: "Reading time is required" });

    const sections = parseSections(req.body.sections).filter(s => s.title?.trim() || s.description?.trim());

    const article = await HealthArticle.create({
      title:            title.trim(),
      shortDescription: shortDescription.trim(),
      readingTime:      readingTime.trim(),
      image:            req.file?.path     || "",
      imagePublicId:    req.file?.filename || "",
      sections,
      status:           status || "Active",
    });
    res.status(201).json({ success: true, data: article });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

/* PUT /api/health-articles/:id  — Admin */
exports.update = async (req, res) => {
  try {
    const { title, shortDescription, readingTime, status } = req.body;
    const updates = {};
    if (title            !== undefined) updates.title            = title.trim();
    if (shortDescription !== undefined) updates.shortDescription = shortDescription.trim();
    if (readingTime      !== undefined) updates.readingTime      = readingTime.trim();
    if (status           !== undefined) updates.status           = status;
    if (req.body.sections !== undefined) {
      updates.sections = parseSections(req.body.sections).filter(s => s.title?.trim() || s.description?.trim());
    }
    if (req.file) {
      updates.image         = req.file.path;
      updates.imagePublicId = req.file.filename;
    }

    const article = await HealthArticle.findByIdAndUpdate(req.params.id, updates, { new: true });
    if (!article) return res.status(404).json({ success: false, message: "Article not found" });
    res.json({ success: true, data: article });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

/* DELETE /api/health-articles/:id  — Admin */
exports.remove = async (req, res) => {
  try {
    const article = await HealthArticle.findByIdAndDelete(req.params.id);
    if (!article) return res.status(404).json({ success: false, message: "Article not found" });
    res.json({ success: true, message: "Article deleted" });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

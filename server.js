// require("dotenv").config();

// const express = require("express");
// const cors = require("cors");
// const connectDB = require("./config/db");

// const addressRoutes = require("./routes/addressRoutes");
// const reportRoutes = require("./routes/reportRoutes");
// const otpRoutes = require("./routes/otpRoutes");
// const patientDetailsRoutes = require("./routes/patientDetailsRoutes");

// const medicineRoutes = require("./routes/medicineRoutes");
// const patientRoutes = require("./routes/patientRoutes");
// const prescriptionRoutes = require("./routes/prescriptionRoutes");
// const dashboardRoutes = require("./routes/dashboardRoutes");
// const orderRoutes = require("./routes/orderRoutes");
// const authRoutes = require("./routes/authRoutes");
// const authLoginRoutes = require("./routes/authLoginRoutes");

// const ticketRoutes = require("./routes/ticketRoutes");
// const teamMemberRoutes = require("./routes/teamMemberRoutes");
// const uploadRoutes = require("./routes/uploadRoutes");
// const categoryRoutes = require("./routes/categoryRoutes");


// const helmet = require("helmet");
// const rateLimit = require("express-rate-limit");
// // const mongoSanitize = require("express-mongo-sanitize"); // Incompatible with Express 5
// const { authMiddleware } = require("./middleware/auth");

// connectDB();

// const app = express();

// // Security headers
// app.use(helmet());

// // Rate limiting — 100 requests per minute per IP
// app.use(rateLimit({ windowMs: 60 * 1000, max: 100, validate: false }));

// // CORS
// app.use(
//   cors({
//     origin: [
//       "http://localhost:3000",
//       "http://localhost:5173",
//       "http://localhost:8081",
//       "https://rgmedlinkadminpanel.netlify.app",
//       "https://rgmedlinkadmipanel.netlify.app",
//       "https://adorable-selkie-b5b2c0.netlify.app",
//       "https://bucolic-rolypoly-f7eb39.netlify.app",
//       /\.rgmedlink\.com$/,
//       /\.onrender\.com$/,
//       /\.vercel\.app$/,
//       /localhost/,
//     ],
//     credentials: true,
//     methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
//     allowedHeaders: ["Content-Type", "Authorization"],
//   })
// );

// // Body parsing with size limit
// app.use(express.json({ limit: "50mb" }));
// app.use(express.urlencoded({ extended: true, limit: "50mb" }));

// // Serve static files (uploads)
// app.use("/uploads", express.static("uploads"));

// // Note: express-mongo-sanitize removed — incompatible with Express 5 read-only req.query

// // Health check
// app.get("/health", (req, res) => res.json({ status: "ok", uptime: process.uptime() }));

// // Upload routes (NO auth required for file uploads)
// app.use("/api/upload", uploadRoutes);

// // Auth middleware (applied to all other routes)
// app.use(authMiddleware);

// /* ROUTES */
// app.use("/api/categories", categoryRoutes);
// app.use("/api/medicines", medicineRoutes);
// app.use("/api/patients", patientRoutes);
// app.use("/api/prescriptions", prescriptionRoutes);
// app.use("/api/dashboard", dashboardRoutes);
// app.use("/api/orders", orderRoutes);
// app.use("/api/reports", reportRoutes);
// app.use("/api/address", addressRoutes);
// app.use("/api/patient-details", patientDetailsRoutes);
// app.use("/api/otp", otpRoutes);
// app.use("/api/auth", authRoutes);
// app.use("/api/auth-login", authLoginRoutes);
// app.use("/api/tickets", ticketRoutes);
// app.use("/api/team-members", teamMemberRoutes);

// app.get("/", (req, res) => {
//   res.send("RG Medlink API Running");
// });

// const PORT = process.env.PORT || 5000;

// app.listen(PORT, "0.0.0.0", () => {
//   console.log(`Server running on port ${PORT}`);
// });


require("dotenv").config();

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const path = require("path");

const connectDB = require("./config/db");

const addressRoutes = require("./routes/addressRoutes");
const reportRoutes = require("./routes/reportRoutes");
const otpRoutes = require("./routes/otpRoutes");
const patientDetailsRoutes = require("./routes/patientDetailsRoutes");
const medicineRoutes = require("./routes/medicineRoutes");
const patientRoutes = require("./routes/patientRoutes");
const prescriptionRoutes = require("./routes/prescriptionRoutes");
const dashboardRoutes = require("./routes/dashboardRoutes");
const orderRoutes = require("./routes/orderRoutes");
const authRoutes = require("./routes/authRoutes");
const authLoginRoutes = require("./routes/authLoginRoutes");
const ticketRoutes = require("./routes/ticketRoutes");
const teamMemberRoutes = require("./routes/teamMemberRoutes");
const uploadRoutes = require("./routes/uploadRoutes");
const cloudinaryUploadRoutes = require("./routes/cloudinaryUploadRoutes");
const categoryRoutes = require("./routes/categoryRoutes");
const vendorRoutes = require("./routes/vendorRoutes");
const userPrescriptionRoutes = require("./routes/userPrescriptionRoutes");
const shiprocketRoutes = require("./routes/shiprocket.routes");

const { authMiddleware } = require("./middleware/auth");

connectDB();

const app = express();

// Helmet fix for images
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
  })
);

// Rate limiting
app.use(rateLimit({ windowMs: 60 * 1000, max: 100, validate: false }));

// CORS
app.use(
  cors({
    origin: [
      "http://localhost:3000",
      "http://localhost:5173",
      "http://localhost:8081",
      "https://rgmedlinkadminpanel.netlify.app",
      "https://rgmedlinkadmipanel.netlify.app",
      "https://adorable-selkie-b5b2c0.netlify.app",
      "https://merry-snickerdoodle-fe449f.netlify.app",
      /\.rgmedlink\.com$/,
      /\.onrender\.com$/,
      /\.vercel\.app$/,
      /localhost/,
    ],
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

// Body parsing — store raw body so Razorpay webhook can verify its signature
app.use(express.json({ limit: "50mb", verify: (req, _res, buf) => { req.rawBody = buf.toString(); } }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

// Static upload files
app.use("/uploads", express.static(path.join(process.cwd(), "uploads")));

// Health check
app.get("/health", (req, res) =>
  res.json({ status: "ok", uptime: process.uptime() })
);

// Upload routes without auth
app.use("/api/upload", uploadRoutes);

// Cloudinary upload routes (no auth required for uploads)
app.use("/api/cloudinary", cloudinaryUploadRoutes);

// User prescription file routes (no auth required — mobile users not admin-authed)
app.use("/api/user-prescriptions", userPrescriptionRoutes);

// Shiprocket webhook — no auth (Shiprocket calls this endpoint directly)
app.post("/api/shiprocket/webhook", require("./controllers/shiprocket.controller").webhook);

// Auth middleware for protected routes
app.use(authMiddleware);

// Routes
app.use("/api/vendors", vendorRoutes);
app.use("/api/categories", categoryRoutes);
app.use("/api/medicines", medicineRoutes);
app.use("/api/patients", patientRoutes);
app.use("/api/prescriptions", prescriptionRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/reports", reportRoutes);
app.use("/api/address", addressRoutes);
app.use("/api/patient-details", patientDetailsRoutes);
app.use("/api/otp", otpRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/auth-login", authLoginRoutes);
app.use("/api/tickets", ticketRoutes);
app.use("/api/team-members", teamMemberRoutes);
app.use("/api/shiprocket", shiprocketRoutes);

app.get("/", (req, res) => {
  res.send("RG Medlink API Running");
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on port ${PORT}`);
});
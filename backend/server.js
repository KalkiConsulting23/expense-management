const express = require("express");
const mongoose = require("mongoose");
const dotenv = require("dotenv");
const cors = require("cors");
const { clerkMiddleware, getAuth } = require("@clerk/express");

dotenv.config();

const app = express();

// 1. Explicit CORS configuration to allow Authorization headers and preflight checks
const allowedOrigins = [
  "http://localhost:5173",
  "https://expenses-emc1.onrender.com",
];

app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) callback(null, true);
      else callback(new Error("Not allowed by CORS"));
    },
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  })
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 2. Attach Clerk middleware to populate auth state on requests
app.use(clerkMiddleware());

// 3. Strict authentication check with detailed console output for debugging
const requireAuth = (req, res, next) => {
  const { userId } = getAuth(req);
  if (!userId) {
    console.warn(`[AUTH FAILED] ${req.method} ${req.originalUrl} - No valid Bearer token provided.`);
    return res.status(401).json({
      error: "Unauthorized",
      message: "Missing or invalid Clerk authentication token in Authorization header.",
    });
  }
  req.userId = userId;
  next();
};

// Route imports
const employeeRoutes = require("./routes/employeeRoutes");
const projectRoutes = require("./routes/projectRoute");
const salesRoutes = require("./routes/salesRoute");
const borrowRoutes = require("./routes/borrowRoutes");
const lendingRoutes = require("./routes/lendingRoutes");
const budgetRoutes = require("./routes/budgetRoutes");
const staffRoutes = require("./routes/staffRoutes");
const attendanceRoutes = require("./routes/attendanceRoutes");

// Protected Routes
app.use("/api/employee", requireAuth, employeeRoutes);
app.use("/api/project", requireAuth, projectRoutes);
app.use("/api/sales", requireAuth, salesRoutes);
app.use("/api/borrow", requireAuth, borrowRoutes);
app.use("/api/lending", requireAuth, lendingRoutes);
app.use("/api/budget", requireAuth, budgetRoutes);

/*
  NOTE FOR DEVELOPMENT:
  If you want to temporarily disable auth on Staff & Attendance while testing,
  remove `requireAuth` from the routes below (e.g., `app.use("/api/staff", staffRoutes);`).
*/
app.use("/api/staff", requireAuth, staffRoutes);
app.use("/api/attendance", requireAuth, attendanceRoutes);

// Health Check Endpoint
app.get("/api/health", (req, res) => {
  res.json({ status: "OK", timestamp: new Date() });
});

const PORT = process.env.PORT || 5000;
const MONGO_URI = process.env.MONGO_URI;

mongoose
  .connect(MONGO_URI)
  .then(() => {
    console.log("MongoDB Connected");
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  })
  .catch((err) => {
    console.error("Connection failed:", err.message);
    process.exit(1);
  });
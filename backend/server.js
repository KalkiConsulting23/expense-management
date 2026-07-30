const express = require("express");
const mongoose = require("mongoose");
const dotenv = require("dotenv");
const cors = require("cors");
const { clerkMiddleware, getAuth } = require("@clerk/express");

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Verifies the Clerk session token on every request.
app.use(clerkMiddleware());

// Replaces the deprecated requireAuth(). Blocks any request without a signed-in user.
const requireAuth = (req, res, next) => {
  const { userId } = getAuth(req);
  if (!userId) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
};

const employeeRoutes = require("./routes/employeeRoutes");
const projectRoutes = require("./routes/projectRoute");
const salesRoutes = require("./routes/salesRoute");
const borrowRoutes = require("./routes/borrowRoutes");
const lendingRoutes = require("./routes/lendingRoutes");
const budgetRoutes = require("./routes/budgetRoutes");

// requireAuth blocks any request without a valid signed-in user.
app.use("/api/employee", requireAuth, employeeRoutes);
app.use("/api/project",  requireAuth, projectRoutes);
app.use("/api/sales",    requireAuth, salesRoutes);
app.use("/api/borrow",   requireAuth, borrowRoutes);
app.use("/api/lending",  requireAuth, lendingRoutes);
app.use("/api/budget",   requireAuth, budgetRoutes);

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
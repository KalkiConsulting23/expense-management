const express = require("express");
const mongoose = require("mongoose");
const dotenv = require("dotenv");
const cors = require("cors");

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const employeeRoutes = require("./routes/employeeRoutes");
const projectRoutes = require("./routes/projectRoute");
const salesRoutes = require("./routes/salesRoute");

app.use("/api/employee", employeeRoutes);
app.use("/api/project", projectRoutes);
app.use("/api/sales", salesRoutes);

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
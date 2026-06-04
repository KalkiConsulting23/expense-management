const mongoose = require("mongoose");

const projectSchema = new mongoose.Schema(
  {
    projectName:    { type: String, required: true, trim: true },
    projectType:    { type: String, enum: ["hourly", "daily", "monthly"], required: true },
    expectedAmount: { type: Number, required: true, min: 0 },
    receivedAmount: { type: Number, default: 0, min: 0 },
    currency:       { type: String, enum: ["INR", "USD"], default: "INR" },
    rate:           { type: Number, min: 0 },
    hours:          { type: Number, min: 0 },
    days:           { type: Number, min: 0 },
    // Start & end dates — stored for ALL project types (YYYY-MM-DD)
    startDate:      { type: String, required: true },
    endDate:        { type: String, required: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Project", projectSchema);
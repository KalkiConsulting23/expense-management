const mongoose = require("mongoose");

const budgetSchema = new mongoose.Schema(
  {
    userId:        { type: String, required: true, index: true },
    fyStartYear:   { type: Number, required: true },   // 2025 = FY 2025-26
    month:         { type: String, required: true },   // "Apr" … "Mar"
    year:          { type: Number, required: true },
    homeDeposit:   { type: Number, required: true, default: 0 },
    officeDeposit: { type: Number, required: true, default: 0 },
  },
  { timestamps: true }
);

budgetSchema.index({ userId: 1, fyStartYear: 1, month: 1 }, { unique: true });

module.exports = mongoose.model("Budget", budgetSchema);
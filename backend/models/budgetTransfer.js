const mongoose = require("mongoose");

// One logged transfer between the Home and Office pools for a given FY-month.
const budgetTransferSchema = new mongoose.Schema(
  {
    userId:      { type: String, required: true, index: true },
    fyStartYear: { type: Number, required: true },
    month:       { type: String, required: true },   // "Apr" … "Mar"
    year:        { type: Number, required: true },
    from:        { type: String, enum: ["Home", "Office"], required: true },
    to:          { type: String, enum: ["Home", "Office"], required: true },
    amount:      { type: Number, required: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model("BudgetTransfer", budgetTransferSchema);
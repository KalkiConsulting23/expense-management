const mongoose = require("mongoose");

// One row per Add/Withdraw action on a pool, so the app can show a dated
// history of direct deposits and withdrawals (the Budget doc only keeps
// the running total; this keeps the individual movements).
const budgetLedgerSchema = new mongoose.Schema(
  {
    userId:      { type: String, required: true, index: true },
    fyStartYear: { type: Number, required: true },
    month:       { type: String, required: true },
    year:        { type: Number, required: true },
    pool:        { type: String, enum: ["Home", "Office"], required: true },
    amount:      { type: Number, required: true },   // signed: +add, −withdraw
    date:        { type: Date, default: Date.now },
  },
  { timestamps: true }
);

budgetLedgerSchema.index({ userId: 1, fyStartYear: 1, month: 1, pool: 1 });

module.exports = mongoose.model("BudgetLedger", budgetLedgerSchema);
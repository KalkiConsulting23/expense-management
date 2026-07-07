const mongoose = require("mongoose");

const paymentSchema = new mongoose.Schema({
  year:  { type: Number, required: true },
  month: { type: String, required: true },
  paid:  { type: Number, required: true },
}, { _id: false });

// Stores a mid-year amount change starting from a specific month+year
const amountOverrideSchema = new mongoose.Schema({
  year:   { type: Number, required: true },
  month:  { type: String, required: true }, // "Jan", "Feb", ... "Dec"
  amount: { type: Number, required: true },
}, { _id: false });

const employeeSchema = new mongoose.Schema(
  {
    expenseType: {
      type: String,
      required: [true, "Expense type is required"],
    },
    expenseName: {
      type: String,
      required: [true, "Expense name is required"],
    },
    type: {
      type: String,
      enum: ["recurring", "one-time"],
      required: true,
      default: "recurring",
    },
    amount: {
      type: Number,
      required: true,
    },
    // Array of mid-year amount changes.
    // e.g. [{ year: 2025, month: "Mar", amount: 20000 }]
    // means from Mar 2025 onwards use 20000 instead of base `amount`.
    amountOverrides: {
      type: [amountOverrideSchema],
      default: [],
    },
    // Whether an unpaid monthly balance for this expense should roll into
    // the following month's due amount. Only meaningful for recurring
    // expenses. Defaults to true (existing/legacy behaviour).
    carryForward: {
      type: Boolean,
      default: true,
    },
    startDate: {
      type: Date,
      required: [function () { return this.type === "recurring"; }, "Start date is required"],
    },
    endDate: {
      type: Date,
      default: null,
    },
    payments: {
      type: [paymentSchema],
      default: [],
    },
    date: {
      type: Date,
      required: [function () { return this.type === "one-time"; }, "Date is required"],
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Employee", employeeSchema);
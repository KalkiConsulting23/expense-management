const mongoose = require("mongoose");

// A single contribution toward a month's payment, tagged with its pool.
// Enables one month to be paid partly from Home and partly from Office.
const paymentSplitSchema = new mongoose.Schema({
  paid:   { type: Number, required: true },
  source: { type: String, enum: ["Home", "Office"], default: "Office" },
}, { _id: false });

const paymentSchema = new mongoose.Schema({
  year:   { type: Number, required: true },
  month:  { type: String, required: true },
  // Legacy single-source fields — kept for backward compatibility with
  // records created before split support. New code reads/writes `splits`.
  paid:   { type: Number, default: 0 },
  source: { type: String, enum: ["Home", "Office"], default: "Office" },
  // New: per-pool breakdown. When present, this is the source of truth and
  // the month's total paid = sum of splits[].paid.
  splits: { type: [paymentSplitSchema], default: undefined },
}, { _id: false });

// Stores a mid-year amount change starting from a specific month+year
const amountOverrideSchema = new mongoose.Schema({
  year:   { type: Number, required: true },
  month:  { type: String, required: true }, // "Jan", "Feb", ... "Dec"
  amount: { type: Number, required: true },
}, { _id: false });

const employeeSchema = new mongoose.Schema(
  {
    userId: {
      type: String,
      required: true,
      index: true,
    },
    expenseType: {
      type: String,
      required: [true, "Expense type is required"],
    },
    expenseName: {
      type: String,
      required: [true, "Expense name is required"],
    },
    category: {
      type: String,
      enum: ["Home", "Office"],
      default: "Office",
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
    amountOverrides: {
      type: [amountOverrideSchema],
      default: [],
    },
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
    otPaid: {
      type: Boolean,
      default: false,
    },
    otSource: {
      type: String,
      enum: ["Home", "Office"],
      default: "Office",
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Employee", employeeSchema);
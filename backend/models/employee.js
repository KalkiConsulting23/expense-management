const mongoose = require("mongoose");

const paymentSchema = new mongoose.Schema({
  year:  { type: Number, required: true },
  month: { type: String, required: true },
  paid:  { type: Number, required: true },
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
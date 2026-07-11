const mongoose = require('mongoose')

// One payment entry per calendar month/year for a borrow record.
// Tracks principal and interest paid separately.
const paymentSchema = new mongoose.Schema(
  {
    year: { type: Number, required: true },        // calendar year, e.g. 2026
    month: { type: String, required: true },       // 'Jan' … 'Dec'
    principalPaid: { type: Number, default: 0 },   // principal repaid this month
    interestPaid: { type: Number, default: 0 },    // interest repaid this month
  },
  { _id: false }
)

const borrowSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    // Interest is percent PER MONTH
    rateOfInterest: {
      type: Number,
      required: true,
      min: 0,
    },
    tenure: {
      type: Number,
      required: true,
      min: 0,
    },
    date: {
      type: Date,
      required: true,
    },
    // Every borrowing now works the same way:
    //   monthly principal due = amount / tenure
    //   monthly interest due   = amount * rate%
    // Per-month paid amounts (drive carry-forward for principal & interest).
    payments: {
      type: [paymentSchema],
      default: [],
    },
  },
  { timestamps: true }
)

module.exports = mongoose.model('Borrow', borrowSchema)
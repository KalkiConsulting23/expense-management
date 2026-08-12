const mongoose = require('mongoose')

// A company-wide holiday ("leave for all"). One document per calendar date.
// Applied to every staff member at display time, so marking a holiday does
// not touch individual attendance records.
const holidaySchema = new mongoose.Schema(
  {
    userId: {
      type: String,
      required: true,
      index: true,
    },
    year: {
      type: Number,
      required: true, // calendar year
    },
    month: {
      type: Number,
      required: true, // 0 = Jan … 11 = Dec
    },
    day: {
      type: Number,
      required: true, // 1–31
    },
    label: {
      type: String,
      trim: true,
      default: 'Holiday',
    },
  },
  { timestamps: true }
)

// One holiday entry per date per user.
holidaySchema.index({ userId: 1, year: 1, month: 1, day: 1 }, { unique: true })

module.exports = mongoose.model('Holiday', holidaySchema)
const mongoose = require('mongoose')

// One document per staff member per (year, month).
// `days` is a Map of dayNumber (1–31 as string) → status:
//   1   = present
//   0   = absent
//   0.5 = half day
// Weekends (Sat/Sun) and company holidays are NOT stored here — they are
// derived at display time (weekends from the calendar, holidays from the
// separate Holiday collection).
const attendanceSchema = new mongoose.Schema(
  {
    userId: {
      type: String,
      required: true,
      index: true,
    },
    staffId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Staff',
      required: true,
      index: true,
    },
    year: {
      type: Number,
      required: true, // calendar year, e.g. 2026
    },
    month: {
      type: Number,
      required: true, // 0 = Jan … 11 = Dec
    },
    // dayNumber (string) → 1 | 0 | 0.5
    days: {
      type: Map,
      of: Number,
      default: {},
    },
  },
  { timestamps: true }
)

// One attendance sheet per staff member per month per user.
attendanceSchema.index({ userId: 1, staffId: 1, year: 1, month: 1 }, { unique: true })

module.exports = mongoose.model('Attendance', attendanceSchema)
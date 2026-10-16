const mongoose = require('mongoose')

// Allowed day statuses:
//   1   = present (in office)
//   2   = work from home (full day, counts as 1 payable day)
//   0.5 = half day
//   0   = absent
const ATTENDANCE_STATUSES = [1, 2, 0.5, 0]

// One document per staff member per (year, month).
// `days` is a Map of dayNumber (1–31 as string) → status (see above).
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
    // dayNumber (string) → 1 | 2 | 0.5 | 0
    days: {
      type: Map,
      of: {
        type: Number,
        enum: ATTENDANCE_STATUSES,
      },
      default: {},
    },
  },
  { timestamps: true }
)

// One attendance sheet per staff member per month per user.
attendanceSchema.index({ userId: 1, staffId: 1, year: 1, month: 1 }, { unique: true })

const Attendance = mongoose.model('Attendance', attendanceSchema)

module.exports = Attendance
module.exports.ATTENDANCE_STATUSES = ATTENDANCE_STATUSES
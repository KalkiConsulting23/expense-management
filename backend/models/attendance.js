const mongoose = require('mongoose')

// Allowed day statuses (stored as plain words):
//   'present' = in office            (1 payable day)
//   'wfh'     = work from home        (1 payable day)
//   'halfday' = half day              (0.5 payable day)
//   'leave'   = on leave
//   'absent'  = absent                (0)
const ATTENDANCE_STATUSES = ['present', 'absent', 'wfh', 'leave', 'halfday']

const ATTENDANCE_LABELS = {
  present: 'Present',
  absent: 'Absent',
  wfh: 'Work From Home',
  leave: 'Leave',
  halfday: 'Half Day',
}

// Older records stored numbers. These map them to the new words.
const LEGACY_STATUS_MAP = {
  1: 'present',
  2: 'wfh',
  0.5: 'halfday',
  0: 'absent',
  3: 'leave',
}

// Turns any stored/incoming value (old number, "1", "Present", "WFH" …) into
// one of ATTENDANCE_STATUSES, or null if it is not a valid status.
const normalizeStatus = (value) => {
  if (value === null || value === undefined || value === '') return null
  if (typeof value === 'string') {
    const word = value.trim().toLowerCase().replace(/[\s_-]+/g, '')
    if (ATTENDANCE_STATUSES.includes(word)) return word
    if (word === 'workfromhome') return 'wfh'
    if (word === 'half') return 'halfday'
    const asNumber = Number(value)
    if (!Number.isNaN(asNumber) && LEGACY_STATUS_MAP[asNumber]) return LEGACY_STATUS_MAP[asNumber]
    return null
  }
  if (typeof value === 'number') return LEGACY_STATUS_MAP[value] || null
  return null
}

// One document per staff member per (year, month).
// `days` is a Map of dayNumber (1–31 as string) → status word (see above).
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
    // dayNumber (string) → 'present' | 'absent' | 'wfh' | 'leave' | 'halfday'
    days: {
      type: Map,
      of: {
        type: String,
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
module.exports.ATTENDANCE_LABELS = ATTENDANCE_LABELS
module.exports.LEGACY_STATUS_MAP = LEGACY_STATUS_MAP
module.exports.normalizeStatus = normalizeStatus
const mongoose = require('mongoose')

// Project attendance is kept separate from office attendance, so the office
// sheet (models/attendance.js) and its data stay exactly as they are.
//
// Statuses for a project day:
//   'present' = logged in on time
//   'late'    = logged in after the project's login time (within the late window)
//   'absent'  = absent from the project
//   'leave'   = on leave
//   'halfday' = half day
const PROJECT_STATUSES = ['present', 'late', 'absent', 'leave', 'halfday']

// Staff can log in from this many minutes BEFORE the project's login time
const EARLY_OPEN_MINUTES = 60

// One project day: the status and, when the staff member logged in themselves, the time
const projectDaySchema = new mongoose.Schema(
  {
    status: { type: String, enum: PROJECT_STATUSES, required: true },
    at: { type: Date, default: null },                       // actual login time
    by: { type: String, enum: ['employee', 'admin'], default: 'admin' },
  },
  { _id: false }
)

// One document per staff member per project per (year, month).
const projectAttendanceSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true, index: true }, // the admin who owns the data
    staffId: { type: mongoose.Schema.Types.ObjectId, ref: 'Staff', required: true, index: true },
    projectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', required: true, index: true },
    year: { type: Number, required: true },
    month: { type: Number, required: true }, // 0 = Jan … 11 = Dec
    // dayNumber (string) → { status, at, by }
    days: { type: Map, of: projectDaySchema, default: {} },
  },
  { timestamps: true }
)

projectAttendanceSchema.index(
  { userId: 1, staffId: 1, projectId: 1, year: 1, month: 1 },
  { unique: true }
)

// ─── Login-time helpers ───

// "09:30" → 570 (minutes after midnight), or null if empty/invalid
const timeToMinutes = (hhmm) => {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(String(hhmm || '').trim())
  return m ? Number(m[1]) * 60 + Number(m[2]) : null
}

// 570 → "09:30"
const minutesToTime = (mins) => {
  const m = Math.max(0, Math.min(24 * 60 - 1, Math.round(mins)))
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
}

// Where are we in today's login window for a project?
//   'notOpen' → too early          'onTime' → up to the login time (Present)
//   'late'    → within the window (Late)    'closed' → too late to log in
//   'noTime'  → the project has no login time set
// A late window of 0 means "no late marking": staff can log in any time
// that day and are always marked Present (anyTime: true).
const loginWindow = (project, nowMinutes) => {
  const start = timeToMinutes(project.loginTime)
  if (start === null) return { state: 'noTime' }
  const raw = project.lateWindowMinutes
  const lateWindow = raw === null || raw === undefined || raw === '' || !Number.isFinite(Number(raw)) ? 30 : Number(raw)
  if (lateWindow === 0) {
    return {
      state: 'onTime',
      anyTime: true,
      opensAt: '00:00',
      loginTime: minutesToTime(start),
      closesAt: '23:59',
      lateWindowMinutes: 0,
    }
  }
  const opens = Math.max(0, start - EARLY_OPEN_MINUTES)
  const closes = start + lateWindow
  let state
  if (nowMinutes < opens) state = 'notOpen'
  else if (nowMinutes <= start) state = 'onTime'
  else if (nowMinutes <= closes) state = 'late'
  else state = 'closed'
  return {
    state,
    anyTime: false,
    opensAt: minutesToTime(opens),
    loginTime: minutesToTime(start),
    closesAt: minutesToTime(closes),
    lateWindowMinutes: lateWindow,
  }
}

// Plain object { day: { status, at, by } } from a stored days Map
const projectDaysToObject = (days) => {
  const out = {}
  const entries = days instanceof Map ? days.entries() : Object.entries(days || {})
  for (const [day, value] of entries) {
    if (!value) continue
    const v = typeof value.toObject === 'function' ? value.toObject() : value
    if (PROJECT_STATUSES.includes(v.status)) {
      out[day] = { status: v.status, at: v.at || null, by: v.by || 'admin' }
    }
  }
  return out
}

const ProjectAttendance = mongoose.model('ProjectAttendance', projectAttendanceSchema)

module.exports = ProjectAttendance
module.exports.PROJECT_STATUSES = PROJECT_STATUSES
module.exports.EARLY_OPEN_MINUTES = EARLY_OPEN_MINUTES
module.exports.timeToMinutes = timeToMinutes
module.exports.minutesToTime = minutesToTime
module.exports.loginWindow = loginWindow
module.exports.projectDaysToObject = projectDaysToObject
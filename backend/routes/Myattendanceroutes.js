const express = require('express')
const router = express.Router()
const Attendance = require('../models/attendance')
const Holiday = require('../models/holiday')
const { normalizeStatus } = require('../models/attendance')
const { resolveRole } = require('../middleware/role')

// ─── Rules for employees ───
// Statuses an employee may mark for themselves
const EMPLOYEE_STATUSES = ['present', 'halfday', 'wfh']

// 'today' = employees can only mark today
// 'month' = employees can mark any day of the current month up to today
const EMPLOYEE_CAN_MARK = 'today'

// Statuses set by the admin that an employee may NOT change
const ADMIN_LOCKED_STATUSES = ['leave', 'absent']

const TIME_ZONE = 'Asia/Kolkata'

// Today's date in India (the server may run in UTC)
const todayParts = () => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date())
  const get = (type) => Number(parts.find(p => p.type === type).value)
  return { year: get('year'), month: get('month') - 1, day: get('day') } // month: 0 = Jan
}

const isWeekend = (year, month, day) => {
  const wd = new Date(Date.UTC(year, month, day)).getUTCDay()
  return wd === 0 || wd === 6
}

const daysToObject = (days) => {
  const out = {}
  const entries = days instanceof Map ? days.entries() : Object.entries(days || {})
  for (const [day, value] of entries) {
    const status = normalizeStatus(value)
    if (status) out[day] = status
  }
  return out
}

const staffSummary = (staff) => ({
  id: staff._id,
  firstName: staff.firstName,
  lastName: staff.lastName,
  employeeId: staff.employeeId,
  designation: staff.designation,
})

// Only signed-in employees can use the /my-attendance routes
const employeeOnly = (req, res, next) => {
  if (req.role === 'employee' && req.staff) return next()
  return res.status(403).json({ error: 'This page is only for staff members' })
}

// ─── GET /me — which view should the frontend show? ───
router.get('/me', resolveRole, (req, res) => {
  res.json({
    role: req.role, // 'admin' | 'employee'
    email: req.authEmail,
    staff: req.staff ? staffSummary(req.staff) : null,
    rules: req.role === 'employee'
      ? { statuses: EMPLOYEE_STATUSES, canMark: EMPLOYEE_CAN_MARK, today: todayParts() }
      : null,
  })
})

// ─── GET /my-attendance?year=&month= — the employee's own month ───
router.get('/my-attendance', resolveRole, employeeOnly, async (req, res) => {
  try {
    const today = todayParts()
    const year = req.query.year !== undefined ? Number(req.query.year) : today.year
    const month = req.query.month !== undefined ? Number(req.query.month) : today.month
    if (isNaN(year) || isNaN(month)) return res.status(400).json({ error: 'Invalid year or month' })

    const ownerId = req.staff.userId // data belongs to the admin who added this staff member
    const [record, holidays] = await Promise.all([
      Attendance.findOne({ userId: ownerId, staffId: req.staff._id, year, month }),
      Holiday.find({ userId: ownerId, year, month }),
    ])

    res.json({
      staff: staffSummary(req.staff),
      year,
      month,
      days: record ? daysToObject(record.days) : {},
      holidays: holidays.map(h => ({ day: h.day, label: h.label })),
      rules: { statuses: EMPLOYEE_STATUSES, canMark: EMPLOYEE_CAN_MARK, lockedStatuses: ADMIN_LOCKED_STATUSES, today },
    })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ─── PATCH /my-attendance/mark — employee marks their own day ───
// Body: { day, status }   status ∈ 'present' | 'halfday' | 'wfh'   (null clears it)
// Year and month are always the current month (India time).
router.patch('/my-attendance/mark', resolveRole, employeeOnly, async (req, res) => {
  try {
    const today = todayParts()
    const year = today.year
    const month = today.month
    const day = req.body.day !== undefined ? Number(req.body.day) : today.day
    const { status } = req.body

    if (!Number.isInteger(day) || day < 1 || day > 31) {
      return res.status(400).json({ error: 'Invalid day' })
    }
    if (EMPLOYEE_CAN_MARK === 'today' && day !== today.day) {
      return res.status(403).json({ error: 'You can only mark attendance for today' })
    }
    if (EMPLOYEE_CAN_MARK === 'month' && day > today.day) {
      return res.status(403).json({ error: 'You cannot mark attendance for a future date' })
    }
    if (isWeekend(year, month, day)) {
      return res.status(400).json({ error: 'This day is a weekend' })
    }

    const clearing = status === null || status === undefined || status === ''
    const next = clearing ? null : normalizeStatus(status)
    if (!clearing && !EMPLOYEE_STATUSES.includes(next)) {
      return res.status(403).json({ error: 'You can only mark Present, Half Day or WFH' })
    }

    const ownerId = req.staff.userId
    const isHoliday = await Holiday.exists({ userId: ownerId, year, month, day })
    if (isHoliday) return res.status(400).json({ error: 'This day is a holiday' })

    const record = await Attendance.findOne({ userId: ownerId, staffId: req.staff._id, year, month })
      || new Attendance({ userId: ownerId, staffId: req.staff._id, year, month, days: {} })

    const current = daysToObject(record.days)
    if (ADMIN_LOCKED_STATUSES.includes(current[String(day)])) {
      return res.status(403).json({ error: 'This day was set by your admin and cannot be changed' })
    }

    if (next === null) delete current[String(day)]
    else current[String(day)] = next
    record.days = new Map(Object.entries(current))

    const saved = await record.save()
    res.json({ year, month, day, status: next, days: daysToObject(saved.days) })
  } catch (err) {
    res.status(400).json({ error: err.message })
  }
})

module.exports = router
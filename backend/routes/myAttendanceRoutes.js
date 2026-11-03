const express = require('express')
const router = express.Router()
const Attendance = require('../models/attendance')
const Holiday = require('../models/holiday')
const { normalizeStatus } = require('../models/attendance')
const Project = require('../models/project')
const ProjectAttendance = require('../models/projectAttendance')
const { loginWindow, projectDaysToObject } = require('../models/projectAttendance')
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

// Current time in India: date parts, "YYYY-MM-DD" and minutes after midnight
const nowInIndia = () => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date())
  const get = (type) => parts.find(p => p.type === type).value
  const year = Number(get('year')), month = Number(get('month')) - 1, day = Number(get('day'))
  const hour = Number(get('hour')) % 24, minute = Number(get('minute'))
  return {
    year, month, day,
    dateStr: `${get('year')}-${get('month')}-${get('day')}`,
    minutes: hour * 60 + minute,
    time: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`,
  }
}

// Project dates are saved as calendar dates (UTC midnight) → "YYYY-MM-DD"
const dateOnly = (d) => (d ? new Date(d).toISOString().slice(0, 10) : '')

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

// ─────────────────────────────────────────────────────────────
//  PROJECT LOGINS
//  A staff member on a project logs in once a day for that project.
//  Up to the project's login time → Present. Within the late window after it → Late.
//  After that the login is closed for the day (the admin can still mark it).
// ─────────────────────────────────────────────────────────────

// The staff member's projects running today, with today's login state for each
const projectsToday = async (staff, now) => {
  const ownerId = staff.userId
  const projects = await Project.find({ userId: ownerId, assignedStaff: staff._id })
    .select('projectName loginTime lateWindowMinutes startDate endDate')
  const running = projects.filter(p =>
    (!p.startDate || dateOnly(p.startDate) <= now.dateStr) &&
    (!p.endDate || dateOnly(p.endDate) >= now.dateStr)
  )
  if (running.length === 0) return []

  const sheets = await ProjectAttendance.find({
    userId: ownerId, staffId: staff._id, year: now.year, month: now.month,
    projectId: { $in: running.map(p => p._id) },
  })
  const todayByProject = {}
  sheets.forEach(sh => {
    todayByProject[String(sh.projectId)] = projectDaysToObject(sh.days)[String(now.day)] || null
  })

  return running
    .map(p => ({
      projectId: p._id,
      projectName: p.projectName,
      window: loginWindow(p, now.minutes),
      today: todayByProject[String(p._id)] || null, // { status, at, by } or null
    }))
    .sort((a, b) => String(a.window.loginTime || '99').localeCompare(String(b.window.loginTime || '99')))
}

// Why the staff member can't log in to projects today (or null if they can)
const dayBlockReason = async (staff, now) => {
  if (isWeekend(now.year, now.month, now.day)) return 'Today is a weekend.'
  const ownerId = staff.userId
  const [isHoliday, office] = await Promise.all([
    Holiday.exists({ userId: ownerId, year: now.year, month: now.month, day: now.day }),
    Attendance.findOne({ userId: ownerId, staffId: staff._id, year: now.year, month: now.month }),
  ])
  if (isHoliday) return 'Today is a company holiday.'
  const officeToday = office ? daysToObject(office.days)[String(now.day)] : null
  if (ADMIN_LOCKED_STATUSES.includes(officeToday)) {
    return `Your admin has marked you as ${officeToday === 'leave' ? 'on Leave' : 'Absent'} today.`
  }
  return null
}

// ─── GET /my-projects/today — projects to log in to today ───
router.get('/my-projects/today', resolveRole, employeeOnly, async (req, res) => {
  try {
    const now = nowInIndia()
    const [projects, blocked] = await Promise.all([
      projectsToday(req.staff, now),
      dayBlockReason(req.staff, now),
    ])
    res.json({
      now: { year: now.year, month: now.month, day: now.day, time: now.time, minutes: now.minutes },
      blocked, // a message, or null
      projects,
    })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ─── PATCH /my-projects/login — log in to a project for today ───
// Body: { projectId }. The server decides Present or Late from the current India time.
router.patch('/my-projects/login', resolveRole, employeeOnly, async (req, res) => {
  try {
    const { projectId } = req.body
    if (!/^[0-9a-fA-F]{24}$/.test(String(projectId || ''))) {
      return res.status(400).json({ error: 'Invalid project' })
    }
    const now = nowInIndia()
    const staff = req.staff
    const ownerId = staff.userId

    const project = await Project.findOne({ _id: projectId, userId: ownerId, assignedStaff: staff._id })
    if (!project) return res.status(403).json({ error: 'You are not assigned to this project' })
    if ((project.startDate && dateOnly(project.startDate) > now.dateStr) ||
        (project.endDate && dateOnly(project.endDate) < now.dateStr)) {
      return res.status(400).json({ error: 'This project is not running today' })
    }

    const blocked = await dayBlockReason(staff, now)
    if (blocked) return res.status(400).json({ error: blocked })

    const win = loginWindow(project, now.minutes)
    if (win.state === 'noTime') return res.status(400).json({ error: 'This project has no login time set. Contact your admin.' })
    if (win.state === 'notOpen') return res.status(403).json({ error: `Login opens at ${win.opensAt}` })
    if (win.state === 'closed') {
      return res.status(403).json({ error: `Login closed at ${win.closesAt}. Contact your admin.` })
    }
    const status = win.state === 'onTime' ? 'present' : 'late'

    const filter = { userId: ownerId, staffId: staff._id, projectId: project._id, year: now.year, month: now.month }
    const path = `days.${now.day}`
    const existing = await ProjectAttendance.findOne(filter)
    if (existing && existing.days && existing.days.get(String(now.day))) {
      return res.status(409).json({ error: 'You have already been marked for this project today' })
    }

    const saved = await ProjectAttendance.findOneAndUpdate(
      filter,
      { $set: { [path]: { status, at: new Date(), by: 'employee' } } },
      { new: true, upsert: true, setDefaultsOnInsert: true, runValidators: true }
    )
    res.json({
      projectId: project._id,
      today: projectDaysToObject(saved.days)[String(now.day)],
      status,
    })
  } catch (err) {
    if (err && err.code === 11000) {
      return res.status(409).json({ error: 'You have already been marked for this project today' })
    }
    res.status(400).json({ error: err.message })
  }
})

module.exports = router
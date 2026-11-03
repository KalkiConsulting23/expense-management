const express = require('express')
const router = express.Router()
const Attendance = require('../models/attendance')
const Holiday = require('../models/holiday')
const Project = require('../models/project')
const ProjectAttendance = require('../models/projectAttendance')
const { PROJECT_STATUSES, projectDaysToObject } = require('../models/projectAttendance')
const { getAuth } = require('@clerk/express')
const { ATTENDANCE_STATUSES, normalizeStatus } = require('../models/attendance')

const isValidId = (id) => /^[0-9a-fA-F]{24}$/.test(id)

// Plain object of days with every value converted to a status word
// (old numeric records are converted on the fly).
const normalizedDays = (days) => {
  const out = {}
  const entries = days instanceof Map ? days.entries() : Object.entries(days || {})
  for (const [day, value] of entries) {
    const status = normalizeStatus(value)
    if (status) out[day] = status
  }
  return out
}

const toClient = (doc) => {
  const obj = doc.toObject ? doc.toObject({ flattenMaps: true }) : { ...doc }
  return { ...obj, days: normalizedDays(doc.days) }
}

// Project attendance doc → { _id, staffId, projectId, year, month, days: { day: { status, at, by } } }
const projectToClient = (doc) => ({
  _id: doc._id,
  staffId: doc.staffId,
  projectId: doc.projectId,
  year: doc.year,
  month: doc.month,
  days: projectDaysToObject(doc.days),
})

// Projects running during the given month. The frontend shows a project row for
// each assigned staff member (and for anyone who still has attendance on it).
const projectsForMonth = (userId, year, month) => {
  const monthStart = new Date(Date.UTC(year, month, 1))
  const monthEnd = new Date(Date.UTC(year, month + 1, 0, 23, 59, 59))
  return Project.find({
    userId,
    startDate: { $lte: monthEnd },
    endDate: { $gte: monthStart },
  }).select('projectName loginTime lateWindowMinutes assignedStaff startDate endDate')
}

// ─── GET attendance for a whole month (all staff) ───
// Returns { attendance, holidays, projects, projectAttendance } for the given year/month.
//   projects          → projects with assigned staff active in this month
//   projectAttendance → project sheets ({ staffId, projectId, days: { day: { status, at, by } } })
router.get('/month', async (req, res) => {
  try {
    const { userId } = getAuth(req)
    const year = Number(req.query.year)
    const month = Number(req.query.month)
    if (isNaN(year) || isNaN(month)) {
      return res.status(400).json({ error: 'year and month are required' })
    }

    const [attendance, holidays, projects, projectAttendance] = await Promise.all([
      Attendance.find({ userId, year, month }),
      Holiday.find({ userId, year, month }),
      projectsForMonth(userId, year, month),
      ProjectAttendance.find({ userId, year, month }),
    ])
    res.json({
      attendance: attendance.map(toClient),
      holidays,
      projects,
      projectAttendance: projectAttendance.map(projectToClient),
    })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ─── SET one day's status for one staff member (upsert) ───
// Body: { staffId, year, month, day, status }
//   status ∈ 'present' | 'absent' | 'wfh' | 'leave' | 'halfday'
//   status === null clears that day.
router.patch('/mark', async (req, res) => {
  try {
    const { userId } = getAuth(req)
    const { staffId, year, month, day, status } = req.body
    const y = Number(year), m = Number(month), d = Number(day)

    if (!isValidId(staffId)) return res.status(400).json({ error: 'Invalid staffId' })
    if (isNaN(y) || isNaN(m) || isNaN(d)) {
      return res.status(400).json({ error: 'year, month and day are required' })
    }
    const clearing = status === null || status === undefined || status === ''
    const nextStatus = clearing ? null : normalizeStatus(status)
    if (!clearing && !nextStatus) {
      return res.status(400).json({ error: `status must be one of: ${ATTENDANCE_STATUSES.join(', ')}` })
    }

    const record = await Attendance.findOne({ userId, staffId, year: y, month: m })
      || new Attendance({ userId, staffId, year: y, month: m, days: {} })

    // Convert any old numeric values in this sheet so the whole document saves cleanly
    const current = normalizedDays(record.days)
    record.days = new Map(Object.entries(current))

    if (clearing) record.days.delete(String(d))
    else record.days.set(String(d), nextStatus)

    const saved = await record.save()
    res.json(toClient(saved))
  } catch (err) {
    res.status(400).json({ error: err.message })
  }
})

// ─── SET one project day for one staff member (admin) ───
// Body: { staffId, projectId, year, month, day, status }
//   status ∈ 'present' | 'late' | 'absent' | 'leave' | 'halfday'
//   status === null clears that day.
router.patch('/project-mark', async (req, res) => {
  try {
    const { userId } = getAuth(req)
    const { staffId, projectId, year, month, day, status } = req.body
    const y = Number(year), m = Number(month), d = Number(day)

    if (!isValidId(staffId)) return res.status(400).json({ error: 'Invalid staffId' })
    if (!isValidId(projectId)) return res.status(400).json({ error: 'Invalid projectId' })
    if (isNaN(y) || isNaN(m) || !Number.isInteger(d) || d < 1 || d > 31) {
      return res.status(400).json({ error: 'year, month and day are required' })
    }
    const clearing = status === null || status === undefined || status === ''
    if (!clearing && !PROJECT_STATUSES.includes(status)) {
      return res.status(400).json({ error: `status must be one of: ${PROJECT_STATUSES.join(', ')}` })
    }

    const project = await Project.exists({ _id: projectId, userId })
    if (!project) return res.status(404).json({ error: 'Project not found' })

    const filter = { userId, staffId, projectId, year: y, month: m }
    const path = `days.${d}`
    let saved
    if (clearing) {
      saved = await ProjectAttendance.findOneAndUpdate(filter, { $unset: { [path]: '' } }, { new: true })
    } else {
      // Keep the staff member's own login time if the admin only changes the status
      const existing = await ProjectAttendance.findOne(filter).select(path)
      const prev = existing && existing.days && existing.days.get(String(d))
      const at = prev && prev.at && ['present', 'late'].includes(status) ? prev.at : null
      saved = await ProjectAttendance.findOneAndUpdate(
        filter,
        { $set: { [path]: { status, at, by: 'admin' } } },
        { new: true, upsert: true, setDefaultsOnInsert: true, runValidators: true }
      )
    }
    res.json(saved ? projectToClient(saved) : { ...filter, days: {} })
  } catch (err) {
    res.status(400).json({ error: err.message })
  }
})

// ─── ADD a company-wide holiday for one date ───
// Body: { year, month, day, label? }
router.post('/holiday', async (req, res) => {
  try {
    const { userId } = getAuth(req)
    const { year, month, day, label } = req.body
    const y = Number(year), m = Number(month), d = Number(day)
    if (isNaN(y) || isNaN(m) || isNaN(d)) {
      return res.status(400).json({ error: 'year, month and day are required' })
    }

    const holiday = await Holiday.findOneAndUpdate(
      { userId, year: y, month: m, day: d },
      { $set: { label: (label || 'Holiday').trim() } },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    )
    res.status(201).json(holiday)
  } catch (err) {
    res.status(400).json({ error: err.message })
  }
})

// ─── REMOVE a company-wide holiday for one date ───
// Body: { year, month, day }
router.delete('/holiday', async (req, res) => {
  try {
    const { userId } = getAuth(req)
    const { year, month, day } = req.body
    const y = Number(year), m = Number(month), d = Number(day)
    if (isNaN(y) || isNaN(m) || isNaN(d)) {
      return res.status(400).json({ error: 'year, month and day are required' })
    }

    const deleted = await Holiday.findOneAndDelete({ userId, year: y, month: m, day: d })
    if (!deleted) return res.status(404).json({ error: 'Holiday not found' })
    res.json({ message: 'Holiday removed', year: y, month: m, day: d })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

module.exports = router
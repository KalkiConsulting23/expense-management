const express = require('express')
const router = express.Router()
const Attendance = require('../models/attendance')
const Holiday = require('../models/holiday')
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

// ─── GET attendance for a whole month (all staff) ───
// Returns { attendance: [...], holidays: [...] } for the given year/month.
router.get('/month', async (req, res) => {
  try {
    const { userId } = getAuth(req)
    const year = Number(req.query.year)
    const month = Number(req.query.month)
    if (isNaN(year) || isNaN(month)) {
      return res.status(400).json({ error: 'year and month are required' })
    }

    const [attendance, holidays] = await Promise.all([
      Attendance.find({ userId, year, month }),
      Holiday.find({ userId, year, month }),
    ])
    res.json({ attendance: attendance.map(toClient), holidays })
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
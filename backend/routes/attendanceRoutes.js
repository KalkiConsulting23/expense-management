const express = require('express')
const router = express.Router()
const Attendance = require('../models/attendance')
const Holiday = require('../models/holiday')
const { getAuth } = require('@clerk/express')

const isValidId = (id) => /^[0-9a-fA-F]{24}$/.test(id)
const validStatus = (v) => v === 0 || v === 1 || v === 0.5

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
    res.json({ attendance, holidays })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ─── SET one day's status for one staff member (upsert) ───
// Body: { staffId, year, month, day, status }  status ∈ {0, 0.5, 1}
// status === null clears that day.
router.patch('/mark', async (req, res) => {
  try {
    const { userId } = getAuth(req)
    const { staffId, year, month, day, status } = req.body
    const y = Number(year), m = Number(month), d = Number(day)

    if (!isValidId(staffId)) return res.status(400).json({ error: 'Invalid staffId' })
    if (isNaN(y) || isNaN(m) || isNaN(d)) {
      return res.status(400).json({ error: 'year, month and day are required' })
    }
    const clearing = status === null || status === undefined
    if (!clearing && !validStatus(Number(status))) {
      return res.status(400).json({ error: 'status must be 0, 0.5 or 1' })
    }

    const record = await Attendance.findOne({ userId, staffId, year: y, month: m })
      || new Attendance({ userId, staffId, year: y, month: m, days: {} })

    if (clearing) record.days.delete(String(d))
    else record.days.set(String(d), Number(status))

    const saved = await record.save()
    res.json(saved)
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
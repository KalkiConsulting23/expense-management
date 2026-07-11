const express = require('express')
const router = express.Router()
const Borrow = require('../models/borrow')

// GET all borrow records (newest first)
router.get('/', async (req, res) => {
  try {
    const records = await Borrow.find().sort({ date: -1, createdAt: -1 })
    res.json(records)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// GET single borrow record
router.get('/:id', async (req, res) => {
  try {
    const record = await Borrow.findById(req.params.id)
    if (!record) return res.status(404).json({ error: 'Borrow record not found' })
    res.json(record)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// POST create a new borrow record
router.post('/', async (req, res) => {
  try {
    const { name, amount, rateOfInterest, tenure, date } = req.body

    const record = new Borrow({
      name,
      amount: Number(amount),
      rateOfInterest: Number(rateOfInterest),
      tenure: Number(tenure),
      date: date ? new Date(date) : new Date(),
      payments: [],
    })

    const saved = await record.save()
    res.status(201).json(saved)
  } catch (err) {
    res.status(400).json({ error: err.message })
  }
})

// PATCH update basic fields on a borrow record
router.patch('/:id', async (req, res) => {
  try {
    const { name, amount, rateOfInterest, tenure, date } = req.body
    const update = {}
    if (name !== undefined) update.name = name
    if (amount !== undefined) update.amount = Number(amount)
    if (rateOfInterest !== undefined) update.rateOfInterest = Number(rateOfInterest)
    if (tenure !== undefined) update.tenure = Number(tenure)
    if (date !== undefined) update.date = new Date(date)

    const updated = await Borrow.findByIdAndUpdate(req.params.id, update, {
      new: true,
      runValidators: true,
    })
    if (!updated) return res.status(404).json({ error: 'Borrow record not found' })
    res.json(updated)
  } catch (err) {
    res.status(400).json({ error: err.message })
  }
})

// PATCH set the paid amounts for a given month/year (upsert into payments)
// Accepts principalPaid and/or interestPaid; only provided fields are updated.
router.patch('/:id/update-payment', async (req, res) => {
  try {
    const { year, month, principalPaid, interestPaid } = req.body
    const y = Number(year)
    if (isNaN(y) || !month) {
      return res.status(400).json({ error: 'year and month are required' })
    }

    const hasPrincipal = principalPaid !== undefined
    const hasInterest = interestPaid !== undefined
    if (!hasPrincipal && !hasInterest) {
      return res.status(400).json({ error: 'principalPaid or interestPaid is required' })
    }

    const pVal = hasPrincipal ? Number(principalPaid) : undefined
    const iVal = hasInterest ? Number(interestPaid) : undefined
    if ((hasPrincipal && (isNaN(pVal) || pVal < 0)) || (hasInterest && (isNaN(iVal) || iVal < 0))) {
      return res.status(400).json({ error: 'paid amounts must be non-negative numbers' })
    }

    const record = await Borrow.findById(req.params.id)
    if (!record) return res.status(404).json({ error: 'Borrow record not found' })

    const idx = record.payments.findIndex(pay => pay.year === y && pay.month === month)
    if (idx > -1) {
      if (hasPrincipal) record.payments[idx].principalPaid = pVal
      if (hasInterest) record.payments[idx].interestPaid = iVal
    } else {
      record.payments.push({
        year: y,
        month,
        principalPaid: hasPrincipal ? pVal : 0,
        interestPaid: hasInterest ? iVal : 0,
      })
    }

    const saved = await record.save()
    res.json(saved)
  } catch (err) {
    res.status(400).json({ error: err.message })
  }
})

// DELETE a borrow record
router.delete('/:id', async (req, res) => {
  try {
    const deleted = await Borrow.findByIdAndDelete(req.params.id)
    if (!deleted) return res.status(404).json({ error: 'Borrow record not found' })
    res.json({ message: 'Borrow record deleted', id: req.params.id })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

module.exports = router
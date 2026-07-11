const express = require('express')
const router = express.Router()
const Lending = require('../models/lending')

// GET all lending records (newest first)
router.get('/', async (req, res) => {
  try {
    const records = await Lending.find().sort({ date: -1, createdAt: -1 })
    res.json(records)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// GET single lending record
router.get('/:id', async (req, res) => {
  try {
    const record = await Lending.findById(req.params.id)
    if (!record) return res.status(404).json({ error: 'Lending record not found' })
    res.json(record)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// POST create a new lending record
router.post('/', async (req, res) => {
  try {
    const { name, amount, date, receivedAmount } = req.body

    const record = new Lending({
      name,
      amount: Number(amount),
      date: date ? new Date(date) : new Date(),
      receivedAmount: receivedAmount !== undefined ? Number(receivedAmount) : 0,
      receivedDate: receivedAmount && Number(receivedAmount) > 0 ? new Date() : null,
    })

    const saved = await record.save()
    res.status(201).json(saved)
  } catch (err) {
    res.status(400).json({ error: err.message })
  }
})

// PATCH update a lending record (name/amount/date)
router.patch('/:id', async (req, res) => {
  try {
    const { name, amount, date, receivedAmount, receivedDate } = req.body
    const update = {}
    if (name !== undefined) update.name = name
    if (amount !== undefined) update.amount = Number(amount)
    if (date !== undefined) update.date = new Date(date)
    if (receivedAmount !== undefined) update.receivedAmount = Number(receivedAmount)
    if (receivedDate !== undefined) update.receivedDate = receivedDate ? new Date(receivedDate) : null

    const updated = await Lending.findByIdAndUpdate(req.params.id, update, {
      new: true,
      runValidators: true,
    })
    if (!updated) return res.status(404).json({ error: 'Lending record not found' })
    res.json(updated)
  } catch (err) {
    res.status(400).json({ error: err.message })
  }
})

// PATCH add a received payment — increments receivedAmount (capped at amount)
router.patch('/:id/receive', async (req, res) => {
  try {
    const { received } = req.body
    const value = Number(received)
    if (isNaN(value) || value < 0) {
      return res.status(400).json({ error: 'received must be a non-negative number' })
    }

    const record = await Lending.findById(req.params.id)
    if (!record) return res.status(404).json({ error: 'Lending record not found' })

    // Add this payment to the running total, capped at the lent amount
    const newTotal = Number(record.receivedAmount || 0) + value
    record.receivedAmount = Math.min(newTotal, record.amount)
    record.receivedDate = record.receivedAmount > 0 ? new Date() : null

    const saved = await record.save()
    res.json(saved)
  } catch (err) {
    res.status(400).json({ error: err.message })
  }
})

// DELETE a lending record
router.delete('/:id', async (req, res) => {
  try {
    const deleted = await Lending.findByIdAndDelete(req.params.id)
    if (!deleted) return res.status(404).json({ error: 'Lending record not found' })
    res.json({ message: 'Lending record deleted', id: req.params.id })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

module.exports = router
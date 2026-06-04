const express = require('express')
const router = express.Router()
const Sales = require('../models/sales')

// ── CREATE ──────────────────────────────────────────────
router.post('/', async (req, res) => {
  try {
    const sale = new Sales({ ...req.body })
    const saved = await sale.save()
    res.status(201).json(saved)
  } catch (err) {
    res.status(400).json({ error: err.message })
  }
})

// ── READ ALL ─────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const sales = await Sales.find().sort({ createdAt: -1 })
    res.status(200).json(sales)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ── READ ONE ─────────────────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const sale = await Sales.findById(req.params.id)
    if (!sale) return res.status(404).json({ error: 'Sale not found' })
    res.status(200).json(sale)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ── UPDATE ───────────────────────────────────────────────
router.put('/:id', async (req, res) => {
  try {
    const updated = await Sales.findByIdAndUpdate(
      req.params.id,
      { ...req.body },
      { new: true, runValidators: true }
    )
    if (!updated) return res.status(404).json({ error: 'Sale not found' })
    res.status(200).json(updated)
  } catch (err) {
    res.status(400).json({ error: err.message })
  }
})

// ── DELETE ───────────────────────────────────────────────
router.delete('/:id', async (req, res) => {
  try {
    const deleted = await Sales.findByIdAndDelete(req.params.id)
    if (!deleted) return res.status(404).json({ error: 'Sale not found' })
    res.status(200).json({ message: 'Sale deleted successfully' })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

module.exports = router
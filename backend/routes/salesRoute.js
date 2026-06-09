const express = require('express')
const router = require('express').Router()
const Sales = require('../models/sales')

// ── CREATE ──────────────────────────────────────────────
router.post('/', async (req, res) => {
  try {
    // Removed userId assignment completely
    const sale = new Sales({ 
      ...req.body
    })
    const saved = await sale.save()
    res.status(201).json(saved)
  } catch (err) {
    res.status(400).json({ error: err.message })
  }
})

// ── READ ALL ─────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    // Removed userId filtering to fetch all sales locally
    const sales = await Sales.find({}).sort({ createdAt: -1 })
    res.status(200).json(sales)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ── READ ONE ─────────────────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    // Removed userId check, looking up purely via the document ID
    const sale = await Sales.findOne({ _id: req.params.id })
    if (!sale) return res.status(404).json({ error: 'Sale not found' })
    res.status(200).json(sale)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ── UPDATE ───────────────────────────────────────────────
router.put('/:id', async (req, res) => {
  try {
    // Removed userId filter criteria
    const updated = await Sales.findOneAndUpdate(
      { _id: req.params.id },
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
    // Removed userId check constraint layer
    const deleted = await Sales.findOneAndDelete(
      { _id: req.params.id }
    )
    if (!deleted) return res.status(404).json({ error: 'Sale not found' })
    res.status(200).json({ message: 'Sale deleted successfully' })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

module.exports = router
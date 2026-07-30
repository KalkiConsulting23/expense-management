const express = require('express')
const router = require('express').Router()
const Sales = require('../models/sales')
const { getAuth } = require('@clerk/express')

// ── CREATE ──────────────────────────────────────────────
router.post('/', async (req, res) => {
  try {
    const { userId } = getAuth(req)
    // userId set AFTER the spread so a client can't override it via the body
    const sale = new Sales({
      ...req.body,
      userId,
    })
    const saved = await sale.save()
    res.status(201).json(saved)
  } catch (err) {
    res.status(400).json({ error: err.message })
  }
})

// ── READ ALL (scoped) ────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const { userId } = getAuth(req)
    const sales = await Sales.find({ userId }).sort({ createdAt: -1 })
    res.status(200).json(sales)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ── READ ONE ─────────────────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const { userId } = getAuth(req)
    const sale = await Sales.findOne({ _id: req.params.id, userId })
    if (!sale) return res.status(404).json({ error: 'Sale not found' })
    res.status(200).json(sale)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ── UPDATE ───────────────────────────────────────────────
router.put('/:id', async (req, res) => {
  try {
    const { userId } = getAuth(req)
    // Strip any userId from the body so it can't be reassigned to another user
    const { userId: _ignore, ...fields } = req.body
    const updated = await Sales.findOneAndUpdate(
      { _id: req.params.id, userId },
      { ...fields },
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
    const { userId } = getAuth(req)
    const deleted = await Sales.findOneAndDelete({ _id: req.params.id, userId })
    if (!deleted) return res.status(404).json({ error: 'Sale not found' })
    res.status(200).json({ message: 'Sale deleted successfully' })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

module.exports = router
const express = require("express");
const router = express.Router();
const Budget = require("../models/budget");
const BudgetTransfer = require("../models/budgetTransfer");
const { getAuth } = require("@clerk/express");

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const POOLS = ["Home", "Office"];

// ─── GET ALL BUDGETS (optionally filtered by FY) ───
router.get("/all", async (req, res) => {
  try {
    const { userId } = getAuth(req);
    const { fyStartYear } = req.query;
    const filter = { userId };
    if (fyStartYear !== undefined) filter.fyStartYear = Number(fyStartYear);
    const budgets = await Budget.find(filter);
    res.status(200).json(budgets);
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

// ─── UPSERT A MONTH'S DEPOSITS ───
// Body: { fyStartYear, month, year, homeDeposit?, officeDeposit? }
// Only the fields sent are updated (so you can set one pool without wiping the other).
router.patch("/set", async (req, res) => {
  try {
    const { userId } = getAuth(req);
    const { fyStartYear, month, year, homeDeposit, officeDeposit } = req.body;
    if (fyStartYear === undefined || !month || year === undefined) {
      return res.status(400).json({ message: "fyStartYear, month and year are required." });
    }
    if (!MONTHS.includes(month)) {
      return res.status(400).json({ message: "Invalid month." });
    }

    const setFields = { year: Number(year) };
    if (homeDeposit !== undefined)   setFields.homeDeposit = Number(homeDeposit) || 0;
    if (officeDeposit !== undefined) setFields.officeDeposit = Number(officeDeposit) || 0;

    const updated = await Budget.findOneAndUpdate(
      { userId, fyStartYear: Number(fyStartYear), month },
      { $set: setFields },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );

    res.status(200).json({ message: "Budget saved.", budget: updated });
  } catch (err) {
    res.status(500).json({ message: "Failed saving budget.", error: err.message });
  }
});

// ─── GET ALL TRANSFERS (optionally filtered by FY) ───
router.get("/transfers", async (req, res) => {
  try {
    const { userId } = getAuth(req);
    const { fyStartYear } = req.query;
    const filter = { userId };
    if (fyStartYear !== undefined) filter.fyStartYear = Number(fyStartYear);
    const transfers = await BudgetTransfer.find(filter).sort({ createdAt: 1 });
    res.status(200).json(transfers);
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

// ─── LOG A TRANSFER ───
// Body: { fyStartYear, month, year, from, to, amount }
router.post("/transfer", async (req, res) => {
  try {
    const { userId } = getAuth(req);
    const { fyStartYear, month, year, from, to, amount } = req.body;
    if (fyStartYear === undefined || !month || year === undefined || !from || !to) {
      return res.status(400).json({ message: "fyStartYear, month, year, from and to are required." });
    }
    if (!MONTHS.includes(month))  return res.status(400).json({ message: "Invalid month." });
    if (!POOLS.includes(from) || !POOLS.includes(to)) return res.status(400).json({ message: "from/to must be Home or Office." });
    if (from === to) return res.status(400).json({ message: "from and to must differ." });
    const amt = Number(amount);
    if (isNaN(amt) || amt <= 0) return res.status(400).json({ message: "amount must be positive." });

    const transfer = await BudgetTransfer.create({
      userId, fyStartYear: Number(fyStartYear), month, year: Number(year), from, to, amount: amt,
    });
    res.status(201).json({ message: "Transfer logged.", transfer });
  } catch (err) {
    res.status(500).json({ message: "Failed logging transfer.", error: err.message });
  }
});

// ─── DELETE (undo) A TRANSFER ───
router.delete("/transfer/:id", async (req, res) => {
  try {
    const { userId } = getAuth(req);
    const { id } = req.params;
    if (!/^[0-9a-fA-F]{24}$/.test(id)) return res.status(400).json({ message: "Invalid transfer ID." });
    const deleted = await BudgetTransfer.findOneAndDelete({ _id: id, userId });
    if (!deleted) return res.status(404).json({ message: "Transfer not found." });
    res.status(200).json({ message: "Transfer removed.", id });
  } catch (err) {
    res.status(500).json({ message: "Failed removing transfer.", error: err.message });
  }
});

module.exports = router;
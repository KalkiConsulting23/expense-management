const express = require("express");
const router = express.Router();
const Budget = require("../models/budget");
const BudgetTransfer = require("../models/budgetTransfer");
const BudgetLedger = require("../models/budgetLedger");
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

// ─── ADJUST A POOL DEPOSIT (add / withdraw via delta) ───
// Body: { fyStartYear, month, year, pool, delta }
// delta is signed: positive to add, negative to withdraw. Pool never goes below 0.
// Each movement is logged to BudgetLedger for the dated transaction history.
router.patch("/adjust", async (req, res) => {
  try {
    const { userId } = getAuth(req);
    const { fyStartYear, month, year, pool, delta } = req.body;
    if (fyStartYear === undefined || !month || year === undefined) {
      return res.status(400).json({ message: "fyStartYear, month and year are required." });
    }
    if (!MONTHS.includes(month)) return res.status(400).json({ message: "Invalid month." });
    if (!POOLS.includes(pool))   return res.status(400).json({ message: "pool must be Home or Office." });

    let incVal = Number(delta);
    if (isNaN(incVal)) return res.status(400).json({ message: "delta must be a number." });

    const field = pool === "Home" ? "homeDeposit" : "officeDeposit";

    // Load current so a withdrawal can't drive the pool below zero.
    const existing = await Budget.findOne({ userId, fyStartYear: Number(fyStartYear), month });
    const current = existing ? (existing[field] || 0) : 0;
    if (incVal < 0 && Math.abs(incVal) > current) incVal = -current; // clamp withdraw
    if (incVal === 0) {
      return res.status(200).json({ message: "No change.", budget: existing });
    }

    const updated = await Budget.findOneAndUpdate(
      { userId, fyStartYear: Number(fyStartYear), month },
      { $inc: { [field]: incVal }, $setOnInsert: { year: Number(year) } },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );

    // Log the movement for the dated ledger.
    await BudgetLedger.create({
      userId, fyStartYear: Number(fyStartYear), month, year: Number(year),
      pool, amount: incVal, date: new Date(),
    });

    res.status(200).json({ message: "Budget adjusted.", budget: updated });
  } catch (err) {
    res.status(500).json({ message: "Failed adjusting budget.", error: err.message });
  }
});

// ─── GET LEDGER ENTRIES (direct add/withdraw history) ───
router.get("/ledger", async (req, res) => {
  try {
    const { userId } = getAuth(req);
    const { fyStartYear } = req.query;
    const filter = { userId };
    if (fyStartYear !== undefined) filter.fyStartYear = Number(fyStartYear);
    const entries = await BudgetLedger.find(filter).sort({ date: 1 });
    res.status(200).json(entries);
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
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
const express = require("express");
const router = express.Router();
const Employee = require("../models/employee");

// ── Create Employee ──────────────────────────────────────────────────────
router.post("/add", async (req, res) => {
  try {
    const { expenseType, expenseName, type, amount, startDate, endDate, date } = req.body;

    if (!expenseType) {
      console.log("ERROR: expenseType is missing from req.body");
      return res.status(400).json({
        message: "expenseType is missing.",
        receivedBody: req.body,
      });
    }

    const data = {
      expenseType: expenseType.trim(),
      expenseName: expenseName.trim(),
      type,
      amount: Number(amount),
    };

    if (type === "recurring") {
      if (!startDate) {
        return res.status(400).json({ message: "startDate is required for recurring expenses." });
      }
      data.startDate = new Date(startDate);
      if (endDate) data.endDate = new Date(endDate);
    }

    if (type === "one-time") {
      if (!date) {
        return res.status(400).json({ message: "date is required for one-time expenses." });
      }

      let parsedDate;
      if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(date)) {
        const [day, month, year] = date.split("/");
        parsedDate = new Date(`${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`);
      } else if (/^\d{1,2}-\d{1,2}-\d{4}$/.test(date)) {
        const [day, month, year] = date.split("-");
        parsedDate = new Date(`${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`);
      } else if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        parsedDate = new Date(date);
      } else {
        parsedDate = new Date(date);
      }

      if (!parsedDate || isNaN(parsedDate.getTime())) {
        return res.status(400).json({
          message: `Invalid date value: "${date}". Use formats: YYYY-MM-DD, DD/MM/YYYY, or DD-MM-YYYY.`,
        });
      }

      data.date = parsedDate;
    }

    const employee = new Employee(data);
    await employee.save();

    res.status(201).json({ message: "Employee added successfully", employee });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── Get All Employees ────────────────────────────────────────────────────
router.get("/all", async (req, res) => {
  try {
    const employees = await Employee.find({});
    res.status(200).json(employees);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── Update a single month's paid amount ──────────────────────────────────
router.patch("/update-payment/:id", async (req, res) => {
  try {
    const { year, month, paid } = req.body;

    const employee = await Employee.findOne({ _id: req.params.id });
    if (!employee) return res.status(404).json({ message: "Employee not found" });

    const index = employee.payments.findIndex(
      (p) => p.year === year && p.month === month
    );

    if (index > -1) {
      employee.payments[index].paid = paid;
    } else {
      employee.payments.push({ year, month, paid });
    }

    await employee.save();
    res.status(200).json({ message: "Payment updated", payments: employee.payments });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── Add or update an amount override for a specific month ─────────────────
// Body: { year: Number, month: String, amount: Number }
// Effect: from that month+year onwards the expense uses `amount` instead of
//         the base amount (until the next override, if any).
router.patch("/update-amount-override/:id", async (req, res) => {
  try {
    const { year, month, amount } = req.body;

    if (!year || !month || amount === undefined) {
      return res.status(400).json({ message: "year, month, and amount are required." });
    }
    if (typeof amount !== "number" || amount <= 0) {
      return res.status(400).json({ message: "amount must be a positive number." });
    }

    const employee = await Employee.findById(req.params.id);
    if (!employee) return res.status(404).json({ message: "Employee not found" });
    if (employee.type !== "recurring") {
      return res.status(400).json({ message: "Amount overrides are only supported for recurring expenses." });
    }

    const index = employee.amountOverrides.findIndex(
      (ov) => ov.year === year && ov.month === month
    );

    if (index > -1) {
      // Update existing override for this month
      employee.amountOverrides[index].amount = amount;
    } else {
      // Add new override
      employee.amountOverrides.push({ year, month, amount });
    }

    await employee.save();
    res.status(200).json({
      message: "Amount override saved",
      amountOverrides: employee.amountOverrides,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── Remove an amount override for a specific month ────────────────────────
// Body: { year: Number, month: String }
// Effect: that month reverts to the previous override or base amount.
router.delete("/remove-amount-override/:id", async (req, res) => {
  try {
    const { year, month } = req.body;

    if (!year || !month) {
      return res.status(400).json({ message: "year and month are required." });
    }

    const employee = await Employee.findById(req.params.id);
    if (!employee) return res.status(404).json({ message: "Employee not found" });

    const before = employee.amountOverrides.length;
    employee.amountOverrides = employee.amountOverrides.filter(
      (ov) => !(ov.year === year && ov.month === month)
    );

    if (employee.amountOverrides.length === before) {
      return res.status(404).json({ message: "No override found for that month." });
    }

    await employee.save();
    res.status(200).json({
      message: "Amount override removed",
      amountOverrides: employee.amountOverrides,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── Delete Employee ───────────────────────────────────────────────────────
router.delete("/delete/:id", async (req, res) => {
  try {
    const deleted = await Employee.findOneAndDelete({ _id: req.params.id });
    if (!deleted) return res.status(404).json({ message: "Employee not found" });
    res.status(200).json({ message: "Employee deleted successfully" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
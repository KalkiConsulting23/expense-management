const express = require("express");
const router = express.Router();
const Employee = require("../models/employee");

// ── Create Employee ──────────────────────────────────────────────────────
router.post("/add", async (req, res) => {
  console.log("=== /add called ===");
  console.log("Content-Type :", req.headers["content-type"]);
  console.log("Raw body     :", req.body);

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
      // userId removed entirely
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
    // Removed userId filtering to fetch all records locally
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

    // Removed userId check so we find items purely by document ID
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

// ── Delete Employee ───────────────────────────────────────────────────────
router.delete("/delete/:id", async (req, res) => {
  try {
    // Removed userId constraint to allow seamless deletion via ID
    const deleted = await Employee.findOneAndDelete({ _id: req.params.id });
    if (!deleted) return res.status(404).json({ message: "Employee not found" });
    res.status(200).json({ message: "Employee deleted successfully" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
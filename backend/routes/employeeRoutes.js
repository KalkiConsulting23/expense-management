const express = require('express');
const router = express.Router();
const Employee = require('../models/employee');

// Coerce assorted truthy/falsy inputs into a real boolean.
const coerceBool = (v) => {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'string') return v === 'true' || v === 'yes' || v === '1';
  return !!v;
};

const isValidId = (id) => /^[0-9a-fA-F]{24}$/.test(id);

// ─── ADD EXPENSE ───
router.post('/add', async (req, res) => {
  try {
    const {
      expenseName,
      expenseType,
      type,
      amount,
      startDate,
      endDate,
      date,
      carryForward,
    } = req.body;

    const newEmployee = new Employee({
      expenseName,
      expenseType,
      type: type || 'recurring',
      amount: amount || 0,
      startDate,
      endDate: endDate || null,
      date: date || null,
      carryForward: carryForward !== undefined ? coerceBool(carryForward) : true,
      amountOverrides: [],
      payments: [],
    });

    await newEmployee.save();
    res.status(201).json(newEmployee);
  } catch (err) {
    res.status(400).json({ message: 'Failed adding expense.', error: err.message });
  }
});

// ─── GET ALL EXPENSES ───
router.get('/all', async (req, res) => {
  try {
    const employees = await Employee.find({});
    res.status(200).json(employees);
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// ─── UPDATE PAYMENT (per month/year) ───
router.patch('/update-payment/:id', async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidId(id)) return res.status(400).json({ message: 'Invalid expense ID.' });

    const { year, month, paid } = req.body;
    const employee = await Employee.findById(id);
    if (!employee) return res.status(404).json({ message: 'Expense not found.' });

    const idx = (employee.payments || []).findIndex(
      p => p.year === Number(year) && p.month === month
    );

    let updateQuery;
    if (idx > -1) {
      updateQuery = { $set: { [`payments.${idx}.paid`]: Number(paid) } };
    } else {
      updateQuery = { $push: { payments: { year: Number(year), month, paid: Number(paid) } } };
    }

    const updated = await Employee.findByIdAndUpdate(id, updateQuery, { new: true });
    res.status(200).json({ message: 'Payment updated.', employee: updated });
  } catch (err) {
    res.status(500).json({ message: 'Failed updating payment.', error: err.message });
  }
});

// ─── UPDATE AMOUNT OVERRIDE ───
router.patch('/update-amount-override/:id', async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidId(id)) return res.status(400).json({ message: 'Invalid expense ID.' });

    const { year, month, amount } = req.body;
    const employee = await Employee.findById(id);
    if (!employee) return res.status(404).json({ message: 'Expense not found.' });

    const idx = (employee.amountOverrides || []).findIndex(
      ov => ov.year === Number(year) && ov.month === month
    );

    let updateQuery;
    if (idx > -1) {
      updateQuery = { $set: { [`amountOverrides.${idx}.amount`]: Number(amount) } };
    } else {
      updateQuery = { $push: { amountOverrides: { year: Number(year), month, amount: Number(amount) } } };
    }

    const updated = await Employee.findByIdAndUpdate(id, updateQuery, { new: true });
    res.status(200).json({ message: 'Amount override updated.', employee: updated });
  } catch (err) {
    res.status(500).json({ message: 'Failed updating amount override.', error: err.message });
  }
});

// ─── REMOVE AMOUNT OVERRIDE ───
router.delete('/remove-amount-override/:id', async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidId(id)) return res.status(400).json({ message: 'Invalid expense ID.' });

    const { year, month } = req.body;

    const updated = await Employee.findByIdAndUpdate(
      id,
      { $pull: { amountOverrides: { year: Number(year), month } } },
      { new: true }
    );
    if (!updated) return res.status(404).json({ message: 'Expense not found.' });

    res.status(200).json({ message: 'Amount override removed.', employee: updated });
  } catch (err) {
    res.status(500).json({ message: 'Failed removing amount override.', error: err.message });
  }
});

// ─── UPDATE CARRY-FORWARD ───
router.patch('/update-carry-forward/:id', async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidId(id)) return res.status(400).json({ message: 'Invalid expense ID.' });

    const { carryForward } = req.body;

    const updated = await Employee.findByIdAndUpdate(
      id,
      { $set: { carryForward: coerceBool(carryForward) } },
      { new: true }
    );
    if (!updated) return res.status(404).json({ message: 'Expense not found.' });

    res.status(200).json({ message: 'Carry-forward updated.', employee: updated });
  } catch (err) {
    res.status(500).json({ message: 'Failed updating carry-forward.', error: err.message });
  }
});

// ─── CONVERT RECURRING → ONE-TIME ───
router.patch('/convert-to-onetime/:id', async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidId(id)) return res.status(400).json({ message: 'Invalid expense ID.' });

    const { amount, date } = req.body;

    const updated = await Employee.findByIdAndUpdate(
      id,
      {
        $set: {
          type: 'one-time',
          amount: Number(amount),
          date,
          carryForward: true,
          amountOverrides: [],
          payments: [],
          endDate: null,
        },
      },
      { new: true }
    );
    if (!updated) return res.status(404).json({ message: 'Expense not found.' });

    res.status(200).json({ message: 'Converted to one-time.', employee: updated });
  } catch (err) {
    res.status(500).json({ message: 'Failed converting to one-time.', error: err.message });
  }
});

// ─── EDIT ONE-TIME EXPENSE ───
// Updates name, amount, type, and/or date of an existing one-time expense.
// Only fields that are actually sent are updated (partial update).
router.patch('/update-onetime/:id', async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidId(id)) return res.status(400).json({ message: 'Invalid expense ID.' });

    const { expenseName, amount, expenseType, date } = req.body;

    const setFields = {};
    if (expenseName !== undefined) setFields.expenseName = expenseName;
    if (amount !== undefined)      setFields.amount = Number(amount);
    if (expenseType !== undefined) setFields.expenseType = expenseType;
    if (date !== undefined)        setFields.date = date;

    if (Object.keys(setFields).length === 0) {
      return res.status(400).json({ message: 'No fields to update.' });
    }

    const updated = await Employee.findByIdAndUpdate(
      id,
      { $set: setFields },
      { new: true }
    );
    if (!updated) return res.status(404).json({ message: 'Expense not found.' });

    res.status(200).json({ message: 'One-time expense updated.', employee: updated });
  } catch (err) {
    res.status(500).json({ message: 'Failed updating one-time expense.', error: err.message });
  }
});

// ─── DELETE EXPENSE ───
router.delete('/delete/:id', async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidId(id)) return res.status(400).json({ message: 'Invalid expense ID.' });

    const deleted = await Employee.findOneAndDelete({ _id: id });
    if (!deleted) return res.status(404).json({ message: 'Expense not found.' });

    res.status(200).json({ message: 'Expense deleted successfully.', id });
  } catch (err) {
    res.status(500).json({ message: 'Failed to delete expense.', error: err.message });
  }
});

module.exports = router;
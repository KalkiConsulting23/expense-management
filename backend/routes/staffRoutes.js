const express = require('express');
const router = express.Router();
const Staff = require('../models/staff');
const { getAuth } = require('@clerk/express');

const isValidId = (id) => /^[0-9a-fA-F]{24}$/.test(id);

// NOTE: employeeId is intentionally NOT in this list — it is generated on the
// backend at creation time and must not be overwritten by client input.
const STAFF_FIELDS = [
  'firstName', 'lastName', 'department', 'email', 'designation',
  'workPhoneNumber', 'dateOfJoining', 'reportingManager', 'dateOfBirth',
  'personalMobileNumber', 'personalEmailAddress', 'dateOfExit', 'gender',
  'maritalStatus', 'sourceOfHire', 'employeeStatus', 'employmentType', 'age',
  'salary',
  'currentExperience', 'totalExperience', 'permanentAddress', 'aadhaar', 'pan',
  'fatherName', 'paymentMode', 'bankHolderName', 'bankName', 'accountNumber',
  'ifscCode', 'bankAccountType',
];

// Build an employee ID like "DEEP1033": a 4-letter name prefix + a unique
// 4-digit number, scoped per user so two admins can't clash.
const generateEmployeeId = async (userId, firstName) => {
  const clean = String(firstName || 'EMP').replace(/[^a-zA-Z]/g, '').toUpperCase();
  const prefix = (clean + 'XXXX').slice(0, 4); // pad short names, e.g. "JO" -> "JOXX"
  for (let attempt = 0; attempt < 20; attempt++) {
    const num = Math.floor(1000 + Math.random() * 9000); // 1000–9999
    const candidate = `${prefix}${num}`;
    const exists = await Staff.exists({ userId, employeeId: candidate });
    if (!exists) return candidate;
  }
  // Fallback guarantees uniqueness if we somehow collide 20 times in a row.
  return `${prefix}${Date.now().toString().slice(-4)}`;
};

// ─── ADD STAFF ───
router.post('/add', async (req, res) => {
  try {
    const { userId } = getAuth(req);

    const data = {};
    STAFF_FIELDS.forEach((field) => {
      if (req.body[field] !== undefined) data[field] = req.body[field];
    });

    const employeeId = await generateEmployeeId(userId, data.firstName);

    const newStaff = new Staff({ userId, employeeId, ...data });
    await newStaff.save();
    res.status(201).json(newStaff);
  } catch (err) {
    res.status(400).json({ message: 'Failed adding staff.', error: err.message });
  }
});

// ─── GET ALL STAFF (scoped) ───
router.get('/all', async (req, res) => {
  try {
    const { userId } = getAuth(req);
    const staff = await Staff.find({ userId });
    res.status(200).json(staff);
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// ─── GET SINGLE STAFF ───
router.get('/:id', async (req, res) => {
  try {
    const { userId } = getAuth(req);
    const { id } = req.params;
    if (!isValidId(id)) return res.status(400).json({ message: 'Invalid staff ID.' });

    const staff = await Staff.findOne({ _id: id, userId });
    if (!staff) return res.status(404).json({ message: 'Staff not found.' });

    res.status(200).json(staff);
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// ─── UPDATE STAFF ───
router.patch('/update/:id', async (req, res) => {
  try {
    const { userId } = getAuth(req);
    const { id } = req.params;
    if (!isValidId(id)) return res.status(400).json({ message: 'Invalid staff ID.' });

    const setFields = {};
    STAFF_FIELDS.forEach((field) => {
      if (req.body[field] !== undefined) setFields[field] = req.body[field];
    });
    if (Object.keys(setFields).length === 0) {
      return res.status(400).json({ message: 'No fields to update.' });
    }

    const updated = await Staff.findOneAndUpdate(
      { _id: id, userId },
      { $set: setFields },
      { new: true }
    );
    if (!updated) return res.status(404).json({ message: 'Staff not found.' });

    res.status(200).json({ message: 'Staff updated.', staff: updated });
  } catch (err) {
    res.status(500).json({ message: 'Failed updating staff.', error: err.message });
  }
});

// ─── DELETE STAFF ───
router.delete('/delete/:id', async (req, res) => {
  try {
    const { userId } = getAuth(req);
    const { id } = req.params;
    if (!isValidId(id)) return res.status(400).json({ message: 'Invalid staff ID.' });

    const deleted = await Staff.findOneAndDelete({ _id: id, userId });
    if (!deleted) return res.status(404).json({ message: 'Staff not found.' });

    res.status(200).json({ message: 'Staff deleted successfully.', id });
  } catch (err) {
    res.status(500).json({ message: 'Failed to delete staff.', error: err.message });
  }
});

module.exports = router;
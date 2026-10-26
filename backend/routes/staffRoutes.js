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

// Dates and numbers can't be saved as "" — an empty value means "clear it".
const BLANK_TO_NULL_FIELDS = new Set([
  'dateOfJoining', 'dateOfBirth', 'dateOfExit',
  'age', 'salary', 'currentExperience', 'totalExperience',
]);

// Pick only the allowed fields from the request body and tidy their values.
// mode 'add'    → blank dates/numbers are left out
// mode 'update' → blank dates/numbers become null (clears the saved value)
const pickStaffFields = (body = {}, mode = 'add') => {
  const data = {};
  STAFF_FIELDS.forEach((field) => {
    if (body[field] === undefined) return;
    let value = body[field];
    if (typeof value === 'string') value = value.trim();
    if (BLANK_TO_NULL_FIELDS.has(field) && (value === '' || value === null)) {
      if (mode === 'update') data[field] = null;
      return;
    }
    data[field] = value;
  });
  return data;
};

// Turn Mongoose errors into a clear message for the form.
const sendSaveError = (res, err, fallback) => {
  if (err && err.name === 'ValidationError') {
    const message = Object.values(err.errors).map((e) => e.message).join(', ');
    return res.status(400).json({ message: message || fallback, error: err.message });
  }
  if (err && err.name === 'CastError') {
    return res.status(400).json({ message: `Invalid value for ${err.path}.`, error: err.message });
  }
  if (err && err.code === 11000) {
    return res.status(409).json({ message: 'A staff member with these details already exists.', error: err.message });
  }
  return res.status(500).json({ message: fallback, error: err && err.message });
};

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

    const data = pickStaffFields(req.body, 'add');
    const employeeId = await generateEmployeeId(userId, data.firstName);

    const newStaff = new Staff({ userId, employeeId, ...data });
    await newStaff.save();
    res.status(201).json(newStaff);
  } catch (err) {
    if (err && (err.name === 'ValidationError' || err.name === 'CastError' || err.code === 11000)) {
      return sendSaveError(res, err, 'Failed adding staff.');
    }
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
// Send only the fields that changed. employeeId and userId can never be changed.
// PATCH and PUT both work, so either style from the frontend is fine.
const updateStaff = async (req, res) => {
  try {
    const { userId } = getAuth(req);
    const { id } = req.params;
    if (!isValidId(id)) return res.status(400).json({ message: 'Invalid staff ID.' });

    const setFields = pickStaffFields(req.body, 'update');
    if (Object.keys(setFields).length === 0) {
      return res.status(400).json({ message: 'No fields to update.' });
    }
    if ('firstName' in setFields && !setFields.firstName) {
      return res.status(400).json({ message: 'First name cannot be empty.' });
    }

    const updated = await Staff.findOneAndUpdate(
      { _id: id, userId },
      { $set: setFields },
      { new: true, runValidators: true, context: 'query' }
    );
    if (!updated) return res.status(404).json({ message: 'Staff not found.' });

    res.status(200).json({ message: 'Staff updated.', staff: updated });
  } catch (err) {
    sendSaveError(res, err, 'Failed updating staff.');
  }
};

router.patch('/update/:id', updateStaff);
router.put('/update/:id', updateStaff);

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
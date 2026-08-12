const express = require('express');
const router = express.Router();
const Staff = require('../models/staff');
const { getAuth } = require('@clerk/express');

const isValidId = (id) => /^[0-9a-fA-F]{24}$/.test(id);

const STAFF_FIELDS = [
  'employeeId', 'firstName', 'lastName', 'department', 'email', 'designation',
  'workPhoneNumber', 'dateOfJoining', 'reportingManager', 'dateOfBirth',
  'personalMobileNumber', 'personalEmailAddress', 'dateOfExit', 'gender',
  'maritalStatus', 'sourceOfHire', 'employeeStatus', 'employmentType', 'age',
  'currentExperience', 'totalExperience', 'permanentAddress', 'aadhaar', 'pan',
  'fatherName', 'paymentMode', 'bankHolderName', 'bankName', 'accountNumber',
  'ifscCode', 'bankAccountType',
];

// ─── ADD STAFF ───
router.post('/add', async (req, res) => {
  try {
    const { userId } = getAuth(req);

    const data = {};
    STAFF_FIELDS.forEach((field) => {
      if (req.body[field] !== undefined) data[field] = req.body[field];
    });

    const newStaff = new Staff({ userId, ...data });
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

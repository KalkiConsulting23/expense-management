const express = require('express');
const router = express.Router();
const Project = require('../models/project'); // ✅ Backs out of the 'routes' folder first

// ─── ADD PROJECT ENDPOINT ───
router.post('/add', async (req, res) => {
  try {
    const { projectName, projectType, startDate, endDate, expectedAmount, currency } = req.body;
    
    const newProject = new Project({
      projectName,
      projectType,
      startDate,
      endDate,
      expectedAmount: expectedAmount || 0,
      currency: currency || 'INR',
      monthlyBreakdowns: [] // Populated dynamically via grid configuration popups
    });

    await newProject.save();
    res.status(201).json(newProject);
  } catch (err) {
    res.status(400).json({ message: "Failed adding structural track asset item.", error: err.message });
  }
});

// ─── GET ALL PROJECTS ───
router.get('/all', async (req, res) => {
  try {
    const projects = await Project.find({});
    res.status(200).json(projects);
  } catch (err) {
    res.status(500).json({ message: "Server error reading workspace logs", error: err.message });
  }
});

// ─── ATOMIC SYNC FOR CALCULATIONS & PAYMENTS FOR A GIVEN MONTH ───
router.patch('/sync-month/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { month, year, amt, paid, metrics } = req.body;

    // Look for existing breakdown entry matching this specific month/year
    const project = await Project.findById(id);
    if (!project) return res.status(404).json({ message: "Project not found" });

    const existingIndex = project.monthlyBreakdowns.findIndex(
      b => b.month === month && b.year === Number(year)
    );

    let updateQuery = {};
    if (existingIndex > -1) {
      // Entry exists, update target elements fields conditionally
      const setFields = {};
      if (amt !== undefined) setFields[`monthlyBreakdowns.${existingIndex}.amt`] = amt;
      if (paid !== undefined) setFields[`monthlyBreakdowns.${existingIndex}.paid`] = paid;
      
      if (metrics) {
        Object.keys(metrics).forEach(key => {
          setFields[`monthlyBreakdowns.${existingIndex}.${key}`] = metrics[key];
        });
      }
      updateQuery = { $set: setFields };
    } else {
      // Entry does not exist, push a new breakdown object into the array
      const newBreakdown = {
        month,
        year: Number(year),
        amt: amt || 0,
        paid: paid || 0,
        ...metrics
      };
      updateQuery = { $push: { monthlyBreakdowns: newBreakdown } };
    }

    const updatedProject = await Project.findByIdAndUpdate(id, updateQuery, { new: true });
    res.status(200).json(updatedProject);
  } catch (err) {
    res.status(500).json({ message: "Failed updating database breakdown index.", error: err.message });
  }
});

module.exports = router;
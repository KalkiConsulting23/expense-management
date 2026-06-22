const express = require('express');
const router = express.Router();
const Project = require('../models/project');

// ─── ADD PROJECT ───
router.post('/add', async (req, res) => {
  try {
    const {
      projectName,
      projectType,
      startDate,
      endDate,
      expectedAmount,
      currency,
      defaultHourlyRate,
      defaultDailyRate,
      projectScope,
    } = req.body;

    const newProject = new Project({
      // userId removed entirely
      projectName,
      projectType,
      startDate,
      endDate,
      expectedAmount: expectedAmount || 0,
      defaultHourlyRate: defaultHourlyRate || 0,
      defaultDailyRate: defaultDailyRate || 0,
      currency: currency || 'INR',
      projectScope: projectScope || 'domestic',
      monthlyBreakdowns: []
    });
   
    await newProject.save();
    res.status(201).json(newProject);
  } catch (err) {
    res.status(400).json({ message: "Failed adding project.", error: err.message });
  }
});

// ─── GET ALL PROJECTS ───
router.get('/all', async (req, res) => {
  try {
    // Removed userId filtering to fetch all records locally
    const projects = await Project.find({});
    res.status(200).json(projects);
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

// ─── SYNC MONTH ───
router.patch('/sync-month/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { month, year, amt, paid, metrics } = req.body;

    // Removed userId constraint check
    const project = await Project.findOne({ _id: id });
    if (!project) return res.status(404).json({ message: "Project not found" });

    const existingIndex = project.monthlyBreakdowns.findIndex(
      b => b.month === month && b.year === Number(year)
    );

    let updateQuery = {};
    if (existingIndex > -1) {
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
    res.status(500).json({ message: "Failed updating breakdown.", error: err.message });
  }
});

// ─── DELETE PROJECT ───
router.delete('/delete/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Guard against malformed IDs that would crash Mongoose
    if (!id.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({ message: "Invalid project ID." });
    }

    // Removed userId requirement to look purely for the item ID
    const deleted = await Project.findOneAndDelete({ _id: id });

    if (!deleted) {
      return res.status(404).json({ message: "Project not found." });
    }

    res.status(200).json({ message: "Project deleted successfully.", id });
  } catch (err) {
    res.status(500).json({ message: "Failed to delete project.", error: err.message });
  }
});

module.exports = router;
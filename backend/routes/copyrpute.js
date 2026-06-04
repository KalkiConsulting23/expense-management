const express = require("express");
const router  = express.Router();
const Project = require("../models/project");

// POST /api/project/add
router.post("/add", async (req, res) => {
  try {
    const {
      projectName,
      projectType,
      expectedAmount,
      currency,
      rate,
      hours,
      days,
      startDate,
      endDate,
    } = req.body;

    // ── Basic required field check ──
    if (!projectName || !projectName.trim()) {
      return res.status(400).json({ message: "projectName is required" });
    }
    if (!projectType || !["hourly", "daily", "monthly"].includes(projectType)) {
      return res.status(400).json({ message: "projectType must be hourly, daily, or monthly" });
    }
    if (expectedAmount == null || isNaN(Number(expectedAmount)) || Number(expectedAmount) < 0) {
      return res.status(400).json({ message: "expectedAmount is required and must be a non-negative number" });
    }

    // ── startDate & endDate required for ALL types ──
    if (!startDate) return res.status(400).json({ message: "startDate is required" });
    if (!endDate)   return res.status(400).json({ message: "endDate is required" });
    if (endDate < startDate) return res.status(400).json({ message: "endDate must be after startDate" });

    // ── Type-specific required field checks ──
    if (projectType === "hourly") {
      if (rate == null || isNaN(Number(rate))) return res.status(400).json({ message: "rate is required for hourly projects" });
      if (hours == null || isNaN(Number(hours))) return res.status(400).json({ message: "hours is required for hourly projects" });
    }
    if (projectType === "daily") {
      if (rate == null || isNaN(Number(rate))) return res.status(400).json({ message: "rate is required for daily projects" });
      if (days == null || isNaN(Number(days)))  return res.status(400).json({ message: "days is required for daily projects" });
    }

    // ── Build document ──
    const doc = {
      projectName:    projectName.trim(),
      projectType,
      expectedAmount: Number(expectedAmount),
      currency:       currency || "INR",
      receivedAmount: 0,
      startDate,
      endDate,
    };

    if (projectType === "hourly") { doc.rate = Number(rate); doc.hours = Number(hours); }
    if (projectType === "daily")  { doc.rate = Number(rate); doc.days  = Number(days);  }

    const project = new Project(doc);
    await project.save();

    res.status(201).json({ message: "Project added successfully", project });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/project/all
router.get("/all", async (req, res) => {
  try {
    const projects = await Project.find().sort({ createdAt: -1 });
    res.status(200).json(projects);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// DELETE /api/project/delete/:id
router.delete("/delete/:id", async (req, res) => {
  try {
    const project = await Project.findByIdAndDelete(req.params.id);
    if (!project) return res.status(404).json({ message: "Project not found" });
    res.status(200).json({ message: "Project deleted successfully" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// PATCH /api/project/:id/received
router.patch("/:id/received", async (req, res) => {
  try {
    const { receivedAmount } = req.body;

    if (receivedAmount == null || isNaN(receivedAmount) || Number(receivedAmount) < 0) {
      return res.status(400).json({ message: "A valid receivedAmount is required" });
    }

    const project = await Project.findByIdAndUpdate(
      req.params.id,
      { receivedAmount: Number(receivedAmount) },
      { new: true }
    );

    if (!project) return res.status(404).json({ message: "Project not found" });

    res.status(200).json({
      message:        "Received amount updated",
      receivedAmount: project.receivedAmount,
      toBeReceived:   Math.max(0, project.expectedAmount - project.receivedAmount),
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
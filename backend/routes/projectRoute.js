const express = require('express');
const router = express.Router();
const Project = require('../models/project');
const { LOGIN_TIME_REGEX } = require('../models/project');
const Staff = require('../models/staff');
const ProjectAttendance = require('../models/projectAttendance');
const { getAuth } = require('@clerk/express');

const isValidId = (id) => /^[0-9a-fA-F]{24}$/.test(String(id));

// Keep only staff IDs that are valid, unique and belong to this admin.
const cleanStaffIds = async (userId, ids) => {
  if (!Array.isArray(ids)) return [];
  const unique = [...new Set(ids.map(String).filter(isValidId))];
  if (unique.length === 0) return [];
  const found = await Staff.find({ _id: { $in: unique }, userId }).select('_id');
  const allowed = new Set(found.map(s => String(s._id)));
  return unique.filter(id => allowed.has(id)); // keep the order they were picked in
};

// Check and tidy the login time / late window sent from the frontend.
// Returns { error } or { values } with only the fields that were sent.
const readTeamFields = (body) => {
  const values = {};
  if (body.loginTime !== undefined) {
    const t = String(body.loginTime || '').trim();
    if (t !== '' && !LOGIN_TIME_REGEX.test(t)) {
      return { error: 'Login time must be in HH:MM format, e.g. 09:00' };
    }
    values.loginTime = t;
  }
  if (body.lateWindowMinutes !== undefined && body.lateWindowMinutes !== '') {
    const n = Number(body.lateWindowMinutes);
    if (!Number.isFinite(n) || n < 0 || n > 240) {
      return { error: 'Late window must be between 0 and 240 minutes' };
    }
    values.lateWindowMinutes = Math.round(n);
  }
  return { values };
};

// ─── ADD PROJECT ───
// Optional team fields: loginTime ("09:00"), lateWindowMinutes (30), assignedStaff ([staffId])
router.post('/add', async (req, res) => {
  try {
    const { userId } = getAuth(req);
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
      daysCycle,
      assignedStaff,
    } = req.body;

    const team = readTeamFields(req.body);
    if (team.error) return res.status(400).json({ message: team.error });

    const newProject = new Project({
      userId,
      projectName,
      projectType,
      startDate,
      endDate,
      expectedAmount: expectedAmount || 0,
      defaultHourlyRate: defaultHourlyRate || 0,
      defaultDailyRate: defaultDailyRate || 0,
      currency: currency || 'INR',
      projectScope: projectScope || 'domestic',
      daysCycle: (daysCycle !== undefined && daysCycle !== null && daysCycle !== '')
        ? Number(daysCycle)
        : 30,
      ...team.values,
      assignedStaff: await cleanStaffIds(userId, assignedStaff),
      monthlyBreakdowns: []
    });

    await newProject.save();
    res.status(201).json(newProject);
  } catch (err) {
    res.status(400).json({ message: "Failed adding project.", error: err.message });
  }
});

// ─── GET ALL PROJECTS (scoped) ───
router.get('/all', async (req, res) => {
  try {
    const { userId } = getAuth(req);
    const projects = await Project.find({ userId });
    res.status(200).json(projects);
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

// ─── UPDATE PROJECT (edit any field) ───
// Body: send only the fields that changed, any of:
//   projectName, projectType, projectScope, currency, startDate, endDate, daysCycle,
//   expectedAmount, defaultHourlyRate, defaultDailyRate   (amounts in INR)
//   loginTime, lateWindowMinutes, assignedStaff
// Monthly breakdowns (amounts already entered / received) are kept as they are.
const PROJECT_TYPES = ['hourly', 'daily', 'monthly'];
const PROJECT_SCOPES = ['domestic', 'international'];
const AMOUNT_FIELDS = ['expectedAmount', 'defaultHourlyRate', 'defaultDailyRate'];

const updateProject = async (req, res) => {
  try {
    const { userId } = getAuth(req);
    const { id } = req.params;
    if (!isValidId(id)) return res.status(400).json({ message: "Invalid project ID." });

    const current = await Project.findOne({ _id: id, userId });
    if (!current) return res.status(404).json({ message: "Project not found." });

    const body = req.body || {};
    const setFields = {};

    if (body.projectName !== undefined) {
      const name = String(body.projectName || '').trim();
      if (!name) return res.status(400).json({ message: "Project name cannot be empty." });
      setFields.projectName = name;
    }
    if (body.projectType !== undefined) {
      if (!PROJECT_TYPES.includes(body.projectType)) {
        return res.status(400).json({ message: "Billing type must be hourly, daily or monthly." });
      }
      setFields.projectType = body.projectType;
    }
    if (body.projectScope !== undefined) {
      if (!PROJECT_SCOPES.includes(body.projectScope)) {
        return res.status(400).json({ message: "Scope must be domestic or international." });
      }
      setFields.projectScope = body.projectScope;
    }
    if (body.currency !== undefined) {
      const cur = String(body.currency || 'INR').trim().toUpperCase();
      if (!/^[A-Z]{3}$/.test(cur)) return res.status(400).json({ message: "Invalid currency." });
      setFields.currency = cur;
    }
    for (const field of ['startDate', 'endDate']) {
      if (body[field] !== undefined) {
        const d = new Date(body[field]);
        if (!body[field] || isNaN(d)) {
          return res.status(400).json({ message: `${field === 'startDate' ? 'Start' : 'End'} date is required.` });
        }
        setFields[field] = d;
      }
    }
    const finalStart = setFields.startDate || current.startDate;
    const finalEnd = setFields.endDate || current.endDate;
    if (finalStart && finalEnd && finalEnd < finalStart) {
      return res.status(400).json({ message: "End date must be after start date." });
    }
    if (body.daysCycle !== undefined) {
      const n = Number(body.daysCycle);
      if (!Number.isFinite(n) || n <= 0) return res.status(400).json({ message: "Enter a valid days cycle." });
      setFields.daysCycle = Math.round(n);
    }
    for (const field of AMOUNT_FIELDS) {
      if (body[field] !== undefined) {
        const n = body[field] === '' || body[field] === null ? 0 : Number(body[field]);
        if (!Number.isFinite(n) || n < 0) return res.status(400).json({ message: `Invalid amount for ${field}.` });
        setFields[field] = n;
      }
    }

    // Login time / late window / staff (same rules as the team popup)
    const team = readTeamFields(body);
    if (team.error) return res.status(400).json({ message: team.error });
    Object.assign(setFields, team.values);
    if (body.assignedStaff !== undefined) {
      setFields.assignedStaff = await cleanStaffIds(userId, body.assignedStaff);
    }
    const finalStaff = setFields.assignedStaff || current.assignedStaff || [];
    const finalTime = setFields.loginTime !== undefined ? setFields.loginTime : current.loginTime;
    if (finalStaff.length > 0 && !finalTime) {
      return res.status(400).json({ message: "Set a login time for the assigned staff." });
    }

    if (Object.keys(setFields).length === 0) {
      return res.status(400).json({ message: "Nothing to update." });
    }

    const updated = await Project.findOneAndUpdate(
      { _id: id, userId },
      { $set: setFields },
      { new: true, runValidators: true }
    );
    if (!updated) return res.status(404).json({ message: "Project not found." });

    res.status(200).json(updated);
  } catch (err) {
    if (err && (err.name === 'ValidationError' || err.name === 'CastError')) {
      return res.status(400).json({ message: err.message });
    }
    res.status(500).json({ message: "Failed updating project.", error: err.message });
  }
};

router.patch('/update/:id', updateProject);
router.put('/update/:id', updateProject);

// ─── UPDATE TEAM (assigned staff, login time, late window) ───
// Body (send any of): { assignedStaff: [staffId], loginTime: "09:00", lateWindowMinutes: 30 }
router.patch('/team/:id', async (req, res) => {
  try {
    const { userId } = getAuth(req);
    const { id } = req.params;
    if (!isValidId(id)) return res.status(400).json({ message: "Invalid project ID." });

    const team = readTeamFields(req.body);
    if (team.error) return res.status(400).json({ message: team.error });

    const setFields = { ...team.values };
    if (req.body.assignedStaff !== undefined) {
      setFields.assignedStaff = await cleanStaffIds(userId, req.body.assignedStaff);
    }
    if (Object.keys(setFields).length === 0) {
      return res.status(400).json({ message: "Nothing to update." });
    }
    if (setFields.assignedStaff && setFields.assignedStaff.length > 0) {
      // Staff need a login time to log in to a project
      const current = await Project.findOne({ _id: id, userId }).select('loginTime');
      if (!current) return res.status(404).json({ message: "Project not found." });
      const finalTime = setFields.loginTime !== undefined ? setFields.loginTime : current.loginTime;
      if (!finalTime) {
        return res.status(400).json({ message: "Set a login time before assigning staff." });
      }
    }

    const updated = await Project.findOneAndUpdate(
      { _id: id, userId },
      { $set: setFields },
      { new: true, runValidators: true }
    );
    if (!updated) return res.status(404).json({ message: "Project not found." });

    res.status(200).json(updated);
  } catch (err) {
    res.status(500).json({ message: "Failed updating project team.", error: err.message });
  }
});

// ─── SYNC MONTH ───
router.patch('/sync-month/:id', async (req, res) => {
  try {
    const { userId } = getAuth(req);
    const { id } = req.params;
    const { month, year, amt, paid, metrics } = req.body;

    const project = await Project.findOne({ _id: id, userId });
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

    const updatedProject = await Project.findOneAndUpdate(
      { _id: id, userId },
      updateQuery,
      { new: true }
    );
    res.status(200).json(updatedProject);
  } catch (err) {
    res.status(500).json({ message: "Failed updating breakdown.", error: err.message });
  }
});

// ─── DELETE PROJECT ───
router.delete('/delete/:id', async (req, res) => {
  try {
    const { userId } = getAuth(req);
    const { id } = req.params;

    if (!isValidId(id)) {
      return res.status(400).json({ message: "Invalid project ID." });
    }

    const deleted = await Project.findOneAndDelete({ _id: id, userId });

    if (!deleted) {
      return res.status(404).json({ message: "Project not found." });
    }

    // Its project attendance goes with it
    await ProjectAttendance.deleteMany({ userId, projectId: id });

    res.status(200).json({ message: "Project deleted successfully.", id });
  } catch (err) {
    res.status(500).json({ message: "Failed to delete project.", error: err.message });
  }
});

module.exports = router;
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

// Check and tidy the tax and currency fields (GST / TDS apply to domestic AND international).
// Returns { error } or { values } with only the fields that were sent.
const readTaxFields = (body) => {
  const values = {};
  if (body.gstApplicable !== undefined) values.gstApplicable = Boolean(body.gstApplicable);
  // International projects added from now on keep amounts in their own currency
  if (body.amountsInForeignCurrency !== undefined) values.amountsInForeignCurrency = Boolean(body.amountsInForeignCurrency);
  // Starting exchange rate (₹ for 1 unit), pre-fills each month in the Project Tracker
  if (body.defaultFxRate !== undefined) {
    if (body.defaultFxRate === '' || body.defaultFxRate === null) {
      values.defaultFxRate = null;
    } else {
      const r = Number(body.defaultFxRate);
      if (!Number.isFinite(r) || r <= 0) return { error: 'Exchange rate must be more than 0' };
      values.defaultFxRate = Math.round(r * 10000) / 10000;
    }
  }
  if (body.tdsPercent !== undefined) {
    const n = body.tdsPercent === '' || body.tdsPercent === null ? 0 : Number(body.tdsPercent);
    if (!Number.isFinite(n) || n < 0 || n > 100) return { error: 'TDS must be between 0 and 100%' };
    values.tdsPercent = Math.round(n * 100) / 100;
  }
  return { values };
};

// ─── Staff rates ───
const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

// Body staffRates [{ staffId, rate }] → valid, unique staff of this admin with a rate ≥ 0.
// Returns { error } or { values: [{ staffId, rate }] } in the order they were picked.
const readStaffRates = async (userId, list) => {
  if (!Array.isArray(list)) return { error: 'staffRates must be a list.' };
  const seen = new Set();
  const out = [];
  for (const item of list) {
    const id = String((item && item.staffId) || '');
    if (!isValidId(id) || seen.has(id)) continue;
    const raw = item.rate;
    const rate = raw === '' || raw === null || raw === undefined ? 0 : Number(raw);
    if (!Number.isFinite(rate) || rate < 0) return { error: 'Staff rates must be 0 or more.' };
    seen.add(id);
    out.push({ staffId: id, rate: round2(rate) });
  }
  const allowed = new Set(await cleanStaffIds(userId, out.map(r => r.staffId)));
  return { values: out.filter(r => allowed.has(r.staffId)) };
};

// The list sent is the whole current team. Anyone on the old list who isn't sent
// stays as inactive with their rate kept, so months they already worked bill correctly.
const mergeStaffRates = (existing, incoming) => {
  const sent = new Set(incoming.map(r => r.staffId));
  const merged = incoming.map(r => ({ staffId: r.staffId, rate: r.rate, active: true }));
  (existing || []).forEach(r => {
    const id = String(r.staffId);
    if (!sent.has(id)) merged.push({ staffId: id, rate: Number(r.rate) || 0, active: false });
  });
  return merged;
};

const activeStaffIds = (rates) => rates.filter(r => r.active !== false).map(r => String(r.staffId));

// Total of the active team's rates → the project's expected amount / default rate
const teamTotals = (rates, projectType) => {
  const total = round2(rates.filter(r => r.active !== false).reduce((s, r) => s + (Number(r.rate) || 0), 0));
  return {
    expectedAmount:    projectType === 'monthly' ? total : 0,
    defaultDailyRate:  projectType === 'daily' ? total : 0,
    defaultHourlyRate: projectType === 'hourly' ? total : 0,
  };
};

// Plain copy of a project's saved rates
const savedRates = (project) => (project.staffRates || []).map(r => ({
  staffId: String(r.staffId), rate: Number(r.rate) || 0, active: r.active !== false,
}));

// Work out the new team from a request body (staffRates, or the older assignedStaff list).
// Returns { error }, or { rates, assignedStaff } when the team was sent, or {} when it wasn't.
const readTeam = async (userId, body, current) => {
  const before = current ? savedRates(current) : [];
  if (body.staffRates !== undefined) {
    const sr = await readStaffRates(userId, body.staffRates);
    if (sr.error) return { error: sr.error };
    const rates = mergeStaffRates(before, sr.values);
    return { rates, assignedStaff: activeStaffIds(rates) };
  }
  if (body.assignedStaff !== undefined) {
    const ids = await cleanStaffIds(userId, body.assignedStaff);
    if (before.length === 0) return { rates: null, assignedStaff: ids }; // older project without rates
    // Keep each person's saved rate; anyone new starts at 0
    const rateOf = new Map(before.map(r => [r.staffId, r.rate]));
    const rates = mergeStaffRates(before, ids.map(id => ({ staffId: id, rate: rateOf.get(id) || 0 })));
    return { rates, assignedStaff: ids };
  }
  return {};
};

// ─── ADD PROJECT ───
// Team fields: loginTime ("09:00"), lateWindowMinutes (30),
//   staffRates ([{ staffId, rate }]) — the project amount is the total of these rates.
//   (assignedStaff + expectedAmount / default rates are still accepted from older screens.)
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
    } = req.body;

    const team = readTeamFields(req.body);
    if (team.error) return res.status(400).json({ message: team.error });
    const tax = readTaxFields(req.body);
    if (tax.error) return res.status(400).json({ message: tax.error });

    const teamSent = await readTeam(userId, req.body, null);
    if (teamSent.error) return res.status(400).json({ message: teamSent.error });
    const staffIds = teamSent.assignedStaff || [];
    if (staffIds.length > 0 && !team.values.loginTime) {
      return res.status(400).json({ message: "Set a login time for the assigned staff." });
    }
    // With staff rates, the amounts are the team totals (not typed in)
    const rateFields = teamSent.rates && teamSent.rates.length
      ? { staffRates: teamSent.rates, ...teamTotals(teamSent.rates, projectType) }
      : {};

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
      ...tax.values,
      assignedStaff: staffIds,
      ...rateFields,
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
//   expectedAmount, defaultHourlyRate, defaultDailyRate
//     (₹ for domestic; the project's currency for new international projects)
//   loginTime, lateWindowMinutes, assignedStaff
//   gstApplicable, tdsPercent, amountsInForeignCurrency, defaultFxRate
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

    // GST / TDS / currency
    const tax = readTaxFields(body);
    if (tax.error) return res.status(400).json({ message: tax.error });
    Object.assign(setFields, tax.values);

    // Login time / late window / staff (same rules as the team popup)
    const team = readTeamFields(body);
    if (team.error) return res.status(400).json({ message: team.error });
    Object.assign(setFields, team.values);

    // Staff and their rates
    const teamSent = await readTeam(userId, body, current);
    if (teamSent.error) return res.status(400).json({ message: teamSent.error });
    if (teamSent.assignedStaff) setFields.assignedStaff = teamSent.assignedStaff;
    const finalRates = teamSent.rates || savedRates(current);
    if (teamSent.rates) setFields.staffRates = teamSent.rates;
    // Projects billed by staff rates: the amounts are always the team totals
    if (finalRates.length > 0) {
      const finalType = setFields.projectType || current.projectType;
      Object.assign(setFields, teamTotals(finalRates, finalType));
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

// ─── UPDATE TEAM (staff + rates, login time, late window) ───
// Body (send any of): { staffRates: [{ staffId, rate }], loginTime: "09:00", lateWindowMinutes: 30 }
//   (assignedStaff: [staffId] still works; it keeps each person's saved rate)
router.patch('/team/:id', async (req, res) => {
  try {
    const { userId } = getAuth(req);
    const { id } = req.params;
    if (!isValidId(id)) return res.status(400).json({ message: "Invalid project ID." });

    const team = readTeamFields(req.body);
    if (team.error) return res.status(400).json({ message: team.error });

    const current = await Project.findOne({ _id: id, userId }).select('loginTime projectType staffRates assignedStaff');
    if (!current) return res.status(404).json({ message: "Project not found." });

    const setFields = { ...team.values };
    const teamSent = await readTeam(userId, req.body, current);
    if (teamSent.error) return res.status(400).json({ message: teamSent.error });
    if (teamSent.assignedStaff) setFields.assignedStaff = teamSent.assignedStaff;
    if (teamSent.rates) {
      setFields.staffRates = teamSent.rates;
      Object.assign(setFields, teamTotals(teamSent.rates, current.projectType));
    }
    if (Object.keys(setFields).length === 0) {
      return res.status(400).json({ message: "Nothing to update." });
    }
    if (setFields.assignedStaff && setFields.assignedStaff.length > 0) {
      // Staff need a login time to log in to a project
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

// ─── REMOVE ONE PERSON FROM A PROJECT ───
// Body: { staffId, fromYear, fromMonth }  (month 0 = Jan)
// Takes them off the team (their rate is kept for months already worked) and deletes
// their attendance on this project from that month onward. Earlier months stay as billed.
router.patch('/remove-staff/:id', async (req, res) => {
  try {
    const { userId } = getAuth(req);
    const { id } = req.params;
    const { staffId } = req.body || {};
    if (!isValidId(id)) return res.status(400).json({ message: "Invalid project ID." });
    if (!isValidId(staffId)) return res.status(400).json({ message: "Invalid staff ID." });
    const fromYear = Number(req.body.fromYear);
    const fromMonth = Number(req.body.fromMonth);
    if (!Number.isInteger(fromYear) || !Number.isInteger(fromMonth) || fromMonth < 0 || fromMonth > 11) {
      return res.status(400).json({ message: "fromYear and fromMonth are required." });
    }

    const project = await Project.findOne({ _id: id, userId });
    if (!project) return res.status(404).json({ message: "Project not found." });

    const sid = String(staffId);
    const setFields = {
      assignedStaff: (project.assignedStaff || []).map(String).filter(x => x !== sid),
    };
    const rates = savedRates(project);
    if (rates.length > 0) {
      setFields.staffRates = rates.map(r => (r.staffId === sid ? { ...r, active: false } : r));
      Object.assign(setFields, teamTotals(setFields.staffRates, project.projectType));
    }

    const updated = await Project.findOneAndUpdate(
      { _id: id, userId },
      { $set: setFields },
      { new: true, runValidators: true }
    );

    const removed = await ProjectAttendance.deleteMany({
      userId,
      projectId: id,
      staffId: sid,
      $or: [
        { year: { $gt: fromYear } },
        { year: fromYear, month: { $gte: fromMonth } },
      ],
    });

    res.status(200).json({ project: updated, attendanceRemoved: removed.deletedCount || 0 });
  } catch (err) {
    res.status(500).json({ message: "Failed removing staff from project.", error: err.message });
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
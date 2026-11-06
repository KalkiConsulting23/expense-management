import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';

// ─────────────────────────────────────────────────────────────
//  PROJECT TRACKER — one table per month
//  Columns: Project · Gross Amount · GST 18% · TDS % · Invoice Amount ·
//           TDS · To Be Received · Received · Deduction
//
//  Gross Amount
//    monthly → the expected amount (not divided by days)
//    daily   → daily rate × days worked
//    hourly  → hourly rate × working days × 8 hours
//  International  = amounts in the project's currency × that month's exchange rate (₹)
//  GST            = 18% of gross (projects with GST on — domestic or international)
//  Invoice Amount = gross + GST
//  TDS            = gross × TDS %   (TDS % entered per month)
//  To Be Received = gross + GST − TDS
//  Deduction      = To Be Received − Received
// ─────────────────────────────────────────────────────────────

const CAL_MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const MONTH_FULL = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const FY_ORDER = [3,4,5,6,7,8,9,10,11,0,1,2]; // Apr → Mar
const PROJECT_CACHE_KEY = 'local_project_data_cache';
const API_BASE = import.meta.env.VITE_API_BASE;
const GST_RATE = 0.18;
const HOURS_PER_DAY = 8;

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const fmt = (n) => {
  const v = round2(n);
  return (v < 0 ? '−₹' : '₹') + Math.abs(v).toLocaleString('en-IN', { maximumFractionDigits: 2 });
};
// Money in the project's own currency, e.g. "$1,250" (international projects)
const CURRENCY_SYMBOLS = { INR: '₹', USD: '$', EUR: '€', GBP: '£', AED: 'AED ', SGD: 'S$' };
const fmtCur = (n, cur) => {
  const sym = CURRENCY_SYMBOLS[cur] || `${cur || ''} `;
  return sym + round2(n).toLocaleString('en-US', { maximumFractionDigits: 2 });
};
const numOr = (v, fallback) => (v === undefined || v === null || v === '' || !Number.isFinite(Number(v)) ? fallback : Number(v));

// FY start year for a calendar date (Jan–Mar belong to the previous FY)
const fyStartYearForDate = (calYear, monthIndex) => (monthIndex >= 3 ? calYear : calYear - 1);
const fyLabel = (fy) => `${fy}-${String((fy + 1) % 100).padStart(2, '0')}`;
const calYearInFY = (monthIndex, fy) => (monthIndex >= 3 ? fy : fy + 1);

function parseUTCDate(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d)) return null;
  return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

// Is the project running at any point in this calendar month?
function isMonthActive(project, monthIndex, year) {
  const start = parseUTCDate(project.startDate);
  if (!start) return false;
  const end = parseUTCDate(project.endDate);
  const monthStart = new Date(year, monthIndex, 1);
  const monthEnd = new Date(year, monthIndex + 1, 0);
  if (monthEnd < start) return false;
  if (end && monthStart > end) return false;
  return true;
}

const isDomestic = (p) => (p.projectScope || 'domestic') === 'domestic';
const findBreakdown = (p, monthIndex, year) =>
  (p.monthlyBreakdowns || []).find(b => b.month === CAL_MONTHS[monthIndex] && Number(b.year) === Number(year));

// ─── Days worked come from the Attendance Tracker (project rows) ───
// Present / Late = 1 day, Half Day = 0.5, Absent / Leave = 0.
// For a project with several staff, days are added up (person-days).
const DAY_VALUE = { present: 1, late: 1, halfday: 0.5 };

// Mon–Fri in the month, minus company holidays
function workingDaysIn(year, monthIndex, holidaySet) {
  const dim = new Date(year, monthIndex + 1, 0).getDate();
  let n = 0;
  for (let d = 1; d <= dim; d++) {
    const wd = new Date(year, monthIndex, d).getDay();
    if (wd !== 0 && wd !== 6 && !holidaySet.has(d)) n++;
  }
  return n;
}

// /attendance/month response → { workingDays, byProject: { projectId: { days, staff:Set } } }
function summariseAttendance(data, year, monthIndex) {
  const holidaySet = new Set((data.holidays || []).map(h => Number(h.day)));
  const byProject = {};
  (data.projectAttendance || []).forEach(sheet => {
    const pid = String(sheet.projectId);
    const entry = byProject[pid] || (byProject[pid] = { days: 0, staff: new Set() });
    let personDays = 0;
    Object.values(sheet.days || {}).forEach(v => { personDays += DAY_VALUE[v && v.status] || 0; });
    entry.days += personDays;
    if (Object.keys(sheet.days || {}).length) entry.staff.add(String(sheet.staffId));
  });
  return { workingDays: workingDaysIn(year, monthIndex, holidaySet), byProject };
}

// Everything shown in one row: project p in one month.
// att = summariseAttendance(...) for that month (null while loading).
// `over` lets the editor preview unsaved values (Received, exchange rate).
function computeRow(p, monthIndex, year, att, over = {}) {
  const bd = findBreakdown(p, monthIndex, year) || {};
  const type = (p.projectType || 'monthly').toLowerCase();
  const domestic = isDomestic(p);
  // New international projects keep their rate in their own currency; each month has its own ₹ rate
  const foreign = !domestic && Boolean(p.amountsInForeignCurrency);
  const currency = p.currency || 'INR';
  const loaded = Boolean(att);

  // Staff on the project this month: assigned now + anyone with attendance on it
  const stats = (att && att.byProject[String(p._id)]) || { days: 0, staff: new Set() };
  const staffIds = new Set([...(p.assignedStaff || []).map(String), ...stats.staff]);
  const staffCount = staffIds.size;
  const days = round2(stats.days);                  // person-days worked
  const workingDays = att ? att.workingDays : 0;

  let rate = 0, hoursPerDay = HOURS_PER_DAY, gross = 0, fullMonth = false;
  if (type === 'monthly') {
    const expected = Number(p.expectedAmount) || 0;
    if (staffCount === 0) {
      gross = expected;                              // nobody to take attendance from → full amount
      fullMonth = true;
    } else {
      gross = workingDays > 0 ? expected * days / (workingDays * staffCount) : 0;
    }
  } else if (type === 'daily') {
    rate = numOr(bd.dailyRate, Number(p.defaultDailyRate) || 0);
    gross = rate * days;
  } else {
    rate = numOr(bd.hourlyRate, Number(p.defaultHourlyRate) || 0);
    gross = rate * days * hoursPerDay;
  }

  // International: gross so far is in the project's currency → turn it into ₹ with this month's rate
  const grossForeign = foreign ? gross : null;
  const fxRate = foreign ? numOr(over.fxRate, numOr(bd.fxRate, numOr(p.defaultFxRate, 0))) : 1;
  const needsRate = foreign && !(fxRate > 0);
  if (foreign) gross = needsRate ? 0 : gross * fxRate;

  const gstOn = Boolean(p.gstApplicable);                 // domestic and international
  const tdsPercent = Number(p.tdsPercent) || 0;           // set on the project, not per month
  const gst = gstOn ? gross * GST_RATE : 0;
  const invoice = gross + gst;
  const tds = gross * tdsPercent / 100;
  const toReceive = gross + gst - tds;
  const received = numOr(over.paid, numOr(bd.paid, 0));
  const hasReceived = received > 0;

  return {
    type, domestic, gstOn, rate, days, hoursPerDay, tdsPercent,
    foreign, currency, fxRate, needsRate, grossForeign: grossForeign === null ? null : round2(grossForeign),
    loaded, staffCount, workingDays, fullMonth,
    gross: round2(gross), gst: round2(gst), invoice: round2(invoice),
    tds: round2(tds), toReceive: round2(toReceive), received: round2(received),
    deduction: hasReceived ? round2(toReceive - received) : null,
    saved: Boolean(findBreakdown(p, monthIndex, year)),
    savedAmt: bd.amt !== undefined ? round2(bd.amt) : null,
  };
}

// "09:00" → "9:00 AM"
const fmtTime12 = (hhmm) => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || ''));
  if (!m) return '';
  const h = Number(m[1]);
  return `${((h + 11) % 12) + 1}:${m[2]} ${h < 12 ? 'AM' : 'PM'}`;
};
// "09:00" + 30 → "09:30"
const addMinutes = (hhmm, mins) => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || ''));
  if (!m) return '';
  const t = Math.min(24 * 60 - 1, Number(m[1]) * 60 + Number(m[2]) + Number(mins || 0));
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
};
const staffName = (s) => `${s.firstName || ''} ${s.lastName || ''}`.trim() || s.employeeId || 'Staff';

function ProjectAvatar({ name = '' }) {
  const palette = ['#4f46e5','#0891b2','#7c3aed','#0d9488','#2563eb','#db2777','#ea580c','#059669'];
  const color   = palette[name.charCodeAt(0) % palette.length];
  const initials = name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
  return (
    <div style={{
      width: 32, height: 32, borderRadius: 10, flexShrink: 0,
      background: color + '18', border: `1.5px solid ${color}40`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: 11, fontWeight: 600, color,
      fontFamily: "'Inter', sans-serif", letterSpacing: 0.3,
    }}>
      {initials}
    </div>
  );
}

const ProjectTable = () => {
  const navigate = useNavigate();
  const now = new Date();
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Which table(s) to show: "m-2026-10" = one month (0 = Jan), "fy-2026" = every month of FY 2026-27
  const [view, setView] = useState(`m-${now.getFullYear()}-${now.getMonth()}`);

  // Cells being typed in: key `${projectId}|${month}|${year}|${field}` → text
  const [drafts, setDrafts] = useState({});
  const [savingRow, setSavingRow] = useState(null);
  // Attendance per month: "2026-10" → { status: 'loading' | 'ok' | 'error', summary }
  const [attByMonth, setAttByMonth] = useState({});
  const syncedRef = React.useRef(new Set()); // rows already brought up to date this visit
  const [toast, setToast] = useState(null);

  // ─── DELETE STATE ───
  const [deleteConfirm, setDeleteConfirm] = useState(null); // { project }
  const [deleting, setDeleting] = useState(false);

  // ─── TEAM STATE (⋯ button: assigned staff + login time) ───
  const [staffList, setStaffList] = useState([]);
  const [teamProject, setTeamProject] = useState(null);
  const [teamLoginTime, setTeamLoginTime] = useState('');
  const [teamLateWindow, setTeamLateWindow] = useState('30');
  const [teamSelected, setTeamSelected] = useState([]);
  const [teamSearch, setTeamSearch] = useState('');
  const [teamSaving, setTeamSaving] = useState(false);
  const [teamError, setTeamError] = useState('');

  const showToast = (type, msg) => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 2800);
  };

  // ─── LOAD PROJECTS ───
  useEffect(() => {
    const fetchProjects = async () => {
      try {
        const cached = sessionStorage.getItem(PROJECT_CACHE_KEY);
        if (cached) {
          setProjects(JSON.parse(cached));
          setLoading(false);
          return;
        }
        const res = await fetch(`${API_BASE}/project/all`);
        if (!res.ok) throw new Error('bad status');
        const data = await res.json();
        const list = Array.isArray(data) ? data : [];
        sessionStorage.setItem(PROJECT_CACHE_KEY, JSON.stringify(list));
        setProjects(list);
      } catch (err) {
        setError('Failed to load projects.');
      } finally {
        setLoading(false);
      }
    };
    fetchProjects();
  }, []);

  const saveProjects = (next) => {
    sessionStorage.setItem(PROJECT_CACHE_KEY, JSON.stringify(next));
    return next;
  };

  // Staff list for the team popup and the "assigned" badges
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/staff/all`);
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) setStaffList(Array.isArray(data) ? data : []);
      } catch (e) { /* the badges just won't show names */ }
    })();
    return () => { cancelled = true; };
  }, []);

  // ─── TEAM POPUP ───
  const openTeam = (project) => {
    setTeamProject(project);
    setTeamLoginTime(project.loginTime || '');
    setTeamLateWindow(String(project.lateWindowMinutes ?? 30));
    setTeamSelected((project.assignedStaff || []).map(String));
    setTeamSearch('');
    setTeamError('');
  };

  const toggleTeamStaff = (id) => {
    setTeamSelected(sel => (sel.includes(id) ? sel.filter(x => x !== id) : [...sel, id]));
  };

  const saveTeam = async () => {
    if (!teamProject) return;
    if (teamSelected.length > 0 && !teamLoginTime) {
      setTeamError('Set a login time before assigning staff.');
      return;
    }
    setTeamSaving(true);
    setTeamError('');
    try {
      const res = await fetch(`${API_BASE}/project/team/${teamProject._id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          loginTime: teamLoginTime,
          lateWindowMinutes: teamLateWindow === '' ? 30 : Number(teamLateWindow) || 0,
          assignedStaff: teamSelected,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || 'Failed to save team');
      setProjects(prev => {
        const next = prev.map(p => (p._id === teamProject._id
          ? { ...p, loginTime: data.loginTime, lateWindowMinutes: data.lateWindowMinutes, assignedStaff: data.assignedStaff }
          : p));
        sessionStorage.setItem(PROJECT_CACHE_KEY, JSON.stringify(next));
        return next;
      });
      setTeamProject(null);
    } catch (err) {
      setTeamError(err.message);
    } finally {
      setTeamSaving(false);
    }
  };

  // Close the team popup with Esc
  useEffect(() => {
    if (!teamProject) return;
    const onKey = (e) => { if (e.key === 'Escape' && !teamSaving) setTeamProject(null); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [teamProject, teamSaving]);

  // ─── DELETE HANDLER ───
  const confirmDelete = async () => {
    if (!deleteConfirm) return;
    const { project } = deleteConfirm;
    setDeleting(true);
    try {
      const res = await fetch(`${API_BASE}/project/delete/${project._id}`, { method: 'DELETE' });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || 'Delete failed');
      }
      setProjects(prev => saveProjects(prev.filter(p => p._id !== project._id)));
      setDeleteConfirm(null);
    } catch (err) {
      alert(`Failed to delete project: ${err.message}`);
    } finally {
      setDeleting(false);
    }
  };

  // ─── MONTH OPTIONS (from the earliest project start to the latest end) ───
  const monthOptions = useMemo(() => {
    let min = new Date(now.getFullYear(), now.getMonth(), 1);
    let max = new Date(now.getFullYear(), now.getMonth(), 1);
    projects.forEach(p => {
      const s = parseUTCDate(p.startDate);
      const e = parseUTCDate(p.endDate);
      if (s && s < min) min = new Date(s.getFullYear(), s.getMonth(), 1);
      if (e && e > max) max = new Date(e.getFullYear(), e.getMonth(), 1);
    });
    const byFY = {};
    const cur = new Date(min);
    while (cur <= max) {
      const y = cur.getFullYear(), m = cur.getMonth();
      const fy = fyStartYearForDate(y, m);
      (byFY[fy] = byFY[fy] || []).push({ year: y, month: m });
      cur.setMonth(cur.getMonth() + 1);
    }
    return Object.keys(byFY).map(Number).sort((a, b) => b - a).map(fy => ({ fy, months: byFY[fy] }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projects]);

  // The month tables to draw for the current view
  const tablesToShow = useMemo(() => {
    if (view.startsWith('fy-')) {
      const fy = Number(view.slice(3));
      return FY_ORDER.map(m => ({ year: calYearInFY(m, fy), month: m }));
    }
    const [, y, m] = view.split('-');
    return [{ year: Number(y), month: Number(m) }];
  }, [view]);

  // Load attendance (days worked + holidays) for every month on screen
  useEffect(() => {
    tablesToShow.forEach(({ year, month }) => {
      const key = `${year}-${month}`;
      if (attByMonth[key]) return;
      setAttByMonth(a => ({ ...a, [key]: { status: 'loading' } }));
      fetch(`${API_BASE}/attendance/month?year=${year}&month=${month}`)
        .then(r => { if (!r.ok) throw new Error('bad status'); return r.json(); })
        .then(data => setAttByMonth(a => ({ ...a, [key]: { status: 'ok', summary: summariseAttendance(data, year, month) } })))
        .catch(() => setAttByMonth(a => ({ ...a, [key]: { status: 'error' } })));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tablesToShow]);

  const attFor = (year, month) => {
    const a = attByMonth[`${year}-${month}`];
    return a && a.status === 'ok' ? a.summary : null;
  };

  const stepMonth = (delta) => {
    const [, y, m] = view.startsWith('m-') ? view.split('-') : ['', now.getFullYear(), now.getMonth()];
    const d = new Date(Number(y), Number(m) + delta, 1);
    setView(`m-${d.getFullYear()}-${d.getMonth()}`);
  };

  // ─── EDITING (days worked · TDS % · received) ───
  const draftKey = (p, month, year, field) => `${p._id}|${month}|${year}|${field}`;
  const getDraft = (p, month, year, field) => drafts[draftKey(p, month, year, field)];
  const setDraft = (p, month, year, field, value) =>
    setDrafts(d => ({ ...d, [draftKey(p, month, year, field)]: value }));
  const clearDrafts = (p, month, year) =>
    setDrafts(d => {
      const out = { ...d };
      Object.keys(out).forEach(k => { if (k.startsWith(`${p._id}|${month}|${year}|`)) delete out[k]; });
      return out;
    });

  // Values typed but not yet saved, as numbers (for live preview)
  const overridesFor = (p, month, year) => {
    const o = {};
    ['paid', 'fxRate'].forEach(f => {
      const v = getDraft(p, month, year, f);
      if (v !== undefined) o[f] = v === '' ? 0 : Number(v);
    });
    return o;
  };

  // Save one row. Called when Received is changed, and automatically when the
  // amounts worked out from attendance differ from what's saved (keeps Project Master in step).
  const commitRow = async (p, month, year, { auto = false } = {}) => {
    const att = attFor(year, month);
    if (!att) return; // wait until attendance has loaded
    const over = auto ? {} : overridesFor(p, month, year);
    if (!auto) {
      if (Object.keys(over).length === 0) return;
      if ('paid' in over && (!Number.isFinite(over.paid) || over.paid < 0)) {
        showToast('error', 'Enter a valid received amount');
        clearDrafts(p, month, year);
        return;
      }
      if ('fxRate' in over && !(Number.isFinite(over.fxRate) && over.fxRate > 0)) {
        showToast('error', 'Exchange rate must be more than 0');
        clearDrafts(p, month, year);
        return;
      }
    }
    const before = computeRow(p, month, year, att);
    const row = computeRow(p, month, year, att, over);
    if (!auto) clearDrafts(p, month, year);
    if (!auto && before.received === row.received && before.fxRate === row.fxRate && before.saved && before.savedAmt === row.toReceive) return;

    const monName = CAL_MONTHS[month];
    const metrics = {
      tdsPercent: row.tdsPercent,
      baseAmount: row.gross,
      gstAmount: row.gst,
      tdsAmount: row.tds,
      invoiceAmount: row.invoice,
    };
    if (row.foreign) Object.assign(metrics, { fxRate: row.fxRate, grossForeign: row.grossForeign });
    metrics.daysWorked = row.days;           // from the Attendance Tracker
    metrics.workingDays = row.workingDays;
    if (row.type === 'daily') metrics.dailyRate = row.rate;
    if (row.type === 'hourly') Object.assign(metrics, {
      hourlyRate: row.rate, hoursPerDay: row.hoursPerDay, hoursWorked: round2(row.days * row.hoursPerDay),
    });
    const breakdown = { month: monName, year, amt: row.toReceive, paid: row.received, ...metrics };

    // Show it straight away
    const prev = projects;
    setProjects(list => saveProjects(list.map(x => {
      if (x._id !== p._id) return x;
      const bds = [...(x.monthlyBreakdowns || [])];
      const i = bds.findIndex(b => b.month === monName && Number(b.year) === year);
      if (i > -1) bds[i] = { ...bds[i], ...breakdown }; else bds.push(breakdown);
      return { ...x, monthlyBreakdowns: bds };
    })));

    if (!auto) setSavingRow(`${p._id}|${month}|${year}`);
    try {
      const res = await fetch(`${API_BASE}/project/sync-month/${p._id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ month: monName, year, amt: row.toReceive, paid: row.received, metrics }),
      });
      if (!res.ok) throw new Error('Could not save');
    } catch (err) {
      setProjects(saveProjects(prev));
      if (!auto) showToast('error', `${p.projectName}: ${err.message}`);
    } finally {
      if (!auto) setSavingRow(null);
    }
  };

  // When attendance changes the amounts, update the saved month record too
  // (so Project Master and the totals stay correct). Once per row per visit.
  useEffect(() => {
    tablesToShow.forEach(({ year, month }) => {
      const att = attFor(year, month);
      if (!att) return;
      projects.forEach(p => {
        if (!isMonthActive(p, month, year)) return;
        const key = `${p._id}|${month}|${year}`;
        if (syncedRef.current.has(key)) return;
        const row = computeRow(p, month, year, att);
        const needsSave = row.saved
          ? row.savedAmt !== row.toReceive
          : row.days > 0;
        if (!needsSave) return;
        syncedRef.current.add(key);
        commitRow(p, month, year, { auto: true });
      });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attByMonth, projects, tablesToShow]);

  const cellInput = (p, month, year, field, shownValue, opts = {}) => {
    const draft = getDraft(p, month, year, field);
    return (
      <input
        className={`pt-inp${opts.wide ? ' wide' : ''}`}
        type="number"
        min="0"
        max={opts.max}
        step="any"
        value={draft !== undefined ? draft : (shownValue || shownValue === 0 ? String(round2(shownValue)) : '')}
        placeholder={opts.placeholder || '0'}
        onChange={e => setDraft(p, month, year, field, e.target.value)}
        onFocus={e => e.target.select()}
        onBlur={() => commitRow(p, month, year)}
        onKeyDown={e => {
          if (e.key === 'Enter') e.currentTarget.blur();
          if (e.key === 'Escape') { clearDrafts(p, month, year); e.currentTarget.blur(); }
        }}
        aria-label={opts.label}
      />
    );
  };

  if (loading) return (
    <div style={{ padding: 40, display: 'flex', alignItems: 'center', gap: 12, fontFamily: "'Inter', sans-serif", color: '#6b7280', background: '#f7f7f8', minHeight: '100vh' }}>
      <div style={{ width: 22, height: 22, border: '2.5px solid #ececec', borderTopColor: '#18181b', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
      Loading projects…
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );

  if (error) return (
    <div style={{ padding: 40, fontFamily: "'Inter', sans-serif", color: '#dc2626', background: '#f7f7f8', minHeight: '100vh' }}>{error}</div>
  );

  // Rows + totals for every table in view
  const tables = tablesToShow.map(({ year, month }) => {
    const att = attFor(year, month);
    const attState = (attByMonth[`${year}-${month}`] || {}).status || 'loading';
    const rows = projects
      .filter(p => isMonthActive(p, month, year))
      .map(p => ({ p, r: computeRow(p, month, year, att, overridesFor(p, month, year)) }));
    const sum = (k) => rows.reduce((s, x) => s + (x.r[k] || 0), 0);
    return {
      year, month, rows, attState, workingDays: att ? att.workingDays : null,
      totals: {
        gross: sum('gross'), gst: sum('gst'), invoice: sum('invoice'), tds: sum('tds'),
        toReceive: sum('toReceive'), received: sum('received'), deduction: sum('deduction'),
      },
    };
  }).filter(t => view.startsWith('m-') || t.rows.length > 0);

  const overall = tables.reduce((a, t) => ({
    invoice: a.invoice + t.totals.invoice, toReceive: a.toReceive + t.totals.toReceive,
    received: a.received + t.totals.received, deduction: a.deduction + t.totals.deduction,
  }), { invoice: 0, toReceive: 0, received: 0, deduction: 0 });

  const viewTitle = view.startsWith('fy-')
    ? `All months · FY ${fyLabel(Number(view.slice(3)))}`
    : `${MONTH_FULL[tablesToShow[0].month]} ${tablesToShow[0].year}`;

  return (
    <div style={{ padding: '32px 24px 60px', background: '#f7f7f8', minHeight: '100vh', fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
        * { box-sizing: border-box; }

        .pt-toolbar { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; margin-bottom: 18px; }
        .pt-filter { display: inline-flex; align-items: center; gap: 8px; }
        .pt-nav-btn {
          width: 34px; height: 34px; border-radius: 9px; border: 1px solid #ececec; background: #fff;
          color: #374151; font-size: 15px; cursor: pointer; display: inline-flex; align-items: center; justify-content: center;
        }
        .pt-nav-btn:hover:not(:disabled) { background: #f4f4f5; }
        .pt-nav-btn:disabled { opacity: 0.35; cursor: default; }
        .pt-select {
          height: 34px; border-radius: 9px; border: 1px solid #ececec; background: #fff; color: #18181b;
          font: inherit; font-size: 13px; font-weight: 500; padding: 0 10px; cursor: pointer; min-width: 200px;
        }
        .pt-select:focus { outline: none; border-color: #18181b; }
        .pt-chips { display: flex; gap: 8px; flex-wrap: wrap; }
        .pt-chip { padding: 4px 12px; border-radius: 20px; font-size: 11.5px; font-weight: 500; border: 1px solid; white-space: nowrap; }

        .pt-card { margin-bottom: 24px; border-radius: 16px; border: 1px solid #ececec; overflow: hidden; background: #fff; box-shadow: 0 1px 3px rgba(16,24,40,0.04); }
        .pt-card-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 13px 20px; background: #fafafa; border-bottom: 1px solid #ececec; flex-wrap: wrap; }
        .pt-card-title { font-size: 14.5px; font-weight: 600; color: #18181b; }
        .pt-card-sub { font-size: 11.5px; color: #6b7280; margin-top: 1px; }
        .pt-scroll { overflow-x: auto; }
        .pt-table { border-collapse: collapse; width: 100%; white-space: nowrap; }
        .pt-table th {
          background: #fafafa; color: #6b7280; font-size: 10.5px; font-weight: 600; letter-spacing: 0.3px;
          text-transform: uppercase; padding: 10px 12px; border-bottom: 1px solid #ececec; text-align: right;
        }
        .pt-table th.left { text-align: left; }
        .pt-table th .pt-th-sub { display: block; font-size: 9.5px; font-weight: 400; text-transform: none; color: #9ca3af; letter-spacing: 0; margin-top: 2px; }
        .pt-table td { padding: 10px 12px; border-bottom: 1px solid #f4f4f5; font-size: 12.5px; color: #18181b; text-align: right; font-variant-numeric: tabular-nums; vertical-align: middle; }
        .pt-table tr:hover td { background: #fcfcfd; }
        .pt-table tr.saving td { opacity: 0.55; }
        .pt-name { position: sticky; left: 0; z-index: 2; background: #fff; text-align: left !important; min-width: 250px; max-width: 280px; border-right: 1px solid #ececec; }
        .pt-table th.pt-name { background: #fafafa; z-index: 3; }
        .pt-table tr:hover td.pt-name { background: #fcfcfd; }
        .pt-gross-sub { display: block; font-size: 10.5px; color: #9ca3af; margin-top: 3px; }
        .pt-gross-edit { display: inline-flex; align-items: center; gap: 4px; justify-content: flex-end; margin-top: 4px; font-size: 10.5px; color: #6b7280; }
        .pt-inp {
          width: 58px; padding: 4px 6px; border: 1px solid #e5e7eb; border-radius: 7px; background: #fff;
          font: inherit; font-size: 12px; text-align: right; color: #18181b; outline: none; font-variant-numeric: tabular-nums;
        }
        .pt-inp.wide { width: 96px; }
        .pt-inp:hover { border-color: #d1d5db; }
        .pt-inp:focus { border-color: #18181b; box-shadow: 0 0 0 3px rgba(24,24,27,0.07); }
        .pt-pct { display: inline-flex; align-items: center; gap: 3px; }
        .c-gst { color: #6b7280; }
        .c-inv { color: #4338ca; font-weight: 600; }
        .c-tds { color: #dc2626; }
        .c-rec { color: #b45309; font-weight: 600; }
        .c-ded-pos { color: #dc2626; font-weight: 600; }
        .c-ded-zero { color: #16a34a; font-weight: 600; }
        .c-muted { color: #d1d5db; }
        .pt-total td { background: #fafafa; font-weight: 700; border-top: 1px solid #ececec; border-bottom: none; }
        .pt-total td.pt-name { background: #fafafa; font-size: 11px; font-weight: 600; color: #6b7280; letter-spacing: 0.3px; text-transform: uppercase; }
        .pt-empty { padding: 34px 20px; text-align: center; color: #9ca3af; font-size: 13px; }
        .pt-type { display: inline-block; background: #eef2ff; border: 1px solid #e0e7ff; color: #4338ca; border-radius: 4px; padding: 1px 5px; font-size: 9px; font-weight: 600; text-transform: uppercase; }
        .pt-legend { margin-top: 6px; font-size: 11px; color: #9ca3af; text-align: center; line-height: 1.7; }
        .pt-toast { position: fixed; bottom: 26px; right: 26px; padding: 12px 16px; border-radius: 12px; font-size: 13px; font-weight: 500; z-index: 9999; background: #fff; box-shadow: 0 8px 28px rgba(16,24,40,0.16); }
        .pt-toast.error { color: #dc2626; border: 1px solid #fecaca; }
        input[type=number].pt-inp::-webkit-inner-spin-button, input[type=number].pt-inp::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }
        input[type=number].pt-inp { -moz-appearance: textfield; }
        @media (max-width: 720px) {
          .pt-name { min-width: 190px; max-width: 200px; }
          .pt-select { min-width: 0; flex: 1; }
          .pt-filter { width: 100%; }
        }

        .proj-modal-overlay {
          position: fixed; top:0; left:0; width:100%; height:100%;
          background: rgba(17,24,39,0.45); display:flex;
          align-items:center; justify-content:center; z-index:100;
          backdrop-filter: blur(4px);
        }
        .proj-modal-box {
          background: #ffffff; padding: 28px 26px; border-radius: 18px; width: 360px;
          box-shadow: 0 24px 60px rgba(16,24,40,0.22);
          border: 1px solid #ececec;
        }
        .proj-modal-field { display:flex; flex-direction:column; gap:6px; margin-bottom:14px; }
        .proj-modal-field label { font-size:12px; color:#4b5563; font-weight:500; letter-spacing:0.2px; font-family:'Inter',sans-serif; }
        .proj-modal-field input {
          padding: 9px 12px; border: 1px solid #ececec; border-radius: 10px;
          font-size: 13px; outline: none; background: #fafafa;
          font-variant-numeric: tabular-nums; color: #18181b;
          transition: border-color 0.15s, box-shadow 0.15s;
        }
        .proj-modal-field input:focus { border-color: #18181b; background: #fff; box-shadow: 0 0 0 3px rgba(24,24,27,0.06); }
        ::-webkit-scrollbar { height: 6px; }
        ::-webkit-scrollbar-track { background: #f1f1f1; }
        ::-webkit-scrollbar-thumb { background: #d1d5db; border-radius: 3px; }

        .add-proj-btn {
          display: flex; align-items: center; gap: 7px;
          padding: 10px 18px; flex-shrink: 0; margin-top: 4px;
          background: #18181b; border: none; border-radius: 10px;
          font-size: 13px; font-weight: 500; color: #fff;
          font-family: 'Inter', sans-serif;
          cursor: pointer;
          transition: background 0.15s, transform 0.1s;
        }
        .add-proj-btn:hover { background: #000; transform: translateY(-1px); }
        .add-proj-btn:active { transform: translateY(0); }

        .delete-proj-btn {
          width: 26px; height: 26px; border-radius: 7px; flex-shrink: 0;
          border: 1px solid transparent; background: transparent;
          display: flex; align-items: center; justify-content: center;
          cursor: pointer; color: #9ca3af;
          transition: background 0.15s, border-color 0.15s, color 0.15s;
          padding: 0;
        }
        .delete-proj-btn:hover {
          background: #fef2f2; border-color: #fecaca; color: #dc2626;
        }

        .team-proj-btn {
          width: 26px; height: 26px; border-radius: 7px; flex-shrink: 0;
          border: 1px solid transparent; background: transparent;
          display: flex; align-items: center; justify-content: center;
          cursor: pointer; color: #9ca3af; padding: 0;
          transition: background 0.15s, border-color 0.15s, color 0.15s;
        }
        .team-proj-btn:hover { background: #eef2ff; border-color: #c7d2fe; color: #4338ca; }
        .team-badge {
          display: inline-flex; align-items: center; gap: 4px; margin-left: 6px;
          background: #f0fdf4; border: 1px solid #bbf7d0; color: #15803d;
          border-radius: 4px; padding: 1px 5px; font-size: 9px; font-weight: 600;
          cursor: pointer;
        }
        .tax-badge {
          display: inline-flex; align-items: center;
          background: #fff7ed; border: 1px solid #fed7aa; color: #c2410c;
          border-radius: 4px; padding: 1px 5px; font-size: 9px; font-weight: 600;
        }
        .team-modal-box {
          background: #ffffff; border-radius: 18px; width: 440px; max-width: calc(100vw - 32px);
          max-height: calc(100vh - 48px); display: flex; flex-direction: column;
          box-shadow: 0 24px 60px rgba(16,24,40,0.22); border: 1px solid #ececec;
          font-family: 'Inter', sans-serif;
        }
        .team-modal-head { padding: 22px 24px 14px; border-bottom: 1px solid #f4f4f5; }
        .team-modal-body { padding: 16px 24px; overflow-y: auto; flex: 1; min-height: 0; }
        .team-modal-foot { padding: 14px 24px; border-top: 1px solid #f4f4f5; display: flex; justify-content: flex-end; gap: 8px; }
        .team-row2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
        .team-rule {
          background: #fafafa; border: 1px solid #ececec; border-radius: 10px;
          padding: 9px 12px; font-size: 11.5px; color: #4b5563; margin: 4px 0 16px; line-height: 1.6;
        }
        .team-chips { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 12px; }
        .team-chip {
          display: inline-flex; align-items: center; gap: 6px; padding: 4px 6px 4px 10px;
          border-radius: 999px; background: #eef2ff; border: 1px solid #e0e7ff; color: #3730a3;
          font-size: 12px; font-weight: 500;
        }
        .team-chip button { border: none; background: transparent; color: #6366f1; cursor: pointer; font-size: 14px; line-height: 1; padding: 0 2px; }
        .team-search {
          width: 100%; padding: 8px 11px; border: 1px solid #ececec; border-radius: 9px;
          font-size: 12.5px; outline: none; margin-bottom: 8px; font-family: inherit;
        }
        .team-search:focus { border-color: #18181b; }
        .team-list { border: 1px solid #ececec; border-radius: 10px; max-height: 230px; overflow-y: auto; }
        .team-item {
          display: flex; align-items: center; gap: 10px; padding: 8px 12px; cursor: pointer;
          border-bottom: 1px solid #f4f4f5; font-size: 12.5px; color: #18181b;
        }
        .team-item:last-child { border-bottom: none; }
        .team-item:hover { background: #fafafa; }
        .team-item input { width: 15px; height: 15px; accent-color: #18181b; cursor: pointer; }
        .team-item .meta { font-size: 10.5px; color: #9ca3af; }
        .team-err { margin-top: 12px; padding: 9px 12px; border-radius: 9px; background: #fef2f2; border: 1px solid #fecaca; color: #b91c1c; font-size: 12px; }

        .delete-modal-box {
          background: #ffffff; padding: 28px 26px; border-radius: 18px; width: 380px;
          box-shadow: 0 24px 60px rgba(16,24,40,0.22);
          border: 1px solid #ececec;
        }

      `}</style>

      {/* Page Header */}
      <div style={{ marginBottom: 22, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 500, letterSpacing: 0.4, textTransform: 'uppercase', color: '#9ca3af', marginBottom: 5 }}>
            Project Tracker
          </div>
          <h2 style={{ fontSize: 26, fontWeight: 600, color: '#18181b', margin: '0 0 4px', letterSpacing: '-0.4px' }}>
            Monthly Billing
          </h2>
          <p style={{ fontSize: 13, color: '#6b7280', margin: 0 }}>
            {projects.length} project{projects.length !== 1 ? 's' : ''} · Days worked come from the Attendance Tracker · Enter the amount received for each month
          </p>
        </div>
        <button className="add-proj-btn" onClick={() => navigate('/project')} type="button">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          Add Project
        </button>
      </div>

      {/* Month filter + totals for what's shown */}
      <div className="pt-toolbar">
        <div className="pt-filter">
          <button className="pt-nav-btn" onClick={() => stepMonth(-1)} disabled={!view.startsWith('m-')} aria-label="Previous month">‹</button>
          <select className="pt-select" value={view} onChange={e => setView(e.target.value)} aria-label="Select month">
            {monthOptions.map(({ fy, months }) => (
              <optgroup key={fy} label={`FY ${fyLabel(fy)}`}>
                <option value={`fy-${fy}`}>All months · FY {fyLabel(fy)}</option>
                {months.map(({ year, month }) => (
                  <option key={`${year}-${month}`} value={`m-${year}-${month}`}>{MONTH_FULL[month]} {year}</option>
                ))}
              </optgroup>
            ))}
          </select>
          <button className="pt-nav-btn" onClick={() => stepMonth(1)} disabled={!view.startsWith('m-')} aria-label="Next month">›</button>
        </div>
        <div className="pt-chips">
          <span className="pt-chip" style={{ background: '#eef2ff', borderColor: '#c7d2fe', color: '#4338ca' }}>Invoiced: {fmt(overall.invoice)}</span>
          <span className="pt-chip" style={{ background: '#fffbeb', borderColor: '#fde68a', color: '#b45309' }}>To Receive: {fmt(overall.toReceive)}</span>
          <span className="pt-chip" style={{ background: '#f0fdf4', borderColor: '#bbf7d0', color: '#16a34a' }}>Received: {fmt(overall.received)}</span>
          <span className="pt-chip" style={{ background: '#fef2f2', borderColor: '#fecaca', color: '#dc2626' }}>Deduction: {fmt(overall.deduction)}</span>
        </div>
      </div>

      {projects.length === 0 ? (
        <div className="pt-card"><div className="pt-empty">No projects yet. Add your first project to see it here.</div></div>
      ) : tables.length === 0 ? (
        <div className="pt-card"><div className="pt-empty">No projects running in {viewTitle}.</div></div>
      ) : tables.map(t => (
        <div key={`${t.year}-${t.month}`} className="pt-card">
          <div className="pt-card-head">
            <div>
              <div className="pt-card-title">{MONTH_FULL[t.month]} {t.year}</div>
              <div className="pt-card-sub">
                {t.rows.length} project{t.rows.length !== 1 ? 's' : ''} running
                {t.workingDays !== null && <> · {t.workingDays} working days</>}
                {t.attState === 'error' && <span style={{ color: '#dc2626' }}> · Couldn't load attendance</span>}
              </div>
            </div>
          </div>

          {t.rows.length === 0 ? (
            <div className="pt-empty">No projects running in {MONTH_FULL[t.month]} {t.year}.</div>
          ) : (
            <div className="pt-scroll">
              <table className="pt-table">
                <thead>
                  <tr>
                    <th className="pt-name left">Project</th>
                    <th>Gross Amount<span className="pt-th-sub">days from attendance · intl × month rate</span></th>
                    <th>GST<span className="pt-th-sub">18% of gross</span></th>
                    <th>TDS %<span className="pt-th-sub">from project</span></th>
                    <th>Invoice Amount<span className="pt-th-sub">gross + GST</span></th>
                    <th>TDS<span className="pt-th-sub">gross × TDS %</span></th>
                    <th>To Be Received<span className="pt-th-sub">gross + GST − TDS</span></th>
                    <th>Received<span className="pt-th-sub">enter</span></th>
                    <th>Deduction<span className="pt-th-sub">to receive − received</span></th>
                  </tr>
                </thead>
                <tbody>
                  {t.rows.map(({ p, r }) => (
                    <tr key={p._id} className={savingRow === `${p._id}|${t.month}|${t.year}` ? 'saving' : ''}>
                      {/* Project name + team / delete */}
                      <td className="pt-name">
                        <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                          <ProjectAvatar name={p.projectName || '?'} />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 13, fontWeight: 500, color: '#18181b', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.projectName}</div>
                            <div style={{ marginTop: 3, display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center' }}>
                              <span className="pt-type">{r.type}</span>
                              {!r.domestic && <span className="pt-type" style={{ background: '#f0f9ff', borderColor: '#bae6fd', color: '#0369a1' }}>Intl{r.foreign ? ` · ${r.currency}` : ''}</span>}
                              {(p.assignedStaff || []).length > 0 && (
                                <span className="team-badge" title="Assigned staff — click to manage" onClick={(e) => { e.stopPropagation(); openTeam(p); }}>
                                  👥 {p.assignedStaff.length}
                                  {p.loginTime ? (Number(p.lateWindowMinutes) === 0 ? ' · Any time' : ` · ${fmtTime12(p.loginTime)}`) : ''}
                                </span>
                              )}
                            </div>
                          </div>
                          <button className="team-proj-btn" title="Team & login time" onClick={(e) => { e.stopPropagation(); openTeam(p); }}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg>
                          </button>
                          <button className="delete-proj-btn" title="Delete project" onClick={(e) => { e.stopPropagation(); setDeleteConfirm({ project: p }); }}>
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
                            </svg>
                          </button>
                        </div>
                      </td>

                      {/* Gross amount (+ days input for daily / hourly) */}
                      <td>
                        <div style={{ fontWeight: 600 }}>
                          {!r.loaded ? '…' : r.needsRate ? <span style={{ color: '#d97706' }}>Set rate →</span> : fmt(r.gross)}
                        </div>
                        <span className="pt-gross-sub" title="Days worked come from the project rows in the Attendance Tracker">
                          {(() => {
                            if (!r.loaded) return 'Loading attendance…';
                            const money = (n) => (r.foreign ? fmtCur(n, r.currency) : fmt(n));
                            const expected = money(Number(p.expectedAmount) || 0);
                            const line = r.type === 'monthly'
                              ? (r.fullMonth
                                  ? `${expected} · no staff assigned`
                                  : r.staffCount > 1
                                    ? `${expected} × ${r.days} ÷ (${r.workingDays} × ${r.staffCount} staff)`
                                    : `${expected} × ${r.days} / ${r.workingDays} working days`)
                              : r.staffCount === 0
                                ? 'No staff assigned'
                                : `${r.days} day${r.days === 1 ? '' : 's'}${r.type === 'hourly' ? ` × ${r.hoursPerDay}h` : ''} × ${money(r.rate)}`;
                            return r.foreign && !r.fullMonth && r.staffCount > 0 ? `${line} = ${fmtCur(r.grossForeign, r.currency)}` : line;
                          })()}
                        </span>
                        {r.foreign && (
                          <span className="pt-gross-edit" title={`Exchange rate for ${MONTH_FULL[t.month]} ${t.year}`}>
                            × ₹{cellInput(p, t.month, t.year, 'fxRate', r.fxRate > 0 ? r.fxRate : '', { placeholder: 'rate', label: `₹ per 1 ${r.currency}` })} / {r.currency}
                          </span>
                        )}
                      </td>

                      <td className="c-gst">{r.gstOn ? fmt(r.gst) : <span className="c-muted" title="GST is off for this project (turn it on in Project Master)">—</span>}</td>

                      <td>
                        <span title="Set when adding / editing the project">{r.tdsPercent}%</span>
                      </td>

                      <td className="c-inv">{fmt(r.invoice)}</td>
                      <td className="c-tds">{r.tds ? `− ${fmt(r.tds)}` : <span className="c-muted">—</span>}</td>
                      <td className="c-rec">{fmt(r.toReceive)}</td>
                      <td>{cellInput(p, t.month, t.year, 'paid', r.received || '', { wide: true, placeholder: '0', label: 'Received' })}</td>
                      <td
                        className={r.deduction === null ? 'c-muted' : r.deduction > 0 ? 'c-ded-pos' : 'c-ded-zero'}
                        title={r.deduction !== null && r.deduction < 0 ? 'Received more than the amount to be received' : undefined}
                      >
                        {r.deduction === null ? '—' : r.deduction < 0 ? `+ ${fmt(-r.deduction)}` : fmt(r.deduction)}
                      </td>
                    </tr>
                  ))}
                  <tr className="pt-total">
                    <td className="pt-name">Total</td>
                    <td>{fmt(t.totals.gross)}</td>
                    <td className="c-gst">{fmt(t.totals.gst)}</td>
                    <td></td>
                    <td className="c-inv">{fmt(t.totals.invoice)}</td>
                    <td className="c-tds">{t.totals.tds ? `− ${fmt(t.totals.tds)}` : '—'}</td>
                    <td className="c-rec">{fmt(t.totals.toReceive)}</td>
                    <td style={{ color: '#16a34a' }}>{fmt(t.totals.received)}</td>
                    <td className={t.totals.deduction > 0 ? 'c-ded-pos' : ''}>{fmt(t.totals.deduction)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </div>
      ))}

      <p className="pt-legend">
        Days = project attendance (Present / Late = 1, Half Day = ½) · Gross: monthly = expected × days ÷ working days · daily = rate × days · hourly = rate × days × {HOURS_PER_DAY}h ·
        International: amount in its currency × the month's rate (₹) ·
        Invoice = gross + GST · To be received = gross + GST − TDS · Deduction = to be received − received
      </p>

      {/* ─── TEAM MODAL (⋯) ─── */}
      {teamProject && (() => {
        const selectedStaff = teamSelected
          .map(id => staffList.find(s => String(s._id) === id) || { _id: id, firstName: 'Removed staff' });
        const q = teamSearch.trim().toLowerCase();
        const shown = staffList.filter(s =>
          !q || `${staffName(s)} ${s.employeeId || ''} ${s.designation || ''}`.toLowerCase().includes(q));
        const lateMins = teamLateWindow === '' ? 30 : (Number(teamLateWindow) || 0);
        return (
          <div className="proj-modal-overlay" onClick={() => !teamSaving && setTeamProject(null)}>
            <div className="team-modal-box" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true">
              <div className="team-modal-head">
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <ProjectAvatar name={teamProject.projectName || '?'} />
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 600, color: '#18181b' }}>{teamProject.projectName} · Team</div>
                    <div style={{ fontSize: 11.5, color: '#6b7280', marginTop: 2 }}>
                      {teamSelected.length} staff assigned
                    </div>
                  </div>
                </div>
              </div>

              <div className="team-modal-body">
                <div className="team-row2">
                  <div className="proj-modal-field" style={{ marginBottom: 8 }}>
                    <label>Daily login time</label>
                    <input type="time" value={teamLoginTime} onChange={e => setTeamLoginTime(e.target.value)} disabled={teamSaving} />
                  </div>
                  <div className="proj-modal-field" style={{ marginBottom: 8 }}>
                    <label>Login window (minutes, 0 = all day)</label>
                    <input type="number" min="0" max="240" value={teamLateWindow} onChange={e => setTeamLateWindow(e.target.value)} disabled={teamSaving} />
                  </div>
                </div>
                {teamLoginTime && teamLateWindow !== '' && Number(teamLateWindow) === 0 ? (
                  <div className="team-rule">
                    Window is <b>0</b> → staff can log in <b>any time</b> during the day and are marked <span style={{ color: '#16a34a', fontWeight: 600 }}>Present</span>.
                  </div>
                ) : teamLoginTime ? (
                  <div className="team-rule">
                    Staff can log in from <b>{fmtTime12(teamLoginTime)}</b> to <b>{fmtTime12(addMinutes(teamLoginTime, lateMins))}</b> = <span style={{ color: '#16a34a', fontWeight: 600 }}>Present</span>
                    {' '}· closed after that (you can still mark it from the Attendance Tracker)
                  </div>
                ) : (
                  <div className="team-rule">Set a login time so assigned staff can log in to this project each day.</div>
                )}

                <div style={{ fontSize: 12, fontWeight: 500, color: '#4b5563', marginBottom: 8 }}>
                  Assigned staff ({teamSelected.length})
                </div>
                {selectedStaff.length > 0 ? (
                  <div className="team-chips">
                    {selectedStaff.map(s => (
                      <span key={s._id} className="team-chip">
                        {staffName(s)}
                        <button type="button" aria-label={`Remove ${staffName(s)}`} onClick={() => toggleTeamStaff(String(s._id))} disabled={teamSaving}>×</button>
                      </span>
                    ))}
                  </div>
                ) : (
                  <div style={{ fontSize: 12, color: '#9ca3af', marginBottom: 12 }}>No one assigned yet. Pick staff below.</div>
                )}

                <input
                  className="team-search"
                  placeholder="Search staff…"
                  value={teamSearch}
                  onChange={e => setTeamSearch(e.target.value)}
                />
                <div className="team-list">
                  {staffList.length === 0 ? (
                    <div style={{ padding: 14, fontSize: 12, color: '#9ca3af', textAlign: 'center' }}>No staff added yet.</div>
                  ) : shown.length === 0 ? (
                    <div style={{ padding: 14, fontSize: 12, color: '#9ca3af', textAlign: 'center' }}>No match.</div>
                  ) : shown.map(s => {
                    const id = String(s._id);
                    return (
                      <label key={id} className="team-item">
                        <input type="checkbox" checked={teamSelected.includes(id)} onChange={() => toggleTeamStaff(id)} disabled={teamSaving} />
                        <div style={{ minWidth: 0 }}>
                          <div>{staffName(s)}</div>
                          <div className="meta">{[s.employeeId, s.designation].filter(Boolean).join(' · ')}</div>
                        </div>
                      </label>
                    );
                  })}
                </div>
                {teamError && <div className="team-err">{teamError}</div>}
              </div>

              <div className="team-modal-foot">
                <button
                  onClick={() => setTeamProject(null)}
                  disabled={teamSaving}
                  style={{ padding: '9px 16px', background: '#fff', border: '1px solid #ececec', borderRadius: 10, fontSize: 12, cursor: 'pointer', fontWeight: 500, color: '#4b5563', fontFamily: "'Inter', sans-serif" }}
                >
                  Cancel
                </button>
                <button
                  onClick={saveTeam}
                  disabled={teamSaving}
                  style={{ padding: '9px 18px', background: '#18181b', border: 'none', borderRadius: 10, fontSize: 12, cursor: teamSaving ? 'not-allowed' : 'pointer', fontWeight: 500, color: '#fff', fontFamily: "'Inter', sans-serif", opacity: teamSaving ? 0.6 : 1 }}
                >
                  {teamSaving ? 'Saving…' : 'Save Team'}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ─── DELETE CONFIRMATION MODAL ─── */}
      {deleteConfirm && (
        <div className="proj-modal-overlay" onClick={() => !deleting && setDeleteConfirm(null)}>
          <div className="delete-modal-box" onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
              <div style={{
                width: 40, height: 40, borderRadius: 12, flexShrink: 0,
                background: '#fef2f2', border: '1px solid #fecaca',
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18,
              }}>
                🗑️
              </div>
              <div>
                <div style={{ fontSize: 15, fontWeight: 600, color: '#18181b', letterSpacing: '-0.2px' }}>
                  Delete Project
                </div>
                <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2, fontFamily: "'Inter', sans-serif" }}>
                  This action cannot be undone
                </div>
              </div>
            </div>

            {/* Project preview */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 10,
              background: '#fafafa', border: '1px solid #ececec',
              borderRadius: 10, padding: '10px 14px', marginBottom: 18,
            }}>
              <ProjectAvatar name={deleteConfirm.project.projectName || '?'} />
              <div>
                <div style={{ fontSize: 13, fontWeight: 500, color: '#18181b', fontFamily: "'Inter', sans-serif" }}>
                  {deleteConfirm.project.projectName}
                </div>
                <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 2, fontFamily: "'Inter', sans-serif" }}>
                  <span style={{
                    background: '#eef2ff', border: '1px solid #e0e7ff',
                    color: '#4338ca', borderRadius: 4, padding: '1px 5px',
                    fontSize: 9, fontWeight: 600,
                    textTransform: 'uppercase', display: 'inline-block',
                  }}>
                    {deleteConfirm.project.projectType || 'monthly'}
                  </span>
                  {deleteConfirm.project.expectedAmount > 0 && (
                    <span style={{ marginLeft: 6 }}>
                      {fmt(deleteConfirm.project.expectedAmount)} total
                    </span>
                  )}
                </div>
              </div>
            </div>

            <p style={{
              fontSize: 12.5, color: '#6b7280', margin: '0 0 20px',
              fontFamily: "'Inter', sans-serif", lineHeight: 1.6,
            }}>
              All monthly breakdowns and payment records for this project will be permanently removed.
            </p>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button
                onClick={() => setDeleteConfirm(null)}
                disabled={deleting}
                style={{
                  padding: '9px 16px', background: '#fff',
                  border: '1px solid #ececec', borderRadius: 10,
                  fontSize: 12, cursor: deleting ? 'not-allowed' : 'pointer',
                  fontWeight: 500, color: '#4b5563',
                  fontFamily: "'Inter', sans-serif",
                  opacity: deleting ? 0.6 : 1,
                }}
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                disabled={deleting}
                style={{
                  padding: '9px 18px',
                  background: deleting ? '#f87171' : '#dc2626',
                  border: 'none', borderRadius: 10,
                  fontSize: 12, cursor: deleting ? 'not-allowed' : 'pointer',
                  fontWeight: 600, color: '#fff',
                  fontFamily: "'Inter', sans-serif",
                  boxShadow: deleting ? 'none' : '0 2px 8px rgba(220,38,38,0.25)',
                  display: 'flex', alignItems: 'center', gap: 6,
                  transition: 'background 0.15s',
                }}
              >
                {deleting ? (
                  <>
                    <div style={{ width: 12, height: 12, border: '2px solid #fff6', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
                    Deleting…
                  </>
                ) : (
                  <>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="3 6 5 6 21 6"/>
                      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                      <path d="M10 11v6M14 11v6"/>
                      <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
                    </svg>
                    Delete Project
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && <div className={`pt-toast ${toast.type}`}>{toast.msg}</div>}
    </div>
  );
};

export default ProjectTable;
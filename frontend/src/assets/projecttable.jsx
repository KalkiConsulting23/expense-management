import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';

// Calendar month order — used only for calendar-month index math (Date.getMonth()).
const CAL_MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
// Financial-year display order: April → March.
const MONTHS = ['Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec','Jan','Feb','Mar'];
const PROJECT_CACHE_KEY = 'local_project_data_cache';
const API_BASE = import.meta.env.VITE_API_BASE;
const fmt = (n) => '₹' + Number(n).toLocaleString('en-IN');

// The calendar index (0-11) for a month name.
const calIndex = (m) => CAL_MONTHS.indexOf(m);

// Given a financial year (the START calendar year, e.g. 2025 means FY 2025-26),
// return the CALENDAR year that a given month falls in.
// Apr–Dec belong to the FY start year; Jan–Mar belong to the next calendar year.
const calYearForFYMonth = (month, fyStartYear) =>
  calIndex(month) >= 3 ? fyStartYear : fyStartYear + 1;

// Given any calendar date's year + month index, which FY START year does it fall in?
// Jan–Mar (index 0-2) belong to the previous FY start year.
const fyStartYearForDate = (calYear, monthIndex) =>
  monthIndex >= 3 ? calYear : calYear - 1;

// Pretty label like "2025-26"
const fyLabel = (fyStartYear) => `${fyStartYear}-${String((fyStartYear + 1) % 100).padStart(2, '0')}`;

function parseUTCDate(dateStr) {
  if (!dateStr) return new Date();
  const d = new Date(dateStr);
  return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

function isMonthActive(project, monthIndex, year) {
  const startStr = project.startDate;
  const endStr = project.endDate;
  if (!startStr) return false;

  const start = parseUTCDate(startStr);
  const end = endStr ? parseUTCDate(endStr) : null;

  const monthStart = new Date(year, monthIndex, 1);
  const monthEnd   = new Date(year, monthIndex + 1, 0);

  if (monthEnd < start) return false;
  if (end && monthStart > end) return false;
  return true;
}

// Active in a FINANCIAL year (Apr fyStartYear → Mar fyStartYear+1)?
function isProjectActiveInYear(project, fyStartYear) {
  const startStr = project.startDate;
  const endStr = project.endDate;
  if (!startStr) return false;

  const start = parseUTCDate(startStr);
  const end = endStr ? parseUTCDate(endStr) : new Date();

  const fyStart = new Date(fyStartYear, 3, 1);          // 1 Apr
  const fyEnd   = new Date(fyStartYear + 1, 2, 31);     // 31 Mar next year

  if (end < fyStart) return false;
  if (start > fyEnd) return false;
  return true;
}

function countTotalActiveMonths(project) {
  const startStr = project.startDate;
  const endStr = project.endDate;
  if (!startStr) return 1;

  const start = parseUTCDate(startStr);
  const end = endStr ? parseUTCDate(endStr) : new Date();

  let count = 0;
  const cursor = new Date(start.getFullYear(), start.getMonth(), 1);
  const endMonth = new Date(end.getFullYear(), end.getMonth(), 1);

  while (cursor <= endMonth) {
    count++;
    cursor.setMonth(cursor.getMonth() + 1);
  }
  return count || 1;
}

function buildProjectTimeline(project, fyStartYear, localizedOverrides = {}) {
  const result = {};

  const totalActiveMonths = countTotalActiveMonths(project);

  MONTHS.forEach((m) => {
    // Real calendar year for this FY month (Jan–Mar roll into fyStartYear+1).
    const calYear = calYearForFYMonth(m, fyStartYear);
    const monthIdx = calIndex(m);

    if (!isMonthActive(project, monthIdx, calYear)) {
      result[m] = { amt: 0, paid: 0, active: false };
      return;
    }

    // Override key uses the true calendar year so saved breakdowns still match.
    const overrideKey = `${m}_${calYear}`;
    let calculatedBase = 0;
    let savedPaid = 0;

    if (localizedOverrides[overrideKey]) {
      calculatedBase = Number(localizedOverrides[overrideKey].amt || 0);
      savedPaid = Number(localizedOverrides[overrideKey].paid || 0);
    } else {
      const type = (project.projectType || 'monthly').toLowerCase().trim();
      if (type === 'monthly') {
      calculatedBase = Number(project.expectedAmount || 0); // full amount per month, no division
      }
      else {
        calculatedBase = 0;
      }
      savedPaid = 0;
    }

    result[m] = { 
      amt: calculatedBase, 
      paid: savedPaid, 
      active: true,
      calYear,
      metrics: localizedOverrides[overrideKey] || null 
    };
  });
  return result;
}

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
  const [projects, setProjects] = useState([]);
  const [timelineData, setTimelineData] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [monthlyOverrides, setMonthlyOverrides] = useState({});
  const [editingPayment, setEditingPayment] = useState(null);
  const [paymentInput, setPaymentInput] = useState('');
  const inputRef = useRef(null);

  const [modalConfig, setModalConfig] = useState(null); 
  const [hourlyRate, setHourlyRate] = useState('');
  const [hoursWorked, setHoursWorked] = useState('');
  const [dailyRate, setDailyRate] = useState('');
  const [daysWorked, setDaysWorked] = useState('');
  const [totalMonthDays, setTotalMonthDays] = useState('30');
  const [daysWorkedMonthly, setDaysWorkedMonthly] = useState('20');

  // ─── QUARTER FILTER STATE ───
  const [quarterFilter, setQuarterFilter] = useState({});
  const [quarterDropdownOpen, setQuarterDropdownOpen] = useState({});

  const QUARTERS = {
    Q1: ['Apr','May','Jun'],
    Q2: ['Jul','Aug','Sep'],
    Q3: ['Oct','Nov','Dec'],
    Q4: ['Jan','Feb','Mar'],
  };

  const getVisibleMonths = (year) => {
    const q = quarterFilter[year];
    return q ? QUARTERS[q] : MONTHS;
  };

  // ─── DELETE STATE ───
  const [deleteConfirm, setDeleteConfirm] = useState(null); // { project }
  const [deleting, setDeleting] = useState(false);

  const rebuildMatrix = useCallback((allProjs, overrides) => {
    const matrix = {};
    allProjs.forEach(p => {
      const uniqueFYs = new Set();
      const startStr = p.startDate;
      const endStr = p.endDate;

      if (startStr) {
        const sd = parseUTCDate(startStr);
        const ed = endStr ? parseUTCDate(endStr) : new Date();
        const sFY = fyStartYearForDate(sd.getFullYear(), sd.getMonth());
        const eFY = fyStartYearForDate(ed.getFullYear(), ed.getMonth());
        for (let y = sFY; y <= eFY; y++) uniqueFYs.add(y);
      }
      const now = new Date();
      uniqueFYs.add(fyStartYearForDate(now.getFullYear(), now.getMonth()));

      Array.from(uniqueFYs).forEach(fyStartYear => {
        const localizedOverrides = {};
        // A FY spans two calendar years — gather overrides for each month against
        // its real calendar year so saved data keyed by calendar year still resolves.
        MONTHS.forEach(m => {
          const calYear = calYearForFYMonth(m, fyStartYear);
          const k = `${p._id}_${m}_${calYear}`;
          if (overrides[k]) localizedOverrides[`${m}_${calYear}`] = overrides[k];
        });
        matrix[`${p._id}_${fyStartYear}`] = buildProjectTimeline(p, fyStartYear, localizedOverrides);
      });
    });
    setTimelineData(matrix);
  }, []);

  const parseServerData = useCallback((data) => {
    const initialOverrides = {};
    data.forEach(p => {
      if (p.monthlyBreakdowns) {
        p.monthlyBreakdowns.forEach(b => {
          initialOverrides[`${p._id}_${b.month}_${b.year}`] = b;
        });
      }
    });
    setMonthlyOverrides(initialOverrides);
    rebuildMatrix(data, initialOverrides);
  }, [rebuildMatrix]);

  useEffect(() => {
    const fetchProjects = async () => {
      try {
        const cached = sessionStorage.getItem(PROJECT_CACHE_KEY);
        if (cached) {
          const parsed = JSON.parse(cached);
          setProjects(parsed);
          parseServerData(parsed);
          setLoading(false);
          return;
        }

        const res = await fetch(`${API_BASE}/project/all`);
        const data = await res.json();
        
        sessionStorage.setItem(PROJECT_CACHE_KEY, JSON.stringify(data));
        setProjects(data);
        parseServerData(data);
      } catch (err) {
        setError('Failed to fetch structural project metrics.');
      } finally {
        setLoading(false);
      }
    };
    fetchProjects();
  }, [parseServerData]);

  // ─── DELETE HANDLER ───
  const confirmDelete = async () => {
    if (!deleteConfirm) return;
    const { project } = deleteConfirm;
    setDeleting(true);

    try {
       const res = await fetch(`${API_BASE}/project/delete/${project._id}`, {
        method: 'DELETE',
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || 'Delete failed');
      }

      // Optimistic removal from state + cache
      setProjects(prev => {
        const updated = prev.filter(p => p._id !== project._id);
        sessionStorage.setItem(PROJECT_CACHE_KEY, JSON.stringify(updated));

        // Clean up overrides for this project
        setMonthlyOverrides(prevOvr => {
          const cleaned = { ...prevOvr };
          Object.keys(cleaned).forEach(k => {
            if (k.startsWith(`${project._id}_`)) delete cleaned[k];
          });
          rebuildMatrix(updated, cleaned);
          return cleaned;
        });

        return updated;
      });

      setDeleteConfirm(null);
    } catch (err) {
      alert(`Failed to delete project: ${err.message}`);
    } finally {
      setDeleting(false);
    }
  };

  const openCalculatorModal = (project, month, year) => {
    const type = (project.projectType || 'monthly').toLowerCase().trim();
    const key = `${project._id}_${month}_${year}`;
    const existing = monthlyOverrides[key];

    if (type === 'hourly') {
      if (existing?.hourlyRate !== undefined) {
        setHourlyRate(String(existing.hourlyRate));
      } else {
        setHourlyRate(String(project.defaultHourlyRate || '1000'));
      }
      setHoursWorked(existing?.hoursWorked !== undefined ? String(existing.hoursWorked) : '0');
    } else if (type === 'daily') {
      if (existing?.dailyRate !== undefined) {
        setDailyRate(String(existing.dailyRate));
      } else {
        setDailyRate(String(project.defaultDailyRate || '5000'));
      }
      setDaysWorked(existing?.daysWorked !== undefined ? String(existing.daysWorked) : '0');
    } else {
      setTotalMonthDays(existing?.totalMonthDays || '30');
      setDaysWorkedMonthly(existing?.daysWorkedMonthly || '0');
    }
    setModalConfig({ project, month, year, type });
  };

  const saveModalCalculation = async () => {
    if (!modalConfig) return;
    const { project, month, year, type } = modalConfig;
    const key = `${project._id}_${month}_${year}`;
    let calculatedAmt = 0;
    let payloadMetrics = {};

    if (type === 'hourly') {
      const base = (parseFloat(hourlyRate) || 0) * (parseFloat(hoursWorked) || 0);
      calculatedAmt = base;
      payloadMetrics = { hourlyRate, hoursWorked };
    } else if (type === 'daily') {
      const base = (parseFloat(dailyRate) || 0) * (parseFloat(daysWorked) || 0);
      calculatedAmt = base;
      payloadMetrics = { dailyRate, daysWorked };
    } else {
      const monthlyRate = Number(project.expectedAmount || 0); // full per-month rate
      const base = (monthlyRate / (parseFloat(totalMonthDays) || 1)) * (parseFloat(daysWorkedMonthly) || 0);
      calculatedAmt = base;
      payloadMetrics = { totalMonthDays, daysWorkedMonthly };
  }

    const existingPaid = monthlyOverrides[key]?.paid !== undefined ? monthlyOverrides[key].paid : 0;

    const updatedOverride = {
      ...monthlyOverrides,
      [key]: { ...monthlyOverrides[key], amt: calculatedAmt, paid: existingPaid, ...payloadMetrics, month, year }
    };

    setMonthlyOverrides(updatedOverride);
    
    setProjects(prevProjects => {
      const nextProjs = prevProjects.map(p => {
        if (p._id !== project._id) return p;
        const currentBreakdowns = [...(p.monthlyBreakdowns || [])];
        const existingIdx = currentBreakdowns.findIndex(b => b.month === month && b.year === year);
        const newBreakdownItem = { month, year, amt: calculatedAmt, paid: existingPaid, ...payloadMetrics };
        
        if (existingIdx > -1) {
          currentBreakdowns[existingIdx] = { ...currentBreakdowns[existingIdx], ...newBreakdownItem };
        } else {
          currentBreakdowns.push(newBreakdownItem);
        }
        return { ...p, monthlyBreakdowns: currentBreakdowns };
      });
      sessionStorage.setItem(PROJECT_CACHE_KEY, JSON.stringify(nextProjs));
      rebuildMatrix(nextProjs, updatedOverride);
      return nextProjs;
    });

    setModalConfig(null);

    try {
       await fetch(`${API_BASE}/project/sync-month/${project._id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ month, year, amt: calculatedAmt, metrics: payloadMetrics }),
      });
    } catch(e) { console.error("Database save failed.") }
  };

  const startPaymentEdit = (projectId, month, year, currentPaid) => {
    setEditingPayment({ projectId, month, year });
    setPaymentInput(String(currentPaid));
    setTimeout(() => { inputRef.current?.focus(); inputRef.current?.select() }, 30);
  };

  const commitPaymentEdit = async () => {
    if (!editingPayment) return;
    const { projectId, month, year } = editingPayment;
    const key = `${projectId}_${month}_${year}`;
    const val = Math.max(0, parseFloat(paymentInput) || 0);

    const updatedOverride = {
      ...monthlyOverrides,
      [key]: { ...monthlyOverrides[key], month, year, paid: val }
    };
    
    setMonthlyOverrides(updatedOverride);
    
    setProjects(prevProjects => {
      const nextProjs = prevProjects.map(p => {
        if (p._id !== projectId) return p;
        const currentBreakdowns = [...(p.monthlyBreakdowns || [])];
        const existingIdx = currentBreakdowns.findIndex(b => b.month === month && b.year === year);
        
        if (existingIdx > -1) {
          currentBreakdowns[existingIdx] = { ...currentBreakdowns[existingIdx], paid: val };
        } else {
          currentBreakdowns.push({ month, year, amt: 0, paid: val });
        }
        return { ...p, monthlyBreakdowns: currentBreakdowns };
      });
      sessionStorage.setItem(PROJECT_CACHE_KEY, JSON.stringify(nextProjs));
      rebuildMatrix(nextProjs, updatedOverride);
      return nextProjs;
    });

    setEditingPayment(null);

    try {
        await fetch(`${API_BASE}/project/sync-month/${projectId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ month, year, paid: val }),
      });
    } catch (err) { console.error('Failed processing payment alignment.', err); }
  };

  if (loading) return (
    <div style={{ padding: 40, display: 'flex', alignItems: 'center', gap: 12, fontFamily: "'Inter', sans-serif", color: '#6b7280', background: '#f7f7f8', minHeight: '100vh' }}>
      <div style={{ width: 22, height: 22, border: '2.5px solid #ececec', borderTopColor: '#18181b', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
      Refreshing workspace matrix…
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );

  if (error) return (
    <div style={{ padding: 40, fontFamily: "'Inter', sans-serif", color: '#dc2626', background: '#f7f7f8', minHeight: '100vh' }}>{error}</div>
  );

  // FY start years that any project touches.
  const distinctYears = Array.from(new Set(projects.flatMap(p => {
    const s = p.startDate;
    const e = p.endDate;
    const now = new Date();
    if (!s) return [fyStartYearForDate(now.getFullYear(), now.getMonth())];
    const sd = parseUTCDate(s);
    const ed = e ? parseUTCDate(e) : now;
    const startFY = fyStartYearForDate(sd.getFullYear(), sd.getMonth());
    const endFY = fyStartYearForDate(ed.getFullYear(), ed.getMonth());
    const yearsArray = [];
    for (let y = startFY; y <= endFY; y++) yearsArray.push(y);
    return yearsArray;
  }))).sort((a,b) => a-b);

  return (
    <div style={{ padding: '32px 24px 60px', background: '#f7f7f8', minHeight: '100vh', fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
        * { box-sizing: border-box; }

        .proj-table-scroll {
          overflow-x: auto;
          border-radius: 14px;
          border: 1px solid #ececec;
          background: #ffffff;
          box-shadow: 0 1px 3px rgba(16,24,40,0.04);
        }
        .proj-table {
          border-collapse: collapse;
          white-space: nowrap;
          width: 100%;
        }
        .col-name {
          position: sticky; left: 0; z-index: 3; background: #ffffff;
          min-width: 255px; max-width: 255px; border-right: 1px solid #ececec;
        }
        .col-name.head { background: #fafafa; z-index: 4; }

        .th-month {
          background: #fafafa; color: #9ca3af; text-align: center;
          font-size: 10.5px; font-weight: 500; letter-spacing: 0.3px;
          padding: 11px 4px;
          border-right: 1px solid #ececec; border-bottom: 1px solid #ececec;
          font-family: 'Inter', sans-serif;
        }
        .th-sub-proj {
          text-align: center; font-size: 10px; font-weight: 500;
          letter-spacing: 0.3px;
          padding: 6px 6px; border-bottom: 1px solid #ececec;
          border-right: 1px solid #f4f4f5; min-width: 95px;
          background: #fafafa; color: #9ca3af;
          font-family: 'Inter', sans-serif;
        }
        .th-sub-proj.amt  { color: #d97706; }
        .th-sub-proj.paid { color: #16a34a; border-right: 1px solid #ececec; }

        .th-total-proj {
          background: #eef2ff; color: #4338ca; text-align: center;
          font-size: 10px; font-weight: 500; letter-spacing: 0.3px;
          padding: 6px 8px;
          border-bottom: 1px solid #ececec; border-right: 1px solid #f4f4f5;
          min-width: 100px; font-family: 'Inter', sans-serif;
        }

        tr.proj-data-row:hover td            { background: #fafafa !important; }
        tr.proj-data-row:hover .col-name     { background: #fafafa !important; }

        .td-proj-name {
          padding: 11px 14px; border-bottom: 1px solid #f4f4f5; vertical-align: middle;
        }
        .td-proj-amt {
          text-align: right; padding: 10px 10px;
          font-variant-numeric: tabular-nums; font-size: 12px;
          border-bottom: 1px solid #f4f4f5; border-right: 1px solid #f4f4f5;
          background: #fafafa; color: #6b7280; cursor: pointer;
        }
        .td-proj-amt:hover { background: #fffbeb !important; }

        .td-proj-paid {
          text-align: right; padding: 10px 10px;
          font-variant-numeric: tabular-nums; font-size: 12px; color: #16a34a;
          border-bottom: 1px solid #f4f4f5; border-right: 1px solid #ececec;
          cursor: pointer; position: relative;
        }
        .td-proj-paid:hover { background: #f0fdf4 !important; }

        .td-proj-inactive {
          background: #fafafa; color: #d1d5db; text-align: center; font-size: 11px;
          border-bottom: 1px solid #f4f4f5; border-right: 1px solid #ececec; padding: 10px 6px;
        }

        .proj-edit-inp {
          width: 85px; background: #ffffff; border: 1px solid #18181b;
          border-radius: 8px; padding: 3px 7px;
          font-variant-numeric: tabular-nums; font-size: 12px;
          color: #18181b; outline: none; text-align: right;
          box-shadow: 0 0 0 3px rgba(24,24,27,0.06);
        }
        .proj-totals-row td {
          background: #fafafa; border-top: 1px solid #ececec;
          font-variant-numeric: tabular-nums; font-size: 11px;
          text-align: right; padding: 9px 10px; border-right: 1px solid #f4f4f5;
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

        .delete-modal-box {
          background: #ffffff; padding: 28px 26px; border-radius: 18px; width: 380px;
          box-shadow: 0 24px 60px rgba(16,24,40,0.22);
          border: 1px solid #ececec;
        }

        .quarter-btn {
          display: flex; align-items: center; gap: 6px;
          padding: 5px 11px; border-radius: 20px; cursor: pointer;
          font-size: 11px; font-weight: 500; font-family: 'Inter', sans-serif;
          border: 1px solid #ececec; background: #ffffff; color: #6b7280;
          transition: all 0.15s; white-space: nowrap;
        }
        .quarter-btn:hover { background: #f3f4f6; border-color: #d1d5db; color: #18181b; }
        .quarter-btn.active { background: #eef2ff; border-color: #c7d2fe; color: #4338ca; }

        .quarter-dropdown {
          position: absolute; top: calc(100% + 6px); right: 0; z-index: 20;
          background: #ffffff; border: 1px solid #ececec; border-radius: 12px;
          box-shadow: 0 8px 24px rgba(16,24,40,0.12);
          padding: 6px; min-width: 110px;
        }
        .quarter-option {
          display: flex; align-items: center; justify-content: space-between;
          padding: 7px 10px; border-radius: 8px; cursor: pointer;
          font-size: 12px; font-weight: 500; color: #374151;
          font-family: 'Inter', sans-serif; transition: background 0.12s;
          gap: 8px;
        }
        .quarter-option:hover { background: #fafafa; }
        .quarter-option.selected { background: #eef2ff; color: #4338ca; }
        .quarter-option .q-months { font-size: 9px; color: #9ca3af; font-weight: 400; }
        .quarter-option.selected .q-months { color: #4f46e5; }

      `}</style>

      {/* Page Header */}
      <div style={{ marginBottom: 28, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 500, letterSpacing: 0.4, textTransform: 'uppercase', color: '#9ca3af', marginBottom: 5, fontFamily: "'Inter', sans-serif" }}>
            Project Tracker
          </div>
          <h2 style={{ fontSize: 26, fontWeight: 600, color: '#18181b', margin: '0 0 4px', letterSpacing: '-0.4px' }}>
            Financial Workspace Matrix
          </h2>
          <p style={{ fontSize: 13, color: '#6b7280', margin: 0, fontFamily: "'Inter', sans-serif" }}>
            {projects.length} project{projects.length !== 1 ? 's' : ''} &nbsp;·&nbsp;
            Click <span style={{ color: '#d97706', fontWeight: 500 }}>To BE Received</span> to configure metrics &nbsp;·&nbsp;
            Click <span style={{ color: '#16a34a', fontWeight: 500 }}>Received</span> to track per month
          </p>
        </div>

        <button
          className="add-proj-btn"
          onClick={() => navigate('/project')}
          type="button"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          Add Project
        </button>
      </div>

      {projects.length === 0 && (
        <div style={{ textAlign: 'center', padding: '60px 0', color: '#9ca3af' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>📋</div>
          <div style={{ fontSize: 16, fontWeight: 600, color: '#6b7280' }}>No projects yet</div>
          <div style={{ fontSize: 13, marginTop: 4 }}>Add your first project to see it here.</div>
        </div>
      )}

      {distinctYears.map(year => {
        const filteredProjects = projects.filter(p => isProjectActiveInYear(p, year));
        if (filteredProjects.length === 0) return null;

        const visibleMonths = getVisibleMonths(year);

        const monthColTotals = {};
        visibleMonths.forEach(m => {
          let totalAmt = 0;
          let totalPaid = 0;
          filteredProjects.forEach(project => {
            const matrixKey = `${project._id}_${year}`;
            const data = timelineData[matrixKey] || {};
            const cell = data[m];
            if (cell && cell.active) {
              totalAmt  += cell.amt  || 0;
              totalPaid += cell.paid || 0;
            }
          });
          monthColTotals[m] = { totalAmt, totalPaid };
        });

        const grandYearPaid = visibleMonths.reduce((s, m) => s + monthColTotals[m].totalPaid, 0);
        const grandYearAmt  = visibleMonths.reduce((s, m) => s + monthColTotals[m].totalAmt,  0);

        return (
          <div key={year} style={{
            marginBottom: 28,
            borderRadius: 16,
            border: '1px solid #ececec',
            overflow: 'hidden',
            boxShadow: '0 1px 3px rgba(16,24,40,0.04)',
          }}>
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '14px 22px',
              background: '#fafafa',
              borderBottom: '1px solid #ececec',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{
                  width: 36, height: 36, borderRadius: 10,
                  background: '#eef2ff', border: '1px solid #e0e7ff',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 16, flexShrink: 0,
                }}>
                  📊
                </div>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#18181b', letterSpacing: '-0.2px' }}>
                    FY {fyLabel(year)}
                  </div>
                  <div style={{ fontSize: 11, color: '#6b7280', marginTop: 1, fontFamily: "'Inter', sans-serif" }}>
                    {filteredProjects.length} active project{filteredProjects.length !== 1 ? 's' : ''}
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{
                  background: '#fffbeb', border: '1px solid #fde68a',
                  color: '#b45309', padding: '3px 12px', borderRadius: 20,
                  fontSize: 11, fontWeight: 500, fontFamily: "'Inter', sans-serif",
                }}>
                  To Receive: {fmt(grandYearAmt)}
                </div>
                <div style={{
                  background: '#f0fdf4', border: '1px solid #bbf7d0',
                  color: '#16a34a', padding: '3px 12px', borderRadius: 20,
                  fontSize: 11, fontWeight: 500, fontFamily: "'Inter', sans-serif",
                }}>
                  Received: {fmt(grandYearPaid)}
                </div>

                {/* ─── Quarter Filter Dropdown ─── */}
                <div style={{ position: 'relative' }}>
                  <button
                    className={`quarter-btn${quarterFilter[year] ? ' active' : ''}`}
                    onClick={() => setQuarterDropdownOpen(prev => ({ ...prev, [year]: !prev[year] }))}
                  >
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                      <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
                      <rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/>
                    </svg>
                    {quarterFilter[year] || 'Quarter'}
                    <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                      <polyline points="6 9 12 15 18 9"/>
                    </svg>
                  </button>

                  {quarterDropdownOpen[year] && (
                    <>
                      {/* backdrop to close */}
                      <div
                        style={{ position: 'fixed', inset: 0, zIndex: 19 }}
                        onClick={() => setQuarterDropdownOpen(prev => ({ ...prev, [year]: false }))}
                      />
                      <div className="quarter-dropdown">
                        {/* All option */}
                        <div
                          className={`quarter-option${!quarterFilter[year] ? ' selected' : ''}`}
                          onClick={() => {
                            setQuarterFilter(prev => ({ ...prev, [year]: null }));
                            setQuarterDropdownOpen(prev => ({ ...prev, [year]: false }));
                          }}
                        >
                          <span>All Year</span>
                          <span className="q-months">Apr–Mar</span>
                        </div>
                        {Object.entries(QUARTERS).map(([q, months]) => (
                          <div
                            key={q}
                            className={`quarter-option${quarterFilter[year] === q ? ' selected' : ''}`}
                            onClick={() => {
                              setQuarterFilter(prev => ({ ...prev, [year]: q }));
                              setQuarterDropdownOpen(prev => ({ ...prev, [year]: false }));
                            }}
                          >
                            <span>{q}</span>
                            <span className="q-months">{months[0]}–{months[2]}</span>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>

            <div style={{ padding: 20, background: '#ffffff' }}>
              <div className="proj-table-scroll">
                <table className="proj-table">
                  <thead>
                    <tr>
                      <th
                        className="col-name head"
                        rowSpan={2}
                        style={{
                          padding: '11px 16px', textAlign: 'left', fontSize: 10.5,
                          fontWeight: 500, color: '#9ca3af', letterSpacing: 0.3,
                          borderBottom: '1px solid #ececec',
                          background: '#fafafa', fontFamily: "'Inter', sans-serif",
                        }}
                      >
                        Project Track
                      </th>
                      {visibleMonths.map(m => (
                        <th key={m} colSpan={2} className="th-month">{m}</th>
                      ))}
                      <th colSpan={2} style={{
                        background: '#eef2ff', color: '#4338ca', textAlign: 'center',
                        fontSize: 10.5, fontWeight: 600, letterSpacing: 0.3,
                        padding: '11px 8px', borderBottom: '1px solid #ececec',
                        fontFamily: "'Inter', sans-serif",
                      }}>
                        {quarterFilter[year] ? `${quarterFilter[year]} Total` : 'Year Total'}
                      </th>
                    </tr>
                    <tr>
                      {visibleMonths.map(m => (
                        <React.Fragment key={m}>
                          <th className="th-sub-proj amt">To Be Received</th>
                          <th className="th-sub-proj paid">Received</th>
                        </React.Fragment>
                      ))}
                      <th className="th-total-proj" style={{ borderRight: '1px solid #f4f4f5' }}>Received</th>
                      <th className="th-total-proj" style={{ color: '#9ca3af', background: '#fafafa' }}>To Be Received</th>
                    </tr>
                  </thead>

                  <tbody>
                    {filteredProjects.map(project => {
                      const matrixKey = `${project._id}_${year}`;
                      const data = timelineData[matrixKey] || {};

                      const yrTotalPaid = visibleMonths.reduce((s, m) => s + (data[m]?.paid || 0), 0);
                      const yrTotalAmt  = visibleMonths.reduce((s, m) => s + (data[m]?.amt  || 0), 0);

                      return (
                        <tr key={project._id} className="proj-data-row" style={{ borderBottom: '1px solid #f4f4f5' }}>
                          {/* ─── PROJECT NAME CELL with delete button ─── */}
                          <td className="col-name td-proj-name">
                            <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                              <ProjectAvatar name={project.projectName || '?'} />
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: 13, fontWeight: 500, color: '#18181b', fontFamily: "'Inter', sans-serif", overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                  {project.projectName}
                                </div>
                                <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 2, fontFamily: "'Inter', sans-serif" }}>
                                  <span style={{
                                    display: 'inline-block',
                                    background: '#eef2ff', border: '1px solid #e0e7ff',
                                    color: '#4338ca', borderRadius: 4, padding: '1px 5px',
                                    fontSize: 9, fontWeight: 600,
                                    textTransform: 'uppercase',
                                  }}>
                                    {project.projectType || 'monthly'}
                                  </span>
                                </div>
                              </div>
                              {/* Delete button */}
                              <button
                                className="delete-proj-btn"
                                title="Delete project"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setDeleteConfirm({ project });
                                }}
                              >
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                  <polyline points="3 6 5 6 21 6"/>
                                  <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                                  <path d="M10 11v6M14 11v6"/>
                                  <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
                                </svg>
                              </button>
                            </div>
                          </td>

                          {visibleMonths.map(m => {
                            const cell = data[m];
                            const cellYear = cell?.calYear ?? year;
                            const isEditingPay = editingPayment?.projectId === project._id && editingPayment?.month === m && editingPayment?.year === cellYear;

                            if (!cell || !cell.active) {
                              return <td key={m} className="td-proj-inactive" colSpan={2}>—</td>;
                            }

                            return (
                              <React.Fragment key={m}>
                                <td className="td-proj-amt" onClick={() => openCalculatorModal(project, m, cellYear)}>
                                  <div>{fmt(cell.amt)}</div>
                                  <span style={{ fontSize: 9, color: '#4f46e5', textDecoration: 'underline' }}>Configure</span>
                                </td>

                                <td className="td-proj-paid" onClick={() => !isEditingPay && startPaymentEdit(project._id, m, cellYear, cell.paid)}>
                                  {isEditingPay ? (
                                    <input
                                      ref={inputRef}
                                      className="proj-edit-inp"
                                      value={paymentInput}
                                      onChange={e => setPaymentInput(e.target.value)}
                                      onBlur={commitPaymentEdit}
                                      onKeyDown={e => { if(e.key === 'Enter') commitPaymentEdit(); if(e.key === 'Escape') setEditingPayment(null); }}
                                    />
                                  ) : (
                                    <div>{fmt(cell.paid)}</div>
                                  )}
                                </td>
                              </React.Fragment>
                            );
                          })}

                          <td style={{ textAlign: 'right', padding: '10px 12px', fontVariantNumeric: 'tabular-nums', fontSize: 12, fontWeight: 600, color: '#16a34a', borderBottom: '1px solid #f4f4f5', borderRight: '1px solid #f4f4f5', background: '#f0fdf4' }}>
                            {fmt(yrTotalPaid)}
                          </td>
                          <td style={{ textAlign: 'right', padding: '10px 12px', fontVariantNumeric: 'tabular-nums', fontSize: 12, color: '#9ca3af', borderBottom: '1px solid #f4f4f5', background: '#fafafa' }}>
                            {fmt(yrTotalAmt)}
                          </td>
                        </tr>
                      );
                    })}

                    <tr className="proj-totals-row">
                      <td
                        className="col-name"
                        style={{
                          padding: '10px 16px', fontSize: 10.5, fontWeight: 500, color: '#6b7280',
                          letterSpacing: 0.3,
                          borderTop: '1px solid #ececec', background: '#fafafa', textAlign: 'left',
                          fontFamily: "'Inter', sans-serif",
                        }}
                      >
                        Monthly Totals
                        <div style={{ fontSize: 9, color: '#9ca3af', marginTop: 2, fontWeight: 400 }}>{quarterFilter[year] ? `${quarterFilter[year]}: ${QUARTERS[quarterFilter[year]].join(', ')}` : 'All projects combined'}</div>
                      </td>

                      {visibleMonths.map(m => {
                        const { totalAmt, totalPaid } = monthColTotals[m];
                        const hasActivity = totalAmt > 0 || totalPaid > 0;
                        return (
                          <React.Fragment key={m}>
                            <td style={{ color: hasActivity ? '#d97706' : '#d1d5db', fontVariantNumeric: 'tabular-nums' }}>
                              {hasActivity ? fmt(totalAmt) : '—'}
                            </td>
                            <td style={{ color: hasActivity ? '#16a34a' : '#d1d5db', borderRight: '1px solid #ececec', fontVariantNumeric: 'tabular-nums' }}>
                              {hasActivity ? fmt(totalPaid) : '—'}
                            </td>
                          </React.Fragment>
                        );
                      })}

                      <td style={{ color: '#16a34a', fontWeight: 700, background: '#f0fdf4', fontVariantNumeric: 'tabular-nums' }}>
                        {fmt(grandYearPaid)}
                      </td>
                      <td style={{ color: '#9ca3af', background: '#fafafa', fontVariantNumeric: 'tabular-nums' }}>
                        {fmt(grandYearAmt)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        );
      })}

      <p style={{ marginTop: 8, fontSize: 11, color: '#9ca3af', textAlign: 'center', fontFamily: "'Inter', sans-serif" }}>
        Scroll right to see all months &nbsp;·&nbsp;
        Click <span style={{ color: '#d97706' }}>To Receive</span> to configure &nbsp;·&nbsp;
        Click <span style={{ color: '#16a34a' }}>Received</span> to edit
      </p>

      {/* ─── CALCULATOR MODAL ─── */}
      {modalConfig && (
        <div className="proj-modal-overlay">
          <div className="proj-modal-box">
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
              <div style={{
                width: 36, height: 36, borderRadius: 10,
                background: '#eef2ff', border: '1px solid #e0e7ff',
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16,
              }}>
                🧮
              </div>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#18181b', letterSpacing: '-0.2px' }}>
                  Configure {modalConfig.type.toUpperCase()} Track
                </div>
                <div style={{ fontSize: 11, color: '#6b7280', marginTop: 1, fontFamily: "'Inter', sans-serif" }}>
                  {modalConfig.month} {modalConfig.year} &nbsp;·&nbsp; {modalConfig.project.projectName}
                </div>
              </div>
            </div>

            {modalConfig.type === 'hourly' && (
              <>
                <div className="proj-modal-field">
                  <label>Hourly Rate (₹)</label>
                  <input type="number" value={hourlyRate} onChange={e => setHourlyRate(e.target.value)} />
                </div>
                <div className="proj-modal-field">
                  <label>Hours Worked This Month</label>
                  <input type="number" value={hoursWorked} onChange={e => setHoursWorked(e.target.value)} />
                </div>
              </>
            )}

            {modalConfig.type === 'daily' && (
              <>
                <div className="proj-modal-field">
                  <label>Daily Rate (₹)</label>
                  <input type="number" value={dailyRate} onChange={e => setDailyRate(e.target.value)} />
                </div>
                <div className="proj-modal-field">
                  <label>Days Worked This Month</label>
                  <input type="number" value={daysWorked} onChange={e => setDaysWorked(e.target.value)} />
                </div>
              </>
            )}

           {modalConfig.type === 'monthly' && (
              <>
                <div style={{
                  background: '#fafafa', border: '1px solid #ececec',
                  padding: '10px 12px', borderRadius: 10, fontSize: 11.5,
                  color: '#6b7280', marginBottom: 14, fontFamily: "'Inter', sans-serif",
                }}>
                  <div>Monthly rate: <span style={{ color: '#d97706', fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>
                  {fmt(modalConfig.project.expectedAmount || 0)}
                </span></div>
                <div style={{ marginTop: 3, color: '#9ca3af' }}>
                  Prorated by days worked ÷ total days
                </div>
                </div>
                <div className="proj-modal-field">
                  <label>Total Cycle Days in Month</label>
                  <input type="number" value={totalMonthDays} onChange={e => setTotalMonthDays(e.target.value)} />
                </div>
                <div className="proj-modal-field">
                  <label>Days Actually Worked</label>
                  <input type="number" value={daysWorkedMonthly} onChange={e => setDaysWorkedMonthly(e.target.value)} />
                </div>
              </>
            )}

          {/* Computed Total Preview */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            background: '#fafafa', border: '1px solid #ececec',
            borderRadius: 10, padding: '12px 14px', marginBottom: 16,
          }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#6b7280', fontFamily: "'Inter', sans-serif" }}>
              Computed Total
            </div>
            {(() => {
              let base = 0;
              const { type, project } = modalConfig;
              if (type === 'hourly') {
                base = (parseFloat(hourlyRate) || 0) * (parseFloat(hoursWorked) || 0);
              } else if (type === 'daily') {
                base = (parseFloat(dailyRate) || 0) * (parseFloat(daysWorked) || 0);
              } else {
                const monthlyRate = Number(project.expectedAmount || 0);
                base = (monthlyRate / (parseFloat(totalMonthDays) || 1)) * (parseFloat(daysWorkedMonthly) || 0);
              }
              return (
                <div style={{ fontSize: 14, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: '#d97706' }}>
                  {fmt(base)}
                </div>
              );
            })()}
          </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 }}>
              <button
                onClick={() => setModalConfig(null)}
                style={{
                  padding: '9px 16px', background: '#fff',
                  border: '1px solid #ececec', borderRadius: 10,
                  fontSize: 12, cursor: 'pointer', fontWeight: 500,
                  color: '#4b5563', fontFamily: "'Inter', sans-serif",
                }}
              >
                Cancel
              </button>
              <button
                onClick={saveModalCalculation}
                style={{
                  padding: '9px 18px', background: '#18181b',
                  border: 'none', borderRadius: 10,
                  fontSize: 12, cursor: 'pointer', fontWeight: 500,
                  color: '#fff', fontFamily: "'Inter', sans-serif",
                }}
              >
                Save & Compute
              </button>
            </div>
          </div>
        </div>
      )}

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
    </div>
  );
};

export default ProjectTable;
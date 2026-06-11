import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const PROJECT_CACHE_KEY = 'local_project_data_cache';

const fmt = (n) => '₹' + Number(n).toLocaleString('en-IN');

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

function isProjectActiveInYear(project, year) {
  const startStr = project.startDate;
  const endStr = project.endDate;
  if (!startStr) return false;

  const startYear = parseUTCDate(startStr).getFullYear();
  const endYear = endStr ? parseUTCDate(endStr).getFullYear() : new Date().getFullYear();

  return year >= startYear && year <= endYear;
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

function buildProjectTimeline(project, year, localizedOverrides = {}) {
  const result = {};

  const totalActiveMonths = countTotalActiveMonths(project);

  MONTHS.forEach((m, i) => {
    if (!isMonthActive(project, i, year)) {
      result[m] = { amt: 0, paid: 0, active: false };
      return;
    }

    const overrideKey = `${m}_${year}`;
    let calculatedBase = 0;
    let savedPaid = 0;

    if (localizedOverrides[overrideKey]) {
      calculatedBase = Number(localizedOverrides[overrideKey].amt || 0);
      savedPaid = Number(localizedOverrides[overrideKey].paid || 0);
    } else {
      const type = (project.projectType || 'monthly').toLowerCase().trim();
      if (type === 'monthly') {
        calculatedBase = Number(project.expectedAmount || 0) / totalActiveMonths;
      } else {
        calculatedBase = 0;
      }
      savedPaid = 0;
    }

    result[m] = { 
      amt: calculatedBase, 
      paid: savedPaid, 
      active: true,
      metrics: localizedOverrides[overrideKey] || null 
    };
  });
  return result;
}

function ProjectAvatar({ name = '' }) {
  const palette = ['#c97844','#b08a5e','#8c7a68','#a05e2a','#7a6050','#d4a070','#9a8775','#b5672f'];
  const color   = palette[name.charCodeAt(0) % palette.length];
  const initials = name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
  return (
    <div style={{
      width: 32, height: 32, borderRadius: 10, flexShrink: 0,
      background: color + '22', border: `1.5px solid ${color}55`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: 11, fontWeight: 600, color,
      fontFamily: "'DM Sans', sans-serif", letterSpacing: 0.5,
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
  const [includeGst, setIncludeGst] = useState(false);
  const [currency, setCurrency] = useState('INR');
  const [usdRate, setUsdRate] = useState(84); // fallback rate
  const [usdRateLoading, setUsdRateLoading] = useState(false);

  // ─── QUARTER FILTER STATE ───
  const [quarterFilter, setQuarterFilter] = useState({});
  const [quarterDropdownOpen, setQuarterDropdownOpen] = useState({});

  const QUARTERS = {
    Q1: ['Jan','Feb','Mar'],
    Q2: ['Apr','May','Jun'],
    Q3: ['Jul','Aug','Sep'],
    Q4: ['Oct','Nov','Dec'],
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
      const uniqueYears = new Set();
      const startStr = p.startDate;
      const endStr = p.endDate;

      if (startStr) {
        const sYear = parseUTCDate(startStr).getFullYear();
        const eYear = endStr ? parseUTCDate(endStr).getFullYear() : new Date().getFullYear();
        for (let y = sYear; y <= eYear; y++) uniqueYears.add(y);
      }
      uniqueYears.add(new Date().getFullYear());
      
      Array.from(uniqueYears).forEach(year => {
        const localizedOverrides = {};
        MONTHS.forEach(m => {
          const k = `${p._id}_${m}_${year}`;
          if (overrides[k]) localizedOverrides[`${m}_${year}`] = overrides[k];
        });
        matrix[`${p._id}_${year}`] = buildProjectTimeline(p, year, localizedOverrides);
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

        const res = await fetch('https://expense-management-7.onrender.com/api/project/all');
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
      const res = await fetch(`https://expense-management-7.onrender.com/api/project/delete/${project._id}`, {
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
      setHourlyRate(existing?.hourlyRate || '1000');
      setHoursWorked(existing?.hoursWorked || '0');
    } else if (type === 'daily') {
      setDailyRate(existing?.dailyRate || '5000');
      setDaysWorked(existing?.daysWorked || '0');
    } else {
      setTotalMonthDays(existing?.totalMonthDays || '30');
      setDaysWorkedMonthly(existing?.daysWorkedMonthly || '0');
    }
    setIncludeGst(existing?.includeGst || false);
    setCurrency(existing?.currency || 'INR');
    setModalConfig({ project, month, year, type });
  };

  const fetchUsdRate = async () => {
    setUsdRateLoading(true);
    try {
      const res = await fetch('https://api.frankfurter.app/latest?from=USD&to=INR');
      const data = await res.json();
      if (data?.rates?.INR) setUsdRate(data.rates.INR);
    } catch (e) {
      // keep fallback rate
    } finally {
      setUsdRateLoading(false);
    }
  };

  const saveModalCalculation = async () => {
    if (!modalConfig) return;
    const { project, month, year, type } = modalConfig;
    const key = `${project._id}_${month}_${year}`;
    let calculatedAmt = 0;
    let payloadMetrics = {};

    if (type === 'hourly') {
      const rateInINR = currency === 'USD' ? (parseFloat(hourlyRate) || 0) * usdRate : (parseFloat(hourlyRate) || 0);
      const base = rateInINR * (parseFloat(hoursWorked) || 0);
      calculatedAmt = includeGst ? base * 1.18 : base;
      payloadMetrics = { hourlyRate, hoursWorked, includeGst, currency, usdRate: currency === 'USD' ? usdRate : null };
    } else if (type === 'daily') {
      const rateInINR = currency === 'USD' ? (parseFloat(dailyRate) || 0) * usdRate : (parseFloat(dailyRate) || 0);
      const base = rateInINR * (parseFloat(daysWorked) || 0);
      calculatedAmt = includeGst ? base * 1.18 : base;
      payloadMetrics = { dailyRate, daysWorked, includeGst, currency, usdRate: currency === 'USD' ? usdRate : null };
    } else {
      const totalActiveMonths = countTotalActiveMonths(project);
      const monthlyInstallment = Number(project.expectedAmount || 0) / totalActiveMonths;
      const base = (monthlyInstallment / (parseFloat(totalMonthDays) || 1)) * (parseFloat(daysWorkedMonthly) || 0);
      calculatedAmt = includeGst ? base * 1.18 : base;
      payloadMetrics = { totalMonthDays, daysWorkedMonthly, includeGst };
    }

    const existingPaid = monthlyOverrides[key]?.paid !== undefined ? monthlyOverrides[key].paid : calculatedAmt;

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
      await fetch(`https://expense-management-7.onrender.com/api/project/sync-month/${project._id}`, {
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
      await fetch(`https://expense-management-7.onrender.com/api/project/sync-month/${projectId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ month, year, paid: val }),
      });
    } catch (err) { console.error('Failed processing payment alignment.', err); }
  };

  if (loading) return (
    <div style={{ padding: 40, display: 'flex', alignItems: 'center', gap: 12, fontFamily: "'DM Sans', sans-serif", color: '#9a8775', background: '#f5f0e8', minHeight: '100vh' }}>
      <div style={{ width: 22, height: 22, border: '2.5px solid #e8dece', borderTopColor: '#c97844', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
      Refreshing workspace matrix…
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );

  if (error) return (
    <div style={{ padding: 40, fontFamily: "'DM Sans', sans-serif", color: '#c97844', background: '#f5f0e8', minHeight: '100vh' }}>{error}</div>
  );

  const distinctYears = Array.from(new Set(projects.flatMap(p => {
    const s = p.startDate;
    const e = p.endDate;
    if (!s) return [new Date().getFullYear()];
    const startY = parseUTCDate(s).getFullYear();
    const endY = e ? parseUTCDate(e).getFullYear() : new Date().getFullYear();
    const yearsArray = [];
    for (let y = startY; y <= endY; y++) yearsArray.push(y);
    return yearsArray;
  }))).sort((a,b) => a-b);

  return (
    <div style={{ padding: '36px 24px 60px', background: '#f5f0e8', minHeight: '100vh', fontFamily: "'DM Sans', sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Lora:ital,wght@0,400;0,600;1,400&family=DM+Sans:wght@300;400;500&display=swap');
        * { box-sizing: border-box; }

        .proj-table-scroll {
          overflow-x: auto;
          border-radius: 14px;
          border: 1.5px solid #e8dece;
          background: #fffdf8;
          box-shadow: 0 2px 0 #e2d9c8;
        }
        .proj-table {
          border-collapse: collapse;
          white-space: nowrap;
          width: 100%;
        }
        .col-name {
          position: sticky; left: 0; z-index: 3; background: #fffdf8;
          min-width: 255px; max-width: 255px; border-right: 1.5px solid #e8dece;
        }
        .col-name.head { background: #faf6ee; z-index: 4; }

        .th-month {
          background: #faf6ee; color: #b08a5e; text-align: center;
          font-size: 10px; font-weight: 500; letter-spacing: 1px;
          text-transform: uppercase; padding: 10px 4px;
          border-right: 1.5px solid #e8dece; border-bottom: 1px solid #e8dece;
          font-family: 'DM Sans', sans-serif;
        }
        .th-sub-proj {
          text-align: center; font-size: 10px; font-weight: 500;
          letter-spacing: 0.8px; text-transform: uppercase;
          padding: 5px 6px; border-bottom: 1.5px solid #e8dece;
          border-right: 1px solid #f0ebe0; min-width: 95px;
          background: #faf6ee; color: #b0a090;
          font-family: 'DM Sans', sans-serif;
        }
        .th-sub-proj.amt  { color: #b5672f; }
        .th-sub-proj.paid { color: #7a9e5a; border-right: 1.5px solid #e8dece; }

        .th-total-proj {
          background: #f5f0e8; color: #a05e2a; text-align: center;
          font-size: 10px; font-weight: 500; letter-spacing: 0.8px;
          text-transform: uppercase; padding: 5px 8px;
          border-bottom: 1.5px solid #e8dece; border-right: 1px solid #f0ebe0;
          min-width: 100px; font-family: 'DM Sans', sans-serif;
        }

        tr.proj-data-row:hover td            { background: #fdf8f0 !important; }
        tr.proj-data-row:hover .col-name     { background: #fdf8f0 !important; }

        .td-proj-name {
          padding: 11px 14px; border-bottom: 1px solid #f0ebe0; vertical-align: middle;
        }
        .td-proj-amt {
          text-align: right; padding: 10px 10px;
          font-family: monospace; font-size: 12px;
          border-bottom: 1px solid #f0ebe0; border-right: 1px solid #f0ebe0;
          background: #faf6ee; color: #9a8775; cursor: pointer;
        }
        .td-proj-amt:hover { background: #fdf3e7 !important; }

        .td-proj-paid {
          text-align: right; padding: 10px 10px;
          font-family: monospace; font-size: 12px; color: #7a9e5a;
          border-bottom: 1px solid #f0ebe0; border-right: 1.5px solid #e8dece;
          cursor: pointer; position: relative;
        }
        .td-proj-paid:hover { background: #f5f8f0 !important; }

        .td-proj-inactive {
          background: #faf6ee; color: #d4c8b8; text-align: center; font-size: 11px;
          border-bottom: 1px solid #f0ebe0; border-right: 1.5px solid #e8dece; padding: 10px 6px;
        }

        .proj-edit-inp {
          width: 85px; background: #fffdf8; border: 1.5px solid #c97844;
          border-radius: 8px; padding: 3px 7px;
          font-family: monospace; font-size: 12px;
          color: #2e2318; outline: none; text-align: right;
        }
        .proj-totals-row td {
          background: #faf6ee; border-top: 1.5px solid #e8dece;
          font-family: monospace; font-size: 11px;
          text-align: right; padding: 9px 10px; border-right: 1px solid #f0ebe0;
        }
        .proj-modal-overlay {
          position: fixed; top:0; left:0; width:100%; height:100%;
          background: rgba(46,35,24,0.55); display:flex;
          align-items:center; justify-content:center; z-index:100;
          backdrop-filter: blur(2px);
        }
        .proj-modal-box {
          background: #fffdf8; padding: 28px 26px; border-radius: 18px; width: 360px;
          box-shadow: 0 20px 40px rgba(160,130,90,0.18), 0 2px 0 #e2d9c8;
          border: 1.5px solid #e8dece;
        }
        .proj-modal-field { display:flex; flex-direction:column; gap:6px; margin-bottom:14px; }
        .proj-modal-field label { font-size:11px; color:#8c7a68; font-weight:500; letter-spacing:0.8px; text-transform:uppercase; font-family:'DM Sans',sans-serif; }
        .proj-modal-field input {
          padding: 8px 12px; border: 1.5px solid #e8dece; border-radius: 8px;
          font-size: 13px; outline: none; background: #f5f0e8;
          font-family: monospace; color: #2e2318;
          transition: border-color 0.15s;
        }
        .proj-modal-field input:focus { border-color: #c97844; background: #fffdf8; }
        ::-webkit-scrollbar { height: 5px; }
        ::-webkit-scrollbar-track { background: #f5f0e8; }
        ::-webkit-scrollbar-thumb { background: #e0d4c0; border-radius: 3px; }

        .add-proj-btn {
          display: flex; align-items: center; gap: 7px;
          padding: 10px 18px; flex-shrink: 0; margin-top: 4px;
          background: #c97844; border: none; border-radius: 10px;
          font-size: 13px; font-weight: 600; color: #fff;
          font-family: 'DM Sans', sans-serif;
          cursor: pointer; box-shadow: 0 2px 0 #a05e2a;
          transition: background 0.15s, transform 0.1s;
        }
        .add-proj-btn:hover { background: #b5672f; transform: translateY(-1px); }
        .add-proj-btn:active { transform: translateY(0); }

        .delete-proj-btn {
          width: 26px; height: 26px; border-radius: 7px; flex-shrink: 0;
          border: 1.5px solid transparent; background: transparent;
          display: flex; align-items: center; justify-content: center;
          cursor: pointer; color: #c5b49e;
          transition: background 0.15s, border-color 0.15s, color 0.15s;
          padding: 0;
        }
        .delete-proj-btn:hover {
          background: #fdf0ea; border-color: #e8b89a; color: #c0522a;
        }

        .delete-modal-box {
          background: #fffdf8; padding: 28px 26px; border-radius: 18px; width: 380px;
          box-shadow: 0 20px 40px rgba(160,130,90,0.18), 0 2px 0 #e2d9c8;
          border: 1.5px solid #e8dece;
        }

        .quarter-btn {
          display: flex; align-items: center; gap: 6px;
          padding: 4px 11px; border-radius: 20px; cursor: pointer;
          font-size: 11px; font-weight: 500; font-family: 'DM Sans', sans-serif;
          border: 1.5px solid #e8dece; background: #fffdf8; color: #8c7a68;
          transition: all 0.15s; white-space: nowrap;
        }
        .quarter-btn:hover { background: #fdf3e7; border-color: #f0c490; color: #a05e2a; }
        .quarter-btn.active { background: #fdf3e7; border-color: #f0c490; color: #a05e2a; }

        .quarter-dropdown {
          position: absolute; top: calc(100% + 6px); right: 0; z-index: 20;
          background: #fffdf8; border: 1.5px solid #e8dece; border-radius: 12px;
          box-shadow: 0 8px 24px rgba(160,130,90,0.15);
          padding: 6px; min-width: 110px;
        }
        .quarter-option {
          display: flex; align-items: center; justify-content: space-between;
          padding: 7px 10px; border-radius: 8px; cursor: pointer;
          font-size: 12px; font-weight: 500; color: #5a4535;
          font-family: 'DM Sans', sans-serif; transition: background 0.12s;
          gap: 8px;
        }
        .quarter-option:hover { background: #fdf3e7; }
        .quarter-option.selected { background: #fdf3e7; color: #a05e2a; }
        .quarter-option .q-months { font-size: 9px; color: #b0a090; font-weight: 400; }
        .quarter-option.selected .q-months { color: #c97844; }

        .currency-toggle {
          display: flex; align-items: center; background: #f5f0e8;
          border: 1.5px solid #e8dece; border-radius: 10px; padding: 3px; gap: 3px;
          margin-bottom: 14px;
        }
        .currency-pill {
          flex: 1; text-align: center; padding: 6px 0; border-radius: 7px;
          font-size: 12px; font-weight: 600; cursor: pointer;
          font-family: 'DM Sans', sans-serif; transition: all 0.15s;
          color: #9a8775; border: 1.5px solid transparent;
          user-select: none;
        }
        .currency-pill.inr.active {
          background: #fffdf8; color: #b5672f;
          border-color: #f0c490; box-shadow: 0 1px 4px rgba(160,100,40,0.10);
        }
        .currency-pill.usd.active {
          background: #fffdf8; color: #4a7abf;
          border-color: #a8c4e8; box-shadow: 0 1px 4px rgba(60,100,180,0.10);
        }
        .currency-pill:hover:not(.active) { background: #faf6ee; color: #5a4535; }
      `}</style>

      {/* Page Header */}
      <div style={{ marginBottom: 28, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: 10, fontWeight: 500, letterSpacing: 2, textTransform: 'uppercase', color: '#b08a5e', marginBottom: 5, fontFamily: "'DM Sans', sans-serif" }}>
            Project Tracker
          </div>
          <h2 style={{ fontFamily: "'Lora', serif", fontSize: 26, fontWeight: 600, color: '#2e2318', margin: '0 0 4px' }}>
            Financial Workspace Matrix
          </h2>
          <p style={{ fontSize: 13, color: '#9a8775', margin: 0, fontFamily: "'DM Sans', sans-serif" }}>
            {projects.length} project{projects.length !== 1 ? 's' : ''} &nbsp;·&nbsp;
            Click <span style={{ color: '#b5672f', fontWeight: 500 }}>To Receive</span> to configure metrics &nbsp;·&nbsp;
            Click <span style={{ color: '#7a9e5a', fontWeight: 500 }}>Received</span> to track per month
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
        <div style={{ textAlign: 'center', padding: '60px 0', color: '#b0a090' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>📋</div>
          <div style={{ fontSize: 16, fontWeight: 600, fontFamily: "'Lora', serif", color: '#8c7a68' }}>No projects yet</div>
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
            borderRadius: 18,
            border: '1.5px solid #e8dece',
            overflow: 'hidden',
            boxShadow: '0 2px 0 #e2d9c8, 0 6px 24px rgba(160,130,90,0.07)',
          }}>
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '14px 22px',
              background: '#faf6ee',
              borderBottom: '1px solid #e8dece',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{
                  width: 36, height: 36, borderRadius: 10,
                  background: '#f5ece0', border: '1.5px solid #e8dece',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 16, flexShrink: 0,
                }}>
                  📊
                </div>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#2e2318', fontFamily: "'Lora', serif" }}>
                    Calendar Year {year}
                  </div>
                  <div style={{ fontSize: 11, color: '#9a8775', marginTop: 1, fontFamily: "'DM Sans', sans-serif" }}>
                    {filteredProjects.length} active project{filteredProjects.length !== 1 ? 's' : ''}
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{
                  background: '#fdf3e7', border: '1.5px solid #f0c490',
                  color: '#a05e2a', padding: '3px 12px', borderRadius: 20,
                  fontSize: 11, fontWeight: 500, fontFamily: "'DM Sans', sans-serif",
                }}>
                  To Receive: {fmt(grandYearAmt)}
                </div>
                <div style={{
                  background: '#f5f8f0', border: '1.5px solid #c8deb0',
                  color: '#7a9e5a', padding: '3px 12px', borderRadius: 20,
                  fontSize: 11, fontWeight: 500, fontFamily: "'DM Sans', sans-serif",
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
                          <span className="q-months">Jan–Dec</span>
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

            <div style={{ padding: 20, background: '#fffdf8' }}>
              <div className="proj-table-scroll">
                <table className="proj-table">
                  <thead>
                    <tr>
                      <th
                        className="col-name head"
                        rowSpan={2}
                        style={{
                          padding: '10px 16px', textAlign: 'left', fontSize: 10,
                          fontWeight: 500, color: '#b08a5e', letterSpacing: 1,
                          textTransform: 'uppercase', borderBottom: '1.5px solid #e8dece',
                          background: '#faf6ee', fontFamily: "'DM Sans', sans-serif",
                        }}
                      >
                        Project Track
                      </th>
                      {visibleMonths.map(m => (
                        <th key={m} colSpan={2} className="th-month">{m}</th>
                      ))}
                      <th colSpan={2} style={{
                        background: '#f5ece0', color: '#a05e2a', textAlign: 'center',
                        fontSize: 10, fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase',
                        padding: '10px 8px', borderBottom: '1px solid #e8dece',
                        fontFamily: "'DM Sans', sans-serif",
                      }}>
                        {quarterFilter[year] ? `${quarterFilter[year]} Total` : 'Year Total'}
                      </th>
                    </tr>
                    <tr>
                      {visibleMonths.map(m => (
                        <React.Fragment key={m}>
                          <th className="th-sub-proj amt">To Receive</th>
                          <th className="th-sub-proj paid">Received</th>
                        </React.Fragment>
                      ))}
                      <th className="th-total-proj" style={{ borderRight: '1px solid #f0ebe0' }}>Received</th>
                      <th className="th-total-proj" style={{ color: '#9a8775', background: '#faf6ee' }}>To Receive</th>
                    </tr>
                  </thead>

                  <tbody>
                    {filteredProjects.map(project => {
                      const matrixKey = `${project._id}_${year}`;
                      const data = timelineData[matrixKey] || {};

                      const yrTotalPaid = visibleMonths.reduce((s, m) => s + (data[m]?.paid || 0), 0);
                      const yrTotalAmt  = visibleMonths.reduce((s, m) => s + (data[m]?.amt  || 0), 0);

                      return (
                        <tr key={project._id} className="proj-data-row" style={{ borderBottom: '1px solid #f0ebe0' }}>
                          {/* ─── PROJECT NAME CELL with delete button ─── */}
                          <td className="col-name td-proj-name">
                            <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                              <ProjectAvatar name={project.projectName || '?'} />
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: 13, fontWeight: 500, color: '#2e2318', fontFamily: "'DM Sans', sans-serif", overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                  {project.projectName}
                                </div>
                                <div style={{ fontSize: 10, color: '#b0a090', marginTop: 2, fontFamily: "'DM Sans', sans-serif" }}>
                                  <span style={{
                                    display: 'inline-block',
                                    background: '#fdf3e7', border: '1px solid #f0c490',
                                    color: '#a05e2a', borderRadius: 4, padding: '1px 5px',
                                    fontFamily: 'monospace', fontSize: 9, fontWeight: 600,
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
                            const isEditingPay = editingPayment?.projectId === project._id && editingPayment?.month === m && editingPayment?.year === year;

                            if (!cell || !cell.active) {
                              return <td key={m} className="td-proj-inactive" colSpan={2}>—</td>;
                            }

                            return (
                              <React.Fragment key={m}>
                                <td className="td-proj-amt" onClick={() => openCalculatorModal(project, m, year)}>
                                  <div>{fmt(cell.amt)}</div>
                                  <span style={{ fontSize: 9, color: '#c97844', textDecoration: 'underline' }}>Configure</span>
                                </td>

                                <td className="td-proj-paid" onClick={() => !isEditingPay && startPaymentEdit(project._id, m, year, cell.paid)}>
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

                          <td style={{ textAlign: 'right', padding: '10px 12px', fontFamily: 'monospace', fontSize: 12, fontWeight: 600, color: '#7a9e5a', borderBottom: '1px solid #f0ebe0', borderRight: '1px solid #f0ebe0', background: '#f5f8f0' }}>
                            {fmt(yrTotalPaid)}
                          </td>
                          <td style={{ textAlign: 'right', padding: '10px 12px', fontFamily: 'monospace', fontSize: 12, color: '#b0a090', borderBottom: '1px solid #f0ebe0', background: '#faf6ee' }}>
                            {fmt(yrTotalAmt)}
                          </td>
                        </tr>
                      );
                    })}

                    <tr className="proj-totals-row">
                      <td
                        className="col-name"
                        style={{
                          padding: '10px 16px', fontSize: 10, fontWeight: 500, color: '#8c7a68',
                          textTransform: 'uppercase', letterSpacing: 0.8,
                          borderTop: '1.5px solid #e8dece', background: '#faf6ee', textAlign: 'left',
                          fontFamily: "'DM Sans', sans-serif",
                        }}
                      >
                        Monthly Totals
                        <div style={{ fontSize: 9, color: '#c5b49e', marginTop: 2, fontWeight: 400 }}>{quarterFilter[year] ? `${quarterFilter[year]}: ${QUARTERS[quarterFilter[year]].join(', ')}` : 'All projects combined'}</div>
                      </td>

                      {visibleMonths.map(m => {
                        const { totalAmt, totalPaid } = monthColTotals[m];
                        const hasActivity = totalAmt > 0 || totalPaid > 0;
                        return (
                          <React.Fragment key={m}>
                            <td style={{ color: hasActivity ? '#b5672f' : '#d4c8b8', fontFamily: 'monospace' }}>
                              {hasActivity ? fmt(totalAmt) : '—'}
                            </td>
                            <td style={{ color: hasActivity ? '#7a9e5a' : '#d4c8b8', borderRight: '1.5px solid #e8dece', fontFamily: 'monospace' }}>
                              {hasActivity ? fmt(totalPaid) : '—'}
                            </td>
                          </React.Fragment>
                        );
                      })}

                      <td style={{ color: '#7a9e5a', fontWeight: 700, background: '#f5f8f0', fontFamily: 'monospace' }}>
                        {fmt(grandYearPaid)}
                      </td>
                      <td style={{ color: '#b0a090', background: '#faf6ee', fontFamily: 'monospace' }}>
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

      <p style={{ marginTop: 8, fontSize: 11, color: '#c5b49e', textAlign: 'center', fontFamily: "'DM Sans', sans-serif" }}>
        Scroll right to see all months &nbsp;·&nbsp;
        Click <span style={{ color: '#b5672f' }}>To Receive</span> to configure &nbsp;·&nbsp;
        Click <span style={{ color: '#7a9e5a' }}>Received</span> to edit
      </p>

      {/* ─── CALCULATOR MODAL ─── */}
      {modalConfig && (
        <div className="proj-modal-overlay">
          <div className="proj-modal-box">
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
              <div style={{
                width: 36, height: 36, borderRadius: 10,
                background: '#fdf3e7', border: '1.5px solid #f0c490',
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16,
              }}>
                🧮
              </div>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#2e2318', fontFamily: "'Lora', serif" }}>
                  Configure {modalConfig.type.toUpperCase()} Track
                </div>
                <div style={{ fontSize: 11, color: '#9a8775', marginTop: 1, fontFamily: "'DM Sans', sans-serif" }}>
                  {modalConfig.month} {modalConfig.year} &nbsp;·&nbsp; {modalConfig.project.projectName}
                </div>
              </div>
            </div>

            {modalConfig.type === 'hourly' && (
              <>
                {/* Currency Toggle */}
                <div style={{ marginBottom: 4 }}>
                  <div style={{ fontSize: 11, color: '#8c7a68', fontWeight: 500, letterSpacing: '0.8px', textTransform: 'uppercase', marginBottom: 6, fontFamily: "'DM Sans', sans-serif" }}>Rate Currency</div>
                  <div className="currency-toggle">
                    <div
                      className={`currency-pill inr${currency === 'INR' ? ' active' : ''}`}
                      onClick={() => setCurrency('INR')}
                    >
                      ₹ INR
                    </div>
                    <div
                      className={`currency-pill usd${currency === 'USD' ? ' active' : ''}`}
                      onClick={() => { setCurrency('USD'); fetchUsdRate(); }}
                    >
                      $ USD
                    </div>
                  </div>
                </div>

                {currency === 'USD' && (
                  <div style={{
                    background: '#f0f4ff', border: '1.5px solid #a8c4e8',
                    borderRadius: 8, padding: '8px 12px', marginBottom: 12,
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    fontFamily: "'DM Sans', sans-serif",
                  }}>
                    <div style={{ fontSize: 11, color: '#4a7abf' }}>
                      {usdRateLoading ? 'Fetching live rate…' : `1 USD = ₹${usdRate.toFixed(2)}`}
                    </div>
                    <div
                      onClick={fetchUsdRate}
                      style={{ fontSize: 10, color: '#4a7abf', cursor: 'pointer', textDecoration: 'underline', opacity: usdRateLoading ? 0.5 : 1 }}
                    >
                      Refresh
                    </div>
                  </div>
                )}

                <div className="proj-modal-field">
                  <label>Hourly Rate ({currency === 'USD' ? '$' : '₹'})</label>
                  <input type="number" value={hourlyRate} onChange={e => setHourlyRate(e.target.value)} />
                </div>
                {currency === 'USD' && hourlyRate && (
                  <div style={{ fontSize: 10, color: '#7a9e5a', fontFamily: 'monospace', marginTop: -8, marginBottom: 10, textAlign: 'right' }}>
                    = ₹{((parseFloat(hourlyRate) || 0) * usdRate).toLocaleString('en-IN', { maximumFractionDigits: 0 })} / hr
                  </div>
                )}
                <div className="proj-modal-field">
                  <label>Hours Worked This Month</label>
                  <input type="number" value={hoursWorked} onChange={e => setHoursWorked(e.target.value)} />
                </div>
              </>
            )}

            {modalConfig.type === 'daily' && (
              <>
                {/* Currency Toggle */}
                <div style={{ marginBottom: 4 }}>
                  <div style={{ fontSize: 11, color: '#8c7a68', fontWeight: 500, letterSpacing: '0.8px', textTransform: 'uppercase', marginBottom: 6, fontFamily: "'DM Sans', sans-serif" }}>Rate Currency</div>
                  <div className="currency-toggle">
                    <div
                      className={`currency-pill inr${currency === 'INR' ? ' active' : ''}`}
                      onClick={() => setCurrency('INR')}
                    >
                      ₹ INR
                    </div>
                    <div
                      className={`currency-pill usd${currency === 'USD' ? ' active' : ''}`}
                      onClick={() => { setCurrency('USD'); fetchUsdRate(); }}
                    >
                      $ USD
                    </div>
                  </div>
                </div>

                {currency === 'USD' && (
                  <div style={{
                    background: '#f0f4ff', border: '1.5px solid #a8c4e8',
                    borderRadius: 8, padding: '8px 12px', marginBottom: 12,
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    fontFamily: "'DM Sans', sans-serif",
                  }}>
                    <div style={{ fontSize: 11, color: '#4a7abf' }}>
                      {usdRateLoading ? 'Fetching live rate…' : `1 USD = ₹${usdRate.toFixed(2)}`}
                    </div>
                    <div
                      onClick={fetchUsdRate}
                      style={{ fontSize: 10, color: '#4a7abf', cursor: 'pointer', textDecoration: 'underline', opacity: usdRateLoading ? 0.5 : 1 }}
                    >
                      Refresh
                    </div>
                  </div>
                )}

                <div className="proj-modal-field">
                  <label>Daily Rate ({currency === 'USD' ? '$' : '₹'})</label>
                  <input type="number" value={dailyRate} onChange={e => setDailyRate(e.target.value)} />
                </div>
                {currency === 'USD' && dailyRate && (
                  <div style={{ fontSize: 10, color: '#7a9e5a', fontFamily: 'monospace', marginTop: -8, marginBottom: 10, textAlign: 'right' }}>
                    = ₹{((parseFloat(dailyRate) || 0) * usdRate).toLocaleString('en-IN', { maximumFractionDigits: 0 })} / day
                  </div>
                )}
                <div className="proj-modal-field">
                  <label>Days Worked This Month</label>
                  <input type="number" value={daysWorked} onChange={e => setDaysWorked(e.target.value)} />
                </div>
              </>
            )}

           {modalConfig.type === 'monthly' && (
              <>
                <div style={{
                  background: '#faf6ee', border: '1.5px solid #e8dece',
                  padding: '10px 12px', borderRadius: 8, fontSize: 11,
                  color: '#8c7a68', marginBottom: 14, fontFamily: "'DM Sans', sans-serif",
                }}>
                  <div>Base installment: <span style={{ color: '#b5672f', fontFamily: 'monospace', fontWeight: 600 }}>
                    {fmt((modalConfig.project.expectedAmount || 0) / countTotalActiveMonths(modalConfig.project))}
                  </span></div>
                  <div style={{ marginTop: 3, color: '#c5b49e' }}>
                    {countTotalActiveMonths(modalConfig.project)} active months total
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

          {/* GST Toggle */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            background: includeGst ? '#f5f8f0' : '#faf6ee',
            border: `1.5px solid ${includeGst ? '#c8deb0' : '#e8dece'}`,
            borderRadius: 10, padding: '10px 14px', marginBottom: 16,
            cursor: 'pointer', transition: 'all 0.15s',
          }} onClick={() => setIncludeGst(v => !v)}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{
                width: 28, height: 28, borderRadius: 8,
                background: includeGst ? '#e8f4d8' : '#f0ebe0',
                border: `1.5px solid ${includeGst ? '#c8deb0' : '#e8dece'}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 13, flexShrink: 0, transition: 'all 0.15s',
              }}>
                {includeGst ? '✓' : '%'}
              </div>
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: includeGst ? '#5a8a3a' : '#8c7a68', fontFamily: "'DM Sans', sans-serif" }}>
                  Include GST (18%)
                </div>
                <div style={{ fontSize: 10, color: '#b0a090', marginTop: 1, fontFamily: "'DM Sans', sans-serif" }}>
                  {includeGst ? 'GST will be added to the final amount' : 'Click to add 18% GST on top'}
                </div>
              </div>
            </div>
            {(() => {
              let base = 0;
              const { type, project } = modalConfig;
              if (type === 'hourly') {
                const rateInINR = currency === 'USD' ? (parseFloat(hourlyRate) || 0) * usdRate : (parseFloat(hourlyRate) || 0);
                base = rateInINR * (parseFloat(hoursWorked) || 0);
              } else if (type === 'daily') {
                const rateInINR = currency === 'USD' ? (parseFloat(dailyRate) || 0) * usdRate : (parseFloat(dailyRate) || 0);
                base = rateInINR * (parseFloat(daysWorked) || 0);
              } else {
                const totalActiveMonths = countTotalActiveMonths(project);
                const inst = Number(project.expectedAmount || 0) / totalActiveMonths;
                base = (inst / (parseFloat(totalMonthDays) || 1)) * (parseFloat(daysWorkedMonthly) || 0);
              }
              const gstAmt = base * 0.18;
              const final = includeGst ? base + gstAmt : base;
              return (
                <div style={{ textAlign: 'right' }}>
                  {currency === 'USD' && (type === 'hourly' || type === 'daily') && (
                    <div style={{ fontSize: 9, color: '#4a7abf', fontFamily: 'monospace', marginBottom: 2 }}>
                      @ ₹{usdRate.toFixed(2)}/USD
                    </div>
                  )}
                  {includeGst && (
                    <div style={{ fontSize: 9, color: '#7a9e5a', fontFamily: 'monospace', marginBottom: 2 }}>
                      +{fmt(gstAmt)} GST
                    </div>
                  )}
                  <div style={{
                    fontSize: 13, fontWeight: 700, fontFamily: 'monospace',
                    color: includeGst ? '#5a8a3a' : '#9a8775',
                  }}>
                    {fmt(final)}
                  </div>
                </div>
              );
            })()}
          </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 }}>
              <button
                onClick={() => setModalConfig(null)}
                style={{
                  padding: '8px 14px', background: '#f5f0e8',
                  border: '1.5px solid #e8dece', borderRadius: 8,
                  fontSize: 12, cursor: 'pointer', fontWeight: 500,
                  color: '#8c7a68', fontFamily: "'DM Sans', sans-serif",
                }}
              >
                Cancel
              </button>
              <button
                onClick={saveModalCalculation}
                style={{
                  padding: '8px 16px', background: '#c97844',
                  border: 'none', borderRadius: 8,
                  fontSize: 12, cursor: 'pointer', fontWeight: 600,
                  color: '#fff', fontFamily: "'DM Sans', sans-serif",
                  boxShadow: '0 2px 0 #a05e2a',
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
                background: '#fdf0ea', border: '1.5px solid #e8b89a',
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18,
              }}>
                🗑️
              </div>
              <div>
                <div style={{ fontSize: 15, fontWeight: 600, color: '#2e2318', fontFamily: "'Lora', serif" }}>
                  Delete Project
                </div>
                <div style={{ fontSize: 11, color: '#9a8775', marginTop: 2, fontFamily: "'DM Sans', sans-serif" }}>
                  This action cannot be undone
                </div>
              </div>
            </div>

            {/* Project preview */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 10,
              background: '#faf6ee', border: '1.5px solid #e8dece',
              borderRadius: 10, padding: '10px 14px', marginBottom: 18,
            }}>
              <ProjectAvatar name={deleteConfirm.project.projectName || '?'} />
              <div>
                <div style={{ fontSize: 13, fontWeight: 500, color: '#2e2318', fontFamily: "'DM Sans', sans-serif" }}>
                  {deleteConfirm.project.projectName}
                </div>
                <div style={{ fontSize: 10, color: '#b0a090', marginTop: 2, fontFamily: "'DM Sans', sans-serif" }}>
                  <span style={{
                    background: '#fdf3e7', border: '1px solid #f0c490',
                    color: '#a05e2a', borderRadius: 4, padding: '1px 5px',
                    fontFamily: 'monospace', fontSize: 9, fontWeight: 600,
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
              fontSize: 12, color: '#9a8775', margin: '0 0 20px',
              fontFamily: "'DM Sans', sans-serif", lineHeight: 1.6,
            }}>
              All monthly breakdowns and payment records for this project will be permanently removed.
            </p>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button
                onClick={() => setDeleteConfirm(null)}
                disabled={deleting}
                style={{
                  padding: '8px 16px', background: '#f5f0e8',
                  border: '1.5px solid #e8dece', borderRadius: 8,
                  fontSize: 12, cursor: deleting ? 'not-allowed' : 'pointer',
                  fontWeight: 500, color: '#8c7a68',
                  fontFamily: "'DM Sans', sans-serif",
                  opacity: deleting ? 0.6 : 1,
                }}
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                disabled={deleting}
                style={{
                  padding: '8px 18px',
                  background: deleting ? '#d4a090' : '#c0522a',
                  border: 'none', borderRadius: 8,
                  fontSize: 12, cursor: deleting ? 'not-allowed' : 'pointer',
                  fontWeight: 600, color: '#fff',
                  fontFamily: "'DM Sans', sans-serif",
                  boxShadow: deleting ? 'none' : '0 2px 0 #8c3010',
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
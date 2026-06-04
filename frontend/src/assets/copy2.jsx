import React, { useEffect, useState, useRef } from 'react';
import axios from 'axios';

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

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

// FIX 1: Count total active months across ALL years for a project (for correct monthly installment)
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
  let carry = 0;
  const result = {};

  // FIX 1: Use actual active months count instead of hardcoded 10
  const totalActiveMonths = countTotalActiveMonths(project);

  MONTHS.forEach((m, i) => {
    if (!isMonthActive(project, i, year)) {
      result[m] = { amt: 0, paid: 0, carry: 0, active: false };
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
        // FIX 1: Divide by actual total active months, not hardcoded 10
        calculatedBase = Number(project.expectedAmount || 0) / totalActiveMonths;
      } else {
        calculatedBase = 0;
      }
      savedPaid = Math.max(0, calculatedBase);
    }

    const amt = calculatedBase + carry;
    const paid = savedPaid;
    
    carry = amt - paid;
    result[m] = { 
      amt, 
      paid, 
      carry, 
      active: true,
      metrics: localizedOverrides[overrideKey] || null 
    };
  });
  return result;
}

const ProjectTable = () => {
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

  const rebuildMatrix = (allProjs, overrides) => {
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
  };

  const fetchProjects = async () => {
    try {
      const response = await axios.get('http://localhost:5000/api/project/all');
      const data = response.data;
      setProjects(data);

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
    } catch (err) {
      setError('Failed to fetch structural project metrics.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const load = async () => { await fetchProjects(); };
    load();
  }, []);

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

    setModalConfig({ project, month, year, type });
  };

  const saveModalCalculation = async () => {
    if (!modalConfig) return;
    const { project, month, year, type } = modalConfig;
    const key = `${project._id}_${month}_${year}`;
    let calculatedAmt = 0;
    let payloadMetrics = {};

    if (type === 'hourly') {
      calculatedAmt = (parseFloat(hourlyRate) || 0) * (parseFloat(hoursWorked) || 0);
      payloadMetrics = { hourlyRate, hoursWorked };
    } else if (type === 'daily') {
      calculatedAmt = (parseFloat(dailyRate) || 0) * (parseFloat(daysWorked) || 0);
      payloadMetrics = { dailyRate, daysWorked };
    } else {
      // FIX 1: Use actual total active months instead of hardcoded 10
      const totalActiveMonths = countTotalActiveMonths(project);
      const monthlyInstallment = Number(project.expectedAmount || 0) / totalActiveMonths;
      calculatedAmt = (monthlyInstallment / (parseFloat(totalMonthDays) || 1)) * (parseFloat(daysWorkedMonthly) || 0);
      payloadMetrics = { totalMonthDays, daysWorkedMonthly };
    }

    const existingPaid = monthlyOverrides[key]?.paid !== undefined ? monthlyOverrides[key].paid : calculatedAmt;

    const updatedOverride = {
      ...monthlyOverrides,
      [key]: { ...monthlyOverrides[key], amt: calculatedAmt, paid: existingPaid, ...payloadMetrics, month, year }
    };

    setMonthlyOverrides(updatedOverride);
    rebuildMatrix(projects, updatedOverride);
    setModalConfig(null);

    try {
      await axios.patch(`http://localhost:5000/api/project/sync-month/${project._id}`, {
        month, year, amt: calculatedAmt, metrics: payloadMetrics
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
    rebuildMatrix(projects, updatedOverride);
    setEditingPayment(null);

    try {
      await axios.patch(`http://localhost:5000/api/project/sync-month/${projectId}`, {
        month, year, paid: val
      });
    } catch (err) { console.error('Failed processing payment alignment.', err); }
  };

  if (loading) return <p style={{ padding: 20, color: '#64748b' }}>Refreshing workspace matrix...</p>;
  if (error)   return <p style={{ padding: 20, color: '#ef4444' }}>{error}</p>;

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
    <div style={{ padding: '24px 20px', background: '#f8fafc', minHeight: '100vh', fontFamily: "'Outfit', sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap');
        * { box-sizing: border-box; }
        .proj-table-scroll { overflow-x: auto; border-radius: 12px; border: 1px solid #e2e8f0; background: #fff; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); margin-bottom: 32px; }
        .proj-table { border-collapse: collapse; white-space: nowrap; width: 100%; }
        .col-name { position: sticky; left: 0; z-index: 3; background: #fff; min-width: 240px; border-right: 2px solid #e2e8f0; padding: 12px; }
        .col-name.head { background: #f8fafc; z-index: 4; }
        .th-month { background: #0f172a; color: #38bdf8; text-align: center; font-size: 11px; font-weight: 700; padding: 10px; border-right: 1px solid #334155; }
        .th-sub { text-align: center; font-size: 10px; font-weight: 600; padding: 6px; border-bottom: 2px solid #e2e8f0; border-right: 1px solid #e9eef5; min-width: 95px; }
        .td-amt { text-align: right; padding: 12px 10px; font-family: 'JetBrains Mono', monospace; font-size: 12px; border-bottom: 1px solid #f1f5f9; border-right: 1px solid #e9eef5; background: #fafbff; cursor: pointer; }
        .td-amt:hover { background: #eeeffe; }
        .td-paid { text-align: right; padding: 12px 10px; font-family: 'JetBrains Mono', monospace; font-size: 12px; color: #059669; border-bottom: 1px solid #f1f5f9; border-right: 2px solid #e2e8f0; cursor: pointer; }
        .td-paid:hover { background: #ecfdf5 !important; }
        .td-inactive { background: #f8fafc; color: #cbd5e1; text-align: center; border-bottom: 1px solid #f1f5f9; border-right: 2px solid #e2e8f0; }
        .edit-inp { width: 85px; background: #fff; border: 2px solid #4f46e5; border-radius: 6px; padding: 4px; text-align: right; font-family: 'JetBrains Mono'; font-size: 12px; }
        .modal-overlay { position: fixed; top:0; left:0; width:100%; height:100%; background: rgba(15,23,42,0.6); display:flex; align-items:center; justify-content:center; z-index:100; }
        .modal-box { background:#fff; padding:24px; border-radius:12px; width:340px; box-shadow: 0 20px 25px -5px rgba(0,0,0,0.1); }
        .modal-field { display:flex; flex-direction:column; gap:6px; margin-bottom:14px; }
        .modal-field label { font-size:12px; color:#475569; font-weight:600; }
        .modal-field input { padding:8px 12px; border:1px solid #cbd5e1; border-radius:6px; font-size:13px; outline:none; }
        .totals-row td { border-top: 2px solid #334155; }
      `}</style>

      <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: '#0f172a' }}>Financial Multi-Year Workspace Matrix</h2>
        <p style={{ fontSize: 13, color: '#64748b', marginTop: 4 }}>
          Click on <b>Amount</b> to configure metrics, or <b>Paid</b> to track logs per month.
        </p>
      </div>

      {distinctYears.map(year => {
        const filteredProjects = projects.filter(p => isProjectActiveInYear(p, year));
        if (filteredProjects.length === 0) return null;

        // FIX 2: Compute per-month column totals across all projects for this year
        const monthColTotals = {};
        MONTHS.forEach(m => {
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

        // Grand totals for the year totals columns
        const grandYearPaid = MONTHS.reduce((s, m) => s + monthColTotals[m].totalPaid, 0);
        const grandYearAmt  = MONTHS.reduce((s, m) => s + monthColTotals[m].totalAmt,  0);

        return (
          <div key={year} style={{ marginBottom: 32 }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#1e293b', color: '#fff', padding: '6px 12px', borderRadius: 6, fontSize: 11, fontWeight: 700, marginBottom: 12 }}>
              Calendar Year Matrix: {year}
            </div>

            <div className="proj-table-scroll">
              <table className="proj-table">
                <thead>
                  <tr>
                    <th className="col-name head" rowSpan={2}>Operational Track Item</th>
                    {MONTHS.map(m => (
                      <th key={m} colSpan={2} className="th-month">{m}</th>
                    ))}
                    <th colSpan={2} style={{ background: '#1e293b', color: '#38bdf8', padding: '10px', fontSize: 11 }}>Year Totals</th>
                  </tr>
                  <tr>
                    {MONTHS.map(m => (
                      <React.Fragment key={m}>
                        <th className="th-sub" style={{ color: '#4f46e5', background: '#f5f3ff' }}>Amount</th>
                        <th className="th-sub" style={{ color: '#059669', background: '#ecfdf5' }}>Paid</th>
                      </React.Fragment>
                    ))}
                    <th className="th-sub" style={{ background: '#ecfdf5', color: '#059669' }}>Total Paid</th>
                    <th className="th-sub" style={{ background: '#f1f5f9', color: '#475569' }}>Total Due</th>
                  </tr>
                </thead>

                <tbody>
                  {filteredProjects.map(project => {
                    const matrixKey = `${project._id}_${year}`;
                    const data = timelineData[matrixKey] || {};

                    const yrTotalPaid = MONTHS.reduce((s, m) => s + (data[m]?.paid || 0), 0);
                    const yrTotalAmt  = MONTHS.reduce((s, m) => s + (data[m]?.amt  || 0), 0);

                    return (
                      <tr key={project._id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td className="col-name">
                          <div style={{ fontSize: 13, fontWeight: 600, color: '#0f172a' }}>{project.projectName}</div>
                          <div style={{ fontSize: 10, color: '#64748b', textTransform: 'uppercase', fontWeight: 700, marginTop: 4 }}>
                            Type: {project.projectType || 'monthly'}
                          </div>
                        </td>

                        {MONTHS.map(m => {
                          const cell = data[m];
                          const isEditingPay = editingPayment?.projectId === project._id && editingPayment?.month === m && editingPayment?.year === year;

                          if (!cell || !cell.active) {
                            return <td key={m} className="td-inactive" colSpan={2}>—</td>;
                          }

                          return (
                            <React.Fragment key={m}>
                              <td className="td-amt" onClick={() => openCalculatorModal(project, m, year)}>
                                <div style={{ fontWeight: '500' }}>{fmt(cell.amt)}</div>
                                <span style={{ fontSize: 9, color: '#6366f1', textDecoration: 'underline' }}>Configure</span>
                              </td>

                              <td className="td-paid" onClick={() => !isEditingPay && startPaymentEdit(project._id, m, year, cell.paid)}>
                                {isEditingPay ? (
                                  <input
                                    ref={inputRef}
                                    className="edit-inp"
                                    value={paymentInput}
                                    onChange={e => setPaymentInput(e.target.value)}
                                    onBlur={commitPaymentEdit}
                                    onKeyDown={e => { if(e.key === 'Enter') commitPaymentEdit(); if(e.key === 'Escape') setEditingPayment(null); }}
                                  />
                                ) : (
                                  <div>
                                    <div>{fmt(cell.paid)}</div>
                                    {cell.carry > 0 && <span style={{ fontSize: 9, color: '#dc2626' }}>+{fmt(cell.carry)} short</span>}
                                    {cell.carry < 0 && <span style={{ fontSize: 9, color: '#059669' }}>-{fmt(Math.abs(cell.carry))} over</span>}
                                  </div>
                                )}
                              </td>
                            </React.Fragment>
                          );
                        })}

                        <td style={{ textAlign: 'right', padding: 12, fontFamily: 'JetBrains Mono', fontSize: 12, background: '#ecfdf5', fontWeight: 600, color: '#059669' }}>{fmt(yrTotalPaid)}</td>
                        <td style={{ textAlign: 'right', padding: 12, fontFamily: 'JetBrains Mono', fontSize: 12, background: '#f8fafc', fontWeight: 600, color: '#475569' }}>{fmt(yrTotalAmt)}</td>
                      </tr>
                    );
                  })}

                  {/* FIX 2: Monthly totals row at the bottom */}
                  <tr className="totals-row" style={{ background: '#0f172a' }}>
                    <td className="col-name" style={{ background: '#0f172a', borderRight: '2px solid #334155' }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: '#38bdf8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        Monthly Totals
                      </div>
                      <div style={{ fontSize: 9, color: '#64748b', marginTop: 2 }}>All projects combined</div>
                    </td>

                    {MONTHS.map(m => {
                      const { totalAmt, totalPaid } = monthColTotals[m];
                      const hasActivity = totalAmt > 0 || totalPaid > 0;

                      return (
                        <React.Fragment key={m}>
                          <td style={{
                            textAlign: 'right',
                            padding: '10px 10px',
                            fontFamily: 'JetBrains Mono',
                            fontSize: 11,
                            fontWeight: 600,
                            color: hasActivity ? '#a5b4fc' : '#334155',
                            background: '#0f172a',
                            borderRight: '1px solid #1e293b',
                            borderBottom: 'none',
                          }}>
                            {hasActivity ? fmt(totalAmt) : '—'}
                          </td>
                          <td style={{
                            textAlign: 'right',
                            padding: '10px 10px',
                            fontFamily: 'JetBrains Mono',
                            fontSize: 11,
                            fontWeight: 600,
                            color: hasActivity ? '#34d399' : '#334155',
                            background: '#0f172a',
                            borderRight: '2px solid #1e293b',
                            borderBottom: 'none',
                          }}>
                            {hasActivity ? fmt(totalPaid) : '—'}
                          </td>
                        </React.Fragment>
                      );
                    })}

                    {/* Grand year totals in totals row */}
                    <td style={{ textAlign: 'right', padding: 12, fontFamily: 'JetBrains Mono', fontSize: 12, background: '#064e3b', fontWeight: 700, color: '#34d399', borderBottom: 'none' }}>
                      {fmt(grandYearPaid)}
                    </td>
                    <td style={{ textAlign: 'right', padding: 12, fontFamily: 'JetBrains Mono', fontSize: 12, background: '#1e293b', fontWeight: 700, color: '#94a3b8', borderBottom: 'none' }}>
                      {fmt(grandYearAmt)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        );
      })}

      {/* Unified Calculations Configuration Modal Component */}
      {modalConfig && (
        <div className="modal-overlay">
          <div className="modal-box">
            <h3 style={{ margin: '0 0 4px 0', fontSize: 16, color: '#0f172a' }}>Configure {modalConfig.type.toUpperCase()} Track</h3>
            <p style={{ margin: '0 0 16px 0', fontSize: 12, color: '#64748b' }}>
              Setting metrics for <b>{modalConfig.month} {modalConfig.year}</b>
            </p>

            {modalConfig.type === 'hourly' && (
              <>
                <div className="modal-field">
                  <label>Hourly Rate (₹)</label>
                  <input type="number" value={hourlyRate} onChange={e => setHourlyRate(e.target.value)} />
                </div>
                <div className="modal-field">
                  <label>Hours Worked This Month</label>
                  <input type="number" value={hoursWorked} onChange={e => setHoursWorked(e.target.value)} />
                </div>
              </>
            )}

            {modalConfig.type === 'daily' && (
              <>
                <div className="modal-field">
                  <label>Daily Rate (₹)</label>
                  <input type="number" value={dailyRate} onChange={e => setDailyRate(e.target.value)} />
                </div>
                <div className="modal-field">
                  <label>Days Worked This Month</label>
                  <input type="number" value={daysWorked} onChange={e => setDaysWorked(e.target.value)} />
                </div>
              </>
            )}

            {modalConfig.type === 'monthly' && (
              <>
                {/* FIX 1: Show the correct installment based on actual active months */}
                <div style={{ background: '#f1f5f9', padding: 8, borderRadius: 6, fontSize: 11, color: '#475569', marginBottom: 12 }}>
                  Expected base total installment: {fmt((modalConfig.project.expectedAmount || 0) / countTotalActiveMonths(modalConfig.project))}
                  <span style={{ display: 'block', marginTop: 2, color: '#94a3b8' }}>
                    ({countTotalActiveMonths(modalConfig.project)} active months total)
                  </span>
                </div>
                <div className="modal-field">
                  <label>Total Cycle Days in Month</label>
                  <input type="number" value={totalMonthDays} onChange={e => setTotalMonthDays(e.target.value)} />
                </div>
                <div className="modal-field">
                  <label>Days Actually Worked</label>
                  <input type="number" value={daysWorkedMonthly} onChange={e => setDaysWorkedMonthly(e.target.value)} />
                </div>
              </>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 }}>
              <button onClick={() => setModalConfig(null)} style={{ padding: '8px 12px', background: '#f1f5f9', border: 'none', borderRadius: 6, fontSize: 12, cursor: 'pointer', fontWeight: 600, color: '#475569' }}>
                Cancel
              </button>
              <button onClick={saveModalCalculation} style={{ padding: '8px 14px', background: '#4f46e5', border: 'none', borderRadius: 6, fontSize: 12, cursor: 'pointer', fontWeight: 600, color: '#fff' }}>
                Save & Compute
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProjectTable;
import React, { useEffect, useState } from 'react'

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const MONTH_FULL = ['January','February','March','April','May','June','July','August','September','October','November','December']
const Q = { Q1:[0,1,2], Q2:[3,4,5], Q3:[6,7,8], Q4:[9,10,11] }
const H = { H1:[0,1,2,3,4,5], H2:[6,7,8,9,10,11], all:[0,1,2,3,4,5,6,7,8,9,10,11] }

const API_BASE = import.meta.env.VITE_API_BASE
const fmt = (n) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n || 0)

// Parse a date string into a local (midnight) date, ignoring timezone drift
function parseUTCDate(dateStr) {
  if (!dateStr) return null
  const d = new Date(dateStr)
  if (isNaN(d)) return null
  return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
}

function fmtDate(dateStr) {
  const d = parseUTCDate(dateStr)
  if (!d) return '\u2014'
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

// A project is active if today falls within [startDate, endDate] inclusive.
function isProjectActive(p) {
  const today = new Date()
  const t = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  const start = parseUTCDate(p.startDate)
  const end   = parseUTCDate(p.endDate)
  if (start && t < start) return false
  if (end && t > end) return false
  return true
}

const Projectmaster = () => {
  const [projects, setProjects]   = useState([])
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState(null)
  const [years, setYears]         = useState([])
  const [year, setYear]           = useState(new Date().getFullYear())
  const [view, setView]           = useState('all')
  const [half, setHalf]           = useState('all')
  // New: single-month filter. null = no single month selected.
  const [month, setMonth]         = useState(null) // 0-11 calendar index

  useEffect(() => {
    fetch(`${API_BASE}/project/all`)
      .then(r => { if (!r.ok) throw new Error('Failed'); return r.json() })
      .then(data => {
        setProjects(data)

        const ys = [...new Set(data.flatMap(p => (p.monthlyBreakdowns || []).map(b => b.year)))]
          .sort((a, b) => b - a)
        if (!ys.length) ys.push(new Date().getFullYear())
        setYears(ys)
        setYear(ys[0])
        setLoading(false)
      })
      .catch(e => { setError(e.message); setLoading(false) })
  }, [])

  const visibleMonths = () => {
    if (month !== null) return [month]
    if (half === 'H1') return H.H1
    if (half === 'H2') return H.H2
    if (view !== 'all') return Q[view]
    return H.all
  }

  // Per-month rows
  const monthData = MONTHS.map((m, mi) => {
    const matched = projects.filter(p =>
      (p.monthlyBreakdowns || []).some(b => b.month === m && Number(b.year) === Number(year))
    )
    const rows = matched.map(p => {
      const b = p.monthlyBreakdowns.find(b => b.month === m && Number(b.year) === Number(year))
      return {
        name: p.projectName,
        amt: b?.amt || 0,
        paid: b?.paid || 0,
      }
    })
    return { mi, rows }
  })

  const vis = visibleMonths()
  const visData = vis.map(mi => monthData[mi])
  const totalAmt     = visData.reduce((s, d) => s + d.rows.reduce((a, r) => a + r.amt, 0), 0)
  const totalPaid    = visData.reduce((s, d) => s + d.rows.reduce((a, r) => a + r.paid, 0), 0)
  const activeProjs  = new Set(visData.flatMap(d => d.rows.map(r => r.name))).size
  const activeMonths = visData.filter(d => d.rows.length > 0).length

  // Rows for the single-month detail table (only when a month is selected)
  const singleMonthRows = month !== null ? (monthData[month]?.rows || []) : []
  const singleMonthAmt  = singleMonthRows.reduce((s, r) => s + r.amt, 0)
  const singleMonthPaid = singleMonthRows.reduce((s, r) => s + r.paid, 0)

  const sectionLabel =
    month !== null ? `${MONTH_FULL[month]} only` :
    half === 'H1' ? 'H1 \u2014 Jan to Jun' :
    half === 'H2' ? 'H2 \u2014 Jul to Dec' :
    view !== 'all' ? `${view} \u2014 ${vis.map(i => MONTHS[i]).join(', ')}` :
    'Full year'

  if (loading) return (
    <div style={{ minHeight: '100vh', background: '#f7f7f8', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9ca3af', fontFamily: 'Inter, sans-serif' }}>
      Loading…
    </div>
  )

  if (error) return (
    <div style={{ minHeight: '100vh', background: '#f7f7f8', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#dc2626', fontFamily: 'Inter, sans-serif' }}>
      {error}
    </div>
  )

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
        *, *::before, *::after { box-sizing: border-box; }

        .pm-page { min-height: 100vh; background: #f7f7f8; padding: 32px; font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif; }

        .pm-header { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px; margin-bottom: 24px; }
        .pm-title { font-size: 22px; font-weight: 600; color: #18181b; letter-spacing: -0.3px; }

        .pm-controls { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
        .pm-select {
          font-family: inherit; font-size: 13px; padding: 8px 11px;
          border-radius: 9px; border: 1px solid #ececec; background: #ffffff;
          color: #18181b; cursor: pointer; outline: none; transition: border-color 0.15s, box-shadow 0.15s;
        }
        .pm-select:hover { border-color: #d1d5db; }
        .pm-select:focus { border-color: #18181b; box-shadow: 0 0 0 3px rgba(24,24,27,0.06); }
        .pm-select:disabled { opacity: 0.5; cursor: not-allowed; }
        .pm-select.month-select.active { border-color: #18181b; background: #f3f4f6; color: #18181b; font-weight: 500; }

        .half-tabs { display: flex; gap: 3px; background: #f3f4f6; border-radius: 9px; padding: 3px; border: 1px solid #ececec; }
        .half-tab {
          font-family: inherit; font-size: 12px; font-weight: 500;
          padding: 5px 13px; border-radius: 6px; border: none; cursor: pointer;
          background: transparent; color: #6b7280; transition: all 0.15s;
        }
        .half-tab.active { background: #ffffff; color: #18181b; box-shadow: 0 1px 2px rgba(16,24,40,0.06); }
        .half-tab:disabled { opacity: 0.5; cursor: not-allowed; }

        .summary-bar { display: grid; grid-template-columns: repeat(4, minmax(0,1fr)); gap: 12px; margin-bottom: 28px; }
        .sum-card { background: #ffffff; border: 1px solid #ececec; border-radius: 12px; padding: 16px 18px; box-shadow: 0 1px 2px rgba(16,24,40,0.03); }
        .sum-label { font-size: 11px; font-weight: 500; color: #9ca3af; letter-spacing: 0.2px; margin-bottom: 6px; }
        .sum-val { font-size: 20px; font-weight: 600; color: #18181b; letter-spacing: -0.4px; }
        .sum-val.muted { color: #6b7280; }

        .pm-section-label { font-size: 12px; font-weight: 600; color: #6b7280; margin-bottom: 12px; padding-left: 2px; }

        /* Generic table styling shared by both tables */
        .pm-projects-wrap {
          background: #ffffff; border: 1px solid #ececec; border-radius: 14px;
          overflow: hidden; box-shadow: 0 1px 3px rgba(16,24,40,0.04); margin-bottom: 28px;
        }
        .pm-projects-table { border-collapse: collapse; width: 100%; }
        .pm-projects-table th {
          background: #fafafa; color: #9ca3af; font-size: 11px; font-weight: 500;
          letter-spacing: 0.3px; text-align: left;
          padding: 12px 18px; border-bottom: 1px solid #f1f1f1; white-space: nowrap;
        }
        .pm-projects-table th.center { text-align: center; }
        .pm-projects-table th.right { text-align: right; }
        .pm-projects-table td {
          padding: 14px 18px; border-bottom: 1px solid #f4f4f5; font-size: 13.5px;
          color: #18181b; vertical-align: middle;
        }
        .pm-projects-table td.right { text-align: right; font-variant-numeric: tabular-nums; }
        .pm-projects-table tr:last-child td { border-bottom: none; }
        .pm-projects-table tbody tr:hover td { background: #fafafa; }
        .pj-name { font-weight: 500; color: #18181b; }
        .pj-date { font-size: 13px; color: #6b7280; white-space: nowrap; }

        .pm-total-row td {
          background: #fafafa; font-weight: 600; border-top: 1px solid #ececec;
          border-bottom: none; color: #18181b;
        }
        .pm-total-row td.right { color: #18181b; }

        .status-pill {
          display: inline-flex; align-items: center; gap: 6px; font-size: 12px;
          font-weight: 500; padding: 4px 11px; border-radius: 20px; white-space: nowrap;
        }
        .status-pill.active   { background: #f0fdf4; color: #16834a; border: 1px solid #bbf7d0; }
        .status-pill.inactive { background: #f9fafb; color: #6b7280; border: 1px solid #e5e7eb; }
        .status-dot { width: 6px; height: 6px; border-radius: 50%; }
        .status-pill.active   .status-dot { background: #22c55e; }
        .status-pill.inactive .status-dot { background: #9ca3af; }

        .amt-neg { color: #dc2626; }
        .amt-pos { color: #16834a; }

        @media (max-width: 700px) {
          .summary-bar { grid-template-columns: repeat(2, minmax(0,1fr)); }
          .pm-page { padding: 20px 16px; }
          .pm-projects-wrap { overflow-x: auto; }
        }
      `}</style>

      <div className="pm-page">
        {/* Header */}
        <div className="pm-header">
          <span className="pm-title">Project master</span>
          <div className="pm-controls">
            <select className="pm-select" value={year} onChange={e => setYear(Number(e.target.value))}>
              {years.map(y => <option key={y} value={y}>{y}</option>)}
            </select>

            {/* New single-month dropdown */}
            <select
              className={`pm-select month-select${month !== null ? ' active' : ''}`}
              value={month === null ? '' : month}
              onChange={e => {
                const v = e.target.value
                if (v === '') { setMonth(null) }
                else { setMonth(Number(v)); setView('all'); setHalf('all') }
              }}
            >
              <option value="">All months</option>
              {MONTHS.map((m, mi) => (
                <option key={m} value={mi}>{MONTH_FULL[mi]}</option>
              ))}
            </select>

            <select
              className="pm-select"
              value={view}
              onChange={e => { setView(e.target.value); setHalf('all'); setMonth(null) }}
              disabled={half !== 'all' || month !== null}
            >
              <option value="all">All quarters</option>
              <option value="Q1">Q1 — Jan Feb Mar</option>
              <option value="Q2">Q2 — Apr May Jun</option>
              <option value="Q3">Q3 — Jul Aug Sep</option>
              <option value="Q4">Q4 — Oct Nov Dec</option>
            </select>

            <div className="half-tabs">
              {['all','H1','H2'].map(h => (
                <button
                  key={h}
                  className={`half-tab${half === h ? ' active' : ''}`}
                  disabled={month !== null}
                  onClick={() => { setHalf(h); if (h !== 'all') { setView('all'); setMonth(null) } }}
                >
                  {h === 'all' ? 'All' : h}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Summary bar */}
        <div className="summary-bar">
          <div className="sum-card">
            <div className="sum-label">Period</div>
            <div className="sum-val muted" style={{ fontSize: 14 }}>{sectionLabel} · {year}</div>
          </div>
          <div className="sum-card">
            <div className="sum-label">Total amount</div>
            <div className="sum-val">{fmt(totalAmt)}</div>
          </div>
          <div className="sum-card">
            <div className="sum-label">Total Received</div>
            <div className="sum-val">{fmt(totalPaid)}</div>
          </div>
          <div className="sum-card">
            <div className="sum-label">Months / projects</div>
            <div className="sum-val">{activeMonths} / {activeProjs}</div>
          </div>
        </div>

        {/* Single-month project detail table (only when a month is selected) */}
        {month !== null && (
          <>
            <div className="pm-section-label">
              {MONTH_FULL[month]} {year} · Projects this month
            </div>
            <div className="pm-projects-wrap">
              <table className="pm-projects-table">
                <thead>
                  <tr>
                    <th>Project Name</th>
                    <th className="right">Amount</th>
                    <th className="right">Received</th>
                  </tr>
                </thead>
                <tbody>
                  {singleMonthRows.length === 0 && (
                    <tr><td colSpan={3} style={{ textAlign: 'center', color: '#c5c5c9' }}>No project data for {MONTH_FULL[month]} {year}</td></tr>
                  )}
                  {singleMonthRows.map((r, i) => (
                    <tr key={i}>
                      <td className="pj-name">{r.name}</td>
                      <td className="right amt-neg">{fmt(r.amt)}</td>
                      <td className="right amt-pos">{fmt(r.paid)}</td>
                    </tr>
                  ))}
                  {singleMonthRows.length > 0 && (
                    <tr className="pm-total-row">
                      <td>Total ({singleMonthRows.length})</td>
                      <td className="right">{fmt(singleMonthAmt)}</td>
                      <td className="right">{fmt(singleMonthPaid)}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* Project summary table */}
        <div className="pm-section-label">Projects · {projects.length}</div>
        <div className="pm-projects-wrap">
          <table className="pm-projects-table">
            <thead>
              <tr>
                <th>Project Name</th>
                <th>Start Date</th>
                <th>End Date</th>
                <th className="center">Status</th>
              </tr>
            </thead>
            <tbody>
              {projects.length === 0 && (
                <tr><td colSpan={4} style={{ textAlign: 'center', color: '#c5c5c9' }}>No projects</td></tr>
              )}
              {projects.map(p => {
                const active = isProjectActive(p)
                return (
                  <tr key={p._id}>
                    <td className="pj-name">{p.projectName}</td>
                    <td className="pj-date">{fmtDate(p.startDate)}</td>
                    <td className="pj-date">{p.endDate ? fmtDate(p.endDate) : 'Ongoing'}</td>
                    <td style={{ textAlign: 'center' }}>
                      <span className={`status-pill ${active ? 'active' : 'inactive'}`}>
                        <span className="status-dot" />
                        {active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}

export default Projectmaster
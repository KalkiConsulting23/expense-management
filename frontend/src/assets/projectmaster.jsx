import React, { useEffect, useState } from 'react'

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
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
  if (!d) return '—'
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

// A project is active if today falls within [startDate, endDate] inclusive.
// No endDate => still running (active if started). No startDate => assume active.
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

  const sectionLabel =
    half === 'H1' ? 'H1 — Jan to Jun' :
    half === 'H2' ? 'H2 — Jul to Dec' :
    view !== 'all' ? `${view} — ${vis.map(i => MONTHS[i]).join(', ')}` :
    'Full year'

  if (loading) return (
    <div style={{ minHeight: '100vh', background: '#f5f0e8', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9a8775', fontFamily: 'DM Sans, sans-serif' }}>
      Loading…
    </div>
  )

  if (error) return (
    <div style={{ minHeight: '100vh', background: '#f5f0e8', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#c0392b', fontFamily: 'DM Sans, sans-serif' }}>
      {error}
    </div>
  )

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Lora:wght@400;600&family=DM+Sans:wght@300;400;500&display=swap');
        *, *::before, *::after { box-sizing: border-box; }

        .pm-page { min-height: 100vh; background: #f5f0e8; padding: 48px 32px 32px; font-family: 'DM Sans', sans-serif; }

        .pm-header { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px; margin-bottom: 24px; }
        .pm-title { font-family: 'Lora', serif; font-size: 22px; font-weight: 600; color: #2e2318; }

        .pm-controls { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
        .pm-select {
          font-family: 'DM Sans', sans-serif; font-size: 12px; padding: 7px 10px;
          border-radius: 8px; border: 1.5px solid #e0d4c0; background: #fffdf8;
          color: #2e2318; cursor: pointer; outline: none;
        }
        .pm-select:hover { border-color: #c97844; }

        .half-tabs { display: flex; gap: 4px; background: #e8dece; border-radius: 8px; padding: 3px; }
        .half-tab {
          font-family: 'DM Sans', sans-serif; font-size: 11px; font-weight: 500;
          padding: 4px 12px; border-radius: 6px; border: none; cursor: pointer;
          background: transparent; color: #9a8775; transition: all 0.15s; letter-spacing: 0.5px;
        }
        .half-tab.active { background: #fffdf8; color: #c97844; border: 1px solid #d4b090; }

        .summary-bar { display: grid; grid-template-columns: repeat(4, minmax(0,1fr)); gap: 10px; margin-bottom: 24px; }
        .sum-card { background: #fffdf8; border: 1.5px solid #e0d4c0; border-radius: 10px; padding: 12px 14px; }
        .sum-label { font-size: 9px; font-weight: 500; color: #b08a5e; text-transform: uppercase; letter-spacing: 1.2px; margin-bottom: 4px; }
        .sum-val { font-size: 15px; font-weight: 500; color: #2e2318; }
        .sum-val.orange { color: #c97844; }

        .pm-section-label { font-size: 10px; font-weight: 500; color: #b08a5e; letter-spacing: 1.4px; text-transform: uppercase; margin-bottom: 12px; padding-left: 2px; }

        /* Project summary table */
        .pm-projects-wrap {
          background: #fffdf8; border: 1.5px solid #e8dece; border-radius: 12px;
          overflow: hidden; box-shadow: 0 2px 0 #e2d9c8;
        }
        .pm-projects-table { border-collapse: collapse; width: 100%; }
        .pm-projects-table th {
          background: #faf6ee; color: #b08a5e; font-size: 9px; font-weight: 500;
          letter-spacing: 1.2px; text-transform: uppercase; text-align: left;
          padding: 11px 16px; border-bottom: 1.5px solid #e8dece; white-space: nowrap;
        }
        .pm-projects-table th.center { text-align: center; }
        .pm-projects-table td {
          padding: 12px 16px; border-bottom: 1px solid #f0e8db; font-size: 13px;
          color: #2e2318; vertical-align: middle;
        }
        .pm-projects-table tr:last-child td { border-bottom: none; }
        .pm-projects-table tr:hover td { background: #fdf8f0; }
        .pj-name { font-weight: 500; color: #2e2318; }
        .pj-date { font-size: 12px; color: #9a8775; white-space: nowrap; }

        .status-pill {
          display: inline-flex; align-items: center; gap: 5px; font-size: 11px;
          font-weight: 500; padding: 3px 11px; border-radius: 20px; white-space: nowrap;
        }
        .status-pill.active   { background: #f5f8f0; color: #5e8a3a; border: 1.5px solid #c8deb0; }
        .status-pill.inactive { background: #faf3f0; color: #b5672f; border: 1.5px solid #e8c4ae; }
        .status-dot { width: 6px; height: 6px; border-radius: 50%; }
        .status-pill.active   .status-dot { background: #7a9e5a; }
        .status-pill.inactive .status-dot { background: #c97844; }

        @media (max-width: 700px) {
          .summary-bar { grid-template-columns: repeat(2, minmax(0,1fr)); }
          .pm-page { padding: 48px 16px 24px; }
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

            <select
              className="pm-select"
              value={view}
              onChange={e => { setView(e.target.value); setHalf('all') }}
              disabled={half !== 'all'}
            >
              <option value="all">All months</option>
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
                  onClick={() => { setHalf(h); if (h !== 'all') setView('all') }}
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
            <div className="sum-val" style={{ fontSize: 12 }}>{sectionLabel} · {year}</div>
          </div>
          <div className="sum-card">
            <div className="sum-label">Total amount</div>
            <div className="sum-val orange">{fmt(totalAmt)}</div>
          </div>
          <div className="sum-card">
            <div className="sum-label">Total paid</div>
            <div className="sum-val orange">{fmt(totalPaid)}</div>
          </div>
          <div className="sum-card">
            <div className="sum-label">Months / projects</div>
            <div className="sum-val">{activeMonths} / {activeProjs}</div>
          </div>
        </div>

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
                <tr><td colSpan={4} style={{ textAlign: 'center', color: '#c5b49e' }}>No projects</td></tr>
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
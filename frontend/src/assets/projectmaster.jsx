import React, { useEffect, useState, useRef } from 'react'

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const Q = { Q1:[0,1,2], Q2:[3,4,5], Q3:[6,7,8], Q4:[9,10,11] }
const H = { H1:[0,1,2,3,4,5], H2:[6,7,8,9,10,11], all:[0,1,2,3,4,5,6,7,8,9,10,11] }

const fmt = (n) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n || 0)

const Projectmaster = () => {
  const [projects, setProjects]   = useState([])
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState(null)
  const [years, setYears]         = useState([])
  const [year, setYear]           = useState(new Date().getFullYear())
  const [view, setView]           = useState('all')
  const [half, setHalf]           = useState('all')

  useEffect(() => {
    fetch('https://expense-management-11.onrender.com/api/project/all')
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

  const monthData = MONTHS.map((m, mi) => {
    const matched = projects.filter(p =>
      (p.monthlyBreakdowns || []).some(b => b.month === m && Number(b.year) === Number(year))
    )
    const rows = matched.map(p => {
      const b = p.monthlyBreakdowns.find(b => b.month === m && Number(b.year) === Number(year))
      return { name: p.projectName, amt: b?.amt || 0, paid: b?.paid || 0 }
    })
    return { mi, rows }
  })

  const vis = visibleMonths()
  const visData = vis.map(mi => monthData[mi])
  const totalAmt    = visData.reduce((s, d) => s + d.rows.reduce((a, r) => a + r.amt, 0), 0)
  const totalPaid   = visData.reduce((s, d) => s + d.rows.reduce((a, r) => a + r.paid, 0), 0)
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

        .months-grid { display: grid; grid-template-columns: repeat(3, minmax(0,1fr)); gap: 12px; }

        .month-card { background: #fffdf8; border: 1.5px solid #e8dece; border-radius: 12px; padding: 14px 16px; }
        .month-card.has-data { border-color: #d4b090; }
        .month-name { font-size: 10px; font-weight: 500; letter-spacing: 1.2px; text-transform: uppercase; color: #b08a5e; margin-bottom: 10px; }
        .month-card.has-data .month-name { color: #c97844; }

        .project-row { display: flex; align-items: center; justify-content: space-between; padding: 5px 0; border-bottom: 1px solid #f0e8db; }
        .proj-name { font-size: 12px; color: #2e2318; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 130px; }
        .proj-amt { font-size: 12px; font-weight: 500; color: #c97844; white-space: nowrap; margin-left: 8px; }
        .proj-paid { font-size: 10px; color: #9a8775; white-space: nowrap; }

        .month-total-row {
          display: flex; align-items: center; justify-content: space-between;
          margin-top: 8px; padding-top: 7px; border-top: 1.5px solid #e8dece;
        }
        .month-total-label {
          font-size: 9px; font-weight: 500; color: #b08a5e;
          text-transform: uppercase; letter-spacing: 1px;
        }
        .month-total-amt {
          font-size: 12px; font-weight: 600; color: #c97844;
          font-family: monospace; text-align: right;
        }
        .month-total-paid {
          font-size: 10px; color: #7a9e5a;
          font-family: monospace; text-align: right; margin-top: 1px;
        }

        .empty-msg { font-size: 11px; color: #c5b49e; text-align: center; padding: 10px 0; }

        @media (max-width: 700px) {
          .months-grid { grid-template-columns: repeat(2, minmax(0,1fr)); }
          .summary-bar { grid-template-columns: repeat(2, minmax(0,1fr)); }
          .pm-page { padding: 48px 16px 24px; }
        }
        @media (max-width: 480px) {
          .months-grid { grid-template-columns: 1fr; }
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

        {/* Month grid */}
        <div className="pm-section-label">{sectionLabel} · {year}</div>
        <div className="months-grid">
          {vis.map(mi => {
            const { rows } = monthData[mi]
            const hasData = rows.length > 0
            const monthTotalAmt  = rows.reduce((s, r) => s + r.amt, 0)
            const monthTotalPaid = rows.reduce((s, r) => s + r.paid, 0)
            const hasPaid = rows.some(r => r.paid > 0)

            return (
              <div key={mi} className={`month-card${hasData ? ' has-data' : ''}`}>
                <div className="month-name">{MONTHS[mi]}</div>

                {hasData ? (
                  <>
                    {rows.map((r, i) => (
                      <div key={i} className="project-row">
                        <span className="proj-name" title={r.name}>{r.name}</span>
                        <div style={{ textAlign: 'right' }}>
                          <div className="proj-amt">{fmt(r.amt)}</div>
                          {r.paid > 0 && <div className="proj-paid">Paid {fmt(r.paid)}</div>}
                        </div>
                      </div>
                    ))}

                    {/* ── Month total row ── */}
                    <div className="month-total-row">
                      <span className="month-total-label">Total</span>
                      <div>
                        <div className="month-total-amt">{fmt(monthTotalAmt)}</div>
                        {hasPaid && (
                          <div className="month-total-paid">Paid {fmt(monthTotalPaid)}</div>
                        )}
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="empty-msg">No entries</div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </>
  )
}

export default Projectmaster
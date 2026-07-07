import React, { useState, useEffect, useMemo } from 'react'

// Calendar months in order (January → December)
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

const MONTH_INDEX = {
  Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5,
  Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11,
}
const INDEX_MONTH = Object.keys(MONTH_INDEX)

const currentYear = () => new Date().getFullYear()

// Timezone-safe day-of-month extractor.
// A date picked as "1 Jan 2026" in IST can be stored by Mongo as
// "2025-12-31T18:30:00.000Z". Reading that back with new Date().getDate()
// (or naive string parsing) drifts by a day. We reconstruct the date the user
// actually picked by interpreting the stored UTC instant in IST (+5:30),
// then return that day-of-month.
const safeDayOfMonth = (dateVal) => {
  if (!dateVal) return 1
  const d = new Date(dateVal)
  if (isNaN(d)) return 1
  // Shift the UTC instant into IST (+5:30) and read the day there.
  // This maps 2025-12-31T18:30:00Z back to 1 Jan (IST local midnight).
  const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000
  const ist = new Date(d.getTime() + IST_OFFSET_MS)
  return ist.getUTCDate()
}

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:5000/api'

const fmt = (n, currency = 'INR') => {
  const symbol = currency === 'INR' ? '₹' : currency === 'USD' ? '$' : currency === 'EUR' ? '€' : ''
  return `${symbol}${Number(n || 0).toLocaleString('en-IN')}`
}

// Core timing shift: given the work month/year, the project's startDate
// day-of-month, and the daysCycle, return the { monthName, year } in which
// the income is actually received (payment lands daysCycle days after the
// work-period anchor date).
const shiftToIncomeMonth = (workMonthName, workYear, startDay, daysCycle) => {
  const workIdx = MONTH_INDEX[workMonthName]
  if (workIdx === undefined) return null
  // Anchor: the startDate day-of-month, placed in the work month.
  // Clamp the day to the number of days in that month to avoid overflow.
  const daysInWorkMonth = new Date(Number(workYear), workIdx + 1, 0).getDate()
  const day = Math.min(Math.max(1, startDay || 1), daysInWorkMonth)
  // Add daysCycle days to that anchor date.
  const received = new Date(Number(workYear), workIdx, day)
  received.setDate(received.getDate() + Number(daysCycle || 0))
  return {
    monthName: INDEX_MONTH[received.getMonth()],
    year: received.getFullYear(),
  }
}

const Incometracker = () => {
  const [projects, setProjects] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [year, setYear] = useState(currentYear())

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setLoading(true)
      setError(null)
      try {
        const res = await fetch(`${API_BASE}/project/all`)
        if (!res.ok) throw new Error(`Request failed (${res.status})`)
        const data = await res.json()
        if (!cancelled) setProjects(Array.isArray(data) ? data : [])
      } catch (err) {
        if (!cancelled) setError(err.message)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [])

  // Years to offer in the dropdown — based on the *shifted* income years,
  // so a Dec-work payment that lands in Jan appears under the right year.
  const availableYears = useMemo(() => {
    const set = new Set([currentYear()])
    projects.forEach(p => {
      const startDay = safeDayOfMonth(p.startDate)
      const cycle = Number(p.daysCycle ?? 30)
      ;(p.monthlyBreakdowns || []).forEach(b => {
        if (!b.month || !b.year) return
        const shifted = shiftToIncomeMonth(b.month, b.year, startDay, cycle)
        if (shifted) set.add(shifted.year)
      })
    })
    return Array.from(set).sort((a, b) => b - a)
  }, [projects])

  // Build rows: for each project, place each breakdown's PAID amount into its
  // SHIFTED income month, keeping only shifted dates that fall in the selected year.
  const rows = useMemo(() => {
    return projects.map(p => {
      const startDay = safeDayOfMonth(p.startDate)
      const cycle = Number(p.daysCycle ?? 30)
      const incomeByMonth = {}
      ;(p.monthlyBreakdowns || []).forEach(b => {
        if (!b.month || !b.year) return
        const paid = Number(b.paid || 0)
        if (paid === 0) return
        const shifted = shiftToIncomeMonth(b.month, b.year, startDay, cycle)
        if (!shifted) return
        if (shifted.year !== year) return
        incomeByMonth[shifted.monthName] = (incomeByMonth[shifted.monthName] || 0) + paid
      })
      const total = MONTHS.reduce((s, m) => s + (incomeByMonth[m] || 0), 0)
      return {
        id: p._id,
        name: p.projectName || 'Untitled',
        type: p.projectType || '—',
        cycle,
        currency: p.currency || 'INR',
        incomeByMonth,
        total,
      }
    })
  }, [projects, year])

  const monthTotals = useMemo(() => {
    const totals = {}
    MONTHS.forEach(m => {
      totals[m] = rows.reduce((s, r) => s + (r.incomeByMonth[m] || 0), 0)
    })
    const grand = rows.reduce((s, r) => s + r.total, 0)
    return { totals, grand }
  }, [rows])

  const currency = rows[0]?.currency || 'INR'

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
        .it-wrap {
          font-family: 'Inter', -apple-system, sans-serif;
          max-width: 1200px; margin: 0 auto; padding: 24px 20px 60px;
          color: #18181b;
        }
        .it-head {
          display: flex; align-items: center; justify-content: space-between;
          gap: 16px; flex-wrap: wrap; margin-bottom: 20px;
        }
        .it-title { font-size: 22px; font-weight: 700; letter-spacing: -0.4px; }
        .it-sub { font-size: 13px; color: #6b7280; margin-top: 2px; }
        .it-fy { display: flex; align-items: center; gap: 8px; }
        .it-fy label { font-size: 12px; font-weight: 500; color: #6b7280; }
        .it-fy select {
          font-family: inherit; font-size: 13px; font-weight: 500;
          padding: 8px 12px; border-radius: 8px; border: 1px solid #e5e7eb;
          background: #fff; color: #18181b; cursor: pointer;
        }
        .it-card {
          background: #fff; border: 1px solid #ececec; border-radius: 12px;
          overflow: hidden; box-shadow: 0 1px 3px rgba(16,24,40,0.04);
        }
        .it-scroll { overflow-x: auto; }
        table.it-table { border-collapse: collapse; width: 100%; font-size: 13px; }
        .it-table th, .it-table td {
          padding: 10px 12px; text-align: right; white-space: nowrap;
          border-bottom: 1px solid #f1f1f1;
        }
        .it-table th {
          background: #fafafa; font-weight: 600; color: #6b7280;
          font-size: 11.5px; letter-spacing: 0.2px; position: sticky; top: 0;
        }
        .it-table th.left, .it-table td.left { text-align: left; }
        .it-table td.name { font-weight: 600; color: #18181b; }
        .it-table td.type { color: #9ca3af; font-size: 12px; }
        .it-table td.total, .it-table th.total {
          font-weight: 700; color: #18181b; background: #fbfbfb;
        }
        .it-table td.zero { color: #d1d5db; }
        .it-cycle-tag {
          display: inline-block; margin-left: 6px; font-size: 10.5px;
          font-weight: 600; color: #6b7280; background: #f3f4f6;
          padding: 1px 6px; border-radius: 999px; vertical-align: middle;
        }
        .it-foot td {
          font-weight: 700; background: #f7f7f8; color: #18181b;
          border-top: 2px solid #ececec;
        }
        .it-state { padding: 48px 20px; text-align: center; color: #6b7280; font-size: 14px; }
        .it-err { color: #b91c1c; }
        .it-spin {
          width: 22px; height: 22px; border: 2.5px solid #ececec;
          border-top-color: #18181b; border-radius: 50%;
          animation: itspin 0.7s linear infinite; margin: 0 auto 12px;
        }
        @keyframes itspin { to { transform: rotate(360deg); } }
      `}</style>

      <div className="it-wrap">
        <div className="it-head">
          <div>
            <div className="it-title">Income Tracker</div>
            <div className="it-sub">Income received per project, shifted by each project's billing cycle</div>
          </div>
          <div className="it-fy">
            <label htmlFor="year">Year</label>
            <select
              id="year"
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
            >
              {availableYears.map(y => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="it-card">
          {loading ? (
            <div className="it-state">
              <div className="it-spin" />
              Loading projects…
            </div>
          ) : error ? (
            <div className="it-state it-err">Failed to load: {error}</div>
          ) : rows.length === 0 ? (
            <div className="it-state">No projects found.</div>
          ) : (
            <div className="it-scroll">
              <table className="it-table">
                <thead>
                  <tr>
                    <th className="left">Project</th>
                    {MONTHS.map(m => <th key={m}>{m}</th>)}
                    <th className="total">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(r => (
                    <tr key={r.id}>
                      <td className="left name">
                        {r.name}
                        <span className="it-cycle-tag">{r.cycle}d cycle</span>
                        <div className="type">{r.type}</div>
                      </td>
                      {MONTHS.map(m => {
                        const v = r.incomeByMonth[m] || 0
                        return (
                          <td key={m} className={v === 0 ? 'zero' : ''}>
                            {v === 0 ? '—' : fmt(v, r.currency)}
                          </td>
                        )
                      })}
                      <td className="total">{fmt(r.total, r.currency)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="it-foot">
                    <td className="left">Total</td>
                    {MONTHS.map(m => (
                      <td key={m}>
                        {monthTotals.totals[m] === 0 ? '—' : fmt(monthTotals.totals[m], currency)}
                      </td>
                    ))}
                    <td className="total">{fmt(monthTotals.grand, currency)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      </div>
    </>
  )
}

export default Incometracker
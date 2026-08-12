import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@clerk/clerk-react'

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:5000/api'

const MONTH_FULL = ['January','February','March','April','May','June','July','August','September','October','November','December']
const WEEKDAY = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']

// status → display
const STATUS_META = {
  1:   { label: 'P', color: '#16a34a', bg: '#f0fdf4', border: '#bbf7d0', name: 'Present' },
  0.5: { label: 'H', color: '#d97706', bg: '#fffbeb', border: '#fde68a', name: 'Half day' },
  0:   { label: 'A', color: '#dc2626', bg: '#fef2f2', border: '#fecaca', name: 'Absent' },
}

const daysInMonth = (year, month) => new Date(year, month + 1, 0).getDate()
const isWeekend = (year, month, day) => {
  const wd = new Date(year, month, day).getDay()
  return wd === 0 || wd === 6 // Sun or Sat
}

// Click cycle: undefined → 1 → 0.5 → 0 → undefined
const nextStatus = (cur) => {
  if (cur === undefined || cur === null) return 1
  if (cur === 1) return 0.5
  if (cur === 0.5) return 0
  return null // clears
}

const Attendance = () => {
  const navigate = useNavigate()
  const { getToken } = useAuth()
  const today = new Date()

  const [staff, setStaff] = useState([])
  const [attendance, setAttendance] = useState([]) // raw docs for the month
  const [holidays, setHolidays] = useState([])      // holiday docs for the month
  const [year, setYear] = useState(today.getFullYear())
  const [month, setMonth] = useState(today.getMonth())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [savingKey, setSavingKey] = useState(null) // `${staffId}-${day}`
  const [toast, setToast] = useState(null)

  const showToast = (type, msg) => {
    setToast({ type, msg })
    setTimeout(() => setToast(null), 2600)
  }

  const dim = daysInMonth(year, month)
  const dayList = useMemo(() => Array.from({ length: dim }, (_, i) => i + 1), [dim])

  // Fast lookup: staffId → { day → status }
  const attMap = useMemo(() => {
    const map = {}
    attendance.forEach(rec => {
      const days = {}
      const src = rec.days || {}
      Object.keys(src).forEach(k => { days[k] = src[k] })
      map[rec.staffId] = days
    })
    return map
  }, [attendance])

  const holidaySet = useMemo(() => {
    const s = new Set()
    holidays.forEach(h => s.add(h.day))
    return s
  }, [holidays])

  const fetchStaff = useCallback(async () => {
    const token = await getToken()
    const res = await fetch(`${API_BASE}/staff/all`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })
    if (!res.ok) throw new Error(`Failed to fetch staff (${res.status})`)
    const data = await res.json()
    if (Array.isArray(data)) return data
    if (Array.isArray(data.staff)) return data.staff
    if (Array.isArray(data.data)) return data.data
    return []
  }, [getToken])

  const fetchMonth = useCallback(async (y, m) => {
    const token = await getToken()
    const res = await fetch(`${API_BASE}/attendance/month?year=${y}&month=${m}`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })
    if (!res.ok) throw new Error(`Failed to fetch attendance (${res.status})`)
    return res.json()
  }, [getToken])

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setLoading(true)
      setError('')
      try {
        const [staffData, monthData] = await Promise.all([fetchStaff(), fetchMonth(year, month)])
        if (cancelled) return
        setStaff(staffData)
        setAttendance(monthData.attendance || [])
        setHolidays(monthData.holidays || [])
      } catch (err) {
        if (!cancelled) setError(err.message)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [year, month, fetchStaff, fetchMonth])

  // ── Mark a single cell ──
  const handleCellClick = async (staffId, day) => {
    if (isWeekend(year, month, day) || holidaySet.has(day)) return
    const cur = attMap[staffId]?.[String(day)]
    const next = nextStatus(cur)
    const key = `${staffId}-${day}`
    setSavingKey(key)

    // optimistic update
    const prev = attendance
    setAttendance(recs => {
      const idx = recs.findIndex(r => r.staffId === staffId)
      if (idx > -1) {
        const copy = [...recs]
        const days = { ...(copy[idx].days || {}) }
        if (next === null) delete days[String(day)]
        else days[String(day)] = next
        copy[idx] = { ...copy[idx], days }
        return copy
      }
      return [...recs, { staffId, year, month, days: next === null ? {} : { [String(day)]: next } }]
    })

    try {
      const token = await getToken()
      const res = await fetch(`${API_BASE}/attendance/mark`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ staffId, year, month, day, status: next }),
      })
      if (!res.ok) throw new Error('Failed to save')
      const saved = await res.json()
      setAttendance(recs => {
        const idx = recs.findIndex(r => r.staffId === staffId)
        if (idx > -1) { const copy = [...recs]; copy[idx] = saved; return copy }
        return [...recs, saved]
      })
    } catch (err) {
      setAttendance(prev)
      showToast('error', err.message || 'Something went wrong')
    } finally {
      setSavingKey(null)
    }
  }

  // ── Toggle a company-wide holiday for a day ──
  const handleToggleHoliday = async (day) => {
    if (isWeekend(year, month, day)) return
    const isHol = holidaySet.has(day)
    const prev = holidays
    // optimistic update
    if (isHol) setHolidays(hs => hs.filter(h => h.day !== day))
    else setHolidays(hs => [...hs, { year, month, day, label: 'Holiday' }])

    try {
      const token = await getToken()
      const res = await fetch(`${API_BASE}/attendance/holiday`, {
        method: isHol ? 'DELETE' : 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ year, month, day }),
      })
      if (!res.ok) throw new Error('Failed to update holiday')
      const data = await res.json()
      if (!isHol && data?._id) {
        setHolidays(hs => hs.map(h => (h.day === day && !h._id ? data : h)))
      }
      showToast('success', isHol ? `Removed holiday on ${day}` : `Marked ${day} as holiday for all`)
    } catch (err) {
      setHolidays(prev)
      showToast('error', err.message || 'Something went wrong')
    }
  }

  // ── Payable days per staff: present(1) + half(0.5), holidays excluded ──
  const payableFor = (staffId) => {
    const days = attMap[staffId] || {}
    let sum = 0
    Object.keys(days).forEach(dStr => {
      const d = Number(dStr)
      if (isWeekend(year, month, d) || holidaySet.has(d)) return
      const v = days[dStr]
      if (v === 1) sum += 1
      else if (v === 0.5) sum += 0.5
    })
    return sum
  }

  const goPrev = () => { if (month === 0) { setMonth(11); setYear(y => y - 1) } else setMonth(m => m - 1) }
  const goNext = () => { if (month === 11) { setMonth(0); setYear(y => y + 1) } else setMonth(m => m + 1) }

  return (
    <div className="att-page">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
        * { box-sizing: border-box; }
        .att-page {
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
          padding: 28px 22px 60px; background: #f7f7f8; min-height: 100vh;
        }
        .att-head {
          display: flex; align-items: flex-end; justify-content: space-between;
          gap: 16px; margin-bottom: 20px; flex-wrap: wrap;
        }
        .att-eyebrow { font-size: 11px; font-weight: 500; letter-spacing: 0.4px; text-transform: uppercase; color: #9ca3af; margin-bottom: 5px; }
        .att-title { font-size: 26px; font-weight: 600; color: #18181b; margin: 0 0 4px; letter-spacing: -0.4px; }
        .att-sub { font-size: 13px; color: #6b7280; margin: 0; }

        .att-nav { display: inline-flex; align-items: center; gap: 8px; }
        .att-nav-btn {
          width: 34px; height: 34px; border-radius: 9px; border: 1px solid #ececec;
          background: #fff; color: #374151; font-size: 15px; cursor: pointer;
          display: inline-flex; align-items: center; justify-content: center; transition: all 0.15s;
        }
        .att-nav-btn:hover { background: #f4f4f5; }
        .att-month-label {
          font-size: 14px; font-weight: 600; color: #18181b; min-width: 150px; text-align: center;
        }

        .att-legend { display: flex; gap: 12px; flex-wrap: wrap; margin-bottom: 14px; font-size: 12px; color: #6b7280; }
        .att-legend span { display: inline-flex; align-items: center; gap: 5px; }
        .att-chip { width: 18px; height: 18px; border-radius: 5px; display: inline-flex; align-items: center; justify-content: center; font-size: 10px; font-weight: 700; }

        .att-card {
          border-radius: 16px; border: 1px solid #ececec; overflow: hidden;
          box-shadow: 0 1px 3px rgba(16,24,40,0.04); background: #fff;
        }
        .att-scroll { overflow-x: auto; }
        .att-scroll::-webkit-scrollbar { height: 7px; }
        .att-scroll::-webkit-scrollbar-thumb { background: #d1d5db; border-radius: 3px; }
        table.att-grid { border-collapse: collapse; white-space: nowrap; }
        .att-grid th, .att-grid td { border-right: 1px solid #f4f4f5; }

        .name-cell {
          position: sticky; left: 0; z-index: 2; background: #fff;
          min-width: 170px; max-width: 200px; border-right: 1px solid #ececec;
          padding: 10px 14px; text-align: left; vertical-align: middle;
        }
        .name-cell.head { background: #fafafa; z-index: 4; }
        .name-main { font-size: 13px; font-weight: 600; color: #18181b; }
        .name-meta { font-size: 10.5px; color: #9ca3af; margin-top: 2px; }

        .day-head {
          background: #fafafa; text-align: center; min-width: 40px;
          padding: 6px 4px; border-bottom: 1px solid #ececec;
        }
        .day-head.weekend { background: #f3f4f6; }
        .day-head.holiday { background: #eef2ff; }
        .day-num { font-size: 12px; font-weight: 700; color: #18181b; }
        .day-wd  { font-size: 9px; color: #9ca3af; text-transform: uppercase; }
        .hol-btn {
          margin-top: 3px; font-size: 8.5px; border: none; background: transparent;
          color: #9ca3af; cursor: pointer; padding: 1px 3px; border-radius: 4px;
        }
        .hol-btn:hover { background: #e0e7ff; color: #4338ca; }
        .hol-btn.on { color: #4338ca; font-weight: 700; }

        .att-cell {
          text-align: center; padding: 5px; min-width: 40px; border-bottom: 1px solid #f4f4f5;
          cursor: pointer; font-size: 11px; font-weight: 700;
        }
        .att-cell.weekend { background: #f3f4f6; cursor: default; color: #c5c5c9; }
        .att-cell.holiday { background: #eef2ff; cursor: default; color: #a5b4fc; }
        .att-cell .box {
          width: 26px; height: 26px; border-radius: 7px; display: inline-flex;
          align-items: center; justify-content: center; border: 1px solid transparent;
        }
        .att-cell.saving { opacity: 0.4; }
        .total-cell {
          position: sticky; right: 0; z-index: 2; background: #fafafa;
          min-width: 70px; text-align: center; font-weight: 700; font-size: 13px;
          color: #4338ca; border-left: 1px solid #ececec; padding: 8px 10px;
        }
        .total-cell.head { z-index: 4; font-size: 10.5px; color: #9ca3af; font-weight: 500; letter-spacing: 0.3px; }

        .state, .empty {
          text-align: center; padding: 48px 20px; color: #9ca3af; font-size: 14px;
          background: #fff; border: 1px solid #ececec; border-radius: 14px;
        }
        .err { color: #dc2626; }

        .att-toast {
          position: fixed; bottom: 28px; right: 28px; padding: 12px 18px; border-radius: 12px;
          font-size: 13px; font-weight: 500; z-index: 9999; background: #fff;
          box-shadow: 0 8px 28px rgba(16,24,40,0.16); display: flex; align-items: center; gap: 8px;
        }
        .att-toast.success { color: #16a34a; border: 1px solid #bbf7d0; }
        .att-toast.error { color: #dc2626; border: 1px solid #fecaca; }
      `}</style>

      <div className="att-head">
        <div>
          <div className="att-eyebrow">Attendance</div>
          <h2 className="att-title">Staff Attendance</h2>
          <p className="att-sub">
            Click a cell to cycle <b style={{ color: '#16a34a' }}>Present</b> → <b style={{ color: '#d97706' }}>Half</b> → <b style={{ color: '#dc2626' }}>Absent</b> → clear · weekends are holidays
          </p>
        </div>
        <div className="att-nav">
          <button className="att-nav-btn" onClick={goPrev}>‹</button>
          <div className="att-month-label">{MONTH_FULL[month]} {year}</div>
          <button className="att-nav-btn" onClick={goNext}>›</button>
        </div>
      </div>

      <div className="att-legend">
        <span><span className="att-chip" style={{ background: '#f0fdf4', color: '#16a34a', border: '1px solid #bbf7d0' }}>P</span> Present (1)</span>
        <span><span className="att-chip" style={{ background: '#fffbeb', color: '#d97706', border: '1px solid #fde68a' }}>H</span> Half (0.5)</span>
        <span><span className="att-chip" style={{ background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca' }}>A</span> Absent (0)</span>
        <span><span className="att-chip" style={{ background: '#f3f4f6', color: '#9ca3af' }}>—</span> Weekend</span>
        <span><span className="att-chip" style={{ background: '#eef2ff', color: '#4338ca' }}>★</span> Holiday (click day header)</span>
      </div>

      {loading ? (
        <div className="state">Loading…</div>
      ) : error ? (
        <div className="state err">{error}</div>
      ) : staff.length === 0 ? (
        <div className="empty">No staff added yet. Add staff before marking attendance.</div>
      ) : (
        <div className="att-card">
          <div className="att-scroll">
            <table className="att-grid">
              <thead>
                <tr>
                  <th className="name-cell head">Staff</th>
                  {dayList.map(day => {
                    const wknd = isWeekend(year, month, day)
                    const hol = holidaySet.has(day)
                    const wd = new Date(year, month, day).getDay()
                    return (
                      <th key={day} className={`day-head${wknd ? ' weekend' : ''}${hol ? ' holiday' : ''}`}>
                        <div className="day-num">{day}</div>
                        <div className="day-wd">{WEEKDAY[wd]}</div>
                        {!wknd && (
                          <button
                            className={`hol-btn${hol ? ' on' : ''}`}
                            onClick={() => handleToggleHoliday(day)}
                            title={hol ? 'Remove holiday for all' : 'Mark holiday for all'}
                          >
                            {hol ? '★ Hol' : '＋ Hol'}
                          </button>
                        )}
                      </th>
                    )
                  })}
                  <th className="total-cell head">Payable</th>
                </tr>
              </thead>
              <tbody>
                {staff.map(s => {
                  const days = attMap[s._id] || {}
                  return (
                    <tr key={s._id}>
                      <td className="name-cell">
                        <div className="name-main">{s.firstName} {s.lastName}</div>
                        <div className="name-meta">{s.employeeId}{s.designation ? ` · ${s.designation}` : ''}</div>
                      </td>
                      {dayList.map(day => {
                        const wknd = isWeekend(year, month, day)
                        const hol = holidaySet.has(day)
                        const key = `${s._id}-${day}`
                        if (wknd) return <td key={day} className="att-cell weekend">—</td>
                        if (hol)  return <td key={day} className="att-cell holiday">★</td>
                        const status = days[String(day)]
                        const meta = status !== undefined ? STATUS_META[status] : null
                        return (
                          <td
                            key={day}
                            className={`att-cell${savingKey === key ? ' saving' : ''}`}
                            onClick={() => handleCellClick(s._id, day)}
                            title={meta ? meta.name : 'Not marked — click to set Present'}
                          >
                            <span
                              className="box"
                              style={meta ? { background: meta.bg, color: meta.color, borderColor: meta.border } : { background: '#fff', color: '#d1d5db', borderColor: '#ececec' }}
                            >
                              {meta ? meta.label : ''}
                            </span>
                          </td>
                        )
                      })}
                      <td className="total-cell">{payableFor(s._id)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {toast && (
        <div className={`att-toast ${toast.type}`}>
          <span>{toast.type === 'success' ? '✓' : '!'}</span>
          {toast.msg}
        </div>
      )}
    </div>
  )
}

export default Attendance
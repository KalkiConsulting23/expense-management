import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@clerk/clerk-react'

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:5000/api'

const MONTH_FULL = ['January','February','March','April','May','June','July','August','September','October','November','December']
const WEEKDAY = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']

// status → display (statuses are saved as words, no numbers)
// This order is used for the dropdown and for the total columns on the right.
const STATUS_ORDER = ['present', 'absent', 'wfh', 'leave', 'halfday']
const STATUS_META = {
  present: { label: 'P', color: '#16a34a', bg: '#f0fdf4', border: '#bbf7d0', name: 'Present' },
  absent:  { label: 'A', color: '#dc2626', bg: '#fef2f2', border: '#fecaca', name: 'Absent' },
  wfh:     { label: 'W', color: '#0284c7', bg: '#f0f9ff', border: '#bae6fd', name: 'WFH' },
  leave:   { label: 'L', color: '#7c3aed', bg: '#f5f3ff', border: '#ddd6fe', name: 'Leave' },
  halfday: { label: 'H', color: '#d97706', bg: '#fffbeb', border: '#fde68a', name: 'Half Day' },
}

// Width of each total column on the right (they stay fixed while the dates scroll)
const TOTAL_COL_WIDTH = 58

// Older records may still hold numbers — read them as words
const LEGACY_STATUS = { 1: 'present', 2: 'wfh', 0.5: 'halfday', 0: 'absent', 3: 'leave' }
const normalizeStatus = (v) => {
  if (v === null || v === undefined || v === '') return undefined
  if (typeof v === 'number') return LEGACY_STATUS[v]
  const word = String(v).trim().toLowerCase()
  if (STATUS_META[word]) return word
  const n = Number(word)
  return Number.isNaN(n) ? undefined : LEGACY_STATUS[n]
}

const daysInMonth = (year, month) => new Date(year, month + 1, 0).getDate()
const isWeekend = (year, month, day) => {
  const wd = new Date(year, month, day).getDay()
  return wd === 0 || wd === 6 // Sun or Sat
}

const MENU_WIDTH = 168
const MENU_HEIGHT = 236

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
  const [menu, setMenu] = useState(null) // { staffId, day, top, left } — the open status dropdown
  const menuRef = useRef(null)

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
      Object.keys(src).forEach(k => {
        const status = normalizeStatus(src[k])
        if (status) days[k] = status
      })
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
      setMenu(null)
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

  // ── Close the dropdown on outside click, Escape, scroll or resize ──
  useEffect(() => {
    if (!menu) return
    const onMouseDown = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenu(null)
    }
    const onKey = (e) => { if (e.key === 'Escape') setMenu(null) }
    const close = () => setMenu(null)
    document.addEventListener('mousedown', onMouseDown)
    document.addEventListener('keydown', onKey)
    window.addEventListener('scroll', close, true)
    window.addEventListener('resize', close)
    return () => {
      document.removeEventListener('mousedown', onMouseDown)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('scroll', close, true)
      window.removeEventListener('resize', close)
    }
  }, [menu])

  // ── Open the status dropdown under the clicked cell ──
  const openMenu = (e, staffId, day) => {
    if (isWeekend(year, month, day) || holidaySet.has(day)) return
    const rect = e.currentTarget.getBoundingClientRect()
    const left = Math.min(
      Math.max(8, rect.left + rect.width / 2 - MENU_WIDTH / 2),
      window.innerWidth - MENU_WIDTH - 8
    )
    const fitsBelow = rect.bottom + 6 + MENU_HEIGHT < window.innerHeight
    const top = fitsBelow ? rect.bottom + 6 : Math.max(8, rect.top - 6 - MENU_HEIGHT)
    setMenu({ staffId, day, top, left })
  }

  // ── Save one day's status (status = null clears the day) ──
  const setDayStatus = async (staffId, day, next) => {
    setMenu(null)
    const cur = attMap[staffId]?.[String(day)]
    if ((cur || null) === next) return
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

  // ── Per-staff count of each status this month (weekends & holidays excluded) ──
  const countsFor = (staffId) => {
    const counts = { present: 0, absent: 0, wfh: 0, leave: 0, halfday: 0 }
    const days = attMap[staffId] || {}
    Object.keys(days).forEach(dStr => {
      const d = Number(dStr)
      if (isWeekend(year, month, d) || holidaySet.has(d)) return
      if (counts[days[dStr]] !== undefined) counts[days[dStr]] += 1
    })
    return counts
  }

  // Sticky position of each total column from the right edge
  const totalColStyle = (idx) => ({
    right: (STATUS_ORDER.length - 1 - idx) * TOTAL_COL_WIDTH,
    width: TOTAL_COL_WIDTH,
    minWidth: TOTAL_COL_WIDTH,
    maxWidth: TOTAL_COL_WIDTH,
  })

  const goPrev = () => { if (month === 0) { setMonth(11); setYear(y => y - 1) } else setMonth(m => m - 1) }
  const goNext = () => { if (month === 11) { setMonth(0); setYear(y => y + 1) } else setMonth(m => m + 1) }

  const menuCurrent = menu ? attMap[menu.staffId]?.[String(menu.day)] : undefined
  const menuStaff = menu ? staff.find(s => s._id === menu.staffId) : null

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

        .att-chip { width: 20px; height: 20px; border-radius: 6px; display: inline-flex; align-items: center; justify-content: center; font-size: 10.5px; font-weight: 700; border: 1px solid transparent; flex-shrink: 0; }

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
          min-width: 160px; max-width: 190px; border-right: 1px solid #ececec;
          padding: 8px 12px; text-align: left; vertical-align: middle;
        }
        .name-cell.head { background: #fafafa; z-index: 4; font-size: 12px; }
        .name-main { font-size: 13px; font-weight: 600; color: #18181b; overflow: hidden; text-overflow: ellipsis; }
        .name-meta { font-size: 10.5px; color: #9ca3af; margin-top: 2px; overflow: hidden; text-overflow: ellipsis; }

        /* Compact date columns so the five totals fit on screen */
        .day-head {
          background: #fafafa; text-align: center; min-width: 32px; width: 32px;
          padding: 5px 2px; border-bottom: 1px solid #ececec;
        }
        .day-head.weekend { background: #f3f4f6; }
        .day-head.holiday { background: #eef2ff; }
        .day-num { font-size: 11.5px; font-weight: 700; color: #18181b; }
        .day-wd  { font-size: 8.5px; color: #9ca3af; text-transform: uppercase; }
        .hol-btn {
          margin-top: 2px; font-size: 8px; border: none; background: transparent;
          color: #9ca3af; cursor: pointer; padding: 1px 2px; border-radius: 4px; line-height: 1.2;
        }
        .hol-btn:hover { background: #e0e7ff; color: #4338ca; }
        .hol-btn.on { color: #4338ca; font-weight: 700; }

        .att-cell {
          text-align: center; padding: 4px 3px; min-width: 32px; width: 32px; border-bottom: 1px solid #f4f4f5;
          font-size: 10.5px; font-weight: 700;
        }
        .att-cell.weekend { background: #f3f4f6; color: #c5c5c9; }
        .att-cell.holiday { background: #eef2ff; color: #a5b4fc; }
        .att-cell .box {
          width: 24px; height: 24px; border-radius: 7px; display: inline-flex;
          align-items: center; justify-content: center; border: 1px solid transparent;
          font: inherit; font-weight: 700; cursor: pointer; padding: 0; transition: box-shadow 0.12s;
        }
        .att-cell .box:hover { box-shadow: 0 0 0 2px #e0e7ff; }
        .att-cell .box:focus { outline: none; }
        .att-cell .box.open, .att-cell .box:focus-visible { box-shadow: 0 0 0 2px #6366f1; }
        .att-cell.saving { opacity: 0.4; }

        /* Five total columns, fixed on the right */
        .total-cell {
          position: sticky; z-index: 2; background: #fafafa;
          text-align: center; font-weight: 700; font-size: 13px;
          padding: 8px 4px; border-right: none !important;
        }
        .total-cell.first { border-left: 1px solid #e4e4e7; box-shadow: -6px 0 8px -6px rgba(16,24,40,0.12); }
        .total-cell.head { z-index: 4; padding: 6px 4px; }
        .total-head-inner { display: flex; flex-direction: column; align-items: center; gap: 3px; }
        .total-head-name { font-size: 9.5px; font-weight: 600; color: #6b7280; text-transform: uppercase; letter-spacing: 0.2px; }
        .total-zero { color: #d4d4d8; font-weight: 600; }

        .state, .empty {
          text-align: center; padding: 48px 20px; color: #9ca3af; font-size: 14px;
          background: #fff; border: 1px solid #ececec; border-radius: 14px;
        }
        .err { color: #dc2626; }

        /* Status dropdown */
        .att-menu {
          position: fixed; z-index: 10000; width: ${MENU_WIDTH}px; background: #fff;
          border: 1px solid #e4e4e7; border-radius: 12px; padding: 6px;
          box-shadow: 0 12px 32px rgba(16,24,40,0.18);
        }
        .att-menu-title { font-size: 10.5px; color: #9ca3af; padding: 4px 8px 6px; border-bottom: 1px solid #f4f4f5; margin-bottom: 4px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .att-menu-item {
          width: 100%; display: flex; align-items: center; gap: 9px; padding: 7px 8px;
          border: none; background: transparent; border-radius: 8px; cursor: pointer;
          font: inherit; font-size: 13px; color: #27272a; text-align: left;
        }
        .att-menu-item:hover, .att-menu-item:focus-visible { background: #f4f4f5; outline: none; }
        .att-menu-item.active { background: #eef2ff; font-weight: 600; }
        .att-menu-check { margin-left: auto; color: #4338ca; font-size: 12px; }
        .att-menu-clear { color: #6b7280; border-top: 1px solid #f4f4f5; margin-top: 4px; padding-top: 8px; border-radius: 0 0 8px 8px; }

        .att-toast {
          position: fixed; bottom: 28px; right: 28px; padding: 12px 18px; border-radius: 12px;
          font-size: 13px; font-weight: 500; z-index: 9999; background: #fff;
          box-shadow: 0 8px 28px rgba(16,24,40,0.16); display: flex; align-items: center; gap: 8px;
        }
        .att-toast.success { color: #16a34a; border: 1px solid #bbf7d0; }
        .att-toast.error { color: #dc2626; border: 1px solid #fecaca; }

        @media (max-width: 720px) {
          .att-nav { width: 100%; justify-content: space-between; }
        }
      `}</style>

      <div className="att-head">
        <div>
          <div className="att-eyebrow">Attendance</div>
          <h2 className="att-title">Staff Attendance</h2>
          <p className="att-sub">
            Click a day to choose Present, Absent, WFH, Leave or Half Day · <b>—</b> weekend · <b style={{ color: '#4338ca' }}>★</b> holiday (click "+ Hol" on a date)
          </p>
        </div>

        <div className="att-nav">
          <button className="att-nav-btn" onClick={goPrev} aria-label="Previous month">‹</button>
          <div className="att-month-label">{MONTH_FULL[month]} {year}</div>
          <button className="att-nav-btn" onClick={goNext} aria-label="Next month">›</button>
        </div>
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
                            {hol ? '★ Hol' : '+ Hol'}
                          </button>
                        )}
                      </th>
                    )
                  })}
                  {STATUS_ORDER.map((key, idx) => {
                    const meta = STATUS_META[key]
                    return (
                      <th
                        key={key}
                        className={`total-cell head${idx === 0 ? ' first' : ''}`}
                        style={totalColStyle(idx)}
                      >
                        <div className="total-head-inner">
                          <span className="att-chip" style={{ background: meta.bg, color: meta.color, borderColor: meta.border }}>{meta.label}</span>
                          <span className="total-head-name">{meta.name}</span>
                        </div>
                      </th>
                    )
                  })}
                </tr>
              </thead>
              <tbody>
                {staff.map(s => {
                  const days = attMap[s._id] || {}
                  const counts = countsFor(s._id)
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
                        const meta = status ? STATUS_META[status] : null
                        const isOpen = menu && menu.staffId === s._id && menu.day === day
                        return (
                          <td key={day} className={`att-cell${savingKey === key ? ' saving' : ''}`}>
                            <button
                              type="button"
                              className={`box${isOpen ? ' open' : ''}`}
                              onClick={(e) => (isOpen ? setMenu(null) : openMenu(e, s._id, day))}
                              title={meta ? `${meta.name} — click to change` : 'Not marked — click to choose'}
                              aria-haspopup="menu"
                              aria-expanded={Boolean(isOpen)}
                              style={meta ? { background: meta.bg, color: meta.color, borderColor: meta.border } : { background: '#fff', color: '#d1d5db', borderColor: '#ececec' }}
                            >
                              {meta ? meta.label : ''}
                            </button>
                          </td>
                        )
                      })}
                      {STATUS_ORDER.map((key, idx) => (
                        <td
                          key={key}
                          className={`total-cell${idx === 0 ? ' first' : ''}`}
                          style={{ ...totalColStyle(idx), color: STATUS_META[key].color }}
                        >
                          {counts[key] > 0 ? counts[key] : <span className="total-zero">0</span>}
                        </td>
                      ))}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Status dropdown for the clicked day */}
      {menu && (
        <div
          ref={menuRef}
          className="att-menu"
          role="menu"
          style={{ top: menu.top, left: menu.left }}
        >
          <div className="att-menu-title">
            {menuStaff ? `${menuStaff.firstName} ${menuStaff.lastName}` : 'Staff'} · {menu.day} {MONTH_FULL[month].slice(0, 3)}
          </div>
          {STATUS_ORDER.map(key => {
            const meta = STATUS_META[key]
            const active = menuCurrent === key
            return (
              <button
                key={key}
                type="button"
                role="menuitem"
                className={`att-menu-item${active ? ' active' : ''}`}
                onClick={() => setDayStatus(menu.staffId, menu.day, key)}
              >
                <span className="att-chip" style={{ background: meta.bg, color: meta.color, borderColor: meta.border }}>{meta.label}</span>
                {meta.name}
                {active && <span className="att-menu-check">✓</span>}
              </button>
            )
          })}
          {menuCurrent && (
            <button
              type="button"
              role="menuitem"
              className="att-menu-item att-menu-clear"
              onClick={() => setDayStatus(menu.staffId, menu.day, null)}
            >
              <span className="att-chip" style={{ background: '#fff', color: '#9ca3af', borderColor: '#e4e4e7' }}>✕</span>
              Clear
            </button>
          )}
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
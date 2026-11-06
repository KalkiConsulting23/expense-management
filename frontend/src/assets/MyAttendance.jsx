import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useAuth, useClerk } from '@clerk/clerk-react'

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:5000/api'

const MONTH_FULL = ['January','February','March','April','May','June','July','August','September','October','November','December']
const WEEKDAY_SHORT = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']

const STATUS_META = {
  present: { label: 'P', color: '#16a34a', bg: '#f0fdf4', border: '#bbf7d0', name: 'Present' },
  absent:  { label: 'A', color: '#dc2626', bg: '#fef2f2', border: '#fecaca', name: 'Absent' },
  wfh:     { label: 'W', color: '#0284c7', bg: '#f0f9ff', border: '#bae6fd', name: 'WFH' },
  leave:   { label: 'L', color: '#7c3aed', bg: '#f5f3ff', border: '#ddd6fe', name: 'Leave' },
  halfday: { label: 'H', color: '#d97706', bg: '#fffbeb', border: '#fde68a', name: 'Half Day' },
}

// What an employee can choose (the server enforces the same rule)
const EMPLOYEE_CHOICES = ['present', 'halfday', 'wfh']
const LOCKED = ['leave', 'absent'] // set by the admin, employee can't change

// Project login statuses
const PROJECT_STATUS_META = {
  present: { name: 'Present', color: '#16a34a', bg: '#f0fdf4', border: '#bbf7d0' },
  late:    { name: 'Late',    color: '#ea580c', bg: '#fff7ed', border: '#fed7aa' },
  absent:  { name: 'Absent',  color: '#dc2626', bg: '#fef2f2', border: '#fecaca' },
  leave:   { name: 'Leave',   color: '#7c3aed', bg: '#f5f3ff', border: '#ddd6fe' },
  halfday: { name: 'Half Day', color: '#d97706', bg: '#fffbeb', border: '#fde68a' },
}

// "09:00" → 540
const toMinutes = (hhmm) => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || ''))
  return m ? Number(m[1]) * 60 + Number(m[2]) : null
}
// "09:00" → "9:00 AM"
const fmtTime12 = (hhmm) => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || ''))
  if (!m) return ''
  const h = Number(m[1])
  return `${((h + 11) % 12) + 1}:${m[2]} ${h < 12 ? 'AM' : 'PM'}`
}
// Saved login timestamp → "9:12 AM" (India time)
const fmtClock = (iso) => {
  if (!iso) return ''
  const d = new Date(iso)
  return isNaN(d) ? '' : d.toLocaleTimeString('en-US', { timeZone: 'Asia/Kolkata', hour: 'numeric', minute: '2-digit' })
}
// Same rule as the server: notOpen → onTime (Present, login time to login time + window) → closed
const windowState = (win, nowMin) => {
  if (!win || win.state === 'noTime') return 'noTime'
  if (win.anyTime) return 'onTime' // no late marking: any time today counts as Present
  const opens = toMinutes(win.opensAt), closes = toMinutes(win.closesAt)
  if (nowMin < opens) return 'notOpen'
  if (nowMin <= closes) return 'onTime'
  return 'closed'
}

const daysInMonth = (year, month) => new Date(year, month + 1, 0).getDate()
const weekdayOf = (year, month, day) => new Date(year, month, day).getDay()
const isWeekend = (year, month, day) => {
  const wd = weekdayOf(year, month, day)
  return wd === 0 || wd === 6
}

const MyAttendance = ({ me }) => {
  const { getToken } = useAuth()
  const { signOut } = useClerk()

  // "Today" comes from the server (India time), so it matches what the server allows
  const today = me?.rules?.today || {
    year: new Date().getFullYear(), month: new Date().getMonth(), day: new Date().getDate(),
  }

  const [view, setView] = useState({ year: today.year, month: today.month })
  const [data, setData] = useState(null)   // month being viewed: { days, holidays, staff }
  const [current, setCurrent] = useState(null) // always the current month (for the "Today" card)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(null) // status being saved
  const [toast, setToast] = useState(null)

  // ── Project logins ──
  const [proj, setProj] = useState(null)         // { now, blocked, projects } from the server
  const [projFetchedAt, setProjFetchedAt] = useState(0)
  const [projLoggingIn, setProjLoggingIn] = useState(null) // projectId being saved
  const [, setTick] = useState(0)                 // re-render so Present → Late → Closed updates live

  const loadProjects = useCallback(async () => {
    try {
      const token = await getToken()
      const res = await fetch(`${API_BASE}/my-projects/today`, { headers: { Authorization: `Bearer ${token}` } })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error || 'Could not load projects')
      setProj(body)
      setProjFetchedAt(Date.now())
    } catch (err) {
      setProj(p => p || { projects: [], blocked: null, error: err.message })
    }
  }, [getToken])

  useEffect(() => {
    loadProjects()
    const refresh = setInterval(loadProjects, 5 * 60 * 1000) // re-sync with the server every 5 minutes
    const tick = setInterval(() => setTick(t => t + 1), 20 * 1000)
    return () => { clearInterval(refresh); clearInterval(tick) }
  }, [loadProjects])

  // India time now, in minutes, based on the server's clock
  const projNowMin = proj?.now
    ? proj.now.minutes + Math.floor((Date.now() - projFetchedAt) / 60000)
    : null

  const showToast = (type, msg) => {
    setToast({ type, msg })
    setTimeout(() => setToast(null), 2600)
  }

  // silent: reload without the spinner · todayOnly: refresh only the "Today" card
  const load = useCallback(async (year, month, { silent = false, todayOnly = false } = {}) => {
    if (!silent) setLoading(true)
    setError('')
    try {
      const token = await getToken()
      const res = await fetch(`${API_BASE}/my-attendance?year=${year}&month=${month}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error || `Could not load attendance (${res.status})`)
      if (!todayOnly) setData(body)
      if (year === today.year && month === today.month) setCurrent(body)
    } catch (err) {
      if (!silent) setError(err.message)
    } finally {
      if (!silent) setLoading(false)
    }
  }, [getToken, today.year, today.month])

  useEffect(() => { load(view.year, view.month) }, [view, load])

  const isCurrentMonth = view.year === today.year && view.month === today.month
  const days = data?.days || {}
  const holidaySet = useMemo(() => new Set((data?.holidays || []).map(h => h.day)), [data])

  // Today's state always comes from the current month, whatever month is being viewed
  const todayStatus = current?.days?.[String(today.day)]
  const todayIsWeekend = isWeekend(today.year, today.month, today.day)
  const todayIsHoliday = (current?.holidays || []).some(h => h.day === today.day)
  const todayLocked = LOCKED.includes(todayStatus)

  const markToday = async (status) => {
    if (saving || status === todayStatus) return
    setSaving(status)
    try {
      const token = await getToken()
      const res = await fetch(`${API_BASE}/my-attendance/mark`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ day: today.day, status }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error || 'Could not save')
      setCurrent(c => ({ ...(c || {}), days: body.days }))
      if (isCurrentMonth) setData(d => ({ ...(d || {}), days: body.days }))
      showToast('success', `Marked ${STATUS_META[status].name} for today`)
    } catch (err) {
      showToast('error', err.message)
    } finally {
      setSaving(null)
    }
  }

  const loginToProject = async (p) => {
    if (projLoggingIn) return
    setProjLoggingIn(p.projectId)
    try {
      const token = await getToken()
      const res = await fetch(`${API_BASE}/my-projects/login`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ projectId: p.projectId }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error || 'Could not log in')
      setProj(cur => ({
        ...cur,
        projects: (cur?.projects || []).map(x => (x.projectId === p.projectId ? { ...x, today: body.today } : x)),
      }))
      showToast('success', body.status === 'late'
        ? `Logged in to ${p.projectName} — marked Late`
        : `Logged in to ${p.projectName} — marked Present`)
    } catch (err) {
      showToast('error', err.message)
      loadProjects() // the window may have changed — refresh it
    } finally {
      setProjLoggingIn(null)
    }
  }

  // Counts for the month being viewed (weekends & holidays excluded)
  const counts = useMemo(() => {
    const c = { present: 0, absent: 0, wfh: 0, leave: 0, halfday: 0 }
    Object.keys(days).forEach(dStr => {
      const d = Number(dStr)
      if (isWeekend(view.year, view.month, d)) return // a holiday counts only if the admin marked you as working
      if (c[days[dStr]] !== undefined) c[days[dStr]] += 1
    })
    return c
  }, [days, holidaySet, view])

  const goPrev = () => setView(v => (v.month === 0 ? { year: v.year - 1, month: 11 } : { ...v, month: v.month - 1 }))
  const goNext = () => {
    if (isCurrentMonth) return // no future months
    setView(v => (v.month === 11 ? { year: v.year + 1, month: 0 } : { ...v, month: v.month + 1 }))
  }

  const staff = data?.staff || me?.staff || {}
  const dim = daysInMonth(view.year, view.month)
  const leadingBlanks = weekdayOf(view.year, view.month, 1)

  return (
    <div className="ma-page">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
        * { box-sizing: border-box; }
        .ma-page { font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif; background: #f7f7f8; min-height: 100vh; padding: 24px 16px 60px; color: #18181b; }
        .ma-wrap { max-width: 760px; margin: 0 auto; display: flex; flex-direction: column; gap: 16px; }
        .ma-top { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
        .ma-eyebrow { font-size: 11px; font-weight: 500; letter-spacing: 0.4px; text-transform: uppercase; color: #9ca3af; margin-bottom: 4px; }
        .ma-title { font-size: 22px; font-weight: 600; margin: 0; letter-spacing: -0.3px; }
        .ma-meta { font-size: 12.5px; color: #6b7280; margin-top: 3px; }
        .ma-signout { padding: 8px 14px; border-radius: 9px; border: 1px solid #e4e4e7; background: #fff; font: inherit; font-size: 12.5px; font-weight: 600; color: #3f3f46; cursor: pointer; }
        .ma-signout:hover { background: #f4f4f5; }

        .ma-card { background: #fff; border: 1px solid #ececec; border-radius: 16px; box-shadow: 0 1px 3px rgba(16,24,40,0.04); padding: 20px; }
        .ma-card h3 { margin: 0 0 4px; font-size: 15px; font-weight: 600; }
        .ma-card .ma-hint { margin: 0 0 16px; font-size: 12.5px; color: #6b7280; }
        .ma-choices { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
        .ma-choice {
          display: flex; flex-direction: column; align-items: center; gap: 8px; padding: 16px 8px;
          border-radius: 14px; border: 1.5px solid #e4e4e7; background: #fff; cursor: pointer;
          font: inherit; font-size: 13.5px; font-weight: 600; color: #3f3f46; transition: all 0.15s;
        }
        .ma-choice:hover:not(:disabled) { border-color: #a5b4fc; background: #fafaff; }
        .ma-choice:disabled { cursor: not-allowed; opacity: 0.55; }
        .ma-choice.active { border-width: 2px; }
        .ma-choice .ma-chip { width: 34px; height: 34px; border-radius: 10px; font-size: 14px; }
        .ma-chip { display: inline-flex; align-items: center; justify-content: center; font-weight: 700; border: 1px solid transparent; border-radius: 6px; width: 22px; height: 22px; font-size: 11px; flex-shrink: 0; }
        .ma-note { margin-top: 14px; padding: 10px 12px; border-radius: 10px; font-size: 12.5px; }
        .ma-note.info { background: #f4f4f5; color: #52525b; }
        .ma-note.ok { background: #f0fdf4; color: #166534; }
        .ma-note.lock { background: #f5f3ff; color: #5b21b6; }

        .ma-cal-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px; }
        .ma-nav { display: inline-flex; align-items: center; gap: 8px; }
        .ma-nav button { width: 32px; height: 32px; border-radius: 9px; border: 1px solid #ececec; background: #fff; cursor: pointer; font-size: 15px; color: #374151; }
        .ma-nav button:disabled { opacity: 0.35; cursor: default; }
        .ma-month { font-size: 14px; font-weight: 600; min-width: 130px; text-align: center; }
        .ma-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 6px; }
        .ma-wd { font-size: 10px; font-weight: 600; color: #9ca3af; text-transform: uppercase; text-align: center; padding-bottom: 2px; }
        .ma-day { height: 58px; border-radius: 10px; border: 1px solid #f0f0f1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 3px; font-size: 12px; font-weight: 600; color: #3f3f46; background: #fff; min-height: 42px; }
        .ma-day.weekend { background: #f4f4f5; color: #a1a1aa; }
        .ma-day.holiday { background: #eef2ff; color: #4338ca; }
        .ma-day.today { box-shadow: 0 0 0 2px #6366f1; }
        .ma-day .ma-chip { width: 20px; height: 20px; font-size: 10px; }
        .ma-day .ma-tag { font-size: 9px; font-weight: 600; }

        .ma-counts { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 16px; padding-top: 14px; border-top: 1px solid #f4f4f5; }
        .ma-count { display: inline-flex; align-items: center; gap: 6px; font-size: 12.5px; color: #52525b; padding: 5px 10px 5px 6px; border-radius: 999px; background: #fafafa; border: 1px solid #f0f0f1; }
        .ma-count b { color: #18181b; }

        .ma-projects { display: flex; flex-direction: column; gap: 10px; }
        .ma-proj { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 14px; border: 1px solid #ececec; border-radius: 12px; background: #fff; }
        .ma-proj-name { font-size: 14px; font-weight: 600; color: #18181b; }
        .ma-proj-sub { font-size: 12px; color: #6b7280; margin-top: 3px; }
        .ma-proj-sub b { color: #3f3f46; }
        .ma-proj-btn { padding: 9px 14px; border-radius: 10px; border: none; font: inherit; font-size: 13px; font-weight: 600; color: #fff; cursor: pointer; white-space: nowrap; }
        .ma-proj-btn.on { background: #16a34a; }
        .ma-proj-btn.on:hover { background: #15803d; }
        .ma-proj-btn.late { background: #ea580c; }
        .ma-proj-btn.late:hover { background: #c2410c; }
        .ma-proj-btn:disabled { opacity: 0.6; cursor: wait; }
        .ma-proj-pill { display: inline-flex; align-items: center; gap: 5px; padding: 6px 11px; border-radius: 999px; font-size: 12.5px; font-weight: 600; border: 1px solid; white-space: nowrap; }
        .ma-proj-muted { font-size: 12.5px; color: #9ca3af; white-space: nowrap; text-align: right; }

        .ma-state { text-align: center; padding: 36px 16px; color: #9ca3af; font-size: 14px; }
        .ma-state.err { color: #dc2626; }
        .ma-toast { position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%); padding: 11px 16px; border-radius: 12px; font-size: 13px; font-weight: 500; background: #fff; box-shadow: 0 8px 28px rgba(16,24,40,0.16); z-index: 9999; white-space: nowrap; }
        .ma-toast.success { color: #16a34a; border: 1px solid #bbf7d0; }
        .ma-toast.error { color: #dc2626; border: 1px solid #fecaca; }

        @media (max-width: 480px) {
          .ma-title { font-size: 19px; }
          .ma-choice { padding: 12px 4px; font-size: 12.5px; }
          .ma-grid { gap: 4px; }
          .ma-day { height: auto; aspect-ratio: 1 / 1; min-height: 38px; border-radius: 8px; }
          .ma-proj { flex-direction: column; align-items: stretch; }
          .ma-proj-btn, .ma-proj-pill { width: 100%; justify-content: center; text-align: center; }
          .ma-proj-muted { text-align: left; white-space: normal; }
        }
      `}</style>

      <div className="ma-wrap">
        <div className="ma-top">
          <div>
            <div className="ma-eyebrow">My Attendance</div>
            <h2 className="ma-title">Hi, {staff.firstName || 'there'}</h2>
            <div className="ma-meta">
              {[staff.employeeId, staff.designation].filter(Boolean).join(' · ') || me?.email}
            </div>
          </div>
          <button className="ma-signout" onClick={() => signOut()}>Sign out</button>
        </div>

        {/* ── Mark today ── */}
        <div className="ma-card">
          <h3>Today · {today.day} {MONTH_FULL[today.month]}</h3>
          <p className="ma-hint">Choose how you are working today.</p>

          {todayIsWeekend ? (
            <div className="ma-note info">Today is a weekend, so there is nothing to mark.</div>
          ) : todayIsHoliday ? (
            <div className="ma-note info">Today is a company holiday, so there is nothing to mark.</div>
          ) : todayLocked ? (
            <div className="ma-note lock">
              Your admin has marked today as <b>{STATUS_META[todayStatus].name}</b>. Contact your admin if this is wrong.
            </div>
          ) : (
            <>
              <div className="ma-choices">
                {EMPLOYEE_CHOICES.map(key => {
                  const meta = STATUS_META[key]
                  const active = todayStatus === key
                  return (
                    <button
                      key={key}
                      type="button"
                      className={`ma-choice${active ? ' active' : ''}`}
                      style={active ? { borderColor: meta.color, background: meta.bg, color: meta.color } : undefined}
                      disabled={Boolean(saving) || !current}
                      onClick={() => markToday(key)}
                    >
                      <span className="ma-chip" style={{ background: meta.bg, color: meta.color, borderColor: meta.border }}>
                        {saving === key ? '…' : meta.label}
                      </span>
                      {meta.name}
                    </button>
                  )
                })}
              </div>
              {todayStatus && STATUS_META[todayStatus] && (
                <div className="ma-note ok">
                  You're marked as <b>{STATUS_META[todayStatus].name}</b> today. You can change it until the end of the day.
                </div>
              )}
            </>
          )}
        </div>

        {/* ── Project logins (only for staff on a project) ── */}
        {proj && proj.projects && proj.projects.length > 0 && (
          <div className="ma-card">
            <h3>My projects today</h3>
            <p className="ma-hint">
              Log in to each project once a day during its login window to be marked <b style={{ color: '#16a34a' }}>Present</b>.
              After the window closes, contact your admin.
            </p>
            {proj.blocked ? (
              <div className="ma-note info">{proj.blocked} No project login needed.</div>
            ) : (
              <div className="ma-projects">
                {proj.projects.map(p => {
                  const win = p.window || {}
                  const state = projNowMin === null ? win.state : windowState(win, projNowMin)
                  const done = p.today && PROJECT_STATUS_META[p.today.status]
                  const busy = projLoggingIn === p.projectId
                  let right
                  if (done) {
                    const meta = PROJECT_STATUS_META[p.today.status]
                    right = (
                      <span className="ma-proj-pill" style={{ color: meta.color, background: meta.bg, borderColor: meta.border }}>
                        ✓ {meta.name}{p.today.at ? ` · ${fmtClock(p.today.at)}` : p.today.by === 'admin' ? ' · by admin' : ''}
                      </span>
                    )
                  } else if (state === 'onTime') {
                    right = <button className="ma-proj-btn on" disabled={busy} onClick={() => loginToProject(p)}>{busy ? 'Saving…' : 'Log in'}</button>
                  } else if (state === 'late') {
                    right = <button className="ma-proj-btn late" disabled={busy} onClick={() => loginToProject(p)}>{busy ? 'Saving…' : 'Log in (Late)'}</button>
                  } else if (state === 'notOpen') {
                    right = <span className="ma-proj-muted">Opens at {fmtTime12(win.opensAt)}</span>
                  } else if (state === 'closed') {
                    right = <span className="ma-proj-muted" style={{ color: '#dc2626' }}>Closed at {fmtTime12(win.closesAt)} · contact your admin</span>
                  } else {
                    right = <span className="ma-proj-muted">No login time set</span>
                  }
                  return (
                    <div key={p.projectId} className="ma-proj">
                      <div style={{ minWidth: 0 }}>
                        <div className="ma-proj-name">{p.projectName}</div>
                        <div className="ma-proj-sub">
                          {!win.loginTime
                            ? 'No login time set'
                            : win.anyTime
                              ? <>Log in <b>any time today</b></>
                              : <>Login <b>{fmtTime12(win.opensAt)} – {fmtTime12(win.closesAt)}</b></>}
                        </div>
                      </div>
                      {right}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* ── Month calendar (read-only) ── */}
        <div className="ma-card">
          <div className="ma-cal-head">
            <h3 style={{ margin: 0 }}>My month</h3>
            <div className="ma-nav">
              <button onClick={goPrev} aria-label="Previous month">‹</button>
              <div className="ma-month">{MONTH_FULL[view.month]} {view.year}</div>
              <button onClick={goNext} disabled={isCurrentMonth} aria-label="Next month">›</button>
            </div>
          </div>

          {loading ? (
            <div className="ma-state">Loading…</div>
          ) : error ? (
            <div className="ma-state err">{error}</div>
          ) : (
            <>
              <div className="ma-grid">
                {WEEKDAY_SHORT.map(w => <div key={w} className="ma-wd">{w}</div>)}
                {Array.from({ length: leadingBlanks }, (_, i) => <div key={`b${i}`} />)}
                {Array.from({ length: dim }, (_, i) => i + 1).map(day => {
                  const wknd = isWeekend(view.year, view.month, day)
                  const hol = holidaySet.has(day)
                  const status = days[String(day)]
                  const meta = status ? STATUS_META[status] : null
                  const isToday = isCurrentMonth && day === today.day
                  return (
                    <div
                      key={day}
                      className={`ma-day${wknd ? ' weekend' : ''}${hol ? ' holiday' : ''}${isToday ? ' today' : ''}`}
                      title={hol ? (meta ? `Holiday · worked (${meta.name})` : 'Holiday') : meta ? meta.name : wknd ? 'Weekend' : 'Not marked'}
                    >
                      <span>{day}</span>
                      {hol && meta ? (
                        <span className="ma-chip" title={`Worked on the holiday: ${meta.name}`} style={{ background: meta.bg, color: meta.color, borderColor: meta.border }}>{meta.label}</span>
                      ) : hol ? (
                        <span className="ma-tag">★</span>
                      ) : meta && !wknd ? (
                        <span className="ma-chip" style={{ background: meta.bg, color: meta.color, borderColor: meta.border }}>{meta.label}</span>
                      ) : null}
                    </div>
                  )
                })}
              </div>

              <div className="ma-counts">
                {Object.keys(STATUS_META).map(key => {
                  const meta = STATUS_META[key]
                  return (
                    <span key={key} className="ma-count">
                      <span className="ma-chip" style={{ background: meta.bg, color: meta.color, borderColor: meta.border }}>{meta.label}</span>
                      {meta.name} <b>{counts[key]}</b>
                    </span>
                  )
                })}
              </div>
            </>
          )}
        </div>
      </div>

      {toast && <div className={`ma-toast ${toast.type}`}>{toast.msg}</div>}
    </div>
  )
}

export default MyAttendance
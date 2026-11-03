import React, { useEffect, useMemo, useState } from 'react'

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

// "09:00" → "9:00 AM"
const fmtTime12 = (hhmm) => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || ''))
  if (!m) return ''
  const h = Number(m[1])
  return `${((h + 11) % 12) + 1}:${m[2]} ${h < 12 ? 'AM' : 'PM'}`
}

// Billing shown in the projects table, e.g. "₹1,00,000 / month"
function billingText(p) {
  const type = (p.projectType || 'monthly').toLowerCase()
  if (type === 'hourly') return `${fmt(p.defaultHourlyRate)} / hr`
  if (type === 'daily') return `${fmt(p.defaultDailyRate)} / day`
  return `${fmt(p.expectedAmount)} / month`
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


// ═════════════════════════════════════════════════════════════
//  EDIT PROJECT FORM (popup) — edit every field of a project
//  Saves with PATCH /api/project/update/:id
// ═════════════════════════════════════════════════════════════
const PROJECT_CACHE_KEY = 'local_project_data_cache'

const TYPES = [
  { value: 'hourly', label: '⏱ Hourly' },
  { value: 'daily', label: '☀️ Daily' },
  { value: 'monthly', label: '📅 Monthly' },
]
const INTL_CURRENCIES = ['USD', 'EUR', 'GBP', 'AED', 'SGD']

// Saved date → "YYYY-MM-DD" for a date input
const toInputDate = (d) => {
  if (!d) return ''
  const dt = new Date(d)
  return isNaN(dt) ? '' : dt.toISOString().slice(0, 10)
}
// "09:00" + 30 → "09:30"
const addMinutes = (hhmm, mins) => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || ''))
  if (!m) return ''
  const t = Math.min(24 * 60 - 1, Number(m[1]) * 60 + Number(m[2]) + Number(mins || 0))
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`
}
const staffName = (s) => `${s.firstName || ''} ${s.lastName || ''}`.trim() || s.employeeId || 'Staff'
const numStr = (v) => (v === undefined || v === null ? '' : String(Math.round(Number(v) * 100) / 100))

// Project → form values (all strings, staff as an id array)
const projectToForm = (p) => ({
  projectName: p.projectName || '',
  projectScope: p.projectScope || 'domestic',
  currency: p.currency || 'INR',
  projectType: p.projectType || 'monthly',
  startDate: toInputDate(p.startDate),
  endDate: toInputDate(p.endDate),
  daysCycle: numStr(p.daysCycle ?? 30),
  expectedAmount: numStr(p.expectedAmount ?? 0),
  defaultHourlyRate: numStr(p.defaultHourlyRate ?? 0),
  defaultDailyRate: numStr(p.defaultDailyRate ?? 0),
  loginTime: p.loginTime || '',
  lateWindowMinutes: numStr(p.lateWindowMinutes ?? 30),
  assignedStaff: (p.assignedStaff || []).map(String),
})

const NUMBER_FIELDS = ['daysCycle', 'expectedAmount', 'defaultHourlyRate', 'defaultDailyRate', 'lateWindowMinutes']
const sameValue = (a, b) => (Array.isArray(a) ? JSON.stringify(a) === JSON.stringify(b) : (a ?? '') === (b ?? ''))

const EditProjectForm = ({ project, staffList: staffFromParent, onClose, onSaved }) => {
  const initial = useMemo(() => projectToForm(project), [project])
  const [form, setForm] = useState(initial)
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [staffList, setStaffList] = useState(staffFromParent || [])
  const [staffSearch, setStaffSearch] = useState('')

  // Load staff if the page didn't pass them in
  useEffect(() => {
    if (staffFromParent && staffFromParent.length) { setStaffList(staffFromParent); return }
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch(`${API_BASE}/staff/all`)
        if (!res.ok) return
        const data = await res.json()
        if (!cancelled) setStaffList(Array.isArray(data) ? data : [])
      } catch (e) { /* staff list stays empty */ }
    })()
    return () => { cancelled = true }
  }, [staffFromParent])

  const changedKeys = Object.keys(form).filter(k => !sameValue(form[k], initial[k]))
  const isDirty = changedKeys.length > 0

  const close = () => {
    if (saving) return
    if (isDirty && !window.confirm('Discard your changes?')) return
    onClose()
  }

  // Esc closes; stop the page behind from scrolling
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') close() }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev }
  })

  const set = (key, value) => {
    setForm(f => ({ ...f, [key]: value }))
    if (errors[key]) setErrors(e => ({ ...e, [key]: undefined }))
  }

  const setScope = (scope) => {
    setForm(f => ({
      ...f,
      projectScope: scope,
      currency: scope === 'international' ? (f.currency !== 'INR' ? f.currency : 'USD') : 'INR',
    }))
  }

  const toggleStaff = (id) => {
    setForm(f => ({
      ...f,
      assignedStaff: f.assignedStaff.includes(id) ? f.assignedStaff.filter(x => x !== id) : [...f.assignedStaff, id],
    }))
    if (errors.loginTime) setErrors(e => ({ ...e, loginTime: undefined }))
  }

  const validate = () => {
    const e = {}
    if (!form.projectName.trim()) e.projectName = 'Project name is required'
    if (!form.startDate) e.startDate = 'Start date is required'
    if (!form.endDate) e.endDate = 'End date is required'
    if (form.startDate && form.endDate && form.endDate < form.startDate) e.endDate = 'End date must be after start date'
    if (!form.daysCycle || Number(form.daysCycle) <= 0) e.daysCycle = 'Enter a valid days cycle'
    if (form.projectType === 'monthly' && !(Number(form.expectedAmount) > 0)) e.expectedAmount = 'Expected amount is required'
    if (form.projectType === 'hourly' && !(Number(form.defaultHourlyRate) > 0)) e.defaultHourlyRate = 'Hourly rate is required'
    if (form.projectType === 'daily' && !(Number(form.defaultDailyRate) > 0)) e.defaultDailyRate = 'Daily rate is required'
    if (form.assignedStaff.length > 0 && !form.loginTime) e.loginTime = 'Set a login time for the assigned staff'
    const lw = Number(form.lateWindowMinutes)
    if (form.lateWindowMinutes !== '' && (!Number.isFinite(lw) || lw < 0 || lw > 240)) e.lateWindowMinutes = 'Enter 0 to 240 minutes'
    return e
  }

  const handleSave = async (ev) => {
    ev.preventDefault()
    if (!isDirty) { onClose(); return }
    const errs = validate()
    if (Object.keys(errs).length) { setErrors(errs); return }

    // Send only what changed
    const payload = {}
    changedKeys.forEach(k => {
      const v = form[k]
      if (NUMBER_FIELDS.includes(k)) payload[k] = v === '' ? (k === 'lateWindowMinutes' ? 30 : 0) : Number(v)
      else if (typeof v === 'string') payload[k] = v.trim()
      else payload[k] = v
    })

    setSaving(true)
    setSaveError('')
    try {
      const res = await fetch(`${API_BASE}/project/update/${project._id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.message || 'Failed to update project')
      // The Project Tracker caches projects in this tab — make it reload fresh data
      try { sessionStorage.removeItem(PROJECT_CACHE_KEY) } catch (e) { /* ignore */ }
      onSaved(data)
    } catch (err) {
      setSaveError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const amountField = form.projectType === 'monthly' ? 'expectedAmount'
    : form.projectType === 'hourly' ? 'defaultHourlyRate' : 'defaultDailyRate'
  const amountLabel = form.projectType === 'monthly' ? 'Expected Amount / month'
    : form.projectType === 'hourly' ? 'Default Hourly Rate' : 'Default Daily Rate'

  const q = staffSearch.trim().toLowerCase()
  const shownStaff = staffList.filter(s =>
    !q || `${staffName(s)} ${s.employeeId || ''} ${s.designation || ''}`.toLowerCase().includes(q))
  const cls = (key) => `epm-input${errors[key] ? ' err' : ''}${changedKeys.includes(key) ? ' changed' : ''}`

  return (
    <div className="epm-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) close() }}>
      <style>{`
        .epm-overlay { position: fixed; inset: 0; background: rgba(17,24,39,0.45); backdrop-filter: blur(4px); display: flex; align-items: center; justify-content: center; padding: 24px 16px; z-index: 1000; font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif; }
        .epm-box { background: #fff; border-radius: 18px; width: 100%; max-width: 620px; max-height: calc(100vh - 48px); display: flex; flex-direction: column; box-shadow: 0 24px 60px rgba(16,24,40,0.22); border: 1px solid #ececec; overflow: hidden; }
        .epm-head { padding: 20px 24px 14px; border-bottom: 1px solid #f4f4f5; display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; flex-shrink: 0; }
        .epm-title { font-size: 16px; font-weight: 600; color: #18181b; letter-spacing: -0.2px; }
        .epm-sub { font-size: 12px; color: #6b7280; margin-top: 3px; }
        .epm-x { border: none; background: transparent; font-size: 22px; line-height: 1; color: #9ca3af; cursor: pointer; padding: 2px 6px; border-radius: 6px; }
        .epm-x:hover { background: #f4f4f5; color: #18181b; }
        .epm-body { padding: 4px 24px 18px; overflow-y: auto; flex: 1; min-height: 0; }
        .epm-section { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; color: #6b7280; margin: 18px 0 10px; }
        .epm-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px 14px; }
        .epm-field { display: flex; flex-direction: column; min-width: 0; }
        .epm-field.wide { grid-column: 1 / -1; }
        .epm-field label { font-size: 12px; font-weight: 500; color: #4b5563; margin-bottom: 5px; }
        .epm-req { color: #dc2626; }
        .epm-input { font-family: inherit; font-size: 13.5px; color: #18181b; border: 1px solid #e5e7eb; border-radius: 9px; padding: 8px 10px; background: #fff; outline: none; width: 100%; box-sizing: border-box; transition: border-color 0.13s, box-shadow 0.13s; }
        .epm-input:focus { border-color: #18181b; box-shadow: 0 0 0 3px rgba(24,24,27,0.07); }
        .epm-input.changed { border-color: #f59e0b; background: #fffbeb; }
        .epm-input.err { border-color: #dc2626; background: #fef2f2; }
        .epm-err { font-size: 11.5px; color: #dc2626; margin-top: 4px; }
        .epm-pills { display: flex; gap: 8px; flex-wrap: wrap; }
        .epm-pill { padding: 8px 13px; border-radius: 9px; border: 1px solid #e5e7eb; background: #fafafa; color: #6b7280; font: inherit; font-size: 12.5px; font-weight: 500; cursor: pointer; }
        .epm-pill:hover { border-color: #d1d5db; color: #18181b; }
        .epm-pill.active { border-color: #18181b; background: #f3f4f6; color: #18181b; }
        .epm-pill.changed { box-shadow: 0 0 0 2px #fde68a; }
        .epm-prefix { position: relative; }
        .epm-prefix span { position: absolute; left: 11px; top: 50%; transform: translateY(-50%); color: #9ca3af; font-size: 13.5px; pointer-events: none; }
        .epm-prefix .epm-input { padding-left: 26px; }
        .epm-note { font-size: 11.5px; color: #6b7280; background: #fafafa; border: 1px dashed #d1d5db; border-radius: 9px; padding: 8px 11px; line-height: 1.55; margin-top: 10px; }
        .epm-chips { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 8px; }
        .epm-chip { display: inline-flex; align-items: center; gap: 5px; padding: 4px 6px 4px 10px; border-radius: 999px; background: #eef2ff; border: 1px solid #e0e7ff; color: #3730a3; font-size: 12px; font-weight: 500; }
        .epm-chip button { border: none; background: transparent; color: #6366f1; cursor: pointer; font-size: 14px; line-height: 1; padding: 0 2px; }
        .epm-list { border: 1px solid #ececec; border-radius: 10px; max-height: 190px; overflow-y: auto; }
        .epm-item { display: flex; align-items: center; gap: 10px; padding: 8px 12px; cursor: pointer; border-bottom: 1px solid #f4f4f5; font-size: 12.5px; color: #18181b; }
        .epm-item:last-child { border-bottom: none; }
        .epm-item:hover { background: #fafafa; }
        .epm-item input { width: 15px; height: 15px; accent-color: #18181b; cursor: pointer; flex-shrink: 0; }
        .epm-meta { font-size: 10.5px; color: #9ca3af; }
        .epm-empty { padding: 12px; font-size: 12px; color: #9ca3af; text-align: center; }
        .epm-save-err { margin-top: 14px; padding: 9px 12px; border-radius: 9px; background: #fef2f2; border: 1px solid #fecaca; color: #b91c1c; font-size: 12.5px; }
        .epm-foot { padding: 14px 24px; border-top: 1px solid #f4f4f5; display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-shrink: 0; background: #fff; }
        .epm-changes { font-size: 12px; color: #6b7280; }
        .epm-changes b { color: #b45309; }
        .epm-btn { font-family: inherit; font-size: 13px; font-weight: 600; border-radius: 10px; padding: 9px 16px; cursor: pointer; }
        .epm-btn.ghost { background: #fff; border: 1px solid #e5e7eb; color: #374151; }
        .epm-btn.ghost:hover { background: #f4f4f5; }
        .epm-btn.primary { background: #18181b; border: 1px solid #18181b; color: #fff; }
        .epm-btn.primary:hover { background: #000; }
        .epm-btn:disabled { opacity: 0.55; cursor: not-allowed; }
        @media (max-width: 560px) {
          .epm-grid { grid-template-columns: 1fr; }
          .epm-foot { flex-direction: column; align-items: stretch; }
          .epm-foot > div:last-child { display: flex; gap: 8px; }
          .epm-foot .epm-btn { flex: 1; }
        }
      `}</style>

      <form className="epm-box" onSubmit={handleSave} role="dialog" aria-modal="true" aria-labelledby="epm-title">
        <div className="epm-head">
          <div>
            <div className="epm-title" id="epm-title">Edit Project</div>
            <div className="epm-sub">{project.projectName}</div>
          </div>
          <button type="button" className="epm-x" aria-label="Close" onClick={close}>×</button>
        </div>

        <div className="epm-body">
          <div className="epm-section">Project</div>
          <div className="epm-grid">
            <div className="epm-field wide">
              <label htmlFor="epm-name">Project Name <span className="epm-req">*</span></label>
              <input id="epm-name" className={cls('projectName')} value={form.projectName} onChange={e => set('projectName', e.target.value)} disabled={saving} />
              {errors.projectName && <div className="epm-err">{errors.projectName}</div>}
            </div>
            <div className="epm-field wide">
              <label>Scope</label>
              <div className="epm-pills">
                {[['domestic', '🏠 Domestic'], ['international', '🌍 International']].map(([v, l]) => (
                  <button key={v} type="button" disabled={saving}
                    className={`epm-pill${form.projectScope === v ? ' active' : ''}${form.projectScope === v && changedKeys.includes('projectScope') ? ' changed' : ''}`}
                    onClick={() => setScope(v)}>{l}</button>
                ))}
              </div>
            </div>
            <div className="epm-field">
              <label htmlFor="epm-start">Start Date <span className="epm-req">*</span></label>
              <input id="epm-start" type="date" className={cls('startDate')} value={form.startDate} onChange={e => set('startDate', e.target.value)} disabled={saving} />
              {errors.startDate && <div className="epm-err">{errors.startDate}</div>}
            </div>
            <div className="epm-field">
              <label htmlFor="epm-end">End Date <span className="epm-req">*</span></label>
              <input id="epm-end" type="date" min={form.startDate} className={cls('endDate')} value={form.endDate} onChange={e => set('endDate', e.target.value)} disabled={saving} />
              {errors.endDate && <div className="epm-err">{errors.endDate}</div>}
            </div>
            <div className="epm-field">
              <label htmlFor="epm-cycle">Payment Days Cycle <span className="epm-req">*</span></label>
              <input id="epm-cycle" type="number" min="1" className={cls('daysCycle')} value={form.daysCycle} onChange={e => set('daysCycle', e.target.value)} disabled={saving} />
              {errors.daysCycle && <div className="epm-err">{errors.daysCycle}</div>}
            </div>
            {form.projectScope === 'international' && (
              <div className="epm-field">
                <label htmlFor="epm-cur">Billing Currency</label>
                <select id="epm-cur" className={cls('currency')} value={form.currency} onChange={e => set('currency', e.target.value)} disabled={saving}>
                  {INTL_CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            )}
          </div>

          <div className="epm-section">Billing</div>
          <div className="epm-grid">
            <div className="epm-field wide">
              <label>Billing Type</label>
              <div className="epm-pills">
                {TYPES.map(t => (
                  <button key={t.value} type="button" disabled={saving}
                    className={`epm-pill${form.projectType === t.value ? ' active' : ''}${form.projectType === t.value && changedKeys.includes('projectType') ? ' changed' : ''}`}
                    onClick={() => set('projectType', t.value)}>{t.label}</button>
                ))}
              </div>
            </div>
            <div className="epm-field">
              <label htmlFor="epm-amt">{amountLabel} (₹) <span className="epm-req">*</span></label>
              <div className="epm-prefix">
                <span>₹</span>
                <input id="epm-amt" type="number" min="0" step="any" className={cls(amountField)} value={form[amountField]} onChange={e => set(amountField, e.target.value)} disabled={saving} />
              </div>
              {errors[amountField] && <div className="epm-err">{errors[amountField]}</div>}
            </div>
          </div>
          <div className="epm-note">
            Amounts are saved in ₹{form.projectScope === 'international' ? ' (converted when the project was added)' : ''}.
            Months you've already configured or marked as received in the Project Tracker keep their saved values.
            {changedKeys.includes('projectType') && <> Changing the billing type only affects months you haven't configured yet.</>}
          </div>

          <div className="epm-section">Team &amp; Attendance</div>
          <div className="epm-grid">
            <div className="epm-field">
              <label htmlFor="epm-login">Daily Login Time {form.assignedStaff.length > 0 && <span className="epm-req">*</span>}</label>
              <input id="epm-login" type="time" className={cls('loginTime')} value={form.loginTime} onChange={e => set('loginTime', e.target.value)} disabled={saving} />
              {errors.loginTime && <div className="epm-err">{errors.loginTime}</div>}
            </div>
            <div className="epm-field">
              <label htmlFor="epm-late">Late Window (minutes, 0 = no late)</label>
              <input id="epm-late" type="number" min="0" max="240" className={cls('lateWindowMinutes')} value={form.lateWindowMinutes} onChange={e => set('lateWindowMinutes', e.target.value)} disabled={saving} />
              {errors.lateWindowMinutes && <div className="epm-err">{errors.lateWindowMinutes}</div>}
            </div>
          </div>
          {form.loginTime && form.lateWindowMinutes !== '' && Number(form.lateWindowMinutes) === 0 ? (
            <div className="epm-note">
              Late window is <b>0</b> → <b>no late marking</b>. Staff can log in <b>any time</b> during the day and are marked Present.
            </div>
          ) : form.loginTime && (
            <div className="epm-note">
              Up to <b>{fmtTime12(form.loginTime)}</b> = Present · after that = Late · closed after <b>{fmtTime12(addMinutes(form.loginTime, form.lateWindowMinutes === '' ? 30 : (Number(form.lateWindowMinutes) || 0)))}</b>
            </div>
          )}

          <div className="epm-field" style={{ marginTop: 12 }}>
            <label>Assigned Staff ({form.assignedStaff.length})</label>
            {form.assignedStaff.length > 0 && (
              <div className="epm-chips">
                {form.assignedStaff.map(id => {
                  const s = staffList.find(x => String(x._id) === id) || { firstName: 'Staff' }
                  return (
                    <span key={id} className="epm-chip">
                      {staffName(s)}
                      <button type="button" aria-label={`Remove ${staffName(s)}`} onClick={() => toggleStaff(id)} disabled={saving}>×</button>
                    </span>
                  )
                })}
              </div>
            )}
            {staffList.length > 5 && (
              <input className="epm-input" placeholder="Search staff…" value={staffSearch} onChange={e => setStaffSearch(e.target.value)} style={{ marginBottom: 8 }} />
            )}
            <div className="epm-list">
              {staffList.length === 0 ? (
                <div className="epm-empty">No staff found.</div>
              ) : shownStaff.length === 0 ? (
                <div className="epm-empty">No match.</div>
              ) : shownStaff.map(s => {
                const id = String(s._id)
                return (
                  <label key={id} className="epm-item">
                    <input type="checkbox" checked={form.assignedStaff.includes(id)} onChange={() => toggleStaff(id)} disabled={saving} />
                    <div style={{ minWidth: 0 }}>
                      <div>{staffName(s)}</div>
                      <div className="epm-meta">{[s.employeeId, s.designation].filter(Boolean).join(' · ')}</div>
                    </div>
                  </label>
                )
              })}
            </div>
          </div>

          {saveError && <div className="epm-save-err">{saveError}</div>}
        </div>

        <div className="epm-foot">
          <div className="epm-changes">
            {isDirty ? <><b>{changedKeys.length}</b> field{changedKeys.length !== 1 ? 's' : ''} changed</> : 'No changes yet'}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="epm-btn ghost" onClick={close} disabled={saving}>Cancel</button>
            <button type="submit" className="epm-btn primary" disabled={saving || !isDirty}>{saving ? 'Saving…' : 'Save Changes'}</button>
          </div>
        </div>
      </form>
    </div>
  )
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
  const [editProject, setEditProject] = useState(null) // project being edited
  const [toast, setToast]         = useState('')

  // After editing: show the updated project straight away
  const handleProjectSaved = (updated) => {
    setProjects(prev => prev.map(p => (p._id === updated._id ? { ...p, ...updated } : p)))
    setEditProject(null)
    setToast(`${updated.projectName} updated`)
    setTimeout(() => setToast(''), 2500)
  }

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

        .pj-type {
          display: inline-block; margin-top: 3px; background: #eef2ff; border: 1px solid #e0e7ff;
          color: #4338ca; border-radius: 4px; padding: 1px 5px; font-size: 9px; font-weight: 600; text-transform: uppercase;
        }
        .pj-billing { font-size: 13px; color: #18181b; white-space: nowrap; font-variant-numeric: tabular-nums; }
        .pj-team { font-size: 12.5px; color: #374151; white-space: nowrap; }
        .pj-team-sub { display: block; font-size: 11px; color: #9ca3af; margin-top: 2px; }
        .pj-edit-btn {
          display: inline-flex; align-items: center; gap: 6px;
          border: 1px solid #e5e7eb; background: #fff; color: #374151;
          border-radius: 8px; padding: 6px 11px; font-size: 12px; font-weight: 500;
          cursor: pointer; font-family: inherit; transition: all 0.13s; white-space: nowrap;
        }
        .pj-edit-btn:hover { background: #f4f4f5; border-color: #d4d4d8; color: #18181b; }
        .pm-toast {
          position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%);
          background: #18181b; color: #fff; font-size: 13px; font-weight: 500;
          padding: 10px 16px; border-radius: 10px; box-shadow: 0 8px 24px rgba(0,0,0,0.18); z-index: 1100;
        }

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
                <th>Billing</th>
                <th>Team</th>
                <th className="center">Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {projects.length === 0 && (
                <tr><td colSpan={7} style={{ textAlign: 'center', color: '#c5c5c9' }}>No projects</td></tr>
              )}
              {projects.map(p => {
                const active = isProjectActive(p)
                return (
                  <tr key={p._id}>
                    <td className="pj-name">
                      {p.projectName}
                      <div><span className="pj-type">{p.projectType || 'monthly'}</span></div>
                    </td>
                    <td className="pj-date">{fmtDate(p.startDate)}</td>
                    <td className="pj-date">{p.endDate ? fmtDate(p.endDate) : 'Ongoing'}</td>
                    <td className="pj-billing">{billingText(p)}</td>
                    <td className="pj-team">
                      {(p.assignedStaff || []).length > 0
                        ? <>👥 {p.assignedStaff.length} staff<span className="pj-team-sub">{!p.loginTime ? 'No login time' : Number(p.lateWindowMinutes) === 0 ? 'Login any time' : `Login ${fmtTime12(p.loginTime)}`}</span></>
                        : <span style={{ color: '#c5c5c9' }}>—</span>}
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <span className={`status-pill ${active ? 'active' : 'inactive'}`}>
                        <span className="status-dot" />
                        {active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <button type="button" className="pj-edit-btn" onClick={() => setEditProject(p)}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
                        </svg>
                        Edit
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {editProject && (
        <EditProjectForm
          project={editProject}
          onClose={() => setEditProject(null)}
          onSaved={handleProjectSaved}
        />
      )}
      {toast && <div className="pm-toast">{toast}</div>}
    </>
  )
}

export default Projectmaster
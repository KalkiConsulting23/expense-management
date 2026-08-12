import React, { useEffect, useState, useRef, useMemo, useCallback, memo } from 'react'
import { useNavigate } from 'react-router-dom'

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
// Indian financial year: April → March. Drives column display order.
const FY_MONTHS = ['Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec','Jan','Feb','Mar']
// For a given FY-start year and month name, return the real CALENDAR year.
// Apr–Dec belong to the FY start year; Jan–Mar roll into the next year.
function calYearForFYMonth(fyStartYear, monthName) {
  const idx = MONTHS.indexOf(monthName) // 0=Jan … 11=Dec
  return idx >= 3 ? fyStartYear : fyStartYear + 1 // Jan,Feb,Mar (idx 0-2) → +1
}
// Label like "FY 2025-26"
function fyLabel(fyStartYear) {
  const next = String((fyStartYear + 1) % 100).padStart(2, '0')
  return `FY ${fyStartYear}-${next}`
}
// Convert a date to the FY-start year it belongs to (Jan-Mar → previous year).
function toFYStartYear(d) {
  return d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1
}
const CACHE_KEY = 'local_employee_data_cache'
const API_BASE = import.meta.env.VITE_API_BASE
const fmt = (n) => '₹' + Number(n).toLocaleString('en-IN')

// ─── Period filter config (financial-year aligned) ───────────────────────────
const PERIOD_OPTIONS = [
  { label: 'Full Year', value: 'full', months: FY_MONTHS },
  { label: 'H1',        value: 'h1',   months: ['Apr','May','Jun','Jul','Aug','Sep'] },
  { label: 'H2',        value: 'h2',   months: ['Oct','Nov','Dec','Jan','Feb','Mar'] },
  { label: 'Q1',        value: 'q1',   months: ['Apr','May','Jun'] },
  { label: 'Q2',        value: 'q2',   months: ['Jul','Aug','Sep'] },
  { label: 'Q3',        value: 'q3',   months: ['Oct','Nov','Dec'] },
  { label: 'Q4',        value: 'q4',   months: ['Jan','Feb','Mar'] },
]

function getMonthsForPeriod(periodValue) {
  return PERIOD_OPTIONS.find(p => p.value === periodValue)?.months || FY_MONTHS
}

// ─── Amount override helpers ─────────────────────────────────────────────────
function getEffectiveAmount(baseAmount, overrides = [], monthIndex, year) {
  if (!overrides || overrides.length === 0) return baseAmount
  const applicable = overrides.filter(ov => {
    const ovIdx = MONTHS.indexOf(ov.month)
    return (ov.year < year) || (ov.year === year && ovIdx <= monthIndex)
  })
  if (applicable.length === 0) return baseAmount
  applicable.sort((a, b) => {
    if (a.year !== b.year) return a.year - b.year
    return MONTHS.indexOf(a.month) - MONTHS.indexOf(b.month)
  })
  return applicable[applicable.length - 1].amount
}

// ─── Core helpers ─────────────────────────────────────────────────────────────
function parseUTCDate(dateStr) {
  const d = new Date(dateStr)
  return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
}

// ─── Core Helpers ─────────────────────────────────────────────────────────────
function isMonthActive(emp, monthIndex, year) {
  const monthStart = new Date(year, monthIndex, 1)
  const monthEnd   = new Date(year, monthIndex + 1, 0)
  const start = parseUTCDate(emp.startDate)
  const end   = emp.endDate ? parseUTCDate(emp.endDate) : null
  if (monthEnd < start) return false
  if (end && monthStart > end) return false
  return true
}

// ─── Merge helpers ────────────────────────────────────────────────────────────
function mergeRecurringByName(recurringRecords) {
  const byName = new Map()
  recurringRecords.forEach(rec => {
    const name = (rec.expenseName || rec.name || '?').trim()
    if (!byName.has(name)) byName.set(name, [])
    byName.get(name).push(rec)
  })

  const merged = []
  byName.forEach((records, name) => {
    const sorted = [...records].sort(
      (a, b) => parseUTCDate(a.startDate) - parseUTCDate(b.startDate)
    )
    const earliest = sorted[0]
    const anyOngoing = sorted.some(r => !r.endDate)
    let latestEnd = null
    if (!anyOngoing) {
      latestEnd = sorted.reduce((acc, r) => {
        const e = parseUTCDate(r.endDate)
        return !acc || e > acc ? e : acc
      }, null)
    }

    const allOverrides = sorted.flatMap(r =>
      (r.amountOverrides || []).map(ov => ({ ...ov, _srcId: r._id }))
    )

    // carryForward is stored per date-range record (so it can change when an
    // expense's rate/record changes over time). For the checkbox shown on the
    // merged row, reflect whichever record is active *today*, falling back to
    // the most recent record if nothing is active right now.
    const today = new Date()
    const todaysRecord = sorted.find(r => isMonthActive(r, today.getMonth(), today.getFullYear()))
    const cfSourceRecord = todaysRecord || sorted[sorted.length - 1]

    merged.push({
      _id: `merged::${name}`,
      _merged: true,
      _records: sorted,
      type: 'recurring',
      expenseName: name,
      expenseType: earliest.expenseType,
      category: earliest.category || 'Office',
      amount: earliest.amount,
      startDate: earliest.startDate,
      endDate: latestEnd ? latestEnd.toISOString() : null,
      amountOverrides: allOverrides,
      carryForward: cfSourceRecord.carryForward !== false,
    })
  })

  return merged
}

function resolveRecordForMonth(mergedEmp, monthIndex, year) {
  if (!mergedEmp?._records) return mergedEmp
  return mergedEmp._records.find(r => isMonthActive(r, monthIndex, year)) || null
}

function buildMonthData(emp, year, paidMap = {}, openingCarry = 0) {
  let carry = openingCarry
  const result = {}
  FY_MONTHS.forEach((m) => {
    const i     = MONTHS.indexOf(m)
    const calYr = calYearForFYMonth(year, m)

    const activeRec = emp._merged ? resolveRecordForMonth(emp, i, calYr) : emp
    const active = emp._merged
      ? !!activeRec
      : isMonthActive(emp, i, calYr)

    if (!active) {
      result[m] = { amt: 0, paid: 0, carry: 0, active: false }
      return
    }
    // carryForward defaults to true unless explicitly disabled on the record
    // that is active for this specific month (a merged expense can switch
    // between records with different settings over its lifetime).
    const carryForwardEnabled = activeRec.carryForward !== false

    const baseAmount    = activeRec.amount
    const overrides     = activeRec.amountOverrides
    const baseAmt       = getEffectiveAmount(baseAmount, overrides, i, calYr)
    const paid          = paidMap[m] !== undefined ? paidMap[m] : 0
    // Only pull in the incoming balance from the previous month if THIS
    // record has carry-forward enabled; otherwise this month starts fresh.
    const incomingCarry = carryForwardEnabled ? carry : 0
    const totalDue       = baseAmt + incomingCarry
    const monthEndCarry  = totalDue - paid
    result[m]        = {
      amt: baseAmt,
      paid,
      carry: monthEndCarry,
      active: true,
      _srcId: activeRec._id,
      carryForward: carryForwardEnabled,
    }
    // Propagate the balance to next month only when carry-forward is on for
    // this record — this is what stops the amount from compounding.
    carry = carryForwardEnabled ? monthEndCarry : 0
  })
  return result
}

function buildPaidMapForYear(emp, year) {
  const paidMap = {}
  FY_MONTHS.forEach((m) => {
    const i     = MONTHS.indexOf(m)
    const calYr = calYearForFYMonth(year, m)
    const rec = emp._merged ? resolveRecordForMonth(emp, i, calYr) : emp
    if (!rec) return
    const pay = (rec.payments || []).find(p => p.year === calYr && p.month === m)
    if (pay) paidMap[m] = pay.paid
  })
  return paidMap
}

function recalcEmployee(emp, year, oldData, changedMonth, newPaidValue) {
  const paidMap = {}
  FY_MONTHS.forEach((m) => { paidMap[m] = oldData[m]?.paid })
  paidMap[changedMonth] = newPaidValue
  return buildMonthData(emp, year, paidMap)
}

// Build all years for one emp, chaining closing carry → next year's opening.
function buildChainedYears(emp) {
  const result = {}
  let openingCarry = 0
  getEmployeeYears(emp).forEach(year => {
    const data = buildMonthData(emp, year, buildPaidMapForYear(emp, year), openingCarry)
    result[`${emp._id}_${year}`] = data
    const lastActive = [...FY_MONTHS].reverse().find(m => data[m]?.active)
    openingCarry = lastActive ? (data[lastActive].carry || 0) : openingCarry
  })
  return result
}

function rebuildAllYearsForEmp(emp) {
  return buildChainedYears(emp)
}

function getEmployeeYears(emp) {
  const records = emp._merged ? emp._records : [emp]
  const set = new Set()
  records.forEach(rec => {
    const start = toFYStartYear(parseUTCDate(rec.startDate))
    const end   = rec.endDate ? toFYStartYear(parseUTCDate(rec.endDate)) : toFYStartYear(new Date())
    for (let y = start; y <= Math.max(start, end); y++) set.add(y)
  })
  return Array.from(set).sort((a, b) => a - b)
}

function getAllYears(employees) {
  const set = new Set()
  employees.forEach(emp => getEmployeeYears(emp).forEach(y => set.add(y)))
  return Array.from(set).sort()
}

function groupByExpenseType(expenses) {
  return expenses.reduce((acc, exp) => {
    const key = (exp.expenseType || 'Uncategorised').trim()
    if (!acc[key]) acc[key] = []
    acc[key].push(exp)
    return acc
  }, {})
}

// ─── Period Dropdown ─────────────────────────────────────────────────────────
const PeriodDropdown = memo(function PeriodDropdown({ value, onChange, year }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const selected = PERIOD_OPTIONS.find(p => p.value === value) || PERIOD_OPTIONS[0]

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-block', flexShrink: 0 }}>
      <button
        onClick={(e) => { e.stopPropagation(); setOpen(p => !p) }}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          background: open ? '#f3f4f6' : '#fafafa',
          border: '1px solid #ececec', borderRadius: 9,
          padding: '5px 11px 5px 12px', cursor: 'pointer',
          fontFamily: "'Inter', sans-serif", fontSize: 11.5, fontWeight: 500,
          color: '#4b5563', transition: 'all 0.15s',
          boxShadow: open ? '0 2px 8px rgba(16,24,40,0.08)' : 'none',
          whiteSpace: 'nowrap',
        }}
      >
        <span style={{ fontSize: 11, color: '#9ca3af' }}>📅</span>
        <span style={{ color: '#18181b', fontWeight: 600 }}>{selected.label}</span>
        <span style={{
          fontSize: 8, color: '#9ca3af',
          transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
          transition: 'transform 0.15s', display: 'inline-block',
        }}>▼</span>
      </button>

      {open && (
        <div
          onClick={e => e.stopPropagation()}
          style={{
            position: 'absolute', top: 'calc(100% + 6px)', right: 0, zIndex: 100,
            background: '#ffffff', border: '1px solid #ececec', borderRadius: 12,
            boxShadow: '0 8px 28px rgba(16,24,40,0.12)', overflow: 'hidden',
            minWidth: 160, fontFamily: "'Inter', sans-serif",
          }}
        >
          <div style={{ padding: '8px 14px 6px', borderBottom: '1px solid #f1f1f1', fontSize: 10.5, color: '#9ca3af', letterSpacing: 0.3, fontWeight: 500 }}>
            Filter · {year}
          </div>
          {PERIOD_OPTIONS.map((opt) => {
            const isActive = opt.value === value
            return (
              <div
                key={opt.value}
                onClick={() => { onChange(opt.value); setOpen(false) }}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '8px 14px', cursor: 'pointer',
                  background: isActive ? '#eef2ff' : 'transparent',
                  borderLeft: isActive ? '3px solid #4f46e5' : '3px solid transparent',
                  transition: 'background 0.1s',
                }}
                onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = '#fafafa' }}
                onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent' }}
              >
                <span style={{ fontSize: 12.5, fontWeight: isActive ? 600 : 400, color: isActive ? '#4338ca' : '#374151' }}>
                  {opt.label}
                </span>
                <span style={{ fontSize: 10, color: '#9ca3af', marginLeft: 8 }}>
                  {opt.months[0]}–{opt.months[opt.months.length - 1]}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
})

// ─── Category Filter Dropdown (View Expenses) ────────────────────────────────
const CategoryFilterDropdown = memo(function CategoryFilterDropdown({ value, onChange }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const OPTIONS = [
    { value: 'all',   label: 'All Expenses', icon: '📋' },
    { value: 'Home',   label: 'Home',         icon: '🏠' },
    { value: 'Office', label: 'Office',       icon: '🏢' },
  ]
  const selected = OPTIONS.find(o => o.value === value) || OPTIONS[0]

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-block', flexShrink: 0 }}>
      <button
        onClick={() => setOpen(p => !p)}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 7,
          padding: '9px 18px', borderRadius: 10, border: '1px solid #ececec',
          background: open ? '#f3f4f6' : '#ffffff', color: '#374151',
          fontFamily: "'Inter', sans-serif", fontSize: 13, fontWeight: 500,
          cursor: 'pointer', transition: 'all 0.15s', whiteSpace: 'nowrap',
          boxShadow: open ? '0 3px 12px rgba(16,24,40,0.1)' : 'none',
        }}
      >
        <span style={{ fontSize: 14 }}>{selected.icon}</span>
        {value === 'all' ? 'View Expenses' : selected.label}
        <span style={{ fontSize: 9, color: '#9ca3af', display: 'inline-block', transform: open ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.15s' }}>▼</span>
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 8px)', right: 0, zIndex: 200,
          background: '#ffffff', border: '1px solid #ececec', borderRadius: 14,
          boxShadow: '0 12px 40px rgba(16,24,40,0.16)', overflow: 'hidden',
          minWidth: 190, fontFamily: "'Inter', sans-serif",
        }}>
          <div style={{ padding: '10px 16px 8px', borderBottom: '1px solid #f1f1f1', fontSize: 10.5, color: '#9ca3af', letterSpacing: 0.3, fontWeight: 500 }}>
            Filter by Category
          </div>
          {OPTIONS.map((opt) => {
            const isActive = opt.value === value
            return (
              <div
                key={opt.value}
                onClick={() => { onChange(opt.value); setOpen(false) }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '10px 16px', cursor: 'pointer',
                  background: isActive ? '#eef2ff' : 'transparent',
                  borderLeft: isActive ? '3px solid #4f46e5' : '3px solid transparent',
                }}
                onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = '#fafafa' }}
                onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent' }}
              >
                <span style={{ fontSize: 15 }}>{opt.icon}</span>
                <span style={{ fontSize: 13, fontWeight: isActive ? 600 : 400, color: isActive ? '#4338ca' : '#374151' }}>{opt.label}</span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
})

// ─── Shared sub-components ────────────────────────────────────────────────────
const Avatar = memo(function Avatar({ name = '' }) {
  const palette = ['#4f46e5','#0891b2','#7c3aed','#0d9488','#2563eb','#db2777','#ea580c','#059669']
  const color   = palette[name.charCodeAt(0) % palette.length]
  const initials = name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
  return (
    <div style={{
      width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
      background: color + '18', border: `1.5px solid ${color}40`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: 11, fontWeight: 600, color,
      fontFamily: "'Inter', sans-serif", letterSpacing: 0.3,
    }}>
      {initials}
    </div>
  )
})

const DeleteModal = memo(function DeleteModal({ expense, onConfirm, onCancel, deleting }) {
  const recordCount = expense._merged ? expense._records.length : 1
  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(17,24,39,0.4)', backdropFilter: 'blur(4px)',
      }}
      onClick={onCancel}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: '#ffffff', border: '1px solid #ececec',
          borderRadius: 20, boxShadow: '0 24px 60px rgba(16,24,40,0.22)',
          padding: '32px 32px 24px', maxWidth: 380, width: '90vw',
          fontFamily: "'Inter', sans-serif",
        }}
      >
        <div style={{ width: 52, height: 52, borderRadius: 14, background: '#fef2f2', border: '1px solid #fecaca', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, marginBottom: 16 }}>🗑️</div>
        <div style={{ fontSize: 17, fontWeight: 600, color: '#18181b', marginBottom: 8, letterSpacing: '-0.2px' }}>Delete Expense?</div>
        <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 6, lineHeight: 1.5 }}>You're about to delete:</div>
        <div style={{ background: '#fafafa', border: '1px solid #ececec', borderRadius: 12, padding: '12px 16px', marginBottom: 20 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: '#18181b' }}>{expense.expenseName}</div>
          <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 4 }}>
            {expense.expenseType} &nbsp;·&nbsp;
            <span style={{ color: '#d97706', fontVariantNumeric: 'tabular-nums' }}>{fmt(expense.amount)}</span>
            {expense.type === 'recurring' ? '/mo' : ' one-time'}
          </div>
          {recordCount > 1 && (
            <div style={{ fontSize: 11, color: '#4f46e5', marginTop: 6 }}>
              This name has {recordCount} date-range records — all will be deleted.
            </div>
          )}
        </div>
        <div style={{ fontSize: 12, color: '#dc2626', marginBottom: 22 }}>⚠️ This action cannot be undone. All payment history will be lost.</div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={onCancel} disabled={deleting} style={{ flex: 1, padding: '9px 0', borderRadius: 10, border: '1px solid #ececec', background: '#fff', color: '#4b5563', fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: "'Inter', sans-serif" }}>Cancel</button>
          <button onClick={onConfirm} disabled={deleting} style={{ flex: 1, padding: '9px 0', borderRadius: 10, border: 'none', background: deleting ? '#f87171' : '#dc2626', color: '#fff', fontSize: 13, fontWeight: 500, cursor: deleting ? 'wait' : 'pointer', fontFamily: "'Inter', sans-serif", boxShadow: '0 2px 8px rgba(220,38,38,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
            {deleting ? (<><div style={{ width: 13, height: 13, border: '2px solid rgba(255,255,255,0.4)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />Deleting…</>) : 'Delete'}
          </button>
        </div>
      </div>
    </div>
  )
})

const TrashBtn = memo(function TrashBtn({ onClick }) {
  const [hover, setHover] = useState(false)
  return (
    <button onClick={onClick} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)} title="Delete expense"
      style={{ width: 28, height: 28, borderRadius: 8, flexShrink: 0, border: hover ? '1px solid #fecaca' : '1px solid transparent', background: hover ? '#fef2f2' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontSize: 13, transition: 'all 0.15s', color: hover ? '#dc2626' : '#9ca3af' }}>
      🗑️
    </button>
  )
})

// ─── Edit Icon Button (pencil) ───────────────────────────────────────────────
const EditBtn = memo(function EditBtn({ onClick }) {
  const [hover, setHover] = useState(false)
  return (
    <button onClick={onClick} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)} title="Edit expense"
      style={{ width: 28, height: 28, borderRadius: 8, flexShrink: 0, border: hover ? '1px solid #c7d2fe' : '1px solid transparent', background: hover ? '#eef2ff' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontSize: 12, transition: 'all 0.15s', color: hover ? '#4f46e5' : '#9ca3af' }}>
      ✏️
    </button>
  )
})

// ─── Category Toggle Pill (Home ⇄ Office) ────────────────────────────────────
const CategoryPill = memo(function CategoryPill({ category, onChange, saving }) {
  const cat = category || 'Office'
  const isHome = cat === 'Home'
  const next = isHome ? 'Office' : 'Home'
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onChange(next) }}
      disabled={saving}
      title={`Category: ${cat} — click to switch to ${next}`}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 4,
        padding: '2px 8px', borderRadius: 6, flexShrink: 0,
        border: `1px solid ${isHome ? '#bbf7d0' : '#c7d2fe'}`,
        background: isHome ? '#f0fdf4' : '#eef2ff',
        color: isHome ? '#16a34a' : '#4338ca',
        fontSize: 10, fontWeight: 600, cursor: saving ? 'wait' : 'pointer',
        fontFamily: "'Inter', sans-serif", opacity: saving ? 0.5 : 1,
        transition: 'all 0.15s',
      }}
    >
      {isHome ? '🏠' : '🏢'} {cat}
    </button>
  )
})

// ─── Carry-Forward Icon Button (matches TrashBtn sizing/style) ───────────────
const CarryForwardIconBtn = memo(function CarryForwardIconBtn({ on, onClick, saving }) {
  const [hover, setHover] = useState(false)
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      disabled={saving}
      title={on ? 'Carry-forward is ON — click to turn off' : 'Carry-forward is OFF — click to turn on'}
      style={{
        width: 28, height: 28, borderRadius: 8, flexShrink: 0,
        border: hover ? `1px solid ${on ? '#c7d2fe' : '#ececec'}` : '1px solid transparent',
        background: hover ? (on ? '#eef2ff' : '#f3f4f6') : 'transparent',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        cursor: saving ? 'wait' : 'pointer', fontSize: 13, transition: 'all 0.15s',
        color: on ? '#4f46e5' : '#c5c5c9',
        opacity: saving ? 0.5 : 1,
      }}
    >
      🔁
    </button>
  )
})

// ─── Convert-to-One-Time Icon Button ─────────────────────────────────────────
const ConvertIconBtn = memo(function ConvertIconBtn({ onClick, saving }) {
  const [hover, setHover] = useState(false)
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      disabled={saving}
      title="Convert this recurring expense to a one-time expense"
      style={{
        width: 28, height: 28, borderRadius: 8, flexShrink: 0,
        border: hover ? '1px solid #fde68a' : '1px solid transparent',
        background: hover ? '#fffbeb' : 'transparent',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        cursor: saving ? 'wait' : 'pointer', fontSize: 13, transition: 'all 0.15s',
        color: '#d97706', opacity: saving ? 0.5 : 1,
      }}
    >
      ⚡
    </button>
  )
})

// ─── Carry-Forward Confirm Modal ──────────────────────────────────────────────
const CarryForwardModal = memo(function CarryForwardModal({ emp, currentlyOn, onConfirm, onCancel, saving }) {
  const turningOff = currentlyOn
  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 1050, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(17,24,39,0.4)', backdropFilter: 'blur(4px)' }}
      onClick={onCancel}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: '#ffffff', border: '1px solid #ececec',
          borderRadius: 20, boxShadow: '0 24px 60px rgba(16,24,40,0.22)',
          padding: '32px 32px 24px', maxWidth: 380, width: '90vw',
          fontFamily: "'Inter', sans-serif",
        }}
      >
        <div style={{
          width: 52, height: 52, borderRadius: 14,
          background: turningOff ? '#fff7ed' : '#eef2ff',
          border: `1px solid ${turningOff ? '#fed7aa' : '#e0e7ff'}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, marginBottom: 16,
        }}>
          {turningOff ? '⏸️' : '🔁'}
        </div>
        <div style={{ fontSize: 17, fontWeight: 600, color: '#18181b', marginBottom: 8, letterSpacing: '-0.2px' }}>
          {turningOff ? 'Turn Off Carry-Forward?' : 'Turn On Carry-Forward?'}
        </div>
        <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 12, lineHeight: 1.5 }}>
          {emp.expenseName || emp.name}
        </div>
        <div style={{ background: '#fafafa', border: '1px solid #ececec', borderRadius: 12, padding: '12px 16px', marginBottom: 22, fontSize: 12.5, color: '#6b7280', lineHeight: 1.6 }}>
          {turningOff
            ? "Any unpaid balance for this expense will no longer roll into next month's due amount. Each month will start fresh."
            : "Unpaid balance for this expense will start rolling into next month's due amount again."}
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={onCancel} disabled={saving} style={{ flex: 1, padding: '9px 0', borderRadius: 10, border: '1px solid #ececec', background: '#fff', color: '#4b5563', fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: "'Inter', sans-serif" }}>Cancel</button>
          <button
            onClick={onConfirm}
            disabled={saving}
            style={{
              flex: 1, padding: '9px 0', borderRadius: 10, border: 'none',
              background: saving ? '#c7d2fe' : (turningOff ? '#d97706' : '#4f46e5'),
              color: '#fff', fontSize: 13, fontWeight: 500, cursor: saving ? 'wait' : 'pointer',
              fontFamily: "'Inter', sans-serif", boxShadow: '0 2px 8px rgba(79,70,229,0.2)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            }}
          >
            {saving
              ? (<><div style={{ width: 13, height: 13, border: '2px solid rgba(255,255,255,0.4)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />Saving…</>)
              : (turningOff ? 'Turn Off' : 'Turn On')
            }
          </button>
        </div>
      </div>
    </div>
  )
})

// ─── Convert to One-Time Modal ────────────────────────────────────────────────
const ConvertToOneTimeModal = memo(function ConvertToOneTimeModal({
  emp, defaultAmount, defaultDate, onConfirm, onCancel, saving
}) {
  const [amount, setAmount] = useState(String(defaultAmount || ''))
  const [date, setDate]     = useState(defaultDate || '')
  const inputRef = useRef(null)

  useEffect(() => {
    setTimeout(() => { inputRef.current?.focus(); inputRef.current?.select() }, 30)
  }, [])

  const parsedAmt = parseInt(amount)
  const valid = !isNaN(parsedAmt) && parsedAmt > 0 && !!date

  const recordCount = emp._merged ? emp._records.length : 1

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 1150, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(17,24,39,0.45)', backdropFilter: 'blur(4px)' }}
      onClick={onCancel}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{ background: '#ffffff', border: '1px solid #ececec', borderRadius: 22, boxShadow: '0 24px 60px rgba(16,24,40,0.25)', padding: '30px 30px 24px', maxWidth: 400, width: '92vw', fontFamily: "'Inter', sans-serif" }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, marginBottom: 20 }}>
          <div style={{ width: 46, height: 46, borderRadius: 12, background: '#fffbeb', border: '1px solid #fde68a', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, flexShrink: 0 }}>⚡</div>
          <div>
            <div style={{ fontSize: 16, fontWeight: 600, color: '#18181b', letterSpacing: '-0.2px' }}>
              Convert to One-Time
            </div>
            <div style={{ fontSize: 12, color: '#6b7280', marginTop: 3 }}>
              {emp.expenseName || emp.name}
            </div>
          </div>
        </div>

        <div style={{ background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 12, padding: '10px 14px', marginBottom: 18, fontSize: 11.5, color: '#b45309', lineHeight: 1.6 }}>
          ⚠️ This removes the recurring expense from the recurring table and adds it as a single one-time entry. Payment history, amount overrides, and carry-forward will be cleared.
          {recordCount > 1 && (
            <div style={{ marginTop: 6, color: '#dc2626', fontWeight: 600 }}>
              Note: this name has {recordCount} date-range records. Only the one active for the chosen date will be converted — the others remain recurring.
            </div>
          )}
        </div>

        <div style={{ marginBottom: 14 }}>
          <label style={{ fontSize: 11.5, fontWeight: 500, color: '#6b7280', letterSpacing: 0.2, display: 'block', marginBottom: 6 }}>
            One-time amount
          </label>
          <div style={{ position: 'relative' }}>
            <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#9ca3af', fontVariantNumeric: 'tabular-nums', fontSize: 15, fontWeight: 600 }}>₹</span>
            <input
              ref={inputRef}
              type="number"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              style={{ width: '100%', padding: '11px 12px 11px 28px', border: '1px solid #18181b', borderRadius: 10, background: '#ffffff', fontVariantNumeric: 'tabular-nums', fontSize: 16, fontWeight: 600, color: '#18181b', outline: 'none', boxShadow: '0 0 0 3px rgba(24,24,27,0.06)' }}
            />
          </div>
        </div>

        <div style={{ marginBottom: 20 }}>
          <label style={{ fontSize: 11.5, fontWeight: 500, color: '#6b7280', letterSpacing: 0.2, display: 'block', marginBottom: 6 }}>
            Date
          </label>
          <input
            type="date"
            value={date}
            onChange={e => setDate(e.target.value)}
            style={{ width: '100%', padding: '11px 12px', border: '1px solid #ececec', borderRadius: 10, background: '#ffffff', fontSize: 14, color: '#18181b', outline: 'none', fontFamily: "'Inter', sans-serif" }}
          />
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={onCancel} disabled={saving} style={{ flex: 1, padding: '9px 0', borderRadius: 10, border: '1px solid #ececec', background: '#fff', color: '#4b5563', fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: "'Inter', sans-serif" }}>
            Cancel
          </button>
          <button
            onClick={() => onConfirm(parsedAmt, date)}
            disabled={saving || !valid}
            style={{
              flex: 2, padding: '9px 0', borderRadius: 10, border: 'none',
              background: (saving || !valid) ? '#e5e7eb' : '#d97706',
              color: (saving || !valid) ? '#9ca3af' : '#fff',
              fontSize: 13, fontWeight: 600, cursor: (saving || !valid) ? 'not-allowed' : 'pointer',
              fontFamily: "'Inter', sans-serif", display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            }}
          >
            {saving
              ? <><div style={{ width: 13, height: 13, border: '2px solid rgba(255,255,255,0.4)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />Converting…</>
              : 'Convert to One-Time'
            }
          </button>
        </div>
      </div>
    </div>
  )
})

// ----paysource Modal ----//

const PaySourceModal = memo(function PaySourceModal({ row, onConfirm, onCancel }) {
  const defaultSource = row.category === 'Home' ? 'Home' : 'Office'
  const [source, setSource] = useState(defaultSource)
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1300, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(17,24,39,0.45)', backdropFilter: 'blur(4px)' }} onClick={onCancel}>
      <div onClick={e => e.stopPropagation()} style={{ background: '#fff', border: '1px solid #ececec', borderRadius: 20, boxShadow: '0 24px 60px rgba(16,24,40,0.25)', padding: '28px 28px 22px', maxWidth: 380, width: '92vw', fontFamily: "'Inter', sans-serif" }}>
        <div style={{ fontSize: 16, fontWeight: 600, color: '#18181b', marginBottom: 6 }}>Pay from which pool?</div>
        <div style={{ fontSize: 12.5, color: '#6b7280', marginBottom: 18 }}>{row.name} · {fmt((row.paid || 0) + (row.due || 0))}</div>
        <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
          {['Home', 'Office'].map(pool => (
            <button key={pool} onClick={() => setSource(pool)} style={{ flex: 1, padding: '12px 0', borderRadius: 12, cursor: 'pointer', fontFamily: "'Inter', sans-serif", fontSize: 13, fontWeight: 600, border: '1px solid', borderColor: source === pool ? (pool === 'Home' ? '#16a34a' : '#4f46e5') : '#ececec', background: source === pool ? (pool === 'Home' ? '#f0fdf4' : '#eef2ff') : '#fff', color: source === pool ? (pool === 'Home' ? '#16a34a' : '#4338ca') : '#6b7280' }}>
              {pool === 'Home' ? '🏠 Home' : '🏢 Office'}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={onCancel} style={{ flex: 1, padding: '9px 0', borderRadius: 10, border: '1px solid #ececec', background: '#fff', color: '#4b5563', fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: "'Inter', sans-serif" }}>Cancel</button>
          <button onClick={() => onConfirm(source)} style={{ flex: 2, padding: '9px 0', borderRadius: 10, border: 'none', background: '#18181b', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: "'Inter', sans-serif" }}>Confirm payment</button>
        </div>
      </div>
    </div>
  )
})

// ─── Edit One-Time Modal ──────────────────────────────────────────────────────
const EditOneTimeModal = memo(function EditOneTimeModal({ expense, onSave, onCancel, saving }) {
  const [name, setName]       = useState(expense.expenseName || '')
  const [amount, setAmount]   = useState(String(expense.amount || ''))
  const [expType, setExpType] = useState(expense.expenseType || '')
  const [date, setDate]       = useState(
    expense.date ? parseUTCDate(expense.date).toISOString().slice(0, 10) : ''
  )
  const inputRef = useRef(null)

  useEffect(() => {
    setTimeout(() => { inputRef.current?.focus(); inputRef.current?.select() }, 30)
  }, [])

  const parsedAmt = parseInt(amount)
  const valid = name.trim() && !isNaN(parsedAmt) && parsedAmt > 0 && !!date

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 1200, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(17,24,39,0.45)', backdropFilter: 'blur(4px)' }}
      onClick={onCancel}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{ background: '#ffffff', border: '1px solid #ececec', borderRadius: 22, boxShadow: '0 24px 60px rgba(16,24,40,0.25)', padding: '30px 30px 24px', maxWidth: 420, width: '92vw', fontFamily: "'Inter', sans-serif" }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, marginBottom: 20 }}>
          <div style={{ width: 46, height: 46, borderRadius: 12, background: '#fffbeb', border: '1px solid #fde68a', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, flexShrink: 0 }}>✏️</div>
          <div>
            <div style={{ fontSize: 16, fontWeight: 600, color: '#18181b', letterSpacing: '-0.2px' }}>Edit One-Time Expense</div>
            <div style={{ fontSize: 12, color: '#6b7280', marginTop: 3 }}>Update the details below</div>
          </div>
        </div>

        <div style={{ marginBottom: 14 }}>
          <label style={{ fontSize: 11.5, fontWeight: 500, color: '#6b7280', letterSpacing: 0.2, display: 'block', marginBottom: 6 }}>Expense name</label>
          <input
            ref={inputRef}
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            style={{ width: '100%', padding: '11px 12px', border: '1px solid #18181b', borderRadius: 10, background: '#ffffff', fontSize: 14, fontWeight: 500, color: '#18181b', outline: 'none', boxShadow: '0 0 0 3px rgba(24,24,27,0.06)', fontFamily: "'Inter', sans-serif" }}
          />
        </div>

        <div style={{ marginBottom: 14 }}>
          <label style={{ fontSize: 11.5, fontWeight: 500, color: '#6b7280', letterSpacing: 0.2, display: 'block', marginBottom: 6 }}>Expense type</label>
          <input
            type="text"
            value={expType}
            onChange={e => setExpType(e.target.value)}
            placeholder="e.g. Travel, Software"
            style={{ width: '100%', padding: '11px 12px', border: '1px solid #ececec', borderRadius: 10, background: '#ffffff', fontSize: 14, color: '#18181b', outline: 'none', fontFamily: "'Inter', sans-serif" }}
          />
        </div>

        <div style={{ marginBottom: 14 }}>
          <label style={{ fontSize: 11.5, fontWeight: 500, color: '#6b7280', letterSpacing: 0.2, display: 'block', marginBottom: 6 }}>Amount</label>
          <div style={{ position: 'relative' }}>
            <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#9ca3af', fontVariantNumeric: 'tabular-nums', fontSize: 15, fontWeight: 600 }}>₹</span>
            <input
              type="number"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              style={{ width: '100%', padding: '11px 12px 11px 28px', border: '1px solid #18181b', borderRadius: 10, background: '#ffffff', fontVariantNumeric: 'tabular-nums', fontSize: 16, fontWeight: 600, color: '#18181b', outline: 'none', boxShadow: '0 0 0 3px rgba(24,24,27,0.06)' }}
            />
          </div>
        </div>

        <div style={{ marginBottom: 20 }}>
          <label style={{ fontSize: 11.5, fontWeight: 500, color: '#6b7280', letterSpacing: 0.2, display: 'block', marginBottom: 6 }}>Date</label>
          <input
            type="date"
            value={date}
            onChange={e => setDate(e.target.value)}
            style={{ width: '100%', padding: '11px 12px', border: '1px solid #ececec', borderRadius: 10, background: '#ffffff', fontSize: 14, color: '#18181b', outline: 'none', fontFamily: "'Inter', sans-serif" }}
          />
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={onCancel} disabled={saving} style={{ flex: 1, padding: '9px 0', borderRadius: 10, border: '1px solid #ececec', background: '#fff', color: '#4b5563', fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: "'Inter', sans-serif" }}>Cancel</button>
          <button
            onClick={() => onSave({ expenseName: name.trim(), amount: parsedAmt, expenseType: expType.trim(), date })}
            disabled={saving || !valid}
            style={{
              flex: 2, padding: '9px 0', borderRadius: 10, border: 'none',
              background: (saving || !valid) ? '#e5e7eb' : '#18181b',
              color: (saving || !valid) ? '#9ca3af' : '#fff',
              fontSize: 13, fontWeight: 600, cursor: (saving || !valid) ? 'not-allowed' : 'pointer',
              fontFamily: "'Inter', sans-serif", display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            }}
          >
            {saving
              ? <><div style={{ width: 13, height: 13, border: '2px solid rgba(255,255,255,0.4)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />Saving…</>
              : 'Save Changes'
            }
          </button>
        </div>
      </div>
    </div>
  )
})

// ─── Amount Override Modal ────────────────────────────────────────────────────
const AmountOverrideModal = memo(function AmountOverrideModal({
  emp, month, year, currentAmt, existingOverride, onSave, onRemove, onCancel, saving
}) {
  const [val, setVal] = useState(String(existingOverride ? existingOverride.amount : currentAmt))
  const inputRef = useRef(null)

  useEffect(() => {
    setTimeout(() => { inputRef.current?.focus(); inputRef.current?.select() }, 30)
  }, [])

  const handleSave = () => {
    const parsed = parseInt(val)
    if (isNaN(parsed) || parsed <= 0) return
    onSave(parsed)
  }

  const monthIdx   = FY_MONTHS.indexOf(month)
  const initialVal = existingOverride ? existingOverride.amount : currentAmt
  const noChange = parseInt(val) === initialVal

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(17,24,39,0.45)', backdropFilter: 'blur(4px)' }}
      onClick={onCancel}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{ background: '#ffffff', border: '1px solid #ececec', borderRadius: 22, boxShadow: '0 24px 60px rgba(16,24,40,0.25)', padding: '30px 30px 24px', maxWidth: 400, width: '92vw', fontFamily: "'Inter', sans-serif" }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, marginBottom: 20 }}>
          <div style={{ width: 46, height: 46, borderRadius: 12, background: '#eef2ff', border: '1px solid #e0e7ff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, flexShrink: 0 }}>✏️</div>
          <div>
            <div style={{ fontSize: 16, fontWeight: 600, color: '#18181b', letterSpacing: '-0.2px' }}>
              Change Amount from {month} {fyLabel(year)}
            </div>
            <div style={{ fontSize: 12, color: '#6b7280', marginTop: 3 }}>
              {emp.expenseName || emp.name}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, marginBottom: 18, flexWrap: 'wrap' }}>
          <div style={{ background: '#fafafa', border: '1px solid #ececec', borderRadius: 8, padding: '5px 12px', fontSize: 11, color: '#6b7280' }}>
            Base: <span style={{ fontVariantNumeric: 'tabular-nums', color: '#d97706', fontWeight: 600 }}>{fmt(emp.amount)}/mo</span>
          </div>
          <div style={{ background: '#fafafa', border: '1px solid #ececec', borderRadius: 8, padding: '5px 12px', fontSize: 11, color: '#6b7280' }}>
            Current: <span style={{ fontVariantNumeric: 'tabular-nums', color: '#4f46e5', fontWeight: 600 }}>{fmt(currentAmt)}/mo</span>
          </div>
        </div>

        <div style={{ marginBottom: 14 }}>
          <label style={{ fontSize: 11.5, fontWeight: 500, color: '#6b7280', letterSpacing: 0.2, display: 'block', marginBottom: 6 }}>
            New monthly amount from {month} {fyLabel(year)}
          </label>
          <div style={{ position: 'relative' }}>
            <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#9ca3af', fontVariantNumeric: 'tabular-nums', fontSize: 15, fontWeight: 600 }}>₹</span>
            <input
              ref={inputRef}
              type="number"
              value={val}
              onChange={e => setVal(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') onCancel() }}
              style={{ width: '100%', padding: '11px 12px 11px 28px', border: '1px solid #18181b', borderRadius: 10, background: '#ffffff', fontVariantNumeric: 'tabular-nums', fontSize: 16, fontWeight: 600, color: '#18181b', outline: 'none', boxShadow: '0 0 0 3px rgba(24,24,27,0.06)' }}
            />
          </div>
        </div>

        <div style={{ background: '#fafafa', border: '1px solid #ececec', borderRadius: 12, padding: '10px 14px', marginBottom: 20, fontSize: 11.5, color: '#6b7280', lineHeight: 1.7 }}>
          <div style={{ fontWeight: 600, color: '#374151', marginBottom: 4 }}>Impact preview</div>
          <div>
            {month} – Mar {fyLabel(year)}: &nbsp;
            <span style={{ fontVariantNumeric: 'tabular-nums', color: '#d97706', fontWeight: 600 }}>
              {parseInt(val) > 0 ? fmt(parseInt(val)) : '—'}/mo
            </span>
          </div>
          <div style={{ color: '#9ca3af', fontSize: 10.5, marginTop: 2 }}>
            Apr – {FY_MONTHS[monthIdx > 0 ? monthIdx - 1 : 0]} {fyLabel(year)}: &nbsp;
            <span style={{ fontVariantNumeric: 'tabular-nums' }}>{fmt(currentAmt)}/mo (unchanged)</span>
          </div>
          <div style={{ color: '#9ca3af', fontSize: 10.5, marginTop: 1 }}>
            Carry-forward recalculated from {month} {fyLabel(year)} onwards
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button onClick={onCancel} style={{ flex: 1, minWidth: 80, padding: '9px 0', borderRadius: 10, border: '1px solid #ececec', background: '#fff', color: '#4b5563', fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: "'Inter', sans-serif" }}>
            Cancel
          </button>
          {existingOverride && (
            <button
              onClick={onRemove}
              disabled={saving}
              style={{ flex: 1, minWidth: 80, padding: '9px 0', borderRadius: 10, border: '1px solid #fecaca', background: '#fef2f2', color: '#dc2626', fontSize: 13, fontWeight: 500, cursor: saving ? 'wait' : 'pointer', fontFamily: "'Inter', sans-serif" }}
            >
              Remove Override
            </button>
          )}
          <button
            onClick={handleSave}
            disabled={saving || !val || parseInt(val) <= 0}
            style={{
              flex: 2, minWidth: 120, padding: '9px 0', borderRadius: 10, border: 'none',
              background: (saving || !val || parseInt(val) <= 0) ? '#e5e7eb' : '#18181b',
              color: (saving || !val || parseInt(val) <= 0) ? '#9ca3af' : '#fff',
              fontSize: 13, fontWeight: 600, cursor: (saving || !val || parseInt(val) <= 0) ? 'not-allowed' : 'pointer',
              fontFamily: "'Inter', sans-serif", display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              transition: 'all 0.15s',
            }}
          >
            {saving
              ? <><div style={{ width: 13, height: 13, border: '2px solid rgba(255,255,255,0.4)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />Saving…</>
              : `Apply from ${month}`
            }
          </button>
        </div>

        {noChange && !saving && (
          <div style={{ marginTop: 10, fontSize: 11, color: '#9ca3af', textAlign: 'center' }}>
            No change from the current amount for this month.
          </div>
        )}
      </div>
    </div>
  )
})

// ─── One-Time table (period-aware) ────────────────────────────────────────────
const OneTimeExpensesTable = memo(function OneTimeExpensesTable({ expenses, onDeleteRequest, onEditRequest, activePeriodMonths, onCategoryChange, savingCategoryId }) {
  const filtered = useMemo(() => {
    const base = !activePeriodMonths
      ? expenses
      : expenses.filter(exp => {
          const d = parseUTCDate(exp.date)
          const mName = MONTHS[d.getMonth()]
          return activePeriodMonths.includes(mName)
        })
    return [...base].sort(
      (a, b) => parseUTCDate(a.date).getTime() - parseUTCDate(b.date).getTime()
    )
  }, [expenses, activePeriodMonths])

  if (!filtered || filtered.length === 0) return null
  const total = filtered.reduce((s, e) => s + e.amount, 0)

  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 7, background: '#fffbeb', color: '#b45309', border: '1px solid #fde68a', padding: '4px 12px', borderRadius: 20, fontSize: 10.5, fontWeight: 600, letterSpacing: 0.3, marginBottom: 10, fontFamily: "'Inter', sans-serif" }}>
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#d97706', display: 'inline-block' }} />
        One-Time
      </div>
      <div style={{ overflowX: 'auto', borderRadius: 14, border: '1px solid #ececec', background: '#ffffff', boxShadow: '0 1px 3px rgba(16,24,40,0.04)' }}>
        <table style={{ borderCollapse: 'collapse', width: '100%', whiteSpace: 'nowrap' }}>
          <thead>
            <tr>
              {['#', 'Expense Name', 'Amount', 'Date', ''].map((h, i) => (
                <th key={i} style={{ background: '#fafafa', color: '#9ca3af', padding: '11px 16px', textAlign: i === 2 ? 'right' : 'left', fontSize: 10.5, fontWeight: 500, letterSpacing: 0.3, borderBottom: '1px solid #f1f1f1', borderRight: i < 4 ? '1px solid #f4f4f5' : 'none', fontFamily: "'Inter', sans-serif", width: i === 4 ? 140 : undefined }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((exp, idx) => (
              <tr key={exp._id} onMouseEnter={e => e.currentTarget.style.background = '#fafafa'} onMouseLeave={e => e.currentTarget.style.background = ''}>
                <td style={{ padding: '12px 16px', borderBottom: '1px solid #f4f4f5', fontSize: 11.5, color: '#c5c5c9', fontVariantNumeric: 'tabular-nums', width: 40, borderRight: '1px solid #f4f4f5' }}>{idx + 1}</td>
                <td style={{ padding: '12px 16px', borderBottom: '1px solid #f4f4f5', fontSize: 13.5, fontWeight: 500, color: '#18181b', borderRight: '1px solid #f4f4f5', fontFamily: "'Inter', sans-serif" }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ width: 26, height: 26, borderRadius: 8, background: '#fffbeb', border: '1px solid #fde68a', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, flexShrink: 0 }}>⚡</span>
                    {exp.expenseName}
                  </div>
                </td>
                <td style={{ padding: '12px 16px', borderBottom: '1px solid #f4f4f5', textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontSize: 13.5, fontWeight: 600, color: '#d97706', background: '#fffdf7', borderRight: '1px solid #f4f4f5' }}>{fmt(exp.amount)}</td>
                <td style={{ padding: '12px 16px', borderBottom: '1px solid #f4f4f5', fontSize: 12.5, color: '#6b7280', borderRight: '1px solid #f4f4f5', fontFamily: "'Inter', sans-serif" }}>
                  {parseUTCDate(exp.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                </td>
                <td style={{ padding: '8px 10px', borderBottom: '1px solid #f4f4f5', textAlign: 'center', width: 140 }}>
                  <div style={{ display: 'flex', gap: 4, justifyContent: 'center', alignItems: 'center' }}>
                    {onCategoryChange && (
                      <CategoryPill
                        category={exp.category}
                        saving={savingCategoryId === exp._id}
                        onChange={(next) => onCategoryChange(exp, next)}
                      />
                    )}
                    {onEditRequest && <EditBtn onClick={() => onEditRequest(exp)} />}
                    <TrashBtn onClick={() => onDeleteRequest(exp)} />
                  </div>
                </td>
              </tr>
            ))}
            <tr>
              <td colSpan={2} style={{ padding: '11px 16px', background: '#fafafa', fontSize: 10.5, fontWeight: 600, color: '#6b7280', letterSpacing: 0.3, borderTop: '1px solid #ececec', fontFamily: "'Inter', sans-serif" }}>
                Total ({filtered.length} expense{filtered.length !== 1 ? 's' : ''})
              </td>
              <td style={{ padding: '11px 16px', background: '#fffbeb', textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontSize: 13, fontWeight: 700, color: '#b45309', borderTop: '1px solid #ececec' }}>{fmt(total)}</td>
              <td colSpan={2} style={{ background: '#fafafa', borderTop: '1px solid #ececec' }} />
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
})

const RecurringYearTable = memo(function RecurringYearTable({
  year, activeEmps, monthData, editing, editVal, inputRef,
  setEditVal, handleEditStart, handleEditCommit, setEditing, savingCell,
  onDeleteRequest, onAmountOverrideRequest,
  onCarryForwardRequest, savingCarryForwardId,
  onConvertRequest, savingConvertId,
  onCategoryChange, savingCategoryId
}) {
  const [period, setPeriod] = useState('full')
  const [amtEditMode, setAmtEditMode] = useState(false)
  const visibleMonths = useMemo(() => getMonthsForPeriod(period), [period])

  const empTotals = useMemo(() => {
    const map = {}
    activeEmps.forEach(emp => {
      const data = monthData[`${emp._id}_${year}`] || {}
      const totalPaid = visibleMonths.reduce((s, m) => s + (data[m]?.paid || 0), 0)
      const totalAmt  = visibleMonths.reduce((s, m) => {
        const c = data[m]
        if (!c || !c.active) return s
        const covered = c.paid === 0 && c.carry <= 0   // blank, prepaid
        return covered ? s : s + (c.amt || 0)
      }, 0)
      const lastActiveMonth = [...visibleMonths].reverse().find(m => data[m]?.active)
      const endCarry = lastActiveMonth ? (data[lastActiveMonth]?.carry || 0) : 0
      map[emp._id] = { paid: totalPaid, amt: totalAmt, due: Math.max(0, endCarry) }
    })
    return map
  }, [activeEmps, monthData, year, visibleMonths])

  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, gap: 10, flexWrap: 'wrap' }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 7, background: '#eef2ff', color: '#4338ca', border: '1px solid #e0e7ff', padding: '4px 12px', borderRadius: 20, fontSize: 10.5, fontWeight: 600, letterSpacing: 0.3, fontFamily: "'Inter', sans-serif" }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#4f46e5', display: 'inline-block' }} />
          {fyLabel(year)} · Recurring
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button
            onClick={() => setAmtEditMode(p => !p)}
            title="Toggle per-month amount editing"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '5px 12px', borderRadius: 9, cursor: 'pointer',
              border: '1px solid',
              borderColor: amtEditMode ? '#4f46e5' : '#ececec',
              background: amtEditMode ? '#eef2ff' : '#fafafa',
              color: amtEditMode ? '#4338ca' : '#6b7280',
              fontSize: 11.5, fontWeight: amtEditMode ? 600 : 500,
              fontFamily: "'Inter', sans-serif",
              transition: 'all 0.15s',
            }}
          >
            <span style={{ fontSize: 12 }}>✏️</span>
            {amtEditMode ? 'Done editing amounts' : 'Edit amounts'}
          </button>
          <PeriodDropdown value={period} onChange={setPeriod} year={fyLabel(year)} />
        </div>
      </div>

      {amtEditMode && (
        <div style={{ marginBottom: 10, background: '#eef2ff', border: '1px solid #e0e7ff', borderRadius: 10, padding: '8px 14px', fontSize: 11.5, color: '#4338ca', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 14 }}>💡</span>
          <span>Click any <strong>Amt</strong> cell to change the monthly amount from that month onwards. Carry-forward will recalculate automatically.</span>
          <span style={{ color: '#b45309' }}>&nbsp;·&nbsp; Use the <strong>⚡</strong> button on a row to convert it into a one-time expense.</span>
        </div>
      )}

      <div className="emp-table-scroll">
        <table className="emp-table">
          <thead>
            <tr>
              <th className="col-name head" rowSpan={2} style={{ padding: '11px 16px', textAlign: 'left', fontSize: 10.5, fontWeight: 500, color: '#9ca3af', letterSpacing: 0.3, borderBottom: '1px solid #ececec', background: '#fafafa', fontFamily: "'Inter', sans-serif" }}>
                Expense
              </th>
              {visibleMonths.map((m) => {
                const anyActive = activeEmps.some(emp => {
                  const data = monthData[`${emp._id}_${year}`] || {}
                  return data[m]?.active
                })
                return (
                  <th key={m} colSpan={2} className={`th-month${!anyActive ? ' inactive-head' : ''}`}>{m}</th>
                )
              })}
              <th colSpan={2} style={{ background: '#eef2ff', color: '#4338ca', textAlign: 'center', fontSize: 10.5, fontWeight: 600, letterSpacing: 0.3, padding: '11px 8px', borderBottom: '1px solid #ececec', fontFamily: "'Inter', sans-serif" }}>
                Total
              </th>
              <th rowSpan={2} style={{ background: '#fafafa', padding: '11px 10px', borderBottom: '1px solid #ececec', width: 48, borderLeft: '1px solid #f4f4f5' }} />
            </tr>
            <tr>
              {visibleMonths.map((m) => (
                <React.Fragment key={m}>
                  <th className={`th-sub amt${amtEditMode ? ' amt-edit-mode' : ''}`}>Amt</th>
                  <th className="th-sub paid">Paid</th>
                </React.Fragment>
              ))}
              <th className="th-total" style={{ borderRight: '1px solid #f4f4f5' }}>Paid</th>
              <th className="th-total" style={{ color: '#9ca3af', background: '#fafafa' }}>Due</th>
            </tr>
          </thead>

          <tbody>
            {activeEmps.map((emp) => {
              const key  = `${emp._id}_${year}`
              const data = monthData[key] || {}
              const cfChecked = emp.carryForward !== false
              const cfSaving  = savingCarryForwardId === emp._id

              return (
                <tr key={emp._id} className="data-row">
                  <td className="col-name td-emp">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Avatar name={emp.expenseName || emp.name || '?'} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div
                          title={emp.expenseName || emp.name}
                          style={{
                            fontSize: 13, fontWeight: 500, color: '#18181b', fontFamily: "'Inter', sans-serif",
                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                          }}
                        >
                          {emp.expenseName || emp.name}
                        </div>
                        <div style={{ fontSize: 10.5, color: '#9ca3af', marginTop: 2, fontFamily: "'Inter', sans-serif", overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          <span style={{ color: '#d97706', fontVariantNumeric: 'tabular-nums' }}>{fmt(emp.amount)}/mo base</span>
                          {emp.amountOverrides?.length > 0 && (
                            <span style={{
                              display: 'inline-flex', alignItems: 'center', gap: 3, marginLeft: 6,
                              background: '#eef2ff', border: '1px solid #e0e7ff', color: '#4338ca',
                              borderRadius: 4, padding: '1px 5px', fontSize: 9, fontWeight: 600,
                              fontFamily: "'Inter', sans-serif", verticalAlign: 'middle',
                            }}>
                              ✏️ {emp.amountOverrides.length}
                            </span>
                          )}
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0 }}>
                        {amtEditMode && onCategoryChange && (
                          <CategoryPill
                            category={emp.category}
                            saving={savingCategoryId === emp._id}
                            onChange={(next) => onCategoryChange(emp, next)}
                          />
                        )}
                        {amtEditMode && onConvertRequest && (
                          <ConvertIconBtn
                            saving={savingConvertId === emp._id}
                            onClick={() => onConvertRequest(emp)}
                          />
                        )}
                        {amtEditMode && onCarryForwardRequest && (
                          <CarryForwardIconBtn
                            on={cfChecked}
                            saving={cfSaving}
                            onClick={() => onCarryForwardRequest(emp)}
                          />
                        )}
                        <TrashBtn onClick={() => onDeleteRequest(emp)} />
                      </div>
                    </div>
                  </td>

                  {visibleMonths.map((m) => {
                    const cell      = data[m]
                    const isEditing = editing?.empId === emp._id && editing?.month === m && editing?.year === year
                    const isSaving  = savingCell?.empId === emp._id && savingCell?.month === m && savingCell?.year === year

                    const calYr = calYearForFYMonth(year, m)
                    const hasOverrideHere = !!(cell?._srcId) && emp.amountOverrides?.some(
                      ov => ov.year === calYr && ov.month === m && ov._srcId === cell._srcId
                    )

                    if (!cell || !cell.active) {
                      return <React.Fragment key={m}><td className="td-inactive" colSpan={2}>—</td></React.Fragment>
                    }

                    const hasCarry  = cell.carry > 0
                    const hasCredit = cell.carry < 0
                    // Covered = no payment made this month, yet prior credit fully
                    // absorbed what was due (ending balance is zero or still credit).
                    const isCovered = cell.paid === 0 && cell.carry <= 0

                    // Fully prepaid months are hidden entirely — rendered blank
                    // like an inactive month, since nothing is owed or paid here.
                    if (isCovered) {
                      return <React.Fragment key={m}><td className="td-inactive" colSpan={2}>—</td></React.Fragment>
                    }

                    return (
                      <React.Fragment key={m}>
                        <td
                          className={`td-amt${amtEditMode ? ' td-amt-editable' : ''}${hasOverrideHere ? ' td-amt-overridden' : ''}`}
                          onClick={() => {
                            if (!amtEditMode) return
                            onAmountOverrideRequest(emp, m, year, cell.amt)
                          }}
                          title={amtEditMode ? `Click to change amount from ${m} ${fyLabel(year)}` : undefined}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 4 }}>
                            {hasOverrideHere && (
                              <span title="Amount overridden this month" style={{ fontSize: 9, color: '#4f46e5', lineHeight: 1 }}>●</span>
                            )}
                            {amtEditMode && (
                              <span style={{ fontSize: 10, color: '#c5c5c9', marginRight: 2 }}>✏️</span>
                            )}
                            <span>{fmt(cell.amt)}</span>
                          </div>
                          {cell.carryForward !== false && hasCarry  && <div style={{ fontSize: 10, color: '#d97706', marginTop: 2 }}>carry: {fmt(cell.carry)} →</div>}
                          {cell.carryForward !== false && hasCredit && <div style={{ fontSize: 10, color: '#16a34a', marginTop: 2 }}>credit: {fmt(Math.abs(cell.carry))} →</div>}
                        </td>
                        <td
                          className={`td-paid${(hasCarry && cell.carryForward !== false) ? ' has-carry' : ''}${isSaving ? ' saving' : ''}`}
                          onClick={() => !isEditing && !isSaving && handleEditStart(emp._id, m, year, cell.paid)}
                          title={isSaving ? 'Saving...' : 'Click to edit paid amount'}
                        >
                          {isEditing ? (
                            <input ref={inputRef} className="edit-inp" value={editVal}
                              onChange={(e) => setEditVal(e.target.value)}
                              onBlur={handleEditCommit}
                              onKeyDown={(e) => { if (e.key === 'Enter') handleEditCommit(); if (e.key === 'Escape') setEditing(null) }}
                            />
                          ) : (
                            <div>
                              <div>{fmt(cell.paid)}</div>
                              {isSaving  && <span className="saving-badge">saving…</span>}
                              {!isSaving && cell.carryForward !== false && hasCarry  && <span className="carry-badge">+{fmt(cell.carry)}</span>}
                              {!isSaving && cell.carryForward !== false && hasCredit && <span className="credit-badge">-{fmt(Math.abs(cell.carry))}</span>}
                            </div>
                          )}
                        </td>
                      </React.Fragment>
                    )
                  })}

                  <td className="td-total-paid">{fmt(empTotals[emp._id]?.paid || 0)}</td>
                  <td className="td-total-amt">{fmt(empTotals[emp._id]?.due || 0)}</td>
                  <td style={{ borderBottom: '1px solid #f4f4f5', borderLeft: '1px solid #f4f4f5' }} />
                </tr>
              )
            })}

            <tr className="footer-row">
              <td className="col-name" style={{ padding: '11px 16px', fontSize: 10.5, fontWeight: 600, color: '#6b7280', letterSpacing: 0.3, borderTop: '1px solid #ececec', background: '#fafafa', textAlign: 'left', fontFamily: "'Inter', sans-serif" }}>
                Grand Total
              </td>
              {visibleMonths.map((m) => {
                const tAmt  = activeEmps.reduce((s, e) => {
                  const c = monthData[`${e._id}_${year}`]?.[m]
                  if (!c || !c.active) return s
                  const covered = c.paid === 0 && c.carry <= 0   // blank, prepaid
                  return covered ? s : s + (c.amt || 0)
                }, 0)
                const tPaid = activeEmps.reduce((s, e) => s + (monthData[`${e._id}_${year}`]?.[m]?.paid || 0), 0)
                return (
                  <React.Fragment key={m}>
                    <td style={{ color: '#d97706', fontVariantNumeric: 'tabular-nums' }}>{fmt(tAmt)}</td>
                    <td style={{ color: '#16a34a', borderRight: '1px solid #ececec', fontVariantNumeric: 'tabular-nums' }}>{fmt(tPaid)}</td>
                  </React.Fragment>
                )
              })}
              <td style={{ color: '#16a34a', fontWeight: 700, background: '#f0fdf4', fontVariantNumeric: 'tabular-nums' }}>
                {fmt(activeEmps.reduce((s, e) => s + (empTotals[e._id]?.paid || 0), 0))}
              </td>
              <td style={{ color: '#9ca3af', background: '#fafafa', fontVariantNumeric: 'tabular-nums' }}>
                {fmt(activeEmps.reduce((s, e) => s + (empTotals[e._id]?.due || 0), 0))}
              </td>
              <td style={{ background: '#fafafa', borderTop: '1px solid #ececec', borderLeft: '1px solid #f4f4f5' }} />
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
})

// ─── Expense Type Group ───────────────────────────────────────────────────────
const ExpenseTypeGroup = memo(function ExpenseTypeGroup({
  typeName, recurringEmps, oneTimeEmps, monthData, editing, editVal, inputRef,
  setEditVal, handleEditStart, handleEditCommit, setEditing, savingCell,
  onDeleteRequest, onAmountOverrideRequest,
  onCarryForwardRequest, savingCarryForwardId,
  onConvertRequest, savingConvertId,
  onEditRequest,
  onCategoryChange, savingCategoryId,
  defaultOpen = true
}) {
  const [open, setOpen] = useState(defaultOpen)
  const [oneTimePeriod, setOneTimePeriod] = useState('full')
  const oneTimePeriodMonths = useMemo(() => getMonthsForPeriod(oneTimePeriod), [oneTimePeriod])

  const allYears       = useMemo(() => getAllYears(recurringEmps), [recurringEmps])
  const recurringTotal = useMemo(() => recurringEmps.reduce((s, e) => s + e.amount, 0), [recurringEmps])
  const oneTimeTotal   = useMemo(() => oneTimeEmps.reduce((s, e) => s + e.amount, 0), [oneTimeEmps])
  const totalCount     = recurringEmps.length + oneTimeEmps.length

  return (
    <div style={{ marginBottom: 24, borderRadius: 16, border: '1px solid #ececec', overflow: 'hidden', boxShadow: '0 1px 3px rgba(16,24,40,0.04)' }}>
      <div onClick={() => setOpen(p => !p)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 22px', background: '#fafafa', borderBottom: open ? '1px solid #ececec' : 'none', cursor: 'pointer', userSelect: 'none' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 38, height: 38, borderRadius: 10, background: '#eef2ff', border: '1px solid #e0e7ff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, flexShrink: 0 }}>🗂️</div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 600, color: '#18181b', letterSpacing: '-0.2px' }}>{typeName}</div>
            <div style={{ fontSize: 11.5, color: '#6b7280', marginTop: 2, fontFamily: "'Inter', sans-serif" }}>
              {totalCount} expense{totalCount !== 1 ? 's' : ''}
              {recurringEmps.length > 0 && <span> &nbsp;·&nbsp; <span style={{ color: '#d97706' }}>{fmt(recurringTotal)}/mo recurring</span></span>}
              {oneTimeEmps.length > 0  && <span> &nbsp;·&nbsp; <span style={{ color: '#b45309' }}>{fmt(oneTimeTotal)} one-time</span></span>}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {recurringEmps.length > 0 && <div style={{ background: '#eef2ff', border: '1px solid #e0e7ff', color: '#4338ca', padding: '3px 11px', borderRadius: 20, fontSize: 11, fontWeight: 500, fontFamily: "'Inter', sans-serif" }}>🔁 {recurringEmps.length} Recurring</div>}
          {oneTimeEmps.length  > 0 && <div style={{ background: '#fffbeb', border: '1px solid #fde68a', color: '#b45309', padding: '3px 11px', borderRadius: 20, fontSize: 11, fontWeight: 500, fontFamily: "'Inter', sans-serif" }}>⚡ {oneTimeEmps.length} One-Time</div>}
          <span style={{ color: '#9ca3af', fontSize: 11, transition: 'transform 0.2s', display: 'inline-block', transform: open ? 'rotate(0deg)' : 'rotate(-90deg)' }}>▼</span>
        </div>
      </div>

      {open && (
        <div style={{ padding: '22px', background: '#ffffff' }}>
          {recurringEmps.length > 0 && allYears.map(year => {
            const activeEmps = recurringEmps.filter(emp => getEmployeeYears(emp).includes(year))
            if (activeEmps.length === 0) return null
            return (
              <RecurringYearTable
                key={year} year={year} activeEmps={activeEmps} monthData={monthData}
                editing={editing} editVal={editVal} inputRef={inputRef}
                setEditVal={setEditVal} handleEditStart={handleEditStart}
                handleEditCommit={handleEditCommit} setEditing={setEditing}
                savingCell={savingCell} onDeleteRequest={onDeleteRequest}
                onAmountOverrideRequest={onAmountOverrideRequest}
                onCarryForwardRequest={onCarryForwardRequest}
                savingCarryForwardId={savingCarryForwardId}
                onConvertRequest={onConvertRequest}
                savingConvertId={savingConvertId}
                onCategoryChange={onCategoryChange}
                savingCategoryId={savingCategoryId}
              />
            )
          })}

          {oneTimeEmps.length > 0 && (
            <div style={{ marginBottom: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, gap: 10 }}>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 7, background: '#fffbeb', color: '#b45309', border: '1px solid #fde68a', padding: '4px 12px', borderRadius: 20, fontSize: 10.5, fontWeight: 600, letterSpacing: 0.3, fontFamily: "'Inter', sans-serif" }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#d97706', display: 'inline-block' }} />
                  One-Time · Filter
                </div>
                <PeriodDropdown value={oneTimePeriod} onChange={setOneTimePeriod} year="All" />
              </div>
              <OneTimeExpensesTable
                expenses={oneTimeEmps}
                onDeleteRequest={onDeleteRequest}
                onEditRequest={onEditRequest}
                activePeriodMonths={oneTimePeriod === 'full' ? null : oneTimePeriodMonths}
                onCategoryChange={onCategoryChange}
                savingCategoryId={savingCategoryId}
              />
            </div>
          )}

          {recurringEmps.length === 0 && oneTimeEmps.length === 0 && (
            <p style={{ color: '#9ca3af', fontSize: 13, textAlign: 'center', padding: '20px 0', fontFamily: "'Inter', sans-serif" }}>No expenses in this group.</p>
          )}
        </div>
      )}
    </div>
  )
})

// ─── Month Picker Dropdown ────────────────────────────────────────────────────
const MONTH_FULL = ['January','February','March','April','May','June','July','August','September','October','November','December']
const FY_MONTH_INDICES = FY_MONTHS.map(m => MONTHS.indexOf(m))

const MonthPickerDropdown = memo(function MonthPickerDropdown({ onSelect }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const currentMonth = new Date().getMonth()

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-block', flexShrink: 0 }}>
      <button
        onClick={() => setOpen(p => !p)}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 7,
          padding: '9px 18px', borderRadius: 10,
          border: '1px solid #ececec',
          background: open ? '#f3f4f6' : '#ffffff',
          color: '#374151', fontFamily: "'Inter', sans-serif",
          fontSize: 13, fontWeight: 500, cursor: 'pointer',
          transition: 'all 0.15s', whiteSpace: 'nowrap', flexShrink: 0,
          boxShadow: open ? '0 3px 12px rgba(16,24,40,0.1)' : 'none',
        }}
      >
        <span style={{ fontSize: 14 }}>🗓️</span>
        Month View
        <span style={{ fontSize: 9, color: '#9ca3af', display: 'inline-block', transform: open ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.15s' }}>▼</span>
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 8px)', right: 0, zIndex: 200,
          background: '#ffffff', border: '1px solid #ececec', borderRadius: 14,
          boxShadow: '0 12px 40px rgba(16,24,40,0.16)', overflow: 'hidden',
          minWidth: 220, fontFamily: "'Inter', sans-serif",
        }}>
          <div style={{ padding: '10px 16px 8px', borderBottom: '1px solid #f1f1f1', fontSize: 10.5, color: '#9ca3af', letterSpacing: 0.3, fontWeight: 500 }}>
            View by Month
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 0 }}>
            {FY_MONTHS.map((m, pos) => {
              const i = FY_MONTH_INDICES[pos]
              const isCurrentMonth = i === currentMonth
              return (
                <div
                  key={m}
                  onClick={() => { onSelect(i); setOpen(false) }}
                  style={{
                    padding: '10px 8px', textAlign: 'center', cursor: 'pointer',
                    fontSize: 12, fontWeight: isCurrentMonth ? 600 : 400,
                    color: isCurrentMonth ? '#4338ca' : '#374151',
                    background: isCurrentMonth ? '#eef2ff' : 'transparent',
                    borderRight: (pos % 3 !== 2) ? '1px solid #f4f4f5' : 'none',
                    borderBottom: pos < 9 ? '1px solid #f4f4f5' : 'none',
                    transition: 'background 0.1s',
                    position: 'relative',
                  }}
                  onMouseEnter={e => { if (!isCurrentMonth) e.currentTarget.style.background = '#fafafa' }}
                  onMouseLeave={e => { if (!isCurrentMonth) e.currentTarget.style.background = 'transparent' }}
                >
                  {m}
                  {isCurrentMonth && (
                    <div style={{ position: 'absolute', bottom: 4, left: '50%', transform: 'translateX(-50%)', width: 4, height: 4, borderRadius: '50%', background: '#4f46e5' }} />
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
})

// ─── Transfer Form (used inside MonthViewModal's transfer dialog) ─────────────
const TransferForm = memo(function TransferForm({ monthName, onSubmit, onCancel }) {
  const [from, setFrom]     = useState('Office')
  const [amount, setAmount] = useState('')
  const to = from === 'Office' ? 'Home' : 'Office'
  const amt = parseInt(amount)
  const valid = !isNaN(amt) && amt > 0
  return (
    <div>
      <div style={{ fontSize: 16, fontWeight: 600, color: '#18181b', marginBottom: 4 }}>Transfer funds · {monthName}</div>
      <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 18 }}>Move money between this month's pools.</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
        <button onClick={() => setFrom('Office')} style={{ flex: 1, padding: '10px 0', borderRadius: 10, cursor: 'pointer', fontSize: 12.5, fontWeight: 600, fontFamily: "'Inter', sans-serif", border: '1px solid', borderColor: from === 'Office' ? '#4f46e5' : '#ececec', background: from === 'Office' ? '#eef2ff' : '#fff', color: from === 'Office' ? '#4338ca' : '#6b7280' }}>🏢 Office → 🏠 Home</button>
        <button onClick={() => setFrom('Home')} style={{ flex: 1, padding: '10px 0', borderRadius: 10, cursor: 'pointer', fontSize: 12.5, fontWeight: 600, fontFamily: "'Inter', sans-serif", border: '1px solid', borderColor: from === 'Home' ? '#16a34a' : '#ececec', background: from === 'Home' ? '#f0fdf4' : '#fff', color: from === 'Home' ? '#16a34a' : '#6b7280' }}>🏠 Home → 🏢 Office</button>
      </div>
      <div style={{ position: 'relative', marginBottom: 20 }}>
        <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#9ca3af', fontSize: 15, fontWeight: 600 }}>₹</span>
        <input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="Amount" autoFocus
          style={{ width: '100%', padding: '11px 12px 11px 28px', border: '1px solid #18181b', borderRadius: 10, fontVariantNumeric: 'tabular-nums', fontSize: 16, fontWeight: 600, color: '#18181b', outline: 'none', boxShadow: '0 0 0 3px rgba(24,24,27,0.06)' }} />
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={onCancel} style={{ flex: 1, padding: '9px 0', borderRadius: 10, border: '1px solid #ececec', background: '#fff', color: '#4b5563', fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: "'Inter', sans-serif" }}>Cancel</button>
        <button onClick={() => valid && onSubmit(from, to, amt)} disabled={!valid} style={{ flex: 2, padding: '9px 0', borderRadius: 10, border: 'none', background: valid ? '#18181b' : '#e5e7eb', color: valid ? '#fff' : '#9ca3af', fontSize: 13, fontWeight: 600, cursor: valid ? 'pointer' : 'not-allowed', fontFamily: "'Inter', sans-serif" }}>Transfer</button>
      </div>
    </div>
  )
})

// ─── Month View Modal ─────────────────────────────────────────────────────────
const MonthViewModal = memo(function MonthViewModal({
  monthIndex,
  mergedRecurring,
  allExpenses,
  monthData,
  onClose,
  onMarkPaid,
  savingPaidId,
  onPaidEdit,
  onAmountEdit,
  budgets,
  transfers,
  onSetBudget,
  borrows,
  lendings,
  onTransfer,
  onDeleteTransfer, 
  onAddExpense,
}) {
  const [editMode, setEditMode] = useState(false)
  const [showTransfer, setShowTransfer] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const [deletingTransferId, setDeletingTransferId] = useState(null)

  const [editCell, setEditCell] = useState(null)  // { rowId, field } field: 'paid'|'amt'
  const [editVal, setEditVal]   = useState('')
  const editInputRef = useRef(null)
  const allYears = useMemo(() => getAllYears(allExpenses), [allExpenses])

  const [selectedYear, setSelectedYear] = useState(() => {
    if (allYears.length > 0) {
      const todayFY = toFYStartYear(new Date())
      return allYears.includes(todayFY) ? todayFY : allYears[allYears.length - 1]
    }
    return toFYStartYear(new Date())
  })

  const monthName = MONTHS[monthIndex]
  const monthFull = MONTH_FULL[monthIndex]
  const calYr = calYearForFYMonth(selectedYear, monthName)

  const recurringRows = useMemo(() => {
    return mergedRecurring
      .map(emp => {
        const key = `${emp._id}_${selectedYear}`
        const yearData = monthData[key] || {}
        const cell = yearData[monthName]
        return { ...emp, cell }
      })
      .filter(emp => emp.cell && emp.cell.active)
  }, [mergedRecurring, monthData, selectedYear, monthName])

  const oneTimeRows = useMemo(() => {
    return allExpenses
      .filter(e => {
        if (e.type !== 'one-time') return false
        const d = parseUTCDate(e.date)
        return d.getMonth() === monthIndex && d.getFullYear() === calYr
      })
      .map(e => ({ ...e, _sortDate: parseUTCDate(e.date) }))
      .sort((a, b) => a._sortDate - b._sortDate)
  }, [allExpenses, monthIndex, calYr])

  const combinedRows = useMemo(() => {
    const recurring = recurringRows.map(emp => {
      const amt  = emp.cell.amt  || 0
      const paid = emp.cell.paid || 0
      // Due includes any balance carried in from prior months. cell.carry is the
      // month-end balance; when positive it's what's still owed this month.
      const due = Math.max(0, emp.cell.carry > 0 ? emp.cell.carry : (amt - paid))
      // Resolve the underlying record that owns this month (merged emps span
      // several date-range records), so mark-as-paid writes to the right _id.
      const ownerRec = emp._merged
        ? resolveRecordForMonth(emp, monthIndex, calYr)
        : emp
      // Existing payment for this month (if any) — used to restore the pool
      // source when unticking Paid.
      const existingPay = (ownerRec?.payments || []).find(
        p => p.year === calYr && p.month === monthName
      )
      return {
        _id: emp._id,
        name: emp.expenseName || emp.name,
        expenseType: emp.expenseType,
        category: emp.category || 'Office',
        kind: 'recurring',
        amt, paid, due,
        overridden: !!(emp.cell._srcId) && emp.amountOverrides?.some(ov => ov.year === calYr && ov.month === monthName && ov._srcId === emp.cell._srcId),
        sub: 'since ' + parseUTCDate(emp.startDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }),
        _emp: emp,
        _cell: emp.cell,
        _realId: ownerRec?._id || null,
        _calYr: calYr,
        _monthName: monthName,
        _isPaid: due <= 0,
        _paySource: existingPay?.source || (emp.category === 'Home' ? 'Home' : 'Office'),
      }
    })
const oneTime = oneTimeRows.map(exp => {
      const isPaid = !!exp.otPaid
      return {
        _id: exp._id,
        name: exp.expenseName,
        expenseType: exp.expenseType,
        category: exp.category || 'Office',
        kind: 'one-time',
        amt: exp.amount,
        paid: isPaid ? exp.amount : 0,
        due: isPaid ? 0 : exp.amount,
        overridden: false,
        sub: parseUTCDate(exp.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }),
        _realId: exp._id,
        _calYr: calYr,
        _monthName: monthName,
        _isPaid: isPaid,
        _paySource: exp.otSource || (exp.category === 'Home' ? 'Home' : 'Office'),
      }
    })
    const all = [...recurring, ...oneTime]
    // Two-level sort:
    //   1) group by expense type, alphabetical (A before B)
    //   2) within each type, unpaid first (due > 0), paid last
    return all.sort((a, b) => {
      const typeA = (a.expenseType || '').toLowerCase()
      const typeB = (b.expenseType || '').toLowerCase()
      if (typeA !== typeB) return typeA.localeCompare(typeB)
      const aPaid = (a.due || 0) <= 0
      const bPaid = (b.due || 0) <= 0
      if (aPaid === bPaid) return 0
      return aPaid ? 1 : -1
    })
  }, [recurringRows, oneTimeRows, calYr, monthName, monthIndex])

  const recurringTotal = recurringRows.reduce((s, r) => s + (r.cell.amt  || 0), 0)
  const recurringPaid  = recurringRows.reduce((s, r) => s + (r.cell.paid || 0), 0)
  const oneTimeTotal   = oneTimeRows.reduce((s, r) => s + r.amount, 0)
  const oneTimePaid    = oneTimeRows.reduce((s, r) => s + (r.otPaid ? r.amount : 0), 0)
  const totalDue     = recurringTotal + oneTimeTotal
  const totalPaid    = recurringPaid + oneTimePaid
  const totalBalance = Math.max(0, totalDue - totalPaid)

  // ─── Budget chain: Home & Office pools, chained across the FY ──────────────
  const budgetChain = useMemo(() => {
    const depFor = (mName, pool) => {
      const b = budgets?.find(x => x.fyStartYear === selectedYear && x.month === mName)
      if (!b) return 0
      return pool === 'Home' ? (b.homeDeposit || 0) : (b.officeDeposit || 0)
    }
    const xferFor = (mName, pool) => {
      return (transfers || [])
        .filter(t => t.fyStartYear === selectedYear && t.month === mName)
        .reduce((s, t) => s + (t.to === pool ? t.amount : 0) - (t.from === pool ? t.amount : 0), 0)
    }
    const spendFor = (mName, pool) => {
      const cy = calYearForFYMonth(selectedYear, mName)
      let spent = 0
      allExpenses.forEach(e => {
        (e.payments || []).forEach(p => {
          const src = p.source || 'Office'
          if (p.year === cy && p.month === mName && src === pool) spent += (p.paid || 0)
        })
      })
      // One-time expenses paid from this pool in this month
      allExpenses.forEach(e => {
        if (e.type !== 'one-time' || !e.otPaid) return
        const src = e.otSource || 'Office'
        if (src !== pool) return
        const d = parseUTCDate(e.date)
        if (d.getMonth() === MONTHS.indexOf(mName) && d.getFullYear() === cy) {
          spent += (e.amount || 0)
        }
      })
      return spent
    }
    // Net borrow/lending effect on a pool for a given FY month.
    // + = money into the pool, − = money out.
    const loanFlowFor = (mName, pool) => {
      const cy = calYearForFYMonth(selectedYear, mName)
      const mIdx = MONTHS.indexOf(mName)
      let net = 0

      ;(borrows || []).forEach(b => {
        // Borrow received → credited to borrowedPool, in the borrow's own month
        const d = parseUTCDate(b.date)
        if (d.getMonth() === mIdx && d.getFullYear() === cy) {
          if ((b.borrowedPool || 'Home') === pool) net += (b.amount || 0)
        }
        // Borrow repayments → deducted from payment.pool, in the payment's month
        ;(b.payments || []).forEach(p => {
          if (p.year === cy && p.month === mName && (p.pool || 'Home') === pool) {
            net -= (p.principalPaid || 0) + (p.interestPaid || 0)
          }
        })
      })

      ;(lendings || []).forEach(l => {
        // Lending given out → deducted from lentPool, in the lending's own month
        const d = parseUTCDate(l.date)
        if (d.getMonth() === mIdx && d.getFullYear() === cy) {
          if ((l.lentPool || 'Home') === pool) net -= (l.amount || 0)
        }
        // Lending received back → credited to receivedPool, in the received month
        if (l.receivedAmount > 0 && l.receivedDate) {
          const rd = parseUTCDate(l.receivedDate)
          if (rd.getMonth() === mIdx && rd.getFullYear() === cy) {
            if ((l.receivedPool || 'Home') === pool) net += (l.receivedAmount || 0)
          }
        }
      })

      return net
    }

    const build = (pool) => {
      let opening = 0
      const rows = {}
      for (const mName of FY_MONTHS) {
        const deposit = depFor(mName, pool)
        const xfer    = xferFor(mName, pool)
        const spent   = spendFor(mName, pool)
        const loanFlow = loanFlowFor(mName, pool)
        const available = opening + deposit + xfer + loanFlow
        const surplus   = available - spent
        rows[mName] = { opening, deposit, xfer, spent, loanFlow, available, surplus }
        opening = Math.max(0, surplus)
        if (mName === monthName) break
      }
      return rows[monthName] || { opening: 0, deposit: 0, xfer: 0, spent: 0, available: 0, surplus: 0 }
    }
    return { Home: build('Home'), Office: build('Office') }
  }, [budgets, transfers, borrows, lendings, selectedYear, monthName, allExpenses])

  useEffect(() => {
    document.body.style.overflow = 'hidden'
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = ''
      document.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  const tdBase = { padding: '11px 14px', borderBottom: '1px solid #f4f4f5', fontSize: 13, fontFamily: "'Inter', sans-serif", verticalAlign: 'middle' }

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 500, background: '#f7f7f8', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
    >
      {showTransfer && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1300, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(17,24,39,0.45)', backdropFilter: 'blur(4px)' }} onClick={() => setShowTransfer(false)}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#fff', border: '1px solid #ececec', borderRadius: 20, boxShadow: '0 24px 60px rgba(16,24,40,0.25)', padding: '28px', maxWidth: 400, width: '92vw', fontFamily: "'Inter', sans-serif" }}>
            <TransferForm
              monthName={monthName}
              onSubmit={(from, to, amount) => { onTransfer(selectedYear, monthName, calYr, from, to, amount); setShowTransfer(false) }}
              onCancel={() => setShowTransfer(false)}
            />
          </div>
        </div>
      )}

      {showHistory && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 1400, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(17,24,39,0.45)', backdropFilter: 'blur(4px)' }}
          onClick={() => setShowHistory(false)}
        >
          <div onClick={e => e.stopPropagation()} style={{ background: '#fff', border: '1px solid #ececec', borderRadius: 20, boxShadow: '0 24px 60px rgba(16,24,40,0.25)', maxWidth: 460, width: '92vw', maxHeight: '80vh', display: 'flex', flexDirection: 'column', fontFamily: "'Inter', sans-serif", overflow: 'hidden' }}>
            <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid #ececec', background: '#fafafa', flexShrink: 0 }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                <div>
                  <div style={{ fontSize: 10.5, letterSpacing: 0.4, textTransform: 'uppercase', color: '#9ca3af', marginBottom: 4, fontWeight: 500 }}>Transfer History</div>
                  <div style={{ fontSize: 18, fontWeight: 600, color: '#18181b', letterSpacing: '-0.3px' }}>{monthFull} {calYr}</div>
                  {(() => {
                    const n = (transfers || []).filter(t => t.fyStartYear === selectedYear && t.month === monthName).length
                    return <div style={{ fontSize: 12, color: '#6b7280', marginTop: 3 }}>{n} transfer{n === 1 ? '' : 's'}</div>
                  })()}
                </div>
                <button onClick={() => setShowHistory(false)} style={{ width: 32, height: 32, borderRadius: 10, border: '1px solid #ececec', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontSize: 16, color: '#6b7280' }}>✕</button>
              </div>
            </div>

            <div style={{ overflowY: 'auto', flex: 1, padding: '16px 20px 20px' }}>
              {(() => {
                const rows = (transfers || [])
                  .filter(t => t.fyStartYear === selectedYear && t.month === monthName)
                  .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
                if (rows.length === 0) {
                  return (
                    <div style={{ textAlign: 'center', padding: '36px 0', color: '#9ca3af' }}>
                      <div style={{ fontSize: 30, marginBottom: 8 }}>⇄</div>
                      <div style={{ fontSize: 13.5, fontWeight: 600, color: '#6b7280' }}>No transfers in {monthFull}</div>
                      <div style={{ fontSize: 12, marginTop: 4 }}>Funds you move between pools will show up here.</div>
                    </div>
                  )
                }
                return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {rows.map(t => {
                      const when = new Date(t.createdAt).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
                      return (
                        <div key={t._id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '12px 14px', border: '1px solid #ececec', borderRadius: 12, background: '#fafafa' }}>
                          <div style={{ minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, color: '#18181b' }}>
                              <span style={{ color: t.from === 'Home' ? '#16a34a' : '#4338ca' }}>{t.from === 'Home' ? '🏠' : '🏢'} {t.from}</span>
                              <span style={{ color: '#9ca3af' }}>→</span>
                              <span style={{ color: t.to === 'Home' ? '#16a34a' : '#4338ca' }}>{t.to === 'Home' ? '🏠' : '🏢'} {t.to}</span>
                            </div>
                            <div style={{ fontSize: 10.5, color: '#9ca3af', marginTop: 3 }}>{when}</div>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                            <span style={{ fontSize: 15, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: '#18181b' }}>{fmt(t.amount)}</span>
                            {deletingTransferId === t._id ? (
                              <span style={{ display: 'inline-block', width: 15, height: 15, border: '2px solid #fecaca', borderTopColor: '#dc2626', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
                            ) : (
                              <button
                                onClick={async () => {
                                  setDeletingTransferId(t._id)
                                  try {
                                    await onDeleteTransfer(t)
                                  } finally {
                                    setDeletingTransferId(null)
                                  }
                                }}
                                title="Undo this transfer"
                                style={{ width: 28, height: 28, borderRadius: 8, border: '1px solid #fecaca', background: '#fff', color: '#dc2626', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13 }}
                              >
                                ↩
                              </button>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )
              })()}
            </div>
          </div>
        </div>
      )}

      <div
        style={{
          background: '#ffffff',
          width: '100%', height: '100%',
          display: 'flex', flexDirection: 'column',
          fontFamily: "'Inter', sans-serif", overflow: 'hidden',
        }}
      >
        <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid #ececec', background: '#fafafa', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 14 }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 10.5, letterSpacing: 0.4, textTransform: 'uppercase', color: '#9ca3af', marginBottom: 4, fontWeight: 500 }}>Monthly View</div>
              <div style={{ fontSize: 22, fontWeight: 600, color: '#18181b', letterSpacing: '-0.4px' }}>{monthFull} {calYr}</div>
              <div style={{ fontSize: 12, color: '#6b7280', marginTop: 3 }}>
                {recurringRows.length} recurring &nbsp;·&nbsp; {oneTimeRows.length} one-time
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
              <button
                onClick={() => { setEditMode(p => !p); setEditCell(null) }}
                title="Toggle inline editing of amount and paid"
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  padding: '7px 14px', borderRadius: 10, cursor: 'pointer',
                  border: '1px solid', borderColor: editMode ? '#4f46e5' : '#ececec',
                  background: editMode ? '#eef2ff' : '#fff',
                  color: editMode ? '#4338ca' : '#6b7280',
                  fontSize: 12.5, fontWeight: editMode ? 600 : 500, fontFamily: "'Inter', sans-serif",
                }}
              >
               <span style={{ fontSize: 13 }}>✏️</span>
                {editMode ? 'Done editing' : 'Edit'}
              </button>
              <button
                onClick={onClose}
                title="Go back to the master expense table"
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  padding: '7px 14px', borderRadius: 10, cursor: 'pointer',
                  border: '1px solid #ececec', background: '#fff', color: '#4b5563',
                  fontSize: 12.5, fontWeight: 500, fontFamily: "'Inter', sans-serif",
                }}
              >
              <span style={{ fontSize: 13 }}>📋</span>
                Category
              </button>
              <button
                onClick={() => onAddExpense()}
                title="Go to the Add Expense page"
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  padding: '7px 14px', borderRadius: 10, cursor: 'pointer',
                  border: 'none', background: '#18181b', color: '#fff',
                  fontSize: 12.5, fontWeight: 600, fontFamily: "'Inter', sans-serif",
                }}
              >
                <span style={{ fontSize: 15, lineHeight: 1 }}>+</span>
                Add Expense
              </button>
              <button onClick={onClose} style={{ width: 32, height: 32, borderRadius: 10, border: '1px solid #ececec', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontSize: 16, color: '#6b7280' }}>✕</button>
            </div>
          </div>

          {allYears.length > 1 && (
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 12 }}>
              {allYears.map(y => (
                <button key={y} onClick={() => setSelectedYear(y)} style={{ padding: '4px 12px', borderRadius: 8, border: '1px solid', borderColor: selectedYear === y ? '#4f46e5' : '#ececec', background: selectedYear === y ? '#eef2ff' : '#fff', color: selectedYear === y ? '#4338ca' : '#6b7280', fontSize: 12, fontWeight: selectedYear === y ? 600 : 400, cursor: 'pointer', fontFamily: "'Inter', sans-serif", transition: 'all 0.15s', whiteSpace: 'nowrap' }}>{fyLabel(y)}</button>
              ))}
            </div>
          )}

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {[
              { label: 'Total Due',     value: fmt(totalDue),     color: '#d97706', bg: '#fffbeb', border: '#fde68a' },
              { label: 'Total Paid',    value: fmt(totalPaid),    color: '#16a34a', bg: '#f0fdf4', border: '#bbf7d0' },
              { label: 'Total Balance', value: fmt(totalBalance), color: totalBalance > 0 ? '#d97706' : '#16a34a', bg: totalBalance > 0 ? '#fffbeb' : '#f0fdf4', border: totalBalance > 0 ? '#fde68a' : '#bbf7d0' },
            ].map(p => (
              <div key={p.label} style={{ flex: '1 1 120px', minWidth: 110, background: p.bg, border: `1px solid ${p.border}`, borderRadius: 10, padding: '8px 14px', display: 'flex', flexDirection: 'column', gap: 2 }}>
                <span style={{ fontSize: 9, letterSpacing: 0.3, textTransform: 'uppercase', color: '#9ca3af', fontWeight: 500 }}>{p.label}</span>
                <span style={{ fontSize: 16, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: p.color }}>{p.value}</span>
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8, alignItems: 'stretch' }}>
            {['Home', 'Office'].map(pool => {
              const c = budgetChain[pool]
              const accent = pool === 'Home' ? '#16a34a' : '#4338ca'
              const bg     = pool === 'Home' ? '#f0fdf4' : '#eef2ff'
              const border = pool === 'Home' ? '#bbf7d0' : '#e0e7ff'
              return (
                <div key={pool} style={{ flex: '1 1 260px', minWidth: 240, background: bg, border: `1px solid ${border}`, borderRadius: 12, padding: '10px 14px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: accent }}>{pool === 'Home' ? '🏠 Home Pool' : '🏢 Office Pool'}</span>
                    <span style={{ fontSize: 10.5, color: '#6b7280' }}>Surplus → <b style={{ color: c.surplus >= 0 ? '#16a34a' : '#dc2626' }}>{fmt(Math.abs(c.surplus))}</b></span>
                  </div>
                  <div style={{ display: 'flex', gap: 6, marginBottom: 8, fontSize: 10.5, color: '#6b7280', flexWrap: 'wrap' }}>
                    <span>Open: <b style={{ color: '#374151' }}>{fmt(c.opening)}</b></span>
                    <span>· Avail: <b style={{ color: '#374151' }}>{fmt(Math.max(0, c.surplus))}</b></span>
                    <span>· Spent: <b style={{ color: '#374151' }}>{fmt(c.spent)}</b></span>
                    {c.xfer !== 0 && <span>· Xfer: <b style={{ color: c.xfer > 0 ? '#16a34a' : '#dc2626' }}>{c.xfer > 0 ? '+' : ''}{fmt(c.xfer)}</b></span>}
                  </div>
                  <div style={{ position: 'relative' }}>
                    <span style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: '#9ca3af', fontSize: 13, fontWeight: 600 }}>₹</span>
                    <input
                      type="number"
                      defaultValue={c.deposit || ''}
                      key={`${selectedYear}-${monthName}-${pool}-${c.deposit}`}
                      placeholder="0"
                      onBlur={(e) => onSetBudget(selectedYear, monthName, calYr, pool, e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur() }}
                      style={{ width: '100%', padding: '6px 8px 6px 22px', border: '1px solid #ececec', borderRadius: 8, fontVariantNumeric: 'tabular-nums', fontSize: 15, fontWeight: 700, color: '#18181b', outline: 'none', background: '#fff' }}
                    />
                  </div>
                </div>
              )
            })}
            <div style={{ flex: '0 0 auto', display: 'flex', alignItems: 'center', gap: 8 }}>
              <button
                onClick={() => setShowTransfer(true)}
                style={{ padding: '10px 16px', borderRadius: 10, border: '1px solid #ececec', background: '#fff', color: '#4b5563', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', fontFamily: "'Inter', sans-serif", whiteSpace: 'nowrap' }}
              >
                ⇄ Transfer funds
              </button>
              <button
                onClick={() => setShowHistory(true)}
                style={{ padding: '10px 16px', borderRadius: 10, border: '1px solid #ececec', background: '#fff', color: '#4b5563', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', fontFamily: "'Inter', sans-serif", whiteSpace: 'nowrap' }}
              >
                🕑 History
              </button>
            </div>
          </div>
        </div>

        <div style={{ overflowY: 'auto', flex: 1, padding: '24px 32px 32px', maxWidth: 1400, width: '100%', margin: '0 auto' }}>
          {combinedRows.length > 0 ? (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <div style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: 0.3, color: '#6b7280', background: '#f3f4f6', border: '1px solid #ececec', padding: '3px 12px', borderRadius: 20 }}>
                  🧾 {monthFull} {calYr} · {fyLabel(selectedYear)} · All Expenses
                </div>
              </div>
              <div style={{ borderRadius: 14, border: '1px solid #ececec', overflowX: 'auto', boxShadow: '0 1px 3px rgba(16,24,40,0.04)' }}>
                <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 680, tableLayout: 'auto', whiteSpace: 'nowrap' }}>
                  <thead>
                    <tr style={{ background: '#fafafa' }}>
                      {['#', 'Expense Name', 'Type', 'Kind', 'Amount', 'Paid', 'Balance', 'Pay'].map((h, i) => (
                        <th key={h} style={{ padding: '10px 14px', fontSize: 10.5, fontWeight: 500, letterSpacing: 0.3, color: '#9ca3af', textAlign: (i >= 4 && i <= 6) ? 'right' : (i === 7 ? 'center' : 'left'), borderBottom: '1px solid #ececec', borderRight: i < 7 ? '1px solid #f4f4f5' : 'none', fontFamily: "'Inter', sans-serif", width: i === 7 ? 60 : undefined }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {combinedRows.map((row, idx) => (
                      <tr key={row._id} onMouseEnter={e => e.currentTarget.style.background = '#fafafa'} onMouseLeave={e => e.currentTarget.style.background = ''}>
                        <td style={{ ...tdBase, width: 36, color: '#c5c5c9', fontVariantNumeric: 'tabular-nums', fontSize: 11, borderRight: '1px solid #f4f4f5' }}>{idx + 1}</td>
                        <td style={{ ...tdBase, borderRight: '1px solid #f4f4f5' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            {row.kind === 'recurring'
                              ? <Avatar name={row.name || '?'} />
                              : <span style={{ width: 28, height: 28, borderRadius: 8, background: '#fffbeb', border: '1px solid #fde68a', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, flexShrink: 0 }}>⚡</span>
                            }
                            <div>
                              <div style={{ fontWeight: 500, color: '#18181b', fontSize: 13 }}>{row.name}</div>
                              <div style={{ fontSize: 10.5, color: '#9ca3af', marginTop: 1 }}>{row.sub}</div>
                            </div>
                          </div>
                        </td>
                        <td style={{ ...tdBase, fontSize: 11.5, color: '#6b7280', borderRight: '1px solid #f4f4f5' }}>{row.expenseType || '—'}</td>
                        <td style={{ ...tdBase, fontSize: 11.5, borderRight: '1px solid #f4f4f5' }}>
                          {row.kind === 'recurring'
                            ? <span style={{ color: '#4338ca' }}>🔁 Recurring</span>
                            : <span style={{ color: '#b45309' }}>⚡ One-Time</span>
                          }
                        </td>
                        <td
                          style={{ ...tdBase, textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 600, color: '#d97706', borderRight: '1px solid #f4f4f5', cursor: (editMode && row.kind === 'recurring') ? 'pointer' : 'default', background: (editMode && row.kind === 'recurring') ? '#fffdf7' : undefined }}
                          onClick={() => {
                            if (!editMode || row.kind !== 'recurring') return
                            setEditCell({ rowId: row._id, field: 'amt' })
                            setEditVal(String(row.amt))
                            setTimeout(() => { editInputRef.current?.focus(); editInputRef.current?.select() }, 20)
                          }}
                          title={editMode && row.kind === 'recurring' ? 'Click to change amount from this month onwards' : undefined}
                        >
                          {editCell?.rowId === row._id && editCell?.field === 'amt' ? (
                            <input
                              ref={editInputRef}
                              value={editVal}
                              onChange={e => setEditVal(e.target.value)}
                              onBlur={() => { onAmountEdit(row, editVal); setEditCell(null) }}
                              onKeyDown={e => {
                                if (e.key === 'Enter') { onAmountEdit(row, editVal); setEditCell(null) }
                                if (e.key === 'Escape') setEditCell(null)
                              }}
                              style={{ width: 90, textAlign: 'right', border: '1px solid #18181b', borderRadius: 8, padding: '3px 7px', fontVariantNumeric: 'tabular-nums', fontSize: 13, fontWeight: 600, color: '#18181b', outline: 'none', boxShadow: '0 0 0 3px rgba(24,24,27,0.06)' }}
                            />
                          ) : (
                            <>
                              {editMode && row.kind === 'recurring' && <span style={{ fontSize: 10, color: '#c5c5c9', marginRight: 3 }}>✏️</span>}
                              {fmt(row.amt)}
                              {row.overridden && <span title="Amount overridden" style={{ marginLeft: 4, fontSize: 9, color: '#4f46e5' }}>●</span>}
                            </>
                          )}
                        </td>
                        <td
                          style={{ ...tdBase, textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: '#16a34a', borderRight: '1px solid #f4f4f5', cursor: (editMode && row.kind === 'recurring') ? 'pointer' : 'default', background: (editMode && row.kind === 'recurring') ? '#f0fdf4' : undefined }}
                          onClick={() => {
                            if (!editMode || row.kind !== 'recurring') return
                            setEditCell({ rowId: row._id, field: 'paid' })
                            setEditVal(String(row.paid))
                            setTimeout(() => { editInputRef.current?.focus(); editInputRef.current?.select() }, 20)
                          }}
                          title={editMode && row.kind === 'recurring' ? 'Click to edit paid amount' : undefined}
                        >
                          {editCell?.rowId === row._id && editCell?.field === 'paid' ? (
                            <input
                              ref={editInputRef}
                              value={editVal}
                              onChange={e => setEditVal(e.target.value)}
                              onBlur={() => { onPaidEdit(row, editVal); setEditCell(null) }}
                              onKeyDown={e => {
                                if (e.key === 'Enter') { onPaidEdit(row, editVal); setEditCell(null) }
                                if (e.key === 'Escape') setEditCell(null)
                              }}
                              style={{ width: 90, textAlign: 'right', border: '1px solid #18181b', borderRadius: 8, padding: '3px 7px', fontVariantNumeric: 'tabular-nums', fontSize: 13, fontWeight: 600, color: '#16a34a', outline: 'none', boxShadow: '0 0 0 3px rgba(24,24,27,0.06)' }}
                            />
                          ) : (
                            <>
                              {editMode && row.kind === 'recurring' && <span style={{ fontSize: 10, color: '#c5c5c9', marginRight: 3 }}>✏️</span>}
                              {fmt(row.paid)}
                            </>
                          )}
                        </td>
                        <td style={{ ...tdBase, textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 600, color: row.due > 0 ? '#d97706' : '#16a34a', borderRight: '1px solid #f4f4f5' }}>
                          {row.due > 0 ? fmt(row.due) : <span style={{ color: '#16a34a', fontSize: 11 }}>✓ Paid</span>}
                        </td>
                        <td style={{ ...tdBase, textAlign: 'center', width: 110 }}>
                          {onMarkPaid ? (
                            savingPaidId === row._id ? (
                              <span style={{ display: 'inline-block', width: 15, height: 15, border: '2px solid #e0e7ff', borderTopColor: '#4f46e5', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
                            ) : (
                              <div style={{ display: 'flex', gap: 10, justifyContent: 'center', alignItems: 'center' }}>
                                {['Home', 'Office'].map(pool => {
                                  const checked = row._isPaid && row._paySource === pool
                                  const accent  = pool === 'Home' ? '#16a34a' : '#4f46e5'
                                  return (
                                    <label
                                      key={pool}
                                      title={
                                        row._isPaid
                                          ? (checked ? `Paid from ${pool} — untick to unpay` : `Paid from ${row._paySource}`)
                                          : `Mark paid from ${pool} pool`
                                      }
                                      style={{ display: 'inline-flex', alignItems: 'center', gap: 3, cursor: 'pointer', fontSize: 10, fontWeight: 600, color: checked ? accent : '#9ca3af' }}
                                    >
                                      <input
                                        type="checkbox"
                                        checked={checked}
                                        onChange={() => {
                                          if (row._isPaid && checked) {
                                            onMarkPaid(row)          // untick → unpay
                                          } else if (!row._isPaid) {
                                            onMarkPaid(row, pool)    // pay from this pool
                                          }
                                          // clicking other pool while already paid: ignored
                                        }}
                                        style={{ width: 15, height: 15, cursor: 'pointer', accentColor: accent }}
                                      />
                                      {pool === 'Home' ? '🏠' : '🏢'}
                                    </label>
                                  )
                                })}
                              </div>
                            )
                          ) : (
                            <span style={{ color: '#d1d5db', fontSize: 11 }}>—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr style={{ background: '#fafafa' }}>
                      <td colSpan={4} style={{ padding: '10px 14px', fontSize: 10.5, fontWeight: 600, color: '#6b7280', letterSpacing: 0.3, borderTop: '1px solid #ececec', fontFamily: "'Inter', sans-serif" }}>
                        Total ({combinedRows.length})
                      </td>
                      <td style={{ padding: '10px 14px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 700, color: '#d97706', borderTop: '1px solid #ececec', borderRight: '1px solid #f4f4f5' }}>{fmt(totalDue)}</td>
                      <td style={{ padding: '10px 14px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 700, color: '#16a34a', borderTop: '1px solid #ececec', borderRight: '1px solid #f4f4f5' }}>{fmt(totalPaid)}</td>
                      <td style={{ padding: '10px 14px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 700, color: totalBalance > 0 ? '#d97706' : '#16a34a', borderTop: '1px solid #ececec', borderRight: '1px solid #f4f4f5' }}>{fmt(totalBalance)}</td>
                      <td style={{ borderTop: '1px solid #ececec' }} />
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: '40px 0', color: '#9ca3af' }}>
              <div style={{ fontSize: 32, marginBottom: 10 }}>📭</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#6b7280' }}>No expenses in {monthFull} {calYr}</div>
              <div style={{ fontSize: 12, marginTop: 4 }}>Try selecting a different year above.</div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
})


// ─── Global CSS ───────────────────────────────────────────────────────────────
const GLOBAL_STYLES = `
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
  * { box-sizing: border-box; }
  .emp-table-scroll { overflow-x: auto; border-radius: 14px; border: 1px solid #ececec; background: #ffffff; box-shadow: 0 1px 3px rgba(16,24,40,0.04); }
  .emp-table { border-collapse: collapse; white-space: nowrap; width: 100%; }
  .col-name { position: sticky; left: 0; z-index: 3; background: #ffffff; min-width: 220px; max-width: 220px; border-right: 1px solid #ececec; }
  .col-name.head { background: #fafafa; z-index: 4; }
  .th-month { background: #fafafa; color: #9ca3af; text-align: center; font-size: 10.5px; font-weight: 500; letter-spacing: 0.3px; padding: 11px 4px; border-right: 1px solid #ececec; border-bottom: 1px solid #ececec; font-family: 'Inter', sans-serif; }
  .th-month.inactive-head { color: #d1d5db; }
  .th-sub { text-align: center; font-size: 10px; font-weight: 500; letter-spacing: 0.3px; padding: 6px 6px; border-bottom: 1px solid #ececec; border-right: 1px solid #f4f4f5; min-width: 88px; background: #fafafa; color: #9ca3af; font-family: 'Inter', sans-serif; }
  .th-sub.amt  { color: #d97706; }
  .th-sub.paid { color: #16a34a; border-right: 1px solid #ececec; }
  .th-sub.amt.amt-edit-mode { color: #4f46e5; background: #eef2ff; cursor: pointer; }
  .th-total { background: #eef2ff; text-align: center; font-size: 10px; font-weight: 500; letter-spacing: 0.3px; padding: 6px 8px; border-bottom: 1px solid #ececec; border-right: 1px solid #f4f4f5; min-width: 100px; font-family: 'Inter', sans-serif; color: #4338ca; }
  tr.data-row:hover td        { background: #fafafa !important; }
  tr.data-row:hover .col-name { background: #fafafa !important; }
  .td-emp { padding: 11px 14px; border-bottom: 1px solid #f4f4f5; vertical-align: middle; }
  .td-amt { text-align: right; padding: 10px 10px; font-variant-numeric: tabular-nums; font-size: 12px; border-bottom: 1px solid #f4f4f5; border-right: 1px solid #f4f4f5; background: #fafafa; color: #6b7280; }
  .td-amt.td-amt-editable { cursor: pointer; }
  .td-amt.td-amt-editable:hover { background: #eef2ff !important; color: #4338ca !important; outline: 1.5px solid #c7d2fe; outline-offset: -1.5px; }
  .td-amt.td-amt-overridden { color: #4f46e5 !important; font-weight: 600; }
  .td-paid { text-align: right; padding: 10px 10px; font-variant-numeric: tabular-nums; font-size: 12px; color: #16a34a; border-bottom: 1px solid #f4f4f5; border-right: 1px solid #ececec; cursor: pointer; position: relative; }
  .td-paid:hover { background: #f0fdf4 !important; }
  .td-paid.has-carry { color: #d97706; }
  .td-paid.saving { opacity: 0.5; cursor: wait; }
  .td-inactive { background: #fafafa; color: #d1d5db; text-align: center; font-size: 11px; border-bottom: 1px solid #f4f4f5; border-right: 1px solid #ececec; padding: 10px 6px; }
  .carry-badge  { display: inline-block; background: #fffbeb; border: 1px solid #fde68a; border-radius: 4px; padding: 1px 5px; font-size: 10px; color: #d97706; font-variant-numeric: tabular-nums; }
  .credit-badge { display: inline-block; background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 4px; padding: 1px 5px; font-size: 10px; color: #16a34a; font-variant-numeric: tabular-nums; }
  .saving-badge { display: inline-block; background: #eef2ff; border: 1px solid #e0e7ff; border-radius: 4px; padding: 1px 5px; font-size: 10px; color: #4338ca; font-variant-numeric: tabular-nums; }
  .edit-inp { width: 82px; background: #ffffff; border: 1px solid #18181b; border-radius: 8px; padding: 3px 7px; font-variant-numeric: tabular-nums; font-size: 12px; color: #18181b; outline: none; text-align: right; box-shadow: 0 0 0 3px rgba(24,24,27,0.06); }
  .td-total-paid { text-align: right; padding: 10px 12px; font-variant-numeric: tabular-nums; font-size: 12px; font-weight: 600; color: #16a34a; border-bottom: 1px solid #f4f4f5; border-right: 1px solid #f4f4f5; background: #f0fdf4; }
  .td-total-amt  { text-align: right; padding: 10px 12px; font-variant-numeric: tabular-nums; font-size: 12px; color: #9ca3af; border-bottom: 1px solid #f4f4f5; background: #fafafa; }
  tr.footer-row td { background: #fafafa; border-top: 1px solid #ececec; font-variant-numeric: tabular-nums; font-size: 11px; text-align: right; padding: 9px 10px; border-right: 1px solid #f4f4f5; }
  .add-expense-btn { display: inline-flex; align-items: center; gap: 7px; padding: 9px 20px; border-radius: 10px; border: none; background: #18181b; color: #fff; font-family: 'Inter', sans-serif; font-size: 13px; font-weight: 500; cursor: pointer; transition: background 0.15s, transform 0.12s; white-space: nowrap; flex-shrink: 0; }
  .add-expense-btn:hover  { background: #000; transform: translateY(-1px); }
  .add-expense-btn:active { transform: translateY(0); }
  .add-expense-btn-icon { width: 18px; height: 18px; border-radius: 50%; background: rgba(255,255,255,0.18); display: flex; align-items: center; justify-content: center; font-size: 15px; line-height: 1; font-weight: 300; }
  ::-webkit-scrollbar { height: 6px; }
  ::-webkit-scrollbar-track { background: #f1f1f1; }
  ::-webkit-scrollbar-thumb { background: #d1d5db; border-radius: 3px; }
  @keyframes spin { to { transform: rotate(360deg); } }
`

if (typeof document !== 'undefined' && !document.getElementById('employee-table-styles')) {
  const style = document.createElement('style')
  style.id = 'employee-table-styles'
  style.textContent = GLOBAL_STYLES
  document.head.appendChild(style)
}

// ─── Main component ───────────────────────────────────────────────────────────
const EmployeeTable = () => {
  const navigate = useNavigate()

  const [allExpenses,        setAllExpenses]        = useState([])
  const [monthData,          setMonthData]          = useState({})
  const [loading,            setLoading]            = useState(true)
  const [error,              setError]              = useState(null)
  const [savingCell,         setSavingCell]         = useState(null)
  const [editing,            setEditing]            = useState(null)
  const [editVal,            setEditVal]            = useState('')
  const inputRef = useRef(null)

  const [deleteTarget,       setDeleteTarget]       = useState(null)
  const [deleting,           setDeleting]           = useState(false)
  const [monthViewIndex,     setMonthViewIndex]     = useState(() => new Date().getMonth())

  const [overrideTarget,     setOverrideTarget]     = useState(null)
  const [savingOverride,     setSavingOverride]     = useState(false)

  const [savingCarryForwardId, setSavingCarryForwardId] = useState(null)
  const [carryForwardTarget,   setCarryForwardTarget]   = useState(null)

  const [convertTarget,      setConvertTarget]      = useState(null)
  const [savingConvertId,    setSavingConvertId]    = useState(null)

  const [editOneTimeTarget,  setEditOneTimeTarget]  = useState(null)
  const [savingEditOneTime,  setSavingEditOneTime]  = useState(false)

  const [savingPaidId, setSavingPaidId] = useState(null)
  const prePaidRef = useRef({})   // key: `${realId}::${calYr}::${month}` -> previous paid

  const [categoryFilter, setCategoryFilter] = useState('all')
  const [savingCategoryId, setSavingCategoryId] = useState(null)
  
  const [budgets, setBudgets] = useState([])
  const [transfers, setTransfers] = useState([])
  
  const [borrows, setBorrows] = useState([])
  const [lendings, setLendings] = useState([])


  const visibleExpenses = useMemo(() => {
    if (categoryFilter === 'all') return allExpenses
    return allExpenses.filter(e => (e.category || 'Office') === categoryFilter)
  }, [allExpenses, categoryFilter])

  const mergedRecurring = useMemo(
    () => mergeRecurringByName(visibleExpenses.filter(e => e.type === 'recurring')),
    [visibleExpenses]
  )

  const mergedById = useMemo(() => {
    const map = {}
    mergedRecurring.forEach(m => { map[m._id] = m })
    return map
  }, [mergedRecurring])

  const buildAllMonthData = useCallback((mergedList) => {
    const initial = {}
    mergedList.forEach(emp => {
      Object.assign(initial, buildChainedYears(emp))
    })
    return initial
  }, [])

  useEffect(() => {
    setMonthData(buildAllMonthData(mergedRecurring))
  }, [mergedRecurring, buildAllMonthData])

  useEffect(() => {
    const fetchExpenses = async () => {
      try {
        const cachedData = sessionStorage.getItem(CACHE_KEY)
        if (cachedData) {
          setAllExpenses(JSON.parse(cachedData))
          setLoading(false)
        }
        const res  = await fetch(`${API_BASE}/employee/all`)
        const data = await res.json()
        sessionStorage.setItem(CACHE_KEY, JSON.stringify(data))
        setAllExpenses(data)
      } catch (err) {
        setError('Failed to fetch expenses')
      } finally {
        setLoading(false)
      }
    }
    fetchExpenses()
  }, [])

 useEffect(() => {
    const fetchBudgets = async () => {
      try {
        const [bRes, tRes] = await Promise.all([
          fetch(`${API_BASE}/budget/all`),
          fetch(`${API_BASE}/budget/transfers`),
        ])
        const bData = await bRes.json()
        const tData = await tRes.json()
        setBudgets(Array.isArray(bData) ? bData : [])
        setTransfers(Array.isArray(tData) ? tData : [])
      } catch (err) {
        console.error('Failed to fetch budgets/transfers:', err)
      }
    }
    fetchBudgets()
  }, [])

  useEffect(() => {
    const fetchLoans = async () => {
      try {
        const [bRes, lRes] = await Promise.all([
          fetch(`${API_BASE}/borrow`),
          fetch(`${API_BASE}/lending`),
        ])
        const bData = await bRes.json()
        const lData = await lRes.json()
        setBorrows(Array.isArray(bData) ? bData : [])
        setLendings(Array.isArray(lData) ? lData : [])
      } catch (err) {
        console.error('Failed to fetch borrows/lendings:', err)
      }
    }
    fetchLoans()
  }, [])

  const resolveRealId = useCallback((mergedId, month, year) => {
    const merged = mergedById[mergedId]
    if (!merged) return mergedId
    const monthIdx = MONTHS.indexOf(month)
    const calYr = calYearForFYMonth(year, month)
    const rec = resolveRecordForMonth(merged, monthIdx, calYr)
    return rec?._id || null
  }, [mergedById])

  const handleEditStart = useCallback((empId, month, year, currentPaid) => {
    setEditing({ empId, month, year })
    setEditVal(String(currentPaid))
    setTimeout(() => { inputRef.current?.focus(); inputRef.current?.select() }, 20)
  }, [])

  const handleEditCommit = useCallback(async () => {
    if (!editing) return
    const { empId, month, year } = editing
    const newVal = Math.max(0, parseInt(editVal) || 0)
    const calYr  = calYearForFYMonth(year, month)

    const realId = resolveRealId(empId, month, year)
    setEditing(null)
    if (!realId) return

    setAllExpenses(exps => {
      const updatedExps = exps.map(e => {
        if (e._id !== realId) return e
        const existingPaymentIdx = (e.payments || []).findIndex(p => p.year === calYr && p.month === month)
        const updatedPayments = [...(e.payments || [])]
        if (existingPaymentIdx > -1) {
          updatedPayments[existingPaymentIdx] = { ...updatedPayments[existingPaymentIdx], paid: newVal }
        } else {
          updatedPayments.push({ year: calYr, month, paid: newVal })
        }
        return { ...e, payments: updatedPayments }
      })
      sessionStorage.setItem(CACHE_KEY, JSON.stringify(updatedExps))
      return updatedExps
    })

    setSavingCell({ empId, month, year })
    fetch(`${API_BASE}/employee/update-payment/${realId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ year: calYr, month, paid: newVal }),
    }).catch(err => console.error('Failed to save payment:', err)).finally(() => setSavingCell(null))
  }, [editing, editVal, resolveRealId])

  const handleAmountOverrideRequest = useCallback((emp, month, year, currentAmt) => {
    setOverrideTarget({ emp, month, year, currentAmt })
  }, [])

const writePayment = useCallback(async (realId, calYr, monthName, payValue, source) => {
    setAllExpenses(exps => {
      const updated = exps.map(e => {
        if (e._id !== realId) return e
        const idx = (e.payments || []).findIndex(p => p.year === calYr && p.month === monthName)
        const payments = [...(e.payments || [])]
        const entry = { year: calYr, month: monthName, paid: payValue }
        if (source) entry.source = source
        if (idx > -1) payments[idx] = { ...payments[idx], ...entry }
        else payments.push(entry)
        return { ...e, payments }
      })
      sessionStorage.setItem(CACHE_KEY, JSON.stringify(updated))
      return updated
    })
    try {
      const res = await fetch(`${API_BASE}/employee/update-payment/${realId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ year: calYr, month: monthName, paid: payValue, source }),
      })
      if (!res.ok) throw new Error(`Server responded ${res.status}`)
    } catch (err) {
      console.error('Failed to save payment:', err)
    }
  }, [])

const payOneTime = useCallback(async (realId, paid, source) => {
    setAllExpenses(exps => {
      const updated = exps.map(e => {
        if (e._id !== realId) return e
        return { ...e, otPaid: paid, otSource: source || e.otSource || 'Office' }
      })
      sessionStorage.setItem(CACHE_KEY, JSON.stringify(updated))
      return updated
    })
    try {
      const res = await fetch(`${API_BASE}/employee/pay-onetime/${realId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paid, source }),
      })
      if (!res.ok) throw new Error(`Server responded ${res.status}`)
    } catch (err) {
      console.error('Failed to save one-time payment:', err)
    }
  }, [])


const handleMarkPaid = useCallback((row, source) => {
    // ── One-time expenses ──
    if (row.kind === 'one-time') {
      if (!row._realId) return
      const nextPaid = !row._isPaid
      const src = source || row._paySource || 'Office'
      setSavingPaidId(row._id)
      payOneTime(row._realId, nextPaid, src)
        .finally(() => setSavingPaidId(null))
      return
    }

    // ── Recurring expenses ──
    if (row.kind !== 'recurring' || !row._realId) return
    const key = `${row._realId}::${row._calYr}::${row._monthName}`
    if (row._isPaid) {
      // Untick: restore previous paid value
      const restore = prePaidRef.current[key]
      const restoreVal = restore != null ? restore : 0
      delete prePaidRef.current[key]
      setSavingPaidId(row._id)
      writePayment(row._realId, row._calYr, row._monthName, restoreVal, row._paySource)
        .finally(() => setSavingPaidId(null))
      return
    }
    // Tick: pay in full from the chosen pool
    prePaidRef.current[key] = row.paid || 0
    const payValue = (row.paid || 0) + (row.due || 0)
    setSavingPaidId(row._id)
    writePayment(row._realId, row._calYr, row._monthName, payValue, source)
      .finally(() => setSavingPaidId(null))
  }, [writePayment, payOneTime])



 
  const handleMonthPaidEdit = useCallback(async (row, newPaid) => {
    if (row.kind !== 'recurring' || !row._realId) return
    const val = Math.max(0, parseInt(newPaid) || 0)
    await writePayment(row._realId, row._calYr, row._monthName, val)
  }, [writePayment])

  const handleMonthAmountEdit = useCallback(async (row, newAmount) => {
    if (row.kind !== 'recurring' || !row._realId) return
    const amt = parseInt(newAmount)
    if (isNaN(amt) || amt <= 0) return
    const { _realId: realId, _calYr: calYr, _monthName: monthName } = row

    setAllExpenses(prev => {
      const updated = prev.map(e => {
        if (e._id !== realId) return e
        const overrides = [...(e.amountOverrides || [])]
        const idx = overrides.findIndex(ov => ov.year === calYr && ov.month === monthName)
        if (idx > -1) overrides[idx] = { year: calYr, month: monthName, amount: amt }
        else overrides.push({ year: calYr, month: monthName, amount: amt })
        return { ...e, amountOverrides: overrides }
      })
      sessionStorage.setItem(CACHE_KEY, JSON.stringify(updated))
      return updated
    })

    try {
      const res = await fetch(`${API_BASE}/employee/update-amount-override/${realId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ year: calYr, month: monthName, amount: amt }),
      })
      if (!res.ok) throw new Error(`Server responded ${res.status}`)
    } catch (err) {
      console.error('Failed to save amount override:', err)
    }
  }, [])

const handleSetBudget = useCallback(async (fyStartYear, month, year, pool, value) => {
    const val = Math.max(0, parseInt(value) || 0)
    const field = pool === 'Home' ? 'homeDeposit' : 'officeDeposit'

    setBudgets(prev => {
      const idx = prev.findIndex(b => b.fyStartYear === fyStartYear && b.month === month)
      if (idx > -1) {
        const copy = [...prev]
        copy[idx] = { ...copy[idx], [field]: val, year }
        return copy
      }
      return [...prev, { fyStartYear, month, year, homeDeposit: 0, officeDeposit: 0, [field]: val }]
    })

    try {
      const res = await fetch(`${API_BASE}/budget/set`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fyStartYear, month, year, [field]: val }),
      })
      if (!res.ok) throw new Error(`Server responded ${res.status}`)
    } catch (err) {
      console.error('Failed to save budget:', err)
    }
  }, [])

  const handleTransfer = useCallback(async (fyStartYear, month, year, from, to, amount) => {
    const amt = Math.max(0, parseInt(amount) || 0)
    if (amt <= 0 || from === to) return
    try {
      const res = await fetch(`${API_BASE}/budget/transfer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fyStartYear, month, year, from, to, amount: amt }),
      })
      if (!res.ok) throw new Error(`Server responded ${res.status}`)
      const data = await res.json()
      if (data?.transfer) setTransfers(prev => [...prev, data.transfer])
    } catch (err) {
      console.error('Failed to transfer:', err)
    }
  }, [])

  const handleDeleteTransfer = useCallback(async (transfer) => {
    // optimistic remove — budget chain recomputes immediately
    const prevTransfers = transfers
    setTransfers(prev => prev.filter(t => t._id !== transfer._id))
    try {
      const res = await fetch(`${API_BASE}/budget/transfer/${transfer._id}`, {
        method: 'DELETE',
      })
      if (!res.ok) throw new Error(`Server responded ${res.status}`)
    } catch (err) {
      console.error('Failed to undo transfer:', err)
      setTransfers(prevTransfers)   // rollback on failure
    }
  }, [transfers])


  const handleAmountOverrideSave = useCallback(async (newAmount) => {
    if (!overrideTarget) return
    const { emp, month, year } = overrideTarget
    const calYr  = calYearForFYMonth(year, month)
    const realId = resolveRealId(emp._id, month, year)
    if (!realId) return
    setSavingOverride(true)
    try {
      await fetch(
        `${API_BASE}/employee/update-amount-override/${realId}`,
        { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ year: calYr, month, amount: newAmount }) }
      )
      setAllExpenses(prev => {
        const updated = prev.map(e => {
          if (e._id !== realId) return e
          const overrides = [...(e.amountOverrides || [])]
          const idx = overrides.findIndex(ov => ov.year === calYr && ov.month === month)
          if (idx > -1) overrides[idx] = { year: calYr, month, amount: newAmount }
          else overrides.push({ year: calYr, month, amount: newAmount })
          return { ...e, amountOverrides: overrides }
        })
        sessionStorage.setItem(CACHE_KEY, JSON.stringify(updated))
        return updated
      })
      setOverrideTarget(null)
    } catch (err) {
      console.error('Failed to save amount override:', err)
    } finally {
      setSavingOverride(false)
    }
  }, [overrideTarget, resolveRealId])

  const handleAmountOverrideRemove = useCallback(async () => {
    if (!overrideTarget) return
    const { emp, month, year } = overrideTarget
    const calYr  = calYearForFYMonth(year, month)
    const realId = resolveRealId(emp._id, month, year)
    if (!realId) return
    setSavingOverride(true)
    try {
      await fetch(
        `${API_BASE}/employee/remove-amount-override/${realId}`,
        { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ year: calYr, month }) }
      )
      setAllExpenses(prev => {
        const updated = prev.map(e => {
          if (e._id !== realId) return e
          const overrides = (e.amountOverrides || []).filter(ov => !(ov.year === calYr && ov.month === month))
          return { ...e, amountOverrides: overrides }
        })
        sessionStorage.setItem(CACHE_KEY, JSON.stringify(updated))
        return updated
      })
      setOverrideTarget(null)
    } catch (err) {
      console.error('Failed to remove amount override:', err)
    } finally {
      setSavingOverride(false)
    }
  }, [overrideTarget, resolveRealId])

  const handleCarryForwardRequest = useCallback((emp) => {
    setCarryForwardTarget(emp)
  }, [])

  const handleCarryForwardConfirm = useCallback(async () => {
    if (!carryForwardTarget) return
    const emp         = carryForwardTarget
    const previousVal = emp.carryForward !== false
    const newVal      = !previousVal
    const today        = new Date()
    const todayFY       = toFYStartYear(today)
    const todayMon      = MONTHS[today.getMonth()]
    const realId         = resolveRealId(emp._id, todayMon, todayFY)
    if (!realId) { setCarryForwardTarget(null); return }

    setSavingCarryForwardId(emp._id)

    setAllExpenses(prev => {
      const updated = prev.map(e => e._id === realId ? { ...e, carryForward: newVal } : e)
      sessionStorage.setItem(CACHE_KEY, JSON.stringify(updated))
      return updated
    })

    try {
      const res = await fetch(`${API_BASE}/employee/update-carry-forward/${realId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ carryForward: newVal }),
      })
      if (!res.ok) throw new Error(`Server responded ${res.status}`)
      const data = await res.json()
      const serverVal = data?.employee?.carryForward ?? data?.carryForward
      const finalVal  = typeof serverVal === 'boolean' ? serverVal : newVal
      setAllExpenses(prev => {
        const updated = prev.map(e => e._id === realId ? { ...e, carryForward: finalVal } : e)
        sessionStorage.setItem(CACHE_KEY, JSON.stringify(updated))
        return updated
      })
    } catch (err) {
      console.error('Failed to update carry-forward:', err)
      setAllExpenses(prev => {
        const rolledBack = prev.map(e => e._id === realId ? { ...e, carryForward: previousVal } : e)
        sessionStorage.setItem(CACHE_KEY, JSON.stringify(rolledBack))
        return rolledBack
      })
    } finally {
      setSavingCarryForwardId(null)
      setCarryForwardTarget(null)
    }
  }, [carryForwardTarget, resolveRealId])

  const handleConvertRequest = useCallback((emp) => {
    setConvertTarget(emp)
  }, [])

  const handleConvertConfirm = useCallback(async (amount, date) => {
    if (!convertTarget) return
    const emp = convertTarget

    let realId = emp._id
    if (emp._merged) {
      const d = new Date(date)
      const rec = resolveRecordForMonth(emp, d.getMonth(), d.getFullYear())
        || emp._records[emp._records.length - 1]
      realId = rec?._id
    }
    if (!realId) { setConvertTarget(null); return }

    setSavingConvertId(emp._id)
    try {
      const res = await fetch(`${API_BASE}/employee/convert-to-onetime/${realId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount, date }),
      })
      if (!res.ok) throw new Error(`Server responded ${res.status}`)
      const data = await res.json()
      const updatedRec = data?.employee

      setAllExpenses(prev => {
        const updated = prev.map(e =>
          e._id === realId
            ? (updatedRec || { ...e, type: 'one-time', amount, date, startDate: undefined, endDate: null, amountOverrides: [], payments: [], carryForward: true })
            : e
        )
        sessionStorage.setItem(CACHE_KEY, JSON.stringify(updated))
        return updated
      })
      setConvertTarget(null)
    } catch (err) {
      console.error('Failed to convert to one-time:', err)
    } finally {
      setSavingConvertId(null)
    }
  }, [convertTarget])

  const handleEditOneTimeRequest = useCallback((expense) => {
    setEditOneTimeTarget(expense)
  }, [])

  const handleEditOneTimeSave = useCallback(async (fields) => {
    if (!editOneTimeTarget) return
    const realId = editOneTimeTarget._id
    setSavingEditOneTime(true)

    setAllExpenses(prev => {
      const updated = prev.map(e => e._id === realId ? { ...e, ...fields } : e)
      sessionStorage.setItem(CACHE_KEY, JSON.stringify(updated))
      return updated
    })

    try {
      const res = await fetch(`${API_BASE}/employee/update-onetime/${realId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(fields),
      })
      if (!res.ok) throw new Error(`Server responded ${res.status}`)
      const data = await res.json()
      const updatedRec = data?.employee

      if (updatedRec) {
        setAllExpenses(prev => {
          const updated = prev.map(e => e._id === realId ? updatedRec : e)
          sessionStorage.setItem(CACHE_KEY, JSON.stringify(updated))
          return updated
        })
      }
      setEditOneTimeTarget(null)
    } catch (err) {
      console.error('Failed to edit one-time expense:', err)
      setAllExpenses(prev => {
        const rolledBack = prev.map(e => e._id === realId ? editOneTimeTarget : e)
        sessionStorage.setItem(CACHE_KEY, JSON.stringify(rolledBack))
        return rolledBack
      })
    } finally {
      setSavingEditOneTime(false)
    }
  }, [editOneTimeTarget])

  const handleCategoryChange = useCallback(async (expense, newCategory) => {
    const ids = expense._merged ? expense._records.map(r => r._id) : [expense._id]
    setSavingCategoryId(expense._id)

    setAllExpenses(prev => {
      const updated = prev.map(e => ids.includes(e._id) ? { ...e, category: newCategory } : e)
      sessionStorage.setItem(CACHE_KEY, JSON.stringify(updated))
      return updated
    })

    try {
      if (ids.length > 1) {
        const res = await fetch(`${API_BASE}/employee/update-category-bulk`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ids, category: newCategory }),
        })
        if (!res.ok) throw new Error(`Server responded ${res.status}`)
      } else {
        const res = await fetch(`${API_BASE}/employee/update-category/${ids[0]}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ category: newCategory }),
        })
        if (!res.ok) throw new Error(`Server responded ${res.status}`)
      }
    } catch (err) {
      console.error('Failed to update category:', err)
      setAllExpenses(prev => {
        const rolledBack = prev.map(e => {
          if (!ids.includes(e._id)) return e
          const orig = expense._merged
            ? expense._records.find(r => r._id === e._id)
            : expense
          return { ...e, category: orig?.category || 'Office' }
        })
        sessionStorage.setItem(CACHE_KEY, JSON.stringify(rolledBack))
        return rolledBack
      })
    } finally {
      setSavingCategoryId(null)
    }
  }, [])

  const handleDeleteRequest = useCallback((expense) => { setDeleteTarget(expense) }, [])

  const handleDeleteConfirm = useCallback(async () => {
    if (!deleteTarget) return
    setDeleting(true)
    const idsToDelete = deleteTarget._merged
      ? deleteTarget._records.map(r => r._id)
      : [deleteTarget._id]
    try {
      await Promise.all(idsToDelete.map(id =>
        fetch(`${API_BASE}/employee/delete/${id}`, { method: 'DELETE' })
      ))
      setAllExpenses(prev => {
        const remaining = prev.filter(e => !idsToDelete.includes(e._id))
        sessionStorage.setItem(CACHE_KEY, JSON.stringify(remaining))
        return remaining
      })
      setDeleteTarget(null)
    } catch (err) {
      console.error('Failed to delete expense:', err)
    } finally {
      setDeleting(false)
    }
  }, [deleteTarget])

  const handleDeleteCancel = useCallback(() => { if (!deleting) setDeleteTarget(null) }, [deleting])
    
  const { grouped, groupNames, totalRecurring, totalOneTime } = useMemo(() => {
    const oneTime = visibleExpenses.filter(e => e.type === 'one-time')
    const grouped = groupByExpenseType([...mergedRecurring, ...oneTime])
    const groupNames = Object.keys(grouped).sort((a, b) => a.localeCompare(b))
    return {
      grouped,
      groupNames,
      totalRecurring: mergedRecurring.length,
      totalOneTime: oneTime.length,
    }
  }, [visibleExpenses, mergedRecurring])

  if (loading) return (
    <div style={{ padding: 40, display: 'flex', alignItems: 'center', gap: 12, fontFamily: "'Inter', sans-serif", color: '#6b7280', background: '#f7f7f8', minHeight: '100vh' }}>
      <div style={{ width: 22, height: 22, border: '2.5px solid #ececec', borderTopColor: '#18181b', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
      Loading expenses…
    </div>
  )

  if (error) return (
    <div style={{ padding: 40, fontFamily: "'Inter', sans-serif", color: '#dc2626', background: '#f7f7f8', minHeight: '100vh' }}>{error}</div>
  )

  return (
    <div style={{ padding: '32px 24px 60px', background: '#f7f7f8', minHeight: '100vh', fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif" }}>
      {deleteTarget && (
        <DeleteModal expense={deleteTarget} onConfirm={handleDeleteConfirm} onCancel={handleDeleteCancel} deleting={deleting} />
      )}
      {monthViewIndex !== null && (
        <MonthViewModal
          monthIndex={monthViewIndex}
          mergedRecurring={mergedRecurring}
          allExpenses={visibleExpenses}
          monthData={monthData}
          onClose={() => setMonthViewIndex(null)}
          onMarkPaid={handleMarkPaid}
          savingPaidId={savingPaidId}
          onPaidEdit={handleMonthPaidEdit}
          onAmountEdit={handleMonthAmountEdit}
          budgets={budgets}
          transfers={transfers}
          borrows={borrows}
          lendings={lendings}
          onSetBudget={handleSetBudget}
          onTransfer={handleTransfer}
          onAddExpense={() => { setMonthViewIndex(null); navigate('/employee') }}
          onDeleteTransfer={handleDeleteTransfer}

        />
      )}
      {overrideTarget && (
        <AmountOverrideModal
          emp={overrideTarget.emp}
          month={overrideTarget.month}
          year={overrideTarget.year}
          currentAmt={overrideTarget.currentAmt}
          existingOverride={(() => {
            const realId = resolveRealId(overrideTarget.emp._id, overrideTarget.month, overrideTarget.year)
            const calYr  = calYearForFYMonth(overrideTarget.year, overrideTarget.month)
            const rec = allExpenses.find(e => e._id === realId)
            return rec?.amountOverrides?.find(ov => ov.year === calYr && ov.month === overrideTarget.month)
          })()}
          onSave={handleAmountOverrideSave}
          onRemove={handleAmountOverrideRemove}
          onCancel={() => { if (!savingOverride) setOverrideTarget(null) }}
          saving={savingOverride}
        />
      )}
      {carryForwardTarget && (
        <CarryForwardModal
          emp={carryForwardTarget}
          currentlyOn={carryForwardTarget.carryForward !== false}
          onConfirm={handleCarryForwardConfirm}
          onCancel={() => { if (!savingCarryForwardId) setCarryForwardTarget(null) }}
          saving={savingCarryForwardId === carryForwardTarget._id}
        />
      )}
      {convertTarget && (
        <ConvertToOneTimeModal
          emp={convertTarget}
          defaultAmount={convertTarget.amount}
          defaultDate={(() => {
            const d = convertTarget.startDate ? parseUTCDate(convertTarget.startDate) : new Date()
            return d.toISOString().slice(0, 10)
          })()}
          onConfirm={handleConvertConfirm}
          onCancel={() => { if (!savingConvertId) setConvertTarget(null) }}
          saving={savingConvertId === convertTarget._id}
        />
      )}
      {editOneTimeTarget && (
        <EditOneTimeModal
          expense={editOneTimeTarget}
          onSave={handleEditOneTimeSave}
          onCancel={() => { if (!savingEditOneTime) setEditOneTimeTarget(null) }}
          saving={savingEditOneTime}
        />
      )}

      
      <div style={{ marginBottom: 28, display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 500, letterSpacing: 0.4, textTransform: 'uppercase', color: '#9ca3af', marginBottom: 5 }}>Expense Tracker</div>
          <h2 style={{ fontSize: 26, fontWeight: 600, color: '#18181b', margin: '0 0 4px', letterSpacing: '-0.4px' }}>All Expenses</h2>
          <p style={{ fontSize: 13, color: '#6b7280', margin: 0 }}>
            {groupNames.length} group{groupNames.length !== 1 ? 's' : ''} &nbsp;·&nbsp;
            {totalRecurring} recurring &nbsp;·&nbsp;
            {totalOneTime} one-time &nbsp;·&nbsp;
            Financial year (Apr–Mar) &nbsp;·&nbsp;
            Click <span style={{ color: '#16a34a', fontWeight: 500 }}>Paid</span> to edit &nbsp;·&nbsp;
            <span style={{ color: '#4f46e5' }}>✏️ Edit amounts</span> to change monthly rates &nbsp;·&nbsp;
            <span style={{ color: '#4f46e5' }}>●</span> = overridden month &nbsp;·&nbsp;
            <span style={{ color: '#4338ca' }}>CF</span> checkbox = carry-forward on/off
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <CategoryFilterDropdown value={categoryFilter} onChange={setCategoryFilter} />
          <MonthPickerDropdown onSelect={(i) => setMonthViewIndex(i)} />
          <button className="add-expense-btn" onClick={() => navigate('/employee')}>
            <span className="add-expense-btn-icon">+</span>
            Add Expense
          </button>
        </div>
      </div>

      {groupNames.length === 0 && (
        <div style={{ textAlign: 'center', padding: '60px 0', color: '#9ca3af' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>📭</div>
          <div style={{ fontSize: 16, fontWeight: 600, color: '#6b7280' }}>No expenses yet</div>
          <div style={{ fontSize: 13, marginTop: 4 }}>Add your first expense to see it here.</div>
        </div>
      )}

      {groupNames.map((typeName, idx) => {
        const groupExps     = grouped[typeName]
        const recurringEmps = groupExps.filter(e => e.type === 'recurring')
        const oneTimeEmps   = groupExps.filter(e => e.type === 'one-time')
        return (
          <ExpenseTypeGroup
            key={typeName} typeName={typeName}
            recurringEmps={recurringEmps} oneTimeEmps={oneTimeEmps}
            monthData={monthData} editing={editing} editVal={editVal}
            inputRef={inputRef} setEditVal={setEditVal}
            handleEditStart={handleEditStart} handleEditCommit={handleEditCommit}
            setEditing={setEditing} savingCell={savingCell}
            onDeleteRequest={handleDeleteRequest}
            onAmountOverrideRequest={handleAmountOverrideRequest}
            onCarryForwardRequest={handleCarryForwardRequest}
            savingCarryForwardId={savingCarryForwardId}
            onConvertRequest={handleConvertRequest}
            savingConvertId={savingConvertId}
            onEditRequest={handleEditOneTimeRequest}
            onCategoryChange={handleCategoryChange}
            savingCategoryId={savingCategoryId}
            defaultOpen={idx === 0}
          />
        )
      })}

      <p style={{ marginTop: 16, fontSize: 11.5, color: '#9ca3af', textAlign: 'center' }}>
        Financial year runs Apr–Mar &nbsp;·&nbsp;
        Scroll right to see all months &nbsp;·&nbsp;
        Click any <span style={{ color: '#16a34a' }}>Paid</span> cell to edit &nbsp;·&nbsp;
        Use <span style={{ color: '#4f46e5' }}>✏️ Edit amounts</span> to change rates mid-year &nbsp;·&nbsp;
        <span style={{ color: '#4f46e5' }}>●</span> = overridden month &nbsp;·&nbsp;
        <span style={{ color: '#4338ca' }}>CF</span> checkbox = carry-forward on/off
      </p>
    </div>
  )
}

export default EmployeeTable
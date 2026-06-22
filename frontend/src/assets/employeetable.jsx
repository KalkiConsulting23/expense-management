import React, { useEffect, useState, useRef, useMemo, useCallback, memo } from 'react'
import { useNavigate } from 'react-router-dom'


const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const CACHE_KEY = 'local_employee_data_cache'
const API_BASE = import.meta.env.VITE_API_BASE
console.log('API_BASE =', API_BASE)
const fmt = (n) => '₹' + Number(n).toLocaleString('en-IN')

// ─── Period filter config ────────────────────────────────────────────────────
const PERIOD_OPTIONS = [
  { label: 'Full Year', value: 'full', months: MONTHS },
  { label: 'H1',        value: 'h1',   months: ['Jan','Feb','Mar','Apr','May','Jun'] },
  { label: 'H2',        value: 'h2',   months: ['Jul','Aug','Sep','Oct','Nov','Dec'] },
  { label: 'Q1',        value: 'q1',   months: ['Jan','Feb','Mar'] },
  { label: 'Q2',        value: 'q2',   months: ['Apr','May','Jun'] },
  { label: 'Q3',        value: 'q3',   months: ['Jul','Aug','Sep'] },
  { label: 'Q4',        value: 'q4',   months: ['Oct','Nov','Dec'] },
]

function getMonthsForPeriod(periodValue) {
  return PERIOD_OPTIONS.find(p => p.value === periodValue)?.months || MONTHS
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
// Merge recurring records that share the same expenseName into one virtual
// "merged employee". Ranges are assumed non-overlapping.
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
    // latest end: null if any record is ongoing
    const anyOngoing = sorted.some(r => !r.endDate)
    let latestEnd = null
    if (!anyOngoing) {
      latestEnd = sorted.reduce((acc, r) => {
        const e = parseUTCDate(r.endDate)
        return !acc || e > acc ? e : acc
      }, null)
    }

    // union overrides, each tagged with the source record id
    const allOverrides = sorted.flatMap(r =>
      (r.amountOverrides || []).map(ov => ({ ...ov, _srcId: r._id }))
    )

    merged.push({
      _id: `merged::${name}`,
      _merged: true,
      _records: sorted,
      type: 'recurring',
      expenseName: name,
      expenseType: earliest.expenseType,
      amount: earliest.amount,          // base shown in the row subtitle
      startDate: earliest.startDate,
      endDate: latestEnd ? latestEnd.toISOString() : null,
      amountOverrides: allOverrides,
    })
  })

  return merged
}

// Which underlying record is active in this month/year? (non-overlapping ⇒ first match)
function resolveRecordForMonth(mergedEmp, monthIndex, year) {
  if (!mergedEmp?._records) return mergedEmp
  return mergedEmp._records.find(r => isMonthActive(r, monthIndex, year)) || null
}

// Build month data for a (possibly merged) employee for one year.
// paidMapByMonth: { Jan: number, ... } already resolved for this year.
function buildMonthData(emp, year, paidMap = {}) {
  let carry = 0
  const result = {}
  MONTHS.forEach((m, i) => {
    // For merged employees, the active record decides amount + activity.
    const activeRec = emp._merged ? resolveRecordForMonth(emp, i, year) : emp
    const active = emp._merged
      ? !!activeRec
      : isMonthActive(emp, i, year)

    if (!active) {
      result[m] = { amt: 0, paid: 0, carry: 0, active: false }
      return
    }
    const baseAmount = activeRec.amount
    const overrides  = activeRec.amountOverrides
    const baseAmt    = getEffectiveAmount(baseAmount, overrides, i, year)
    const paid       = paidMap[m] !== undefined ? paidMap[m] : 0
    const totalDue   = baseAmt + carry
    carry            = totalDue - paid
    result[m]        = { amt: baseAmt, paid, carry, active: true, _srcId: activeRec._id }
  })
  return result
}

// Build the per-month paid map for a merged (or single) employee for a year,
// pulling each month's payment from whichever record is active that month.
function buildPaidMapForYear(emp, year) {
  const paidMap = {}
  MONTHS.forEach((m, i) => {
    const rec = emp._merged ? resolveRecordForMonth(emp, i, year) : emp
    if (!rec) return
    const pay = (rec.payments || []).find(p => p.year === year && p.month === m)
    if (pay) paidMap[m] = pay.paid
  })
  return paidMap
}

function recalcEmployee(emp, year, oldData, changedMonth, newPaidValue) {
  const paidMap = {}
  MONTHS.forEach((m) => { paidMap[m] = oldData[m]?.paid })
  paidMap[changedMonth] = newPaidValue
  return buildMonthData(emp, year, paidMap)
}

function rebuildAllYearsForEmp(emp) {
  const result = {}
  getEmployeeYears(emp).forEach(year => {
    result[`${emp._id}_${year}`] = buildMonthData(emp, year, buildPaidMapForYear(emp, year))
  })
  return result
}

function getEmployeeYears(emp) {
  // For merged employees, span across all underlying records.
  const records = emp._merged ? emp._records : [emp]
  const set = new Set()
  records.forEach(rec => {
    const start = parseUTCDate(rec.startDate).getFullYear()
    const end   = rec.endDate ? parseUTCDate(rec.endDate).getFullYear() : new Date().getFullYear()
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
          background: open ? '#f5ece0' : '#faf6ee',
          border: '1.5px solid #e8dece', borderRadius: 10,
          padding: '4px 11px 4px 12px', cursor: 'pointer',
          fontFamily: "'DM Sans', sans-serif", fontSize: 11, fontWeight: 500,
          color: '#7a6858', transition: 'all 0.15s',
          boxShadow: open ? '0 2px 8px rgba(160,130,90,0.15)' : 'none',
          whiteSpace: 'nowrap',
        }}
      >
        <span style={{ fontSize: 10, color: '#b08a5e' }}>📅</span>
        <span style={{ color: '#2e2318', fontWeight: 600 }}>{selected.label}</span>
        <span style={{
          fontSize: 8, color: '#c5b49e',
          transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
          transition: 'transform 0.15s', display: 'inline-block',
        }}>▼</span>
      </button>

      {open && (
        <div
          onClick={e => e.stopPropagation()}
          style={{
            position: 'absolute', top: 'calc(100% + 6px)', right: 0, zIndex: 100,
            background: '#fffdf8', border: '1.5px solid #e8dece', borderRadius: 14,
            boxShadow: '0 8px 28px rgba(160,130,90,0.18)', overflow: 'hidden',
            minWidth: 160, fontFamily: "'DM Sans', sans-serif",
          }}
        >
          <div style={{ padding: '8px 14px 6px', borderBottom: '1px solid #f0ebe0', fontSize: 10, color: '#b08a5e', letterSpacing: 1, textTransform: 'uppercase', fontWeight: 500 }}>
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
                  background: isActive ? '#fdf3e7' : 'transparent',
                  borderLeft: isActive ? '3px solid #c97844' : '3px solid transparent',
                  transition: 'background 0.1s',
                }}
                onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = '#faf6ee' }}
                onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent' }}
              >
                <span style={{ fontSize: 12, fontWeight: isActive ? 600 : 400, color: isActive ? '#a05e2a' : '#4a3c30' }}>
                  {opt.label}
                </span>
                <span style={{ fontSize: 10, color: '#c5b49e', marginLeft: 8 }}>
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

// ─── Shared sub-components ────────────────────────────────────────────────────
const Avatar = memo(function Avatar({ name = '' }) {
  const palette = ['#c97844','#b08a5e','#8c7a68','#a05e2a','#7a6050','#d4a070','#9a8775','#b5672f']
  const color   = palette[name.charCodeAt(0) % palette.length]
  const initials = name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
  return (
    <div style={{
      width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
      background: color + '22', border: `1.5px solid ${color}55`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: 11, fontWeight: 600, color,
      fontFamily: "'DM Sans', sans-serif", letterSpacing: 0.5,
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
        background: 'rgba(46,35,24,0.35)', backdropFilter: 'blur(3px)',
      }}
      onClick={onCancel}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: '#fffdf8', border: '1.5px solid #e8dece',
          borderRadius: 20, boxShadow: '0 8px 40px rgba(160,130,90,0.22)',
          padding: '32px 32px 24px', maxWidth: 380, width: '90vw',
          fontFamily: "'DM Sans', sans-serif",
        }}
      >
        <div style={{ width: 52, height: 52, borderRadius: 14, background: '#fff4f0', border: '1.5px solid #f0c4b0', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, marginBottom: 16 }}>🗑️</div>
        <div style={{ fontSize: 17, fontWeight: 600, color: '#2e2318', fontFamily: "'Lora', serif", marginBottom: 8 }}>Delete Expense?</div>
        <div style={{ fontSize: 13, color: '#9a8775', marginBottom: 6, lineHeight: 1.5 }}>You're about to delete:</div>
        <div style={{ background: '#faf6ee', border: '1.5px solid #e8dece', borderRadius: 12, padding: '12px 16px', marginBottom: 20 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: '#2e2318' }}>{expense.expenseName}</div>
          <div style={{ fontSize: 12, color: '#b08a5e', marginTop: 4 }}>
            {expense.expenseType} &nbsp;·&nbsp;
            <span style={{ color: '#b5672f', fontFamily: 'monospace' }}>{fmt(expense.amount)}</span>
            {expense.type === 'recurring' ? '/mo' : ' one-time'}
          </div>
          {recordCount > 1 && (
            <div style={{ fontSize: 11, color: '#c97844', marginTop: 6 }}>
              This name has {recordCount} date-range records — all will be deleted.
            </div>
          )}
        </div>
        <div style={{ fontSize: 12, color: '#c97844', marginBottom: 22 }}>⚠️ This action cannot be undone. All payment history will be lost.</div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={onCancel} disabled={deleting} style={{ flex: 1, padding: '9px 0', borderRadius: 12, border: '1.5px solid #e8dece', background: '#faf6ee', color: '#8c7a68', fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif" }}>Cancel</button>
          <button onClick={onConfirm} disabled={deleting} style={{ flex: 1, padding: '9px 0', borderRadius: 12, border: 'none', background: deleting ? '#e0a090' : '#c0392b', color: '#fff', fontSize: 13, fontWeight: 500, cursor: deleting ? 'wait' : 'pointer', fontFamily: "'DM Sans', sans-serif", boxShadow: '0 2px 8px rgba(192,57,43,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
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
      style={{ width: 28, height: 28, borderRadius: 8, flexShrink: 0, border: hover ? '1.5px solid #f0c4b0' : '1.5px solid transparent', background: hover ? '#fff4f0' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontSize: 13, transition: 'all 0.15s', color: hover ? '#c0392b' : '#c5b49e' }}>
      🗑️
    </button>
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

  const monthIdx   = MONTHS.indexOf(month)
  const isBaseAmt  = !existingOverride && parseInt(val) === emp.amount
  const noChange   = existingOverride && parseInt(val) === existingOverride.amount

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(46,35,24,0.45)', backdropFilter: 'blur(4px)' }}
      onClick={onCancel}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{ background: '#fffdf8', border: '1.5px solid #e8dece', borderRadius: 22, boxShadow: '0 12px 50px rgba(120,90,50,0.28)', padding: '30px 30px 24px', maxWidth: 400, width: '92vw', fontFamily: "'DM Sans', sans-serif" }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, marginBottom: 20 }}>
          <div style={{ width: 46, height: 46, borderRadius: 12, background: '#fdf3e7', border: '1.5px solid #f0c490', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, flexShrink: 0 }}>✏️</div>
          <div>
            <div style={{ fontSize: 16, fontWeight: 600, color: '#2e2318', fontFamily: "'Lora', serif" }}>
              Change Amount from {month} {year}
            </div>
            <div style={{ fontSize: 12, color: '#9a8775', marginTop: 3 }}>
              {emp.expenseName || emp.name}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, marginBottom: 18, flexWrap: 'wrap' }}>
          <div style={{ background: '#faf6ee', border: '1.5px solid #e8dece', borderRadius: 8, padding: '5px 12px', fontSize: 11, color: '#8c7a68' }}>
            Base: <span style={{ fontFamily: 'monospace', color: '#b5672f', fontWeight: 600 }}>{fmt(emp.amount)}/mo</span>
          </div>
          <div style={{ background: '#faf6ee', border: '1.5px solid #e8dece', borderRadius: 8, padding: '5px 12px', fontSize: 11, color: '#8c7a68' }}>
            Current: <span style={{ fontFamily: 'monospace', color: '#c97844', fontWeight: 600 }}>{fmt(currentAmt)}/mo</span>
          </div>
        </div>

        <div style={{ marginBottom: 14 }}>
          <label style={{ fontSize: 11, fontWeight: 500, color: '#9a8775', letterSpacing: 0.8, textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>
            New monthly amount from {month} {year}
          </label>
          <div style={{ position: 'relative' }}>
            <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#b08a5e', fontFamily: 'monospace', fontSize: 15, fontWeight: 600 }}>₹</span>
            <input
              ref={inputRef}
              type="number"
              value={val}
              onChange={e => setVal(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') onCancel() }}
              style={{ width: '100%', padding: '11px 12px 11px 28px', border: '1.5px solid #c97844', borderRadius: 12, background: '#fffdf8', fontFamily: 'monospace', fontSize: 16, fontWeight: 600, color: '#2e2318', outline: 'none', boxShadow: '0 0 0 3px rgba(201,120,68,0.1)' }}
            />
          </div>
        </div>

        <div style={{ background: '#faf6ee', border: '1.5px solid #e8dece', borderRadius: 12, padding: '10px 14px', marginBottom: 20, fontSize: 11, color: '#8c7a68', lineHeight: 1.7 }}>
          <div style={{ fontWeight: 600, color: '#6a5848', marginBottom: 4 }}>Impact preview</div>
          <div>
            {month} – Dec {year}: &nbsp;
            <span style={{ fontFamily: 'monospace', color: '#b5672f', fontWeight: 600 }}>
              {parseInt(val) > 0 ? fmt(parseInt(val)) : '—'}/mo
            </span>
          </div>
          <div style={{ color: '#c5b49e', fontSize: 10, marginTop: 2 }}>
            Jan – {MONTHS[monthIdx > 0 ? monthIdx - 1 : 0]} {year}: &nbsp;
            <span style={{ fontFamily: 'monospace' }}>{fmt(currentAmt)}/mo (unchanged)</span>
          </div>
          <div style={{ color: '#c5b49e', fontSize: 10, marginTop: 1 }}>
            Carry-forward recalculated from {month} {year} onwards
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button onClick={onCancel} style={{ flex: 1, minWidth: 80, padding: '9px 0', borderRadius: 12, border: '1.5px solid #e8dece', background: '#faf6ee', color: '#8c7a68', fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif" }}>
            Cancel
          </button>
          {existingOverride && (
            <button
              onClick={onRemove}
              disabled={saving}
              style={{ flex: 1, minWidth: 80, padding: '9px 0', borderRadius: 12, border: '1.5px solid #f0c4b0', background: '#fff4f0', color: '#c0392b', fontSize: 13, fontWeight: 500, cursor: saving ? 'wait' : 'pointer', fontFamily: "'DM Sans', sans-serif" }}
            >
              Remove Override
            </button>
          )}
          <button
            onClick={handleSave}
            disabled={saving || isBaseAmt || noChange || !val || parseInt(val) <= 0}
            style={{
              flex: 2, minWidth: 120, padding: '9px 0', borderRadius: 12, border: 'none',
              background: (saving || isBaseAmt || noChange || !val || parseInt(val) <= 0) ? '#e8dece' : '#c97844',
              color: (saving || isBaseAmt || noChange || !val || parseInt(val) <= 0) ? '#b0a090' : '#fff',
              fontSize: 13, fontWeight: 600, cursor: (saving || isBaseAmt || noChange) ? 'not-allowed' : 'pointer',
              fontFamily: "'DM Sans', sans-serif", display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              boxShadow: (saving || isBaseAmt || noChange) ? 'none' : '0 2px 8px rgba(201,120,68,0.28)',
              transition: 'all 0.15s',
            }}
          >
            {saving
              ? <><div style={{ width: 13, height: 13, border: '2px solid rgba(255,255,255,0.4)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />Saving…</>
              : `Apply from ${month}`
            }
          </button>
        </div>

        {(isBaseAmt || noChange) && !saving && (
          <div style={{ marginTop: 10, fontSize: 11, color: '#b08a5e', textAlign: 'center' }}>
            {isBaseAmt ? 'This matches the base amount — no override needed.' : 'No change from existing override.'}
          </div>
        )}
      </div>
    </div>
  )
})

// ─── One-Time table (period-aware) ────────────────────────────────────────────
const OneTimeExpensesTable = memo(function OneTimeExpensesTable({ expenses, onDeleteRequest, activePeriodMonths }) {
  const filtered = useMemo(() => {
    if (!activePeriodMonths) return expenses
    return expenses.filter(exp => {
      const d = parseUTCDate(exp.date)
      const mName = MONTHS[d.getMonth()]
      return activePeriodMonths.includes(mName)
    })
  }, [expenses, activePeriodMonths])

  if (!filtered || filtered.length === 0) return null
  const total = filtered.reduce((s, e) => s + e.amount, 0)

  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 7, background: '#fdf3e7', color: '#a05e2a', border: '1.5px solid #f0c490', padding: '4px 12px', borderRadius: 20, fontSize: 10, fontWeight: 500, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 10, fontFamily: "'DM Sans', sans-serif" }}>
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#c97844', display: 'inline-block' }} />
        One-Time
      </div>
      <div style={{ overflowX: 'auto', borderRadius: 14, border: '1.5px solid #e8dece', background: '#fffdf8', boxShadow: '0 2px 0 #e2d9c8' }}>
        <table style={{ borderCollapse: 'collapse', width: '100%', whiteSpace: 'nowrap' }}>
          <thead>
            <tr>
              {['#', 'Expense Name', 'Amount', 'Date', ''].map((h, i) => (
                <th key={i} style={{ background: '#faf6ee', color: '#b08a5e', padding: '10px 16px', textAlign: i === 2 ? 'right' : 'left', fontSize: 10, fontWeight: 500, letterSpacing: 1, textTransform: 'uppercase', borderBottom: '1.5px solid #e8dece', borderRight: i < 4 ? '1px solid #f0ebe0' : 'none', fontFamily: "'DM Sans', sans-serif", width: i === 4 ? 48 : undefined }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((exp, idx) => (
              <tr key={exp._id} onMouseEnter={e => e.currentTarget.style.background = '#fdf8f0'} onMouseLeave={e => e.currentTarget.style.background = ''}>
                <td style={{ padding: '11px 16px', borderBottom: '1px solid #f0ebe0', fontSize: 11, color: '#c5b49e', fontFamily: 'monospace', width: 40, borderRight: '1px solid #f0ebe0' }}>{idx + 1}</td>
                <td style={{ padding: '11px 16px', borderBottom: '1px solid #f0ebe0', fontSize: 13, fontWeight: 500, color: '#2e2318', borderRight: '1px solid #f0ebe0', fontFamily: "'DM Sans', sans-serif" }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ width: 26, height: 26, borderRadius: 8, background: '#fdf3e7', border: '1.5px solid #f0c490', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, flexShrink: 0 }}>⚡</span>
                    {exp.expenseName}
                  </div>
                </td>
                <td style={{ padding: '11px 16px', borderBottom: '1px solid #f0ebe0', textAlign: 'right', fontFamily: 'monospace', fontSize: 13, fontWeight: 600, color: '#b5672f', background: '#fdf8f0', borderRight: '1px solid #f0ebe0' }}>{fmt(exp.amount)}</td>
                <td style={{ padding: '11px 16px', borderBottom: '1px solid #f0ebe0', fontSize: 12, color: '#9a8775', borderRight: '1px solid #f0ebe0', fontFamily: "'DM Sans', sans-serif" }}>
                  {parseUTCDate(exp.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                </td>
                <td style={{ padding: '8px 10px', borderBottom: '1px solid #f0ebe0', textAlign: 'center', width: 48 }}>
                  <TrashBtn onClick={() => onDeleteRequest(exp)} />
                </td>
              </tr>
            ))}
            <tr>
              <td colSpan={2} style={{ padding: '10px 16px', background: '#faf6ee', fontSize: 10, fontWeight: 500, color: '#8c7a68', textTransform: 'uppercase', letterSpacing: 0.8, borderTop: '1.5px solid #e8dece', fontFamily: "'DM Sans', sans-serif" }}>
                Total ({filtered.length} expense{filtered.length !== 1 ? 's' : ''})
              </td>
              <td style={{ padding: '10px 16px', background: '#fdf3e7', textAlign: 'right', fontFamily: 'monospace', fontSize: 13, fontWeight: 700, color: '#a05e2a', borderTop: '1.5px solid #e8dece' }}>{fmt(total)}</td>
              <td colSpan={2} style={{ background: '#faf6ee', borderTop: '1.5px solid #e8dece' }} />
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
})

// ─── Recurring Year Table (period-aware, with amount-edit mode) ───────────────
const RecurringYearTable = memo(function RecurringYearTable({
  year, activeEmps, monthData, editing, editVal, inputRef,
  setEditVal, handleEditStart, handleEditCommit, setEditing, savingCell,
  onDeleteRequest, onAmountOverrideRequest
}) {
  const [period, setPeriod] = useState('full')
  const [amtEditMode, setAmtEditMode] = useState(false)
  const visibleMonths = useMemo(() => getMonthsForPeriod(period), [period])

  const empTotals = useMemo(() => {
    const map = {}
    activeEmps.forEach(emp => {
      const data = monthData[`${emp._id}_${year}`] || {}
      const totalPaid = visibleMonths.reduce((s, m) => s + (data[m]?.paid || 0), 0)
      const totalAmt  = visibleMonths.reduce((s, m) => s + (data[m]?.active ? (data[m]?.amt || 0) : 0), 0)
      const lastActiveMonth = [...visibleMonths].reverse().find(m => data[m]?.active)
      const endCarry = lastActiveMonth ? (data[lastActiveMonth]?.carry || 0) : 0
      map[emp._id] = { paid: totalPaid, amt: totalAmt, due: Math.max(0, endCarry) }
    })
    return map
  }, [activeEmps, monthData, year, visibleMonths])

  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, gap: 10, flexWrap: 'wrap' }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 7, background: '#f5ece0', color: '#8c7a68', border: '1.5px solid #e8dece', padding: '4px 12px', borderRadius: 20, fontSize: 10, fontWeight: 500, letterSpacing: 1, textTransform: 'uppercase', fontFamily: "'DM Sans', sans-serif" }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#b08a5e', display: 'inline-block' }} />
          {year} · Recurring
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button
            onClick={() => setAmtEditMode(p => !p)}
            title="Toggle per-month amount editing"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '4px 12px', borderRadius: 10, cursor: 'pointer',
              border: '1.5px solid',
              borderColor: amtEditMode ? '#c97844' : '#e8dece',
              background: amtEditMode ? '#fdf3e7' : '#faf6ee',
              color: amtEditMode ? '#a05e2a' : '#8c7a68',
              fontSize: 11, fontWeight: amtEditMode ? 600 : 500,
              fontFamily: "'DM Sans', sans-serif",
              transition: 'all 0.15s',
              boxShadow: amtEditMode ? '0 1px 6px rgba(201,120,68,0.18)' : 'none',
            }}
          >
            <span style={{ fontSize: 12 }}>✏️</span>
            {amtEditMode ? 'Done editing amounts' : 'Edit amounts'}
          </button>
          <PeriodDropdown value={period} onChange={setPeriod} year={year} />
        </div>
      </div>

      {amtEditMode && (
        <div style={{ marginBottom: 10, background: '#fdf8f0', border: '1.5px solid #f0c490', borderRadius: 10, padding: '8px 14px', fontSize: 11, color: '#a05e2a', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 14 }}>💡</span>
          Click any <strong>Amt</strong> cell to change the monthly amount from that month onwards. Carry-forward will recalculate automatically.
        </div>
      )}

      <div className="emp-table-scroll">
        <table className="emp-table">
          <thead>
            <tr>
              <th className="col-name head" rowSpan={2} style={{ padding: '10px 16px', textAlign: 'left', fontSize: 10, fontWeight: 500, color: '#b08a5e', letterSpacing: 1, textTransform: 'uppercase', borderBottom: '1.5px solid #e8dece', background: '#faf6ee', fontFamily: "'DM Sans', sans-serif" }}>
                Expense
              </th>
              {visibleMonths.map((m) => {
                const i = MONTHS.indexOf(m)
                const anyActive = activeEmps.some(emp => {
                  const data = monthData[`${emp._id}_${year}`] || {}
                  return data[m]?.active
                })
                return (
                  <th key={m} colSpan={2} className={`th-month${!anyActive ? ' inactive-head' : ''}`}>{m}</th>
                )
              })}
              <th colSpan={2} style={{ background: '#f5ece0', color: '#a05e2a', textAlign: 'center', fontSize: 10, fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase', padding: '10px 8px', borderBottom: '1px solid #e8dece', fontFamily: "'DM Sans', sans-serif" }}>
                Total
              </th>
              <th rowSpan={2} style={{ background: '#faf6ee', padding: '10px 10px', borderBottom: '1.5px solid #e8dece', width: 48, borderLeft: '1px solid #f0ebe0' }} />
            </tr>
            <tr>
              {visibleMonths.map((m) => (
                <React.Fragment key={m}>
                  <th className={`th-sub amt${amtEditMode ? ' amt-edit-mode' : ''}`}>Amt</th>
                  <th className="th-sub paid">Paid</th>
                </React.Fragment>
              ))}
              <th className="th-total" style={{ borderRight: '1px solid #f0ebe0' }}>Paid</th>
              <th className="th-total" style={{ color: '#9a8775', background: '#faf6ee' }}>Due</th>
            </tr>
          </thead>

          <tbody>
            {activeEmps.map((emp) => {
              const key  = `${emp._id}_${year}`
              const data = monthData[key] || {}

              return (
                <tr key={emp._id} className="data-row">
                  <td className="col-name td-emp">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                      <Avatar name={emp.expenseName || emp.name || '?'} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 500, color: '#2e2318', fontFamily: "'DM Sans', sans-serif" }}>
                          {emp.expenseName || emp.name}
                        </div>
                        <div style={{ fontSize: 10, color: '#b0a090', marginTop: 2, fontFamily: "'DM Sans', sans-serif" }}>
                          <span style={{ color: '#b5672f', fontFamily: 'monospace' }}>{fmt(emp.amount)}/mo base</span>
                          {emp.amountOverrides?.length > 0 && (
                            <span style={{
                              display: 'inline-flex', alignItems: 'center', gap: 3, marginLeft: 6,
                              background: '#fdf3e7', border: '1px solid #f0c490', color: '#a05e2a',
                              borderRadius: 4, padding: '1px 5px', fontSize: 9, fontWeight: 600,
                              fontFamily: "'DM Sans', sans-serif", verticalAlign: 'middle',
                            }}>
                              ✏️ {emp.amountOverrides.length}
                            </span>
                          )}
                        </div>
                      </div>
                      <TrashBtn onClick={() => onDeleteRequest(emp)} />
                    </div>
                  </td>

                  {visibleMonths.map((m) => {
                    const cell      = data[m]
                    const isEditing = editing?.empId === emp._id && editing?.month === m && editing?.year === year
                    const isSaving  = savingCell?.empId === emp._id && savingCell?.month === m && savingCell?.year === year

                    const hasOverrideHere = !!(cell?._srcId) && emp.amountOverrides?.some(
                      ov => ov.year === year && ov.month === m && ov._srcId === cell._srcId
                    )

                    if (!cell || !cell.active) {
                      return <React.Fragment key={m}><td className="td-inactive" colSpan={2}>—</td></React.Fragment>
                    }

                    const hasCarry  = cell.carry > 0
                    const hasCredit = cell.carry < 0

                    return (
                      <React.Fragment key={m}>
                        <td
                          className={`td-amt${amtEditMode ? ' td-amt-editable' : ''}${hasOverrideHere ? ' td-amt-overridden' : ''}`}
                          onClick={() => {
                            if (!amtEditMode) return
                            onAmountOverrideRequest(emp, m, year, cell.amt)
                          }}
                          title={amtEditMode ? `Click to change amount from ${m} ${year}` : undefined}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 4 }}>
                            {hasOverrideHere && (
                              <span title="Amount overridden this month" style={{ fontSize: 9, color: '#c97844', lineHeight: 1 }}>●</span>
                            )}
                            {amtEditMode && (
                              <span style={{ fontSize: 10, color: '#c5b49e', marginRight: 2 }}>✏️</span>
                            )}
                            <span>{fmt(cell.amt)}</span>
                          </div>
                          {hasCarry  && <div style={{ fontSize: 10, color: '#c97844', marginTop: 2 }}>carry: {fmt(cell.carry)} →</div>}
                          {hasCredit && <div style={{ fontSize: 10, color: '#7a9e5a', marginTop: 2 }}>credit: {fmt(Math.abs(cell.carry))} →</div>}
                        </td>
                        <td
                          className={`td-paid${hasCarry ? ' has-carry' : ''}${isSaving ? ' saving' : ''}`}
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
                              {!isSaving && hasCarry  && <span className="carry-badge">+{fmt(cell.carry)}</span>}
                              {!isSaving && hasCredit && <span className="credit-badge">-{fmt(Math.abs(cell.carry))}</span>}
                            </div>
                          )}
                        </td>
                      </React.Fragment>
                    )
                  })}

                  <td className="td-total-paid">{fmt(empTotals[emp._id]?.paid || 0)}</td>
                  <td className="td-total-amt">{fmt(empTotals[emp._id]?.due || 0)}</td>
                  <td style={{ borderBottom: '1px solid #f0ebe0', borderLeft: '1px solid #f0ebe0' }} />
                </tr>
              )
            })}

            <tr className="footer-row">
              <td className="col-name" style={{ padding: '10px 16px', fontSize: 10, fontWeight: 500, color: '#8c7a68', textTransform: 'uppercase', letterSpacing: 0.8, borderTop: '1.5px solid #e8dece', background: '#faf6ee', textAlign: 'left', fontFamily: "'DM Sans', sans-serif" }}>
                Grand Total
              </td>
              {visibleMonths.map((m) => {
                const tAmt  = activeEmps.reduce((s, e) => s + (monthData[`${e._id}_${year}`]?.[m]?.amt  || 0), 0)
                const tPaid = activeEmps.reduce((s, e) => s + (monthData[`${e._id}_${year}`]?.[m]?.paid || 0), 0)
                return (
                  <React.Fragment key={m}>
                    <td style={{ color: '#b5672f', fontFamily: 'monospace' }}>{fmt(tAmt)}</td>
                    <td style={{ color: '#7a9e5a', borderRight: '1.5px solid #e8dece', fontFamily: 'monospace' }}>{fmt(tPaid)}</td>
                  </React.Fragment>
                )
              })}
              <td style={{ color: '#7a9e5a', fontWeight: 700, background: '#f5f8f0', fontFamily: 'monospace' }}>
                {fmt(activeEmps.reduce((s, e) => s + (empTotals[e._id]?.paid || 0), 0))}
              </td>
              <td style={{ color: '#b0a090', background: '#faf6ee', fontFamily: 'monospace' }}>
                {fmt(activeEmps.reduce((s, e) => s + (empTotals[e._id]?.due || 0), 0))}
              </td>
              <td style={{ background: '#faf6ee', borderTop: '1.5px solid #e8dece', borderLeft: '1px solid #f0ebe0' }} />
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
  onDeleteRequest, onAmountOverrideRequest, defaultOpen = true
}) {
  const [open, setOpen] = useState(defaultOpen)
  const [oneTimePeriod, setOneTimePeriod] = useState('full')
  const oneTimePeriodMonths = useMemo(() => getMonthsForPeriod(oneTimePeriod), [oneTimePeriod])

  const allYears       = useMemo(() => getAllYears(recurringEmps), [recurringEmps])
  const recurringTotal = useMemo(() => recurringEmps.reduce((s, e) => s + e.amount, 0), [recurringEmps])
  const oneTimeTotal   = useMemo(() => oneTimeEmps.reduce((s, e) => s + e.amount, 0), [oneTimeEmps])
  const totalCount     = recurringEmps.length + oneTimeEmps.length

  return (
    <div style={{ marginBottom: 24, borderRadius: 18, border: '1.5px solid #e8dece', overflow: 'hidden', boxShadow: '0 2px 0 #e2d9c8, 0 6px 24px rgba(160,130,90,0.07)' }}>
      <div onClick={() => setOpen(p => !p)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 22px', background: '#faf6ee', borderBottom: open ? '1px solid #e8dece' : 'none', cursor: 'pointer', userSelect: 'none' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 38, height: 38, borderRadius: 10, background: '#f5ece0', border: '1.5px solid #e8dece', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, flexShrink: 0 }}>🗂️</div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 600, color: '#2e2318', fontFamily: "'Lora', serif" }}>{typeName}</div>
            <div style={{ fontSize: 11, color: '#9a8775', marginTop: 2, fontFamily: "'DM Sans', sans-serif" }}>
              {totalCount} expense{totalCount !== 1 ? 's' : ''}
              {recurringEmps.length > 0 && <span> &nbsp;·&nbsp; <span style={{ color: '#b5672f' }}>{fmt(recurringTotal)}/mo recurring</span></span>}
              {oneTimeEmps.length > 0  && <span> &nbsp;·&nbsp; <span style={{ color: '#a05e2a' }}>{fmt(oneTimeTotal)} one-time</span></span>}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {recurringEmps.length > 0 && <div style={{ background: '#fdf3e7', border: '1.5px solid #f0c490', color: '#a05e2a', padding: '3px 11px', borderRadius: 20, fontSize: 11, fontWeight: 500, fontFamily: "'DM Sans', sans-serif" }}>🔁 {recurringEmps.length} Recurring</div>}
          {oneTimeEmps.length  > 0 && <div style={{ background: '#faf6ee', border: '1.5px solid #e8dece', color: '#8c7a68', padding: '3px 11px', borderRadius: 20, fontSize: 11, fontWeight: 500, fontFamily: "'DM Sans', sans-serif" }}>⚡ {oneTimeEmps.length} One-Time</div>}
          <span style={{ color: '#c5b49e', fontSize: 11, transition: 'transform 0.2s', display: 'inline-block', transform: open ? 'rotate(0deg)' : 'rotate(-90deg)' }}>▼</span>
        </div>
      </div>

      {open && (
        <div style={{ padding: '22px', background: '#fffdf8' }}>
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
              />
            )
          })}

          {oneTimeEmps.length > 0 && (
            <div style={{ marginBottom: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, gap: 10 }}>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 7, background: '#fdf3e7', color: '#a05e2a', border: '1.5px solid #f0c490', padding: '4px 12px', borderRadius: 20, fontSize: 10, fontWeight: 500, letterSpacing: 1, textTransform: 'uppercase', fontFamily: "'DM Sans', sans-serif" }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#c97844', display: 'inline-block' }} />
                  One-Time · Filter
                </div>
                <PeriodDropdown value={oneTimePeriod} onChange={setOneTimePeriod} year="All" />
              </div>
              <OneTimeExpensesTable
                expenses={oneTimeEmps}
                onDeleteRequest={onDeleteRequest}
                activePeriodMonths={oneTimePeriod === 'full' ? null : oneTimePeriodMonths}
              />
            </div>
          )}

          {recurringEmps.length === 0 && oneTimeEmps.length === 0 && (
            <p style={{ color: '#b0a090', fontSize: 13, textAlign: 'center', padding: '20px 0', fontFamily: "'DM Sans', sans-serif" }}>No expenses in this group.</p>
          )}
        </div>
      )}
    </div>
  )
})

// ─── Month Picker Dropdown ────────────────────────────────────────────────────
const MONTH_FULL = ['January','February','March','April','May','June','July','August','September','October','November','December']

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
          padding: '9px 18px', borderRadius: 12,
          border: '1.5px solid #e8dece',
          background: open ? '#f5ece0' : '#faf6ee',
          color: '#5a4a38', fontFamily: "'DM Sans', sans-serif",
          fontSize: 13, fontWeight: 500, cursor: 'pointer',
          transition: 'all 0.15s', whiteSpace: 'nowrap', flexShrink: 0,
          boxShadow: open ? '0 3px 12px rgba(160,130,90,0.18)' : 'none',
        }}
      >
        <span style={{ fontSize: 14 }}>🗓️</span>
        Month View
        <span style={{ fontSize: 9, color: '#b08a5e', display: 'inline-block', transform: open ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.15s' }}>▼</span>
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 8px)', right: 0, zIndex: 200,
          background: '#fffdf8', border: '1.5px solid #e8dece', borderRadius: 16,
          boxShadow: '0 12px 40px rgba(160,130,90,0.22)', overflow: 'hidden',
          minWidth: 220, fontFamily: "'DM Sans', sans-serif",
        }}>
          <div style={{ padding: '10px 16px 8px', borderBottom: '1px solid #f0ebe0', fontSize: 10, color: '#b08a5e', letterSpacing: 1, textTransform: 'uppercase', fontWeight: 500 }}>
            View by Month
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 0 }}>
            {MONTHS.map((m, i) => {
              const isCurrentMonth = i === currentMonth
              return (
                <div
                  key={m}
                  onClick={() => { onSelect(i); setOpen(false) }}
                  style={{
                    padding: '10px 8px', textAlign: 'center', cursor: 'pointer',
                    fontSize: 12, fontWeight: isCurrentMonth ? 600 : 400,
                    color: isCurrentMonth ? '#a05e2a' : '#4a3c30',
                    background: isCurrentMonth ? '#fdf3e7' : 'transparent',
                    borderRight: (i % 3 !== 2) ? '1px solid #f5f0e8' : 'none',
                    borderBottom: i < 9 ? '1px solid #f5f0e8' : 'none',
                    transition: 'background 0.1s',
                    position: 'relative',
                  }}
                  onMouseEnter={e => { if (!isCurrentMonth) e.currentTarget.style.background = '#faf6ee' }}
                  onMouseLeave={e => { if (!isCurrentMonth) e.currentTarget.style.background = 'transparent' }}
                >
                  {m}
                  {isCurrentMonth && (
                    <div style={{ position: 'absolute', bottom: 4, left: '50%', transform: 'translateX(-50%)', width: 4, height: 4, borderRadius: '50%', background: '#c97844' }} />
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

// ─── Month View Modal ─────────────────────────────────────────────────────────
const MonthViewModal = memo(function MonthViewModal({ monthIndex, mergedRecurring, allExpenses, monthData, onClose }) {
  const monthName = MONTHS[monthIndex]
  const monthFull = MONTH_FULL[monthIndex]
  const currentYear = new Date().getFullYear()

  const allYears = useMemo(() => {
    const set = new Set()
    mergedRecurring.forEach(emp => getEmployeeYears(emp).forEach(y => set.add(y)))
    allExpenses.filter(e => e.type === 'one-time').forEach(e => set.add(parseUTCDate(e.date).getFullYear()))
    return Array.from(set).sort((a, b) => b - a)
  }, [mergedRecurring, allExpenses])

  const [selectedYear, setSelectedYear] = useState(() => {
    return allYears.includes(currentYear) ? currentYear : (allYears[0] || currentYear)
  })

  const recurringRows = useMemo(() => {
    return mergedRecurring
      .map(emp => {
        const key  = `${emp._id}_${selectedYear}`
        const cell = monthData[key]?.[monthName]
        return { emp, cell }
      })
      .filter(r => r.cell && r.cell.active)
      .map(({ emp, cell }) => ({ ...emp, cell }))
      .sort((a, b) => (a.expenseName || '').localeCompare(b.expenseName || ''))
  }, [mergedRecurring, monthData, selectedYear, monthName])

  const oneTimeRows = useMemo(() => {
    return allExpenses
      .filter(e => {
        if (e.type !== 'one-time') return false
        const d = parseUTCDate(e.date)
        return d.getMonth() === monthIndex && d.getFullYear() === selectedYear
      })
      .map(e => ({ ...e, _sortDate: parseUTCDate(e.date) }))
      .sort((a, b) => a._sortDate - b._sortDate)
  }, [allExpenses, monthIndex, selectedYear])

  const combinedRows = useMemo(() => {
    const recurring = recurringRows.map(emp => {
      const amt  = emp.cell.amt  || 0
      const paid = emp.cell.paid || 0
      return {
        _id: emp._id,
        name: emp.expenseName || emp.name,
        expenseType: emp.expenseType,
        kind: 'recurring',
        amt, paid,
        due: Math.max(0, amt - paid),
        overridden: !!(emp.cell._srcId) && emp.amountOverrides?.some(ov => ov.year === selectedYear && ov.month === monthName && ov._srcId === emp.cell._srcId),
        sub: 'since ' + parseUTCDate(emp.startDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }),
      }
    })
    const oneTime = oneTimeRows.map(exp => ({
      _id: exp._id,
      name: exp.expenseName,
      expenseType: exp.expenseType,
      kind: 'one-time',
      amt: exp.amount,
      paid: exp.amount,
      due: 0,
      overridden: false,
      sub: parseUTCDate(exp.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }),
    }))
    return [...recurring, ...oneTime]
  }, [recurringRows, oneTimeRows, selectedYear, monthName])

  const recurringTotal = recurringRows.reduce((s, r) => s + (r.cell.amt  || 0), 0)
  const recurringPaid  = recurringRows.reduce((s, r) => s + (r.cell.paid || 0), 0)
  const oneTimeTotal   = oneTimeRows.reduce((s, r) => s + r.amount, 0)
  const totalDue     = recurringTotal + oneTimeTotal
  const totalPaid    = recurringPaid + oneTimeTotal
  const totalBalance = Math.max(0, totalDue - totalPaid)

  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [])

  const tdBase = { padding: '11px 14px', borderBottom: '1px solid #f0ebe0', fontSize: 13, fontFamily: "'DM Sans', sans-serif", verticalAlign: 'middle' }

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 500, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(46,35,24,0.4)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: '#fffdf8', border: '1.5px solid #e8dece', borderRadius: 22,
          boxShadow: '0 16px 60px rgba(120,90,50,0.25)',
          width: '92vw', maxWidth: 760, maxHeight: '88vh',
          display: 'flex', flexDirection: 'column',
          fontFamily: "'DM Sans', sans-serif", overflow: 'hidden',
        }}
      >
        <div style={{ padding: '22px 26px 18px', borderBottom: '1.5px solid #e8dece', background: '#faf6ee', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
            <div>
              <div style={{ fontSize: 10, letterSpacing: 2, textTransform: 'uppercase', color: '#b08a5e', marginBottom: 4, fontWeight: 500 }}>Monthly View</div>
              <div style={{ fontFamily: "'Lora', serif", fontSize: 22, fontWeight: 600, color: '#2e2318' }}>{monthFull}</div>
              <div style={{ fontSize: 12, color: '#9a8775', marginTop: 3 }}>
                {recurringRows.length} recurring &nbsp;·&nbsp; {oneTimeRows.length} one-time &nbsp;·&nbsp;
                <span style={{ color: '#b5672f', fontFamily: 'monospace' }}>{fmt(totalDue)}</span> total
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
              <div style={{ display: 'flex', gap: 4 }}>
                {allYears.map(y => (
                  <button key={y} onClick={() => setSelectedYear(y)} style={{ padding: '4px 12px', borderRadius: 8, border: '1.5px solid', borderColor: selectedYear === y ? '#c97844' : '#e8dece', background: selectedYear === y ? '#fdf3e7' : 'transparent', color: selectedYear === y ? '#a05e2a' : '#8c7a68', fontSize: 12, fontWeight: selectedYear === y ? 600 : 400, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif", transition: 'all 0.15s' }}>{y}</button>
                ))}
              </div>
              <button onClick={onClose} style={{ width: 32, height: 32, borderRadius: 10, border: '1.5px solid #e8dece', background: '#faf6ee', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontSize: 16, color: '#9a8775', flexShrink: 0 }}>✕</button>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
            {[
              { label: 'Total Due',     value: fmt(totalDue),     color: '#b5672f', bg: '#fdf3e7', border: '#f0c490' },
              { label: 'Total Paid',    value: fmt(totalPaid),    color: '#7a9e5a', bg: '#f5f8f0', border: '#c8deb0' },
              { label: 'Total Balance', value: fmt(totalBalance), color: totalBalance > 0 ? '#c97844' : '#7a9e5a', bg: totalBalance > 0 ? '#fff8f4' : '#f5f8f0', border: totalBalance > 0 ? '#f0c490' : '#c8deb0' },
            ].map(p => (
              <div key={p.label} style={{ background: p.bg, border: `1.5px solid ${p.border}`, borderRadius: 10, padding: '6px 14px', display: 'flex', flexDirection: 'column', gap: 1 }}>
                <span style={{ fontSize: 9, letterSpacing: 0.8, textTransform: 'uppercase', color: '#b08a5e', fontWeight: 500 }}>{p.label}</span>
                <span style={{ fontSize: 13, fontWeight: 700, fontFamily: 'monospace', color: p.color }}>{p.value}</span>
              </div>
            ))}
          </div>
        </div>

        <div style={{ overflowY: 'auto', flex: 1, padding: '20px 26px 24px' }}>
          {combinedRows.length > 0 ? (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <div style={{ fontSize: 10, fontWeight: 500, letterSpacing: 1, textTransform: 'uppercase', color: '#b08a5e', background: '#f5ece0', border: '1.5px solid #e8dece', padding: '3px 12px', borderRadius: 20 }}>
                  🧾 {monthFull} {selectedYear} · All Expenses
                </div>
              </div>
              <div style={{ borderRadius: 14, border: '1.5px solid #e8dece', overflow: 'hidden', boxShadow: '0 2px 0 #e2d9c8' }}>
                <table style={{ borderCollapse: 'collapse', width: '100%' }}>
                  <thead>
                    <tr style={{ background: '#faf6ee' }}>
                      {['#', 'Expense Name', 'Type', 'Kind', 'Amount', 'Paid', 'Balance'].map((h, i) => (
                        <th key={h} style={{ padding: '9px 14px', fontSize: 10, fontWeight: 500, letterSpacing: 0.9, textTransform: 'uppercase', color: '#b08a5e', textAlign: i >= 4 ? 'right' : 'left', borderBottom: '1.5px solid #e8dece', borderRight: i < 6 ? '1px solid #f0ebe0' : 'none', fontFamily: "'DM Sans', sans-serif" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {combinedRows.map((row, idx) => (
                      <tr key={row._id} onMouseEnter={e => e.currentTarget.style.background = '#fdf8f0'} onMouseLeave={e => e.currentTarget.style.background = ''}>
                        <td style={{ ...tdBase, width: 36, color: '#c5b49e', fontFamily: 'monospace', fontSize: 11, borderRight: '1px solid #f0ebe0' }}>{idx + 1}</td>
                        <td style={{ ...tdBase, borderRight: '1px solid #f0ebe0' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            {row.kind === 'recurring'
                              ? <Avatar name={row.name || '?'} />
                              : <span style={{ width: 28, height: 28, borderRadius: 8, background: '#fdf3e7', border: '1.5px solid #f0c490', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, flexShrink: 0 }}>⚡</span>
                            }
                            <div>
                              <div style={{ fontWeight: 500, color: '#2e2318', fontSize: 13 }}>{row.name}</div>
                              <div style={{ fontSize: 10, color: '#b0a090', marginTop: 1 }}>{row.sub}</div>
                            </div>
                          </div>
                        </td>
                        <td style={{ ...tdBase, fontSize: 11, color: '#9a8775', borderRight: '1px solid #f0ebe0' }}>{row.expenseType || '—'}</td>
                        <td style={{ ...tdBase, fontSize: 11, borderRight: '1px solid #f0ebe0' }}>
                          {row.kind === 'recurring'
                            ? <span style={{ color: '#8c7a68' }}>🔁 Recurring</span>
                            : <span style={{ color: '#a05e2a' }}>⚡ One-Time</span>
                          }
                        </td>
                        <td style={{ ...tdBase, textAlign: 'right', fontFamily: 'monospace', fontWeight: 600, color: '#b5672f', borderRight: '1px solid #f0ebe0' }}>
                          {fmt(row.amt)}
                          {row.overridden && <span title="Amount overridden" style={{ marginLeft: 4, fontSize: 9, color: '#c97844' }}>●</span>}
                        </td>
                        <td style={{ ...tdBase, textAlign: 'right', fontFamily: 'monospace', color: '#7a9e5a', borderRight: '1px solid #f0ebe0' }}>{fmt(row.paid)}</td>
                        <td style={{ ...tdBase, textAlign: 'right', fontFamily: 'monospace', fontWeight: 600, color: row.due > 0 ? '#c97844' : '#7a9e5a' }}>
                          {row.due > 0 ? fmt(row.due) : <span style={{ color: '#7a9e5a', fontSize: 11 }}>✓ Paid</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr style={{ background: '#faf6ee' }}>
                      <td colSpan={4} style={{ padding: '9px 14px', fontSize: 10, fontWeight: 500, color: '#8c7a68', textTransform: 'uppercase', letterSpacing: 0.8, borderTop: '1.5px solid #e8dece', fontFamily: "'DM Sans', sans-serif" }}>
                        Total ({combinedRows.length})
                      </td>
                      <td style={{ padding: '9px 14px', textAlign: 'right', fontFamily: 'monospace', fontWeight: 700, color: '#b5672f', borderTop: '1.5px solid #e8dece', borderRight: '1px solid #f0ebe0' }}>{fmt(totalDue)}</td>
                      <td style={{ padding: '9px 14px', textAlign: 'right', fontFamily: 'monospace', fontWeight: 700, color: '#7a9e5a', borderTop: '1.5px solid #e8dece', borderRight: '1px solid #f0ebe0' }}>{fmt(totalPaid)}</td>
                      <td style={{ padding: '9px 14px', textAlign: 'right', fontFamily: 'monospace', fontWeight: 700, color: totalBalance > 0 ? '#c97844' : '#7a9e5a', borderTop: '1.5px solid #e8dece' }}>{fmt(totalBalance)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: '40px 0', color: '#b0a090' }}>
              <div style={{ fontSize: 32, marginBottom: 10 }}>📭</div>
              <div style={{ fontSize: 14, fontWeight: 600, fontFamily: "'Lora', serif", color: '#8c7a68' }}>No expenses in {monthFull} {selectedYear}</div>
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
  @import url('https://fonts.googleapis.com/css2?family=Lora:ital,wght@0,400;0,600;1,400&family=DM+Sans:wght@300;400;500&display=swap');
  * { box-sizing: border-box; }
  .emp-table-scroll { overflow-x: auto; border-radius: 14px; border: 1.5px solid #e8dece; background: #fffdf8; box-shadow: 0 2px 0 #e2d9c8; }
  .emp-table { border-collapse: collapse; white-space: nowrap; width: 100%; }
  .col-name { position: sticky; left: 0; z-index: 3; background: #fffdf8; min-width: 220px; max-width: 220px; border-right: 1.5px solid #e8dece; }
  .col-name.head { background: #faf6ee; z-index: 4; }
  .th-month { background: #faf6ee; color: #b08a5e; text-align: center; font-size: 10px; font-weight: 500; letter-spacing: 1px; text-transform: uppercase; padding: 10px 4px; border-right: 1.5px solid #e8dece; border-bottom: 1px solid #e8dece; font-family: 'DM Sans', sans-serif; }
  .th-month.inactive-head { color: #d4c8b8; }
  .th-sub { text-align: center; font-size: 10px; font-weight: 500; letter-spacing: 0.8px; text-transform: uppercase; padding: 5px 6px; border-bottom: 1.5px solid #e8dece; border-right: 1px solid #f0ebe0; min-width: 88px; background: #faf6ee; color: #b0a090; font-family: 'DM Sans', sans-serif; }
  .th-sub.amt  { color: #b5672f; }
  .th-sub.paid { color: #7a9e5a; border-right: 1.5px solid #e8dece; }
  .th-sub.amt.amt-edit-mode { color: #c97844; background: #fdf8f0; cursor: pointer; }
  .th-total { background: #f5f0e8; text-align: center; font-size: 10px; font-weight: 500; letter-spacing: 0.8px; text-transform: uppercase; padding: 5px 8px; border-bottom: 1.5px solid #e8dece; border-right: 1px solid #f0ebe0; min-width: 100px; font-family: 'DM Sans', sans-serif; color: #a05e2a; }
  tr.data-row:hover td        { background: #fdf8f0 !important; }
  tr.data-row:hover .col-name { background: #fdf8f0 !important; }
  .td-emp { padding: 11px 14px; border-bottom: 1px solid #f0ebe0; vertical-align: middle; }
  .td-amt { text-align: right; padding: 10px 10px; font-family: monospace; font-size: 12px; border-bottom: 1px solid #f0ebe0; border-right: 1px solid #f0ebe0; background: #faf6ee; color: #9a8775; }
  .td-amt.td-amt-editable { cursor: pointer; }
  .td-amt.td-amt-editable:hover { background: #fdf3e7 !important; color: #a05e2a !important; outline: 1.5px solid #f0c490; outline-offset: -1.5px; }
  .td-amt.td-amt-overridden { color: #c97844 !important; font-weight: 600; }
  .td-paid { text-align: right; padding: 10px 10px; font-family: monospace; font-size: 12px; color: #7a9e5a; border-bottom: 1px solid #f0ebe0; border-right: 1.5px solid #e8dece; cursor: pointer; position: relative; }
  .td-paid:hover { background: #f5f8f0 !important; }
  .td-paid.has-carry { color: #c97844; }
  .td-paid.saving { opacity: 0.5; cursor: wait; }
  .td-inactive { background: #faf6ee; color: #d4c8b8; text-align: center; font-size: 11px; border-bottom: 1px solid #f0ebe0; border-right: 1.5px solid #e8dece; padding: 10px 6px; }
  .carry-badge  { display: inline-block; background: #fff8f4; border: 1px solid #f0c490; border-radius: 4px; padding: 1px 5px; font-size: 10px; color: #c97844; font-family: monospace; }
  .credit-badge { display: inline-block; background: #f5f8f0; border: 1px solid #c8deb0; border-radius: 4px; padding: 1px 5px; font-size: 10px; color: #7a9e5a; font-family: monospace; }
  .saving-badge { display: inline-block; background: #fdf3e7; border: 1px solid #f0c490; border-radius: 4px; padding: 1px 5px; font-size: 10px; color: #b08a5e; font-family: monospace; }
  .edit-inp { width: 82px; background: #fffdf8; border: 1.5px solid #c97844; border-radius: 8px; padding: 3px 7px; font-family: monospace; font-size: 12px; color: #2e2318; outline: none; text-align: right; }
  .td-total-paid { text-align: right; padding: 10px 12px; font-family: monospace; font-size: 12px; font-weight: 600; color: #7a9e5a; border-bottom: 1px solid #f0ebe0; border-right: 1px solid #f0ebe0; background: #f5f8f0; }
  .td-total-amt  { text-align: right; padding: 10px 12px; font-family: monospace; font-size: 12px; color: #b0a090; border-bottom: 1px solid #f0ebe0; background: #faf6ee; }
  tr.footer-row td { background: #faf6ee; border-top: 1.5px solid #e8dece; font-family: monospace; font-size: 11px; text-align: right; padding: 9px 10px; border-right: 1px solid #f0ebe0; }
  .add-expense-btn { display: inline-flex; align-items: center; gap: 7px; padding: 9px 20px; border-radius: 12px; border: none; background: #c97844; color: #fff; font-family: 'DM Sans', sans-serif; font-size: 13px; font-weight: 500; cursor: pointer; letter-spacing: 0.3px; transition: background 0.15s, transform 0.12s, box-shadow 0.15s; box-shadow: 0 3px 10px rgba(201,120,68,0.28); white-space: nowrap; flex-shrink: 0; }
  .add-expense-btn:hover  { background: #b5672f; transform: translateY(-1px); box-shadow: 0 5px 14px rgba(201,120,68,0.35); }
  .add-expense-btn:active { transform: translateY(0); box-shadow: 0 2px 6px rgba(201,120,68,0.2); }
  .add-expense-btn-icon { width: 18px; height: 18px; border-radius: 50%; background: rgba(255,255,255,0.22); display: flex; align-items: center; justify-content: center; font-size: 15px; line-height: 1; font-weight: 300; }
  ::-webkit-scrollbar { height: 5px; }
  ::-webkit-scrollbar-track { background: #f5f0e8; }
  ::-webkit-scrollbar-thumb { background: #e0d4c0; border-radius: 3px; }
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
  const [monthViewIndex,     setMonthViewIndex]     = useState(null)

  const [overrideTarget,     setOverrideTarget]     = useState(null)
  const [savingOverride,     setSavingOverride]     = useState(false)

  // Merge recurring records by name → virtual merged employees.
  const mergedRecurring = useMemo(
    () => mergeRecurringByName(allExpenses.filter(e => e.type === 'recurring')),
    [allExpenses]
  )

  // Quick lookup: mergedId → merged employee
  const mergedById = useMemo(() => {
    const map = {}
    mergedRecurring.forEach(m => { map[m._id] = m })
    return map
  }, [mergedRecurring])

  // Build month data keyed by merged employee id.
  const buildAllMonthData = useCallback((mergedList) => {
    const initial = {}
    mergedList.forEach(emp => {
      getEmployeeYears(emp).forEach(year => {
        initial[`${emp._id}_${year}`] = buildMonthData(emp, year, buildPaidMapForYear(emp, year))
      })
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

  // Resolve the real underlying record id for a merged emp at month/year.
  const resolveRealId = useCallback((mergedId, month, year) => {
    const merged = mergedById[mergedId]
    if (!merged) return mergedId // already a real id (shouldn't happen for recurring)
    const monthIdx = MONTHS.indexOf(month)
    const rec = resolveRecordForMonth(merged, monthIdx, year)
    return rec?._id || null
  }, [mergedById])

  const handleEditStart = useCallback((empId, month, year, currentPaid) => {
    setEditing({ empId, month, year })
    setEditVal(String(currentPaid))
    setTimeout(() => { inputRef.current?.focus(); inputRef.current?.select() }, 20)
  }, [])

  const handleEditCommit = useCallback(async () => {
    setEditing(prev => {
      if (!prev) return prev
      const { empId, month, year } = prev
      const newVal = Math.max(0, parseInt(editVal) || 0)

      const realId = resolveRealId(empId, month, year)
      if (!realId) return null

      setAllExpenses(exps => {
        const updatedExps = exps.map(e => {
          if (e._id !== realId) return e
          const existingPaymentIdx = (e.payments || []).findIndex(p => p.year === year && p.month === month)
          const updatedPayments = [...(e.payments || [])]
          if (existingPaymentIdx > -1) {
            updatedPayments[existingPaymentIdx] = { ...updatedPayments[existingPaymentIdx], paid: newVal }
          } else {
            updatedPayments.push({ year, month, paid: newVal })
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
        body: JSON.stringify({ year, month, paid: newVal }),
      }).catch(err => console.error('Failed to save payment:', err)).finally(() => setSavingCell(null))
      return null
    })
  }, [editVal, resolveRealId])

  const handleAmountOverrideRequest = useCallback((emp, month, year, currentAmt) => {
    setOverrideTarget({ emp, month, year, currentAmt })
  }, [])

  const handleAmountOverrideSave = useCallback(async (newAmount) => {
    if (!overrideTarget) return
    const { emp, month, year } = overrideTarget
    const realId = resolveRealId(emp._id, month, year)
    if (!realId) return
    setSavingOverride(true)
    try {
      await fetch(
        `${API_BASE}/employee/update-amount-override/${realId}`,
        { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ year, month, amount: newAmount }) }
      )
      setAllExpenses(prev => {
        const updated = prev.map(e => {
          if (e._id !== realId) return e
          const overrides = [...(e.amountOverrides || [])]
          const idx = overrides.findIndex(ov => ov.year === year && ov.month === month)
          if (idx > -1) overrides[idx] = { year, month, amount: newAmount }
          else overrides.push({ year, month, amount: newAmount })
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
    const realId = resolveRealId(emp._id, month, year)
    if (!realId) return
    setSavingOverride(true)
    try {
      await fetch(
        `${API_BASE}/employee/remove-amount-override/${realId}`,
        { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ year, month }) }
      )
      setAllExpenses(prev => {
        const updated = prev.map(e => {
          if (e._id !== realId) return e
          const overrides = (e.amountOverrides || []).filter(ov => !(ov.year === year && ov.month === month))
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

  // ── Delete handlers ──────────────────────────────────────────────────────
  const handleDeleteRequest = useCallback((expense) => { setDeleteTarget(expense) }, [])

  const handleDeleteConfirm = useCallback(async () => {
    if (!deleteTarget) return
    setDeleting(true)
    // Merged recurring → delete all underlying records. Otherwise just the one.
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

  // Group for display: merged recurring + raw one-time, grouped by expense type.
  const { grouped, groupNames, totalRecurring, totalOneTime } = useMemo(() => {
    const oneTime = allExpenses.filter(e => e.type === 'one-time')
    const grouped = groupByExpenseType([...mergedRecurring, ...oneTime])
    const groupNames = Object.keys(grouped).sort((a, b) => a.localeCompare(b))
    return {
      grouped,
      groupNames,
      totalRecurring: mergedRecurring.length,
      totalOneTime: oneTime.length,
    }
  }, [allExpenses, mergedRecurring])

  if (loading) return (
    <div style={{ padding: 40, display: 'flex', alignItems: 'center', gap: 12, fontFamily: "'DM Sans', sans-serif", color: '#9a8775', background: '#f5f0e8', minHeight: '100vh' }}>
      <div style={{ width: 22, height: 22, border: '2.5px solid #e8dece', borderTopColor: '#c97844', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
      Loading expenses…
    </div>
  )

  if (error) return (
    <div style={{ padding: 40, fontFamily: "'DM Sans', sans-serif", color: '#c97844', background: '#f5f0e8', minHeight: '100vh' }}>{error}</div>
  )

  return (
    <div style={{ padding: '36px 24px 60px', background: '#f5f0e8', minHeight: '100vh', fontFamily: "'DM Sans', sans-serif" }}>
      {deleteTarget && (
        <DeleteModal expense={deleteTarget} onConfirm={handleDeleteConfirm} onCancel={handleDeleteCancel} deleting={deleting} />
      )}
      {monthViewIndex !== null && (
        <MonthViewModal
          monthIndex={monthViewIndex}
          mergedRecurring={mergedRecurring}
          allExpenses={allExpenses}
          monthData={monthData}
          onClose={() => setMonthViewIndex(null)}
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
            const rec = allExpenses.find(e => e._id === realId)
            return rec?.amountOverrides?.find(ov => ov.year === overrideTarget.year && ov.month === overrideTarget.month)
          })()}
          onSave={handleAmountOverrideSave}
          onRemove={handleAmountOverrideRemove}
          onCancel={() => { if (!savingOverride) setOverrideTarget(null) }}
          saving={savingOverride}
        />
      )}

      <div style={{ marginBottom: 28, display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 10, fontWeight: 500, letterSpacing: 2, textTransform: 'uppercase', color: '#b08a5e', marginBottom: 5 }}>Expense Tracker</div>
          <h2 style={{ fontFamily: "'Lora', serif", fontSize: 26, fontWeight: 600, color: '#2e2318', margin: '0 0 4px' }}>All Expenses</h2>
          <p style={{ fontSize: 13, color: '#9a8775', margin: 0 }}>
            {groupNames.length} group{groupNames.length !== 1 ? 's' : ''} &nbsp;·&nbsp;
            {totalRecurring} recurring &nbsp;·&nbsp;
            {totalOneTime} one-time &nbsp;·&nbsp;
            Click <span style={{ color: '#7a9e5a', fontWeight: 500 }}>Paid</span> to edit &nbsp;·&nbsp;
            <span style={{ color: '#c97844' }}>✏️ Edit amounts</span> to change monthly rates
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <MonthPickerDropdown onSelect={(i) => setMonthViewIndex(i)} />
          <button className="add-expense-btn" onClick={() => navigate('/employee')}>
            <span className="add-expense-btn-icon">+</span>
            Add Expense
          </button>
        </div>
      </div>

      {groupNames.length === 0 && (
        <div style={{ textAlign: 'center', padding: '60px 0', color: '#b0a090' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>📭</div>
          <div style={{ fontSize: 16, fontWeight: 600, fontFamily: "'Lora', serif", color: '#8c7a68' }}>No expenses yet</div>
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
            defaultOpen={idx === 0}
          />
        )
      })}

      <p style={{ marginTop: 16, fontSize: 11, color: '#c5b49e', textAlign: 'center' }}>
        Scroll right to see all months &nbsp;·&nbsp;
        Click any <span style={{ color: '#7a9e5a' }}>Paid</span> cell to edit &nbsp;·&nbsp;
        Use <span style={{ color: '#c97844' }}>✏️ Edit amounts</span> to change rates mid-year &nbsp;·&nbsp;
        <span style={{ color: '#c97844' }}>●</span> = overridden month
      </p>
    </div>
  )
}

export default EmployeeTable
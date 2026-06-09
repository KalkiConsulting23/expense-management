import React, { useEffect, useState, useRef, useMemo, useCallback, memo } from 'react'
import { useNavigate } from 'react-router-dom'

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const CACHE_KEY = 'local_employee_data_cache'

const fmt = (n) => '₹' + Number(n).toLocaleString('en-IN')

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

function buildMonthData(emp, year, paidMap = {}) {
  let carry = 0
  const result = {}
  MONTHS.forEach((m, i) => {
    if (!isMonthActive(emp, i, year)) {
      result[m] = { amt: 0, paid: 0, carry: 0, active: false }
      return
    }
    const amt  = emp.amount + carry
    const paid = paidMap[m] !== undefined ? paidMap[m] : Math.max(0, amt)
    carry = amt - paid
    result[m] = { amt, paid, carry, active: true }
  })
  return result
}

function recalcEmployee(emp, year, oldData, changedMonth, newPaidValue) {
  const paidMap = {}
  MONTHS.forEach((m) => { paidMap[m] = oldData[m]?.paid })
  paidMap[changedMonth] = newPaidValue
  return buildMonthData(emp, year, paidMap)
}

function getEmployeeYears(emp) {
  const start = parseUTCDate(emp.startDate).getFullYear()
  const end   = emp.endDate
    ? parseUTCDate(emp.endDate).getFullYear()
    : new Date().getFullYear()
  const years = []
  for (let y = start; y <= Math.max(start, end); y++) years.push(y)
  return years
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
  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(46,35,24,0.35)',
        backdropFilter: 'blur(3px)',
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
        <div style={{
          width: 52, height: 52, borderRadius: 14, background: '#fff4f0',
          border: '1.5px solid #f0c4b0', display: 'flex', alignItems: 'center',
          justifyContent: 'center', fontSize: 22, marginBottom: 16,
        }}>🗑️</div>

        <div style={{ fontSize: 17, fontWeight: 600, color: '#2e2318', fontFamily: "'Lora', serif", marginBottom: 8 }}>
          Delete Expense?
        </div>
        <div style={{ fontSize: 13, color: '#9a8775', marginBottom: 6, lineHeight: 1.5 }}>
          You're about to delete:
        </div>
        <div style={{
          background: '#faf6ee', border: '1.5px solid #e8dece',
          borderRadius: 12, padding: '12px 16px', marginBottom: 20,
        }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: '#2e2318' }}>{expense.expenseName}</div>
          <div style={{ fontSize: 12, color: '#b08a5e', marginTop: 4 }}>
            {expense.expenseType} &nbsp;·&nbsp;
            <span style={{ color: '#b5672f', fontFamily: 'monospace' }}>{fmt(expense.amount)}</span>
            {expense.type === 'recurring' ? '/mo' : ' one-time'}
          </div>
        </div>
        <div style={{ fontSize: 12, color: '#c97844', marginBottom: 22 }}>
          ⚠️ This action cannot be undone. All payment history will be lost.
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <button
            onClick={onCancel} disabled={deleting}
            style={{
              flex: 1, padding: '9px 0', borderRadius: 12,
              border: '1.5px solid #e8dece', background: '#faf6ee',
              color: '#8c7a68', fontSize: 13, fontWeight: 500,
              cursor: 'pointer', fontFamily: "'DM Sans', sans-serif",
            }}
          >Cancel</button>
          <button
            onClick={onConfirm} disabled={deleting}
            style={{
              flex: 1, padding: '9px 0', borderRadius: 12,
              border: 'none', background: deleting ? '#e0a090' : '#c0392b',
              color: '#fff', fontSize: 13, fontWeight: 500,
              cursor: deleting ? 'wait' : 'pointer',
              fontFamily: "'DM Sans', sans-serif",
              boxShadow: '0 2px 8px rgba(192,57,43,0.25)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            }}
          >
            {deleting ? (
              <>
                <div style={{
                  width: 13, height: 13,
                  border: '2px solid rgba(255,255,255,0.4)', borderTopColor: '#fff',
                  borderRadius: '50%', animation: 'spin 0.7s linear infinite',
                }} />
                Deleting…
              </>
            ) : 'Delete'}
          </button>
        </div>
      </div>
    </div>
  )
})

const TrashBtn = memo(function TrashBtn({ onClick }) {
  const [hover, setHover] = useState(false)
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      title="Delete expense"
      style={{
        width: 28, height: 28, borderRadius: 8, flexShrink: 0,
        border: hover ? '1.5px solid #f0c4b0' : '1.5px solid transparent',
        background: hover ? '#fff4f0' : 'transparent',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        cursor: 'pointer', fontSize: 13, transition: 'all 0.15s',
        color: hover ? '#c0392b' : '#c5b49e',
      }}
    >🗑️</button>
  )
})

const OneTimeExpensesTable = memo(function OneTimeExpensesTable({ expenses, onDeleteRequest }) {
  if (!expenses || expenses.length === 0) return null
  const total = expenses.reduce((s, e) => s + e.amount, 0)

  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{
        display: 'inline-flex', alignItems: 'center', gap: 7,
        background: '#fdf3e7', color: '#a05e2a', border: '1.5px solid #f0c490',
        padding: '4px 12px', borderRadius: 20, fontSize: 10, fontWeight: 500,
        letterSpacing: 1, textTransform: 'uppercase', marginBottom: 10,
        fontFamily: "'DM Sans', sans-serif",
      }}>
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#c97844', display: 'inline-block' }} />
        One-Time
      </div>

      <div style={{
        overflowX: 'auto', borderRadius: 14,
        border: '1.5px solid #e8dece', background: '#fffdf8',
        boxShadow: '0 2px 0 #e2d9c8',
      }}>
        <table style={{ borderCollapse: 'collapse', width: '100%', whiteSpace: 'nowrap' }}>
          <thead>
            <tr>
              {['#', 'Expense Name', 'Amount', 'Date', ''].map((h, i) => (
                <th key={i} style={{
                  background: '#faf6ee', color: '#b08a5e',
                  padding: '10px 16px', textAlign: i === 2 ? 'right' : 'left',
                  fontSize: 10, fontWeight: 500, letterSpacing: 1,
                  textTransform: 'uppercase', borderBottom: '1.5px solid #e8dece',
                  borderRight: i < 4 ? '1px solid #f0ebe0' : 'none',
                  fontFamily: "'DM Sans', sans-serif",
                  width: i === 4 ? 48 : undefined,
                }} Mention={h}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {expenses.map((exp, idx) => (
              <tr key={exp._id}
                onMouseEnter={e => e.currentTarget.style.background = '#fdf8f0'}
                onMouseLeave={e => e.currentTarget.style.background = ''}
              >
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
                Total ({expenses.length} expense{expenses.length !== 1 ? 's' : ''})
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

const RecurringYearTable = memo(function RecurringYearTable({
  year, activeEmps, monthData, editing, editVal, inputRef,
  setEditVal, handleEditStart, handleEditCommit, setEditing, savingCell, onDeleteRequest
}) {
  const empTotals = useMemo(() => {
    const map = {}
    activeEmps.forEach(emp => {
      const data = monthData[`${emp._id}_${year}`] || {}
      map[emp._id] = {
        paid: MONTHS.reduce((s, m) => s + (data[m]?.paid || 0), 0),
        amt:  MONTHS.reduce((s, m) => s + (data[m]?.amt  || 0), 0),
      }
    })
    return map
  }, [activeEmps, monthData, year])

  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{
        display: 'inline-flex', alignItems: 'center', gap: 7,
        background: '#f5ece0', color: '#8c7a68', border: '1.5px solid #e8dece',
        padding: '4px 12px', borderRadius: 20, fontSize: 10, fontWeight: 500,
        letterSpacing: 1, marginBottom: 10, textTransform: 'uppercase',
        fontFamily: "'DM Sans', sans-serif",
      }}>
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#b08a5e', display: 'inline-block' }} />
        {year} · Recurring
      </div>

      <div className="emp-table-scroll">
        <table className="emp-table">
          <thead>
            <tr>
              <th className="col-name head" rowSpan={2} style={{ padding: '10px 16px', textAlign: 'left', fontSize: 10, fontWeight: 500, color: '#b08a5e', letterSpacing: 1, textTransform: 'uppercase', borderBottom: '1.5px solid #e8dece', background: '#faf6ee', fontFamily: "'DM Sans', sans-serif" }}>
                Expense
              </th>
              {MONTHS.map((m, i) => {
                const anyActive = activeEmps.some(emp => isMonthActive(emp, i, year))
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
              {MONTHS.map((m) => (
                <React.Fragment key={m}>
                  <th className="th-sub amt">Amt</th>
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
                          <span style={{ color: '#b5672f', fontFamily: 'monospace' }}>{fmt(emp.amount)}/mo</span>
                          &nbsp;·&nbsp;
                          {parseUTCDate(emp.startDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                        </div>
                      </div>
                      <TrashBtn onClick={() => onDeleteRequest(emp)} />
                    </div>
                  </td>

                  {MONTHS.map((m) => {
                    const cell      = data[m]
                    const isEditing = editing?.empId === emp._id && editing?.month === m && editing?.year === year
                    const isSaving  = savingCell?.empId === emp._id && savingCell?.month === m && savingCell?.year === year

                    if (!cell || !cell.active) {
                      return <React.Fragment key={m}><td className="td-inactive" colSpan={2}>—</td></React.Fragment>
                    }

                    const hasCarry  = cell.carry > 0
                    const hasCredit = cell.carry < 0

                    return (
                      <React.Fragment key={m}>
                        <td className="td-amt">
                          <div>{fmt(cell.amt)}</div>
                          {hasCarry  && <div style={{ fontSize: 10, color: '#c97844', marginTop: 2 }}>carry: {fmt(cell.carry)} →</div>}
                          {hasCredit && <div style={{ fontSize: 10, color: '#7a9e5a', marginTop: 2 }}>credit: {fmt(Math.abs(cell.carry))} →</div>}
                        </td>
                        <td
                          className={`td-paid${hasCarry ? ' has-carry' : ''}${isSaving ? ' saving' : ''}`}
                          onClick={() => !isEditing && !isSaving && handleEditStart(emp._id, m, year, cell.paid)}
                          title={isSaving ? 'Saving...' : 'Click to edit paid amount'}
                        >
                          {isEditing ? (
                            <input
                              ref={inputRef}
                              className="edit-inp"
                              value={editVal}
                              onChange={(e) => setEditVal(e.target.value)}
                              onBlur={handleEditCommit}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter')  handleEditCommit()
                                if (e.key === 'Escape') setEditing(null)
                              }}
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
                  <td className="td-total-amt">{fmt(empTotals[emp._id]?.amt  || 0)}</td>
                  <td style={{ borderBottom: '1px solid #f0ebe0', borderLeft: '1px solid #f0ebe0' }} />
                </tr>
              )
            })}

            <tr className="footer-row">
              <td className="col-name" style={{ padding: '10px 16px', fontSize: 10, fontWeight: 500, color: '#8c7a68', textTransform: 'uppercase', letterSpacing: 0.8, borderTop: '1.5px solid #e8dece', background: '#faf6ee', textAlign: 'left', fontFamily: "'DM Sans', sans-serif" }}>
                Grand Total
              </td>
              {MONTHS.map((m) => {
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
                {fmt(activeEmps.reduce((s, e) => s + (empTotals[e._id]?.amt || 0), 0))}
              </td>
              <td style={{ background: '#faf6ee', borderTop: '1.5px solid #e8dece', borderLeft: '1px solid #f0ebe0' }} />
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
})

const ExpenseTypeGroup = memo(function ExpenseTypeGroup({
  typeName, recurringEmps, oneTimeEmps, monthData, editing, editVal, inputRef,
  setEditVal, handleEditStart, handleEditCommit, setEditing, savingCell, onDeleteRequest, defaultOpen = true
}) {
  const [open, setOpen] = useState(defaultOpen)

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
              />
            )
          })}
          <OneTimeExpensesTable expenses={oneTimeEmps} onDeleteRequest={onDeleteRequest} />
          {recurringEmps.length === 0 && oneTimeEmps.length === 0 && (
            <p style={{ color: '#b0a090', fontSize: 13, textAlign: 'center', padding: '20px 0', fontFamily: "'DM Sans', sans-serif" }}>No expenses in this group.</p>
          )}
        </div>
      )}
    </div>
  )
})

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
  .th-total { background: #f5f0e8; text-align: center; font-size: 10px; font-weight: 500; letter-spacing: 0.8px; text-transform: uppercase; padding: 5px 8px; border-bottom: 1.5px solid #e8dece; border-right: 1px solid #f0ebe0; min-width: 100px; font-family: 'DM Sans', sans-serif; color: #a05e2a; }
  tr.data-row:hover td        { background: #fdf8f0 !important; }
  tr.data-row:hover .col-name { background: #fdf8f0 !important; }
  .td-emp { padding: 11px 14px; border-bottom: 1px solid #f0ebe0; vertical-align: middle; }
  .td-amt { text-align: right; padding: 10px 10px; font-family: monospace; font-size: 12px; border-bottom: 1px solid #f0ebe0; border-right: 1px solid #f0ebe0; background: #faf6ee; color: #9a8775; }
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

const EmployeeTable = () => {
  const navigate = useNavigate()

  const [allExpenses, setAllExpenses] = useState([])
  const [monthData,   setMonthData]   = useState({})
  const [loading,     setLoading]     = useState(true)
  const [error,       setError]       = useState(null)
  const [savingCell,  setSavingCell]  = useState(null)
  const [editing,     setEditing]     = useState(null)
  const [editVal,     setEditVal]     = useState('')
  const inputRef = useRef(null)

  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deleting,     setDeleting]     = useState(false)

  const parseServerData = useCallback((data) => {
    const recurring = data.filter(e => e.type === 'recurring')
    const initial = {}
    recurring.forEach(emp => {
      getEmployeeYears(emp).forEach(year => {
        const paidMap = {}
        if (emp.payments?.length > 0) {
          emp.payments
            .filter(p => p.year === year)
            .forEach(p => { paidMap[p.month] = p.paid })
        }
        initial[`${emp._id}_${year}`] = buildMonthData(emp, year, paidMap)
      })
    })
    return initial
  }, [])

  useEffect(() => {
    const fetchExpenses = async () => {
      try {
        const cachedData = sessionStorage.getItem(CACHE_KEY)
        if (cachedData) {
          const parsed = JSON.parse(cachedData)
          setAllExpenses(parsed)
          setMonthData(parseServerData(parsed))
          setLoading(false)
          return
        }

        const res  = await fetch('http://localhost:5000/api/employee/all')
        const data = await res.json()
        
        sessionStorage.setItem(CACHE_KEY, JSON.stringify(data))
        setAllExpenses(data)
        setMonthData(parseServerData(data))
      } catch (err) {
        setError('Failed to fetch expenses')
      } finally {
        setLoading(false)
      }
    }
    fetchExpenses()
  }, [parseServerData])

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

      setAllExpenses(exps => {
        const updatedExps = exps.map(e => {
          if (e._id !== empId) return e
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
        
        const emp = updatedExps.find(e => e._id === empId)
        if (emp) {
          const key = `${empId}_${year}`
          setMonthData(md => ({
            ...md,
            [key]: recalcEmployee(emp, year, md[key], month, newVal),
          }))
        }
        return updatedExps
      })

      setSavingCell({ empId, month, year })
      fetch(`http://localhost:5000/api/employee/update-payment/${empId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ year, month, paid: newVal }),
      })
        .catch(err => console.error('Failed to save payment:', err))
        .finally(() => setSavingCell(null))

      return null
    })
  }, [editVal])

  const handleDeleteRequest = useCallback((expense) => {
    setDeleteTarget(expense)
  }, [])

  const handleDeleteConfirm = useCallback(async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await fetch(`http://localhost:5000/api/employee/delete/${deleteTarget._id}`, {
        method: 'DELETE'
      })
      
      setAllExpenses(prev => {
        const remaining = prev.filter(e => e._id !== deleteTarget._id)
        sessionStorage.setItem(CACHE_KEY, JSON.stringify(remaining))
        return remaining
      })

      setMonthData(prev => {
        const next = { ...prev }
        Object.keys(next).forEach(k => {
          if (k.startsWith(`${deleteTarget._id}_`)) delete next[k]
        })
        return next
      })
      setDeleteTarget(null)
    } catch (err) {
      console.error('Failed to delete expense:', err)
    } finally {
      setDeleting(false)
    }
  }, [deleteTarget])

  const handleDeleteCancel = useCallback(() => {
    if (!deleting) setDeleteTarget(null)
  }, [deleting])

  const { grouped, groupNames, totalRecurring, totalOneTime } = useMemo(() => {
    const grouped       = groupByExpenseType(allExpenses)
    const groupNames    = Object.keys(grouped).sort((a, b) => a.localeCompare(b))
    const totalRecurring = allExpenses.filter(e => e.type === 'recurring').length
    const totalOneTime   = allExpenses.filter(e => e.type === 'one-time').length
    return { grouped, groupNames, totalRecurring, totalOneTime }
  }, [allExpenses])

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
        <DeleteModal
          expense={deleteTarget}
          onConfirm={handleDeleteConfirm}
          onCancel={handleDeleteCancel}
          deleting={deleting}
        />
      )}

      <div style={{ marginBottom: 28, display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 10, fontWeight: 500, letterSpacing: 2, textTransform: 'uppercase', color: '#b08a5e', marginBottom: 5 }}>
            Expense Tracker
          </div>
          <h2 style={{ fontFamily: "'Lora', serif", fontSize: 26, fontWeight: 600, color: '#2e2318', margin: '0 0 4px' }}>
            All Expenses
          </h2>
          <p style={{ fontSize: 13, color: '#9a8775', margin: 0 }}>
            {groupNames.length} group{groupNames.length !== 1 ? 's' : ''} &nbsp;·&nbsp;
            {totalRecurring} recurring &nbsp;·&nbsp;
            {totalOneTime} one-time &nbsp;·&nbsp;
            Click <span style={{ color: '#7a9e5a', fontWeight: 500 }}>Paid</span> to edit &nbsp;·&nbsp;
            <span style={{ color: '#c97844' }}>Amber</span> = carry &nbsp;·&nbsp;
            <span style={{ color: '#7a9e5a' }}>Green</span> = credit
          </p>
        </div>
        <button className="add-expense-btn" onClick={() => navigate('/employee')}>
          <span className="add-expense-btn-icon">+</span>
          Add Expense
        </button>
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
            key={typeName}
            typeName={typeName}
            recurringEmps={recurringEmps}
            oneTimeEmps={oneTimeEmps}
            monthData={monthData}
            editing={editing}
            editVal={editVal}
            inputRef={inputRef}
            setEditVal={setEditVal}
            handleEditStart={handleEditStart}
            handleEditCommit={handleEditCommit}
            setEditing={setEditing}
            savingCell={savingCell}
            onDeleteRequest={handleDeleteRequest}
            defaultOpen={idx === 0}
          />
        )
      })}

      <p style={{ marginTop: 16, fontSize: 11, color: '#c5b49e', textAlign: 'center' }}>
        Scroll right to see all months &nbsp;·&nbsp;
        Click any <span style={{ color: '#7a9e5a' }}>Paid</span> cell to edit &nbsp;·&nbsp;
        Unpaid balance carries forward &nbsp;·&nbsp; Overpayment credited to next month
      </p>
    </div>
  )
}

export default EmployeeTable
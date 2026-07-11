import React, { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:5000/api'
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const fmt = (n) => '₹' + Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })

// ── Money math ────────────────────────────────────────────────────────────
// Every borrowing: principal split evenly across tenure, interest = amount*rate% per month.
const monthlyPrincipalOf = (r) => {
  const tenure = Number(r.tenure) || 1
  return Number(r.amount) / tenure
}
const monthlyInterestOf = (r) => Number(r.amount) * (Number(r.rateOfInterest) / 100)

// Parse a stored date into a local (Y,M,D) date, avoiding UTC drift
const parseDate = (dateStr) => {
  const d = new Date(dateStr)
  return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
}

// Format a date for an <input type="date"> value (YYYY-MM-DD, from UTC parts)
const toInputDate = (dateStr) => {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

// Which (monthIndex, year) does instalment i (0-based) fall on, starting from borrow date?
const monthYearForInstalment = (startDate, i) => {
  const s = parseDate(startDate)
  const total = s.getMonth() + i
  const year = s.getFullYear() + Math.floor(total / 12)
  const monthIdx = ((total % 12) + 12) % 12
  return { monthIdx, year }
}

const paidKey = (year, monthName) => `${year}-${monthName}`

// Compute per-instalment schedule with SEPARATE carry-forward for principal and interest.
// Returns array of {
//   i, monthIdx, year, monthName,
//   principalDue, principalPaid, principalTotalDue, principalCarry,
//   interestDue, interestPaid, interestTotalDue, interestCarry
// }
function buildSchedule(record) {
  const tenure = Number(record.tenure) || 0
  const pDue = monthlyPrincipalOf(record)
  const iDue = monthlyInterestOf(record)

  const paidMap = {}
  ;(record.payments || []).forEach(p => {
    paidMap[paidKey(p.year, p.month)] = {
      principalPaid: Number(p.principalPaid) || 0,
      interestPaid: Number(p.interestPaid) || 0,
    }
  })

  const schedule = []
  let pCarry = 0
  let iCarry = 0
  for (let i = 0; i < tenure; i++) {
    const { monthIdx, year } = monthYearForInstalment(record.date, i)
    const monthName = MONTHS[monthIdx]
    const paid = paidMap[paidKey(year, monthName)] || { principalPaid: 0, interestPaid: 0 }

    const principalTotalDue = pDue + pCarry
    const principalEnd = principalTotalDue - paid.principalPaid

    const interestTotalDue = iDue + iCarry
    const interestEnd = interestTotalDue - paid.interestPaid

    schedule.push({
      i, monthIdx, year, monthName,
      principalDue: pDue, principalPaid: paid.principalPaid, principalTotalDue, principalCarry: principalEnd,
      interestDue: iDue, interestPaid: paid.interestPaid, interestTotalDue, interestCarry: interestEnd,
    })

    pCarry = principalEnd
    iCarry = interestEnd
  }
  return schedule
}

// Group a record's schedule by calendar year → { year: { monthName: cell } }
function scheduleByYear(schedule) {
  const byYear = {}
  schedule.forEach(cell => {
    if (!byYear[cell.year]) byYear[cell.year] = {}
    byYear[cell.year][cell.monthName] = cell
  })
  return byYear
}

const Borrow = () => {
  const navigate = useNavigate()
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [toast, setToast] = useState(null)   // { type, msg }

  const showToast = (type, msg) => {
    setToast({ type, msg })
    setTimeout(() => setToast(null), 3000)
  }

  // ── Cell edit modal state (principal + interest paid) ──────────────────────
  const [cellEdit, setCellEdit] = useState(null)  // { record, year, month, cell }
  const [cellForm, setCellForm] = useState({ principalPaid: '', interestPaid: '' })
  const [savingCell, setSavingCell] = useState(false)

  // ── Record edit modal state ──────────────────────────────────────────────
  const [editRecord, setEditRecord] = useState(null)
  const [form, setForm] = useState({ name: '', amount: '', rateOfInterest: '', tenure: '', date: '' })
  const [savingRecord, setSavingRecord] = useState(false)

  const fetchRecords = async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`${API_BASE}/borrow`)
      if (!res.ok) throw new Error('Failed to fetch borrow records')
      const data = await res.json()
      setRecords(Array.isArray(data) ? data : [])
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchRecords() }, [])

  // ── Cell edit handlers ─────────────────────────────────────────────────────
  const openCellEdit = (record, year, month, cell) => {
    setCellEdit({ record, year, month, cell })
    setCellForm({
      principalPaid: String(cell.principalPaid || 0),
      interestPaid: String(cell.interestPaid || 0),
    })
  }

  const closeCellEdit = () => {
    if (savingCell) return
    setCellEdit(null)
  }

  const setCellField = (key, value) => setCellForm(f => ({ ...f, [key]: value }))

  const handleCellSave = async () => {
    if (!cellEdit) return
    const { record, year, month } = cellEdit
    const principalPaid = Math.max(0, Number(cellForm.principalPaid) || 0)
    const interestPaid = Math.max(0, Number(cellForm.interestPaid) || 0)
    const id = record._id

    setSavingCell(true)
    const prev = records
    // optimistic: update payments locally
    setRecords(rs => rs.map(r => {
      if (r._id !== id) return r
      const payments = [...(r.payments || [])]
      const idx = payments.findIndex(p => p.year === year && p.month === month)
      if (idx > -1) payments[idx] = { ...payments[idx], principalPaid, interestPaid }
      else payments.push({ year, month, principalPaid, interestPaid })
      return { ...r, payments }
    }))

    try {
      const res = await fetch(`${API_BASE}/borrow/${id}/update-payment`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ year, month, principalPaid, interestPaid }),
      })
      if (!res.ok) throw new Error('Failed to save payment')
      const saved = await res.json()
      setRecords(rs => rs.map(r => (r._id === saved._id ? saved : r)))
      setCellEdit(null)
      showToast('success', 'Payment updated.')
    } catch (err) {
      setRecords(prev)
      showToast('error', err.message || 'Something went wrong.')
    } finally {
      setSavingCell(false)
    }
  }

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this borrow record?')) { return }
    const prev = records
    setRecords(records.filter(r => r._id !== id))
    try {
      const res = await fetch(`${API_BASE}/borrow/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Delete failed')
      showToast('success', 'Borrow record deleted.')
    } catch (err) {
      setRecords(prev)
      showToast('error', err.message || 'Delete failed.')
    }
  }

  // ── Record edit modal handlers ───────────────────────────────────────────
  const openEditModal = (record) => {
    setEditRecord(record)
    setForm({
      name: record.name || '',
      amount: String(record.amount ?? ''),
      rateOfInterest: String(record.rateOfInterest ?? ''),
      tenure: String(record.tenure ?? ''),
      date: toInputDate(record.date),
    })
  }

  const closeEditModal = () => {
    if (savingRecord) return
    setEditRecord(null)
  }

  const setField = (key, value) => setForm(f => ({ ...f, [key]: value }))

  const handleRecordSave = async () => {
    if (!editRecord) return
    const name = form.name.trim()
    if (!name) { alert('Name is required'); return }
    const amount = Number(form.amount)
    const rateOfInterest = Number(form.rateOfInterest)
    const tenure = Number(form.tenure)
    if (isNaN(amount) || amount < 0) { alert('Enter a valid amount'); return }
    if (isNaN(rateOfInterest) || rateOfInterest < 0) { alert('Enter a valid rate of interest'); return }
    if (isNaN(tenure) || tenure < 1) { alert('Enter a valid tenure (at least 1)'); return }

    const payload = { name, amount, rateOfInterest, tenure }
    if (form.date) payload.date = form.date

    const id = editRecord._id
    setSavingRecord(true)
    const prev = records
    setRecords(rs => rs.map(r => (r._id === id ? { ...r, ...payload } : r)))

    try {
      const res = await fetch(`${API_BASE}/borrow/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error('Failed to update record')
      const saved = await res.json()
      setRecords(rs => rs.map(r => (r._id === saved._id ? saved : r)))
      setEditRecord(null)
      showToast('success', 'Borrowing updated.')
    } catch (err) {
      setRecords(prev)
      showToast('error', err.message || 'Something went wrong.')
    } finally {
      setSavingRecord(false)
    }
  }

  const totalBorrowed = records.reduce((s, r) => s + Number(r.amount || 0), 0)

  // Build one group per YEAR. Each group lists every borrower that has an
  // instalment in that year, with that year's monthly cells.
  // Carry-forward still flows across years because the full schedule is
  // computed per record first, then sliced by year.
  const buildYearGroups = () => {
    const yearMap = {}   // year -> [{ record, cells: {month: cell}, outstanding }]

    records.forEach(r => {
      const schedule = buildSchedule(r)
      const byYear = scheduleByYear(schedule)
      const lastCell = schedule[schedule.length - 1]
      const outstanding = lastCell
        ? Math.max(0, lastCell.principalCarry) + Math.max(0, lastCell.interestCarry)
        : 0

      Object.keys(byYear).map(Number).forEach(y => {
        if (!yearMap[y]) yearMap[y] = []
        yearMap[y].push({ record: r, cells: byYear[y], outstanding })
      })
    })

    return Object.keys(yearMap)
      .map(Number)
      .sort((a, b) => a - b)
      .map(year => ({ year, rows: yearMap[year] }))
  }

  const yearGroups = buildYearGroups()

  // Sum a single borrower-row's totals for the year it's shown in.
  // Uses each instalment's own due (principalDue/interestDue), and the
  // remaining balance after that year's last cell as the row's outstanding.
  const rowYearTotals = (cells) => {
    const list = Object.values(cells || {})
    let pDue = 0, pPaid = 0, iDue = 0, iPaid = 0
    list.forEach(c => { pDue += c.principalDue; pPaid += c.principalPaid; iDue += c.interestDue; iPaid += c.interestPaid })
    // last cell chronologically in this year
    const last = list.slice().sort((a, b) => a.i - b.i)[list.length - 1]
    const outstanding = last ? Math.max(0, last.principalCarry) + Math.max(0, last.interestCarry) : 0
    return { pDue, pPaid, iDue, iPaid, outstanding }
  }

  return (
    <div className="bw-page">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
        * { box-sizing: border-box; }
        .bw-page {
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
          padding: 28px 22px 60px; background: #f7f7f8; min-height: 100vh;
        }
        .bw-head {
          display: flex; align-items: flex-end; justify-content: space-between;
          gap: 16px; margin-bottom: 24px; flex-wrap: wrap;
        }
        .bw-eyebrow { font-size: 11px; font-weight: 500; letter-spacing: 0.4px; text-transform: uppercase; color: #9ca3af; margin-bottom: 5px; }
        .bw-title { font-size: 26px; font-weight: 600; color: #18181b; margin: 0 0 4px; letter-spacing: -0.4px; }
        .bw-sub { font-size: 13px; color: #6b7280; margin: 0; }
        .bw-sub b { color: #18181b; }
        .add-btn {
          display: inline-flex; align-items: center; gap: 7px;
          padding: 9px 20px; border-radius: 10px; border: none;
          background: #18181b; color: #fff; font-family: inherit;
          font-size: 13px; font-weight: 500; cursor: pointer; transition: all 0.15s; white-space: nowrap;
        }
        .add-btn:hover { background: #000; transform: translateY(-1px); }

        .bw-card {
          margin-bottom: 22px; border-radius: 16px; border: 1px solid #ececec;
          overflow: hidden; box-shadow: 0 1px 3px rgba(16,24,40,0.04); background: #fff;
        }
        .bw-year-head {
          display: flex; align-items: baseline; gap: 12px;
          padding: 14px 20px; background: #fafafa; border-bottom: 1px solid #ececec;
        }
        .bw-year-label { font-size: 18px; font-weight: 700; color: #18181b; letter-spacing: -0.3px; }
        .bw-year-count { font-size: 12px; color: #6b7280; }
        .bw-scroll { overflow-x: auto; }
        .bw-scroll::-webkit-scrollbar { height: 7px; }
        .bw-scroll::-webkit-scrollbar-thumb { background: #d1d5db; border-radius: 3px; }
        table.grid { border-collapse: collapse; white-space: nowrap; width: 100%; }
        .grid th, .grid td { border-right: 1px solid #f4f4f5; }

        /* Sticky name + year columns */
        .name-cell {
          position: sticky; left: 0; z-index: 2; background: #fff;
          min-width: 150px; max-width: 190px; border-right: 1px solid #ececec;
          padding: 10px 14px; vertical-align: top;
        }
        .name-cell.head { background: #fafafa; z-index: 4; }
        .name-main { font-size: 13px; font-weight: 700; color: #18181b; letter-spacing: -0.2px; white-space: normal; }
        .name-meta { font-size: 10.5px; color: #6b7280; margin-top: 3px; white-space: normal; line-height: 1.5; }
        .name-actions { margin-top: 8px; display: flex; gap: 6px; }
        .yr-cell {
          position: sticky; left: 150px; z-index: 2; background: #fff;
          min-width: 66px; border-right: 1px solid #ececec;
          font-size: 12px; font-weight: 700; color: #4338ca; padding: 10px 12px; text-align: center;
        }
        .yr-cell.head { background: #fafafa; z-index: 4; }

        .th-month {
          background: #fafafa; color: #9ca3af; text-align: center; font-size: 10.5px;
          font-weight: 500; letter-spacing: 0.3px; padding: 9px 4px; border-bottom: 1px solid #ececec;
        }
        .th-month.inactive { color: #d9d9de; }
        .th-sub {
          text-align: center; font-size: 8.5px; font-weight: 600; letter-spacing: 0.2px;
          padding: 5px 6px; border-bottom: 1px solid #ececec; min-width: 62px; background: #fafafa;
          text-transform: uppercase;
        }
        .th-sub.p-due { color: #7c3aed; }
        .th-sub.p-paid { color: #16a34a; }
        .th-sub.i-due { color: #d97706; }
        .th-sub.i-paid { color: #16a34a; border-right: 1px solid #ececec; }

        .month-group { border-left: 1px solid #ececec; }

        td.cell {
          text-align: right; padding: 8px 8px; font-variant-numeric: tabular-nums; font-size: 11px;
          border-bottom: 1px solid #f4f4f5;
        }
        td.p-due { background: #faf5ff; color: #6b21a8; }
        td.i-due { background: #fffbeb; color: #b45309; }
        td.p-paid, td.i-paid { color: #16a34a; cursor: pointer; }
        td.i-paid { border-right: 1px solid #ececec; }
        td.p-paid:hover, td.i-paid:hover { background: #f0fdf4; }
        td.cell .carry { font-size: 9px; margin-top: 2px; }
        td.p-due .carry { color: #7c3aed; }
        td.i-due .carry { color: #d97706; }
        .td-inactive {
          background: #fafafa; color: #d9d9de; text-align: center; font-size: 11px;
          border-bottom: 1px solid #f4f4f5; padding: 8px 6px; border-left: 1px solid #ececec;
        }

        .edit-btn {
          border: 1px solid #d6d6d6; background: #fff; color: #374151;
          border-radius: 6px; padding: 4px 10px; font-size: 11px; font-weight: 500;
          cursor: pointer; font-family: inherit; transition: all 0.13s;
        }
        .edit-btn:hover { background: #f4f4f5; border-color: #c4c4c4; }
        .del-btn {
          border: 1px solid #f1d5d5; background: #fff5f5; color: #dc2626;
          border-radius: 6px; padding: 4px 10px; font-size: 11px; font-weight: 500;
          cursor: pointer; font-family: inherit; transition: all 0.13s;
        }
        .del-btn:hover { background: #fee2e2; border-color: #fca5a5; }
        .out-badge { display: inline-block; font-size: 10px; font-weight: 600; margin-top: 6px; }
        .out-badge.owed { color: #dc2626; }
        .out-badge.clear { color: #16a34a; }

        /* Inline Total column (after December) */
        .th-month.total-group {
          background: #f3f4f6; color: #4338ca; font-weight: 700; border-left: 2px solid #d4d4d8;
        }
        .th-sub.total-group { border-left: 2px solid #d4d4d8; }
        .th-sub.tot { background: #f3f4f6; }
        .cell.total-cell {
          background: #f6f6f7; font-weight: 700; color: #18181b;
          cursor: default; border-bottom: 1px solid #f4f4f5;
        }
        .cell.p-due.total-cell { border-left: 2px solid #d4d4d8; color: #6b21a8; }
        .cell.p-paid.total-cell, .cell.i-paid.total-cell { color: #16a34a; }
        .cell.i-due.total-cell { color: #b45309; }
        .cell.total-cell:hover { background: #f6f6f7; }

        .state, .empty {
          text-align: center; padding: 48px 20px; color: #9ca3af; font-size: 14px;
          background: #fff; border: 1px solid #ececec; border-radius: 14px;
        }
        .err { color: #dc2626; }

        /* Toast */
        .bw-toast {
          position: fixed; bottom: 28px; right: 28px; padding: 13px 18px; border-radius: 12px;
          font-family: inherit; font-size: 13px; font-weight: 500; display: flex; align-items: center;
          gap: 10px; z-index: 9999; box-shadow: 0 8px 28px rgba(16,24,40,0.16); background: #fff;
          animation: toastIn 0.28s cubic-bezier(0.18,0.89,0.32,1.28); max-width: 340px;
        }
        .bw-toast.success { color: #16a34a; border: 1px solid #bbf7d0; }
        .bw-toast.error { color: #dc2626; border: 1px solid #fecaca; }
        .bw-toast-ic {
          width: 22px; height: 22px; border-radius: 50%; display: flex; align-items: center;
          justify-content: center; font-size: 12px; font-weight: 700; color: #fff; flex-shrink: 0;
        }
        .bw-toast-ic.success { background: #22c55e; }
        .bw-toast-ic.error { background: #ef4444; }
        @keyframes toastIn { from { opacity: 0; transform: translateY(16px) scale(0.96); } to { opacity: 1; transform: translateY(0) scale(1); } }

        /* Modal */
        .modal-overlay {
          position: fixed; inset: 0; background: rgba(24,24,27,0.45);
          display: flex; align-items: center; justify-content: center;
          padding: 20px; z-index: 100; backdrop-filter: blur(2px);
        }
        .modal {
          background: #fff; border-radius: 18px; width: 100%; max-width: 460px;
          box-shadow: 0 20px 50px rgba(16,24,40,0.25); overflow: hidden;
          max-height: 92vh; display: flex; flex-direction: column;
        }
        .modal-head { padding: 20px 24px 14px; border-bottom: 1px solid #ececec; }
        .modal-title { font-size: 17px; font-weight: 700; color: #18181b; letter-spacing: -0.3px; margin: 0; }
        .modal-desc { font-size: 12.5px; color: #6b7280; margin: 4px 0 0; }
        .modal-body { padding: 20px 24px; overflow-y: auto; }
        .field { margin-bottom: 15px; }
        .field:last-child { margin-bottom: 0; }
        .field-label {
          display: block; font-size: 11px; font-weight: 600; text-transform: uppercase;
          letter-spacing: 0.4px; color: #9ca3af; margin-bottom: 6px;
        }
        .field-hint { font-size: 11px; color: #9ca3af; font-weight: 500; margin-left: 6px; text-transform: none; letter-spacing: 0; }
        .field-input {
          width: 100%; border: 1px solid #e0e0e2; border-radius: 9px; padding: 10px 12px;
          font-family: inherit; font-size: 14px; color: #18181b; outline: none;
          transition: all 0.13s; background: #fff;
        }
        .field-input:focus { border-color: #18181b; box-shadow: 0 0 0 3px rgba(24,24,27,0.07); }
        .field-row { display: flex; gap: 12px; }
        .field-row .field { flex: 1; }
        .modal-foot {
          padding: 14px 24px 20px; display: flex; gap: 10px; justify-content: flex-end;
          border-top: 1px solid #ececec;
        }
        .btn-cancel {
          border: 1px solid #e0e0e2; background: #fff; color: #374151; border-radius: 9px;
          padding: 9px 18px; font-family: inherit; font-size: 13px; font-weight: 500; cursor: pointer; transition: all 0.13s;
        }
        .btn-cancel:hover { background: #f4f4f5; }
        .btn-save {
          border: none; background: #18181b; color: #fff; border-radius: 9px;
          padding: 9px 22px; font-family: inherit; font-size: 13px; font-weight: 500; cursor: pointer; transition: all 0.13s;
        }
        .btn-save:hover { background: #000; }
        .btn-save:disabled { opacity: 0.55; cursor: wait; }
      `}</style>

      <div className="bw-head">
        <div>
          <div className="bw-eyebrow">Borrow Tracker</div>
          <h2 className="bw-title">Borrowings</h2>
          <p className="bw-sub">
            Total borrowed <b>{fmt(totalBorrowed)}</b> · {records.length} record{records.length !== 1 ? 's' : ''} · Each month splits into <span style={{ color: '#7c3aed' }}>Principal</span> and <span style={{ color: '#d97706' }}>Interest</span> · click a <span style={{ color: '#16a34a' }}>Paid</span> cell to edit
          </p>
        </div>
        <button className="add-btn" onClick={() => navigate('/borrowform')}>
          <span style={{ fontSize: 16, lineHeight: 1 }}>+</span> Add Amount
        </button>
      </div>

      {loading ? (
        <div className="state">Loading…</div>
      ) : error ? (
        <div className="state err">{error}</div>
      ) : records.length === 0 ? (
        <div className="empty">No borrow records yet. Click “Add Amount” to create one.</div>
      ) : (
        yearGroups.map(({ year, rows }) => (
          <div className="bw-card" key={year}>
            <div className="bw-year-head">
              <span className="bw-year-label">{year}</span>
              <span className="bw-year-count">{rows.length} borrowing{rows.length !== 1 ? 's' : ''} active</span>
            </div>
            <div className="bw-scroll">
              <table className="grid">
                <thead>
                  <tr>
                    <th className="name-cell head" rowSpan={2} style={{ position: 'sticky', left: 0 }}>Borrower</th>
                    {MONTHS.map((m) => {
                      const anyActive = rows.some(row => row.cells?.[m])
                      return <th key={m} colSpan={4} className={`th-month month-group${anyActive ? '' : ' inactive'}`}>{m}</th>
                    })}
                    <th colSpan={4} className="th-month total-group">Total ({year})</th>
                  </tr>
                  <tr>
                    {MONTHS.map((m) => (
                      <React.Fragment key={m}>
                        <th className="th-sub p-due month-group">P·Due</th>
                        <th className="th-sub p-paid">P·Paid</th>
                        <th className="th-sub i-due">I·Due</th>
                        <th className="th-sub i-paid">I·Paid</th>
                      </React.Fragment>
                    ))}
                    <th className="th-sub p-due total-group">P·Due</th>
                    <th className="th-sub p-paid tot">P·Paid</th>
                    <th className="th-sub i-due tot">I·Due</th>
                    <th className="th-sub i-paid tot">I·Paid</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => {
                    const r = row.record
                    return (
                      <tr key={`${r._id}-${year}`}>
                        <td className="name-cell">
                          <div className="name-main">{r.name}</div>
                          <div className="name-meta">
                            Borrowed {fmt(r.amount)} · {r.rateOfInterest}%/mo · {r.tenure} mo<br />
                            from {parseDate(r.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                          </div>
                          <div className={`out-badge ${row.outstanding <= 0.005 ? 'clear' : 'owed'}`}>
                            {row.outstanding <= 0.005 ? '✓ Cleared' : `Outstanding ${fmt(row.outstanding)}`}
                          </div>
                          <div className="name-actions">
                            <button className="edit-btn" onClick={() => openEditModal(r)}>Edit</button>
                            <button className="del-btn" onClick={() => handleDelete(r._id)}>Delete</button>
                          </div>
                        </td>
                        {MONTHS.map((m) => {
                          const cell = row.cells?.[m]
                          if (!cell) {
                            return <td key={m} className="td-inactive" colSpan={4}>—</td>
                          }
                          const pCarry = cell.principalCarry > 0.005
                          const iCarry = cell.interestCarry > 0.005
                          return (
                            <React.Fragment key={m}>
                              <td className="cell p-due month-group">
                                <div>{fmt(cell.principalTotalDue)}</div>
                                {pCarry && <div className="carry">carry {fmt(cell.principalCarry)} →</div>}
                              </td>
                              <td
                                className="cell p-paid"
                                onClick={() => openCellEdit(r, year, m, cell)}
                                title="Click to edit paid amounts"
                              >
                                {fmt(cell.principalPaid)}
                              </td>
                              <td className="cell i-due">
                                <div>{fmt(cell.interestTotalDue)}</div>
                                {iCarry && <div className="carry">carry {fmt(cell.interestCarry)} →</div>}
                              </td>
                              <td
                                className="cell i-paid"
                                onClick={() => openCellEdit(r, year, m, cell)}
                                title="Click to edit paid amounts"
                              >
                                {fmt(cell.interestPaid)}
                              </td>
                            </React.Fragment>
                          )
                        })}
                        {(() => {
                          const t = rowYearTotals(row.cells)
                          return (
                            <>
                              <td className="cell p-due total-cell">{fmt(t.pDue)}</td>
                              <td className="cell p-paid total-cell">{fmt(t.pPaid)}</td>
                              <td className="cell i-due total-cell">{fmt(t.iDue)}</td>
                              <td className="cell i-paid total-cell">{fmt(t.iPaid)}</td>
                            </>
                          )
                        })()}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ))
      )}

      {/* ── Cell edit modal (principal + interest paid) ─────────────────── */}
      {cellEdit && (
        <div className="modal-overlay" onClick={closeCellEdit}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 420 }}>
            <div className="modal-head">
              <h3 className="modal-title">Record payment</h3>
              <p className="modal-desc">
                {cellEdit.record.name} · {cellEdit.month} {cellEdit.year}
              </p>
            </div>
            <div className="modal-body">
              <div className="field-row">
                <div className="field">
                  <label className="field-label">
                    Principal paid
                    <span className="field-hint">due {fmt(cellEdit.cell.principalTotalDue)}</span>
                  </label>
                  <input
                    className="field-input"
                    type="number"
                    step="0.01"
                    autoFocus
                    value={cellForm.principalPaid}
                    onChange={(e) => setCellField('principalPaid', e.target.value)}
                    placeholder="0"
                  />
                </div>
              </div>
              <div className="field-row">
                <div className="field">
                  <label className="field-label">
                    Interest paid
                    <span className="field-hint">due {fmt(cellEdit.cell.interestTotalDue)}</span>
                  </label>
                  <input
                    className="field-input"
                    type="number"
                    step="0.01"
                    value={cellForm.interestPaid}
                    onChange={(e) => setCellField('interestPaid', e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleCellSave() }}
                    placeholder="0"
                  />
                </div>
              </div>
            </div>
            <div className="modal-foot">
              <button className="btn-cancel" onClick={closeCellEdit} disabled={savingCell}>Cancel</button>
              <button className="btn-save" onClick={handleCellSave} disabled={savingCell}>
                {savingCell ? 'Saving…' : 'Save payment'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Edit record modal ───────────────────────────────────────────── */}
      {editRecord && (
        <div className="modal-overlay" onClick={closeEditModal}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h3 className="modal-title">Edit borrowing</h3>
              <p className="modal-desc">Update the details for this borrow record.</p>
            </div>
            <div className="modal-body">
              <div className="field">
                <label className="field-label">Name</label>
                <input
                  className="field-input"
                  value={form.name}
                  onChange={(e) => setField('name', e.target.value)}
                  placeholder="Lender / purpose"
                />
              </div>
              <div className="field-row">
                <div className="field">
                  <label className="field-label">Amount (₹)</label>
                  <input
                    className="field-input"
                    type="number"
                    value={form.amount}
                    onChange={(e) => setField('amount', e.target.value)}
                    placeholder="0"
                  />
                </div>
                <div className="field">
                  <label className="field-label">Rate (% / month)</label>
                  <input
                    className="field-input"
                    type="number"
                    step="0.01"
                    value={form.rateOfInterest}
                    onChange={(e) => setField('rateOfInterest', e.target.value)}
                    placeholder="0"
                  />
                </div>
              </div>
              <div className="field-row">
                <div className="field">
                  <label className="field-label">Tenure (months)</label>
                  <input
                    className="field-input"
                    type="number"
                    value={form.tenure}
                    onChange={(e) => setField('tenure', e.target.value)}
                    placeholder="1"
                  />
                </div>
                <div className="field">
                  <label className="field-label">Borrow date</label>
                  <input
                    className="field-input"
                    type="date"
                    value={form.date}
                    onChange={(e) => setField('date', e.target.value)}
                  />
                </div>
              </div>
            </div>
            <div className="modal-foot">
              <button className="btn-cancel" onClick={closeEditModal} disabled={savingRecord}>Cancel</button>
              <button className="btn-save" onClick={handleRecordSave} disabled={savingRecord}>
                {savingRecord ? 'Saving…' : 'Save changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className={`bw-toast ${toast.type}`}>
          <span className={`bw-toast-ic ${toast.type}`}>{toast.type === 'success' ? '✓' : '!'}</span>
          {toast.msg}
        </div>
      )}
    </div>
  )
}

export default Borrow
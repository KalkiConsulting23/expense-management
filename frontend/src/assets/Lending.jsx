import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:5000/api'

const Lending = () => {
  const navigate = useNavigate()
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  // Local draft values for the "new payment" inputs, keyed by record id
  const [drafts, setDrafts] = useState({})
  const [savingId, setSavingId] = useState(null)

  const fetchRecords = async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`${API_BASE}/lending`)
      if (!res.ok) throw new Error('Failed to fetch lending records')
      const data = await res.json()
      const list = Array.isArray(data) ? data : []
      setRecords(list)
      // start every new-payment input blank
      const seed = {}
      list.forEach(r => { seed[r._id] = '' })
      setDrafts(seed)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchRecords()
  }, [])

  const handleDraftChange = (id, value) => {
    setDrafts(prev => ({ ...prev, [id]: value }))
  }

  const handleSaveReceived = async (record) => {
    const raw = drafts[record._id]
    if (raw === '' || raw === undefined) {
      alert('Enter an amount to add')
      return
    }
    const value = Number(raw)
    if (isNaN(value) || value <= 0) {
      alert('Enter a valid positive amount')
      return
    }

    const alreadyReceived = Number(record.receivedAmount || 0)
    const remaining = Number(record.amount) - alreadyReceived
    if (value > remaining) {
      alert(`Payment cannot exceed the remaining amount (₹${remaining})`)
      return
    }

    setSavingId(record._id)
    const prev = records
    const newTotal = alreadyReceived + value
    // optimistic update — add to the running total
    setRecords(records.map(r =>
      r._id === record._id
        ? { ...r, receivedAmount: newTotal, receivedDate: new Date().toISOString() }
        : r
    ))

    try {
      const res = await fetch(`${API_BASE}/lending/${record._id}/receive`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ received: value }),
      })
      if (!res.ok) throw new Error('Failed to update received amount')
      const saved = await res.json()
      setRecords(rs => rs.map(r => (r._id === saved._id ? saved : r)))
      // clear the input after a successful payment
      setDrafts(d => ({ ...d, [saved._id]: '' }))
    } catch (err) {
      setRecords(prev) // rollback
      alert(err.message)
    } finally {
      setSavingId(null)
    }
  }

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this lending record?')) { return }
    const prev = records
    setRecords(records.filter(r => r._id !== id)) // optimistic
    try {
      const res = await fetch(`${API_BASE}/lending/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Delete failed')
    } catch (err) {
      setRecords(prev) // rollback
      alert(err.message)
    }
  }

  const formatDate = (d) => {
    if (!d) return '—'
    return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
  }

  const formatAmount = (n) =>
    Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })

  const totalLent = records.reduce((s, r) => s + Number(r.amount || 0), 0)
  const totalReceived = records.reduce((s, r) => s + Number(r.receivedAmount || 0), 0)
  const totalRemaining = totalLent - totalReceived

  return (
    <div className="lend-page">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
        .lend-page {
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
          max-width: 1050px; margin: 0 auto; padding: 24px 20px 60px;
        }
        .lend-head {
          display: flex; align-items: flex-start; justify-content: space-between;
          gap: 12px; margin-bottom: 20px; flex-wrap: wrap;
        }
        .lend-title { font-size: 22px; font-weight: 700; color: #18181b; letter-spacing: -0.4px; }
        .lend-stats { display: flex; gap: 18px; margin-top: 6px; flex-wrap: wrap; }
        .lend-stat { font-size: 12.5px; color: #6b7280; }
        .lend-stat b { display: block; font-size: 15px; color: #18181b; margin-top: 1px; }
        .lend-stat.rec b { color: #16a34a; }
        .lend-stat.rem b { color: #d97706; }
        .add-btn {
          display: inline-flex; align-items: center; gap: 7px;
          padding: 9px 16px; border-radius: 9px; border: none;
          background: #18181b; color: #fff; font-family: inherit;
          font-size: 13.5px; font-weight: 600; cursor: pointer; transition: background 0.15s;
        }
        .add-btn:hover { background: #000; }
        .lend-card {
          background: #fff; border: 1px solid #ececec; border-radius: 14px;
          overflow: hidden; box-shadow: 0 1px 3px rgba(16,24,40,0.04);
        }
        table { width: 100%; border-collapse: collapse; }
        th {
          text-align: left; font-size: 11px; font-weight: 600; color: #9ca3af;
          text-transform: uppercase; letter-spacing: 0.4px;
          padding: 12px 16px; border-bottom: 1px solid #f1f1f1; background: #fafafa;
        }
        td { padding: 13px 16px; font-size: 13.5px; color: #374151; border-bottom: 1px solid #f5f5f5; }
        tr:last-child td { border-bottom: none; }
        tr:hover td { background: #fbfbfb; }
        .cell-name { font-weight: 600; color: #18181b; }
        .cell-rec { font-weight: 600; color: #16a34a; }
        .cell-rem { font-weight: 600; color: #d97706; }
        .cell-rem.clear { color: #16a34a; }
        .rec-input-wrap { display: flex; align-items: center; gap: 6px; }
        .rec-input {
          width: 90px; padding: 6px 9px; border: 1px solid #e5e7eb; border-radius: 7px;
          font-family: inherit; font-size: 13px; color: #18181b; background: #fff; outline: none;
          transition: border 0.15s, box-shadow 0.15s;
        }
        .rec-input:focus { border-color: #16a34a; box-shadow: 0 0 0 3px rgba(22,163,74,0.10); }
        .save-btn {
          display: inline-flex; align-items: center; justify-content: center;
          width: 30px; height: 30px; border-radius: 7px;
          border: 1px solid #bbf7d0; background: #f0fdf4; color: #16a34a;
          cursor: pointer; transition: all 0.13s; flex-shrink: 0;
        }
        .save-btn:hover { background: #dcfce7; border-color: #86efac; }
        .save-btn:disabled { opacity: 0.5; cursor: not-allowed; }
        .rec-sub { display: block; font-size: 11px; color: #9ca3af; font-weight: 400; margin-top: 4px; }
        .del-btn {
          border: 1px solid #f1d5d5; background: #fff5f5; color: #dc2626;
          border-radius: 7px; padding: 5px 10px; font-size: 12px; font-weight: 500;
          cursor: pointer; font-family: inherit; transition: all 0.13s;
        }
        .del-btn:hover { background: #fee2e2; border-color: #fca5a5; }
        .empty, .state { text-align: center; padding: 48px 20px; color: #9ca3af; font-size: 14px; }
        .err { color: #dc2626; }
        .pill {
          display: inline-block; font-size: 10.5px; font-weight: 600; padding: 2px 8px;
          border-radius: 20px; margin-left: 8px; vertical-align: middle;
        }
        .pill.done { background: #dcfce7; color: #16a34a; }
      `}</style>

      <div className="lend-head">
        <div>
          <div className="lend-title">Lending</div>
          <div className="lend-stats">
            <div className="lend-stat">Total Lent<b>₹{formatAmount(totalLent)}</b></div>
            <div className="lend-stat rec">Received<b>₹{formatAmount(totalReceived)}</b></div>
            <div className="lend-stat rem">Remaining<b>₹{formatAmount(totalRemaining)}</b></div>
          </div>
        </div>
        <button className="add-btn" onClick={() => navigate('/lendingform')}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          Add Amount
        </button>
      </div>

      <div className="lend-card">
        {loading ? (
          <div className="state">Loading…</div>
        ) : error ? (
          <div className="state err">{error}</div>
        ) : records.length === 0 ? (
          <div className="empty">No lending records yet. Click “Add Amount” to create one.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Amount (₹)</th>
                <th>Date</th>
                <th>Received (₹)</th>
                <th>Add Payment (₹)</th>
                <th>Remaining (₹)</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {records.map((r) => {
                const received = Number(r.receivedAmount || 0)
                const remaining = Number(r.amount) - received
                const cleared = remaining <= 0
                return (
                  <tr key={r._id}>
                    <td className="cell-name">
                      {r.name}
                      {cleared && <span className="pill done">Cleared</span>}
                    </td>
                    <td>₹{formatAmount(r.amount)}</td>
                    <td>{formatDate(r.date)}</td>
                    <td className="cell-rec">
                      ₹{formatAmount(received)}
                      {r.receivedDate && <span className="rec-sub">updated: {formatDate(r.receivedDate)}</span>}
                    </td>
                    <td>
                      <div className="rec-input-wrap">
                        <input
                          className="rec-input"
                          type="number"
                          min="0"
                          step="any"
                          value={drafts[r._id] ?? ''}
                          onChange={(e) => handleDraftChange(r._id, e.target.value)}
                          placeholder="0"
                          disabled={cleared}
                        />
                        <button
                          className="save-btn"
                          onClick={() => handleSaveReceived(r)}
                          disabled={savingId === r._id || cleared}
                          title="Add payment"
                        >
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="20 6 9 17 4 12"/>
                          </svg>
                        </button>
                      </div>
                    </td>
                    <td className={`cell-rem${cleared ? ' clear' : ''}`}>
                      ₹{formatAmount(remaining < 0 ? 0 : remaining)}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <button className="del-btn" onClick={() => handleDelete(r._id)}>Delete</button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

export default Lending
import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:5000/api'

const todayISO = () => {
  const d = new Date()
  const off = d.getTimezoneOffset()
  const local = new Date(d.getTime() - off * 60000)
  return local.toISOString().slice(0, 10)
}

const Borrowform = () => {
  const navigate = useNavigate()
  const [form, setForm] = useState({
    name: '',
    amount: '',
    rateOfInterest: '',
    tenure: '',
    date: todayISO(),
  })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [toast, setToast] = useState(null)   // { type, msg }

  const showToast = (type, msg) => {
    setToast({ type, msg })
    setTimeout(() => setToast(null), 3000)
  }

  const handleChange = (e) => {
    const { name, value } = e.target
    setForm(prev => ({ ...prev, [name]: value }))
  }

  // live preview: every month = principal (amount/tenure) + interest (amount*rate%)
  const amt = Number(form.amount) || 0
  const rate = Number(form.rateOfInterest) || 0
  const ten = Number(form.tenure) || 0
  const monthlyPrincipal = ten > 0 ? amt / ten : 0
  const monthlyInterest = amt * (rate / 100)
  const monthlyTotal = monthlyPrincipal + monthlyInterest

  const handleSubmit = async () => {
    setError('')
    if (!form.name.trim()) return setError('Name is required')
    if (form.amount === '' || Number(form.amount) < 0) return setError('Enter a valid amount')
    if (form.rateOfInterest === '' || Number(form.rateOfInterest) < 0) return setError('Enter a valid rate of interest')
    if (form.tenure === '' || Number(form.tenure) <= 0) return setError('Enter a valid tenure (at least 1 month)')
    if (!form.date) return setError('Date is required')

    setSubmitting(true)
    try {
      const res = await fetch(`${API_BASE}/borrow`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name.trim(),
          amount: Number(form.amount),
          rateOfInterest: Number(form.rateOfInterest),
          tenure: Number(form.tenure),
          date: form.date,
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Failed to save borrow record')
      }
      showToast('success', 'Borrow record saved.')
      setTimeout(() => navigate('/borrow'), 1200)
    } catch (err) {
      setError(err.message)
      showToast('error', err.message || 'Something went wrong.')
      setSubmitting(false)
    }
  }

  const fmt = (n) => Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })
  const showPreview = amt > 0 && ten > 0 && rate >= 0

  return (
    <div className="bf-page">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
        .bf-page {
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
          max-width: 560px; margin: 0 auto; padding: 24px 20px 60px;
        }
        .bf-title { font-size: 22px; font-weight: 700; color: #18181b; letter-spacing: -0.4px; margin-bottom: 4px; }
        .bf-sub { font-size: 13px; color: #6b7280; margin-bottom: 22px; }
        .bf-card {
          background: #fff; border: 1px solid #ececec; border-radius: 14px;
          padding: 22px; box-shadow: 0 1px 3px rgba(16,24,40,0.04);
        }
        .bf-field { margin-bottom: 16px; }
        .bf-label { display: block; font-size: 12.5px; font-weight: 600; color: #374151; margin-bottom: 6px; }
        .bf-input {
          width: 100%; padding: 10px 12px; border: 1px solid #e5e7eb; border-radius: 9px;
          font-family: inherit; font-size: 14px; color: #18181b; background: #fff;
          transition: border 0.15s, box-shadow 0.15s; outline: none;
        }
        .bf-input:focus { border-color: #18181b; box-shadow: 0 0 0 3px rgba(24,24,27,0.06); }
        .bf-hint { font-size: 11.5px; color: #9ca3af; margin-top: 5px; }
        .bf-err {
          background: #fff5f5; border: 1px solid #fca5a5; color: #dc2626;
          padding: 9px 12px; border-radius: 9px; font-size: 13px; margin-bottom: 16px;
        }

        /* Monthly split preview */
        .bf-preview {
          border: 1px solid #ececec; border-radius: 11px; padding: 14px 16px;
          background: #fafafa; margin-top: 4px;
        }
        .bf-preview-head { font-size: 12px; font-weight: 600; color: #374151; margin-bottom: 10px; }
        .bf-preview-row { display: flex; gap: 10px; }
        .bf-preview-item {
          flex: 1; border-radius: 9px; padding: 10px 12px; background: #fff; border: 1px solid #eee;
        }
        .bf-preview-item.principal { border-color: #e9d5ff; background: #faf5ff; }
        .bf-preview-item.interest { border-color: #fde68a; background: #fffbeb; }
        .bf-preview-item.total { border-color: #bbf7d0; background: #f0fdf4; }
        .bf-preview-lbl { font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.3px; }
        .bf-preview-item.principal .bf-preview-lbl { color: #7c3aed; }
        .bf-preview-item.interest .bf-preview-lbl { color: #d97706; }
        .bf-preview-item.total .bf-preview-lbl { color: #16a34a; }
        .bf-preview-val { font-size: 15px; font-weight: 700; color: #18181b; margin-top: 3px; font-variant-numeric: tabular-nums; }
        .bf-preview-foot { font-size: 11.5px; color: #6b7280; margin-top: 10px; line-height: 1.5; }

        .bf-actions { display: flex; gap: 10px; margin-top: 22px; }
        .bf-btn {
          flex: 1; padding: 11px; border-radius: 9px; font-family: inherit;
          font-size: 14px; font-weight: 600; cursor: pointer; transition: all 0.15s;
        }
        .bf-save { border: none; background: #18181b; color: #fff; }
        .bf-save:hover { background: #000; }
        .bf-save:disabled { opacity: 0.6; cursor: not-allowed; }
        .bf-cancel { border: 1px solid #e5e7eb; background: #fff; color: #4b5563; }
        .bf-cancel:hover { background: #f7f7f7; color: #18181b; }

        /* Toast (bottom-right) */
        .bf-toast {
          position: fixed; bottom: 28px; right: 28px; padding: 13px 18px; border-radius: 12px;
          font-family: inherit; font-size: 13px; font-weight: 500; display: flex; align-items: center;
          gap: 10px; z-index: 9999; box-shadow: 0 8px 28px rgba(16,24,40,0.16); background: #fff;
          animation: bfToastIn 0.28s cubic-bezier(0.18,0.89,0.32,1.28); max-width: 340px;
        }
        .bf-toast.success { color: #16a34a; border: 1px solid #bbf7d0; }
        .bf-toast.error { color: #dc2626; border: 1px solid #fecaca; }
        .bf-toast-ic {
          width: 22px; height: 22px; border-radius: 50%; display: flex; align-items: center;
          justify-content: center; font-size: 12px; font-weight: 700; color: #fff; flex-shrink: 0;
        }
        .bf-toast-ic.success { background: #22c55e; }
        .bf-toast-ic.error { background: #ef4444; }
        @keyframes bfToastIn { from { opacity: 0; transform: translateY(16px) scale(0.96); } to { opacity: 1; transform: translateY(0) scale(1); } }
        @media (max-width: 520px) { .bf-toast { left: 16px; right: 16px; bottom: 16px; max-width: none; } }
      `}</style>

      <div className="bf-title">Add Borrow</div>
      <div className="bf-sub">Enter the details of the borrowed amount. Rate of interest is per month.</div>

      <div className="bf-card">
        {error && <div className="bf-err">{error}</div>}

        <div className="bf-field">
          <label className="bf-label">Name</label>
          <input
            className="bf-input" type="text" name="name"
            value={form.name} onChange={handleChange}
            placeholder="e.g. HDFC Loan"
          />
        </div>

        <div className="bf-field">
          <label className="bf-label">Amount (₹)</label>
          <input
            className="bf-input" type="number" name="amount" min="0" step="any"
            value={form.amount} onChange={handleChange}
            placeholder="e.g. 100"
          />
        </div>

        <div className="bf-field">
          <label className="bf-label">Rate of Interest (% per month)</label>
          <input
            className="bf-input" type="number" name="rateOfInterest" min="0" step="any"
            value={form.rateOfInterest} onChange={handleChange}
            placeholder="e.g. 3"
          />
        </div>

        <div className="bf-field">
          <label className="bf-label">Tenure (months)</label>
          <input
            className="bf-input" type="number" name="tenure" min="1" step="1"
            value={form.tenure} onChange={handleChange}
            placeholder="e.g. 10"
          />
        </div>

        <div className="bf-field">
          <label className="bf-label">Date</label>
          <input
            className="bf-input" type="date" name="date"
            value={form.date} onChange={handleChange}
          />
        </div>

        {showPreview && (
          <div className="bf-field">
            <label className="bf-label">Monthly breakdown</label>
            <div className="bf-preview">
              <div className="bf-preview-head">Each month for {ten} month{ten !== 1 ? 's' : ''}:</div>
              <div className="bf-preview-row">
                <div className="bf-preview-item principal">
                  <div className="bf-preview-lbl">Principal</div>
                  <div className="bf-preview-val">₹{fmt(monthlyPrincipal)}</div>
                </div>
                <div className="bf-preview-item interest">
                  <div className="bf-preview-lbl">Interest</div>
                  <div className="bf-preview-val">₹{fmt(monthlyInterest)}</div>
                </div>
                <div className="bf-preview-item total">
                  <div className="bf-preview-lbl">Total</div>
                  <div className="bf-preview-val">₹{fmt(monthlyTotal)}</div>
                </div>
              </div>
              <div className="bf-preview-foot">
                Principal of {fmt(amt)} split evenly across {ten} month{ten !== 1 ? 's' : ''}, plus {fmt(monthlyInterest)} interest ({rate}% of {fmt(amt)}) every month.
              </div>
            </div>
          </div>
        )}

        <div className="bf-actions">
          <button className="bf-btn bf-cancel" onClick={() => navigate('/borrow')} disabled={submitting}>
            Cancel
          </button>
          <button className="bf-btn bf-save" onClick={handleSubmit} disabled={submitting}>
            {submitting ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>

      {/* Toast (bottom-right) */}
      {toast && (
        <div className={`bf-toast ${toast.type}`}>
          <span className={`bf-toast-ic ${toast.type}`}>{toast.type === 'success' ? '✓' : '!'}</span>
          {toast.msg}
        </div>
      )}
    </div>
  )
}

export default Borrowform
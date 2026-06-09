import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'

const defaultForm = {
  name: '',
  contactNumber: '',
  amount: '',
  source: 'cash',
  billNumber: '',
  comment: '',
}

const SALES_CACHE_KEY = 'local_sales_data_cache';

const Salesform = () => {
  const navigate = useNavigate()
  const [form, setForm] = useState(defaultForm)
  const [loading, setLoading] = useState(false)
  const [toast, setToast] = useState(null)

  const showToast = (type, msg) => {
    setToast({ type, msg })
    setTimeout(() => setToast(null), 3000)
  }

  const handleChange = (e) => {
    const { name, value } = e.target
    setForm((prev) => ({ ...prev, [name]: value }))
  }

  const handleSubmit = async () => {
    const { name, contactNumber, amount, source, billNumber } = form
    if (!name || !contactNumber || !amount || !source || !billNumber) {
      showToast('error', 'Please fill in all required fields.')
      return
    }
    try {
      setLoading(true)
      // Swapped out custom hook engine to route cleanly through a native javascript fetch loop
      const res = await fetch('http://localhost:5000/api/sales', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, amount: Number(form.amount) }),
      })
      if (!res.ok) throw new Error('Failed')

      // SMART CACHE INVALIDATION: Wipe sales cache footprint array values safely
      sessionStorage.removeItem(SALES_CACHE_KEY);

      showToast('success', 'Sale recorded successfully!')
      setForm(defaultForm)
      setTimeout(() => navigate('/salestable'), 1500)
    } catch (err) {
      showToast('error', 'Something went wrong.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Lora:ital,wght@0,400;0,600;1,400&family=DM+Sans:wght@300;400;500&display=swap');
        *, *::before, *::after { box-sizing: border-box; }
        .sf-page { min-height: 100vh; background: #f5f0e8; display: flex; align-items: flex-start; justify-content: center; padding: 40px 16px 60px; font-family: 'DM Sans', sans-serif; }
        .sf-card { width: 100%; max-width: 560px; background: #fffdf8; border: 1.5px solid #e8dece; border-radius: 20px; padding: 36px 36px 32px; box-shadow: 0 2px 0 #e2d9c8, 0 8px 32px rgba(160,130,90,0.08); }
        .sf-eyebrow { font-family: 'DM Sans', sans-serif; font-size: 10px; font-weight: 500; letter-spacing: 2px; text-transform: uppercase; color: #b08a5e; margin-bottom: 6px; }
        .sf-heading { font-family: 'Lora', serif; font-size: 26px; font-weight: 600; color: #2e2318; margin: 0 0 4px; line-height: 1.2; }
        .sf-sub { font-size: 13px; color: #9a8775; margin-bottom: 28px; }
        .sf-divider-top { height: 1px; background: linear-gradient(to right, #e8dece, transparent); margin-bottom: 28px; }
        .sf-row { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 16px; }
        .sf-field { display: flex; flex-direction: column; gap: 7px; margin-bottom: 16px; }
        .sf-field:last-child { margin-bottom: 0; }
        .sf-label { font-size: 11px; font-weight: 500; color: #8c7a68; letter-spacing: 1px; text-transform: uppercase; }
        .sf-required { color: #c97844; margin-left: 2px; }
        .sf-input, .sf-textarea { background: #faf6ee; border: 1.5px solid #e0d4c0; border-radius: 12px; padding: 11px 15px; font-family: 'DM Sans', sans-serif; font-size: 14px; color: #2e2318; outline: none; transition: border-color 0.18s, background 0.18s; width: 100%; }
        .sf-input::placeholder, .sf-textarea::placeholder { color: #c5b49e; }
        .sf-input:focus, .sf-textarea:focus { border-color: #c97844; background: #fff; }
        .sf-textarea { resize: vertical; min-height: 88px; }
        .sf-prefix-wrap { position: relative; display: flex; align-items: center; }
        .sf-prefix { position: absolute; left: 15px; font-size: 14px; color: #9a8775; font-family: 'DM Sans', sans-serif; pointer-events: none; z-index: 1; }
        .sf-prefix-wrap .sf-input { padding-left: 30px; }
        .sf-amount-hint { font-size: 11px; color: #b0a090; margin-top: -2px; }
        .sf-radio-group { display: flex; gap: 10px; }
        .sf-radio-opt { flex: 1; position: relative; cursor: pointer; }
        .sf-radio-opt input[type="radio"] { display: none; }
        .sf-radio-face { display: flex; flex-direction: column; align-items: center; gap: 5px; padding: 12px 8px; border-radius: 12px; border: 1.5px solid #e0d4c0; background: #faf6ee; font-size: 12px; font-weight: 500; color: #9a8775; transition: all 0.18s; text-align: center; user-select: none; }
        .sf-radio-face .opt-icon { font-size: 18px; line-height: 1; }
        .sf-radio-opt input:checked + .sf-radio-face { border-color: #c97844; background: #fff9f2; color: #a05e2a; }
        .sf-radio-opt:hover .sf-radio-face { border-color: #d4a070; color: #7a6050; }
        .sf-section-label { font-family: 'Lora', serif; font-size: 13px; font-style: italic; color: #b08a5e; margin: 4px 0 16px; display: flex; align-items: center; gap: 8px; }
        .sf-section-label::before, .sf-section-label::after { content: ''; flex: 1; height: 1px; background: #e8dece; }
        .sf-actions { display: flex; gap: 12px; justify-content: flex-end; margin-top: 26px; padding-top: 20px; border-top: 1px solid #e8dece; }
        .sf-btn-cancel { padding: 11px 22px; border-radius: 12px; border: 1.5px solid #ddd0be; background: transparent; font-family: 'DM Sans', sans-serif; font-size: 13px; font-weight: 500; color: #9a8775; cursor: pointer; transition: all 0.15s; }
        .sf-btn-cancel:hover { background: #f0ebe1; color: #5a4a38; border-color: #c8baa8; }
        .sf-btn-submit { padding: 11px 26px; border-radius: 12px; border: none; background: #c97844; font-family: 'DM Sans', sans-serif; font-size: 13px; font-weight: 500; color: #fff; cursor: pointer; transition: background 0.15s, transform 0.1s; display: flex; align-items: center; gap: 8px; letter-spacing: 0.3px; }
        .sf-btn-submit:hover:not(:disabled) { background: #b5672f; transform: translateY(-1px); }
        .sf-btn-submit:active:not(:disabled) { transform: translateY(0); }
        .sf-btn-submit:disabled { opacity: 0.55; cursor: not-allowed; transform: none; }
        .sf-toast { position: fixed; bottom: 28px; right: 28px; padding: 12px 18px; border-radius: 12px; font-family: 'DM Sans', sans-serif; font-size: 13px; font-weight: 500; display: flex; align-items: center; gap: 8px; z-index: 9999; animation: slideUp 0.22s ease; }
        .sf-toast.success { background: #f0f8ee; color: #3a6e28; border: 1.5px solid #a6d490; }
        .sf-toast.error { background: #fff2ee; color: #a03820; border: 1.5px solid #f0b090; }
        @keyframes slideUp { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        @media (max-width: 520px) { .sf-row { grid-template-columns: 1fr; } .sf-card { padding: 24px 18px; } .sf-radio-group { flex-direction: column; } }
      `}</style>

      <div className="sf-page">
        <div className="sf-card">
          <div className="sf-eyebrow">Sales Entry</div>
          <div className="sf-heading">Record a New Sale</div>
          <div className="sf-sub">Fill in the details below to log this transaction</div>
          <div className="sf-divider-top" />

          <div className="sf-row">
            <div className="sf-field">
              <label className="sf-label">Customer Name <span className="sf-required">*</span></label>
              <input className="sf-input" name="name" placeholder="Full name" value={form.name} onChange={handleChange} />
            </div>
            <div className="sf-field">
              <label className="sf-label">Contact Number <span className="sf-required">*</span></label>
              <input className="sf-input" name="contactNumber" placeholder="10-digit number" value={form.contactNumber} onChange={handleChange} />
            </div>
          </div>

          <div className="sf-row">
            <div className="sf-field">
              <label className="sf-label">Amount <span className="sf-required">*</span></label>
              <div className="sf-prefix-wrap">
                <span className="sf-prefix">₹</span>
                <input className="sf-input" name="amount" type="number" placeholder="0.00" value={form.amount} onChange={handleChange} />
              </div>
              <span className="sf-amount-hint">Enter total transaction value</span>
            </div>
            <div className="sf-field">
              <label className="sf-label">Bill Number <span className="sf-required">*</span></label>
              <input className="sf-input" name="billNumber" placeholder="e.g. BILL-001" value={form.billNumber} onChange={handleChange} />
            </div>
          </div>

          <div className="sf-field" style={{ marginBottom: '20px' }}>
            <label className="sf-label" style={{ marginBottom: '10px' }}>Payment Method <span className="sf-required">*</span></label>
            <div className="sf-radio-group">
              {[{ value: 'cash', label: 'Cash', icon: '💵' }, { value: 'upi', label: 'UPI', icon: '📱' }, { value: 'card', label: 'Card', icon: '💳' }].map((opt) => (
                <label key={opt.value} className="sf-radio-opt">
                  <input type="radio" name="source" value={opt.value} checked={form.source === opt.value} onChange={handleChange} />
                  <div className="sf-radio-face"><span className="opt-icon">{opt.icon}</span>{opt.label}</div>
                </label>
              ))}
            </div>
          </div>

          <div className="sf-section-label">Additional Notes</div>

          <div className="sf-field">
            <label className="sf-label">Comment</label>
            <textarea className="sf-textarea" name="comment" placeholder="Any remarks or notes about this sale..." value={form.comment} onChange={handleChange} />
          </div>

          <div className="sf-actions">
            <button className="sf-btn-cancel" onClick={() => navigate('/salestable')}>Cancel</button>
            <button className="sf-btn-submit" onClick={handleSubmit} disabled={loading}>
              {loading ? (
                <><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>Saving...</>
              ) : (
                <><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>Save Sale</>
              )}
            </button>
          </div>
        </div>
      </div>

      {toast && <div className={`sf-toast ${toast.type}`}>{toast.type === 'success' ? '✓' : '✕'} {toast.msg}</div>}
    </>
  )
}

export default Salesform
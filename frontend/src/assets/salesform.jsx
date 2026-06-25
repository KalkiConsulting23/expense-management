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
const API_BASE = import.meta.env.VITE_API_BASE;


const Salesform = () => {
  const navigate = useNavigate()
  const [form, setForm] = useState(defaultForm)
  const [loading, setLoading] = useState(false)
  const [toast, setToast] = useState(null)
  const [success, setSuccess] = useState(false)

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
      const res = await fetch(`${API_BASE}/sales`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, amount: Number(form.amount) }),
    });
      if (!res.ok) throw new Error('Failed')

      // SMART CACHE INVALIDATION: Wipe sales cache footprint array values safely
      sessionStorage.removeItem(SALES_CACHE_KEY);

      setForm(defaultForm)
      setSuccess(true)
      setTimeout(() => {
        setSuccess(false)
        navigate('/salestable')
      }, 2800)
    } catch (err) {
      showToast('error', 'Something went wrong.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
        *, *::before, *::after { box-sizing: border-box; }
        .sf-page { min-height: 100vh; background: #f7f7f8; display: flex; align-items: flex-start; justify-content: center; padding: 32px 16px 60px; font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif; }
        .sf-card { width: 100%; max-width: 560px; background: #ffffff; border: 1px solid #ececec; border-radius: 16px; padding: 32px 36px; box-shadow: 0 1px 3px rgba(16,24,40,0.04); }
        .sf-eyebrow { font-family: inherit; font-size: 11px; font-weight: 500; letter-spacing: 0.4px; text-transform: uppercase; color: #9ca3af; margin-bottom: 6px; }
        .sf-heading { font-size: 26px; font-weight: 600; color: #18181b; margin: 0 0 4px; line-height: 1.2; letter-spacing: -0.4px; }
        .sf-sub { font-size: 13.5px; color: #6b7280; margin-bottom: 24px; }
        .sf-divider-top { height: 1px; background: #f1f1f1; margin-bottom: 24px; }
        .sf-row { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 16px; }
        .sf-field { display: flex; flex-direction: column; gap: 7px; margin-bottom: 16px; }
        .sf-field:last-child { margin-bottom: 0; }
        .sf-label { font-size: 12px; font-weight: 500; color: #4b5563; letter-spacing: 0.2px; }
        .sf-required { color: #dc2626; margin-left: 2px; }
        .sf-input, .sf-textarea { background: #fafafa; border: 1px solid #ececec; border-radius: 10px; padding: 11px 14px; font-family: inherit; font-size: 14px; color: #18181b; outline: none; transition: border-color 0.18s, background 0.18s, box-shadow 0.18s; width: 100%; }
        .sf-input::placeholder, .sf-textarea::placeholder { color: #b0b0b5; }
        .sf-input:focus, .sf-textarea:focus { border-color: #18181b; background: #fff; box-shadow: 0 0 0 3px rgba(24,24,27,0.06); }
        .sf-input:hover:not(:focus), .sf-textarea:hover:not(:focus) { border-color: #d1d5db; }
        .sf-textarea { resize: vertical; min-height: 88px; }
        .sf-prefix-wrap { position: relative; display: flex; align-items: center; }
        .sf-prefix { position: absolute; left: 14px; font-size: 14px; color: #9ca3af; font-family: inherit; pointer-events: none; z-index: 1; }
        .sf-prefix-wrap .sf-input { padding-left: 28px; }
        .sf-amount-hint { font-size: 11.5px; color: #9ca3af; margin-top: -2px; }
        .sf-radio-group { display: flex; gap: 10px; }
        .sf-radio-opt { flex: 1; position: relative; cursor: pointer; }
        .sf-radio-opt input[type="radio"] { display: none; }
        .sf-radio-face { display: flex; flex-direction: column; align-items: center; gap: 5px; padding: 13px 8px; border-radius: 10px; border: 1px solid #ececec; background: #fafafa; font-size: 12px; font-weight: 500; color: #6b7280; transition: all 0.18s; text-align: center; user-select: none; }
        .sf-radio-face .opt-icon { font-size: 18px; line-height: 1; }
        .sf-radio-opt input:checked + .sf-radio-face { border-color: #18181b; background: #f3f4f6; color: #18181b; }
        .sf-radio-opt:hover .sf-radio-face { border-color: #d1d5db; color: #4b5563; }
        .sf-radio-opt:active .sf-radio-face { transform: scale(0.97); }
        .sf-section-label { font-size: 12px; font-weight: 600; color: #6b7280; margin: 4px 0 16px; display: flex; align-items: center; gap: 10px; }
        .sf-section-label::after { content: ''; flex: 1; height: 1px; background: #f1f1f1; }
        .sf-actions { display: flex; gap: 12px; justify-content: flex-end; margin-top: 24px; padding-top: 20px; border-top: 1px solid #f1f1f1; }
        .sf-btn-cancel { padding: 11px 22px; border-radius: 10px; border: 1px solid #ececec; background: #fff; font-family: inherit; font-size: 13px; font-weight: 500; color: #4b5563; cursor: pointer; transition: all 0.15s; }
        .sf-btn-cancel:hover { background: #f7f7f8; color: #18181b; border-color: #d1d5db; }
        .sf-btn-submit { padding: 11px 24px; border-radius: 10px; border: none; background: #18181b; font-family: inherit; font-size: 13px; font-weight: 500; color: #fff; cursor: pointer; transition: background 0.15s, transform 0.1s; display: flex; align-items: center; gap: 8px; }
        .sf-btn-submit:hover:not(:disabled) { background: #000; transform: translateY(-1px); }
        .sf-btn-submit:active:not(:disabled) { transform: translateY(0); }
        .sf-btn-submit:disabled { opacity: 0.55; cursor: not-allowed; transform: none; }

        /* Error toast (bottom-right) */
        .sf-toast { position: fixed; bottom: 28px; right: 28px; padding: 13px 18px; border-radius: 12px; font-family: inherit; font-size: 13px; font-weight: 500; display: flex; align-items: center; gap: 10px; z-index: 9999; box-shadow: 0 8px 28px rgba(16,24,40,0.16); animation: toastIn 0.28s cubic-bezier(0.18,0.89,0.32,1.28); max-width: 340px; }
        .sf-toast.error { background: #ffffff; color: #dc2626; border: 1px solid #fecaca; }
        .sf-toast-ic { width: 22px; height: 22px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 700; color: #fff; flex-shrink: 0; background: #ef4444; }
        @keyframes toastIn { from { opacity: 0; transform: translateY(16px) scale(0.96); } to { opacity: 1; transform: translateY(0) scale(1); } }

        /* Full-screen success overlay */
        .sf-overlay {
          position: fixed; inset: 0; z-index: 10000;
          display: flex; align-items: center; justify-content: center;
          background: rgba(247,247,248,0.72);
          backdrop-filter: blur(10px) saturate(1.1);
          -webkit-backdrop-filter: blur(10px) saturate(1.1);
          animation: ovFade 0.4s ease forwards;
          font-family: 'Inter', sans-serif;
        }
        @keyframes ovFade { from { opacity: 0; } to { opacity: 1; } }

        .sf-ov-panel {
          position: relative;
          width: 100%; max-width: 380px; margin: 0 20px;
          background: rgba(255,255,255,0.85);
          border: 1px solid rgba(255,255,255,0.9);
          border-radius: 24px;
          padding: 40px 36px 32px;
          text-align: center;
          box-shadow: 0 24px 80px rgba(16,24,40,0.18), 0 2px 8px rgba(16,24,40,0.06);
          animation: panelIn 0.5s cubic-bezier(0.18,0.89,0.32,1.28) forwards;
          overflow: hidden;
        }
        @keyframes panelIn { from { opacity: 0; transform: translateY(18px) scale(0.95); } to { opacity: 1; transform: translateY(0) scale(1); } }

        .sf-ov-glow {
          position: absolute; top: -40px; left: 50%; transform: translateX(-50%);
          width: 260px; height: 260px; border-radius: 50%;
          background: radial-gradient(circle, rgba(34,197,94,0.16) 0%, rgba(34,197,94,0) 70%);
          pointer-events: none;
        }

        .sf-ov-check { position: relative; width: 76px; height: 76px; margin: 0 auto 22px; }
        .sf-ov-check > svg { width: 100%; height: 100%; transform: rotate(-90deg); }
        .sf-ov-ring {
          fill: none; stroke: #22c55e; stroke-width: 4; stroke-linecap: round;
          stroke-dasharray: 226; stroke-dashoffset: 226;
          animation: ringDraw 0.7s ease forwards 0.15s;
        }
        @keyframes ringDraw { to { stroke-dashoffset: 0; } }
        .sf-ov-disc {
          position: absolute; inset: 12px; border-radius: 50%;
          background: linear-gradient(135deg, #22c55e, #16a34a);
          display: flex; align-items: center; justify-content: center;
          transform: scale(0); animation: discPop 0.45s cubic-bezier(0.18,0.89,0.32,1.28) forwards 0.45s;
          box-shadow: 0 6px 18px rgba(34,197,94,0.35);
        }
        @keyframes discPop { from { transform: scale(0); } 60% { transform: scale(1.12); } to { transform: scale(1); } }
        .sf-ov-tick { width: 30px; height: 30px; transform: none !important; }
        .sf-ov-tick path {
          fill: none; stroke: #fff; stroke-width: 3; stroke-linecap: round; stroke-linejoin: round;
          stroke-dasharray: 40; stroke-dashoffset: 40;
          animation: tickDraw 0.4s ease forwards 0.7s;
        }
        @keyframes tickDraw { to { stroke-dashoffset: 0; } }

        .sf-ov-title {
          font-size: 21px; font-weight: 600; color: #18181b; letter-spacing: -0.3px;
          margin-bottom: 7px; opacity: 0; animation: fadeUp 0.45s ease forwards 0.7s;
        }
        .sf-ov-sub {
          font-size: 13.5px; color: #6b7280; line-height: 1.5;
          opacity: 0; animation: fadeUp 0.45s ease forwards 0.82s;
        }
        @keyframes fadeUp { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }

        .sf-ov-progress {
          margin-top: 24px; height: 4px; width: 100%;
          background: #eef0f2; border-radius: 99px; overflow: hidden;
          opacity: 0; animation: fadeUp 0.4s ease forwards 0.95s;
        }
        .sf-ov-bar {
          height: 100%; width: 100%;
          background: linear-gradient(90deg, #22c55e, #16a34a);
          border-radius: 99px;
          transform-origin: left;
          transform: scaleX(0);
          animation: barFill 1.8s linear forwards 1s;
        }
        @keyframes barFill { from { transform: scaleX(0); } to { transform: scaleX(1); } }

        .sf-ov-foot {
          margin-top: 12px; font-size: 11.5px; color: #9ca3af;
          display: flex; align-items: center; justify-content: center; gap: 6px;
          opacity: 0; animation: fadeUp 0.4s ease forwards 1s;
        }
        .sf-ov-dot { width: 5px; height: 5px; border-radius: 50%; background: #22c55e; animation: pulse 1s ease-in-out infinite; }
        @keyframes pulse { 0%,100% { opacity: 0.3; } 50% { opacity: 1; } }

        @keyframes spin { to { transform: rotate(360deg); } }
        @media (max-width: 520px) { .sf-row { grid-template-columns: 1fr; } .sf-card { padding: 24px 18px; } .sf-radio-group { flex-direction: column; } .sf-toast { left: 16px; right: 16px; bottom: 16px; max-width: none; } }
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
                <><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" style={{ animation: 'spin 0.7s linear infinite' }}><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>Saving...</>
              ) : (
                <><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>Save Sale</>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Error toast (bottom-right) */}
      {toast && toast.type === 'error' && (
        <div className={`sf-toast ${toast.type}`}>
          <span className="sf-toast-ic">!</span>
          {toast.msg}
        </div>
      )}

      {/* Full-screen success overlay */}
      {success && (
        <div className="sf-overlay">
          <div className="sf-ov-panel">
            <div className="sf-ov-glow" />
            <div className="sf-ov-check">
              <svg viewBox="0 0 80 80">
                <circle className="sf-ov-ring" cx="40" cy="40" r="36" />
              </svg>
              <div className="sf-ov-disc">
                <svg className="sf-ov-tick" viewBox="0 0 24 24">
                  <path d="M5 12.5l4.5 4.5L19 7.5" />
                </svg>
              </div>
            </div>
            <div className="sf-ov-title">Sale recorded</div>
            <div className="sf-ov-sub">Your transaction has been saved successfully.</div>
            <div className="sf-ov-progress"><div className="sf-ov-bar" /></div>
            <div className="sf-ov-foot">
              <span className="sf-ov-dot" /> Redirecting to sales&hellip;
            </div>
          </div>
        </div>
      )}
    </>
  )
}

export default Salesform
import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:5000/api'

const todayISO = () => {
  const d = new Date()
  const off = d.getTimezoneOffset()
  const local = new Date(d.getTime() - off * 60000)
  return local.toISOString().slice(0, 10)
}

const Lendingform = () => {
  const navigate = useNavigate()
  const [form, setForm] = useState({
    name: '',
    amount: '',
    date: todayISO(),
  })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  const handleChange = (e) => {
    const { name, value } = e.target
    setForm(prev => ({ ...prev, [name]: value }))
  }

  const handleSubmit = async () => {
    setError('')
    if (!form.name.trim()) return setError('Name is required')
    if (form.amount === '' || Number(form.amount) < 0) return setError('Enter a valid amount')
    if (!form.date) return setError('Date is required')

    setSubmitting(true)
    try {
      const res = await fetch(`${API_BASE}/lending`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name.trim(),
          amount: Number(form.amount),
          date: form.date,
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Failed to save lending record')
      }
      setSuccess(true)
      setTimeout(() => {
        setSuccess(false)
        navigate('/lending')
      }, 2800)
    } catch (err) {
      setError(err.message)
      setSubmitting(false)
    }
  }

  return (
    <div className="lf-page">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
        .lf-page {
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
          max-width: 560px; margin: 0 auto; padding: 24px 20px 60px;
        }
        .lf-title { font-size: 22px; font-weight: 700; color: #18181b; letter-spacing: -0.4px; margin-bottom: 4px; }
        .lf-sub { font-size: 13px; color: #6b7280; margin-bottom: 22px; }
        .lf-card {
          background: #fff; border: 1px solid #ececec; border-radius: 14px;
          padding: 22px; box-shadow: 0 1px 3px rgba(16,24,40,0.04);
        }
        .lf-field { margin-bottom: 16px; }
        .lf-label { display: block; font-size: 12.5px; font-weight: 600; color: #374151; margin-bottom: 6px; }
        .lf-input {
          width: 100%; padding: 10px 12px; border: 1px solid #e5e7eb; border-radius: 9px;
          font-family: inherit; font-size: 14px; color: #18181b; background: #fff;
          transition: border 0.15s, box-shadow 0.15s; outline: none;
        }
        .lf-input:focus { border-color: #18181b; box-shadow: 0 0 0 3px rgba(24,24,27,0.06); }
        .lf-err {
          background: #fff5f5; border: 1px solid #fca5a5; color: #dc2626;
          padding: 9px 12px; border-radius: 9px; font-size: 13px; margin-bottom: 16px;
        }
        .lf-actions { display: flex; gap: 10px; margin-top: 22px; }
        .lf-btn {
          flex: 1; padding: 11px; border-radius: 9px; font-family: inherit;
          font-size: 14px; font-weight: 600; cursor: pointer; transition: all 0.15s;
        }
        .lf-save { border: none; background: #18181b; color: #fff; }
        .lf-save:hover { background: #000; }
        .lf-save:disabled { opacity: 0.6; cursor: not-allowed; }
        .lf-cancel { border: 1px solid #e5e7eb; background: #fff; color: #4b5563; }
        .lf-cancel:hover { background: #f7f7f7; color: #18181b; }

        /* Full-screen success overlay */
        .lf-overlay {
          position: fixed; inset: 0; z-index: 10000;
          display: flex; align-items: center; justify-content: center;
          background: rgba(247,247,248,0.72);
          backdrop-filter: blur(10px) saturate(1.1);
          -webkit-backdrop-filter: blur(10px) saturate(1.1);
          animation: lfovFade 0.4s ease forwards;
          font-family: 'Inter', sans-serif;
        }
        @keyframes lfovFade { from { opacity: 0; } to { opacity: 1; } }
        .lf-ov-panel {
          position: relative;
          width: 100%; max-width: 380px; margin: 0 20px;
          background: rgba(255,255,255,0.85);
          border: 1px solid rgba(255,255,255,0.9);
          border-radius: 24px;
          padding: 40px 36px 32px;
          text-align: center;
          box-shadow: 0 24px 80px rgba(16,24,40,0.18), 0 2px 8px rgba(16,24,40,0.06);
          animation: lfpanelIn 0.5s cubic-bezier(0.18,0.89,0.32,1.28) forwards;
          overflow: hidden;
        }
        @keyframes lfpanelIn { from { opacity: 0; transform: translateY(18px) scale(0.95); } to { opacity: 1; transform: translateY(0) scale(1); } }
        .lf-ov-glow {
          position: absolute; top: -40px; left: 50%; transform: translateX(-50%);
          width: 260px; height: 260px; border-radius: 50%;
          background: radial-gradient(circle, rgba(34,197,94,0.16) 0%, rgba(34,197,94,0) 70%);
          pointer-events: none;
        }
        .lf-ov-check { position: relative; width: 76px; height: 76px; margin: 0 auto 22px; }
        .lf-ov-check > svg { width: 100%; height: 100%; transform: rotate(-90deg); }
        .lf-ov-ring {
          fill: none; stroke: #22c55e; stroke-width: 4; stroke-linecap: round;
          stroke-dasharray: 226; stroke-dashoffset: 226;
          animation: lfringDraw 0.7s ease forwards 0.15s;
        }
        @keyframes lfringDraw { to { stroke-dashoffset: 0; } }
        .lf-ov-disc {
          position: absolute; inset: 12px; border-radius: 50%;
          background: linear-gradient(135deg, #22c55e, #16a34a);
          display: flex; align-items: center; justify-content: center;
          transform: scale(0); animation: lfdiscPop 0.45s cubic-bezier(0.18,0.89,0.32,1.28) forwards 0.45s;
          box-shadow: 0 6px 18px rgba(34,197,94,0.35);
        }
        @keyframes lfdiscPop { from { transform: scale(0); } 60% { transform: scale(1.12); } to { transform: scale(1); } }
        .lf-ov-tick { width: 30px; height: 30px; transform: none !important; }
        .lf-ov-tick path {
          fill: none; stroke: #fff; stroke-width: 3; stroke-linecap: round; stroke-linejoin: round;
          stroke-dasharray: 40; stroke-dashoffset: 40;
          animation: lftickDraw 0.4s ease forwards 0.7s;
        }
        @keyframes lftickDraw { to { stroke-dashoffset: 0; } }
        .lf-ov-title {
          font-size: 21px; font-weight: 600; color: #18181b; letter-spacing: -0.3px;
          margin-bottom: 7px; opacity: 0; animation: lffadeUp 0.45s ease forwards 0.7s;
        }
        .lf-ov-sub {
          font-size: 13.5px; color: #6b7280; line-height: 1.5;
          opacity: 0; animation: lffadeUp 0.45s ease forwards 0.82s;
        }
        @keyframes lffadeUp { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        .lf-ov-progress {
          margin-top: 24px; height: 4px; width: 100%;
          background: #eef0f2; border-radius: 99px; overflow: hidden;
          opacity: 0; animation: lffadeUp 0.4s ease forwards 0.95s;
        }
        .lf-ov-bar {
          height: 100%; width: 100%;
          background: linear-gradient(90deg, #22c55e, #16a34a);
          border-radius: 99px;
          transform-origin: left;
          transform: scaleX(0);
          animation: lfbarFill 1.8s linear forwards 1s;
        }
        @keyframes lfbarFill { from { transform: scaleX(0); } to { transform: scaleX(1); } }
        .lf-ov-foot {
          margin-top: 12px; font-size: 11.5px; color: #9ca3af;
          display: flex; align-items: center; justify-content: center; gap: 6px;
          opacity: 0; animation: lffadeUp 0.4s ease forwards 1s;
        }
        .lf-ov-dot { width: 5px; height: 5px; border-radius: 50%; background: #22c55e; animation: lfpulse 1s ease-in-out infinite; }
        @keyframes lfpulse { 0%,100% { opacity: 0.3; } 50% { opacity: 1; } }
      `}</style>

      <div className="lf-title">Add Lending</div>
      <div className="lf-sub">Record money you have lent out.</div>

      <div className="lf-card">
        {error && <div className="lf-err">{error}</div>}

        <div className="lf-field">
          <label className="lf-label">Name</label>
          <input
            className="lf-input" type="text" name="name"
            value={form.name} onChange={handleChange}
            placeholder="e.g. Rahul"
          />
        </div>

        <div className="lf-field">
          <label className="lf-label">Amount (₹)</label>
          <input
            className="lf-input" type="number" name="amount" min="0" step="any"
            value={form.amount} onChange={handleChange}
            placeholder="e.g. 10000"
          />
        </div>

        <div className="lf-field">
          <label className="lf-label">Date</label>
          <input
            className="lf-input" type="date" name="date"
            value={form.date} onChange={handleChange}
          />
        </div>

        <div className="lf-actions">
          <button className="lf-btn lf-cancel" onClick={() => navigate('/lending')} disabled={submitting}>
            Cancel
          </button>
          <button className="lf-btn lf-save" onClick={handleSubmit} disabled={submitting}>
            {submitting ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>

      {/* Full-screen success overlay */}
      {success && (
        <div className="lf-overlay">
          <div className="lf-ov-panel">
            <div className="lf-ov-glow" />
            <div className="lf-ov-check">
              <svg viewBox="0 0 80 80">
                <circle className="lf-ov-ring" cx="40" cy="40" r="36" />
              </svg>
              <div className="lf-ov-disc">
                <svg className="lf-ov-tick" viewBox="0 0 24 24">
                  <path d="M5 12.5l4.5 4.5L19 7.5" />
                </svg>
              </div>
            </div>
            <div className="lf-ov-title">Lending recorded</div>
            <div className="lf-ov-sub">Your lending record has been saved successfully.</div>
            <div className="lf-ov-progress"><div className="lf-ov-bar" /></div>
            <div className="lf-ov-foot">
              <span className="lf-ov-dot" /> Redirecting to lending&hellip;
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default Lendingform
import React, { useEffect, useState, useCallback, useMemo, memo } from 'react'
import { useNavigate } from 'react-router-dom'

const SALES_CACHE_KEY = 'local_sales_data_cache';

const SOURCE_CONFIG = {
  cash: { label: 'Cash', bg: '#fdf3e7', color: '#a05e2a', border: '#f0c490', icon: '💵' },
  upi:  { label: 'UPI',  bg: '#eef4fd', color: '#2a5ea0', border: '#a8c4f0', icon: '📱' },
  card: { label: 'Card', bg: '#f3eefb', color: '#6a3aa0', border: '#c4aaf0', icon: '💳' },
}

// ─── Memoized Table Row ───────────────────────────────────────────────────────
const SaleRow = memo(({ sale, index, deletingId, onDelete }) => {
  const src  = SOURCE_CONFIG[sale.source] || SOURCE_CONFIG.cash
  const date = useMemo(() =>
    new Date(sale.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }),
    [sale.createdAt]
  )
  const amount = useMemo(() =>
    '₹' + Number(sale.amount).toLocaleString('en-IN'),
    [sale.amount]
  )

  return (
    <tr>
      <td className="st-num">{index + 1}</td>
      <td className="st-name">{sale.name}</td>
      <td className="st-contact">{sale.contactNumber}</td>
      <td className="st-amount">{amount}</td>
      <td>
        <span className="st-source-badge" style={{ background: src.bg, color: src.color, borderColor: src.border }}>
          {src.icon} {src.label}
        </span>
      </td>
      <td className="st-bill">{sale.billNumber}</td>
      <td><div className="st-comment" title={sale.comment}>{sale.comment || '—'}</div></td>
      <td className="st-date">{date}</td>
      <td>
        <button
          className="st-btn-delete"
          title="Delete"
          disabled={deletingId === sale._id}
          onClick={() => onDelete(sale._id)}
        >
          {deletingId === sale._id
            ? <div className="st-mini-spinner" />
            : <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                <path d="M10 11v6M14 11v6M9 6V4h6v2" />
              </svg>
          }
        </button>
      </td>
    </tr>
  )
})

// ─── Memoized Stats Bar ───────────────────────────────────────────────────────
const StatsBar = memo(({ sales }) => {
  const totalAmount = useMemo(() => sales.reduce((s, x) => s + (x.amount || 0), 0), [sales])
  const methodCounts = useMemo(() => ({
    cash: sales.filter(s => s.source === 'cash').length,
    upi:  sales.filter(s => s.source === 'upi').length,
    card: sales.filter(s => s.source === 'card').length,
  }), [sales])

  return (
    <div className="st-stats">
      <div className="st-stat-card">
        <div className="st-stat-label">Total Sales</div>
        <div className="st-stat-value">{sales.length}<small>records</small></div>
      </div>
      <div className="st-stat-card">
        <div className="st-stat-label">Total Revenue</div>
        <div className="st-stat-value">₹{totalAmount.toLocaleString('en-IN')}</div>
      </div>
      <div className="st-stat-card">
        <div className="st-stat-label">Payment Methods</div>
        <div className="st-stat-methods">
          {['cash', 'upi', 'card'].map(src => {
            const cfg = SOURCE_CONFIG[src]
            return (
              <span key={src} className="st-method-chip"
                style={{ background: cfg.bg, color: cfg.color, borderColor: cfg.border }}>
                {cfg.icon} {cfg.label} · {methodCounts[src]}
              </span>
            )
          })}
        </div>
      </div>
    </div>
  )
})

// ─── Main Component ───────────────────────────────────────────────────────────
const Salestable = () => {
  const navigate = useNavigate()
  
  const [sales, setSales] = useState(() => {
    const cached = sessionStorage.getItem(SALES_CACHE_KEY);
    return cached ? JSON.parse(cached) : [];
  })
  
  const [loading, setLoading]       = useState(() => !sessionStorage.getItem(SALES_CACHE_KEY))
  const [deletingId, setDeletingId] = useState(null)
  const [toast, setToast]           = useState(null)

  const showToast = useCallback((type, msg) => {
    setToast({ type, msg })
    setTimeout(() => setToast(null), 3000)
  }, [])

  useEffect(() => {
    const load = async () => {
      const cachedData = sessionStorage.getItem(SALES_CACHE_KEY)
      if (cachedData) {
        setSales(JSON.parse(cachedData))
        setLoading(false)
      }

      try {
        // Swapped custom API hook utility out for standard native JavaScript fetch calls
        const res  = await fetch('https://expense-management-11.onrender.com/api/sales')
        const data = await res.json()
        
        sessionStorage.setItem(SALES_CACHE_KEY, JSON.stringify(data))
        setSales(data)
      } catch (err) {
        if (!cachedData) showToast('error', 'Failed to load sales.')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [showToast])

  const handleDelete = useCallback(async (id) => {
    if (!window.confirm('Delete this sale record?')) return

    setSales(prev => {
      const updatedSales = prev.filter(s => s._id !== id);
      sessionStorage.setItem(SALES_CACHE_KEY, JSON.stringify(updatedSales));
      return updatedSales;
    })
    setDeletingId(id)

    try {
      await fetch(`https://expense-management-11.onrender.com/api/sales/${id}`, { method: 'DELETE' })
      showToast('success', 'Sale deleted successfully.')
    } catch (err) {
      showToast('error', 'Failed to delete sale.')
      try {
        const res  = await fetch('https://expense-management-11.onrender.com/api/sales')
        const data = await res.json()
        sessionStorage.setItem(SALES_CACHE_KEY, JSON.stringify(data))
        setSales(data)
      } catch (_) {}
    } finally {
      setDeletingId(null)
    }
  }, [showToast])

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Lora:ital,wght@0,400;0,600;1,400&family=DM+Sans:wght@300;400;500&display=swap');
        *, *::before, *::after { box-sizing: border-box; }
        .st-page { min-height: 100vh; background: #f5f0e8; padding: 40px 28px 60px; font-family: 'DM Sans', sans-serif; }
        .st-topbar { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 28px; flex-wrap: wrap; gap: 14px; }
        .st-eyebrow { font-size: 10px; font-weight: 500; letter-spacing: 2px; text-transform: uppercase; color: #b08a5e; margin-bottom: 5px; }
        .st-heading { font-family: 'Lora', serif; font-size: 26px; font-weight: 600; color: #2e2318; margin: 0 0 3px; line-height: 1.2; }
        .st-sub { font-size: 13px; color: #9a8775; }
        .st-add-btn { display: flex; align-items: center; gap: 7px; padding: 10px 20px; border-radius: 12px; border: none; background: #c97844; font-family: 'DM Sans', sans-serif; font-size: 13px; font-weight: 500; color: #fff; cursor: pointer; transition: background 0.15s, transform 0.1s; flex-shrink: 0; margin-top: 4px; }
        .st-add-btn:hover { background: #b5672f; transform: translateY(-1px); }
        .st-add-btn:active { transform: translateY(0); }
        .st-stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; margin-bottom: 28px; }
        .st-stat-card { background: #fffdf8; border: 1.5px solid #e8dece; border-radius: 16px; padding: 18px 20px; box-shadow: 0 2px 0 #e2d9c8; }
        .st-stat-label { font-size: 10px; font-weight: 500; letter-spacing: 1.5px; text-transform: uppercase; color: #b08a5e; margin-bottom: 8px; }
        .st-stat-value { font-family: 'Lora', serif; font-size: 22px; font-weight: 600; color: #2e2318; }
        .st-stat-value small { font-family: 'DM Sans', sans-serif; font-size: 12px; font-weight: 400; color: #9a8775; margin-left: 4px; }
        .st-stat-methods { display: flex; gap: 10px; margin-top: 4px; flex-wrap: wrap; }
        .st-method-chip { font-size: 11px; font-weight: 500; padding: 3px 9px; border-radius: 20px; border: 1.5px solid; }
        .st-table-wrap { background: #fffdf8; border: 1.5px solid #e8dece; border-radius: 20px; overflow: hidden; box-shadow: 0 2px 0 #e2d9c8, 0 8px 32px rgba(160,130,90,0.08); }
        .st-table-header { padding: 18px 24px 16px; border-bottom: 1px solid #e8dece; display: flex; align-items: center; gap: 8px; }
        .st-table-title { font-family: 'Lora', serif; font-size: 14px; font-style: italic; color: #b08a5e; }
        .st-divider-line { flex: 1; height: 1px; background: #e8dece; }
        .st-table { width: 100%; border-collapse: collapse; }
        .st-table thead tr { background: #faf6ee; border-bottom: 1px solid #e8dece; }
        .st-table th { padding: 11px 16px; text-align: left; font-size: 10px; font-weight: 500; color: #b08a5e; text-transform: uppercase; letter-spacing: 1px; white-space: nowrap; }
        .st-table tbody tr { border-bottom: 1px solid #f0ebe0; transition: background 0.12s; }
        .st-table tbody tr:last-child { border-bottom: none; }
        .st-table tbody tr:hover { background: #fdf8f0; }
        .st-table td { padding: 13px 16px; font-size: 13px; color: #7a6a58; white-space: nowrap; }
        .st-num { color: #c5b49e; font-size: 11px; }
        .st-name { font-weight: 500; color: #2e2318; font-size: 14px; }
        .st-contact { font-family: monospace; font-size: 12px; color: #9a8775; }
        .st-amount { font-family: 'Lora', serif; font-weight: 600; color: #b5672f; font-size: 15px; }
        .st-bill { font-size: 11px; color: #b08a5e; font-family: monospace; }
        .st-source-badge { display: inline-flex; align-items: center; gap: 5px; padding: 4px 10px; border-radius: 20px; font-size: 11px; font-weight: 500; border: 1.5px solid; }
        .st-comment { max-width: 160px; overflow: hidden; text-overflow: ellipsis; color: #b0a090; font-style: italic; font-size: 12px; }
        .st-date { font-size: 11px; color: #b0a090; }
        .st-btn-delete { display: flex; align-items: center; justify-content: center; width: 30px; height: 30px; border-radius: 8px; border: 1.5px solid #e0d4c0; background: transparent; color: #c5b49e; cursor: pointer; transition: all 0.15s; }
        .st-btn-delete:hover { background: #fff0ea; border-color: #c97844; color: #c97844; }
        .st-btn-delete:disabled { opacity: 0.4; cursor: not-allowed; }
        .st-mini-spinner { width: 12px; height: 12px; border: 2px solid #e8dece; border-top-color: #c97844; border-radius: 50%; animation: spin 0.7s linear infinite; }
        .st-empty { padding: 60px 20px; text-align: center; color: #b0a090; font-size: 14px; }
        .st-empty-icon { font-size: 36px; margin-bottom: 12px; }
        .st-spinner { width: 28px; height: 28px; border: 2.5px solid #e8dece; border-top-color: #c97844; border-radius: 50%; animation: spin 0.7s linear infinite; margin: 0 auto 12px; }
        @keyframes spin { to { transform: rotate(360deg); } }
        .st-toast { position: fixed; bottom: 28px; right: 28px; padding: 12px 18px; border-radius: 12px; font-family: 'DM Sans', sans-serif; font-size: 13px; font-weight: 500; display: flex; align-items: center; gap: 8px; z-index: 9999; animation: slideUp 0.22s ease; }
        .st-toast.success { background: #f0f8ee; color: #3a6e28; border: 1.5px solid #a6d490; }
        .st-toast.error { background: #fff2ee; color: #a03820; border: 1.5px solid #f0b090; }
        @keyframes slideUp { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        @media (max-width: 768px) { .st-page { padding: 24px 14px 40px; } .st-stats { grid-template-columns: 1fr 1fr; } .st-table-wrap { overflow-x: auto; } }
        @media (max-width: 480px) { .st-stats { grid-template-columns: 1fr; } }
      `}</style>

      <div className="st-page">
        <div className="st-topbar">
          <div>
            <div className="st-eyebrow">Sales Records</div>
            <div className="st-heading">All Transactions</div>
            <div className="st-sub">Browse and manage every recorded sale</div>
          </div>
          <button className="st-add-btn" onClick={() => navigate('/salesform')}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Add Sale
          </button>
        </div>

        <StatsBar sales={sales} />

        <div className="st-table-wrap">
          <div className="st-table-header">
            <div className="st-divider-line" />
            <div className="st-table-title">Transaction Log</div>
            <div className="st-divider-line" />
          </div>

          {loading ? (
            <div className="st-empty"><div className="st-spinner" />Loading sales...</div>
          ) : sales.length === 0 ? (
            <div className="st-empty"><div className="st-empty-icon">📋</div>No sales recorded yet.</div>
          ) : (
            <table className="st-table">
              <thead>
                <tr>
                  <th>#</th><th>Name</th><th>Contact</th><th>Amount</th>
                  <th>Method</th><th>Bill No.</th><th>Comment</th><th>Date</th><th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {sales.map((sale, index) => (
                  <SaleRow
                    key={sale._id}
                    sale={sale}
                    index={index}
                    deletingId={deletingId}
                    onDelete={handleDelete}
                  />
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {toast && (
        <div className={`st-toast ${toast.type}`}>
          {toast.type === 'success' ? '✓' : '✕'} {toast.msg}
        </div>
      )}
    </>
  )
}

export default Salestable
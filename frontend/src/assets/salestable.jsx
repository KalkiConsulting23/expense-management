import React, { useEffect, useState, useCallback, useMemo, memo } from 'react'
import { useNavigate } from 'react-router-dom'

const SALES_CACHE_KEY = 'local_sales_data_cache';
const API_BASE = import.meta.env.VITE_API_BASE;


const SOURCE_CONFIG = {
  cash: { label: 'Cash', bg: '#f0fdf4', color: '#16834a', border: '#bbf7d0', icon: '💵' },
  upi:  { label: 'UPI',  bg: '#eff6ff', color: '#1d4ed8', border: '#bfdbfe', icon: '📱' },
  card: { label: 'Card', bg: '#faf5ff', color: '#7c3aed', border: '#e9d5ff', icon: '💳' },
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
        const res  = await fetch(`${API_BASE}/sales`)
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
      await fetch(`${API_BASE}/sales/${id}`, { method: 'DELETE' })
      showToast('success', 'Sale deleted successfully.')
    } catch (err) {
      showToast('error', 'Failed to delete sale.')
      try {
        const res  = await fetch(`${API_BASE}/sales`)
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
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
        *, *::before, *::after { box-sizing: border-box; }
        .st-page { min-height: 100vh; background: #f7f7f8; padding: 32px 32px 60px; font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif; }
        .st-topbar { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 28px; flex-wrap: wrap; gap: 14px; }
        .st-eyebrow { font-size: 11px; font-weight: 500; letter-spacing: 0.4px; text-transform: uppercase; color: #9ca3af; margin-bottom: 6px; }
        .st-heading { font-size: 26px; font-weight: 600; color: #18181b; margin: 0 0 4px; line-height: 1.2; letter-spacing: -0.4px; }
        .st-sub { font-size: 13.5px; color: #6b7280; }
        .st-add-btn { display: flex; align-items: center; gap: 7px; padding: 10px 18px; border-radius: 10px; border: none; background: #18181b; font-family: inherit; font-size: 13px; font-weight: 500; color: #fff; cursor: pointer; transition: background 0.15s, transform 0.1s; flex-shrink: 0; margin-top: 4px; }
        .st-add-btn:hover { background: #000; transform: translateY(-1px); }
        .st-add-btn:active { transform: translateY(0); }
        .st-stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 28px; }
        .st-stat-card { background: #ffffff; border: 1px solid #ececec; border-radius: 14px; padding: 18px 20px; box-shadow: 0 1px 2px rgba(16,24,40,0.03); }
        .st-stat-label { font-size: 11px; font-weight: 500; letter-spacing: 0.2px; color: #9ca3af; margin-bottom: 8px; }
        .st-stat-value { font-size: 24px; font-weight: 600; color: #18181b; letter-spacing: -0.5px; }
        .st-stat-value small { font-size: 12px; font-weight: 400; color: #9ca3af; margin-left: 5px; }
        .st-stat-methods { display: flex; gap: 8px; margin-top: 6px; flex-wrap: wrap; }
        .st-method-chip { font-size: 11px; font-weight: 500; padding: 4px 10px; border-radius: 20px; border: 1px solid; }
        .st-table-wrap { background: #ffffff; border: 1px solid #ececec; border-radius: 16px; overflow: hidden; box-shadow: 0 1px 3px rgba(16,24,40,0.04); }
        .st-table-header { padding: 16px 24px; border-bottom: 1px solid #f1f1f1; display: flex; align-items: center; gap: 10px; }
        .st-table-title { font-size: 13px; font-weight: 600; color: #6b7280; white-space: nowrap; }
        .st-divider-line { display: none; }
        .st-table { width: 100%; border-collapse: collapse; }
        .st-table thead tr { background: #fafafa; border-bottom: 1px solid #f1f1f1; }
        .st-table th { padding: 12px 16px; text-align: left; font-size: 11px; font-weight: 500; color: #9ca3af; letter-spacing: 0.3px; white-space: nowrap; }
        .st-table tbody tr { border-bottom: 1px solid #f4f4f5; transition: background 0.12s; }
        .st-table tbody tr:last-child { border-bottom: none; }
        .st-table tbody tr:hover { background: #fafafa; }
        .st-table td { padding: 14px 16px; font-size: 13.5px; color: #4b5563; white-space: nowrap; }
        .st-num { color: #c5c5c9; font-size: 12px; }
        .st-name { font-weight: 500; color: #18181b; font-size: 14px; }
        .st-contact { font-variant-numeric: tabular-nums; font-size: 13px; color: #6b7280; }
        .st-amount { font-weight: 600; color: #18181b; font-size: 14px; font-variant-numeric: tabular-nums; }
        .st-bill { font-size: 12px; color: #9ca3af; font-variant-numeric: tabular-nums; }
        .st-source-badge { display: inline-flex; align-items: center; gap: 5px; padding: 4px 10px; border-radius: 20px; font-size: 11px; font-weight: 500; border: 1px solid; }
        .st-comment { max-width: 160px; overflow: hidden; text-overflow: ellipsis; color: #9ca3af; font-size: 12.5px; }
        .st-date { font-size: 12px; color: #9ca3af; }
        .st-btn-delete { display: flex; align-items: center; justify-content: center; width: 30px; height: 30px; border-radius: 8px; border: 1px solid #ececec; background: transparent; color: #9ca3af; cursor: pointer; transition: all 0.15s; }
        .st-btn-delete:hover { background: #fef2f2; border-color: #fca5a5; color: #dc2626; }
        .st-btn-delete:disabled { opacity: 0.4; cursor: not-allowed; }
        .st-mini-spinner { width: 12px; height: 12px; border: 2px solid #ececec; border-top-color: #18181b; border-radius: 50%; animation: spin 0.7s linear infinite; }
        .st-empty { padding: 60px 20px; text-align: center; color: #9ca3af; font-size: 14px; }
        .st-empty-icon { font-size: 36px; margin-bottom: 12px; }
        .st-spinner { width: 28px; height: 28px; border: 2.5px solid #ececec; border-top-color: #18181b; border-radius: 50%; animation: spin 0.7s linear infinite; margin: 0 auto 12px; }
        @keyframes spin { to { transform: rotate(360deg); } }
        .st-toast { position: fixed; bottom: 28px; right: 28px; padding: 12px 18px; border-radius: 10px; font-family: inherit; font-size: 13px; font-weight: 500; display: flex; align-items: center; gap: 8px; z-index: 9999; box-shadow: 0 8px 24px rgba(16,24,40,0.12); animation: slideUp 0.22s ease; }
        .st-toast.success { background: #f0fdf4; color: #16834a; border: 1px solid #bbf7d0; }
        .st-toast.error { background: #fef2f2; color: #dc2626; border: 1px solid #fecaca; }
        @keyframes slideUp { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        @media (max-width: 768px) { .st-page { padding: 20px 14px 40px; } .st-stats { grid-template-columns: 1fr 1fr; } .st-table-wrap { overflow-x: auto; } }
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
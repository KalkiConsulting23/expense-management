import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:5000/api'

const DETAIL_FIELDS = [
  ['fatherName', "Father's Name"],
  ['dateOfBirth', 'Date of Birth'],
  ['gender', 'Gender'],
  ['maritalStatus', 'Marital Status'],
  ['age', 'Age'],
  ['aadhaar', 'Aadhaar'],
  ['pan', 'PAN'],
  ['permanentAddress', 'Permanent Address'],
  ['reportingManager', 'Reporting Manager'],
  ['dateOfExit', 'Date of Exit'],
  ['sourceOfHire', 'Source of Hire'],
  ['currentExperience', 'Current Experience (yrs)'],
  ['totalExperience', 'Total Experience (yrs)'],
  ['personalMobileNumber', 'Personal Mobile Number'],
  ['personalEmailAddress', 'Personal Email Address'],
  ['paymentMode', 'Payment Mode'],
  ['bankHolderName', 'Bank Holder Name'],
  ['bankName', 'Bank Name'],
  ['accountNumber', 'Account Number'],
  ['ifscCode', 'IFSC Code'],
  ['bankAccountType', 'Bank Account Type'],
]

const DATE_FIELDS = new Set(['dateOfBirth', 'dateOfExit'])

const Staff = () => {
  const navigate = useNavigate()
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [expandedId, setExpandedId] = useState(null)

  const fetchRecords = async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`${API_BASE}/staff/all`)
      if (!res.ok) throw new Error('Failed to fetch staff records')
      const data = await res.json()
      setRecords(Array.isArray(data) ? data : [])
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchRecords()
  }, [])

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this staff record?')) return
    const prev = records
    setRecords(records.filter(r => r._id !== id))
    if (expandedId === id) setExpandedId(null)
    try {
      const res = await fetch(`${API_BASE}/staff/delete/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Delete failed')
    } catch (err) {
      setRecords(prev)
      alert(err.message)
    }
  }

  const formatDate = (d) => {
    if (!d) return '—'
    return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
  }

  const formatValue = (key, value) => {
    if (value === undefined || value === null || value === '') return '—'
    if (DATE_FIELDS.has(key)) return formatDate(value)
    return value
  }

  return (
    <div className="stf-page">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
        .stf-page {
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
          max-width: 1100px; margin: 0 auto; padding: 24px 20px 60px;
        }
        .stf-head {
          display: flex; align-items: flex-start; justify-content: space-between;
          gap: 12px; margin-bottom: 20px; flex-wrap: wrap;
        }
        .stf-title { font-size: 22px; font-weight: 700; color: #18181b; letter-spacing: -0.4px; }
        .stf-count { font-size: 12.5px; color: #6b7280; margin-top: 4px; }
        .stf-add-btn {
          display: inline-flex; align-items: center; gap: 7px;
          padding: 9px 16px; border-radius: 9px; border: none;
          background: #18181b; color: #fff; font-family: inherit;
          font-size: 13.5px; font-weight: 600; cursor: pointer; transition: background 0.15s;
        }
        .stf-add-btn:hover { background: #000; }
        .stf-card {
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
        tr.stf-row:hover td { background: #fbfbfb; cursor: pointer; }
        .stf-name { font-weight: 600; color: #18181b; }
        .stf-sub { display: block; font-size: 11.5px; color: #9ca3af; font-weight: 400; margin-top: 2px; }
        .stf-pill {
          display: inline-block; font-size: 10.5px; font-weight: 600; padding: 2px 8px;
          border-radius: 20px;
        }
        .stf-pill.active { background: #dcfce7; color: #16a34a; }
        .stf-pill.inactive { background: #fee2e2; color: #dc2626; }
        .stf-pill.default { background: #f3f4f6; color: #6b7280; }
        .stf-del-btn {
          border: 1px solid #f1d5d5; background: #fff5f5; color: #dc2626;
          border-radius: 7px; padding: 5px 10px; font-size: 12px; font-weight: 500;
          cursor: pointer; font-family: inherit; transition: all 0.13s;
        }
        .stf-del-btn:hover { background: #fee2e2; border-color: #fca5a5; }
        .stf-empty, .stf-state { text-align: center; padding: 48px 20px; color: #9ca3af; font-size: 14px; }
        .stf-err { color: #dc2626; }

        .stf-detail-row td {
          background: #fafafa; padding: 18px 24px;
        }
        .stf-detail-grid {
          display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px 24px;
        }
        .stf-detail-item { display: flex; flex-direction: column; }
        .stf-detail-label {
          font-size: 10.5px; font-weight: 600; text-transform: uppercase;
          letter-spacing: 0.3px; color: #9ca3af; margin-bottom: 3px;
        }
        .stf-detail-value { font-size: 13px; color: #18181b; font-weight: 500; word-break: break-word; }
        @media (max-width: 720px) { .stf-detail-grid { grid-template-columns: 1fr 1fr; } }
      `}</style>

      <div className="stf-head">
        <div>
          <div className="stf-title">Staff</div>
          <div className="stf-count">{records.length} staff member{records.length !== 1 ? 's' : ''}</div>
        </div>
        <button className="stf-add-btn" onClick={() => navigate('/staffform')}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          Add Staff
        </button>
      </div>

      <div className="stf-card">
        {loading ? (
          <div className="stf-state">Loading…</div>
        ) : error ? (
          <div className="stf-state stf-err">{error}</div>
        ) : records.length === 0 ? (
          <div className="stf-empty">No staff added yet. Click "Add Staff" to create one.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Employee ID</th>
                <th>Name</th>
                <th>Department</th>
                <th>Designation</th>
                <th>Work Email / Phone</th>
                <th>Date of Joining</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {records.map((r) => {
                const isOpen = expandedId === r._id
                const pillClass =
                  r.employeeStatus === 'Active' ? 'active' :
                  r.employeeStatus === 'Inactive' ? 'inactive' : 'default'
                return (
                  <React.Fragment key={r._id}>
                    <tr className="stf-row" onClick={() => setExpandedId(isOpen ? null : r._id)}>
                      <td>{r.employeeId}</td>
                      <td className="stf-name">{r.firstName} {r.lastName}</td>
                      <td>{r.department || '—'}</td>
                      <td>{r.designation || '—'}</td>
                      <td>
                        {r.email || '—'}
                        {r.workPhoneNumber && <span className="stf-sub">{r.workPhoneNumber}</span>}
                      </td>
                      <td>{formatDate(r.dateOfJoining)}</td>
                      <td>
                        {r.employeeStatus
                          ? <span className={`stf-pill ${pillClass}`}>{r.employeeStatus}</span>
                          : '—'}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <button
                          className="stf-del-btn"
                          onClick={(e) => { e.stopPropagation(); handleDelete(r._id) }}
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                    {isOpen && (
                      <tr className="stf-detail-row">
                        <td colSpan={8}>
                          <div className="stf-detail-grid">
                            {DETAIL_FIELDS.map(([key, label]) => (
                              <div className="stf-detail-item" key={key}>
                                <span className="stf-detail-label">{label}</span>
                                <span className="stf-detail-value">{formatValue(key, r[key])}</span>
                              </div>
                            ))}
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

export default Staff

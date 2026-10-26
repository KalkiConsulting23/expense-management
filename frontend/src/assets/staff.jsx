import React, { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:5000/api'

const DETAIL_FIELDS = [
  ['fatherName', "Father's Name"],
  ['dateOfBirth', 'Date of Birth'],
  ['gender', 'Gender'],
  ['maritalStatus', 'Marital Status'],
  ['age', 'Age'],
  ['salary', 'Salary'],
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

// ─── Edit form layout ───
// type: text | email | tel | date | number | textarea | choice (text box with suggestions)
const EDIT_SECTIONS = [
  {
    title: 'Work Details',
    fields: [
      { key: 'firstName', label: 'First Name', required: true },
      { key: 'lastName', label: 'Last Name' },
      { key: 'department', label: 'Department', type: 'choice' },
      { key: 'designation', label: 'Designation', type: 'choice' },
      { key: 'email', label: 'Work Email', type: 'email' },
      { key: 'workPhoneNumber', label: 'Work Phone Number', type: 'tel' },
      { key: 'dateOfJoining', label: 'Date of Joining', type: 'date' },
      { key: 'reportingManager', label: 'Reporting Manager', type: 'choice' },
      { key: 'employeeStatus', label: 'Employee Status', type: 'choice' },
      { key: 'employmentType', label: 'Employment Type', type: 'choice' },
      { key: 'sourceOfHire', label: 'Source of Hire', type: 'choice' },
      { key: 'dateOfExit', label: 'Date of Exit', type: 'date' },
    ],
  },
  {
    title: 'Personal Details',
    fields: [
      { key: 'fatherName', label: "Father's Name" },
      { key: 'dateOfBirth', label: 'Date of Birth', type: 'date' },
      { key: 'gender', label: 'Gender', type: 'choice' },
      { key: 'maritalStatus', label: 'Marital Status', type: 'choice' },
      { key: 'personalMobileNumber', label: 'Personal Mobile Number', type: 'tel' },
      { key: 'personalEmailAddress', label: 'Personal Email Address', type: 'email' },
      { key: 'aadhaar', label: 'Aadhaar' },
      { key: 'pan', label: 'PAN', upper: true },
      { key: 'permanentAddress', label: 'Permanent Address', type: 'textarea', wide: true },
    ],
  },
  {
    title: 'Salary & Experience',
    fields: [
      { key: 'salary', label: 'Salary (₹)', type: 'number' },
      { key: 'currentExperience', label: 'Current Experience (yrs)', type: 'number' },
      { key: 'totalExperience', label: 'Total Experience (yrs)', type: 'number' },
    ],
  },
  {
    title: 'Bank Details',
    fields: [
      { key: 'paymentMode', label: 'Payment Mode', type: 'choice' },
      { key: 'bankHolderName', label: 'Bank Holder Name' },
      { key: 'bankName', label: 'Bank Name', type: 'choice' },
      { key: 'accountNumber', label: 'Account Number' },
      { key: 'ifscCode', label: 'IFSC Code', upper: true },
      { key: 'bankAccountType', label: 'Bank Account Type', type: 'choice' },
    ],
  },
]

const EDIT_FIELDS = EDIT_SECTIONS.flatMap(s => s.fields)

// Starting suggestions for the "choice" boxes. Values already used on your
// staff list are added automatically, and you can still type anything else.
const DEFAULT_CHOICES = {
  employeeStatus: ['Active', 'Inactive'],
  employmentType: ['Full-time', 'Part-time', 'Contract', 'Intern'],
  gender: ['Male', 'Female', 'Other'],
  maritalStatus: ['Single', 'Married', 'Divorced', 'Widowed'],
  paymentMode: ['Bank Transfer', 'Cash', 'Cheque', 'UPI'],
  bankAccountType: ['Savings', 'Current'],
  sourceOfHire: ['Referral', 'Job Portal', 'LinkedIn', 'Direct', 'Campus'],
}

// Compute whole-year age from a date-of-birth so the shown value never goes stale.
const calcAge = (dob) => {
  if (!dob) return ''
  const b = new Date(dob)
  if (isNaN(b)) return ''
  const now = new Date()
  let age = now.getFullYear() - b.getFullYear()
  const m = now.getMonth() - b.getMonth()
  if (m < 0 || (m === 0 && now.getDate() < b.getDate())) age--
  return age >= 0 ? age : ''
}

// Saved date → "YYYY-MM-DD" for a date input
const toInputDate = (d) => {
  if (!d) return ''
  const s = String(d)
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  const dt = new Date(d)
  return isNaN(dt) ? '' : dt.toISOString().slice(0, 10)
}

// Staff record → form values (every value as a string)
const recordToForm = (r) => {
  const form = {}
  EDIT_FIELDS.forEach(({ key, type }) => {
    const v = r[key]
    if (type === 'date') form[key] = toInputDate(v)
    else form[key] = v === undefined || v === null ? '' : String(v)
  })
  return form
}

const Staff = () => {
  const navigate = useNavigate()
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [expandedId, setExpandedId] = useState(null)

  // Edit popup state
  const [editing, setEditing] = useState(null)   // the record being edited
  const [form, setForm] = useState({})
  const [initialForm, setInitialForm] = useState({})
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [toast, setToast] = useState('')

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

  // ─── Edit ───
  const openEdit = (record) => {
    const f = recordToForm(record)
    setEditing(record)
    setForm(f)
    setInitialForm(f)
    setSaveError('')
  }

  // Fields whose value is different from when the popup opened
  const changedKeys = useMemo(
    () => EDIT_FIELDS.map(f => f.key).filter(k => (form[k] ?? '') !== (initialForm[k] ?? '')),
    [form, initialForm]
  )
  const isDirty = changedKeys.length > 0

  const closeEdit = (force = false) => {
    if (saving) return
    if (!force && isDirty && !window.confirm('Discard your changes?')) return
    setEditing(null)
    setSaveError('')
  }

  // Close on Esc and stop the page behind from scrolling while the popup is open
  useEffect(() => {
    if (!editing) return
    const onKey = (e) => { if (e.key === 'Escape') closeEdit() }
    document.addEventListener('keydown', onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
    }
  })

  const setField = (key, value, upper) => {
    setForm(f => ({ ...f, [key]: upper ? value.toUpperCase() : value }))
  }

  // Suggestions for each "choice" box: defaults + values already on your staff list
  const choiceOptions = useMemo(() => {
    const out = {}
    EDIT_FIELDS.filter(f => f.type === 'choice').forEach(({ key }) => {
      const set = new Set(DEFAULT_CHOICES[key] || [])
      records.forEach(r => {
        const v = r[key]
        if (v !== undefined && v !== null && String(v).trim() !== '') set.add(String(v).trim())
      })
      out[key] = [...set]
    })
    return out
  }, [records])

  const handleSave = async (e) => {
    e.preventDefault()
    if (!editing) return
    if (!isDirty) { closeEdit(true); return }
    if (!String(form.firstName || '').trim()) {
      setSaveError('First name is required.')
      return
    }

    // Send only what changed
    const payload = {}
    changedKeys.forEach(k => {
      const field = EDIT_FIELDS.find(f => f.key === k)
      const v = typeof form[k] === 'string' ? form[k].trim() : form[k]
      if (field.type === 'number') payload[k] = v === '' ? '' : Number(v)
      else payload[k] = v
    })
    // Keep the saved age in step with a changed date of birth
    if ('dateOfBirth' in payload) payload.age = calcAge(payload.dateOfBirth)

    setSaving(true)
    setSaveError('')
    try {
      const res = await fetch(`${API_BASE}/staff/update/${editing._id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.message || 'Failed to update staff')
      const updated = data.staff || { ...editing, ...payload }
      setRecords(rs => rs.map(r => (r._id === editing._id ? updated : r)))
      setEditing(null)
      setToast(`${updated.firstName || 'Staff'} ${updated.lastName || ''}`.trim() + ' updated')
      setTimeout(() => setToast(''), 2500)
    } catch (err) {
      setSaveError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const formatDate = (d) => {
    if (!d) return '—'
    return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
  }

  const formatValue = (key, value, record) => {
    // Age is always derived live from DOB, so it stays correct after birthdays.
    if (key === 'age') {
      const a = calcAge(record.dateOfBirth)
      return a === '' ? '—' : a
    }
    if (key === 'salary') {
      if (value === undefined || value === null || value === '') return '—'
      return '₹' + Number(value).toLocaleString('en-IN')
    }
    if (value === undefined || value === null || value === '') return '—'
    if (DATE_FIELDS.has(key)) return formatDate(value)
    return value
  }

  const renderInput = (field) => {
    const { key, label, type = 'text', required, upper } = field
    const id = `stf-edit-${key}`
    const common = {
      id,
      name: key,
      value: form[key] ?? '',
      onChange: (e) => setField(key, e.target.value, upper),
      className: 'stf-input' + (changedKeys.includes(key) ? ' changed' : ''),
      disabled: saving,
    }
    let input
    if (type === 'textarea') {
      input = <textarea {...common} rows={2} />
    } else if (type === 'choice') {
      input = (
        <>
          <input {...common} type="text" list={`${id}-list`} autoComplete="off" />
          <datalist id={`${id}-list`}>
            {(choiceOptions[key] || []).map(opt => <option key={opt} value={opt} />)}
          </datalist>
        </>
      )
    } else {
      input = (
        <input
          {...common}
          type={type}
          required={required}
          min={type === 'number' ? 0 : undefined}
          step={type === 'number' ? 'any' : undefined}
        />
      )
    }
    return (
      <div className={'stf-field' + (field.wide ? ' wide' : '')} key={key}>
        <label htmlFor={id}>
          {label}{required && <span className="stf-req"> *</span>}
        </label>
        {input}
        {type === 'date' && form[key] && (
          <button type="button" className="stf-clear" onClick={() => setField(key, '')} disabled={saving}>
            Clear
          </button>
        )}
      </div>
    )
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
        .stf-table-wrap { overflow-x: auto; }
        .stf-card table { width: 100%; border-collapse: collapse; }
        .stf-card th {
          text-align: left; font-size: 11px; font-weight: 600; color: #9ca3af;
          text-transform: uppercase; letter-spacing: 0.4px;
          padding: 12px 16px; border-bottom: 1px solid #f1f1f1; background: #fafafa;
        }
        .stf-card td { padding: 13px 16px; font-size: 13.5px; color: #374151; border-bottom: 1px solid #f5f5f5; }
        .stf-card tr:last-child td { border-bottom: none; }
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
        .stf-actions { display: inline-flex; gap: 6px; justify-content: flex-end; }
        .stf-edit-btn {
          border: 1px solid #e5e7eb; background: #fff; color: #374151;
          border-radius: 7px; padding: 5px 10px; font-size: 12px; font-weight: 500;
          cursor: pointer; font-family: inherit; transition: all 0.13s;
        }
        .stf-edit-btn:hover { background: #f4f4f5; border-color: #d4d4d8; color: #18181b; }
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
        .stf-detail-foot { margin-top: 16px; }
        @media (max-width: 720px) { .stf-detail-grid { grid-template-columns: 1fr 1fr; } }

        /* ─── Edit popup ─── */
        .stf-overlay {
          position: fixed; inset: 0; background: rgba(15,23,42,0.45);
          display: flex; align-items: center; justify-content: center;
          padding: 32px 16px; z-index: 1000;
        }
        .stf-modal {
          background: #fff; border-radius: 14px; width: 100%; max-width: 820px;
          box-shadow: 0 20px 50px rgba(15,23,42,0.25); display: flex; flex-direction: column;
          max-height: calc(100vh - 64px); overflow: hidden;
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
        }
        .stf-modal-head {
          display: flex; align-items: flex-start; justify-content: space-between; gap: 12px;
          padding: 18px 22px; border-bottom: 1px solid #f1f1f1;
        }
        .stf-modal-title { font-size: 17px; font-weight: 700; color: #18181b; }
        .stf-modal-sub { font-size: 12.5px; color: #6b7280; margin-top: 3px; }
        .stf-x {
          border: none; background: transparent; font-size: 22px; line-height: 1;
          color: #9ca3af; cursor: pointer; padding: 2px 6px; border-radius: 6px;
        }
        .stf-x:hover { background: #f4f4f5; color: #18181b; }
        .stf-modal-head, .stf-modal-foot { flex-shrink: 0; }
        .stf-modal-body { padding: 6px 22px 18px; overflow-y: auto; flex: 1; min-height: 0; }
        .stf-section-title {
          font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px;
          color: #6b7280; margin: 18px 0 10px;
        }
        .stf-form-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px 16px; }
        .stf-field { display: flex; flex-direction: column; position: relative; min-width: 0; }
        .stf-field.wide { grid-column: 1 / -1; }
        .stf-field label { font-size: 12px; font-weight: 500; color: #4b5563; margin-bottom: 5px; }
        .stf-req { color: #dc2626; }
        .stf-input {
          font-family: inherit; font-size: 13.5px; color: #18181b;
          border: 1px solid #e5e7eb; border-radius: 8px; padding: 8px 10px;
          background: #fff; outline: none; transition: border-color 0.13s, box-shadow 0.13s;
          width: 100%; box-sizing: border-box;
        }
        textarea.stf-input { resize: vertical; min-height: 56px; }
        .stf-input:focus { border-color: #18181b; box-shadow: 0 0 0 3px rgba(24,24,27,0.08); }
        .stf-input.changed { border-color: #f59e0b; background: #fffbeb; }
        .stf-input:disabled { background: #f9fafb; color: #6b7280; }
        .stf-clear {
          position: absolute; top: 0; right: 0; border: none; background: none;
          font-size: 11px; color: #6b7280; cursor: pointer; padding: 0; font-family: inherit;
        }
        .stf-clear:hover { color: #dc2626; text-decoration: underline; }
        .stf-save-err {
          margin: 14px 0 0; padding: 10px 12px; border-radius: 8px;
          background: #fef2f2; color: #b91c1c; font-size: 13px; border: 1px solid #fecaca;
        }
        .stf-modal-foot {
          display: flex; align-items: center; justify-content: space-between; gap: 12px;
          padding: 14px 22px; border-top: 1px solid #f1f1f1; background: #fff;
        }
        .stf-changes { font-size: 12.5px; color: #6b7280; }
        .stf-changes b { color: #b45309; }
        .stf-foot-btns { display: flex; gap: 8px; }
        .stf-btn {
          font-family: inherit; font-size: 13.5px; font-weight: 600; border-radius: 9px;
          padding: 9px 16px; cursor: pointer; transition: background 0.13s;
        }
        .stf-btn.ghost { background: #fff; border: 1px solid #e5e7eb; color: #374151; }
        .stf-btn.ghost:hover { background: #f4f4f5; }
        .stf-btn.primary { background: #18181b; border: 1px solid #18181b; color: #fff; }
        .stf-btn.primary:hover { background: #000; }
        .stf-btn:disabled { opacity: 0.55; cursor: not-allowed; }
        .stf-toast {
          position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%);
          background: #18181b; color: #fff; font-size: 13px; font-weight: 500;
          padding: 10px 16px; border-radius: 9px; box-shadow: 0 8px 24px rgba(0,0,0,0.18);
          z-index: 1100;
        }
        @media (max-width: 720px) {
          .stf-form-grid { grid-template-columns: 1fr 1fr; }
          .stf-overlay { padding: 12px 10px; }
          .stf-modal { max-height: calc(100vh - 24px); }
        }
        @media (max-width: 480px) {
          .stf-form-grid { grid-template-columns: 1fr; }
          .stf-modal-foot { flex-direction: column; align-items: stretch; }
          .stf-foot-btns .stf-btn { flex: 1; }
        }
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
          <div className="stf-table-wrap">
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
                          <div className="stf-actions">
                            <button
                              className="stf-edit-btn"
                              onClick={(e) => { e.stopPropagation(); openEdit(r) }}
                            >
                              Edit
                            </button>
                            <button
                              className="stf-del-btn"
                              onClick={(e) => { e.stopPropagation(); handleDelete(r._id) }}
                            >
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                      {isOpen && (
                        <tr className="stf-detail-row">
                          <td colSpan={8}>
                            <div className="stf-detail-grid">
                              {DETAIL_FIELDS.map(([key, label]) => (
                                <div className="stf-detail-item" key={key}>
                                  <span className="stf-detail-label">{label}</span>
                                  <span className="stf-detail-value">{formatValue(key, r[key], r)}</span>
                                </div>
                              ))}
                            </div>
                            <div className="stf-detail-foot">
                              <button className="stf-edit-btn" onClick={() => openEdit(r)}>
                                Edit these details
                              </button>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {editing && (
        <div className="stf-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) closeEdit() }}>
          <form className="stf-modal" onSubmit={handleSave} role="dialog" aria-modal="true" aria-labelledby="stf-edit-title">
            <div className="stf-modal-head">
              <div>
                <div className="stf-modal-title" id="stf-edit-title">Edit Staff</div>
                <div className="stf-modal-sub">
                  {editing.firstName} {editing.lastName} · Employee ID {editing.employeeId || '—'}
                </div>
              </div>
              <button type="button" className="stf-x" aria-label="Close" onClick={() => closeEdit()}>×</button>
            </div>

            <div className="stf-modal-body">
              {EDIT_SECTIONS.map(section => (
                <div key={section.title}>
                  <div className="stf-section-title">{section.title}</div>
                  <div className="stf-form-grid">
                    {section.fields.map(renderInput)}
                  </div>
                </div>
              ))}
              {saveError && <div className="stf-save-err">{saveError}</div>}
            </div>

            <div className="stf-modal-foot">
              <div className="stf-changes">
                {isDirty
                  ? <><b>{changedKeys.length}</b> field{changedKeys.length !== 1 ? 's' : ''} changed</>
                  : 'No changes yet'}
              </div>
              <div className="stf-foot-btns">
                <button type="button" className="stf-btn ghost" onClick={() => closeEdit()} disabled={saving}>
                  Cancel
                </button>
                <button type="submit" className="stf-btn primary" disabled={saving || !isDirty}>
                  {saving ? 'Saving…' : 'Save Changes'}
                </button>
              </div>
            </div>
          </form>
        </div>
      )}

      {toast && <div className="stf-toast">{toast}</div>}
    </div>
  )
}

export default Staff
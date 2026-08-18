import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:5000/api'

const REQUIRED_FIELDS = ['firstName', 'lastName']

const BLANK_FORM = {
  firstName: '',
  lastName: '',
  department: '',
  email: '',
  designation: '',
  workPhoneNumber: '',
  dateOfJoining: '',
  reportingManager: '',
  dateOfBirth: '',
  personalMobileNumber: '',
  personalEmailAddress: '',
  dateOfExit: '',
  gender: '',
  maritalStatus: '',
  sourceOfHire: '',
  employeeStatus: '',
  employmentType: '',
  age: '',
  salary: '',
  currentExperience: '',
  totalExperience: '',
  permanentAddress: '',
  aadhaar: '',
  pan: '',
  fatherName: '',
  paymentMode: '',
  bankHolderName: '',
  bankName: '',
  accountNumber: '',
  ifscCode: '',
  bankAccountType: '',
}

// Compute whole-year age from a YYYY-MM-DD date-of-birth string.
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

const Field = ({ label, name, type = 'text', options, value, error, onChange, readOnly, placeholder }) => (
  <div className="sf-field">
    <label className="sf-label">
      {label}
      {REQUIRED_FIELDS.includes(name) && <span className="sf-required"> *</span>}
    </label>
    {type === 'select' ? (
      <select
        className={`sf-input${error ? ' err' : ''}`}
        name={name}
        value={value}
        onChange={onChange}
      >
        <option value="">Select…</option>
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    ) : type === 'textarea' ? (
      <textarea
        className={`sf-input sf-textarea${error ? ' err' : ''}`}
        name={name}
        value={value}
        onChange={onChange}
        rows={3}
      />
    ) : (
      <input
        className={`sf-input${error ? ' err' : ''}${readOnly ? ' sf-readonly' : ''}`}
        type={type}
        name={name}
        value={value}
        onChange={onChange}
        readOnly={readOnly}
        placeholder={placeholder}
      />
    )}
    {error && <div className="sf-err">⚠ {error}</div>}
  </div>
)

const Staffform = () => {
  const navigate = useNavigate()
  const [form, setForm] = useState({ ...BLANK_FORM })
  const [errors, setErrors] = useState({})
  const [submitting, setSubmitting] = useState(false)
  const [toast, setToast] = useState(null)

  const showToast = (type, msg) => {
    setToast({ type, msg })
    setTimeout(() => setToast(null), 3000)
  }

  const handleChange = (e) => {
    const { name, value } = e.target
    if (name === 'dateOfBirth') {
      // Auto-fill age whenever DOB changes.
      setForm(prev => ({ ...prev, dateOfBirth: value, age: calcAge(value) }))
    } else {
      setForm(prev => ({ ...prev, [name]: value }))
    }
    if (errors[name]) setErrors(prev => ({ ...prev, [name]: undefined }))
  }

  const validate = () => {
    const e = {}
    if (!form.firstName.trim()) e.firstName = 'First name is required'
    if (!form.lastName.trim()) e.lastName = 'Last name is required'
    return e
  }

  const handleSubmit = async () => {
    const errs = validate()
    if (Object.keys(errs).length) {
      setErrors(errs)
      showToast('error', 'Please fix the highlighted fields.')
      return
    }

    const payload = { ...form }
    ;['age', 'salary', 'currentExperience', 'totalExperience'].forEach((f) => {
      payload[f] = payload[f] === '' ? undefined : Number(payload[f])
    })
    ;['dateOfJoining', 'dateOfBirth', 'dateOfExit'].forEach((f) => {
      if (payload[f] === '') payload[f] = undefined
    })

    setSubmitting(true)
    try {
      const res = await fetch(`${API_BASE}/staff/add`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.message || 'Failed to save staff record')
      }
      showToast('success', 'Staff added successfully.')
      setTimeout(() => navigate('/staff'), 1200)
    } catch (err) {
      showToast('error', err.message || 'Something went wrong.')
      setSubmitting(false)
    }
  }

  const field = (label, name, extra = {}) => (
    <Field
      label={label}
      name={name}
      value={form[name]}
      error={errors[name]}
      onChange={handleChange}
      {...extra}
    />
  )

  return (
    <div className="sf-page">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
        .sf-page {
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
          max-width: 780px; margin: 0 auto; padding: 24px 20px 60px;
        }
        .sf-title { font-size: 22px; font-weight: 700; color: #18181b; letter-spacing: -0.4px; margin-bottom: 4px; }
        .sf-sub { font-size: 13px; color: #6b7280; margin-bottom: 22px; }
        .sf-card {
          background: #fff; border: 1px solid #ececec; border-radius: 14px;
          padding: 24px; box-shadow: 0 1px 3px rgba(16,24,40,0.04); margin-bottom: 18px;
        }
        .sf-section-title {
          font-size: 13px; font-weight: 700; color: #18181b; margin-bottom: 16px;
          display: flex; align-items: center; gap: 10px;
        }
        .sf-section-title::after { content: ''; flex: 1; height: 1px; background: #f1f1f1; }
        .sf-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
        .sf-field { display: flex; flex-direction: column; }
        .sf-field.full { grid-column: 1 / -1; }
        .sf-label { font-size: 12.5px; font-weight: 600; color: #374151; margin-bottom: 6px; }
        .sf-required { color: #dc2626; }
        .sf-input {
          width: 100%; padding: 10px 12px; border: 1px solid #e5e7eb; border-radius: 9px;
          font-family: inherit; font-size: 13.5px; color: #18181b; background: #fff;
          transition: border 0.15s, box-shadow 0.15s; outline: none;
        }
        .sf-input:focus { border-color: #18181b; box-shadow: 0 0 0 3px rgba(24,24,27,0.06); }
        .sf-input.err { border-color: #dc2626; background: #fef2f2; }
        .sf-input.sf-readonly { background: #f7f7f8; color: #6b7280; cursor: default; }
        .sf-input.sf-readonly:focus { border-color: #e5e7eb; box-shadow: none; }
        .sf-textarea { resize: vertical; font-family: inherit; }
        .sf-err { font-size: 11.5px; color: #dc2626; font-weight: 500; margin-top: 5px; }
        .sf-hint { font-size: 11.5px; color: #9ca3af; font-weight: 500; margin-top: 5px; }

        .sf-actions { display: flex; gap: 10px; justify-content: flex-end; }
        .sf-btn {
          padding: 11px 22px; border-radius: 9px; font-family: inherit;
          font-size: 13.5px; font-weight: 600; cursor: pointer; transition: all 0.15s;
        }
        .sf-save { border: none; background: #18181b; color: #fff; }
        .sf-save:hover { background: #000; }
        .sf-save:disabled { opacity: 0.6; cursor: not-allowed; }
        .sf-cancel { border: 1px solid #e5e7eb; background: #fff; color: #4b5563; }
        .sf-cancel:hover { background: #f7f7f7; color: #18181b; }

        .sf-toast {
          position: fixed; bottom: 28px; right: 28px; padding: 13px 18px; border-radius: 12px;
          font-family: inherit; font-size: 13px; font-weight: 500; display: flex; align-items: center;
          gap: 10px; z-index: 9999; box-shadow: 0 8px 28px rgba(16,24,40,0.16); background: #fff;
          animation: sfToastIn 0.28s cubic-bezier(0.18,0.89,0.32,1.28); max-width: 340px;
        }
        .sf-toast.success { color: #16a34a; border: 1px solid #bbf7d0; }
        .sf-toast.error { color: #dc2626; border: 1px solid #fecaca; }
        .sf-toast-ic {
          width: 22px; height: 22px; border-radius: 50%; display: flex; align-items: center;
          justify-content: center; font-size: 12px; font-weight: 700; color: #fff; flex-shrink: 0;
        }
        .sf-toast-ic.success { background: #22c55e; }
        .sf-toast-ic.error { background: #ef4444; }
        @keyframes sfToastIn { from { opacity: 0; transform: translateY(16px) scale(0.96); } to { opacity: 1; transform: translateY(0) scale(1); } }
        @media (max-width: 640px) {
          .sf-grid { grid-template-columns: 1fr; }
          .sf-toast { left: 16px; right: 16px; bottom: 16px; max-width: none; }
        }
      `}</style>

      <div className="sf-title">Add Staff</div>
      <div className="sf-sub">Fill in the staff member's details below. An Employee ID is generated automatically on save.</div>

      <div className="sf-card">
        <div className="sf-section-title">Personal Details</div>
        <div className="sf-grid">
          {field('First Name', 'firstName')}
          {field('Last Name', 'lastName')}
          {field('Father Name', 'fatherName')}
          {field('Date of Birth', 'dateOfBirth', { type: 'date' })}
          {field('Gender', 'gender', { type: 'select', options: ['Male', 'Female', 'Other'] })}
          {field('Marital Status', 'maritalStatus', { type: 'select', options: ['Single', 'Married', 'Other'] })}
          {field('Age', 'age', { type: 'number', readOnly: true, placeholder: 'Auto from DOB' })}
          {field('Aadhaar', 'aadhaar')}
          {field('PAN', 'pan')}
          <div className="sf-field full">
            {field('Permanent Address', 'permanentAddress', { type: 'textarea' })}
          </div>
        </div>
      </div>

      <div className="sf-card">
        <div className="sf-section-title">Employment Details</div>
        <div className="sf-grid">
          {field('Department', 'department')}
          {field('Designation', 'designation')}
          {field('Salary (₹ / month)', 'salary', { type: 'number' })}
          {field('Reporting Manager', 'reportingManager')}
          {field('Date of Joining', 'dateOfJoining', { type: 'date' })}
          {field('Date of Exit', 'dateOfExit', { type: 'date' })}
          {field('Employee Status', 'employeeStatus', { type: 'select', options: ['Active', 'Inactive'] })}
          {field('Employment Type', 'employmentType', { type: 'select', options: ['Full-time', 'Part-time', 'Contract', 'Intern'] })}
          {field('Source of Hire', 'sourceOfHire')}
          {field('Current Experience (yrs)', 'currentExperience', { type: 'number' })}
          {field('Total Experience (yrs)', 'totalExperience', { type: 'number' })}
        </div>
      </div>

      <div className="sf-card">
        <div className="sf-section-title">Contact Details</div>
        <div className="sf-grid">
          {field('Work Email Address', 'email', { type: 'email' })}
          {field('Work Phone Number', 'workPhoneNumber', { type: 'tel' })}
          {field('Personal Mobile Number', 'personalMobileNumber', { type: 'tel' })}
          {field('Personal Email Address', 'personalEmailAddress', { type: 'email' })}
        </div>
      </div>

      <div className="sf-card">
        <div className="sf-section-title">Bank Details</div>
        <div className="sf-grid">
          {field('Payment Mode', 'paymentMode', { type: 'select', options: ['Bank Transfer', 'Cash', 'Cheque'] })}
          {field('Bank Account Type', 'bankAccountType', { type: 'select', options: ['Savings', 'Current'] })}
          {field('Bank Holder Name', 'bankHolderName')}
          {field('Bank Name', 'bankName')}
          {field('Account Number', 'accountNumber')}
          {field('IFSC Code', 'ifscCode')}
        </div>
      </div>

      <div className="sf-actions">
        <button className="sf-btn sf-cancel" onClick={() => navigate('/staff')} disabled={submitting}>
          Cancel
        </button>
        <button className="sf-btn sf-save" onClick={handleSubmit} disabled={submitting}>
          {submitting ? 'Saving…' : 'Save Staff'}
        </button>
      </div>

      {toast && (
        <div className={`sf-toast ${toast.type}`}>
          <span className={`sf-toast-ic ${toast.type}`}>{toast.type === 'success' ? '✓' : '!'}</span>
          {toast.msg}
        </div>
      )}
    </div>
  )
}

export default Staffform
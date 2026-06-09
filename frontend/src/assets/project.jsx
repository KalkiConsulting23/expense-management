import { useState } from "react";
import { useNavigate } from "react-router-dom";

const CURRENCIES = [
  { value: "INR", symbol: "₹", label: "INR (₹)" },
  { value: "USD", symbol: "$", label: "USD ($)" },
];

const USD_TO_INR = 83.5;
const PROJECT_CACHE_KEY = 'local_project_data_cache';

const typeConfig = {
  hourly:  { icon: "⏱", label: "Hourly" },
  daily:   { icon: "☀️", label: "Daily" },
  monthly: { icon: "📅", label: "Monthly" },
};

const AddProject = () => {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    projectName: "", projectType: "", currency: "INR",
    startDate: "", endDate: "", expectedAmount: "",
  });
  const [errors, setErrors]   = useState({});
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((p) => ({ ...p, [name]: value }));
    if (errors[name]) setErrors((p) => ({ ...p, [name]: undefined }));
  };

  const handleTypeChange = (type) => {
    setFormData((p) => ({ ...p, projectType: type, expectedAmount: "", currency: "INR" }));
    setErrors((p) => ({ ...p, projectType: undefined }));
  };

  const validate = () => {
    const e = {};
    if (!formData.projectName.trim()) e.projectName = "Project name is required";
    if (!formData.projectType)        e.projectType  = "Select a billing type";
    if (!formData.startDate)          e.startDate    = "Start date is required";
    if (!formData.endDate)            e.endDate      = "End date is required";
    if (formData.startDate && formData.endDate && formData.endDate < formData.startDate) {
      e.endDate = "End date must be after start date";
    }
    if (formData.projectType === "monthly") {
      if (!formData.expectedAmount || Number(formData.expectedAmount) <= 0) {
        e.expectedAmount = "Expected amount is required";
      }
    }
    return e;
  };

  const handleSubmit = async () => {
    const errs = validate();
    if (Object.keys(errs).length) { setErrors(errs); return; }

    let finalAmountINR = 0;
    if (formData.projectType === "monthly") {
      const raw = Number(formData.expectedAmount);
      finalAmountINR = formData.currency === "USD" ? raw * USD_TO_INR : raw;
    }

    const payload = {
      projectName:    formData.projectName.trim(),
      projectType:    formData.projectType,
      expectedAmount: finalAmountINR,
      currency:       formData.currency,
      startDate:      formData.startDate,
      endDate:        formData.endDate,
    };

    setLoading(true);
    try {
      // Replaced old custom apiFetch hook layer with clean native fetch code
      const res = await fetch("https://expense-management-7.onrender.com/api/project/add", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const errData = await res.json();
        alert(`Server error: ${errData.message || JSON.stringify(errData)}`);
        return;
      }
      await res.json();

      // SMART CACHE INVALIDATION
      sessionStorage.removeItem(PROJECT_CACHE_KEY);

      setSuccess(true);
      setFormData({ projectName: "", projectType: "", currency: "INR", startDate: "", endDate: "", expectedAmount: "" });
      setErrors({});
      setTimeout(() => {
        setSuccess(false);
        navigate("/projecttable");
      }, 3500);
    } catch (err) {
      alert("Network error — is the server running locally on Port 5000?");
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    setFormData({ projectName: "", projectType: "", currency: "INR", startDate: "", endDate: "", expectedAmount: "" });
    setErrors({});
    setSuccess(false);
    navigate("/projecttable");
  };

  const sym = formData.currency === "USD" ? "$" : "₹";

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Lora:ital,wght@0,400;0,600;1,400&family=DM+Sans:wght@300;400;500&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        input[type=number]::-webkit-inner-spin-button, input[type=number]::-webkit-outer-spin-button { -webkit-appearance: none; }
        input[type=number] { -moz-appearance: textfield; }
        .ap-page { min-height: 100vh; background: #f5f0e8; display: flex; align-items: flex-start; justify-content: center; padding: 40px 16px 60px; font-family: 'DM Sans', sans-serif; }
        .ap-card { width: 100%; max-width: 560px; background: #fffdf8; border: 1.5px solid #e8dece; border-radius: 20px; padding: 36px 36px 32px; box-shadow: 0 2px 0 #e2d9c8, 0 8px 32px rgba(160,130,90,0.08); }
        .ap-eyebrow { font-size: 10px; font-weight: 500; letter-spacing: 2px; text-transform: uppercase; color: #b08a5e; margin-bottom: 6px; }
        .ap-heading { font-family: 'Lora', serif; font-size: 26px; font-weight: 600; color: #2e2318; margin: 0 0 4px; line-height: 1.2; }
        .ap-sub { font-size: 13px; color: #9a8775; margin-bottom: 28px; }
        .ap-divider-top { height: 1px; background: linear-gradient(to right, #e8dece, transparent); margin-bottom: 28px; }
        .ap-label { font-size: 11px; font-weight: 500; color: #8c7a68; letter-spacing: 1px; text-transform: uppercase; margin-bottom: 7px; display: flex; align-items: center; gap: 3px; }
        .ap-required { color: #c97844; }
        .ap-input { width: 100%; padding: 11px 15px; border-radius: 12px; border: 1.5px solid #e0d4c0; background: #faf6ee; color: #2e2318; font-size: 14px; font-family: 'DM Sans', sans-serif; outline: none; transition: border-color 0.18s, background 0.18s; }
        .ap-input::placeholder { color: #c5b49e; }
        .ap-input:focus { border-color: #c97844; background: #fff; }
        .ap-input.err { border-color: #d97a5a; background: #fff8f4; }
        .ap-input.has-prefix { padding-left: 30px; }
        .ap-prefix-wrap { position: relative; display: flex; align-items: center; }
        .ap-prefix { position: absolute; left: 13px; font-size: 14px; color: #9a8775; pointer-events: none; z-index: 1; }
        .ap-date-row { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
        .ap-field { display: flex; flex-direction: column; }
        .ap-err { font-size: 11px; color: #c97844; font-weight: 500; margin-top: 5px; }
        .ap-type-group { display: flex; gap: 10px; flex-wrap: wrap; }
        .ap-type-btn { display: flex; align-items: center; gap: 6px; padding: 10px 16px; border-radius: 12px; border: 1.5px solid #e0d4c0; background: #faf6ee; color: #9a8775; font-size: 12px; font-weight: 500; cursor: pointer; font-family: 'DM Sans', sans-serif; transition: all 0.18s; user-select: none; }
        .ap-type-btn:hover { border-color: #d4a070; color: #7a6050; }
        .ap-type-btn.active { border-color: #c97844; background: #fff9f2; color: #a05e2a; }
        .ap-cur-group { display: flex; gap: 10px; }
        .ap-cur-btn { display: flex; align-items: center; gap: 5px; padding: 9px 16px; border-radius: 12px; border: 1.5px solid #e0d4c0; background: #faf6ee; color: #9a8775; font-size: 13px; cursor: pointer; font-family: 'DM Sans', sans-serif; transition: all 0.18s; }
        .ap-cur-btn:hover { border-color: #d4a070; color: #7a6050; }
        .ap-cur-btn.active { border-color: #c97844; background: #fff9f2; color: #a05e2a; font-weight: 500; }
        .ap-section-label { font-family: 'Lora', serif; font-size: 13px; font-style: italic; color: #b08a5e; display: flex; align-items: center; gap: 8px; margin: 4px 0; }
        .ap-section-label::before, .ap-section-label::after { content: ''; flex: 1; height: 1px; background: #e8dece; }
        .ap-info-box { font-size: 12px; color: #9a8775; background: #faf6ee; padding: 12px 15px; border-radius: 12px; border: 1.5px dashed #e0d4c0; line-height: 1.6; }
        .ap-success { display: flex; align-items: flex-start; gap: 12px; padding: 14px 16px; border-radius: 12px; background: #f4faf0; border: 1.5px solid #a6d490; margin-bottom: 24px; animation: slideDown 0.22s ease; }
        .ap-success-icon { width: 22px; height: 22px; background: #5aaa38; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 11px; color: #fff; font-weight: 700; flex-shrink: 0; }
        .ap-success-title { font-size: 13px; font-weight: 500; color: #3a6e28; }
        .ap-success-sub { font-size: 12px; color: #5a8a48; margin-top: 2px; }
        @keyframes slideDown { from { opacity: 0; transform: translateY(-8px); } to { opacity: 1; transform: translateY(0); } }
        .ap-usd-hint { font-size: 11px; color: #b08a5e; font-weight: 500; margin-top: 5px; }
        .ap-actions { display: flex; justify-content: space-between; align-items: center; margin-top: 26px; padding-top: 20px; border-top: 1px solid #e8dece; }
        .ap-required-note { font-size: 12px; color: #b0a090; }
        .ap-btn-cancel { padding: 11px 22px; border-radius: 12px; border: 1.5px solid #ddd0be; background: transparent; font-family: 'DM Sans', sans-serif; font-size: 13px; font-weight: 500; color: #9a8775; cursor: pointer; transition: all 0.15s; }
        .ap-btn-cancel:hover { background: #f0ebe1; color: #5a4a38; border-color: #c8baa8; }
        .ap-btn-submit { display: flex; align-items: center; gap: 8px; padding: 11px 26px; border-radius: 12px; border: none; background: #c97844; font-family: 'DM Sans', sans-serif; font-size: 13px; font-weight: 500; color: #fff; cursor: pointer; transition: background 0.15s, transform 0.1s; letter-spacing: 0.3px; }
        .ap-btn-submit:hover:not(:disabled) { background: #b5672f; transform: translateY(-1px); }
        .ap-btn-submit:active:not(:disabled) { transform: translateY(0); }
        .ap-btn-submit:disabled { opacity: 0.55; cursor: not-allowed; transform: none; }
        .ap-spinner { width: 13px; height: 13px; border: 2px solid rgba(255,255,255,0.35); border-top-color: #fff; border-radius: 50%; display: inline-block; animation: spin 0.7s linear infinite; }
        @keyframes spin { to { transform: rotate(360deg); } }
        @media (max-width: 520px) { .ap-card { padding: 24px 18px; } .ap-date-row { grid-template-columns: 1fr; } .ap-type-group { flex-direction: column; } }
      `}</style>

      <div className="ap-page">
        <div className="ap-card">
          <div className="ap-eyebrow">Project Setup</div>
          <div className="ap-heading">Add New Project</div>
          <div className="ap-sub">Fill in the details below to initialise this project</div>
          <div className="ap-divider-top" />

          {success && (
            <div className="ap-success">
              <div className="ap-success-icon">✓</div>
              <div>
                <div className="ap-success-title">Project added successfully!</div>
                <div className="ap-success-sub">Redirecting to projects...</div>
              </div>
            </div>
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            <div className="ap-field">
              <div className="ap-label">Project Name <span className="ap-required">*</span></div>
              <input className={`ap-input${errors.projectName ? " err" : ""}`} name="projectName" value={formData.projectName} onChange={handleChange} placeholder="e.g. Website Redesign Pipeline" autoFocus />
              {errors.projectName && <div className="ap-err">⚠ {errors.projectName}</div>}
            </div>

            <div className="ap-date-row">
              <div className="ap-field">
                <div className="ap-label">Start Date <span className="ap-required">*</span></div>
                <input className={`ap-input${errors.startDate ? " err" : ""}`} name="startDate" value={formData.startDate} onChange={handleChange} type="date" />
                {errors.startDate && <div className="ap-err">⚠ {errors.startDate}</div>}
              </div>
              <div className="ap-field">
                <div className="ap-label">End Date <span className="ap-required">*</span></div>
                <input className={`ap-input${errors.endDate ? " err" : ""}`} name="endDate" value={formData.endDate} onChange={handleChange} type="date" min={formData.startDate} />
                {errors.endDate && <div className="ap-err">⚠ {errors.endDate}</div>}
              </div>
            </div>

            <div className="ap-field">
              <div className="ap-label">Billing Type <span className="ap-required">*</span></div>
              <div className="ap-type-group">
                {["hourly", "daily", "monthly"].map((t) => (
                  <button key={t} className={`ap-type-btn${formData.projectType === t ? " active" : ""}`} onClick={() => handleTypeChange(t)} type="button">
                    {typeConfig[t].icon} {typeConfig[t].label}
                    {formData.projectType === t && <span style={{ fontSize: 11 }}>✓</span>}
                  </button>
                ))}
              </div>
              {errors.projectType && <div className="ap-err">⚠ {errors.projectType}</div>}
            </div>

            {formData.projectType === "monthly" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
                <div className="ap-section-label">Monthly Base Settings</div>
                <div className="ap-field">
                  <div className="ap-label">Currency</div>
                  <div className="ap-cur-group">
                    {CURRENCIES.map((c) => (
                      <button key={c.value} className={`ap-cur-btn${formData.currency === c.value ? " active" : ""}`} onClick={() => setFormData((p) => ({ ...p, currency: c.value }))} type="button">
                        <strong>{c.symbol}</strong> {c.value}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="ap-field">
                  <div className="ap-label">Expected Amount ({formData.currency}) <span className="ap-required">*</span></div>
                  <div className="ap-prefix-wrap">
                    <span className="ap-prefix">{sym}</span>
                    <input className={`ap-input has-prefix${errors.expectedAmount ? " err" : ""}`} name="expectedAmount" value={formData.expectedAmount} onChange={handleChange} placeholder="0.00" type="number" min="0" />
                  </div>
                  {errors.expectedAmount && <div className="ap-err">⚠ {errors.expectedAmount}</div>}
                  {formData.currency === "USD" && Number(formData.expectedAmount) > 0 && (
                    <div className="ap-usd-hint">≈ ₹{(Number(formData.expectedAmount) * USD_TO_INR).toLocaleString("en-IN", { maximumFractionDigits: 0 })} will be saved</div>
                  )}
                </div>
              </div>
            )}

            {(formData.projectType === "hourly" || formData.projectType === "daily") && (
              <div className="ap-info-box">ℹ️ Rates and units for <strong>{typeConfig[formData.projectType].label}</strong> billing are configured per-month inside the dashboard.</div>
            )}
          </div>

          <div className="ap-actions">
            <span className="ap-required-note"><span style={{ color: "#c97844" }}>*</span> Required fields</span>
            <div style={{ display: "flex", gap: 10 }}>
              <button className="ap-btn-cancel" onClick={handleCancel} type="button">Cancel</button>
              <button className="ap-btn-submit" onClick={handleSubmit} disabled={loading} type="button">
                {loading ? <><span className="ap-spinner" /> Saving...</> : <><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>Add Project</>}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default AddProject;
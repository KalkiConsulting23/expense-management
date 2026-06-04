import { useState } from "react";

const TABS = ["recurring", "one-time"];

const Employee = () => {
  const [step, setStep] = useState(1);

  const [expenseType, setExpenseType]       = useState("");
  const [expenseTypeError, setExpenseTypeError] = useState("");
  const [expenseName, setExpenseName]       = useState("");
  const [expenseNameError, setExpenseNameError] = useState("");

  const [type, setType] = useState("recurring");

  const [recurringData, setRecurringData] = useState({ amount: "", startDate: "", endDate: "" });
  const [oneTimeData, setOneTimeData]     = useState({ amount: "", date: "" });
  const [errors, setErrors]   = useState({});
  const [success, setSuccess] = useState(false);

  /* ── Step 1 merged: validate both type + name ── */
  const handleProceedStep1 = () => {
    let hasErr = false;
    if (!expenseType.trim()) { setExpenseTypeError("Expense type is required"); hasErr = true; }
    else setExpenseTypeError("");
    if (!expenseName.trim()) { setExpenseNameError("Expense name is required"); hasErr = true; }
    else setExpenseNameError("");
    if (!hasErr) setStep(2);
  };

  const handleBack = (toStep) => { setStep(toStep); setErrors({}); setSuccess(false); };

  const handleRecurringChange = (e) => {
    const { name, value } = e.target;
    setRecurringData((p) => ({ ...p, [name]: value }));
    if (errors[name]) setErrors((p) => ({ ...p, [name]: false }));
  };

  const handleOneTimeChange = (e) => {
    const { name, value } = e.target;
    setOneTimeData((p) => ({ ...p, [name]: value }));
    if (errors[name]) setErrors((p) => ({ ...p, [name]: false }));
  };

  const handleTabChange = (tab) => { setType(tab); setErrors({}); setSuccess(false); };

  const parseDate = (val) => {
    val = val.trim();
    if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(val)) {
      const [day, month, year] = val.split("/");
      return new Date(`${year}-${month.padStart(2,"0")}-${day.padStart(2,"0")}`);
    }
    if (/^\d{1,2}-\d{1,2}-\d{4}$/.test(val)) {
      const [day, month, year] = val.split("-");
      return new Date(`${year}-${month.padStart(2,"0")}-${day.padStart(2,"0")}`);
    }
    return new Date(val);
  };

  const validateRecurring = () => {
    const e = {};
    if (!recurringData.amount)    e.amount    = "Amount is required";
    if (!recurringData.startDate) e.startDate = "Start date is required";
    return e;
  };

  const validateOneTime = () => {
    const e = {};
    if (!oneTimeData.amount) e.amount = "Amount is required";
    if (!oneTimeData.date.trim()) { e.date = "Date is required"; }
    else { const p = parseDate(oneTimeData.date); if (isNaN(p.getTime())) e.date = "Enter a valid date (e.g. 25/05/2025)"; }
    return e;
  };

  const handleSubmit = async () => {
    const newErrors = type === "recurring" ? validateRecurring() : validateOneTime();
    if (Object.keys(newErrors).length > 0) { setErrors(newErrors); return; }

    let payload;
    if (type === "recurring") {
      payload = { type: "recurring", expenseType: expenseType.trim(), expenseName: expenseName.trim(), amount: Number(recurringData.amount), startDate: recurringData.startDate, endDate: recurringData.endDate || null };
    } else {
      const parsed = parseDate(oneTimeData.date);
      payload = { type: "one-time", expenseType: expenseType.trim(), expenseName: expenseName.trim(), amount: Number(oneTimeData.amount), date: parsed.toISOString().split("T")[0] };
    }

    try {
      const response = await fetch("http://localhost:5000/api/employee/add", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      console.log(data);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      console.error(err);
      alert("Something went wrong!");
    }
  };

  const handleCancel = () => {
    setStep(1);
    setExpenseType(""); setExpenseTypeError("");
    setExpenseName(""); setExpenseNameError("");
    setType("recurring");
    setRecurringData({ amount: "", startDate: "", endDate: "" });
    setOneTimeData({ amount: "", date: "" });
    setErrors({}); setSuccess(false);
  };

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Lora:ital,wght@0,400;0,600;1,400&family=DM+Sans:wght@300;400;500&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        input[type=number]::-webkit-inner-spin-button,
        input[type=number]::-webkit-outer-spin-button { -webkit-appearance: none; }
        input[type=number] { -moz-appearance: textfield; }

        .ep-page {
          min-height: 100vh;
          background: #f5f0e8;
          display: flex;
          align-items: flex-start;
          justify-content: center;
          padding: 40px 16px 60px;
          font-family: 'DM Sans', sans-serif;
        }

        .ep-card {
          width: 100%;
          max-width: 560px;
          background: #fffdf8;
          border: 1.5px solid #e8dece;
          border-radius: 20px;
          overflow: hidden;
          box-shadow: 0 2px 0 #e2d9c8, 0 8px 32px rgba(160,130,90,0.08);
        }

        /* ── Step indicator header ── */
        .ep-header {
          padding: 24px 32px 20px;
          border-bottom: 1px solid #e8dece;
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 16px;
          background: #fffdf8;
        }

        .ep-eyebrow {
          font-size: 10px;
          font-weight: 500;
          letter-spacing: 2px;
          text-transform: uppercase;
          color: #b08a5e;
          margin-bottom: 5px;
        }

        .ep-heading {
          font-family: 'Lora', serif;
          font-size: 22px;
          font-weight: 600;
          color: #2e2318;
          line-height: 1.2;
        }

        .ep-sub {
          font-size: 12px;
          color: #9a8775;
          margin-top: 3px;
        }

        /* ── Step dots ── */
        .ep-steps {
          display: flex;
          align-items: center;
          gap: 6px;
          flex-shrink: 0;
          margin-top: 4px;
        }

        .ep-step-dot {
          width: 28px;
          height: 28px;
          border-radius: 50%;
          border: 1.5px solid #e0d4c0;
          background: #faf6ee;
          color: #c5b49e;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 11px;
          font-weight: 600;
          transition: all 0.2s;
        }

        .ep-step-dot.active {
          background: #c97844;
          border-color: #c97844;
          color: #fff;
        }

        .ep-step-dot.done {
          background: #f0ebe1;
          border-color: #d4b88a;
          color: #b08a5e;
        }

        .ep-step-line {
          width: 20px;
          height: 1px;
          background: #e0d4c0;
        }

        /* ── Body ── */
        .ep-body { padding: 28px 32px; }

        /* ── Field ── */
        .ep-field { display: flex; flex-direction: column; margin-bottom: 18px; }
        .ep-field:last-of-type { margin-bottom: 0; }

        .ep-label {
          font-size: 11px;
          font-weight: 500;
          color: #8c7a68;
          letter-spacing: 1px;
          text-transform: uppercase;
          margin-bottom: 7px;
        }

        .ep-required { color: #c97844; margin-left: 2px; }

        .ep-input {
          width: 100%;
          padding: 11px 15px;
          border-radius: 12px;
          border: 1.5px solid #e0d4c0;
          background: #faf6ee;
          color: #2e2318;
          font-size: 14px;
          font-family: 'DM Sans', sans-serif;
          outline: none;
          transition: border-color 0.18s, background 0.18s;
        }

        .ep-input::placeholder { color: #c5b49e; }
        .ep-input:focus { border-color: #c97844; background: #fff; }
        .ep-input.err { border-color: #d97a5a; background: #fff8f4; }
        .ep-input.has-prefix { padding-left: 30px; }

        .ep-hint { font-size: 11px; color: #b0a090; margin-top: 5px; }
        .ep-err  { font-size: 11px; color: #c97844; font-weight: 500; margin-top: 5px; }

        /* ── Two-col grid ── */
        .ep-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 16px;
        }

        /* ── Amount prefix ── */
        .ep-prefix-wrap { position: relative; display: flex; align-items: center; }
        .ep-prefix {
          position: absolute;
          left: 13px;
          font-size: 14px;
          color: #9a8775;
          pointer-events: none;
          z-index: 1;
        }

        /* ── Preview banner (step 2) ── */
        .ep-banner {
          display: flex;
          align-items: center;
          gap: 14px;
          padding: 12px 16px;
          background: #faf6ee;
          border: 1.5px solid #e8dece;
          border-radius: 14px;
          margin-bottom: 22px;
        }

        .ep-banner-item { display: flex; flex-direction: column; gap: 2px; }
        .ep-banner-sep  { width: 1px; height: 30px; background: #e0d4c0; }

        .ep-banner-label {
          font-size: 10px;
          font-weight: 500;
          letter-spacing: 1px;
          text-transform: uppercase;
          color: #b08a5e;
        }

        .ep-banner-value { font-size: 13px; font-weight: 500; color: #2e2318; }

        .ep-edit-btn {
          margin-left: auto;
          background: transparent;
          border: 1.5px solid #e0d4c0;
          border-radius: 8px;
          padding: 5px 10px;
          font-size: 12px;
          color: #9a8775;
          cursor: pointer;
          font-family: 'DM Sans', sans-serif;
          transition: all 0.15s;
        }

        .ep-edit-btn:hover { border-color: #c97844; color: #a05e2a; background: #fff9f2; }

        /* ── Section label ── */
        .ep-section-label {
          font-family: 'Lora', serif;
          font-size: 13px;
          font-style: italic;
          color: #b08a5e;
          display: flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 20px;
        }

        .ep-section-label::before,
        .ep-section-label::after { content: ''; flex: 1; height: 1px; background: #e8dece; }

        /* ── Tab row ── */
        .ep-tab-row {
          display: flex;
          border-top: 1px solid #e8dece;
          border-bottom: 1px solid #e8dece;
          background: #faf6ee;
        }

        .ep-tab {
          flex: 1;
          padding: 11px 0;
          border: none;
          border-bottom: 2px solid transparent;
          background: transparent;
          cursor: pointer;
          font-size: 12px;
          font-weight: 500;
          color: #9a8775;
          font-family: 'DM Sans', sans-serif;
          transition: all 0.15s;
          letter-spacing: 0.3px;
        }

        .ep-tab:hover { color: #7a6050; }

        .ep-tab.active {
          color: #a05e2a;
          border-bottom: 2px solid #c97844;
          background: #fffdf8;
          font-weight: 500;
        }

        /* ── Step label ── */
        .ep-step-label {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 20px;
        }

        .ep-step-badge {
          font-size: 10px;
          font-weight: 500;
          color: #b08a5e;
          background: #f5ece0;
          border: 1px solid #e8dece;
          padding: 2px 9px;
          border-radius: 20px;
          text-transform: uppercase;
          letter-spacing: 1px;
        }

        .ep-step-title {
          font-family: 'Lora', serif;
          font-size: 14px;
          font-style: italic;
          color: #7a6050;
        }

        /* ── Success toast ── */
        .ep-toast {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 12px 16px;
          border-radius: 12px;
          background: #f4faf0;
          border: 1.5px solid #a6d490;
          color: #3a6e28;
          font-size: 13px;
          font-weight: 500;
          margin-bottom: 18px;
        }

        /* ── Actions ── */
        .ep-footer {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding-top: 20px;
          margin-top: 22px;
          border-top: 1px solid #e8dece;
        }

        .ep-footer-note { font-size: 12px; color: #b0a090; }

        .ep-btn-group { display: flex; gap: 8px; }

        .ep-btn-back {
          padding: 10px 18px;
          border-radius: 12px;
          border: 1.5px solid #e0d4c0;
          background: #faf6ee;
          color: #9a8775;
          font-size: 13px;
          font-weight: 500;
          cursor: pointer;
          font-family: 'DM Sans', sans-serif;
          transition: all 0.15s;
        }

        .ep-btn-back:hover { background: #f0ebe1; color: #5a4a38; border-color: #c8baa8; }

        .ep-btn-cancel {
          padding: 10px 20px;
          border-radius: 12px;
          border: 1.5px solid #ddd0be;
          background: transparent;
          font-family: 'DM Sans', sans-serif;
          font-size: 13px;
          font-weight: 500;
          color: #9a8775;
          cursor: pointer;
          transition: all 0.15s;
        }

        .ep-btn-cancel:hover { background: #f0ebe1; color: #5a4a38; border-color: #c8baa8; }

        .ep-btn-submit {
          display: flex;
          align-items: center;
          gap: 7px;
          padding: 10px 22px;
          border-radius: 12px;
          border: none;
          background: #c97844;
          font-family: 'DM Sans', sans-serif;
          font-size: 13px;
          font-weight: 500;
          color: #fff;
          cursor: pointer;
          transition: background 0.15s, transform 0.1s;
          letter-spacing: 0.3px;
        }

        .ep-btn-submit:hover { background: #b5672f; transform: translateY(-1px); }
        .ep-btn-submit:active { transform: translateY(0); }

        @media (max-width: 520px) {
          .ep-body { padding: 22px 18px; }
          .ep-header { padding: 20px 18px 16px; }
          .ep-grid { grid-template-columns: 1fr; }
        }
      `}</style>

      <div className="ep-page">
        <div className="ep-card">

          {/* Header */}
          <div className="ep-header">
            <div>
              <div className="ep-eyebrow">Expense Entry</div>
              <div className="ep-heading">Add New Expense</div>
              <div className="ep-sub">Fill in the details below to register an expense</div>
            </div>
            <div className="ep-steps">
              <div className={`ep-step-dot ${step >= 1 ? (step > 1 ? "done" : "active") : ""}`}>1</div>
              <div className="ep-step-line" />
              <div className={`ep-step-dot ${step >= 2 ? "active" : ""}`}>2</div>
            </div>
          </div>

          {/* ── STEP 1: Expense Type + Name (merged) ── */}
          {step === 1 && (
            <div className="ep-body">
              <div className="ep-step-label">
                <span className="ep-step-badge">Step 1 of 2</span>
                <span className="ep-step-title">Expense details</span>
              </div>

              {/* Expense Type */}
              <div className="ep-field">
                <label className="ep-label">Expense Type <span className="ep-required">*</span></label>
                <input
                  className={`ep-input${expenseTypeError ? " err" : ""}`}
                  value={expenseType}
                  onChange={(e) => { setExpenseType(e.target.value); if (expenseTypeError) setExpenseTypeError(""); }}
                  onKeyDown={(e) => e.key === "Enter" && handleProceedStep1()}
                  placeholder="e.g. Salary, Rent, Utilities…"
                  type="text"
                  autoFocus
                />
                {expenseTypeError
                  ? <span className="ep-err">⚠ {expenseTypeError}</span>
                  : <span className="ep-hint">The broad category this expense belongs to</span>
                }
              </div>

              {/* Expense Name */}
              <div className="ep-field">
                <label className="ep-label">Expense Name <span className="ep-required">*</span></label>
                <input
                  className={`ep-input${expenseNameError ? " err" : ""}`}
                  value={expenseName}
                  onChange={(e) => { setExpenseName(e.target.value); if (expenseNameError) setExpenseNameError(""); }}
                  onKeyDown={(e) => e.key === "Enter" && handleProceedStep1()}
                  placeholder="e.g. Office Supplies, Rahul Salary…"
                  type="text"
                />
                {expenseNameError
                  ? <span className="ep-err">⚠ {expenseNameError}</span>
                  : <span className="ep-hint">The specific label for this expense record</span>
                }
              </div>

              <div className="ep-footer">
                <span className="ep-footer-note"><span style={{ color: "#c97844" }}>*</span> Required fields</span>
                <div className="ep-btn-group">
                  <button className="ep-btn-cancel" onClick={handleCancel}>Cancel</button>
                  <button className="ep-btn-submit" onClick={handleProceedStep1}>
                    Continue
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                      <polyline points="9 18 15 12 9 6"/>
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ── STEP 2: Recurring / One-Time ── */}
          {step === 2 && (
            <>
              {/* Preview banner */}
              <div className="ep-body" style={{ paddingBottom: 0 }}>
                <div className="ep-banner">
                  <div className="ep-banner-item">
                    <span className="ep-banner-label">Type</span>
                    <span className="ep-banner-value">{expenseType}</span>
                  </div>
                  <div className="ep-banner-sep" />
                  <div className="ep-banner-item">
                    <span className="ep-banner-label">Name</span>
                    <span className="ep-banner-value">{expenseName}</span>
                  </div>
                  <button className="ep-edit-btn" onClick={() => handleBack(1)}>✏ Edit</button>
                </div>
              </div>

              {/* Tabs */}
              <div className="ep-tab-row">
                {TABS.map((tab) => (
                  <button
                    key={tab}
                    className={`ep-tab${type === tab ? " active" : ""}`}
                    onClick={() => handleTabChange(tab)}
                  >
                    {tab === "recurring" ? "🔁 Recurring" : "⚡ One-Time"}
                  </button>
                ))}
              </div>

              <div className="ep-body">
                <div className="ep-step-label">
                  <span className="ep-step-badge">Step 2 of 2</span>
                  <span className="ep-step-title">
                    {type === "recurring" ? "Recurring expense details" : "One-time expense details"}
                  </span>
                </div>

                {success && (
                  <div className="ep-toast">✓ Expense added successfully!</div>
                )}

                {type === "recurring" ? (
                  <RecurringForm data={recurringData} errors={errors} onChange={handleRecurringChange} />
                ) : (
                  <OneTimeForm data={oneTimeData} errors={errors} onChange={handleOneTimeChange} />
                )}

                <div className="ep-footer">
                  <span className="ep-footer-note"><span style={{ color: "#c97844" }}>*</span> Required fields</span>
                  <div className="ep-btn-group">
                    <button className="ep-btn-back" onClick={() => handleBack(1)}>← Back</button>
                    <button className="ep-btn-cancel" onClick={handleCancel}>Cancel</button>
                    <button className="ep-btn-submit" onClick={handleSubmit}>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                        <polyline points="20 6 9 17 4 12"/>
                      </svg>
                      Add Expense
                    </button>
                  </div>
                </div>
              </div>
            </>
          )}

        </div>
      </div>
    </>
  );
};

/* ── Recurring sub-form ── */
const RecurringForm = ({ data, errors, onChange }) => (
  <div>
    <div className="ep-field">
      <label className="ep-label">Amount <span className="ep-required">*</span></label>
      <div className="ep-prefix-wrap">
        <span className="ep-prefix">₹</span>
        <input
          className={`ep-input has-prefix${errors.amount ? " err" : ""}`}
          name="amount" value={data.amount} onChange={onChange}
          placeholder="0" type="number" min="0"
        />
      </div>
      {errors.amount && <span className="ep-err">⚠ {errors.amount}</span>}
    </div>
    <div className="ep-grid">
      <div className="ep-field">
        <label className="ep-label">Start Date <span className="ep-required">*</span></label>
        <input
          className={`ep-input${errors.startDate ? " err" : ""}`}
          name="startDate" value={data.startDate} onChange={onChange} type="date"
        />
        {errors.startDate && <span className="ep-err">⚠ {errors.startDate}</span>}
      </div>
      <div className="ep-field">
        <label className="ep-label">End Date</label>
        <input
          className="ep-input"
          name="endDate" value={data.endDate} onChange={onChange} type="date"
        />
      </div>
    </div>
  </div>
);

/* ── One-time sub-form ── */
const OneTimeForm = ({ data, errors, onChange }) => (
  <div>
    <div className="ep-field">
      <label className="ep-label">Amount <span className="ep-required">*</span></label>
      <div className="ep-prefix-wrap">
        <span className="ep-prefix">₹</span>
        <input
          className={`ep-input has-prefix${errors.amount ? " err" : ""}`}
          name="amount" value={data.amount} onChange={onChange}
          placeholder="0" type="number" min="0"
        />
      </div>
      {errors.amount && <span className="ep-err">⚠ {errors.amount}</span>}
    </div>
    <div className="ep-field">
      <label className="ep-label">Date <span className="ep-required">*</span></label>
      <input
        className={`ep-input${errors.date ? " err" : ""}`}
        name="date" value={data.date} onChange={onChange}
        placeholder="e.g. 25/05/2025 or 25-05-2025"
        type="text"
      />
      {errors.date
        ? <span className="ep-err">⚠ {errors.date}</span>
        : <span className="ep-hint">Type the date in any common format</span>
      }
    </div>
  </div>
);

export default Employee;
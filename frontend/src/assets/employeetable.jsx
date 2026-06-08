import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useApi } from "../utils/api";

const TABS = ["recurring", "one-time"];

const Employee = () => {
  const { apiFetch } = useApi();
  const navigate = useNavigate();

  const [expenseType, setExpenseType]           = useState("");
  const [expenseTypeError, setExpenseTypeError] = useState("");
  const [expenseName, setExpenseName]           = useState("");
  const [expenseNameError, setExpenseNameError] = useState("");

  const [type, setType] = useState("recurring");

  const [recurringData, setRecurringData] = useState({ amount: "", startDate: "", endDate: "" });
  const [oneTimeData, setOneTimeData]     = useState({ amount: "", date: "" });
  const [errors, setErrors]   = useState({});
  const [success, setSuccess] = useState(false);

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

  const validate = () => {
    const e = {};
    if (!expenseType.trim()) e.expenseType = "Expense type is required";
    if (!expenseName.trim()) e.expenseName = "Expense name is required";
    if (type === "recurring") {
      if (!recurringData.amount)    e.amount    = "Amount is required";
      if (!recurringData.startDate) e.startDate = "Start date is required";
    } else {
      if (!oneTimeData.amount) e.amount = "Amount is required";
      if (!oneTimeData.date.trim()) { e.date = "Date is required"; }
      else { const p = parseDate(oneTimeData.date); if (isNaN(p.getTime())) e.date = "Enter a valid date (e.g. 25/05/2025)"; }
    }
    return e;
  };

  const handleSubmit = async () => {
    const newErrors = validate();
    if (Object.keys(newErrors).length > 0) {
      setExpenseTypeError(newErrors.expenseType || "");
      setExpenseNameError(newErrors.expenseName || "");
      setErrors(newErrors);
      return;
    }

    let payload;
    if (type === "recurring") {
      payload = { type: "recurring", expenseType: expenseType.trim(), expenseName: expenseName.trim(), amount: Number(recurringData.amount), startDate: recurringData.startDate, endDate: recurringData.endDate || null };
    } else {
      const parsed = parseDate(oneTimeData.date);
      payload = { type: "one-time", expenseType: expenseType.trim(), expenseName: expenseName.trim(), amount: Number(oneTimeData.amount), date: parsed.toISOString().split("T")[0] };
    }

    try {
      const response = await apiFetch("https://expense-management-2-bsa7.onrender.com/api/employee/add", {
        method: "POST",
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const err = await response.json();
        alert(err.message || "Server error. Please try again.");
        return;
      }

      await response.json();
      navigate("/");
    } catch (err) {
      console.error(err);
      alert("Something went wrong!");
    }
  };

  const handleCancel = () => {
    navigate("/employee");
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
        .ep-header {
          padding: 24px 32px 20px;
          border-bottom: 1px solid #e8dece;
          background: #fffdf8;
        }
        .ep-eyebrow { font-size: 10px; font-weight: 500; letter-spacing: 2px; text-transform: uppercase; color: #b08a5e; margin-bottom: 5px; }
        .ep-heading { font-family: 'Lora', serif; font-size: 22px; font-weight: 600; color: #2e2318; line-height: 1.2; }
        .ep-sub { font-size: 12px; color: #9a8775; margin-top: 3px; }
        .ep-body { padding: 28px 32px; }
        .ep-section-divider { font-family: 'Lora', serif; font-size: 13px; font-style: italic; color: #b08a5e; display: flex; align-items: center; gap: 8px; margin-bottom: 20px; margin-top: 4px; }
        .ep-section-divider::before, .ep-section-divider::after { content: ''; flex: 1; height: 1px; background: #e8dece; }
        .ep-field { display: flex; flex-direction: column; margin-bottom: 18px; }
        .ep-label { font-size: 11px; font-weight: 500; color: #8c7a68; letter-spacing: 1px; text-transform: uppercase; margin-bottom: 7px; }
        .ep-required { color: #c97844; margin-left: 2px; }
        .ep-input { width: 100%; padding: 11px 15px; border-radius: 12px; border: 1.5px solid #e0d4c0; background: #faf6ee; color: #2e2318; font-size: 14px; font-family: 'DM Sans', sans-serif; outline: none; transition: border-color 0.18s, background 0.18s; }
        .ep-input::placeholder { color: #c5b49e; }
        .ep-input:focus { border-color: #c97844; background: #fff; }
        .ep-input.err { border-color: #d97a5a; background: #fff8f4; }
        .ep-input.has-prefix { padding-left: 30px; }
        .ep-hint { font-size: 11px; color: #b0a090; margin-top: 5px; }
        .ep-err  { font-size: 11px; color: #c97844; font-weight: 500; margin-top: 5px; }
        .ep-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
        .ep-prefix-wrap { position: relative; display: flex; align-items: center; }
        .ep-prefix { position: absolute; left: 13px; font-size: 14px; color: #9a8775; pointer-events: none; z-index: 1; }
        .ep-tab-row { display: flex; border: 1.5px solid #e0d4c0; border-radius: 14px; background: #faf6ee; overflow: hidden; margin-bottom: 22px; }
        .ep-tab { flex: 1; padding: 10px 0; border: none; border-bottom: none; background: transparent; cursor: pointer; font-size: 12px; font-weight: 500; color: #9a8775; font-family: 'DM Sans', sans-serif; transition: all 0.15s; letter-spacing: 0.3px; }
        .ep-tab:hover { color: #7a6050; }
        .ep-tab.active { color: #fff; background: #c97844; font-weight: 500; }
        .ep-footer { display: flex; justify-content: space-between; align-items: center; padding-top: 20px; margin-top: 6px; border-top: 1px solid #e8dece; }
        .ep-footer-note { font-size: 12px; color: #b0a090; }
        .ep-btn-group { display: flex; gap: 8px; }
        .ep-btn-cancel { padding: 10px 20px; border-radius: 12px; border: 1.5px solid #ddd0be; background: transparent; font-family: 'DM Sans', sans-serif; font-size: 13px; font-weight: 500; color: #9a8775; cursor: pointer; transition: all 0.15s; }
        .ep-btn-cancel:hover { background: #f0ebe1; color: #5a4a38; border-color: #c8baa8; }
        .ep-btn-submit { display: flex; align-items: center; gap: 7px; padding: 10px 22px; border-radius: 12px; border: none; background: #c97844; font-family: 'DM Sans', sans-serif; font-size: 13px; font-weight: 500; color: #fff; cursor: pointer; transition: background 0.15s, transform 0.1s; letter-spacing: 0.3px; }
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
          <div className="ep-header">
            <div className="ep-eyebrow">Expense Entry</div>
            <div className="ep-heading">Add New Expense</div>
            <div className="ep-sub">Fill in the details below to register an expense</div>
          </div>

          <div className="ep-body">

            {/* ── Section 1: Expense Identity ── */}
            <div className="ep-section-divider">Expense details</div>

            <div className="ep-field">
              <label className="ep-label">Expense Type <span className="ep-required">*</span></label>
              <input
                className={`ep-input${expenseTypeError ? " err" : ""}`}
                value={expenseType}
                onChange={(e) => { setExpenseType(e.target.value); if (expenseTypeError) setExpenseTypeError(""); }}
                placeholder="e.g. Salary, Rent, Utilities…"
                type="text"
                autoFocus
              />
              {expenseTypeError
                ? <span className="ep-err">⚠ {expenseTypeError}</span>
                : <span className="ep-hint">The broad category this expense belongs to</span>}
            </div>

            <div className="ep-field">
              <label className="ep-label">Expense Name <span className="ep-required">*</span></label>
              <input
                className={`ep-input${expenseNameError ? " err" : ""}`}
                value={expenseName}
                onChange={(e) => { setExpenseName(e.target.value); if (expenseNameError) setExpenseNameError(""); }}
                placeholder="e.g. Office Supplies, Rahul Salary…"
                type="text"
              />
              {expenseNameError
                ? <span className="ep-err">⚠ {expenseNameError}</span>
                : <span className="ep-hint">The specific label for this expense record</span>}
            </div>

            {/* ── Section 2: Amount & Schedule ── */}
            <div className="ep-section-divider" style={{ marginTop: 8 }}>Amount &amp; schedule</div>

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

            {type === "recurring" ? (
              <RecurringForm data={recurringData} errors={errors} onChange={handleRecurringChange} />
            ) : (
              <OneTimeForm data={oneTimeData} errors={errors} onChange={handleOneTimeChange} />
            )}

            <div className="ep-footer">
              <span className="ep-footer-note"><span style={{ color: "#c97844" }}>*</span> Required fields</span>
              <div className="ep-btn-group">
                <button className="ep-btn-cancel" onClick={handleCancel}>Cancel</button>
                <button className="ep-btn-submit" onClick={handleSubmit}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
                  Add Expense
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

const RecurringForm = ({ data, errors, onChange }) => (
  <div>
    <div className="ep-field">
      <label className="ep-label">Amount <span className="ep-required">*</span></label>
      <div className="ep-prefix-wrap">
        <span className="ep-prefix">₹</span>
        <input className={`ep-input has-prefix${errors.amount ? " err" : ""}`} name="amount" value={data.amount} onChange={onChange} placeholder="0" type="number" min="0" />
      </div>
      {errors.amount && <span className="ep-err">⚠ {errors.amount}</span>}
    </div>
    <div className="ep-grid">
      <div className="ep-field">
        <label className="ep-label">Start Date <span className="ep-required">*</span></label>
        <input className={`ep-input${errors.startDate ? " err" : ""}`} name="startDate" value={data.startDate} onChange={onChange} type="date" />
        {errors.startDate && <span className="ep-err">⚠ {errors.startDate}</span>}
      </div>
      <div className="ep-field">
        <label className="ep-label">End Date</label>
        <input className="ep-input" name="endDate" value={data.endDate} onChange={onChange} type="date" />
      </div>
    </div>
  </div>
);

const OneTimeForm = ({ data, errors, onChange }) => (
  <div>
    <div className="ep-field">
      <label className="ep-label">Amount <span className="ep-required">*</span></label>
      <div className="ep-prefix-wrap">
        <span className="ep-prefix">₹</span>
        <input className={`ep-input has-prefix${errors.amount ? " err" : ""}`} name="amount" value={data.amount} onChange={onChange} placeholder="0" type="number" min="0" />
      </div>
      {errors.amount && <span className="ep-err">⚠ {errors.amount}</span>}
    </div>
    <div className="ep-field">
      <label className="ep-label">Date <span className="ep-required">*</span></label>
      <input className={`ep-input${errors.date ? " err" : ""}`} name="date" value={data.date} onChange={onChange} placeholder="e.g. 25/05/2025 or 25-05-2025" type="text" />
      {errors.date ? <span className="ep-err">⚠ {errors.date}</span> : <span className="ep-hint">Type the date in any common format</span>}
    </div>
  </div>
);

export default Employee;
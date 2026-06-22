import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";

const TABS = ["recurring", "one-time"];
const CACHE_KEY = 'local_employee_data_cache';
const API_BASE = import.meta.env.VITE_API_BASE;

// ── Autocomplete Input ────────────────────────────────────────────────────
const AutocompleteInput = ({ value, onChange, suggestions, placeholder, hasError, onBlur, autoFocus = false }) => {
  const [open, setOpen]           = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);
  const wrapRef                   = useRef(null);

  const filtered = value.trim()
    ? suggestions.filter((s) => s.toLowerCase().includes(value.toLowerCase()) && s.toLowerCase() !== value.toLowerCase())
    : suggestions; // show all when empty (on focus)

  // Close on outside click
  useEffect(() => {
    const handler = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleChange = (e) => {
    onChange(e.target.value);
    setOpen(true);
    setActiveIdx(-1);
  };

  const handleSelect = (val) => {
    onChange(val);
    setOpen(false);
    setActiveIdx(-1);
  };

  const handleKeyDown = (e) => {
    if (!open || filtered.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx((i) => (i + 1) % filtered.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((i) => (i - 1 + filtered.length) % filtered.length);
    } else if (e.key === "Enter" && activeIdx >= 0) {
      e.preventDefault();
      handleSelect(filtered[activeIdx]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  // Highlight matching portion
  const highlight = (text) => {
    const idx = text.toLowerCase().indexOf(value.toLowerCase());
    if (idx === -1 || !value.trim()) return text;
    return (
      <>
        {text.slice(0, idx)}
        <mark style={{ background: "#dbeafe", color: "#1e3a8a", padding: 0, borderRadius: 2 }}>
          {text.slice(idx, idx + value.length)}
        </mark>
        {text.slice(idx + value.length)}
      </>
    );
  };

  return (
    <div ref={wrapRef} style={{ position: "relative" }}>
      <input
        className={`ep-input${hasError ? " err" : ""}`}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onFocus={() => filtered.length > 0 && setOpen(true)}
        onBlur={onBlur}
        placeholder={placeholder}
        type="text"
        autoFocus={autoFocus}
        autoComplete="off"
      />
      {open && filtered.length > 0 && (
        <ul className="ep-autocomplete-list">
          {filtered.map((item, i) => (
            <li
              key={item}
              className={`ep-autocomplete-item${i === activeIdx ? " active" : ""}`}
              onMouseDown={() => handleSelect(item)}
              onMouseEnter={() => setActiveIdx(i)}
            >
              <span className="ep-ac-icon">🏷</span>
              <span>{highlight(item)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

// ── Main Component ────────────────────────────────────────────────────────
const Employee = () => {
  const navigate = useNavigate();

  const [expenseType, setExpenseType]           = useState("");
  const [expenseTypeError, setExpenseTypeError] = useState("");
  const [expenseName, setExpenseName]           = useState("");
  const [expenseNameError, setExpenseNameError] = useState("");
  const [existingTypes, setExistingTypes]       = useState([]);
  // Full list of {expenseType, expenseName} so name suggestions can be
  // scoped to the chosen type.
  const [existingExpenses, setExistingExpenses] = useState([]);

  const [type, setType] = useState("recurring");

  const [recurringData, setRecurringData] = useState({ amount: "", startDate: "", endDate: "" });
  const [oneTimeData, setOneTimeData]     = useState({ amount: "", date: "" });
  const [errors, setErrors]               = useState({});

  // Fetch existing expense types + names for autocomplete
  useEffect(() => {
    const ingest = (data) => {
      const types = [...new Set(data.map((e) => e.expenseType).filter(Boolean))];
      setExistingTypes(types);
      setExistingExpenses(
        data
          .filter((e) => e.expenseName)
          .map((e) => ({ expenseType: e.expenseType || "", expenseName: e.expenseName }))
      );
    };

    const load = async () => {
      try {
        const cached = sessionStorage.getItem(CACHE_KEY);
        const employees = cached ? JSON.parse(cached) : null;

        if (employees) {
          ingest(employees);
        } else {
          const res = await fetch(`${API_BASE}/employee/all`);
          if (res.ok) {
            const data = await res.json();
            ingest(data);
          }
        }
      } catch (err) {
        console.warn("Could not load expense data for autocomplete:", err);
      }
    };
    load();
  }, []);

  // Name suggestions: if the typed type matches an existing type, scope names
  // to that type; otherwise suggest all known names. De-duplicated.
  const typeMatch = expenseType.trim().toLowerCase();
  const nameSuggestions = (() => {
    const scoped = typeMatch
      ? existingExpenses.filter((e) => e.expenseType.toLowerCase() === typeMatch)
      : [];
    const source = scoped.length > 0 ? scoped : existingExpenses;
    return [...new Set(source.map((e) => e.expenseName))];
  })();

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

  const handleTabChange = (tab) => { setType(tab); setErrors({}); };

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
      const response = await fetch(`${API_BASE}/employee/add`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const err = await response.json();
        alert(err.message || "Server error. Please try again.");
        return;
      }

      await response.json();

      // SMART CACHE INVALIDATION
      sessionStorage.removeItem(CACHE_KEY);

      navigate("/");
    } catch (err) {
      console.error(err);
      alert("Something went wrong!");
    }
  };

  const handleCancel = () => navigate("/");

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
          background: #eef3fb;
          display: flex;
          align-items: flex-start;
          justify-content: center;
          padding: 40px 16px 60px;
          font-family: 'DM Sans', sans-serif;
        }

        /* ── Bento grid shell ── */
        .ep-bento {
          width: 100%;
          max-width: 920px;
          display: grid;
          grid-template-columns: 1fr 1.6fr;
          grid-auto-rows: min-content;
          gap: 16px;
        }
        .ep-tile {
          background: #ffffff;
          border: 1.5px solid #dde6f4;
          border-radius: 22px;
          box-shadow: 0 2px 0 #e6edf8, 0 8px 32px rgba(30,58,138,0.07);
          overflow: visible;
        }

        /* Hero tile (left, spans both rows) — rounded gradient */
        .ep-tile-hero {
          grid-row: span 2;
          background: linear-gradient(160deg, #1e3a8a 0%, #2563eb 55%, #60a5fa 100%);
          color: #ffffff;
          padding: 30px 28px;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          min-height: 100%;
          border: none;
          border-radius: 26px;
          box-shadow: 0 10px 34px rgba(30,58,138,0.28);
        }
        .ep-hero-eyebrow { font-size: 10px; font-weight: 500; letter-spacing: 2px; text-transform: uppercase; color: #bfdbfe; margin-bottom: 10px; }
        .ep-hero-title { font-family: 'Lora', serif; font-size: 26px; font-weight: 600; line-height: 1.18; }
        .ep-hero-sub { font-size: 13px; color: #dbeafe; margin-top: 10px; line-height: 1.5; }
        .ep-hero-foot { font-size: 12px; color: #bfdbfe; margin-top: 24px; }
        .ep-hero-foot .star { color: #ffffff; }

        /* Tile headers/body */
        .ep-tile-pad { padding: 22px 24px; }
        .ep-section-divider { font-family: 'Lora', serif; font-size: 13px; font-style: italic; color: #2563eb; display: flex; align-items: center; gap: 8px; margin-bottom: 18px; margin-top: 0; }
        .ep-section-divider::before, .ep-section-divider::after { content: ''; flex: 1; height: 1px; background: #dde6f4; }

        .ep-field { display: flex; flex-direction: column; margin-bottom: 16px; }
        .ep-field:last-child { margin-bottom: 0; }
        .ep-label { font-size: 11px; font-weight: 500; color: #51607c; letter-spacing: 1px; text-transform: uppercase; margin-bottom: 7px; }
        .ep-required { color: #2563eb; margin-left: 2px; }
        .ep-input { width: 100%; padding: 11px 15px; border-radius: 12px; border: 1.5px solid #d7e1f3; background: #f5f8fe; color: #1e293b; font-size: 14px; font-family: 'DM Sans', sans-serif; outline: none; transition: border-color 0.18s, background 0.18s; }
        .ep-input::placeholder { color: #a9bbd6; }
        .ep-input:focus { border-color: #2563eb; background: #fff; }
        .ep-input.err { border-color: #1e3a8a; background: #eef3fb; }
        .ep-input.has-prefix { padding-left: 30px; }
        .ep-hint { font-size: 11px; color: #94a3b8; margin-top: 5px; }
        .ep-err  { font-size: 11px; color: #1e3a8a; font-weight: 500; margin-top: 5px; }
        .ep-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
        .ep-prefix-wrap { position: relative; display: flex; align-items: center; }
        .ep-prefix { position: absolute; left: 13px; font-size: 14px; color: #51607c; pointer-events: none; z-index: 1; }
        .ep-tab-row { display: flex; border: 1.5px solid #d7e1f3; border-radius: 14px; background: #f5f8fe; overflow: hidden; margin-bottom: 18px; }
        .ep-tab { flex: 1; padding: 10px 0; border: none; background: transparent; cursor: pointer; font-size: 12px; font-weight: 500; color: #51607c; font-family: 'DM Sans', sans-serif; transition: all 0.15s; letter-spacing: 0.3px; }
        .ep-tab:hover { color: #1e3a8a; }
        .ep-tab.active { color: #fff; background: linear-gradient(135deg, #1e3a8a 0%, #2563eb 100%); font-weight: 500; }

        .ep-footer { display: flex; justify-content: space-between; align-items: center; padding: 18px 24px; }
        .ep-footer-note { font-size: 12px; color: #94a3b8; }
        .ep-btn-group { display: flex; gap: 8px; }
        .ep-btn-cancel { padding: 10px 20px; border-radius: 12px; border: 1.5px solid #d7e1f3; background: transparent; font-family: 'DM Sans', sans-serif; font-size: 13px; font-weight: 500; color: #51607c; cursor: pointer; transition: all 0.15s; }
        .ep-btn-cancel:hover { background: #eef3fb; color: #1e293b; border-color: #b9cbed; }
        .ep-btn-submit { display: flex; align-items: center; gap: 7px; padding: 10px 22px; border-radius: 12px; border: none; background: linear-gradient(135deg, #1e3a8a 0%, #2563eb 100%); font-family: 'DM Sans', sans-serif; font-size: 13px; font-weight: 500; color: #fff; cursor: pointer; transition: filter 0.15s, transform 0.1s; letter-spacing: 0.3px; }
        .ep-btn-submit:hover { filter: brightness(1.08); transform: translateY(-1px); }
        .ep-btn-submit:active { transform: translateY(0); }

        /* ── Autocomplete dropdown ── */
        .ep-autocomplete-list {
          position: absolute;
          top: calc(100% + 6px);
          left: 0; right: 0;
          background: #ffffff;
          border: 1.5px solid #d7e1f3;
          border-radius: 12px;
          box-shadow: 0 6px 24px rgba(30,58,138,0.15);
          list-style: none;
          overflow: hidden;
          z-index: 100;
          padding: 4px;
          max-height: 220px;
          overflow-y: auto;
        }
        .ep-autocomplete-item {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 9px 12px;
          font-size: 13.5px;
          color: #1e293b;
          border-radius: 9px;
          cursor: pointer;
          transition: background 0.12s;
          font-family: 'DM Sans', sans-serif;
        }
        .ep-autocomplete-item:hover,
        .ep-autocomplete-item.active {
          background: #dbeafe;
          color: #1e3a8a;
        }
        .ep-ac-icon { font-size: 12px; flex-shrink: 0; opacity: 0.7; }

        @media (max-width: 760px) {
          .ep-bento { grid-template-columns: 1fr; }
          .ep-tile-hero { grid-row: auto; min-height: auto; }
          .ep-tile-pad { padding: 20px 18px; }
          .ep-footer { padding: 16px 18px; }
          .ep-grid { grid-template-columns: 1fr; }
        }
      `}</style>

      <div className="ep-page">
        <div className="ep-bento">

          {/* Hero tile */}
          <div className="ep-tile-hero">
            <div>
              <div className="ep-hero-eyebrow">Expense Entry</div>
              <div className="ep-hero-title">Add New Expense</div>
              <div className="ep-hero-sub">Fill in the details to register a recurring or one-time expense record.</div>
            </div>
            <div className="ep-hero-foot"><span className="star">*</span> Required fields</div>
          </div>

          {/* Details tile */}
          <div className="ep-tile ep-tile-pad">
            <div className="ep-section-divider">Expense details</div>

            {/* Expense Type — with autocomplete */}
            <div className="ep-field">
              <label className="ep-label">Expense Type <span className="ep-required">*</span></label>
              <AutocompleteInput
                value={expenseType}
                onChange={(val) => { setExpenseType(val); if (expenseTypeError) setExpenseTypeError(""); }}
                suggestions={existingTypes}
                placeholder="e.g. Salary, Rent, Utilities…"
                hasError={!!expenseTypeError}
                onBlur={() => {}}
                autoFocus
              />
              {expenseTypeError
                ? <span className="ep-err">⚠ {expenseTypeError}</span>
                : <span className="ep-hint">The broad category this expense belongs to</span>}
            </div>

            {/* Expense Name — now with autocomplete */}
            <div className="ep-field">
              <label className="ep-label">Expense Name <span className="ep-required">*</span></label>
              <AutocompleteInput
                value={expenseName}
                onChange={(val) => { setExpenseName(val); if (expenseNameError) setExpenseNameError(""); }}
                suggestions={nameSuggestions}
                placeholder="e.g. Office Supplies, Rahul Salary…"
                hasError={!!expenseNameError}
                onBlur={() => {}}
              />
              {expenseNameError
                ? <span className="ep-err">⚠ {expenseNameError}</span>
                : <span className="ep-hint">
                    {expenseType.trim() && nameSuggestions.length > 0
                      ? `Existing names under "${expenseType.trim()}" — or type a new one`
                      : "The specific label for this expense record"}
                  </span>}
            </div>
          </div>

          {/* Amount & schedule tile */}
          <div className="ep-tile ep-tile-pad">
            <div className="ep-section-divider">Amount &amp; schedule</div>

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
          </div>

          {/* Footer tile (spans full width) */}
          <div className="ep-tile ep-footer" style={{ gridColumn: "1 / -1" }}>
            <span className="ep-footer-note"><span style={{ color: "#2563eb" }}>*</span> Required fields</span>
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
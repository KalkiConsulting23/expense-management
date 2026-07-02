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
        <mark style={{ background: "#f3f4f6", color: "#18181b", padding: 0, borderRadius: 2, fontWeight: 600 }}>
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
  const [toast, setToast]                 = useState(null);
  const [success, setSuccess]             = useState(false);

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

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
      showToast("Please fill in all required fields.");
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
        showToast(err.message || "Server error. Please try again.");
        return;
      }

      await response.json();

      // SMART CACHE INVALIDATION
      sessionStorage.removeItem(CACHE_KEY);

      setSuccess(true);
      setTimeout(() => {
        setSuccess(false);
        navigate("/employeetable");
      }, 2800);
    } catch (err) {
      console.error(err);
      showToast("Something went wrong!");
    }
  };

  const handleCancel = () => navigate("/employeetable");

  // ── Live receipt preview values (display only) ──
  const previewAmount = type === "recurring" ? recurringData.amount : oneTimeData.amount;
  const previewAmountNum = Number(previewAmount);
  const previewAmountStr =
    previewAmount && !isNaN(previewAmountNum)
      ? previewAmountNum.toLocaleString("en-IN")
      : null;
  const fmtNiceDate = (val) => {
    if (!val) return null;
    const d = type === "recurring" ? new Date(val) : parseDate(val);
    if (isNaN(d?.getTime?.())) return val;
    return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  };
  const previewStart = type === "recurring" ? fmtNiceDate(recurringData.startDate) : null;
  const previewEnd   = type === "recurring" ? fmtNiceDate(recurringData.endDate) : null;
  const previewDate  = type === "one-time" ? fmtNiceDate(oneTimeData.date) : null;

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        input[type=number]::-webkit-inner-spin-button,
        input[type=number]::-webkit-outer-spin-button { -webkit-appearance: none; }
        input[type=number] { -moz-appearance: textfield; }

        .ep-page {
          min-height: 100vh;
          background:
            radial-gradient(1200px 400px at 100% -10%, rgba(79,70,229,0.05), transparent 60%),
            radial-gradient(900px 360px at -10% 110%, rgba(22,163,74,0.05), transparent 60%),
            #f7f7f8;
          display: flex;
          align-items: flex-start;
          justify-content: center;
          padding: 40px 16px 64px;
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
        }

        /* ── Elevated split card ── */
        .ep-shell {
          width: 100%;
          max-width: 880px;
          background: #ffffff;
          border: 1px solid #ececec;
          border-radius: 20px;
          box-shadow: 0 1px 3px rgba(16,24,40,0.04), 0 18px 50px -28px rgba(16,24,40,0.22);
          overflow: hidden;
        }

        /* Header band with accent rail */
        .ep-band {
          position: relative;
          padding: 26px 28px 24px;
          border-bottom: 1px solid #f1f1f1;
          background: linear-gradient(180deg, #fcfcfd, #ffffff);
        }
        .ep-band::before {
          content: '';
          position: absolute; left: 0; top: 0; bottom: 0; width: 4px;
          background: linear-gradient(180deg, #4f46e5, #16a34a);
        }
        .ep-band-eyebrow { font-size: 11px; font-weight: 600; letter-spacing: 1px; text-transform: uppercase; color: #4f46e5; margin-bottom: 8px; display: flex; align-items: center; gap: 8px; }
        .ep-band-eyebrow::after { content: ''; flex: 0 0 26px; height: 1px; background: #e0e7ff; }
        .ep-band-title { font-size: 25px; font-weight: 600; line-height: 1.15; letter-spacing: -0.5px; color: #18181b; }
        .ep-band-sub { font-size: 13.5px; color: #6b7280; margin-top: 7px; line-height: 1.5; max-width: 460px; }

        /* Body: form (left) + live receipt (right) */
        .ep-body { display: grid; grid-template-columns: 1.45fr 1fr; }
        .ep-form-col { padding: 24px 26px; border-right: 1px solid #f1f1f1; display: flex; flex-direction: column; gap: 22px; }

        /* Live receipt / ledger stub */
        .ep-receipt {
          background:
            linear-gradient(180deg, #fbfbfc, #fafafa);
          padding: 24px 22px;
          display: flex; flex-direction: column;
          position: relative;
        }
        .ep-receipt::after {
          content: '';
          position: absolute; left: 0; right: 0; bottom: 0; height: 14px;
          background:
            radial-gradient(8px 10px at 10px -2px, transparent 6px, #ffffff 6.5px) repeat-x;
          background-size: 20px 14px;
        }
        .ep-rc-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 4px; }
        .ep-rc-tag { font-size: 10px; font-weight: 600; letter-spacing: 0.8px; text-transform: uppercase; color: #9ca3af; }
        .ep-rc-pill { font-size: 10px; font-weight: 600; padding: 3px 9px; border-radius: 99px; letter-spacing: 0.3px; }
        .ep-rc-pill.recurring { background: #eef2ff; color: #4338ca; border: 1px solid #e0e7ff; }
        .ep-rc-pill.onetime { background: #fffbeb; color: #b45309; border: 1px solid #fde68a; }
        .ep-rc-amount { font-size: 34px; font-weight: 700; color: #18181b; letter-spacing: -1px; font-variant-numeric: tabular-nums; margin: 14px 0 2px; line-height: 1; }
        .ep-rc-amount .cur { font-size: 20px; color: #9ca3af; font-weight: 600; margin-right: 3px; vertical-align: 4px; }
        .ep-rc-amount.empty { color: #d1d5db; }
        .ep-rc-name { font-size: 13.5px; font-weight: 600; color: #374151; min-height: 18px; }
        .ep-rc-name.empty { color: #cbd5e1; font-weight: 500; }
        .ep-rc-type { font-size: 11.5px; color: #9ca3af; margin-top: 2px; min-height: 16px; }

        .ep-rc-rule { height: 1px; background: repeating-linear-gradient(90deg, #e5e7eb 0 6px, transparent 6px 12px); margin: 18px 0 14px; }

        .ep-rc-row { display: flex; align-items: center; justify-content: space-between; padding: 7px 0; font-size: 12px; }
        .ep-rc-row .k { color: #9ca3af; }
        .ep-rc-row .v { color: #374151; font-weight: 500; font-variant-numeric: tabular-nums; }
        .ep-rc-row .v.muted { color: #cbd5e1; font-weight: 400; }

        .ep-rc-foot { margin-top: auto; padding-top: 18px; font-size: 10.5px; color: #b0b0b5; display: flex; align-items: center; gap: 6px; }
        .ep-rc-foot .dot { width: 5px; height: 5px; border-radius: 50%; background: #16a34a; box-shadow: 0 0 0 3px rgba(22,163,74,0.12); }

        /* Tile headers/body (kept for section dividers/fields) */
        .ep-section-divider { font-size: 12px; font-weight: 600; color: #6b7280; display: flex; align-items: center; gap: 10px; margin-bottom: 16px; margin-top: 0; }
        .ep-section-divider::after { content: ''; flex: 1; height: 1px; background: #f1f1f1; }

        .ep-field { display: flex; flex-direction: column; margin-bottom: 16px; }
        .ep-field:last-child { margin-bottom: 0; }
        .ep-label { font-size: 12px; font-weight: 500; color: #4b5563; letter-spacing: 0.2px; margin-bottom: 7px; }
        .ep-required { color: #dc2626; margin-left: 2px; }
        .ep-input { width: 100%; padding: 11px 14px; border-radius: 10px; border: 1px solid #ececec; background: #fafafa; color: #18181b; font-size: 14px; font-family: 'Inter', sans-serif; outline: none; transition: border-color 0.18s, background 0.18s, box-shadow 0.18s; }
        .ep-input::placeholder { color: #b0b0b5; }
        .ep-input:focus { border-color: #18181b; background: #fff; box-shadow: 0 0 0 3px rgba(24,24,27,0.06); }
        .ep-input:hover:not(:focus) { border-color: #d1d5db; }
        .ep-input.err { border-color: #dc2626; background: #fef2f2; }
        .ep-input.has-prefix { padding-left: 28px; }
        .ep-hint { font-size: 11.5px; color: #9ca3af; margin-top: 5px; }
        .ep-err  { font-size: 11.5px; color: #dc2626; font-weight: 500; margin-top: 5px; }
        .ep-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
        .ep-prefix-wrap { position: relative; display: flex; align-items: center; }
        .ep-prefix { position: absolute; left: 13px; font-size: 14px; color: #9ca3af; pointer-events: none; z-index: 1; }
        .ep-tab-row { display: flex; border: 1px solid #ececec; border-radius: 10px; background: #f3f4f6; overflow: hidden; margin-bottom: 18px; padding: 3px; gap: 3px; }
        .ep-tab { flex: 1; padding: 9px 0; border: none; background: transparent; cursor: pointer; font-size: 12.5px; font-weight: 500; color: #6b7280; font-family: 'Inter', sans-serif; transition: all 0.15s; border-radius: 7px; }
        .ep-tab:hover { color: #18181b; }
        .ep-tab.active { color: #18181b; background: #ffffff; font-weight: 600; box-shadow: 0 1px 2px rgba(16,24,40,0.06); }

        .ep-footer { display: flex; justify-content: space-between; align-items: center; padding: 18px 26px; border-top: 1px solid #f1f1f1; background: #fcfcfd; }
        .ep-footer-note { font-size: 12px; color: #9ca3af; }
        .ep-btn-group { display: flex; gap: 8px; }
        .ep-btn-cancel { padding: 10px 20px; border-radius: 10px; border: 1px solid #ececec; background: #fff; font-family: 'Inter', sans-serif; font-size: 13px; font-weight: 500; color: #4b5563; cursor: pointer; transition: all 0.15s; }
        .ep-btn-cancel:hover { background: #f7f7f8; color: #18181b; border-color: #d1d5db; }
        .ep-btn-submit { display: flex; align-items: center; gap: 7px; padding: 10px 22px; border-radius: 10px; border: none; background: #18181b; font-family: 'Inter', sans-serif; font-size: 13px; font-weight: 500; color: #fff; cursor: pointer; transition: background 0.15s, transform 0.1s; }
        .ep-btn-submit:hover { background: #000; transform: translateY(-1px); }
        .ep-btn-submit:active { transform: translateY(0); }

        /* ── Autocomplete dropdown ── */
        .ep-autocomplete-list {
          position: absolute;
          top: calc(100% + 6px);
          left: 0; right: 0;
          background: #ffffff;
          border: 1px solid #ececec;
          border-radius: 12px;
          box-shadow: 0 6px 24px rgba(16,24,40,0.10);
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
          color: #4b5563;
          border-radius: 8px;
          cursor: pointer;
          transition: background 0.12s;
          font-family: 'Inter', sans-serif;
        }
        .ep-autocomplete-item:hover,
        .ep-autocomplete-item.active {
          background: #f7f7f8;
          color: #18181b;
        }
        .ep-ac-icon { font-size: 12px; flex-shrink: 0; opacity: 0.7; }

        /* ── Error toast (bottom-right) ── */
        .ep-toast { position: fixed; bottom: 28px; right: 28px; padding: 13px 18px; border-radius: 12px; font-family: 'Inter', sans-serif; font-size: 13px; font-weight: 500; display: flex; align-items: center; gap: 10px; z-index: 9999; box-shadow: 0 8px 28px rgba(16,24,40,0.16); animation: toastIn 0.28s cubic-bezier(0.18,0.89,0.32,1.28); max-width: 340px; background: #ffffff; color: #dc2626; border: 1px solid #fecaca; }
        .ep-toast-ic { width: 22px; height: 22px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 700; color: #fff; flex-shrink: 0; background: #ef4444; }
        @keyframes toastIn { from { opacity: 0; transform: translateY(16px) scale(0.96); } to { opacity: 1; transform: translateY(0) scale(1); } }

        /* ── Full-screen success overlay ── */
        .ep-overlay {
          position: fixed; inset: 0; z-index: 10000;
          display: flex; align-items: center; justify-content: center;
          background: rgba(247,247,248,0.72);
          backdrop-filter: blur(10px) saturate(1.1);
          -webkit-backdrop-filter: blur(10px) saturate(1.1);
          animation: ovFade 0.4s ease forwards;
          font-family: 'Inter', sans-serif;
        }
        @keyframes ovFade { from { opacity: 0; } to { opacity: 1; } }

        .ep-ov-panel {
          position: relative;
          width: 100%; max-width: 380px; margin: 0 20px;
          background: rgba(255,255,255,0.85);
          border: 1px solid rgba(255,255,255,0.9);
          border-radius: 24px;
          padding: 40px 36px 32px;
          text-align: center;
          box-shadow: 0 24px 80px rgba(16,24,40,0.18), 0 2px 8px rgba(16,24,40,0.06);
          animation: panelIn 0.5s cubic-bezier(0.18,0.89,0.32,1.28) forwards;
          overflow: hidden;
        }
        @keyframes panelIn { from { opacity: 0; transform: translateY(18px) scale(0.95); } to { opacity: 1; transform: translateY(0) scale(1); } }

        .ep-ov-glow {
          position: absolute; top: -40px; left: 50%; transform: translateX(-50%);
          width: 260px; height: 260px; border-radius: 50%;
          background: radial-gradient(circle, rgba(34,197,94,0.16) 0%, rgba(34,197,94,0) 70%);
          pointer-events: none;
        }

        .ep-ov-check { position: relative; width: 76px; height: 76px; margin: 0 auto 22px; }
        .ep-ov-check > svg { width: 100%; height: 100%; transform: rotate(-90deg); }
        .ep-ov-ring {
          fill: none; stroke: #22c55e; stroke-width: 4; stroke-linecap: round;
          stroke-dasharray: 226; stroke-dashoffset: 226;
          animation: ringDraw 0.7s ease forwards 0.15s;
        }
        @keyframes ringDraw { to { stroke-dashoffset: 0; } }
        .ep-ov-disc {
          position: absolute; inset: 12px; border-radius: 50%;
          background: linear-gradient(135deg, #22c55e, #16a34a);
          display: flex; align-items: center; justify-content: center;
          transform: scale(0); animation: discPop 0.45s cubic-bezier(0.18,0.89,0.32,1.28) forwards 0.45s;
          box-shadow: 0 6px 18px rgba(34,197,94,0.35);
        }
        @keyframes discPop { from { transform: scale(0); } 60% { transform: scale(1.12); } to { transform: scale(1); } }
        .ep-ov-tick { width: 30px; height: 30px; transform: none !important; }
        .ep-ov-tick path {
          fill: none; stroke: #fff; stroke-width: 3; stroke-linecap: round; stroke-linejoin: round;
          stroke-dasharray: 40; stroke-dashoffset: 40;
          animation: tickDraw 0.4s ease forwards 0.7s;
        }
        @keyframes tickDraw { to { stroke-dashoffset: 0; } }

        .ep-ov-title {
          font-size: 21px; font-weight: 600; color: #18181b; letter-spacing: -0.3px;
          margin-bottom: 7px; opacity: 0; animation: fadeUp 0.45s ease forwards 0.7s;
        }
        .ep-ov-sub {
          font-size: 13.5px; color: #6b7280; line-height: 1.5;
          opacity: 0; animation: fadeUp 0.45s ease forwards 0.82s;
        }
        @keyframes fadeUp { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }

        .ep-ov-progress {
          margin-top: 24px; height: 4px; width: 100%;
          background: #eef0f2; border-radius: 99px; overflow: hidden;
          opacity: 0; animation: fadeUp 0.4s ease forwards 0.95s;
        }
        .ep-ov-bar {
          height: 100%; width: 100%;
          background: linear-gradient(90deg, #22c55e, #16a34a);
          border-radius: 99px;
          transform-origin: left;
          transform: scaleX(0);
          animation: barFill 1.8s linear forwards 1s;
        }
        @keyframes barFill { from { transform: scaleX(0); } to { transform: scaleX(1); } }

        .ep-ov-foot {
          margin-top: 12px; font-size: 11.5px; color: #9ca3af;
          display: flex; align-items: center; justify-content: center; gap: 6px;
          opacity: 0; animation: fadeUp 0.4s ease forwards 1s;
        }
        .ep-ov-dot { width: 5px; height: 5px; border-radius: 50%; background: #22c55e; animation: pulse 1s ease-in-out infinite; }
        @keyframes pulse { 0%,100% { opacity: 0.3; } 50% { opacity: 1; } }

        @media (max-width: 760px) {
          .ep-body { grid-template-columns: 1fr; }
          .ep-form-col { border-right: none; border-bottom: 1px solid #f1f1f1; padding: 20px 18px; }
          .ep-receipt { padding: 20px 18px 26px; }
          .ep-band { padding: 22px 20px 20px; }
          .ep-band-title { font-size: 22px; }
          .ep-footer { padding: 16px 18px; }
          .ep-grid { grid-template-columns: 1fr; }
          .ep-toast { left: 16px; right: 16px; bottom: 16px; max-width: none; }
        }
      `}</style>

      <div className="ep-page">
        <div className="ep-shell">

          {/* Header band with accent rail */}
          <div className="ep-band">
            <div className="ep-band-eyebrow">Expense Entry</div>
            <div className="ep-band-title">Add New Expense</div>
            <div className="ep-band-sub">Fill in the details to register a recurring or one-time expense record. Your entry previews on the right as you type.</div>
          </div>

          {/* Body: form (left) + live receipt (right) */}
          <div className="ep-body">

            {/* ── Form column ── */}
            <div className="ep-form-col">

              {/* Expense details */}
              <div>
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

              {/* Amount & schedule */}
              <div>
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
            </div>

            {/* ── Live receipt / ledger stub ── */}
            <div className="ep-receipt">
              <div className="ep-rc-head">
                <span className="ep-rc-tag">Draft entry</span>
                <span className={`ep-rc-pill ${type === "recurring" ? "recurring" : "onetime"}`}>
                  {type === "recurring" ? "Recurring" : "One-time"}
                </span>
              </div>

              <div className={`ep-rc-amount${previewAmountStr ? "" : " empty"}`}>
                <span className="cur">₹</span>{previewAmountStr || "0"}
              </div>
              <div className={`ep-rc-name${expenseName.trim() ? "" : " empty"}`}>
                {expenseName.trim() || "Expense name"}
              </div>
              <div className="ep-rc-type">
                {expenseType.trim() || "Category"}
              </div>

              <div className="ep-rc-rule" />
              
              {type === "recurring" ? (
                <>
                  <div className="ep-rc-row">
                    <span className="k">Frequency</span>
                    <span className="v">Every month</span>
                  </div>
                  <div className="ep-rc-row">
                    <span className="k">Starts</span>
                    <span className={`v${previewStart ? "" : " muted"}`}>{previewStart || "—"}</span>
                  </div>
                  <div className="ep-rc-row">
                    <span className="k">Ends</span>
                    <span className={`v${previewEnd ? "" : " muted"}`}>{previewEnd || "Ongoing"}</span>
                  </div>
                </>
              ) : (
                <>
                  <div className="ep-rc-row">
                    <span className="k">Type</span>
                    <span className="v">Single payment</span>
                  </div>
                  <div className="ep-rc-row">
                    <span className="k">Date</span>
                    <span className={`v${previewDate ? "" : " muted"}`}>{previewDate || "—"}</span>
                  </div>
                </>
              )}

              <div className="ep-rc-foot">
                <span className="dot" /> Live preview · saved on submit
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="ep-footer">
            <span className="ep-footer-note"><span style={{ color: "#dc2626" }}>*</span> Required fields</span>
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

      {/* Error toast (bottom-right) */}
      {toast && (
        <div className="ep-toast">
          <span className="ep-toast-ic">!</span>
          {toast}
        </div>
      )}

      {/* Full-screen success overlay */}
      {success && (
        <div className="ep-overlay">
          <div className="ep-ov-panel">
            <div className="ep-ov-glow" />
            <div className="ep-ov-check">
              <svg viewBox="0 0 80 80">
                <circle className="ep-ov-ring" cx="40" cy="40" r="36" />
              </svg>
              <div className="ep-ov-disc">
                <svg className="ep-ov-tick" viewBox="0 0 24 24">
                  <path d="M5 12.5l4.5 4.5L19 7.5" />
                </svg>
              </div>
            </div>
            <div className="ep-ov-title">Expense added</div>
            <div className="ep-ov-sub">Your expense record has been saved successfully.</div>
            <div className="ep-ov-progress"><div className="ep-ov-bar" /></div>
            <div className="ep-ov-foot">
              <span className="ep-ov-dot" /> Redirecting to expenses&hellip;
            </div>
          </div>
        </div>
      )}
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
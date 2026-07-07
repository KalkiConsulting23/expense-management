import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";

// Fallback FX rates to INR — used only if the live API is unreachable
const FALLBACK_FX = {
  INR: 1,
  USD: 83.5,
  EUR: 90.2,
  GBP: 106.4,
  AED: 22.7,
  SGD: 62.1,
};

const CURRENCY_SYMBOLS = {
  INR: "₹", USD: "$", EUR: "€", GBP: "£", AED: "د.إ", SGD: "S$",
};

// Domestic projects bill only in INR; international can pick any of these
const INTL_CURRENCIES = [
  { value: "USD", symbol: "$",   label: "USD" },
  { value: "EUR", symbol: "€",   label: "EUR" },
  { value: "GBP", symbol: "£",   label: "GBP" },
  { value: "AED", symbol: "د.إ", label: "AED" },
  { value: "SGD", symbol: "S$",  label: "SGD" },
];

const API_BASE = import.meta.env.VITE_API_BASE;
const GST_RATE = 0.18;
const PROJECT_CACHE_KEY = 'local_project_data_cache';
const FX_API = "https://open.er-api.com/v6/latest/INR"; // free, no key

const typeConfig = {
  hourly:  { icon: "⏱", label: "Hourly" },
  daily:   { icon: "☀️", label: "Daily" },
  monthly: { icon: "📅", label: "Monthly" },
};

// Shared blank-form shape so every reset stays consistent
const BLANK_FORM = {
  projectScope: "domestic",
  projectName: "", projectType: "", currency: "INR",
  startDate: "", endDate: "", expectedAmount: "",
  defaultHourlyRate: "", defaultDailyRate: "",
  daysCycle: "30",
  includeGst: false,
};

// Preview helper: how many months forward this cycle pushes earned income
const monthsForwardPreview = (cycle) => {
  const c = Number(cycle);
  if (!c || c <= 15) return 0;
  return Math.floor(c / 30);
};

const AddProject = () => {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({ ...BLANK_FORM });
  const [errors, setErrors]   = useState({});
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  const [toast, setToast]     = useState(null);

  const showToast = (type, msg) => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 3500);
  };

  // Live FX state — starts on fallback, replaced by API result
  const [fxRates, setFxRates]   = useState(FALLBACK_FX);
  const [fxStatus, setFxStatus] = useState("loading"); // loading | live | fallback
  const [fxUpdated, setFxUpdated] = useState(null);

  const isIntl = formData.projectScope === "international";

  // Fetch live rates once on mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(FX_API);
        if (!res.ok) throw new Error("bad status");
        const data = await res.json();
        // API gives 1 INR -> X foreign. We need foreign -> INR, so invert.
        const r = data.rates || {};
        const toINR = { INR: 1 };
        ["USD", "EUR", "GBP", "AED", "SGD"].forEach((c) => {
          if (r[c]) toINR[c] = 1 / r[c];
        });
        if (!cancelled) {
          setFxRates({ ...FALLBACK_FX, ...toINR });
          setFxStatus("live");
          setFxUpdated(data.time_last_update_utc || null);
        }
      } catch (err) {
        if (!cancelled) setFxStatus("fallback");
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((p) => ({ ...p, [name]: value }));
    if (errors[name]) setErrors((p) => ({ ...p, [name]: undefined }));
  };

  // Switching scope resets money fields to avoid stale GST/currency state
  const handleScopeChange = (scope) => {
    setFormData((p) => ({
      ...p,
      projectScope: scope,
      currency: scope === "international" ? "USD" : "INR",
      includeGst: false,
      expectedAmount: "",
      defaultHourlyRate: "",
      defaultDailyRate: "",
    }));
  };

  const handleTypeChange = (type) => {
    setFormData((p) => ({
      ...p,
      projectType: type,
      expectedAmount: "",
      defaultHourlyRate: "",
      defaultDailyRate: "",
      currency: isIntl ? (p.currency || "USD") : "INR",
      includeGst: false,
    }));
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
    if (!formData.daysCycle || Number(formData.daysCycle) <= 0) {
      e.daysCycle = "Enter a valid days cycle";
    }
    if (formData.projectType === "monthly") {
      if (!formData.expectedAmount || Number(formData.expectedAmount) <= 0) {
        e.expectedAmount = "Expected amount is required";
      }
    }
    if (formData.projectType === "hourly") {
      if (!formData.defaultHourlyRate || Number(formData.defaultHourlyRate) <= 0) {
        e.defaultHourlyRate = "Hourly rate is required";
      }
    }
    if (formData.projectType === "daily") {
      if (!formData.defaultDailyRate || Number(formData.defaultDailyRate) <= 0) {
        e.defaultDailyRate = "Daily rate is required";
      }
    }
    return e;
  };

  const handleSubmit = async () => {
    const errs = validate();
    if (Object.keys(errs).length) {
      setErrors(errs);
      showToast('error', 'Please fix the highlighted fields.');
      return;
    }

    const fx = fxRates[formData.currency] || 1;
    // GST is already folded into the field value when the toggle is on,
    // so we only apply the currency conversion here.
    let finalAmountINR = 0;
    let hourlyINR = 0;
    let dailyINR = 0;

    if (formData.projectType === "monthly") {
      finalAmountINR = Number(formData.expectedAmount) * fx;
    } else if (formData.projectType === "hourly") {
      hourlyINR = Number(formData.defaultHourlyRate) * fx;
    } else if (formData.projectType === "daily") {
      dailyINR = Number(formData.defaultDailyRate) * fx;
    }

    const payload = {
      projectScope:      formData.projectScope,
      projectName:       formData.projectName.trim(),
      projectType:       formData.projectType,
      expectedAmount:    finalAmountINR,
      defaultHourlyRate: hourlyINR,
      defaultDailyRate:  dailyINR,
      currency:          formData.currency,
      startDate:         formData.startDate,
      endDate:           formData.endDate,
      daysCycle:         Number(formData.daysCycle),
    };

    setLoading(true);
    try {
      // Replaced old custom apiFetch hook layer with clean native fetch code
       const res = await fetch(`${API_BASE}/project/add`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const errData = await res.json();
        showToast('error', errData.message || 'Server error. Please try again.');
        return;
      }
      await res.json();

      // SMART CACHE INVALIDATION
      sessionStorage.removeItem(PROJECT_CACHE_KEY);

      setSuccess(true);
      setFormData({ ...BLANK_FORM });
      setErrors({});
      setTimeout(() => {
        setSuccess(false);
        navigate("/projecttable");
      }, 2800);
    } catch (err) {
      showToast('error', 'Network error — is the server running?');
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    setFormData({ ...BLANK_FORM });
    setErrors({});
    setSuccess(false);
    navigate("/projecttable");
  };

  const sym = CURRENCY_SYMBOLS[formData.currency] || "₹";

  // Active rate field key/value for hourly & daily
  const rateField = formData.projectType === "hourly" ? "defaultHourlyRate" : "defaultDailyRate";
  const rateValue = formData.projectType === "hourly" ? formData.defaultHourlyRate : formData.defaultDailyRate;
  const rateLabel = formData.projectType === "hourly" ? "Default Hourly Rate" : "Default Daily Rate";

  // Base value for the currently active money field
  const baseVal =
    formData.projectType === "monthly" ? formData.expectedAmount : rateValue;
  const unit = formData.projectType === "hourly" ? " / hr" : formData.projectType === "daily" ? " / day" : "";
  const gstTotal = Number(baseVal) * (1 + GST_RATE);
  const fmt = (n) => n.toLocaleString("en-IN", { maximumFractionDigits: 2 });
  const inrFmt = (n) => n.toLocaleString("en-IN", { maximumFractionDigits: 0 });

  const curRate = fxRates[formData.currency] || 1;

  const fwd = monthsForwardPreview(formData.daysCycle);

  // ─── Domestic: GST toggle ───
  // Ticking GST folds 18% INTO the visible field value; unticking removes it.
  const handleGstToggle = (checked) => {
    setFormData((p) => {
      const field =
        p.projectType === "monthly" ? "expectedAmount"
        : p.projectType === "hourly" ? "defaultHourlyRate"
        : "defaultDailyRate";
      const current = Number(p[field]);
      if (!current || current <= 0) return { ...p, includeGst: checked };
      const next = checked ? current * (1 + GST_RATE) : current / (1 + GST_RATE);
      // round to 2dp, trim trailing zeros
      const rounded = Math.round(next * 100) / 100;
      return { ...p, includeGst: checked, [field]: String(rounded) };
    });
  };

  const GstToggle = () =>
    Number(baseVal) > 0 ? (
      <div className="ap-gst-wrap">
        <label className="ap-gst-row">
          <input
            type="checkbox"
            name="includeGst"
            checked={formData.includeGst}
            onChange={(e) => handleGstToggle(e.target.checked)}
            style={{ display: "none" }}
          />
          <span className={`ap-gst-box${formData.includeGst ? " checked" : ""}`}>
            {formData.includeGst && "✓"}
          </span>
          <span className="ap-gst-label">Include GST (18%)</span>
        </label>
        {formData.includeGst && (
          <div className="ap-gst-hint">
            ✓ 18% GST included — <strong>₹{fmt(Number(baseVal))}{unit}</strong> is GST-inclusive
          </div>
        )}
      </div>
    ) : null;

  // ─── International: currency picker with live FX ───
  const CurrencyPicker = () => (
    <div className="ap-field">
      <div className="ap-label">
        Billing Currency <span className="ap-required">*</span>
        <span className={`ap-fx-badge ap-fx-${fxStatus}`}>
          {fxStatus === "live" ? "● Live rates" : fxStatus === "loading" ? "○ Loading rates…" : "○ Offline rates"}
        </span>
      </div>
      <div className="ap-cur-group">
        {INTL_CURRENCIES.map((c) => (
          <button
            key={c.value}
            className={`ap-cur-btn${formData.currency === c.value ? " active" : ""}`}
            onClick={() => setFormData((p) => ({ ...p, currency: c.value }))}
            type="button"
          >
            <strong>{c.symbol}</strong> {c.label}
          </button>
        ))}
      </div>
      {Number(baseVal) > 0 && (
        <div className="ap-usd-hint">
          {sym}{fmt(Number(baseVal))} → ≈ ₹{inrFmt(Number(baseVal) * curRate)} will be saved{unit}
          <span className="ap-fx-note"> (1 {formData.currency} = ₹{curRate.toFixed(2)})</span>
        </div>
      )}
    </div>
  );

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        input[type=number]::-webkit-inner-spin-button, input[type=number]::-webkit-outer-spin-button { -webkit-appearance: none; }
        input[type=number] { -moz-appearance: textfield; }
        .ap-page { min-height: 100vh; background: #f7f7f8; display: flex; align-items: flex-start; justify-content: center; padding: 32px 16px 60px; font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif; }
        .ap-card { width: 100%; max-width: 560px; background: #ffffff; border: 1px solid #ececec; border-radius: 16px; padding: 32px 36px; box-shadow: 0 1px 3px rgba(16,24,40,0.04); }
        .ap-eyebrow { font-size: 11px; font-weight: 500; letter-spacing: 0.4px; text-transform: uppercase; color: #9ca3af; margin-bottom: 6px; }
        .ap-heading { font-size: 26px; font-weight: 600; color: #18181b; margin: 0 0 4px; line-height: 1.2; letter-spacing: -0.4px; }
        .ap-sub { font-size: 13.5px; color: #6b7280; margin-bottom: 24px; }
        .ap-divider-top { height: 1px; background: #f1f1f1; margin-bottom: 24px; }
        .ap-label { font-size: 12px; font-weight: 500; color: #4b5563; letter-spacing: 0.2px; margin-bottom: 7px; display: flex; align-items: center; gap: 8px; }
        .ap-required { color: #dc2626; }
        .ap-fx-badge { font-size: 10px; font-weight: 600; letter-spacing: 0.3px; padding: 2px 8px; border-radius: 20px; text-transform: none; }
        .ap-fx-live { color: #16834a; background: #f0fdf4; }
        .ap-fx-loading { color: #6b7280; background: #f3f4f6; }
        .ap-fx-fallback { color: #b45309; background: #fffbeb; }
        .ap-input { width: 100%; padding: 11px 14px; border-radius: 10px; border: 1px solid #ececec; background: #fafafa; color: #18181b; font-size: 14px; font-family: 'Inter', sans-serif; outline: none; transition: border-color 0.18s, background 0.18s, box-shadow 0.18s; }
        .ap-input::placeholder { color: #b0b0b5; }
        .ap-input:focus { border-color: #18181b; background: #fff; box-shadow: 0 0 0 3px rgba(24,24,27,0.06); }
        .ap-input.err { border-color: #dc2626; background: #fef2f2; }
        .ap-input.has-prefix { padding-left: 34px; }
        .ap-prefix-wrap { position: relative; display: flex; align-items: center; }
        .ap-prefix { position: absolute; left: 13px; font-size: 14px; color: #9ca3af; pointer-events: none; z-index: 1; }
        .ap-suffix { position: absolute; right: 13px; font-size: 12.5px; color: #9ca3af; pointer-events: none; }
        .ap-date-row { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
        .ap-field { display: flex; flex-direction: column; }
        .ap-err { font-size: 11.5px; color: #dc2626; font-weight: 500; margin-top: 5px; }
        .ap-type-group { display: flex; gap: 10px; flex-wrap: wrap; }
        .ap-type-btn { display: flex; align-items: center; gap: 6px; padding: 10px 16px; border-radius: 10px; border: 1px solid #ececec; background: #fafafa; color: #6b7280; font-size: 12.5px; font-weight: 500; cursor: pointer; font-family: 'Inter', sans-serif; transition: all 0.18s; user-select: none; }
        .ap-type-btn:hover { border-color: #d1d5db; color: #18181b; }
        .ap-type-btn.active { border-color: #18181b; background: #f3f4f6; color: #18181b; }
        .ap-cur-group { display: flex; gap: 10px; flex-wrap: wrap; }
        .ap-cur-btn { display: flex; align-items: center; gap: 5px; padding: 9px 16px; border-radius: 10px; border: 1px solid #ececec; background: #fafafa; color: #6b7280; font-size: 13px; cursor: pointer; font-family: 'Inter', sans-serif; transition: all 0.18s; }
        .ap-cur-btn:hover { border-color: #d1d5db; color: #18181b; }
        .ap-cur-btn.active { border-color: #18181b; background: #f3f4f6; color: #18181b; font-weight: 500; }
        .ap-scope-group { display: flex; gap: 10px; }
        .ap-scope-btn { display: flex; align-items: center; gap: 8px; padding: 11px 20px; border-radius: 10px; border: 1px solid #ececec; background: #fafafa; color: #6b7280; font-size: 13px; font-weight: 500; cursor: pointer; font-family: 'Inter', sans-serif; transition: all 0.18s; user-select: none; }
        .ap-scope-btn:hover { border-color: #d1d5db; color: #18181b; }
        .ap-scope-btn.active { border-color: #18181b; background: #f3f4f6; color: #18181b; }
        .ap-radio-dot { width: 15px; height: 15px; border-radius: 50%; border: 2px solid #d1d5db; flex-shrink: 0; position: relative; transition: all 0.18s; }
        .ap-scope-btn.active .ap-radio-dot { border-color: #18181b; }
        .ap-scope-btn.active .ap-radio-dot::after { content: ''; position: absolute; inset: 2px; border-radius: 50%; background: #18181b; }
        .ap-gst-wrap { display: flex; flex-direction: column; gap: 8px; margin-top: 2px; }
        .ap-gst-row { display: inline-flex; align-items: center; gap: 9px; cursor: pointer; user-select: none; width: fit-content; }
        .ap-gst-box { width: 18px; height: 18px; border-radius: 6px; border: 1px solid #d1d5db; background: #fafafa; display: flex; align-items: center; justify-content: center; font-size: 11px; color: #fff; font-weight: 700; transition: all 0.16s; flex-shrink: 0; }
        .ap-gst-box.checked { background: #18181b; border-color: #18181b; }
        .ap-gst-label { font-size: 13px; font-weight: 500; color: #4b5563; }
        .ap-gst-hint { font-size: 12px; color: #6b7280; background: #fafafa; padding: 9px 13px; border-radius: 10px; border: 1px dashed #d1d5db; line-height: 1.5; }
        .ap-gst-hint strong { color: #18181b; }
        .ap-cycle-hint { font-size: 12px; color: #6b7280; background: #fafafa; padding: 9px 13px; border-radius: 10px; border: 1px dashed #d1d5db; line-height: 1.5; margin-top: 7px; }
        .ap-cycle-hint strong { color: #18181b; }
        .ap-section-label { font-size: 12px; font-weight: 600; color: #6b7280; display: flex; align-items: center; gap: 10px; margin: 4px 0; }
        .ap-section-label::after { content: ''; flex: 1; height: 1px; background: #f1f1f1; }
        .ap-info-box { font-size: 12px; color: #6b7280; background: #fafafa; padding: 12px 15px; border-radius: 10px; border: 1px dashed #d1d5db; line-height: 1.6; }
        @keyframes slideDown { from { opacity: 0; transform: translateY(-8px); } to { opacity: 1; transform: translateY(0); } }
        .ap-usd-hint { font-size: 11.5px; color: #6b7280; font-weight: 500; margin-top: 7px; line-height: 1.5; }
        .ap-fx-note { color: #9ca3af; font-weight: 400; }
        .ap-actions { display: flex; justify-content: space-between; align-items: center; margin-top: 24px; padding-top: 20px; border-top: 1px solid #f1f1f1; }
        .ap-required-note { font-size: 12px; color: #9ca3af; }
        .ap-btn-cancel { padding: 11px 22px; border-radius: 10px; border: 1px solid #ececec; background: #fff; font-family: 'Inter', sans-serif; font-size: 13px; font-weight: 500; color: #4b5563; cursor: pointer; transition: all 0.15s; }
        .ap-btn-cancel:hover { background: #f7f7f8; color: #18181b; border-color: #d1d5db; }
        .ap-btn-submit { display: flex; align-items: center; gap: 8px; padding: 11px 24px; border-radius: 10px; border: none; background: #18181b; font-family: 'Inter', sans-serif; font-size: 13px; font-weight: 500; color: #fff; cursor: pointer; transition: background 0.15s, transform 0.1s; }
        .ap-btn-submit:hover:not(:disabled) { background: #000; transform: translateY(-1px); }
        .ap-btn-submit:active:not(:disabled) { transform: translateY(0); }
        .ap-btn-submit:disabled { opacity: 0.55; cursor: not-allowed; transform: none; }
        .ap-spinner { width: 13px; height: 13px; border: 2px solid rgba(255,255,255,0.35); border-top-color: #fff; border-radius: 50%; display: inline-block; animation: spin 0.7s linear infinite; }
        @keyframes spin { to { transform: rotate(360deg); } }

        /* ── Interactive polish ── */
        .ap-type-btn:active, .ap-cur-btn:active, .ap-scope-btn:active { transform: scale(0.97); }
        .ap-type-btn.active, .ap-cur-btn.active, .ap-scope-btn.active { box-shadow: 0 0 0 3px rgba(24,24,27,0.05); }
        .ap-input:hover:not(:focus) { border-color: #d1d5db; }
        .ap-gst-box:active { transform: scale(0.9); }
        @keyframes pop { 0% { transform: scale(0); } 60% { transform: scale(1.25); } 100% { transform: scale(1); } }
        .ap-gst-box.checked { animation: pop 0.22s ease; }

        /* ── Toast (errors — bottom right) ── */
        .ap-toast { position: fixed; bottom: 28px; right: 28px; padding: 13px 18px; border-radius: 12px; font-family: 'Inter', sans-serif; font-size: 13px; font-weight: 500; display: flex; align-items: center; gap: 10px; z-index: 9999; box-shadow: 0 8px 28px rgba(16,24,40,0.16); animation: toastIn 0.28s cubic-bezier(0.18,0.89,0.32,1.28); max-width: 340px; }
        .ap-toast.error   { background: #ffffff; color: #dc2626; border: 1px solid #fecaca; }
        .ap-toast-ic { width: 22px; height: 22px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 700; color: #fff; flex-shrink: 0; background: #ef4444; }
        @keyframes toastIn { from { opacity: 0; transform: translateY(16px) scale(0.96); } to { opacity: 1; transform: translateY(0) scale(1); } }

        /* ── Full-screen success overlay ── */
        .ap-overlay {
          position: fixed; inset: 0; z-index: 10000;
          display: flex; align-items: center; justify-content: center;
          background: rgba(247,247,248,0.72);
          backdrop-filter: blur(10px) saturate(1.1);
          -webkit-backdrop-filter: blur(10px) saturate(1.1);
          animation: ovFade 0.4s ease forwards;
          font-family: 'Inter', sans-serif;
        }
        @keyframes ovFade { from { opacity: 0; } to { opacity: 1; } }

        .ap-ov-panel {
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

        /* soft radial glow behind the tick */
        .ap-ov-glow {
          position: absolute; top: -40px; left: 50%; transform: translateX(-50%);
          width: 260px; height: 260px; border-radius: 50%;
          background: radial-gradient(circle, rgba(34,197,94,0.16) 0%, rgba(34,197,94,0) 70%);
          pointer-events: none;
        }

        /* check badge */
        .ap-ov-check { position: relative; width: 76px; height: 76px; margin: 0 auto 22px; }
        .ap-ov-check > svg { width: 100%; height: 100%; transform: rotate(-90deg); }
        .ap-ov-ring {
          fill: none; stroke: #22c55e; stroke-width: 4; stroke-linecap: round;
          stroke-dasharray: 226; stroke-dashoffset: 226;
          animation: ringDraw 0.7s ease forwards 0.15s;
        }
        @keyframes ringDraw { to { stroke-dashoffset: 0; } }
        .ap-ov-disc {
          position: absolute; inset: 12px; border-radius: 50%;
          background: linear-gradient(135deg, #22c55e, #16a34a);
          display: flex; align-items: center; justify-content: center;
          transform: scale(0); animation: discPop 0.45s cubic-bezier(0.18,0.89,0.32,1.28) forwards 0.45s;
          box-shadow: 0 6px 18px rgba(34,197,94,0.35);
        }
        @keyframes discPop { from { transform: scale(0); } 60% { transform: scale(1.12); } to { transform: scale(1); } }
        .ap-ov-tick { width: 30px; height: 30px; transform: none !important; }
        .ap-ov-tick path {
          fill: none; stroke: #fff; stroke-width: 3; stroke-linecap: round; stroke-linejoin: round;
          stroke-dasharray: 40; stroke-dashoffset: 40;
          animation: tickDraw 0.4s ease forwards 0.7s;
        }
        @keyframes tickDraw { to { stroke-dashoffset: 0; } }

        .ap-ov-title {
          font-size: 21px; font-weight: 600; color: #18181b; letter-spacing: -0.3px;
          margin-bottom: 7px; opacity: 0; animation: fadeUp 0.45s ease forwards 0.7s;
        }
        .ap-ov-sub {
          font-size: 13.5px; color: #6b7280; line-height: 1.5;
          opacity: 0; animation: fadeUp 0.45s ease forwards 0.82s;
        }
        @keyframes fadeUp { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }

        /* redirect progress bar */
        .ap-ov-progress {
          margin-top: 24px; height: 4px; width: 100%;
          background: #eef0f2; border-radius: 99px; overflow: hidden;
          opacity: 0; animation: fadeUp 0.4s ease forwards 0.95s;
        }
        .ap-ov-bar {
          height: 100%; width: 100%;
          background: linear-gradient(90deg, #22c55e, #16a34a);
          border-radius: 99px;
          transform-origin: left;
          transform: scaleX(0);
          animation: barFill 1.8s linear forwards 1s;
        }
        @keyframes barFill { from { transform: scaleX(0); } to { transform: scaleX(1); } }

        .ap-ov-foot {
          margin-top: 12px; font-size: 11.5px; color: #9ca3af;
          display: flex; align-items: center; justify-content: center; gap: 6px;
          opacity: 0; animation: fadeUp 0.4s ease forwards 1s;
        }
        .ap-ov-dot { width: 5px; height: 5px; border-radius: 50%; background: #22c55e; animation: pulse 1s ease-in-out infinite; }
        @keyframes pulse { 0%,100% { opacity: 0.3; } 50% { opacity: 1; } }

        @media (max-width: 520px) { .ap-card { padding: 24px 18px; } .ap-date-row { grid-template-columns: 1fr; } .ap-type-group { flex-direction: column; } .ap-toast { left: 16px; right: 16px; bottom: 16px; max-width: none; } }
      `}</style>

      <div className="ap-page">
        <div className="ap-card">
          <div className="ap-eyebrow">Project Setup</div>
          <div className="ap-heading">Add New Project</div>
          <div className="ap-sub">Fill in the details below to initialise this project</div>
          <div className="ap-divider-top" />

          <div className="ap-field" style={{ marginBottom: 20 }}>
            <div className="ap-label">Project Scope <span className="ap-required">*</span></div>
            <div className="ap-scope-group">
              {[
                { value: "domestic", icon: "🏠", label: "Domestic" },
                { value: "international", icon: "🌍", label: "International" },
              ].map((s) => (
                <label key={s.value} className={`ap-scope-btn${formData.projectScope === s.value ? " active" : ""}`}>
                  <input
                    type="radio"
                    name="projectScope"
                    value={s.value}
                    checked={formData.projectScope === s.value}
                    onChange={() => handleScopeChange(s.value)}
                    style={{ display: "none" }}
                  />
                  <span className="ap-radio-dot" />
                  {s.icon} {s.label}
                </label>
              ))}
            </div>
          </div>

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
              <div className="ap-label">Payment Days Cycle <span className="ap-required">*</span></div>
              <div className="ap-prefix-wrap">
                <input
                  className={`ap-input${errors.daysCycle ? " err" : ""}`}
                  name="daysCycle"
                  value={formData.daysCycle}
                  onChange={handleChange}
                  placeholder="e.g. 30"
                  type="number"
                  min="1"
                  style={{ paddingRight: 46 }}
                />
                <span className="ap-suffix">days</span>
              </div>
              {errors.daysCycle && <div className="ap-err">⚠ {errors.daysCycle}</div>}
              <div className="ap-cycle-hint">
                {fwd === 0 ? (
                  <>Earned income stays in the <strong>same month</strong> it was worked.</>
                ) : (
                  <>Earned income is forwarded <strong>{fwd} month{fwd > 1 ? "s" : ""}</strong> ahead in the income tracker.</>
                )}
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
                {isIntl && <CurrencyPicker />}
                <div className="ap-field">
                  <div className="ap-label">Expected Amount ({formData.currency}) <span className="ap-required">*</span></div>
                  <div className="ap-prefix-wrap">
                    <span className="ap-prefix">{sym}</span>
                    <input className={`ap-input has-prefix${errors.expectedAmount ? " err" : ""}`} name="expectedAmount" value={formData.expectedAmount} onChange={handleChange} placeholder="0.00" type="number" min="0" />
                  </div>
                  {errors.expectedAmount && <div className="ap-err">⚠ {errors.expectedAmount}</div>}
                </div>
                {!isIntl && <GstToggle />}
              </div>
            )}

            {(formData.projectType === "hourly" || formData.projectType === "daily") && (
              <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
                <div className="ap-section-label">
                  {formData.projectType === "hourly" ? "Hourly Rate Settings" : "Daily Rate Settings"}
                </div>
                {isIntl && <CurrencyPicker />}
                <div className="ap-field">
                  <div className="ap-label">
                    {rateLabel} ({formData.currency}) <span className="ap-required">*</span>
                  </div>
                  <div className="ap-prefix-wrap">
                    <span className="ap-prefix">{sym}</span>
                    <input
                      className={`ap-input has-prefix${errors[rateField] ? " err" : ""}`}
                      name={rateField}
                      value={rateValue}
                      onChange={handleChange}
                      placeholder="0.00"
                      type="number"
                      min="0"
                    />
                  </div>
                  {errors[rateField] && <div className="ap-err">⚠ {errors[rateField]}</div>}
                </div>
                {!isIntl && <GstToggle />}
                <div className="ap-info-box">
                  ℹ️ This is the default rate. Hours/days worked are entered per-month inside the dashboard, where you can also override the rate for any single month.
                </div>
              </div>
            )}
          </div>

          <div className="ap-actions">
            <span className="ap-required-note"><span style={{ color: "#dc2626" }}>*</span> Required fields</span>
            <div style={{ display: "flex", gap: 10 }}>
              <button className="ap-btn-cancel" onClick={handleCancel} type="button">Cancel</button>
              <button className="ap-btn-submit" onClick={handleSubmit} disabled={loading} type="button">
                {loading ? <><span className="ap-spinner" /> Saving...</> : <><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>Add Project</>}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Error toast (bottom-right) */}
      {toast && toast.type === 'error' && (
        <div className={`ap-toast ${toast.type}`}>
          <span className="ap-toast-ic">!</span>
          {toast.msg}
        </div>
      )}

      {/* Full-screen success overlay */}
      {success && (
        <div className="ap-overlay">
          <div className="ap-ov-panel">
            <div className="ap-ov-glow" />
            <div className="ap-ov-check">
              <svg viewBox="0 0 80 80">
                <circle className="ap-ov-ring" cx="40" cy="40" r="36" />
              </svg>
              <div className="ap-ov-disc">
                <svg className="ap-ov-tick" viewBox="0 0 24 24">
                  <path d="M5 12.5l4.5 4.5L19 7.5" />
                </svg>
              </div>
            </div>
            <div className="ap-ov-title">Project added</div>
            <div className="ap-ov-sub">Your project has been saved successfully.</div>
            <div className="ap-ov-progress"><div className="ap-ov-bar" /></div>
            <div className="ap-ov-foot">
              <span className="ap-ov-dot" /> Redirecting to projects…
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default AddProject;
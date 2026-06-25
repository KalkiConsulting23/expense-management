import React, { useEffect, useState, useRef } from "react";

const API_BASE = import.meta.env.VITE_API_BASE;

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const MONTH_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

// Financial year (April -> March). Calendar month indices in FY display order.
const FY_ORDER = [3, 4, 5, 6, 7, 8, 9, 10, 11, 0, 1, 2];

function calYearForFYMonth(fyStartYear, monthIndex) {
  return monthIndex >= 3 ? fyStartYear : fyStartYear + 1;
}

function toFYStartYear(d) {
  return d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1;
}

function fyLabel(fyStartYear) {
  const next = String((fyStartYear + 1) % 100).padStart(2, "0");
  return `FY ${fyStartYear}-${next}`;
}

const fmt = (n) => "\u20B9" + Number(n || 0).toLocaleString("en-IN");

// Parse a date string at UTC midnight, then rebuild it in local time using the
// UTC calendar parts. This prevents a "2026-01-01" value (UTC midnight) from
// rolling back to Dec 31 in a behind-UTC timezone or shifting months elsewhere.
function parseUTCDate(dateStr) {
  if (!dateStr) return new Date(NaN);
  const d = new Date(dateStr);
  return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

const PERIOD_OPTIONS = [
  { key: "all", label: "Full Year", months: FY_ORDER },
  { key: "q1",  label: "Q1", months: [3, 4, 5],    sub: "Apr \u2013 Jun" },
  { key: "q2",  label: "Q2", months: [6, 7, 8],    sub: "Jul \u2013 Sep" },
  { key: "q3",  label: "Q3", months: [9, 10, 11],  sub: "Oct \u2013 Dec" },
  { key: "q4",  label: "Q4", months: [0, 1, 2],    sub: "Jan \u2013 Mar" },
  { key: "h1",  label: "H1", months: [3, 4, 5, 6, 7, 8],    sub: "Apr \u2013 Sep" },
  { key: "h2",  label: "H2", months: [9, 10, 11, 0, 1, 2],  sub: "Oct \u2013 Mar" },
];

function getYearsFromExpenses(expenses) {
  const years = new Set();
  expenses.forEach((exp) => {
    if (exp.type === "recurring") {
      const start = toFYStartYear(parseUTCDate(exp.startDate));
      const end = exp.endDate ? toFYStartYear(parseUTCDate(exp.endDate)) : toFYStartYear(new Date());
      for (let y = start; y <= Math.max(start, end); y++) years.add(y);
    } else if (exp.type === "one-time") {
      years.add(toFYStartYear(parseUTCDate(exp.date)));
    }
  });
  return Array.from(years).sort((a, b) => b - a);
}

function isRecurringActiveInMonth(exp, year, monthIndex) {
  const start = parseUTCDate(exp.startDate);
  const end = exp.endDate ? parseUTCDate(exp.endDate) : null;
  const monthStart = new Date(year, monthIndex, 1);
  const monthEnd = new Date(year, monthIndex + 1, 0);
  if (start > monthEnd) return false;
  if (end && end < monthStart) return false;
  return true;
}

function getOneTimeForMonth(expenses, year, monthIndex) {
  return expenses.filter((exp) => {
    if (exp.type !== "one-time") return false;
    const d = parseUTCDate(exp.date);
    return d.getFullYear() === year && d.getMonth() === monthIndex;
  });
}

function getRecurringForMonth(expenses, year, monthIndex) {
  return expenses.filter(
    (exp) => exp.type === "recurring" && isRecurringActiveInMonth(exp, year, monthIndex)
  );
}

function getMonthTotal(expenses, year, monthIndex) {
  const recurring = getRecurringForMonth(expenses, year, monthIndex);
  const oneTime = getOneTimeForMonth(expenses, year, monthIndex);
  return (
    recurring.reduce((s, e) => s + e.amount, 0) +
    oneTime.reduce((s, e) => s + e.amount, 0)
  );
}

function ExpenseAvatar({ name = "", oneTime = false }) {
  if (oneTime) {
    return (
      <div style={{
        width: 30, height: 30, borderRadius: 8, flexShrink: 0,
        background: "#fffbeb", border: "1.5px solid #fcd34d",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 13,
      }}>{"\u26A1"}</div>
    );
  }
  const palette = ["#4f46e5", "#0891b2", "#7c3aed", "#0d9488", "#2563eb", "#db2777"];
  const color = palette[(name.charCodeAt(0) || 0) % palette.length];
  const initials = name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
  return (
    <div style={{
      width: 30, height: 30, borderRadius: 8, flexShrink: 0,
      background: color + "18", border: `1.5px solid ${color}40`,
      display: "flex", alignItems: "center", justifyContent: "center",
      fontSize: 11, fontWeight: 600, color, letterSpacing: 0.3,
    }}>
      {initials}
    </div>
  );
}

export default function ExpenseMaster() {
  const [expenses, setExpenses]         = useState([]);
  const [loading, setLoading]           = useState(true);
  const [error, setError]               = useState(null);
  const [selectedYear, setSelectedYear] = useState(null);
  const [activePeriod, setActivePeriod] = useState("all");
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef(null);

  const [selectedMonth, setSelectedMonth] = useState(null);
  const [monthDropdownOpen, setMonthDropdownOpen] = useState(false);
  const monthDropdownRef = useRef(null);

  useEffect(() => {
    async function fetchExpenses() {
      try {
        setLoading(true);
        const res = await fetch(`${API_BASE}/employee/all`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        setExpenses(data);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    fetchExpenses();
  }, []);

  useEffect(() => {
    function handleOutside(e) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) setDropdownOpen(false);
      if (monthDropdownRef.current && !monthDropdownRef.current.contains(e.target)) setMonthDropdownOpen(false);
    }
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, []);

  const years = getYearsFromExpenses(expenses);

  useEffect(() => {
    if (years.length && selectedYear === null) setSelectedYear(years[0]);
  }, [years, selectedYear]);

  function selectPeriod(key) {
    setActivePeriod(key);
    setSelectedMonth(null);
    setDropdownOpen(false);
  }

  function selectSingleMonth(monthIndex) {
    setSelectedMonth(monthIndex);
    setMonthDropdownOpen(false);
  }

  function clearSingleMonth() {
    setSelectedMonth(null);
  }

  const currentPeriod = PERIOD_OPTIONS.find((p) => p.key === activePeriod);

  const visibleMonths =
    selectedMonth !== null ? [selectedMonth] : currentPeriod.months;

  const periodTotal =
    selectedYear !== null
      ? visibleMonths.reduce(
          (sum, mi) => sum + getMonthTotal(expenses, calYearForFYMonth(selectedYear, mi), mi),
          0
        )
      : 0;

  if (loading) {
    return (
      <div style={styles.centered}>
        <div style={styles.spinner} />
        <p style={styles.loadingText}>Loading expenses...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div style={styles.centered}>
        <p style={styles.errorText}>Failed to load: {error}</p>
      </div>
    );
  }

  const recurringAll = expenses.filter((e) => e.type === "recurring");
  const oneTimeAll   = expenses.filter((e) => e.type === "one-time");

  return (
    <div style={styles.page}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
        @keyframes spin { to { transform: rotate(360deg); } }
        .em-table-scroll { overflow-x: auto; border-radius: 14px; border: 1px solid #ececec; background: #fff; box-shadow: 0 1px 3px rgba(16,24,40,0.04); }
        .em-table { border-collapse: collapse; white-space: nowrap; width: 100%; font-size: 13px; }
        .em-col-name { position: sticky; left: 0; z-index: 3; background: #fff; min-width: 230px; max-width: 230px; border-right: 1px solid #ececec; }
        .em-col-name.head { background: #fafafa; z-index: 4; }
        .em-th-month { background: #fafafa; color: #6b7280; text-align: center; font-size: 10.5px; font-weight: 500; letter-spacing: 0.3px; padding: 10px 10px; border-right: 1px solid #ececec; border-bottom: 1px solid #ececec; min-width: 96px; }
        .em-th-month.inactive { color: #cbd5e1; }
        .em-th-total { background: #eef2ff; color: #4338ca; text-align: center; font-size: 10.5px; font-weight: 600; letter-spacing: 0.3px; padding: 10px 12px; border-bottom: 1px solid #ececec; min-width: 110px; }
        tr.em-row:hover td { background: #fafafa !important; }
        tr.em-row:hover .em-col-name { background: #fafafa !important; }
        .em-td-name { padding: 10px 14px; border-bottom: 1px solid #f4f4f5; vertical-align: middle; }
        .em-td-amt { text-align: right; padding: 10px 12px; font-variant-numeric: tabular-nums; font-size: 12px; border-bottom: 1px solid #f4f4f5; border-right: 1px solid #f4f4f5; color: #374151; }
        .em-td-amt.zero { color: #d1d5db; text-align: center; background: #fafafa; }
        .em-td-amt.onetime { color: #b45309; background: #fffbeb; font-weight: 600; }
        .em-td-yeartotal { text-align: right; padding: 10px 12px; font-variant-numeric: tabular-nums; font-size: 12px; font-weight: 700; color: #4338ca; border-bottom: 1px solid #f4f4f5; background: #eef2ff; }
        tr.em-totals td { background: #fafafa; border-top: 1px solid #ececec; font-variant-numeric: tabular-nums; font-size: 12px; text-align: right; padding: 10px 12px; border-right: 1px solid #f4f4f5; font-weight: 600; }
      `}</style>

      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>Expense Master</h1>
          <p style={styles.subtitle}>
            Financial-year (Apr-Mar) breakdown of all recurring and one-time expenses
          </p>
        </div>

        <div style={styles.headerRight}>
          <div style={styles.summaryBadges}>
            <span style={styles.badge("#4338ca", "#eef2ff")}>{recurringAll.length} Recurring</span>
            <span style={styles.badge("#b45309", "#fffbeb")}>{oneTimeAll.length} One-time</span>
          </div>

          <div style={styles.dropdownWrap} ref={monthDropdownRef}>
            <button
              style={
                monthDropdownOpen
                  ? { ...styles.monthBtn, ...styles.monthBtnOpen }
                  : selectedMonth !== null
                  ? { ...styles.monthBtn, ...styles.monthBtnActive }
                  : styles.monthBtn
              }
              onClick={() => setMonthDropdownOpen((p) => !p)}
            >
              <span style={styles.periodBtnLabel}>
                <span style={styles.monthBtnIcon}>{"\uD83D\uDDD3\uFE0F"}</span>
                {selectedMonth !== null ? MONTHS[selectedMonth] : "By Month"}
              </span>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ transform: monthDropdownOpen ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.15s" }}>
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>

            {monthDropdownOpen && (
              <div style={styles.dropdown}>
                <div style={styles.dropGroupLabel}>Single Month</div>
                <div style={styles.monthGrid}>
                  {FY_ORDER.map((mi) => {
                    const calYr = selectedYear !== null ? calYearForFYMonth(selectedYear, mi) : null;
                    const isActive = selectedMonth === mi;
                    return (
                      <button
                        key={mi}
                        style={isActive ? { ...styles.monthCell, ...styles.monthCellActive } : styles.monthCell}
                        onClick={() => selectSingleMonth(mi)}
                        title={calYr !== null ? `${MONTHS[mi]} ${calYr}` : MONTHS[mi]}
                      >
                        {MONTH_SHORT[mi]}
                      </button>
                    );
                  })}
                </div>
                {selectedMonth !== null && (
                  <>
                    <div style={styles.dropDivider} />
                    <button style={styles.clearMonthBtn} onClick={() => { clearSingleMonth(); setMonthDropdownOpen(false); }}>
                      {"\u2715"} Clear month filter
                    </button>
                  </>
                )}
              </div>
            )}
          </div>

          <div style={styles.dropdownWrap} ref={dropdownRef}>
            <button
              style={dropdownOpen ? { ...styles.periodBtn, ...styles.periodBtnOpen } : styles.periodBtn}
              onClick={() => setDropdownOpen((prev) => !prev)}
            >
              <span style={styles.periodBtnLabel}>
                {currentPeriod.label !== "Full Year" && (
                  <span style={styles.periodBtnChip}>{currentPeriod.label}</span>
                )}
                {currentPeriod.label === "Full Year" ? "Full Year" : currentPeriod.sub}
              </span>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ transform: dropdownOpen ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.15s" }}>
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>

            {dropdownOpen && (
              <div style={styles.dropdown}>
                <button
                  style={activePeriod === "all" && selectedMonth === null ? { ...styles.dropItem, ...styles.dropItemActive } : styles.dropItem}
                  onClick={() => selectPeriod("all")}
                >
                  <span style={styles.dropItemLabel}>Full Year</span>
                  <span style={styles.dropItemSub}>Apr {"\u2013"} Mar</span>
                </button>

                <div style={styles.dropDivider} />
                <div style={styles.dropGroupLabel}>Quarters</div>
                {PERIOD_OPTIONS.filter((p) => p.key.startsWith("q")).map((p) => (
                  <button
                    key={p.key}
                    style={activePeriod === p.key && selectedMonth === null ? { ...styles.dropItem, ...styles.dropItemActive } : styles.dropItem}
                    onClick={() => selectPeriod(p.key)}
                  >
                    <span style={styles.dropItemLabel}>
                      <span style={styles.dropChip}>{p.label}</span>
                      {p.sub}
                    </span>
                    <span style={styles.dropItemSub}>
                      {selectedYear !== null
                        ? "\u20B9" + p.months.reduce((s, mi) => s + getMonthTotal(expenses, calYearForFYMonth(selectedYear, mi), mi), 0).toLocaleString("en-IN")
                        : "\u2014"}
                    </span>
                  </button>
                ))}

                <div style={styles.dropDivider} />
                <div style={styles.dropGroupLabel}>Half-year</div>
                {PERIOD_OPTIONS.filter((p) => p.key.startsWith("h")).map((p) => (
                  <button
                    key={p.key}
                    style={activePeriod === p.key && selectedMonth === null ? { ...styles.dropItem, ...styles.dropItemActive } : styles.dropItem}
                    onClick={() => selectPeriod(p.key)}
                  >
                    <span style={styles.dropItemLabel}>
                      <span style={styles.dropChip}>{p.label}</span>
                      {p.sub}
                    </span>
                    <span style={styles.dropItemSub}>
                      {selectedYear !== null
                        ? "\u20B9" + p.months.reduce((s, mi) => s + getMonthTotal(expenses, calYearForFYMonth(selectedYear, mi), mi), 0).toLocaleString("en-IN")
                        : "\u2014"}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {years.length > 0 && (
        <div style={styles.yearBar}>
          {years.map((yr) => (
            <button
              key={yr}
              onClick={() => setSelectedYear(yr)}
              style={selectedYear === yr ? styles.yearBtnActive : styles.yearBtn}
            >
              {fyLabel(yr)}
            </button>
          ))}
        </div>
      )}

      {selectedYear !== null && (selectedMonth !== null || activePeriod !== "all") && (
        <div style={styles.periodBar}>
          <div style={styles.periodBarLeft}>
            {selectedMonth !== null ? (
              <>
                <span style={styles.periodBarChip}>Month</span>
                <span style={styles.periodBarText}>
                  {MONTHS[selectedMonth]} {calYearForFYMonth(selectedYear, selectedMonth)} {"\u00B7"} {fyLabel(selectedYear)}
                </span>
              </>
            ) : (
              <>
                <span style={styles.periodBarChip}>{currentPeriod.label}</span>
                <span style={styles.periodBarText}>
                  {currentPeriod.sub} {"\u00B7"} {currentPeriod.months.length} months {"\u00B7"} {fyLabel(selectedYear)}
                </span>
              </>
            )}
          </div>
          <span style={styles.periodBarTotal}>{"\u20B9"}{periodTotal.toLocaleString("en-IN")}</span>
        </div>
      )}

      <div style={styles.legend}>
        <span style={styles.legendItem}>
          <span style={{ ...styles.legendDot, background: "#4f46e5" }} />
          Recurring expense
        </span>
        <span style={styles.legendItem}>
          <span style={{ ...styles.legendDot, background: "#d97706" }} />
          One-time expense
        </span>
      </div>

      {selectedYear !== null && (
        <FullYearMatrix expenses={expenses} fyYear={selectedYear} visibleMonths={visibleMonths} />
      )}

      {expenses.length === 0 && (
        <div style={styles.centered}>
          <p style={{ color: "#6b7280", marginTop: 40 }}>No expenses found.</p>
        </div>
      )}
    </div>
  );
}

// Horizontal FY matrix: rows = expenses, columns = months (FY order).
function FullYearMatrix({ expenses, fyYear, visibleMonths }) {
  const recurringRows = expenses.filter((e) => e.type === "recurring").filter((e) =>
    visibleMonths.some((mi) =>
      isRecurringActiveInMonth(e, calYearForFYMonth(fyYear, mi), mi)
    )
  );

  const oneTimeRows = expenses.filter((e) => e.type === "one-time").filter((e) => {
    const d = parseUTCDate(e.date);
    return visibleMonths.some(
      (mi) => d.getMonth() === mi && d.getFullYear() === calYearForFYMonth(fyYear, mi)
    );
  });

  const rows = [...recurringRows, ...oneTimeRows];

  const cellAmount = (exp, mi) => {
    const calYr = calYearForFYMonth(fyYear, mi);
    if (exp.type === "recurring") {
      return isRecurringActiveInMonth(exp, calYr, mi) ? exp.amount : 0;
    }
    const d = parseUTCDate(exp.date);
    return d.getMonth() === mi && d.getFullYear() === calYr ? exp.amount : 0;
  };

  const colTotals = {};
  visibleMonths.forEach((mi) => {
    colTotals[mi] = getMonthTotal(expenses, calYearForFYMonth(fyYear, mi), mi);
  });
  const grandTotal = visibleMonths.reduce((s, mi) => s + colTotals[mi], 0);

  if (rows.length === 0) {
    return (
      <div style={styles.centered}>
        <p style={{ color: "#6b7280", marginTop: 30 }}>No expenses in this period.</p>
      </div>
    );
  }

  return (
    <div className="em-table-scroll">
      <table className="em-table">
        <thead>
          <tr>
            <th className="em-col-name head" style={styles.thName}>Expense</th>
            {visibleMonths.map((mi) => {
              const calYr = calYearForFYMonth(fyYear, mi);
              const anyActive = colTotals[mi] > 0;
              return (
                <th key={mi} className={`em-th-month${anyActive ? "" : " inactive"}`}>
                  {MONTH_SHORT[mi]}
                  <div style={{ fontSize: 9, fontWeight: 400, color: "#9ca3af", marginTop: 1 }}>{calYr}</div>
                </th>
              );
            })}
            <th className="em-th-total">{visibleMonths.length === 12 ? `${fyLabel(fyYear)} Total` : "Total"}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((exp) => {
            const rowTotal = visibleMonths.reduce((s, mi) => s + cellAmount(exp, mi), 0);
            const isOneTime = exp.type === "one-time";
            return (
              <tr key={exp._id} className="em-row">
                <td className="em-col-name em-td-name">
                  <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                    <ExpenseAvatar name={exp.expenseName || "?"} oneTime={isOneTime} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 500, color: "#18181b", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {exp.expenseName}
                      </div>
                      <div style={{ fontSize: 10, color: "#9ca3af", marginTop: 2 }}>
                        <span style={isOneTime ? styles.tagOneTime : styles.tagRecurring}>
                          {isOneTime ? "One-time" : "Recurring"}
                        </span>
                        <span style={{ marginLeft: 6 }}>{exp.expenseType}</span>
                      </div>
                    </div>
                  </div>
                </td>
                {visibleMonths.map((mi) => {
                  const amt = cellAmount(exp, mi);
                  if (amt === 0) {
                    return <td key={mi} className="em-td-amt zero">{"\u2014"}</td>;
                  }
                  return (
                    <td key={mi} className={`em-td-amt${isOneTime ? " onetime" : ""}`}>
                      {fmt(amt)}
                    </td>
                  );
                })}
                <td className="em-td-yeartotal">{fmt(rowTotal)}</td>
              </tr>
            );
          })}

          <tr className="em-totals">
            <td className="em-col-name" style={styles.totalsNameCell}>
              Monthly Total
              <div style={{ fontSize: 9, color: "#9ca3af", marginTop: 2, fontWeight: 400 }}>
                Recurring + one-time
              </div>
            </td>
            {visibleMonths.map((mi) => (
              <td key={mi} style={{ color: colTotals[mi] > 0 ? "#4338ca" : "#d1d5db" }}>
                {colTotals[mi] > 0 ? fmt(colTotals[mi]) : "\u2014"}
              </td>
            ))}
            <td style={{ color: "#3730a3", fontWeight: 800, background: "#eef2ff" }}>
              {fmt(grandTotal)}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

const styles = {
  page: { padding: "32px 24px", maxWidth: 1280, margin: "0 auto", fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif", color: "#18181b", background: "#f7f7f8", minHeight: "100vh" },
  header: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20, flexWrap: "wrap", gap: 12 },
  title: { margin: 0, fontSize: 26, fontWeight: 600, color: "#18181b", letterSpacing: "-0.5px" },
  subtitle: { margin: "5px 0 0", fontSize: 14, color: "#6b7280" },
  headerRight: { display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" },
  summaryBadges: { display: "flex", gap: 8, alignItems: "center" },
  badge: (color, bg) => ({ background: bg, color, fontSize: 12, fontWeight: 600, padding: "4px 12px", borderRadius: 20, border: `1px solid ${color}22` }),
  dropdownWrap: { position: "relative" },
  periodBtn: { display: "flex", alignItems: "center", gap: 8, padding: "8px 14px", borderRadius: 10, border: "1px solid #ececec", background: "#fff", color: "#374151", fontSize: 13, fontWeight: 500, cursor: "pointer", whiteSpace: "nowrap", transition: "all 0.15s", boxShadow: "0 1px 2px rgba(16,24,40,0.04)" },
  periodBtnOpen: { background: "#f3f4f6", borderColor: "#d1d5db", color: "#18181b" },
  periodBtnLabel: { display: "flex", alignItems: "center", gap: 6 },
  periodBtnChip: { background: "#4f46e5", color: "#fff", fontSize: 10, fontWeight: 700, padding: "1px 6px", borderRadius: 4, letterSpacing: "0.5px" },
  monthBtn: { display: "flex", alignItems: "center", gap: 8, padding: "8px 14px", borderRadius: 10, border: "1px solid #ececec", background: "#fff", color: "#374151", fontSize: 13, fontWeight: 500, cursor: "pointer", whiteSpace: "nowrap", transition: "all 0.15s", boxShadow: "0 1px 2px rgba(16,24,40,0.04)" },
  monthBtnOpen: { background: "#f3f4f6", borderColor: "#d1d5db", color: "#18181b" },
  monthBtnActive: { background: "#18181b", borderColor: "#18181b", color: "#fff" },
  monthBtnIcon: { fontSize: 13 },
  monthGrid: { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6, padding: "8px 12px 4px" },
  monthCell: { padding: "8px 0", borderRadius: 7, border: "1px solid #ececec", background: "#fff", color: "#374151", fontSize: 12, fontWeight: 500, cursor: "pointer", transition: "all 0.12s" },
  monthCellActive: { background: "#18181b", borderColor: "#18181b", color: "#fff", fontWeight: 600 },
  clearMonthBtn: { width: "100%", padding: "9px 14px", border: "none", background: "none", color: "#dc2626", fontSize: 12, fontWeight: 600, cursor: "pointer", textAlign: "left" },
  dropdown: { position: "absolute", top: "calc(100% + 6px)", right: 0, minWidth: 220, background: "#fff", border: "1px solid #ececec", borderRadius: 12, boxShadow: "0 16px 40px rgba(16,24,40,0.14)", zIndex: 100, overflow: "hidden", padding: 6 },
  dropItem: { display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", padding: "9px 12px", border: "none", background: "none", cursor: "pointer", textAlign: "left", fontSize: 13, color: "#374151", transition: "background 0.1s", gap: 8, borderRadius: 8 },
  dropItemActive: { background: "#eef2ff", color: "#4338ca", fontWeight: 600 },
  dropItemLabel: { display: "flex", alignItems: "center", gap: 7, fontSize: 13, fontWeight: 500, color: "inherit" },
  dropItemSub: { fontSize: 12, color: "#9ca3af", fontWeight: 400, fontVariantNumeric: "tabular-nums" },
  dropChip: { background: "#eef2ff", color: "#4338ca", fontSize: 10, fontWeight: 700, padding: "1px 6px", borderRadius: 4, border: "1px solid #e0e7ff", letterSpacing: "0.4px" },
  dropDivider: { height: 1, background: "#f1f1f1", margin: "4px 0" },
  dropGroupLabel: { padding: "5px 12px 3px", fontSize: 10, fontWeight: 600, color: "#9ca3af", letterSpacing: "0.08em", textTransform: "uppercase" },
  periodBar: { display: "flex", justifyContent: "space-between", alignItems: "center", background: "#fff", border: "1px solid #ececec", borderRadius: 12, padding: "11px 16px", marginBottom: 16, boxShadow: "0 1px 2px rgba(16,24,40,0.04)" },
  periodBarLeft: { display: "flex", alignItems: "center", gap: 10 },
  periodBarChip: { background: "#4f46e5", color: "#fff", fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 5, letterSpacing: "0.4px" },
  periodBarText: { fontSize: 13, color: "#374151", fontWeight: 500 },
  periodBarTotal: { fontSize: 16, fontWeight: 700, color: "#18181b", fontVariantNumeric: "tabular-nums" },
  yearBar: { display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" },
  yearBtn: { padding: "7px 18px", borderRadius: 20, border: "1px solid #ececec", background: "#fff", color: "#374151", fontSize: 13, fontWeight: 500, cursor: "pointer", transition: "all 0.15s" },
  yearBtnActive: { padding: "7px 18px", borderRadius: 20, border: "1px solid #18181b", background: "#18181b", color: "#fff", fontSize: 13, fontWeight: 500, cursor: "pointer" },
  legend: { display: "flex", gap: 20, marginBottom: 20, fontSize: 13, color: "#6b7280" },
  legendItem: { display: "flex", alignItems: "center", gap: 6 },
  legendDot: { width: 10, height: 10, borderRadius: "50%", display: "inline-block" },
  thName: { padding: "11px 16px", textAlign: "left", fontSize: 10.5, fontWeight: 500, letterSpacing: "0.3px", color: "#9ca3af", background: "#fafafa", borderBottom: "1px solid #ececec" },
  totalsNameCell: { padding: "10px 16px", fontSize: 10.5, fontWeight: 500, color: "#6b7280", letterSpacing: "0.3px", textAlign: "left", borderTop: "1px solid #ececec", background: "#fafafa" },
  tagRecurring: { fontSize: 10, background: "#eef2ff", color: "#4338ca", padding: "1px 6px", borderRadius: 4, fontWeight: 600, border: "1px solid #e0e7ff" },
  tagOneTime: { fontSize: 10, background: "#fffbeb", color: "#b45309", padding: "1px 6px", borderRadius: 4, fontWeight: 600, border: "1px solid #fde68a" },
  centered: { display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: 200, gap: 12, fontFamily: "'Inter', sans-serif", background: "#f7f7f8" },
  spinner: { width: 32, height: 32, border: "2.5px solid #ececec", borderTop: "2.5px solid #18181b", borderRadius: "50%", animation: "spin 0.8s linear infinite" },
  loadingText: { color: "#6b7280", fontSize: 14 },
  errorText: { color: "#dc2626", fontSize: 14 },
};
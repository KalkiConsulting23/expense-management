import React, { useEffect, useState, useRef } from "react";

const API_URL = import.meta.env.VITE_API_URL || "https://expense-management-11.onrender.com";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const MONTH_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

// Quarter / Half definitions
const PERIOD_OPTIONS = [
  { key: "all",  label: "Full Year",  months: [0,1,2,3,4,5,6,7,8,9,10,11] },
  { key: "q1",   label: "Q1",         months: [0,1,2],   sub: "Jan – Mar" },
  { key: "q2",   label: "Q2",         months: [3,4,5],   sub: "Apr – Jun" },
  { key: "q3",   label: "Q3",         months: [6,7,8],   sub: "Jul – Sep" },
  { key: "q4",   label: "Q4",         months: [9,10,11], sub: "Oct – Dec" },
  { key: "h1",   label: "H1",         months: [0,1,2,3,4,5],   sub: "Jan – Jun" },
  { key: "h2",   label: "H2",         months: [6,7,8,9,10,11], sub: "Jul – Dec" },
];

function getYearsFromExpenses(expenses) {
  const years = new Set();
  expenses.forEach((exp) => {
    if (exp.type === "recurring") {
      const start = new Date(exp.startDate);
      const end = exp.endDate ? new Date(exp.endDate) : new Date();
      for (let y = start.getFullYear(); y <= end.getFullYear(); y++) years.add(y);
    } else if (exp.type === "one-time") {
      years.add(new Date(exp.date).getFullYear());
    }
  });
  return Array.from(years).sort((a, b) => b - a);
}

function isRecurringActiveInMonth(exp, year, monthIndex) {
  const start = new Date(exp.startDate);
  const end = exp.endDate ? new Date(exp.endDate) : null;
  const monthStart = new Date(year, monthIndex, 1);
  const monthEnd = new Date(year, monthIndex + 1, 0);
  if (start > monthEnd) return false;
  if (end && end < monthStart) return false;
  return true;
}

function getOneTimeForMonth(expenses, year, monthIndex) {
  return expenses.filter((exp) => {
    if (exp.type !== "one-time") return false;
    const d = new Date(exp.date);
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

export default function ExpenseMaster() {
  const [expenses, setExpenses]         = useState([]);
  const [loading, setLoading]           = useState(true);
  const [error, setError]               = useState(null);
  const [selectedYear, setSelectedYear] = useState(null);
  const [expandedMonths, setExpandedMonths] = useState({});
  const [activePeriod, setActivePeriod] = useState("all");
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef(null);

  useEffect(() => {
    async function fetchExpenses() {
      try {
        setLoading(true);
        const res = await fetch(`${API_URL}/api/employee/all`);
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

  // Close dropdown on outside click
  useEffect(() => {
    function handleOutside(e) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, []);

  const years = getYearsFromExpenses(expenses);

  useEffect(() => {
    if (years.length && !selectedYear) setSelectedYear(years[0]);
  }, [years]);

  function toggleMonth(monthIndex) {
    setExpandedMonths((prev) => ({ ...prev, [monthIndex]: !prev[monthIndex] }));
  }

  function selectPeriod(key) {
    setActivePeriod(key);
    setDropdownOpen(false);
    // auto-expand all months in the chosen period
    const period = PERIOD_OPTIONS.find(p => p.key === key);
    if (period) {
      const next = {};
      period.months.forEach(m => { next[m] = true; });
      setExpandedMonths(next);
    }
  }

  const currentPeriod = PERIOD_OPTIONS.find(p => p.key === activePeriod);
  const visibleMonths = currentPeriod.months;

  // Period total
  const periodTotal = selectedYear
    ? visibleMonths.reduce((sum, mi) => sum + getMonthTotal(expenses, selectedYear, mi), 0)
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
      {/* ── Header ── */}
      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>Expense Master</h1>
          <p style={styles.subtitle}>Month-wise breakdown of all recurring and one-time expenses</p>
        </div>

        <div style={styles.headerRight}>
          {/* Count badges */}
          <div style={styles.summaryBadges}>
            <span style={styles.badge("#0f6e56", "#e1f5ee")}>{recurringAll.length} Recurring</span>
            <span style={styles.badge("#7c3d0f", "#fef3c7")}>{oneTimeAll.length} One-time</span>
          </div>

          {/* Period dropdown */}
          <div style={styles.dropdownWrap} ref={dropdownRef}>
            <button
              style={dropdownOpen ? { ...styles.periodBtn, ...styles.periodBtnOpen } : styles.periodBtn}
              onClick={() => setDropdownOpen(prev => !prev)}
            >
              <span style={styles.periodBtnLabel}>
                {currentPeriod.label !== "Full Year" && (
                  <span style={styles.periodBtnChip}>{currentPeriod.label}</span>
                )}
                {currentPeriod.label === "Full Year" ? "Full Year" : currentPeriod.sub}
              </span>
              <svg
                width="12" height="12" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                style={{ transform: dropdownOpen ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.15s" }}
              >
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>

            {dropdownOpen && (
              <div style={styles.dropdown}>
                {/* Full year option */}
                <button
                  style={activePeriod === "all" ? { ...styles.dropItem, ...styles.dropItemActive } : styles.dropItem}
                  onClick={() => selectPeriod("all")}
                >
                  <span style={styles.dropItemLabel}>Full Year</span>
                  <span style={styles.dropItemSub}>All 12 months</span>
                </button>

                <div style={styles.dropDivider} />

                {/* Quarters */}
                <div style={styles.dropGroupLabel}>Quarters</div>
                {PERIOD_OPTIONS.filter(p => p.key.startsWith("q")).map(p => (
                  <button
                    key={p.key}
                    style={activePeriod === p.key ? { ...styles.dropItem, ...styles.dropItemActive } : styles.dropItem}
                    onClick={() => selectPeriod(p.key)}
                  >
                    <span style={styles.dropItemLabel}>
                      <span style={styles.dropChip}>{p.label}</span>
                      {p.sub}
                    </span>
                    <span style={styles.dropItemSub}>
                      {selectedYear
                        ? "₹" + p.months.reduce((s, mi) => s + getMonthTotal(expenses, selectedYear, mi), 0).toLocaleString("en-IN")
                        : "—"}
                    </span>
                  </button>
                ))}

                <div style={styles.dropDivider} />

                {/* Halves */}
                <div style={styles.dropGroupLabel}>Half-year</div>
                {PERIOD_OPTIONS.filter(p => p.key.startsWith("h")).map(p => (
                  <button
                    key={p.key}
                    style={activePeriod === p.key ? { ...styles.dropItem, ...styles.dropItemActive } : styles.dropItem}
                    onClick={() => selectPeriod(p.key)}
                  >
                    <span style={styles.dropItemLabel}>
                      <span style={styles.dropChip}>{p.label}</span>
                      {p.sub}
                    </span>
                    <span style={styles.dropItemSub}>
                      {selectedYear
                        ? "₹" + p.months.reduce((s, mi) => s + getMonthTotal(expenses, selectedYear, mi), 0).toLocaleString("en-IN")
                        : "—"}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Year Selector ── */}
      {years.length > 0 && (
        <div style={styles.yearBar}>
          {years.map((yr) => (
            <button
              key={yr}
              onClick={() => setSelectedYear(yr)}
              style={selectedYear === yr ? styles.yearBtnActive : styles.yearBtn}
            >
              {yr}
            </button>
          ))}
        </div>
      )}

      {/* ── Period summary bar ── */}
      {activePeriod !== "all" && selectedYear && (
        <div style={styles.periodBar}>
          <div style={styles.periodBarLeft}>
            <span style={styles.periodBarChip}>{currentPeriod.label}</span>
            <span style={styles.periodBarText}>
              {currentPeriod.sub} · {currentPeriod.months.length} months
            </span>
          </div>
          <span style={styles.periodBarTotal}>
            ₹{periodTotal.toLocaleString("en-IN")}
          </span>
        </div>
      )}

      {/* ── Legend ── */}
      <div style={styles.legend}>
        <span style={styles.legendItem}>
          <span style={{ ...styles.legendDot, background: "#1d9e75" }} />
          Recurring expense
        </span>
        <span style={styles.legendItem}>
          <span style={{ ...styles.legendDot, background: "#f59e0b" }} />
          One-time expense
        </span>
      </div>

      {/* ── Month Tables ── */}
      {selectedYear && (
        <div style={styles.monthsGrid}>
          {visibleMonths.map((monthIndex) => {
            const monthName = MONTHS[monthIndex];
            const recurring = getRecurringForMonth(expenses, selectedYear, monthIndex);
            const oneTime   = getOneTimeForMonth(expenses, selectedYear, monthIndex);
            const hasData   = recurring.length > 0 || oneTime.length > 0;
            const total     = getMonthTotal(expenses, selectedYear, monthIndex);
            const isExpanded = expandedMonths[monthIndex] !== false && hasData;

            if (!hasData) {
              return (
                <div key={monthIndex} style={styles.monthCardEmpty}>
                  <div style={styles.monthHeaderEmpty}>
                    <span style={styles.monthLabel}>{MONTH_SHORT[monthIndex]}</span>
                    <span style={styles.noDataTag}>No expenses</span>
                  </div>
                </div>
              );
            }

            return (
              <div key={monthIndex} style={styles.monthCard}>
                <div style={styles.monthHeader} onClick={() => toggleMonth(monthIndex)}>
                  <div style={styles.monthHeaderLeft}>
                    <span style={styles.monthName}>{monthName}</span>
                    <span style={styles.countPill}>{recurring.length + oneTime.length} items</span>
                  </div>
                  <div style={styles.monthHeaderRight}>
                    <span style={styles.monthTotal}>₹{total.toLocaleString("en-IN")}</span>
                    <span style={styles.chevron}>{isExpanded ? "▲" : "▼"}</span>
                  </div>
                </div>

                {isExpanded && (
                  <div style={styles.tableWrapper}>
                    <table style={styles.table}>
                      <thead>
                        <tr>
                          <th style={styles.th}>Expense Name</th>
                          <th style={styles.th}>Category</th>
                          <th style={{ ...styles.th, textAlign: "right" }}>Amount</th>
                          <th style={styles.th}>Type</th>
                        </tr>
                      </thead>
                      <tbody>
                        {recurring.map((exp, i) => (
                          <tr key={exp._id} style={i % 2 === 0 ? styles.rowEven : styles.rowOdd}>
                            <td style={styles.td}>{exp.expenseName}</td>
                            <td style={styles.td}><span style={styles.categoryTag}>{exp.expenseType}</span></td>
                            <td style={{ ...styles.td, textAlign: "right", fontWeight: 500 }}>
                              ₹{exp.amount.toLocaleString("en-IN")}
                            </td>
                            <td style={styles.td}><span style={styles.recurringBadge}>Recurring</span></td>
                          </tr>
                        ))}

                        {recurring.length > 0 && oneTime.length > 0 && (
                          <tr>
                            <td colSpan={4} style={styles.dividerRow}>One-time expenses this month</td>
                          </tr>
                        )}

                        {oneTime.map((exp) => (
                          <tr key={exp._id} style={styles.oneTimeRow}>
                            <td style={styles.td}>
                              <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                <span style={styles.oneTimeDot} />
                                {exp.expenseName}
                              </span>
                            </td>
                            <td style={styles.td}><span style={styles.categoryTag}>{exp.expenseType}</span></td>
                            <td style={{ ...styles.td, textAlign: "right", fontWeight: 600, color: "#b45309" }}>
                              ₹{exp.amount.toLocaleString("en-IN")}
                            </td>
                            <td style={styles.td}><span style={styles.oneTimeBadge}>One-time</span></td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr style={styles.footerRow}>
                          <td colSpan={2} style={{ ...styles.td, fontWeight: 600, paddingTop: 10 }}>
                            {monthName} Total
                          </td>
                          <td style={{ ...styles.td, textAlign: "right", fontWeight: 700, color: "#0f6e56", paddingTop: 10 }}>
                            ₹{total.toLocaleString("en-IN")}
                          </td>
                          <td style={styles.td} />
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {expenses.length === 0 && (
        <div style={styles.centered}>
          <p style={{ color: "#6b7280", marginTop: 40 }}>No expenses found.</p>
        </div>
      )}
    </div>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────

const styles = {
  page: {
    padding: "24px",
    maxWidth: 1100,
    margin: "0 auto",
    fontFamily: "'Inter', 'Segoe UI', sans-serif",
    color: "#1a1a1a",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 20,
    flexWrap: "wrap",
    gap: 12,
  },
  title: {
    margin: 0,
    fontSize: 26,
    fontWeight: 700,
    color: "#064e3b",
    letterSpacing: "-0.5px",
  },
  subtitle: {
    margin: "4px 0 0",
    fontSize: 14,
    color: "#6b7280",
  },
  headerRight: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    flexWrap: "wrap",
  },
  summaryBadges: {
    display: "flex",
    gap: 8,
    alignItems: "center",
  },
  badge: (color, bg) => ({
    background: bg,
    color: color,
    fontSize: 12,
    fontWeight: 600,
    padding: "4px 12px",
    borderRadius: 20,
    border: `1px solid ${color}33`,
  }),

  // ── Period dropdown ──
  dropdownWrap: {
    position: "relative",
  },
  periodBtn: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "7px 14px",
    borderRadius: 8,
    border: "1.5px solid #a7f3d0",
    background: "#f0fdf4",
    color: "#065f46",
    fontSize: 13,
    fontWeight: 500,
    cursor: "pointer",
    whiteSpace: "nowrap",
    transition: "all 0.15s",
  },
  periodBtnOpen: {
    background: "#dcfce7",
    borderColor: "#059669",
    color: "#064e3b",
  },
  periodBtnLabel: {
    display: "flex",
    alignItems: "center",
    gap: 6,
  },
  periodBtnChip: {
    background: "#059669",
    color: "#fff",
    fontSize: 10,
    fontWeight: 700,
    padding: "1px 6px",
    borderRadius: 4,
    letterSpacing: "0.5px",
  },
  dropdown: {
    position: "absolute",
    top: "calc(100% + 6px)",
    right: 0,
    minWidth: 220,
    background: "#fff",
    border: "1.5px solid #d1fae5",
    borderRadius: 10,
    boxShadow: "0 8px 24px rgba(0,0,0,0.10)",
    zIndex: 100,
    overflow: "hidden",
    animation: "fadeDown 0.12s ease",
  },
  dropItem: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    width: "100%",
    padding: "9px 14px",
    border: "none",
    background: "none",
    cursor: "pointer",
    textAlign: "left",
    fontSize: 13,
    color: "#374151",
    transition: "background 0.1s",
    gap: 8,
  },
  dropItemActive: {
    background: "#f0fdf4",
    color: "#065f46",
    fontWeight: 600,
  },
  dropItemLabel: {
    display: "flex",
    alignItems: "center",
    gap: 7,
    fontSize: 13,
    fontWeight: 500,
    color: "inherit",
  },
  dropItemSub: {
    fontSize: 12,
    color: "#6b7280",
    fontWeight: 400,
  },
  dropChip: {
    background: "#ecfdf5",
    color: "#065f46",
    fontSize: 10,
    fontWeight: 700,
    padding: "1px 6px",
    borderRadius: 4,
    border: "1px solid #a7f3d0",
    letterSpacing: "0.4px",
  },
  dropDivider: {
    height: 1,
    background: "#f3f4f6",
    margin: "2px 0",
  },
  dropGroupLabel: {
    padding: "5px 14px 3px",
    fontSize: 10,
    fontWeight: 600,
    color: "#9ca3af",
    letterSpacing: "0.08em",
    textTransform: "uppercase",
  },

  // ── Period summary bar ──
  periodBar: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    background: "#ecfdf5",
    border: "1px solid #a7f3d0",
    borderRadius: 8,
    padding: "10px 16px",
    marginBottom: 16,
  },
  periodBarLeft: {
    display: "flex",
    alignItems: "center",
    gap: 10,
  },
  periodBarChip: {
    background: "#059669",
    color: "#fff",
    fontSize: 11,
    fontWeight: 700,
    padding: "2px 8px",
    borderRadius: 5,
    letterSpacing: "0.4px",
  },
  periodBarText: {
    fontSize: 13,
    color: "#065f46",
    fontWeight: 500,
  },
  periodBarTotal: {
    fontSize: 16,
    fontWeight: 700,
    color: "#064e3b",
  },

  // ── Year pills ──
  yearBar: {
    display: "flex",
    gap: 8,
    marginBottom: 16,
    flexWrap: "wrap",
  },
  yearBtn: {
    padding: "6px 18px",
    borderRadius: 20,
    border: "1px solid #d1fae5",
    background: "#f0fdf4",
    color: "#065f46",
    fontSize: 13,
    fontWeight: 500,
    cursor: "pointer",
  },
  yearBtnActive: {
    padding: "6px 18px",
    borderRadius: 20,
    border: "1px solid #059669",
    background: "#059669",
    color: "#fff",
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
  },

  // ── Legend ──
  legend: {
    display: "flex",
    gap: 20,
    marginBottom: 20,
    fontSize: 13,
    color: "#6b7280",
  },
  legendItem: {
    display: "flex",
    alignItems: "center",
    gap: 6,
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: "50%",
    display: "inline-block",
  },

  // ── Month cards ──
  monthsGrid: {
    display: "flex",
    flexDirection: "column",
    gap: 12,
  },
  monthCard: {
    background: "#fff",
    border: "1px solid #d1fae5",
    borderRadius: 10,
    overflow: "hidden",
    boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
  },
  monthCardEmpty: {
    background: "#fafafa",
    border: "1px solid #e5e7eb",
    borderRadius: 10,
    padding: "10px 16px",
    opacity: 0.6,
  },
  monthHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "14px 20px",
    cursor: "pointer",
    background: "#f0fdf4",
    borderBottom: "1px solid #d1fae5",
    userSelect: "none",
  },
  monthHeaderEmpty: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  monthHeaderLeft: {
    display: "flex",
    alignItems: "center",
    gap: 10,
  },
  monthHeaderRight: {
    display: "flex",
    alignItems: "center",
    gap: 14,
  },
  monthName: {
    fontWeight: 700,
    fontSize: 15,
    color: "#064e3b",
  },
  monthLabel: {
    fontWeight: 600,
    fontSize: 13,
    color: "#9ca3af",
  },
  countPill: {
    fontSize: 11,
    background: "#d1fae5",
    color: "#065f46",
    padding: "2px 8px",
    borderRadius: 10,
    fontWeight: 500,
  },
  monthTotal: {
    fontWeight: 700,
    fontSize: 15,
    color: "#065f46",
  },
  chevron: {
    fontSize: 10,
    color: "#6b7280",
  },
  noDataTag: {
    fontSize: 12,
    color: "#9ca3af",
  },

  // ── Table ──
  tableWrapper: { overflowX: "auto" },
  table: { width: "100%", borderCollapse: "collapse", fontSize: 13 },
  th: {
    padding: "10px 16px",
    textAlign: "left",
    fontSize: 11,
    fontWeight: 600,
    textTransform: "uppercase",
    letterSpacing: "0.05em",
    color: "#6b7280",
    background: "#f9fafb",
    borderBottom: "1px solid #e5e7eb",
  },
  td: {
    padding: "10px 16px",
    borderBottom: "1px solid #f3f4f6",
    color: "#374151",
    verticalAlign: "middle",
  },
  rowEven: { background: "#ffffff" },
  rowOdd:  { background: "#f9fafb" },
  oneTimeRow: {
    background: "#fffbeb",
    borderLeft: "3px solid #f59e0b",
  },
  oneTimeDot: {
    width: 7,
    height: 7,
    borderRadius: "50%",
    background: "#f59e0b",
    flexShrink: 0,
  },
  categoryTag: {
    fontSize: 11,
    background: "#ecfdf5",
    color: "#065f46",
    padding: "2px 8px",
    borderRadius: 4,
    fontWeight: 500,
    border: "1px solid #a7f3d0",
  },
  recurringBadge: {
    fontSize: 11,
    background: "#eff6ff",
    color: "#1d4ed8",
    padding: "2px 8px",
    borderRadius: 4,
    fontWeight: 500,
    border: "1px solid #bfdbfe",
  },
  oneTimeBadge: {
    fontSize: 11,
    background: "#fffbeb",
    color: "#92400e",
    padding: "2px 8px",
    borderRadius: 4,
    fontWeight: 600,
    border: "1px solid #fcd34d",
  },
  dividerRow: {
    background: "#fff7ed",
    padding: "6px 16px",
    fontSize: 11,
    fontWeight: 600,
    color: "#92400e",
    letterSpacing: "0.04em",
    textTransform: "uppercase",
    borderTop: "1px dashed #fcd34d",
    borderBottom: "1px dashed #fcd34d",
  },
  footerRow: {
    background: "#f0fdf4",
    borderTop: "2px solid #a7f3d0",
  },

  // ── Misc ──
  centered: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    minHeight: 200,
    gap: 12,
  },
  spinner: {
    width: 32,
    height: 32,
    border: "3px solid #d1fae5",
    borderTop: "3px solid #059669",
    borderRadius: "50%",
    animation: "spin 0.8s linear infinite",
  },
  loadingText: { color: "#6b7280", fontSize: 14 },
  errorText:   { color: "#dc2626", fontSize: 14 },
};
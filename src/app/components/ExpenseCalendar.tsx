"use client";

import { useState, useMemo, useEffect, useRef } from "react";

/**
 * Date-jump calendar for the Expense Intelligence widget.
 *
 * Renders as a popover with a 6-row month grid. Each day cell is heat-
 * tinted by the day's spend total (red intensity scales with the
 * brightest day in view), shows a hover tooltip with the day's amount +
 * txn count, and highlights today (dashed accent outline) and the
 * currently selected date (filled accent background).
 *
 * Clicking a day calls onSelect(date) and closes. Clicking "Today" jumps
 * to and selects today. "Clear" returns to the default month view in the
 * parent. The popover closes on ESC, on backdrop click, and on outside
 * click.
 *
 * All date math is IST-pinned so the day boundary matches what the user
 * sees elsewhere in the dashboard (the project's clock + finance widget
 * are both in Asia/Kolkata).
 */

interface ExpenseLite {
  date: string | Date;
  amount: number;
}

interface ExpenseCalendarProps {
  expenses: ExpenseLite[];
  selectedDate: Date | null;
  onSelect: (date: Date | null) => void;
  onClose: () => void;
}

const IST_TZ = "Asia/Kolkata";

function toIST(d: Date | string): Date {
  return new Date(new Date(d).toLocaleString("en-US", { timeZone: IST_TZ }));
}

function dateKey(d: Date): string {
  const ist = toIST(d);
  return `${ist.getFullYear()}-${String(ist.getMonth() + 1).padStart(2, "0")}-${String(ist.getDate()).padStart(2, "0")}`;
}

const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];

export function ExpenseCalendar({
  expenses,
  selectedDate,
  onSelect,
  onClose,
}: ExpenseCalendarProps) {
  const today = useMemo(() => toIST(new Date()), []);
  const popoverRef = useRef<HTMLDivElement>(null);

  const [viewMonth, setViewMonth] = useState<Date>(() => {
    const base = selectedDate ? toIST(selectedDate) : today;
    return new Date(base.getFullYear(), base.getMonth(), 1);
  });

  // Per-day spend map for heat coloring + tooltips.
  const spendByDay = useMemo(() => {
    const map: Record<string, { total: number; count: number }> = {};
    for (const e of expenses) {
      const key = dateKey(new Date(e.date));
      if (!map[key]) map[key] = { total: 0, count: 0 };
      map[key].total += e.amount;
      map[key].count += 1;
    }
    return map;
  }, [expenses]);

  // Brightest day in the CURRENT view month — used to scale the heat
  // intensity so a single huge day doesn't wash out everything else.
  const maxSpendInView = useMemo(() => {
    let m = 0;
    for (const [k, v] of Object.entries(spendByDay)) {
      const [y, mo] = k.split("-").map(Number);
      if (
        y === viewMonth.getFullYear() &&
        mo === viewMonth.getMonth() + 1 &&
        v.total > m
      ) {
        m = v.total;
      }
    }
    return m;
  }, [spendByDay, viewMonth]);

  // 6×7 grid: leading days from previous month, current month, trailing
  // days from next month — so the visual grid is always rectangular.
  const grid = useMemo(() => {
    const firstDay = new Date(
      viewMonth.getFullYear(),
      viewMonth.getMonth(),
      1,
    );
    const daysInMonth = new Date(
      viewMonth.getFullYear(),
      viewMonth.getMonth() + 1,
      0,
    ).getDate();
    const startCol = firstDay.getDay();

    const cells: Array<{ date: Date; inMonth: boolean }> = [];

    for (let i = startCol - 1; i >= 0; i--) {
      const d = new Date(firstDay);
      d.setDate(firstDay.getDate() - (i + 1));
      cells.push({ date: d, inMonth: false });
    }
    for (let i = 1; i <= daysInMonth; i++) {
      cells.push({
        date: new Date(viewMonth.getFullYear(), viewMonth.getMonth(), i),
        inMonth: true,
      });
    }
    while (cells.length < 42) {
      const last = cells[cells.length - 1].date;
      const d = new Date(last);
      d.setDate(last.getDate() + 1);
      cells.push({ date: d, inMonth: false });
    }

    return cells;
  }, [viewMonth]);

  const goToMonth = (offset: number) => {
    setViewMonth(
      (prev) => new Date(prev.getFullYear(), prev.getMonth() + offset, 1),
    );
  };

  // ESC + outside click → close.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    const onDown = (e: MouseEvent) => {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(e.target as Node)
      ) {
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onDown);
    };
  }, [onClose]);

  const todayKey = dateKey(today);
  const selectedKey = selectedDate ? dateKey(selectedDate) : null;
  const monthLabel = viewMonth.toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });

  return (
    <div
      ref={popoverRef}
      role="dialog"
      aria-label="Jump to a specific date"
      style={{
        position: "absolute",
        top: "calc(100% + 8px)",
        right: 0,
        zIndex: 100,
        background: "var(--bg-primary, #fff)",
        border: "1px solid var(--border-color)",
        borderRadius: "var(--radius-lg, 12px)",
        boxShadow: "0 18px 48px rgba(0,0,0,0.18)",
        padding: "1rem",
        width: "300px",
        animation: "scaleIn 0.15s ease-out",
      }}
      // Stop bubbling so the parent's onClick handlers (e.g., backdrop)
      // don't fire when interacting inside the popover.
      onClick={(e) => e.stopPropagation()}
    >
      {/* Month header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: "0.75rem",
        }}
      >
        <button
          onClick={() => goToMonth(-1)}
          aria-label="Previous month"
          style={{
            width: 28,
            height: 28,
            borderRadius: 8,
            border: "1px solid var(--border-color)",
            background: "var(--bg-secondary)",
            cursor: "pointer",
            fontWeight: 800,
            color: "var(--text-primary)",
          }}
        >
          ‹
        </button>
        <span
          style={{
            fontWeight: 800,
            fontSize: "0.9rem",
            color: "var(--text-primary)",
            letterSpacing: "0.02em",
          }}
        >
          {monthLabel}
        </span>
        <button
          onClick={() => goToMonth(1)}
          aria-label="Next month"
          style={{
            width: 28,
            height: 28,
            borderRadius: 8,
            border: "1px solid var(--border-color)",
            background: "var(--bg-secondary)",
            cursor: "pointer",
            fontWeight: 800,
            color: "var(--text-primary)",
          }}
        >
          ›
        </button>
      </div>

      {/* Weekday header */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(7, 1fr)",
          gap: 4,
          marginBottom: 6,
        }}
      >
        {WEEKDAYS.map((d, i) => (
          <div
            key={i}
            style={{
              fontSize: "0.62rem",
              fontWeight: 800,
              textAlign: "center",
              color: "var(--text-secondary)",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
            }}
          >
            {d}
          </div>
        ))}
      </div>

      {/* Day grid */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(7, 1fr)",
          gap: 4,
        }}
      >
        {grid.map((cell, i) => {
          const key = dateKey(cell.date);
          const spend = spendByDay[key];
          const isToday = key === todayKey;
          const isSelected = key === selectedKey;
          const heat =
            spend && maxSpendInView > 0 && cell.inMonth
              ? Math.min(1, spend.total / maxSpendInView)
              : 0;

          const background = isSelected
            ? "var(--accent-color)"
            : heat > 0
              ? `rgba(239, 68, 68, ${0.1 + heat * 0.35})`
              : "transparent";

          const color = isSelected
            ? "#fff"
            : cell.inMonth
              ? "var(--text-primary)"
              : "var(--text-secondary)";

          return (
            <button
              key={i}
              onClick={() => {
                onSelect(cell.date);
                onClose();
              }}
              title={
                spend
                  ? `₹${spend.total.toLocaleString("en-IN")} across ${spend.count} txn${spend.count === 1 ? "" : "s"}`
                  : "no spend"
              }
              style={{
                aspectRatio: "1",
                padding: 0,
                border: isSelected
                  ? "2px solid var(--accent-color)"
                  : isToday
                    ? "1px dashed var(--accent-color)"
                    : "1px solid transparent",
                borderRadius: 8,
                background,
                color,
                opacity: cell.inMonth ? 1 : 0.4,
                cursor: "pointer",
                fontSize: "0.78rem",
                fontWeight: isToday || isSelected ? 800 : 600,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                position: "relative",
                transition:
                  "transform 0.1s ease, box-shadow 0.1s ease",
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.transform =
                  "scale(1.06)";
                if (!isSelected)
                  (e.currentTarget as HTMLElement).style.boxShadow =
                    "0 2px 6px rgba(0,0,0,0.08)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.transform =
                  "scale(1)";
                (e.currentTarget as HTMLElement).style.boxShadow = "none";
              }}
            >
              {cell.date.getDate()}
              {spend && !isSelected && (
                <span
                  style={{
                    position: "absolute",
                    bottom: 3,
                    width: 3,
                    height: 3,
                    borderRadius: "50%",
                    background: "var(--accent-color)",
                  }}
                />
              )}
            </button>
          );
        })}
      </div>

      {/* Footer actions */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          marginTop: "0.75rem",
          gap: 8,
        }}
      >
        <button
          onClick={() => {
            onSelect(today);
            setViewMonth(new Date(today.getFullYear(), today.getMonth(), 1));
            onClose();
          }}
          style={{
            flex: 1,
            padding: "0.4rem 0.6rem",
            fontSize: "0.7rem",
            fontWeight: 700,
            background: "var(--bg-secondary)",
            color: "var(--text-primary)",
            border: "1px solid var(--border-color)",
            borderRadius: 8,
            cursor: "pointer",
          }}
        >
          Today
        </button>
        {selectedDate && (
          <button
            onClick={() => {
              onSelect(null);
              onClose();
            }}
            style={{
              flex: 1,
              padding: "0.4rem 0.6rem",
              fontSize: "0.7rem",
              fontWeight: 700,
              background: "transparent",
              color: "var(--text-secondary)",
              border: "1px solid var(--border-color)",
              borderRadius: 8,
              cursor: "pointer",
            }}
          >
            Clear filter
          </button>
        )}
      </div>
    </div>
  );
}

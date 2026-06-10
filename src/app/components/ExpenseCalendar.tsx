"use client";

import { useState, useMemo, useEffect, useRef, type RefObject } from "react";
import { createPortal } from "react-dom";

/**
 * Date-jump calendar for the Expense Intelligence widget.
 *
 * Rendered via a React portal to `document.body` so it escapes the bento
 * card's `overflow: hidden` (which is needed for the scrollable list
 * underneath but was previously clipping the popover). Position is
 * computed from the trigger button's bounding rect with auto-flip to
 * above the button if there isn't enough room below.
 *
 * Each day cell is heat-tinted by the day's spend total (red intensity
 * scales with the brightest day in the visible month), shows a hover
 * tooltip with the day's amount + txn count, and highlights today
 * (dashed outline) and the currently selected date (filled accent).
 *
 * All date math is IST-pinned to match the dashboard's clock + finance
 * intelligence (Asia/Kolkata).
 */

interface ExpenseLite {
  date: string | Date;
  amount: number;
}

interface ExpenseCalendarProps {
  /**
   * Ref to the button that opened the calendar. Used to anchor the
   * popover; the calendar reads its position via getBoundingClientRect.
   */
  anchorRef: RefObject<HTMLElement | null>;
  expenses: ExpenseLite[];
  selectedDate: Date | null;
  onSelect: (date: Date | null) => void;
  onClose: () => void;
}

const IST_TZ = "Asia/Kolkata";
const POPOVER_WIDTH = 280;
const POPOVER_HEIGHT_ESTIMATE = 360;
const VIEWPORT_MARGIN = 8;

function toIST(d: Date | string): Date {
  return new Date(new Date(d).toLocaleString("en-US", { timeZone: IST_TZ }));
}

function dateKey(d: Date): string {
  const ist = toIST(d);
  return `${ist.getFullYear()}-${String(ist.getMonth() + 1).padStart(2, "0")}-${String(ist.getDate()).padStart(2, "0")}`;
}

const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];

export function ExpenseCalendar({
  anchorRef,
  expenses,
  selectedDate,
  onSelect,
  onClose,
}: ExpenseCalendarProps) {
  const today = useMemo(() => toIST(new Date()), []);
  const popoverRef = useRef<HTMLDivElement>(null);

  // SSR safety — only mount portal contents on the client.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // Compute viewport-relative position from the anchor. Recompute on
  // resize and any scroll (capture phase so nested scroll containers
  // also trigger an update).
  const [position, setPosition] = useState<{ top: number; left: number } | null>(
    null,
  );

  useEffect(() => {
    if (!mounted) return;
    const updatePosition = () => {
      if (!anchorRef.current) return;
      const rect = anchorRef.current.getBoundingClientRect();

      let left = rect.right - POPOVER_WIDTH;
      let top = rect.bottom + 8;

      // Keep on screen horizontally.
      if (left < VIEWPORT_MARGIN) left = VIEWPORT_MARGIN;
      if (left + POPOVER_WIDTH > window.innerWidth - VIEWPORT_MARGIN) {
        left = window.innerWidth - POPOVER_WIDTH - VIEWPORT_MARGIN;
      }

      // Flip to above the trigger if there isn't enough room below.
      if (top + POPOVER_HEIGHT_ESTIMATE > window.innerHeight - VIEWPORT_MARGIN) {
        top = Math.max(VIEWPORT_MARGIN, rect.top - POPOVER_HEIGHT_ESTIMATE - 8);
      }

      setPosition({ top, left });
    };

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [mounted, anchorRef]);

  const [viewMonth, setViewMonth] = useState<Date>(() => {
    const base = selectedDate ? toIST(selectedDate) : today;
    return new Date(base.getFullYear(), base.getMonth(), 1);
  });

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

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    const onDown = (e: MouseEvent) => {
      // Don't close if the click is inside the popover OR on the anchor
      // button (the anchor's own onClick handles toggle).
      const target = e.target as Node;
      if (popoverRef.current && popoverRef.current.contains(target)) return;
      if (anchorRef.current && anchorRef.current.contains(target)) return;
      onClose();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onDown);
    };
  }, [onClose, anchorRef]);

  if (!mounted || !position) return null;

  const todayKey = dateKey(today);
  const selectedKey = selectedDate ? dateKey(selectedDate) : null;
  const monthLabel = viewMonth.toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });

  const popover = (
    <div
      ref={popoverRef}
      role="dialog"
      aria-label="Jump to a specific date"
      style={{
        position: "fixed",
        top: position.top,
        left: position.left,
        width: POPOVER_WIDTH,
        zIndex: 9999,
        background: "var(--bg-primary, #fff)",
        border: "1px solid var(--border-color)",
        borderRadius: "var(--radius-lg, 12px)",
        boxShadow: "0 18px 48px rgba(0,0,0,0.18)",
        padding: "0.85rem",
        animation: "scaleIn 0.15s ease-out",
      }}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Month header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: "0.6rem",
        }}
      >
        <button
          onClick={() => goToMonth(-1)}
          aria-label="Previous month"
          style={{
            width: 26,
            height: 26,
            borderRadius: 7,
            border: "1px solid var(--border-color)",
            background: "var(--bg-secondary)",
            cursor: "pointer",
            fontWeight: 800,
            color: "var(--text-primary)",
            fontSize: "0.85rem",
          }}
        >
          ‹
        </button>
        <span
          style={{
            fontWeight: 800,
            fontSize: "0.85rem",
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
            width: 26,
            height: 26,
            borderRadius: 7,
            border: "1px solid var(--border-color)",
            background: "var(--bg-secondary)",
            cursor: "pointer",
            fontWeight: 800,
            color: "var(--text-primary)",
            fontSize: "0.85rem",
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
          gap: 3,
          marginBottom: 4,
        }}
      >
        {WEEKDAYS.map((d, i) => (
          <div
            key={i}
            style={{
              fontSize: "0.58rem",
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
          gap: 3,
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
              ? `rgba(239, 68, 68, ${0.1 + heat * 0.32})`
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
                borderRadius: 6,
                background,
                color,
                opacity: cell.inMonth ? 1 : 0.4,
                cursor: "pointer",
                fontSize: "0.72rem",
                fontWeight: isToday || isSelected ? 800 : 600,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                position: "relative",
                transition: "transform 0.1s ease",
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.transform = "scale(1.06)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.transform = "scale(1)";
              }}
            >
              {cell.date.getDate()}
            </button>
          );
        })}
      </div>

      {/* Footer actions */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          marginTop: "0.6rem",
          gap: 6,
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
            padding: "0.35rem 0.5rem",
            fontSize: "0.66rem",
            fontWeight: 700,
            background: "var(--bg-secondary)",
            color: "var(--text-primary)",
            border: "1px solid var(--border-color)",
            borderRadius: 7,
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
              padding: "0.35rem 0.5rem",
              fontSize: "0.66rem",
              fontWeight: 700,
              background: "transparent",
              color: "var(--text-secondary)",
              border: "1px solid var(--border-color)",
              borderRadius: 7,
              cursor: "pointer",
            }}
          >
            Clear filter
          </button>
        )}
      </div>
    </div>
  );

  return createPortal(popover, document.body);
}

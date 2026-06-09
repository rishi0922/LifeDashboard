/**
 * Server-side spend analytics for the chat agent.
 *
 * The chat route used to dump 150 raw expense rows into the Gemini prompt
 * and ask the model to compute totals / trends / anomalies in-token. That
 * works for trivial questions ("how much on Food this week") but falls
 * over for anything pattern-y ("did I go over the board?") — the model
 * either hallucinates a baseline or gives a generic answer.
 *
 * This module precomputes the figures the model would otherwise have to
 * derive, packaged as a single `SPEND INTELLIGENCE` text block that gets
 * injected into the prompt above the raw rows. Gemini's job becomes
 * narration rather than arithmetic.
 *
 * All week/month boundaries are evaluated in IST so "this week" matches
 * what the user sees in the FinanceGrid widget.
 */

const IST_TZ = "Asia/Kolkata";

export type ExpenseLite = {
  amount: number;
  merchant: string;
  category: string;
  date: Date | string;
};

/**
 * Re-anchor a Date / ISO string to IST local clock. After this, getDay /
 * getMonth / getDate read IST values regardless of the host TZ. We rely
 * on Node's Intl support; the project already uses this trick in
 * src/app/api/chat/route.ts.
 */
function toIST(d: Date | string): Date {
  return new Date(new Date(d).toLocaleString("en-US", { timeZone: IST_TZ }));
}

/** Monday-anchored start of week, in IST. */
function startOfWeekIST(d: Date): Date {
  const ist = toIST(d);
  const dow = ist.getDay(); // 0=Sun..6=Sat
  const diff = dow === 0 ? -6 : 1 - dow;
  const start = new Date(ist);
  start.setDate(ist.getDate() + diff);
  start.setHours(0, 0, 0, 0);
  return start;
}

function startOfMonthIST(d: Date): Date {
  const ist = toIST(d);
  return new Date(ist.getFullYear(), ist.getMonth(), 1, 0, 0, 0, 0);
}

function fmtDateRange(start: Date, end: Date): string {
  const f = (x: Date) =>
    x.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
  return `${f(start)} – ${f(end)}`;
}

function inr(n: number): string {
  return `₹${Math.round(n).toLocaleString("en-IN")}`;
}

function pctStr(n: number): string {
  const sign = n >= 0 ? "+" : "";
  return `${sign}${Math.round(n)}%`;
}

export interface WeekInsight {
  rangeLabel: string;
  start: Date;
  end: Date;
  total: number;
  txnCount: number;
  daysElapsed: number; // 1..7 — partial weeks return < 7
  daysInWindow: number; // 7 for past weeks, 1..7 for the current week
  dailyAvg: number;
  pacedTotal: number; // linear extrapolation of daysElapsed→7
  byCategory: Record<string, { total: number; count: number; pct: number }>;
  topMerchants: Array<{ merchant: string; visits: number; total: number }>;
  largestTxn: ExpenseLite | null;
  byDay: Array<{ label: string; date: Date; total: number; count: number }>;
}

function dayLabel(d: Date): string {
  return d.toLocaleDateString("en-US", { weekday: "short" });
}

export function computeWeekInsight(
  expenses: ExpenseLite[],
  weekOffset = 0,
  now: Date = new Date(),
): WeekInsight {
  const today = toIST(now);
  const start = startOfWeekIST(today);
  start.setDate(start.getDate() - 7 * weekOffset);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  end.setHours(23, 59, 59, 999);

  // For the current week, "elapsed" caps at today; for past weeks, it's 7.
  let daysElapsed = 7;
  if (weekOffset === 0) {
    daysElapsed = Math.min(
      7,
      Math.floor((today.getTime() - start.getTime()) / 86_400_000) + 1,
    );
  }

  const inWeek = expenses.filter((e) => {
    const ed = toIST(e.date);
    return ed >= start && ed <= end;
  });
  const total = inWeek.reduce((s, e) => s + e.amount, 0);

  const byDay: WeekInsight["byDay"] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    byDay.push({ label: dayLabel(d), date: d, total: 0, count: 0 });
  }
  for (const e of inWeek) {
    const idx = Math.floor(
      (toIST(e.date).getTime() - start.getTime()) / 86_400_000,
    );
    if (idx >= 0 && idx < 7) {
      byDay[idx].total += e.amount;
      byDay[idx].count += 1;
    }
  }

  const byCategory: WeekInsight["byCategory"] = {};
  for (const e of inWeek) {
    if (!byCategory[e.category])
      byCategory[e.category] = { total: 0, count: 0, pct: 0 };
    byCategory[e.category].total += e.amount;
    byCategory[e.category].count += 1;
  }
  for (const c of Object.keys(byCategory)) {
    byCategory[c].pct = total > 0 ? (byCategory[c].total / total) * 100 : 0;
  }

  const merchantMap: Record<string, { visits: number; total: number }> = {};
  for (const e of inWeek) {
    if (!merchantMap[e.merchant])
      merchantMap[e.merchant] = { visits: 0, total: 0 };
    merchantMap[e.merchant].visits += 1;
    merchantMap[e.merchant].total += e.amount;
  }
  const topMerchants = Object.entries(merchantMap)
    .map(([merchant, v]) => ({ merchant, ...v }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 5);

  let largestTxn: ExpenseLite | null = null;
  for (const e of inWeek) {
    if (!largestTxn || e.amount > largestTxn.amount) largestTxn = e;
  }

  const dailyAvg = daysElapsed > 0 ? total / daysElapsed : 0;
  const pacedTotal = daysElapsed > 0 ? (total / daysElapsed) * 7 : 0;

  return {
    rangeLabel: fmtDateRange(start, end),
    start,
    end,
    total,
    txnCount: inWeek.length,
    daysElapsed,
    daysInWindow: 7,
    dailyAvg,
    pacedTotal,
    byCategory,
    topMerchants,
    largestTxn,
    byDay,
  };
}

/**
 * "Usual" baseline = average across the last N *completed* weeks. We
 * deliberately exclude the current (in-progress) week so we're comparing
 * apples to apples when the prompt asks about anomalies.
 */
export function computeUsualWeekly(
  expenses: ExpenseLite[],
  trailingWeeks = 4,
  now: Date = new Date(),
): { avgWeeklyTotal: number; avgByCategory: Record<string, number> } {
  let runningTotal = 0;
  const categoryTotals: Record<string, number> = {};

  for (let w = 1; w <= trailingWeeks; w++) {
    const wi = computeWeekInsight(expenses, w, now);
    runningTotal += wi.total;
    for (const [cat, v] of Object.entries(wi.byCategory)) {
      categoryTotals[cat] = (categoryTotals[cat] || 0) + v.total;
    }
  }

  const avgByCategory: Record<string, number> = {};
  for (const [cat, t] of Object.entries(categoryTotals)) {
    avgByCategory[cat] = t / trailingWeeks;
  }

  return { avgWeeklyTotal: runningTotal / trailingWeeks, avgByCategory };
}

/**
 * Flag categories whose paced weekly spend is meaningfully above or below
 * the trailing 4-week baseline. We compare paced (not raw) so a Wednesday
 * read isn't dismissed as "under" just because the week is incomplete.
 */
export function detectAnomalies(
  current: WeekInsight,
  usual: { avgByCategory: Record<string, number> },
  threshold = 0.3,
): Array<{
  category: string;
  deltaPct: number;
  direction: "over" | "under";
  currentTotal: number; // paced
  usualTotal: number;
}> {
  const out: Array<{
    category: string;
    deltaPct: number;
    direction: "over" | "under";
    currentTotal: number;
    usualTotal: number;
  }> = [];

  const cats = new Set([
    ...Object.keys(current.byCategory),
    ...Object.keys(usual.avgByCategory),
  ]);

  const paceFactor =
    current.daysElapsed > 0 ? 7 / current.daysElapsed : 1;

  for (const cat of cats) {
    const rawCur = current.byCategory[cat]?.total ?? 0;
    const cur = rawCur * paceFactor;
    const u = usual.avgByCategory[cat] ?? 0;

    if (u <= 0 && rawCur <= 0) continue;
    if (u <= 0) {
      // Brand-new spending category not seen in the baseline window —
      // flag only if the raw amount is non-trivial.
      if (rawCur >= 500)
        out.push({
          category: cat,
          deltaPct: 100,
          direction: "over",
          currentTotal: cur,
          usualTotal: 0,
        });
      continue;
    }

    const delta = (cur - u) / u;
    if (Math.abs(delta) >= threshold) {
      out.push({
        category: cat,
        deltaPct: Math.round(delta * 100),
        direction: delta > 0 ? "over" : "under",
        currentTotal: cur,
        usualTotal: u,
      });
    }
  }

  out.sort((a, b) => Math.abs(b.deltaPct) - Math.abs(a.deltaPct));
  return out;
}

export interface MonthToDateInsight {
  monthLabel: string;
  total: number;
  txnCount: number;
  daysElapsed: number;
  daysInMonth: number;
  pacedTotal: number;
  lastMonthSameDayTotal: number | null;
  lastMonthFullTotal: number | null;
  topCategory: { name: string; total: number } | null;
}

export function computeMonthToDate(
  expenses: ExpenseLite[],
  now: Date = new Date(),
): MonthToDateInsight {
  const today = toIST(now);
  const monthStart = startOfMonthIST(today);
  const daysElapsed = today.getDate();
  const daysInMonth = new Date(
    today.getFullYear(),
    today.getMonth() + 1,
    0,
  ).getDate();

  const inMonth = expenses.filter((e) => {
    const ed = toIST(e.date);
    return ed >= monthStart && ed <= today;
  });
  const total = inMonth.reduce((s, e) => s + e.amount, 0);

  const lastMonthStart = new Date(
    today.getFullYear(),
    today.getMonth() - 1,
    1,
    0,
    0,
    0,
    0,
  );
  const lastMonthSameDayEnd = new Date(
    today.getFullYear(),
    today.getMonth() - 1,
    daysElapsed,
    23,
    59,
    59,
    999,
  );
  const lastMonthSameDay = expenses.filter((e) => {
    const ed = toIST(e.date);
    return ed >= lastMonthStart && ed <= lastMonthSameDayEnd;
  });
  const lastMonthSameDayTotal =
    lastMonthSameDay.length > 0
      ? lastMonthSameDay.reduce((s, e) => s + e.amount, 0)
      : null;

  const lastMonthEnd = new Date(
    today.getFullYear(),
    today.getMonth(),
    0,
    23,
    59,
    59,
    999,
  );
  const lastMonthAll = expenses.filter((e) => {
    const ed = toIST(e.date);
    return ed >= lastMonthStart && ed <= lastMonthEnd;
  });
  const lastMonthFullTotal =
    lastMonthAll.length > 0
      ? lastMonthAll.reduce((s, e) => s + e.amount, 0)
      : null;

  const catTotals: Record<string, number> = {};
  for (const e of inMonth)
    catTotals[e.category] = (catTotals[e.category] || 0) + e.amount;
  let topCategory: MonthToDateInsight["topCategory"] = null;
  for (const [name, t] of Object.entries(catTotals)) {
    if (!topCategory || t > topCategory.total) topCategory = { name, total: t };
  }

  return {
    monthLabel: today.toLocaleDateString("en-US", {
      month: "long",
      year: "numeric",
    }),
    total,
    txnCount: inMonth.length,
    daysElapsed,
    daysInMonth,
    pacedTotal:
      daysElapsed > 0 ? (total / daysElapsed) * daysInMonth : 0,
    lastMonthSameDayTotal,
    lastMonthFullTotal,
    topCategory,
  };
}

/**
 * Assemble the human-readable insight block. This is the only function
 * the chat route needs to call — everything else is internal. Designed
 * to be safe to drop in front of the raw expense list as one string.
 */
export function buildSpendIntelligenceBlock(
  expenses: ExpenseLite[],
  now: Date = new Date(),
): string {
  if (!expenses || expenses.length === 0) {
    return "SPEND INTELLIGENCE: no expenses on record yet — say so plainly if asked about spend patterns.";
  }

  const thisWeek = computeWeekInsight(expenses, 0, now);
  const lastWeek = computeWeekInsight(expenses, 1, now);
  const usual = computeUsualWeekly(expenses, 4, now);
  const anomalies = detectAnomalies(thisWeek, usual);
  const mtd = computeMonthToDate(expenses, now);

  const wowDelta =
    lastWeek.total > 0
      ? ((thisWeek.pacedTotal - lastWeek.total) / lastWeek.total) * 100
      : null;
  const vsUsualDelta =
    usual.avgWeeklyTotal > 0
      ? ((thisWeek.pacedTotal - usual.avgWeeklyTotal) /
          usual.avgWeeklyTotal) *
        100
      : null;

  const lines: string[] = [];
  lines.push("SPEND INTELLIGENCE (pre-computed, IST — TRUST THESE NUMBERS)");
  lines.push("──────────────────────────────────────────────────────────");

  lines.push(
    `THIS WEEK (${thisWeek.rangeLabel}, ${thisWeek.daysElapsed}/7 days elapsed):`,
  );
  lines.push(
    `  spent so far: ${inr(thisWeek.total)} across ${thisWeek.txnCount} txn${
      thisWeek.txnCount === 1 ? "" : "s"
    }`,
  );
  lines.push(
    `  daily avg so far: ${inr(thisWeek.dailyAvg)}, on pace for ${inr(
      thisWeek.pacedTotal,
    )} by Sunday`,
  );

  lines.push(`LAST WEEK (${lastWeek.rangeLabel}): ${inr(lastWeek.total)}`);
  if (wowDelta !== null) {
    lines.push(
      `  this week's pace vs last week's actual: ${pctStr(wowDelta)}`,
    );
  }

  lines.push(
    `USUAL WEEKLY BASELINE (trailing 4 completed weeks): ${inr(
      usual.avgWeeklyTotal,
    )}`,
  );
  if (vsUsualDelta !== null) {
    const verdict =
      vsUsualDelta > 15
        ? "OVER THE BOARD"
        : vsUsualDelta < -15
          ? "UNDER usual"
          : "in line with usual";
    lines.push(
      `  this week's pace vs baseline: ${pctStr(vsUsualDelta)} — ${verdict}`,
    );
  }
  lines.push("");

  lines.push("THIS WEEK BY CATEGORY (highest spend first):");
  const catRows = Object.entries(thisWeek.byCategory).sort(
    (a, b) => b[1].total - a[1].total,
  );
  if (catRows.length === 0) {
    lines.push("  (no spend yet this week)");
  } else {
    for (const [cat, v] of catRows) {
      const usualCat = usual.avgByCategory[cat] ?? 0;
      const usualNote =
        usualCat > 0
          ? ` — usual weekly ${inr(usualCat)} (pace ${pctStr(
              ((v.total * (7 / Math.max(thisWeek.daysElapsed, 1)) -
                usualCat) /
                usualCat) *
                100,
            )})`
          : " — no prior baseline";
      lines.push(
        `  ${cat}: ${inr(v.total)} (${Math.round(v.pct)}% of week, ${
          v.count
        } txn${v.count === 1 ? "" : "s"})${usualNote}`,
      );
    }
  }
  lines.push("");

  lines.push("TOP MERCHANTS THIS WEEK:");
  if (thisWeek.topMerchants.length === 0) {
    lines.push("  (none)");
  } else {
    for (const m of thisWeek.topMerchants) {
      lines.push(`  ${m.merchant}: ${m.visits}× — ${inr(m.total)}`);
    }
  }
  lines.push("");

  if (thisWeek.largestTxn) {
    const d = toIST(thisWeek.largestTxn.date);
    lines.push(
      `LARGEST TXN THIS WEEK: ${thisWeek.largestTxn.merchant} — ${inr(
        thisWeek.largestTxn.amount,
      )} on ${d.toLocaleDateString("en-IN", {
        weekday: "short",
        day: "numeric",
        month: "short",
      })} (${thisWeek.largestTxn.category})`,
    );
    lines.push("");
  }

  lines.push("DAILY PATTERN THIS WEEK:");
  for (const d of thisWeek.byDay) {
    const marker = d.total === 0 ? " · idle" : "";
    lines.push(
      `  ${d.label}: ${inr(d.total)} (${d.count} txn${
        d.count === 1 ? "" : "s"
      })${marker}`,
    );
  }
  lines.push("");

  // ── LAST WEEK breakdown ────────────────────────────────────────────
  // Without this section, the model has no per-category data for last
  // week and defaults to "no data" when asked. Earlier version only had
  // a single LAST WEEK total line which caused that failure mode.
  lines.push(`LAST WEEK BY CATEGORY (${lastWeek.rangeLabel}, highest spend first):`);
  const lastCatRows = Object.entries(lastWeek.byCategory).sort(
    (a, b) => b[1].total - a[1].total,
  );
  if (lastCatRows.length === 0) {
    lines.push("  (no spend recorded last week)");
  } else {
    for (const [cat, v] of lastCatRows) {
      lines.push(
        `  ${cat}: ${inr(v.total)} (${Math.round(v.pct)}% of week, ${
          v.count
        } txn${v.count === 1 ? "" : "s"})`,
      );
    }
  }
  lines.push("");

  lines.push("LAST WEEK TOP MERCHANTS:");
  if (lastWeek.topMerchants.length === 0) {
    lines.push("  (none)");
  } else {
    for (const m of lastWeek.topMerchants) {
      lines.push(`  ${m.merchant}: ${m.visits}× — ${inr(m.total)}`);
    }
  }
  lines.push("");

  if (lastWeek.largestTxn) {
    const d = toIST(lastWeek.largestTxn.date);
    lines.push(
      `LARGEST TXN LAST WEEK: ${lastWeek.largestTxn.merchant} — ${inr(
        lastWeek.largestTxn.amount,
      )} on ${d.toLocaleDateString("en-IN", {
        weekday: "short",
        day: "numeric",
        month: "short",
      })} (${lastWeek.largestTxn.category})`,
    );
    lines.push("");
  }

  if (anomalies.length > 0) {
    lines.push("CATEGORY ANOMALIES vs USUAL BASELINE (pace-adjusted):");
    for (const a of anomalies) {
      const dir = a.direction === "over" ? "ABOVE" : "BELOW";
      lines.push(
        `  ${a.category}: paced ${inr(a.currentTotal)} vs usual ${inr(
          a.usualTotal,
        )} — ${Math.abs(a.deltaPct)}% ${dir} typical`,
      );
    }
    lines.push("");
  }

  lines.push(`MONTH-TO-DATE (${mtd.monthLabel}):`);
  lines.push(
    `  spent: ${inr(mtd.total)} over ${mtd.daysElapsed} of ${
      mtd.daysInMonth
    } days, ${mtd.txnCount} txn${mtd.txnCount === 1 ? "" : "s"}`,
  );
  lines.push(
    `  linear pace: ${inr(mtd.pacedTotal)} by month-end`,
  );
  if (mtd.lastMonthSameDayTotal !== null) {
    const sd =
      ((mtd.total - mtd.lastMonthSameDayTotal) / mtd.lastMonthSameDayTotal) *
      100;
    lines.push(
      `  vs same-day last month: ${inr(
        mtd.lastMonthSameDayTotal,
      )} (${pctStr(sd)})`,
    );
  }
  if (mtd.lastMonthFullTotal !== null) {
    lines.push(`  last month full total: ${inr(mtd.lastMonthFullTotal)}`);
  }
  if (mtd.topCategory) {
    lines.push(
      `  top category MTD: ${mtd.topCategory.name} (${inr(
        mtd.topCategory.total,
      )})`,
    );
  }

  return lines.join("\n");
}

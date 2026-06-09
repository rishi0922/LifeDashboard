/**
 * Monthly Budget Guardian
 * -----------------------
 * Ensures that for the current month there exists:
 *   1. A "Set up [Month YYYY] budget" task with category=Urgent
 *      (idempotent via Task.externalId = `budget-setup-YYYY-MM`)
 *   2. A 1st-of-month 9:30–10:00 AM IST Google Calendar event
 *      (idempotent via extendedProperties.private.monthlyBudgetMonth)
 *
 * Designed for lazy bootstrap — called from a client component on
 * dashboard mount. Safe to call repeatedly; only the first invocation
 * per month per user mutates anything.
 */

import { prisma } from "./prisma";

const IST_TZ = "Asia/Kolkata";

function toIST(d: Date | string): Date {
  return new Date(new Date(d).toLocaleString("en-US", { timeZone: IST_TZ }));
}

function monthKey(d: Date): string {
  const ist = toIST(d);
  return `${ist.getFullYear()}-${String(ist.getMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(d: Date): string {
  return toIST(d).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });
}

/**
 * Build an RFC3339 datetime pinned to IST for the 1st of d's month at
 * the given hour:minute. Done by string composition so we don't rely on
 * V8 timezone math (matches the project's chat-route pattern).
 */
function firstOfMonthISTString(d: Date, hour: number, minute: number): string {
  const ist = toIST(d);
  const y = ist.getFullYear();
  const m = String(ist.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}-01T${String(hour).padStart(2, "0")}:${String(
    minute,
  ).padStart(2, "0")}:00+05:30`;
}

export interface BudgetEnsureResult {
  monthKey: string;
  monthLabel: string;
  taskCreated: boolean;
  taskId: string | null;
  eventCreated: boolean;
  eventId: string | null;
  errors: string[];
}

export async function ensureMonthlyBudgetSetup(params: {
  userId: string;
  accessToken: string | null;
  now?: Date;
}): Promise<BudgetEnsureResult> {
  const now = params.now || new Date();
  const mKey = monthKey(now);
  const mLabel = monthLabel(now);
  const externalId = `budget-setup-${mKey}`;
  const taskTitle = `🎯 Set up ${mLabel} budget`;

  const result: BudgetEnsureResult = {
    monthKey: mKey,
    monthLabel: mLabel,
    taskCreated: false,
    taskId: null,
    eventCreated: false,
    eventId: null,
    errors: [],
  };

  // ── Task ─────────────────────────────────────────────────────────
  try {
    const existing = await prisma.task.findUnique({ where: { externalId } });
    if (existing) {
      result.taskId = existing.id;
    } else {
      const created = await prisma.task.create({
        data: {
          title: taskTitle,
          description: `Plan ${mLabel} budget: review last month's spend by category, set caps for Food, Travel, Shopping, Bills, Subscriptions. Highest priority — block 9:30 AM on the 1st for this.`,
          category: "Urgent",
          status: "TODO",
          isAiGenerated: true,
          externalId,
          userId: params.userId,
        },
      });
      result.taskId = created.id;
      result.taskCreated = true;
    }
  } catch (err: any) {
    result.errors.push(`task: ${err?.message || "unknown"}`);
  }

  // ── Calendar event ───────────────────────────────────────────────
  if (!params.accessToken) {
    result.errors.push("no accessToken — skipped calendar event");
    return result;
  }

  try {
    const listUrl = `https://www.googleapis.com/calendar/v3/calendars/primary/events?privateExtendedProperty=${encodeURIComponent(
      `monthlyBudgetMonth=${mKey}`,
    )}&maxResults=1`;
    const listRes = await fetch(listUrl, {
      headers: { Authorization: `Bearer ${params.accessToken}` },
    });

    if (listRes.ok) {
      const listJson = await listRes.json();
      if (Array.isArray(listJson.items) && listJson.items.length > 0) {
        result.eventId = listJson.items[0].id;
        return result;
      }
    }

    const startDT = firstOfMonthISTString(now, 9, 30);
    const endDT = firstOfMonthISTString(now, 10, 0);

    const createRes = await fetch(
      "https://www.googleapis.com/calendar/v3/calendars/primary/events",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${params.accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          summary: `🎯 Set up ${mLabel} Budget`,
          description:
            "Auto-scheduled budget planning block. Review last month's spend by category, set caps for the new month, flag any subscriptions to cut.",
          start: { dateTime: startDT, timeZone: "Asia/Kolkata" },
          end: { dateTime: endDT, timeZone: "Asia/Kolkata" },
          colorId: "11", // tomato red — high priority
          reminders: {
            useDefault: false,
            overrides: [
              { method: "popup", minutes: 15 },
              { method: "popup", minutes: 0 },
            ],
          },
          extendedProperties: {
            private: {
              monthlyBudgetMonth: mKey,
              source: "command_center_budget_guardian",
            },
          },
        }),
      },
    );

    if (createRes.ok) {
      const ev = await createRes.json();
      result.eventId = ev.id;
      result.eventCreated = true;
    } else {
      const errBody = await createRes.text().catch(() => "");
      result.errors.push(
        `calendar: ${createRes.status} ${errBody.slice(0, 200)}`,
      );
    }
  } catch (err: any) {
    result.errors.push(`calendar: ${err?.message || "unknown"}`);
  }

  return result;
}

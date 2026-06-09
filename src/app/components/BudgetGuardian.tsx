"use client";

import { useEffect } from "react";
import { useSession } from "next-auth/react";

/**
 * Fire-and-forget background trigger.
 *
 * On every dashboard mount (post-authentication), asks the server to
 * ensure the current month's "Set up budget" task + 1st-of-month
 * 9:30 AM calendar block exist. The server call is idempotent
 * end-to-end (Task.externalId + Calendar extendedProperty) so a tab
 * refresh, a tab restore, or a second dashboard window won't duplicate.
 *
 * Hidden — renders nothing. Mirrors the InboxScout pattern.
 */
export function BudgetGuardian() {
  const { status } = useSession();

  useEffect(() => {
    if (status !== "authenticated") return;

    let cancelled = false;

    const run = async () => {
      try {
        const res = await fetch("/api/budget/ensure", { method: "POST" });
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled) return;

        // Tell the affected widgets to re-fetch so freshly created entries
        // appear immediately rather than waiting for their next poll.
        if (data.taskCreated) {
          window.dispatchEvent(new Event("refreshTasks"));
        }
        if (data.eventCreated) {
          window.dispatchEvent(new Event("refreshCalendar"));
        }

        if (data.taskCreated || data.eventCreated) {
          console.log(
            `Budget Guardian: ${data.monthLabel} — task ${
              data.taskCreated ? "created" : "exists"
            }, event ${data.eventCreated ? "created" : "exists"}.`,
          );
        }
      } catch {
        // Silent — guardian is best-effort, errors must not break the UI.
      }
    };

    run();

    return () => {
      cancelled = true;
    };
  }, [status]);

  return null;
}

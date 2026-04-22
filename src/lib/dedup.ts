/**
 * Dedup helpers for email-driven pipelines.
 *
 * Background
 * ----------
 * The old Gmail → Gemini → Calendar sync de-duplicated on `Task.externalId`.
 * That broke in two ways:
 *   1. Calendar events created from emails were never recorded against the
 *      email, so the NEXT poll cycle found the same unread email and asked
 *      Gemini to create another event → duplicate calendar events.
 *   2. If Gemini decided an email was "ignored", we never remembered that
 *      decision, so every 10-minute poll paid the AI cost again.
 *
 * Fix
 * ---
 * The `ProcessedEmail` Prisma model records every `(userId, emailId, purpose)`
 * tuple we've touched with its outcome. Before sending emails to Gemini we
 * filter out anything already in this table. After acting on the AI's output
 * we write a row — even when the outcome is "ignored" or "error".
 *
 * A second layer of defence: when we create Google Calendar events we set
 * `extendedProperties.private.dashboardEmailId` so Google itself can tell us
 * whether we've already created an event for that email.
 *
 * Custom Calendar event IDs are derived deterministically from the Gmail
 * message ID. Google rejects duplicate IDs with HTTP 409 — so even if two
 * sync jobs race, only one event can be created.
 */

import { prisma } from "./prisma";

export type EmailPurpose = "inbox_sync" | "finance_sync";
export type EmailOutcome = "task" | "event" | "expense" | "ignored" | "error";

/**
 * Given a list of Gmail message IDs, return the subset we have NOT yet
 * processed for this purpose. Failures are treated as "processed" so we
 * don't hammer a broken email forever — but caller can override.
 */
export async function filterUnprocessed(
  userId: string,
  emailIds: string[],
  purpose: EmailPurpose,
  opts: { includeErrors?: boolean } = {}
): Promise<string[]> {
  if (emailIds.length === 0) return [];
  const processed = await prisma.processedEmail.findMany({
    where: {
      userId,
      purpose,
      emailId: { in: emailIds },
      ...(opts.includeErrors ? {} : { NOT: { outcome: "error" } }),
    },
    select: { emailId: true },
  });
  const seen = new Set(processed.map((p: { emailId: string }) => p.emailId));
  return emailIds.filter((id) => !seen.has(id));
}

/**
 * Record an email as processed. Idempotent — safe to call multiple times for
 * the same (user, email, purpose) tuple.
 */
export async function markProcessed(params: {
  userId: string;
  emailId: string;
  purpose: EmailPurpose;
  outcome: EmailOutcome;
  externalRef?: string | null;
  subject?: string | null;
  snippet?: string | null;
}) {
  try {
    await prisma.processedEmail.upsert({
      where: {
        userId_emailId_purpose: {
          userId: params.userId,
          emailId: params.emailId,
          purpose: params.purpose,
        },
      },
      update: {
        outcome: params.outcome,
        externalRef: params.externalRef ?? null,
        subject: params.subject ?? null,
        snippet: params.snippet ?? null,
        processedAt: new Date(),
      },
      create: {
        userId: params.userId,
        emailId: params.emailId,
        purpose: params.purpose,
        outcome: params.outcome,
        externalRef: params.externalRef ?? null,
        subject: params.subject ?? null,
        snippet: params.snippet ?? null,
      },
    });
  } catch (e) {
    // Never let a dedup-bookkeeping failure crash the sync — just log it.
    console.warn("[dedup] markProcessed failed for", params.emailId, e);
  }
}

/**
 * Google Calendar allows client-specified event IDs. They must be base32hex
 * (characters `[a-v0-9]`), 5–1024 chars. We hash the email ID into that
 * alphabet to get a deterministic ID — so retries can never produce more
 * than one event per email.
 *
 * Ref: https://developers.google.com/calendar/api/v3/reference/events/insert
 */
export function calendarEventIdFromEmail(emailId: string): string {
  // Simple stable hash (djb2) → base32 in Google's allowed alphabet.
  let h1 = 5381;
  let h2 = 52711;
  for (let i = 0; i < emailId.length; i++) {
    const c = emailId.charCodeAt(i);
    h1 = (h1 * 33) ^ c;
    h2 = (h2 * 33) ^ c;
  }
  const alphabet = "0123456789abcdefghijklmnopqrstuv"; // 32 chars in [a-v0-9]
  const toBase32 = (n: number) => {
    let x = n >>> 0;
    let out = "";
    for (let i = 0; i < 7; i++) {
      out = alphabet[x & 31] + out;
      x = x >>> 5;
    }
    return out;
  };
  // 14 chars + prefix — well within Google's 5–1024 limit and still unique.
  return `cci${toBase32(h1)
/**
 * Dedup helpers for email-driven pipelines.
 *
 * Background
 * ----------
 * The old Gmail -> Gemini -> Calendar sync de-duplicated on Task.externalId.
 * That broke in two ways:
 *   1. Calendar events created from emails were never recorded against the
 *      email, so the NEXT poll cycle found the same unread email and asked
 *      Gemini to create another event, which produced duplicate events.
 *   2. If Gemini decided an email was "ignored", we never remembered that
 *      decision, so every 10-minute poll paid the AI cost again.
 *
 * Fix
 * ---
 * The ProcessedEmail Prisma model records every (userId, emailId, purpose)
 * tuple we have touched with its outcome. Before sending emails to Gemini we
 * filter out anything already in this table. After acting on the AI output
 * we write a row - even when the outcome is "ignored" or "error".
 *
 * A second layer of defence: when we create Google Calendar events we set
 * extendedProperties.private.dashboardEmailId so Google itself can tell us
 * whether we have already created an event for that email.
 *
 * Custom Calendar event IDs are derived deterministically from the Gmail
 * message ID. Google rejects duplicate IDs with HTTP 409, so even if two
 * sync jobs race, only one event can be created.
 */

import { prisma } from "./prisma";

export type EmailPurpose = "inbox_sync" | "finance_sync";
export type EmailOutcome = "task" | "event" | "expense" | "ignored" | "error" | "duplicate";

/**
 * Given a list of Gmail message IDs, return the subset we have NOT yet
 * processed for this purpose. Failures are treated as "processed" so we
 * do not hammer a broken email forever, but caller can override.
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
 * Record an email as processed. Idempotent: safe to call multiple times for
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
    // Never let a dedup-bookkeeping failure crash the sync - just log it.
    console.warn("[dedup] markProcessed failed for", params.emailId, e);
  }
}

/**
 * Check whether an expense with the same transaction fingerprint already
 * exists in the database. This catches the case where the same ₹500 Swiggy
 * purchase is reported by both the Swiggy order email and an HDFC Bank
 * debit alert — different email IDs but the same underlying transaction.
 *
 * Strategy:
 *   1. Fast path: exact fingerprint match (if the fingerprint field is
 *      already populated on older rows).
 *   2. Slow path: query by (userId, amount, date ±1 day) and compare
 *      normalised merchant names in-memory. This covers expenses created
 *      before the fingerprint column was added.
 *
 * Returns the existing expense ID if a duplicate is found, null otherwise.
 */
export async function findDuplicateExpense(params: {
  userId: string;
  fingerprint: string;
  normalizedMerchant: string;
  amount: number;
  date: Date;
}): Promise<string | null> {
  // Fast path: fingerprint match
  const fpMatch = await prisma.expense.findFirst({
    where: {
      userId: params.userId,
      fingerprint: params.fingerprint,
    },
    select: { id: true },
  });
  if (fpMatch) return fpMatch.id;

  // Slow path: amount + date window + merchant similarity
  const dayMs = 86_400_000;
  const dateLow = new Date(params.date.getTime() - dayMs);
  const dateHigh = new Date(params.date.getTime() + dayMs);

  const candidates = await prisma.expense.findMany({
    where: {
      userId: params.userId,
      amount: params.amount,
      date: { gte: dateLow, lte: dateHigh },
    },
    select: { id: true, merchant: true },
  });

  // Import dynamically to avoid circular dependency issues at module load
  const { normalizeMerchant } = await import("./expenseClassifier");

  for (const c of candidates) {
    if (normalizeMerchant(c.merchant) === params.normalizedMerchant) {
      return c.id;
    }
  }

  return null;
}

/**
 * Google Calendar allows client-specified event IDs. They must be base32hex
 * (characters [a-v0-9]), 5 to 1024 chars. We hash the email ID into that
 * alphabet to get a deterministic ID, so retries can never produce more
 * than one event per email.
 *
 * Ref: https://developers.google.com/calendar/api/v3/reference/events/insert
 */
export function calendarEventIdFromEmail(emailId: string): string {
  // Simple stable hash (djb2) then base32 in Google's allowed alphabet.
  let h1 = 5381;
  let h2 = 52711;
  for (let i = 0; i < emailId.length; i++) {
    const c = emailId.charCodeAt(i);
    h1 = (h1 * 33) ^ c;
    h2 = (h2 * 33) ^ c;
  }
  const alphabet = "0123456789abcdefghijklmnopqrstuv";
  const toBase32 = (n: number): string => {
    let x = n >>> 0;
    let out = "";
    for (let i = 0; i < 7; i++) {
      out = alphabet.charAt(x & 31) + out;
      x = x >>> 5;
    }
    return out;
  };
  const part1 = toBase32(h1);
  const part2 = toBase32(h2);
  return "cci" + part1 + part2;
}

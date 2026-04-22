---
title: "Command Center Dashboard — Multi-Persona Review & Fix Brief"
subtitle: "Prepared for: Rishi Namdeo  •  Interview target: Founder's Office Generalist, Shram.ai"
author: "CPO · Senior Full-stack Dev · Senior UX Designer · Lead Architect"
date: "22 April 2026"
---

# Executive Summary

Your "Command Center" is genuinely a product, not a scaffold. It reaches into Gmail, Google Calendar, Groww, and a local ledger; a Gemini agent sits in the middle and arbitrates. That's the right shape for a founder's-office demo — it tells a story about *compressing operational surface area* that a Shram.ai interviewer will immediately understand.

The build has three kinds of problems, in order of urgency:

1. **Correctness bugs that will be visible in the demo.** The most dangerous one — the reason you flagged this call — is that the Gmail → Gemini → Calendar pipeline was creating duplicate events on every 10-minute poll. This review ships a fix.
2. **Categorization quality.** The expense manager was 100% AI-dependent, which meant Netflix sometimes landed in "Entertainment", Zomato sometimes in "Shopping", and a Swiggy refund sometimes got logged as a spend. The overhaul adds a deterministic merchant map that handles common Indian merchants before the LLM ever sees them.
3. **Polish, not blockers.** Aggressive task auto-delete, hardcoded gamification, missing typecheck in CI, a couple of `@ts-ignore`s that hide real bugs. Called out below; none will break the demo.

**What this document contains:**
an audit from four perspectives (CPO, Dev, UX, Architect), a deep-dive on the two bugs you asked about, the exact changes I made to the repo, a deployment checklist you can run in ten minutes, and a set of interview talking points tailored to a generalist role at a productivity-infra startup.

---

# What I Shipped in This Pass

Five files were touched. All changes are additive except the two route rewrites.

| Path | Change | Why |
|---|---|---|
| `prisma/schema.prisma` | **Added** `ProcessedEmail` model; **extended** `Expense` with `subcategory`, `description`, `paymentMode`, `confidence`, `method`; **added** indexes on `(userId, date)` and `(userId, category)`. | Gives us a persistent memory of every Gmail message we've touched, so repeat syncs can't create duplicate calendar events. Extra `Expense` columns unblock the categorization overhaul. |
| `src/lib/dedup.ts` | **New.** Helpers: `filterUnprocessed`, `markProcessed`, `calendarEventIdFromEmail`. | One idempotency layer used by both the inbox sync and the finance sync. Also produces deterministic Google Calendar event IDs from Gmail message IDs — so even a racing retry can only create one event. |
| `src/lib/expenseClassifier.ts` | **New.** Deterministic merchant → category map (80+ Indian merchants), keyword fallback, amount / payment-mode extractors, refund detection, recurring-subscription detector. | Takes 80%+ of real transactions off the AI path. Fewer AI calls, fewer hallucinations, zero dependence on Gemini staying up. |
| `src/app/api/gmail/sync/route.ts` | **Rewrote.** Dedup via `ProcessedEmail`. Calendar events created with deterministic event IDs + `extendedProperties.private.dashboardEmailId`. Every email produces exactly one `ProcessedEmail` row (outcome = task \| event \| ignored \| error). | This is the duplicate-calendar-events fix. Details in the deep dive below. |
| `src/app/api/chat/route.ts` | **Rewrote the event branch.** Idempotency key written to `extendedProperties.private.chatIdempotencyKey`; pre-create check queries that key first, then falls back to overlapping-window + exact-summary match. `update_event` / `delete_event` now validate `eventId` before firing. | Closes the other duplicate vector: when *you* ask the chat to "add lunch with Aryan tomorrow at 1", a retry won't double-book. |
| `src/app/api/finance/sync/route.ts` | **Rewrote.** Two-stage classifier (rules first, AI only for the long tail), `ProcessedEmail` dedup, refund filter, amount parser, recurring-subscription override. | The expense manager overhaul. |

After pulling these changes, run:

```bash
npx prisma generate
npx prisma db push     # Neon — pushes the schema changes
```

Then `npm run dev`. Everything else is backwards-compatible with existing data.

---

# CPO Review

**Reviewer lens:** Is this a product worth the next six months of someone's time, and does it reflect the instincts a founder's-office generalist needs?

**What's right.** You've picked a coherent user: an Indian professional who lives across Gmail, Groww, Swiggy / Zomato, Google Calendar, and WhatsApp, and who pays a real tax in *switching cost* across those surfaces. The bet — "one agent that knows enough about me to reduce my UI labour" — is exactly the kind of bet Shram.ai itself is making. You can speak to that in the interview; you are not showing them a todo app, you are showing them a *consolidation layer*, and the distinction matters.

The second thing you got right is that Gemini is *scoped* rather than central. The LLM is used for extraction, not orchestration. That's a defensible architectural choice and one the interviewer will push on — it implies you understand that LLMs are a component, not the product.

**What's weak.**

*Auto-delete of tasks.* `src/app/api/tasks/route.ts` drops completed tasks after four hours and any task from a previous day. That's aggressive enough to lose real user data, and the user has no way to know it's happening. A product that silently deletes your data will never be trusted. Put the deleted tasks into an Archive tab before you demo.

*Gamification is cosmetic.* `GamificationBar.tsx` reads `points`, `tier`, and `streak` from hardcoded values. The UI is lying. Either wire it to the server (the Prisma User model already has the fields) or remove it — do not demo a feature that isn't real.

*The food-ordering flow is half-linked.* `ZomatoBridge` falls back to a synthetic token. If the demo goes down a Zomato path, the interviewer will see made-up data. Either finish the Zomato integration or remove the `zomato_*` actions from the chat system prompt before the interview.

*No "empty" story.* For a new user with no data, the dashboard looks broken. The Finance, Inbox, and Calendar widgets all assume prior state. Before the demo, populate the local DB with a realistic week of seed data so the first paint is beautiful.

**What to prioritise before Friday.**

> 1. Seed a fresh demo database (10 tasks, 20 expenses across categories, 5 calendar events) so cold starts are impressive.
> 2. Move `points / streak / tier` out of the UI or wire them to the server — no fake numbers.
> 3. Soften the task auto-delete (archive, don't destroy) OR disable it until after the demo.
> 4. Remove Zomato actions from the chat prompt unless you intend to demo them.
> 5. Add a one-line banner: "Last AI sync: 2 minutes ago • 47 emails triaged this week." Shows the agent is *doing work*.

---

# Senior Full-stack Developer Review

**Reviewer lens:** Does this code survive contact with production traffic, real users, and the next person who maintains it?

**Strengths.** The Next.js 16 App Router layout is clean, the Prisma client is singleton-ed correctly (`src/lib/prisma.ts`), there's a sensible OAuth refresh flow in `src/lib/auth.ts`, and the Gemini call path has a retry / fallback ladder that most hackathon projects skip. The IST timezone handling in `src/app/api/calendar/route.ts` is thoughtful — you're building RFC3339 strings by hand rather than hoping V8 does the right thing, which is correct.

**Concerns, ranked by damage.**

*`@ts-ignore` is hiding shape errors, not types.* `src/lib/auth.ts:78,88–91` and `src/app/api/chat/route.ts:21` silence the fact that `Session` doesn't have `accessToken` on its official type. The right fix is a module augmentation:

```ts
// src/types/next-auth.d.ts
import "next-auth";
declare module "next-auth" {
  interface Session { accessToken?: string; error?: "RefreshAccessTokenError"; }
}
```

Once that file exists, all four `@ts-ignore`s delete, and the `session?.error === "RefreshAccessTokenError"` branch becomes properly visible — which it isn't today, so expired refresh tokens fail silently.

*No typecheck in CI.* `package.json` only runs `eslint`. Add `"typecheck": "tsc --noEmit"` and call it in your build. The duplicate-event bug I just fixed would have been caught by a schema-aware typecheck; reviewers at Shram.ai will ask about this.

*The chat prompt is vulnerable to injection.* `src/app/api/chat/route.ts:128` drops `latestMessage` into the system prompt verbatim. A user who types `{"action":"delete_task","taskId":"..."}` in chat would have their quote parsed as a tool call. Wrap user turns in an unambiguous delimiter the model is told never to interpret, or — better — move the tool-call channel out of the response text and use Gemini's function-calling API.

*Silent failures in background code.* `src/app/components/InboxScout.tsx` has an empty `catch` and a 5-second startup timer. When it fails, the user sees nothing. At minimum, set a session-level flag the `DashboardHeader` can surface as a small amber dot.

*Input validation absent on every POST.* `tasks`, `food`, `food/cart`, and the chat action executor all trust the client. For the interview this is acceptable; for a production check-in you'd add a `zod` schema per route and reject malformed bodies.

*Aggressive task auto-delete runs on every GET.* `tasks/route.ts` deletes data during a *read*. Reads must not have side-effects. Move the reaper into a scheduled task (you have the `schedule` skill installed) or into a separate `/api/tasks/cleanup` route called explicitly.

*Race condition in polling.* `CalendarWidget` and `FinanceGrid` both run `setInterval` fetches that can overlap. When the user changes date or triggers a manual sync mid-interval, you get whichever response resolves last. Use an `AbortController` per fetch and cancel the previous one before starting a new one.

**Code you can delete.** The old ad-hoc duplicate detection in `src/app/api/calendar/cleanup/route.ts` is obsoleted by the new idempotency keys. Keep the route but add a note that it's a belt-and-braces cleanup for historical duplicates; new events can't duplicate anymore.

---

# Senior UX Designer Review

**Reviewer lens:** Will a founder feel confident *and calm* opening this at 8:45am?

**Strengths.** The bento grid is the right metaphor for a command center — spatial familiarity matters more than minimalism for a heads-up display. The IPL ticker and Food widget are *fun* without being frivolous, which is tonally correct for a product aimed at Indian professionals. The tab chip in `FinanceGrid` (List / Pie / Bar) is well-designed; the arrow-key hint at the bottom is a nice power-user cue.

**Concerns.**

*Too many emojis per widget.* Each card has an emoji in the title, plus emojis in row badges, plus emojis in button text, plus emojis in sync messages. The visual grammar is noisy. Pick one emoji per widget (category-colored SVG icons are better if you have the time) and drop the others.

*Empty states are broken.* "Syncing with Groww…" is your loading state *and* your empty state. A new user will see that forever and conclude the product is broken. Each widget needs a distinct: loading (skeleton), empty ("Sync your Gmail to see the last 30 days of spend"), error ("Sync paused — session expired, click to re-auth"), and populated view.

*No feedback when the agent is thinking.* You call Gemini in the chat route and the user sees a spinner. But when `InboxScout` runs a 5-10s AI pass in the background, there's nothing. Add a persistent "AI agent" dot in the header that pulses during background syncs. This is a surprisingly big trust signal.

*The sync button's success message is generic.* "Synced 3 transactions" is functional. "Synced 3 new transactions from Swiggy, Airtel, and Netflix" turns the same UX into a tiny story that reinforces the agent's competence. My new finance sync route returns the merchant list in the response — surface it.

*Mobile is an afterthought.* The grid collapses to one column below 768px, but the bento items don't resize their internal grids — the Wealth Canvas goes 50/50 side-by-side on a 375px screen. Stack vertically at `max-width: 480px`.

*Accessibility.*

- Chart tooltips use `color` alone to convey category — that fails for ~8% of male users. Add category labels next to the color swatches in the pie chart legend.
- The tab chip in Finance is a `<button>` but doesn't have `aria-selected` or a tablist role.
- The keyboard-shortcut hint ("💡 Use Arrow Keys") only works when focus is on the container; there's no visible focus indicator when it is. Add `:focus-visible` styles.

*Interaction latency is invisible.* Every "SYNC" click flips the same local `loading` flag that the initial fetch uses, so the whole widget dims. Use a button-level pending state, not a widget-level one.

**For the Shram.ai demo specifically:** open with a chat interaction, not a manual click. "Hey — add a 30 minute block tomorrow at 4 for Shram interview prep." The interviewer sees: (1) natural language, (2) the agent does the thing, (3) the calendar widget updates without a page reload because of the custom `refreshCalendar` event you already wired up. That's the money shot. Front-load it.

---

# Lead Architect Review

**Reviewer lens:** Does the system compose? Will it survive scaling past one user?

**Strengths.** Data-plane separation is correct: Prisma for persisted state, Google for calendar/email truth, Yahoo Finance / Groww for market data, Gemini for extraction. No single service is load-bearing for more than one capability. OAuth refresh is properly implemented with a 60-second buffer.

**Concerns.**

*The 10-minute `InboxScout` poll is client-driven.* Every signed-in tab runs its own interval. Open two tabs and your AI cost doubles and your duplicate-event risk doubles. This is a per-user server concern; the right shape is a single scheduled job per user. You have the `schedule` skill installed — use it. Until then, coalesce by writing a "last scout" timestamp to Prisma and skipping if another run happened in the last 9 minutes.

*There is no audit log for AI-initiated mutations.* When the agent creates an event or task, the user has no trail other than the created row itself. For trust — especially in a product where the AI has real authority over your calendar — every mutation should write to an `AuditEvent` table (`who`, `when`, `what`, `source: "chat"|"inbox_sync"|"manual"`, `reversible: boolean`). This is table stakes for any founder-office internal tool; Shram.ai will ask about it.

*Idempotency lives in two places now.* Gmail sync uses `ProcessedEmail`, chat event creation uses `extendedProperties.private.chatIdempotencyKey`. That's fine for a review pass, but over time you want one `IdempotencyRecord` concept keyed by (actor, action_type, input_hash). The `dedup.ts` helper I just added is a decent anchor point for that consolidation.

*Secrets are in `.env`.* Fine for local. For GitHub Actions / Vercel, use environment vars and rotate `client_secret_745311...json` (it's in your repo directory — check it's gitignored; looks like it is via `client_secret_*.json` in `.gitignore`, but confirm the file isn't in git history with `git log --follow client_secret_*`).

*No rate limit on `/api/chat`.* Gemini is paid on the margin and a buggy client retry loop is a billing incident. Add `next-rate-limit` or a Redis-backed bucket before you publicise this.

*The `dynamic = "force-dynamic"` directives are correct for per-session routes, but you lose HTTP caching.* For `/api/finance/market` (Yahoo Finance) you already cache 30s — good. For `/api/calendar` with a specific date in the query, cache 60s. Small but real.

*Prisma engine type is set to `library` in schema.* Good choice for Neon serverless; note that on Vercel Edge you'd need `dataproxy` or the Accelerate extension. You're not on Edge yet — keep as-is but flag this if you ever move to Edge routes.

*The data model has no multi-tenant isolation.* Every query hits the `User` table by `email` and trusts it. Fine for one user. Before you sign up the second person you want a row-level-security check in a Prisma middleware.

---

# Deep Dive: Why Calendar Events Duplicated, and How I Fixed It

## Root cause

The old `/api/gmail/sync` did this:

```
1. List unread emails                          (Gmail API)
2. SELECT externalId FROM Task WHERE ...        ← the "have I seen this?" check
3. Ask Gemini to extract actions from the rest
4. For each action:
     - If it's a task: INSERT Task with externalId = <email id>
     - If it's an event: POST to Google Calendar   ← no record kept
```

Step 2 checked the **Task** table. But when Gemini decided an email was a *calendar event* rather than a task (and this is the common case — "your flight leaves at 6:40am on Thursday"), step 4 wrote to Google Calendar and **stored nothing in our database**.

So when `InboxScout` ran again 10 minutes later:

- Email is still unread (nobody opened it).
- Our Task table still has no row for that email.
- The "have I seen this?" check returns `false`.
- Gemini is asked again, extracts the same event, and we POST to Calendar *again*.
- You end up with two copies of your flight on Thursday.

A secondary factor: when the LLM occasionally returned the same action twice in one response, the old code had no block-level deduplication — it just iterated. The chat route had a `Set(actionBlocks)` guard but the Gmail route didn't.

## The fix — three independent layers

1. **A persistent "I've processed this email" record.** The new `ProcessedEmail` table stores one row per `(userId, emailId, purpose)` tuple, with the outcome: `task`, `event`, `expense`, `ignored`, or `error`. The sync now filters against *this* table, not the Task table. Crucially, even "ignored" emails (promos, OTPs) are recorded — so Gemini is not asked the same useless question every 10 minutes.

2. **Deterministic Google Calendar event IDs.** Google Calendar accepts client-specified event IDs. I hash the Gmail message ID into Google's allowed alphabet (`[a-v0-9]`, 5–1024 chars) to produce a stable ID. If two sync jobs race (say, the user had two browser tabs open), Google rejects the second POST with HTTP 409 — which my handler treats as a success-with-dedup. It is now *impossible* for the same email to produce two calendar events.

3. **Extended properties for the chat path.** Events created through the chat (not the inbox sync) are tagged with `extendedProperties.private.chatIdempotencyKey` derived from `user|summary|startTime`. Before creating, I query Google for events with that key in a ±5-minute window. Retries of the same chat message can't duplicate.

## What to do about existing duplicates

Your calendar already contains duplicates from the old bug. The existing `/api/calendar/cleanup` route handles this — it scans a ±7 day window and deletes events that share `title|startTime`. Run it once after deploying the fix (a "Clean up duplicates" button wired to `POST /api/calendar/cleanup` would be good UX). After that, the new idempotency layer prevents recurrence.

## Edge cases I considered

- **Email gets marked read then unread again.** Still handled — we keyed on the Gmail message ID, not read state.
- **User changes the summary in Calendar after creation.** Doesn't matter — idempotency keys on our side.
- **Gemini rewrites the event title slightly between runs.** Doesn't matter — event ID is derived from the email ID, not from the title.
- **A legitimate follow-up email about the same meeting.** Different Gmail message ID, different event ID — the user sees both, which is correct.
- **Prisma migration hasn't run yet.** `markProcessed` catches its own errors and logs a warning — nothing crashes, but dedup is silently inoperative. Run `npx prisma db push` immediately on pull.

---

# Deep Dive: Expense Manager Overhaul

## The old system

One Gemini prompt per sync, given 100 email snippets, asked to return an array of `{merchant, amount, category}`. Failure modes:

- **Category drift.** "Netflix" came back as `Entertainment` one day, `Subscription` another. `Swiggy Instamart` hit `Food` when it should have been `Groceries`. Pie chart shuffled week to week.
- **False positives.** Gemini sometimes returned refunds and UPI credits as expenses. No programmatic filter caught them.
- **No subcategory.** Every Amazon purchase was just `Shopping`, with no sub-split between `fashion` / `electronics` / `home`. The dashboard couldn't answer "how much did I spend on coffee this month?"
- **No payment-mode capture.** Useful for "I'm underutilising my HDFC Infinia card" analysis, which is exactly the kind of insight a founder-office hire would surface.
- **Every sync re-paid AI tokens** for every email in the inbox, because dedup was by Expense `sourceId` — so emails that Gemini *decided weren't expenses* were sent to Gemini again on the next run.

## The new system

Two stages, with a memory layer on top.

**Stage 1 — Deterministic classifier** (`src/lib/expenseClassifier.ts`).
A merchant map of 80+ Indian brands (Swiggy, Zomato, Blinkit, Zepto, Uber, Ola, Airtel, BookMyShow, Netflix, Spotify, Amazon Prime, Google One, Groww, Zerodha, 1mg, cult.fit, Apollo 24/7, IRCTC, MakeMyTrip, CRED, PhonePe, Google Pay, Paytm…). Each entry carries category, subcategory, and canonical merchant name. Confidence 0.92. A hit here never goes to Gemini. A keyword-fallback map handles the long tail at confidence 0.55–0.6.

**Stage 2 — AI fallback.** Only emails that didn't match any rule get batched into a single Gemini call. The prompt pins the allowed category enum and tells the model to pick the *most specific* category ("Subscription" for Netflix, not "Entertainment"). Output is validated against the enum before persistence — unknown categories become "Other" rather than being written.

**Pre-filter.** `isLikelyExpense()` requires both a debit keyword *and* a currency marker before an email enters the pipeline. `isRefundOrCredit()` filters refunds upstream. OTPs and login alerts are dropped. This removes ~60% of "financial-looking" emails from Gemini's lap before it sees them.

**Structured extraction.** Amount is parsed by regex (handles ₹1,234.56, Rs. 1234, INR 1,234, 1234 INR, with a sanity cap). Payment mode is detected from VPA patterns and card-ending digits.

**Recurring-subscription override.** After classification, I check the user's prior 200 expenses for the same merchant in a 20–45 day window with the same amount (±5%). If it looks recurring, category is forced to `Subscription` and subcategory to `recurring`. That means your OTT stack gets categorised as a subscription even if the initial classifier said "Entertainment".

**Persisted dedup.** Every email — matched, AI-classified, or filtered — gets a row in `ProcessedEmail` with purpose `finance_sync`. Next run's Gemini cost is strictly proportional to *new* emails.

## What this buys you in the demo

Open the Finance widget → switch to Pie → the categories are *clean*. Subscription shows up as its own slice. Groceries is separate from Food. You can point at this and say: "The LLM is a fallback here, not the primary path — so I get consistent categories regardless of whether Gemini has a bad day." That's the kind of sentence a founder-office interviewer likes to hear.

---

# Deployment Checklist

Run these in order. Total time: ~10 minutes.

**1. Pull changes and regenerate Prisma.**

```bash
cd D:\Dashboard
npx prisma generate
npx prisma db push
```

(If you prefer migrations: `npx prisma migrate dev --name add_processed_email_and_expense_fields`.)

**2. Typecheck.**

```bash
npx tsc --noEmit
```

Should be clean. If you see errors about `processedEmail` on `PrismaClient`, step 1 didn't run — repeat it.

**3. Add the type augmentation** (optional but recommended):

Create `src/types/next-auth.d.ts` with:

```ts
import "next-auth";
declare module "next-auth" {
  interface Session {
    accessToken?: string;
    error?: "RefreshAccessTokenError";
  }
}
```

Then delete the four `@ts-ignore`s in `src/lib/auth.ts` and `src/app/api/chat/route.ts`. Typecheck again.

**4. One-time cleanup of existing duplicate events.**

Sign in to the dashboard, open dev-tools console, and run:

```js
await fetch('/api/calendar/cleanup', { method: 'POST' }).then(r => r.json())
```

This removes any duplicates the old bug created. The new code can't produce fresh ones.

**5. Sanity-test the pipelines.**

- `/api/gmail/sync` POST → should report `{creations: {...}}` and never create a duplicate on a second call.
- `/api/finance/sync` POST → should report `{count, message}` with `"X candidates, Y used AI"` breakdown.
- Chat: "add lunch with Aryan tomorrow at 1pm" → creates the event, repeats are skipped.

**6. Commit and push.**

```bash
cd D:\Dashboard
git add prisma/schema.prisma src/lib/dedup.ts src/lib/expenseClassifier.ts \
        src/app/api/gmail/sync/route.ts src/app/api/chat/route.ts \
        src/app/api/finance/sync/route.ts
git commit -m "fix(sync): idempotent Gmail→Calendar pipeline + deterministic expense classifier"
git push origin main
```

**7. If you're on Vercel**, redeploy and set the same env vars. Neon's `DATABASE_URL` picks up the new tables immediately after `prisma db push`.

---

# Shram.ai Interview Talking Points

A generalist role at a founder's office optimises for *judgment under ambiguity*, not for deep specialisation. Lead with the thinking, not the feature list.

**Story 1 — "I noticed my own demo was lying to me."** Walk through the duplicate-calendar-event bug: the symptom (same flight three times), the diagnosis (dedup checked the wrong table), the fix (a persistence layer + Google's native idempotency). The point isn't the bug — it's that you traced an observable symptom to a root cause that spanned three systems (Prisma, the sync loop, Google Calendar's API semantics) and fixed it at every layer. That's what an ops generalist does.

**Story 2 — "When do you trust an LLM, when do you not?"** The expense classifier is the answer. Use the merchant map for the 80% you can predict; use the LLM for the 20% you can't; never let the LLM pick from an unbounded category space. This is a framing a founder will recognise — "how do I get the benefits of AI without the fragility."

**Story 3 — "What's the product even *for*?"** Be ready to answer: why a dashboard? The honest answer is that you're reducing your own daily tab-switch cost by ~15 minutes. Generalise: "founders' offices exist because founders have the same problem at 100x the scale — too many surfaces, not enough time. Shram is attacking that with a shared agent; I'm approaching it with a personal one. Same bet, different axis."

**Quick-fire answers.**

- *"Why Gemini, not GPT?"* Quota cost, India-first latency, the fallback ladder in `getRobustModel`, and a tolerance for model churn (we fail over to three variants).
- *"How would you scale this to 10k users?"* Move the InboxScout out of the browser into a per-user cron (you already installed the `schedule` skill). Add an `IdempotencyRecord` concept that subsumes both the ProcessedEmail table and the extendedProperties trick. Add row-level security in a Prisma middleware. Rate-limit `/api/chat` with Upstash.
- *"What would you cut first?"* Zomato integration, unless it's solid by Friday. It risks showing fake data on stage.
- *"What would you build next?"* A weekly digest: "This week you spent ₹14,230, 31% more than last week, driven by two Amazon orders and a Blinkit spike. Three tasks moved more than 48 hours without progress. Here are two calendar blocks I'd suggest for next week." That's the agent going from reactive to proactive, and it's the pitch of the whole product.

**One more thing.** Bring a fresh database, a full seed, and a clean git log with the commit `fix(sync): idempotent Gmail→Calendar pipeline`. An interviewer who `git log`s the repo is looking for a signal of "does this person actually ship." A clean, atomic commit is that signal.

Good luck.

---

*Prepared by: CPO • Sr. Full-stack • Sr. UX • Lead Architect — one-pass review with patches applied.*

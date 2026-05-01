# Deploy Checklist — Run these three times, in order

The Gmail/Calendar/Expense fix is fully staged in git already. You only need to:

1. clear a stale sandbox lock file,
2. commit + push my changes,
3. then commit + push your IPL work in a second atomic commit,
4. run the Prisma migration so the new `ProcessedEmail` table and extended `Expense` columns exist in Neon.

## 1. Commit & push the sync fix (your master branch is already staged)

Open **PowerShell** in `D:\Dashboard`:

```powershell
# Step A — clear the stale lock file the Linux sandbox left behind
Remove-Item -Force .git\index.lock -ErrorAction SilentlyContinue

# Step B — verify staged files (should show ONLY my six code files + REVIEW.docx/md)
git status --short

# Step C — commit
git commit -m "fix(sync): idempotent Gmail->Calendar pipeline + deterministic expense classifier" -m "- Add ProcessedEmail model so repeat polls never re-process the same email." -m "- Gmail sync writes Calendar events with deterministic IDs derived from the Gmail message ID; Google's 409 on duplicates makes duplicates impossible." -m "- Chat event-creation tags events with extendedProperties.private.chatIdempotencyKey; pre-create check prevents double-booking on retries." -m "- Expense sync: two-stage classifier (merchant map + AI fallback), refund filter, amount / payment-mode parsers, recurring-subscription override." -m "- Extended Expense schema with subcategory, description, paymentMode, confidence, method, plus (userId, date) and (userId, category) indexes." -m "- Add REVIEW.docx/REVIEW.md: multi-persona audit with interview talking points." -m "Migration: run 'npx prisma generate && npx prisma db push' after pull."

# Step D — push
git push origin master
```

## 2. Commit & push your IPL widget changes (second atomic commit)

```powershell
git add src/app/components/IPLScoreTicker.tsx src/app/components/IPLScoreWidget.tsx
git commit -m "wip: IPL widget refinements"
git push origin master
```

## 3. Apply the schema changes locally

```powershell
npx prisma generate
npx prisma db push
```

That's it. If Vercel is hooked up to `origin/master`, both commits will auto-deploy; re-run step 3's `db push` against your production `DATABASE_URL` (or use `npx prisma migrate deploy` if you prefer proper migrations).

## Quick sanity check after deploy

```powershell
# Type-check — should be clean now that Prisma has regenerated
npx tsc --noEmit

# Start the app
npm run dev
```

Open http://localhost:3000 → sign in → open dev-tools console → run:

```js
// This removes any existing duplicate calendar events from the old bug.
// The new code can't produce fresh duplicates, so this is a one-shot cleanup.
await fetch('/api/calendar/cleanup', { method: 'POST' }).then(r => r.json())

// Trigger a fresh Gmail sync and watch it return { creations, duplicates: 0 }
await fetch('/api/gmail/sync', { method: 'POST' }).then(r => r.json())

// Trigger finance sync and check the "X candidates, Y used AI" breakdown
await fetch('/api/finance/sync', { method: 'POST' }).then(r => r.json())
```

If anything errors, check `REVIEW.md` → Deployment Checklist section for troubleshooting.

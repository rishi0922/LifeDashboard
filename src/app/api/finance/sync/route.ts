import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { getRobustModel, parseAIJson } from "@/lib/gemini";
import {
  classifyExpense,
  extractAmount,
  extractPaymentMode,
  isLikelyExpense,
  isRefundOrCredit,
  looksRecurring,
  isIntermediarySender,
  extractMerchantFromBody,
  normalizeMerchant,
  computeExpenseFingerprint,
  ExpenseCategory,
} from "@/lib/expenseClassifier";
import { filterUnprocessed, markProcessed, findDuplicateExpense } from "@/lib/dedup";

export const dynamic = "force-dynamic";

const ALLOWED_CATEGORIES: ExpenseCategory[] = [
  "Food",
  "Groceries",
  "Travel",
  "Bills",
  "Shopping",
  "Entertainment",
  "Subscription",
  "Investment",
  "Health",
  "Transfer",
  "Other",
];

/**
 * POST /api/finance/sync
 *
 * Two-stage expense classification pipeline:
 *
 *   Stage 1 (deterministic): scan each financial email against the merchant
 *   map in `expenseClassifier.ts`. Obvious Swiggy / Uber / Netflix / etc.
 *   transactions are categorised immediately with high confidence — no AI
 *   tokens spent, no risk of the model hallucinating a category.
 *
 *   Stage 2 (AI fallback): anything Stage 1 couldn't classify gets batched
 *   into a single Gemini call with a tight prompt. We validate the output
 *   against the allowed category enum before persisting.
 *
 * All emails — matched, AI-classified, or skipped — are recorded in
 * `ProcessedEmail` so repeat syncs are free.
 */
export async function POST(_req: Request) {
  const session = await getServerSession(authOptions);
  //@ts-ignore
  const accessToken = session?.accessToken;
  const userEmail = session?.user?.email;

  if (!accessToken || !userEmail) {
    return NextResponse.json(
      { error: "Unauthorized. Please sign in again." },
      { status: 401 }
    );
  }

  try {
    const user = await prisma.user.upsert({
      where: { email: userEmail },
      update: {},
      create: {
        email: userEmail,
        name: session.user?.name || userEmail.split("@")[0],
      },
    });

    // 1. Pull a broad list of finance-looking messages from the past 45 days.
    //    We rely on Gmail's own search for the heavy lifting; our classifier
    //    refines the results.
    const keywords = [
      "debited",
      "spent",
      "paid",
      "txn",
      "PhonePe",
      "GPay",
      "HDFC",
      "Axis",
      "ICICI",
      "SBI",
      "Kotak",
      "CRED",
      "payment",
      "order confirmed",
      "invoice",
      "receipt",
      "transaction",
      "₹",
      "UPI",
      "Swiggy",
      "Zomato",
      "BookMyShow",
      "Netflix",
      "Amazon",
      "Flipkart",
      "Uber",
      "Ola",
      "Subscription",
      "SIP",
    ].join(" OR ");
    const query = encodeURIComponent(`(${keywords}) newer_than:45d`);

    const listRes = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${query}&maxResults=100`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    if (!listRes.ok) {
      if (listRes.status === 401)
        throw new Error("Gmail session expired. Sign out and back in.");
      const errorText = await listRes.text();
      throw new Error(`Gmail API Error: ${listRes.status} - ${errorText}`);
    }

    const listData = await listRes.json();
    const messages: Array<{ id: string }> = listData.messages || [];

    if (messages.length === 0) {
      return NextResponse.json({
        success: true,
        count: 0,
        message: "No potential transactions found in Gmail.",
      });
    }

    // 2. Dedup against our persisted memory of processed finance emails.
    const unseenIds = await filterUnprocessed(
      user.id,
      messages.map((m) => m.id),
      "finance_sync"
    );

    if (unseenIds.length === 0) {
      return NextResponse.json({
        success: true,
        count: 0,
        message: "All financial emails already synced.",
      });
    }

    // 3. Fetch metadata + snippets.
    const emailDetails = await Promise.all(
      unseenIds.map(async (id) => {
        const dRes = await fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date`,
          { headers: { Authorization: `Bearer ${accessToken}` } }
        );
        if (!dRes.ok) return null;
        const data = await dRes.json();
        const headers = data.payload?.headers || [];
        return {
          id: data.id as string,
          snippet: (data.snippet as string) || "",
          subject:
            (headers.find((h: any) => h.name === "Subject")?.value as string) || "",
          from:
            (headers.find((h: any) => h.name === "From")?.value as string) || "",
          date:
            (headers.find((h: any) => h.name === "Date")?.value as string) || "",
        };
      })
    );
    const valid = emailDetails.filter((e): e is NonNullable<typeof e> => !!e);

    // 4. Pre-filter with heuristics. Refunds / OTPs / newsletters are marked
    //    "ignored" and never reach the AI.
    const candidates: typeof valid = [];
    for (const em of valid) {
      const blob = `${em.from} ${em.subject} ${em.snippet}`;
      if (isRefundOrCredit(blob) || !isLikelyExpense(blob)) {
        await markProcessed({
          userId: user.id,
          emailId: em.id,
          purpose: "finance_sync",
          outcome: "ignored",
          subject: em.subject,
          snippet: em.snippet,
        });
        continue;
      }
      candidates.push(em);
    }

    if (candidates.length === 0) {
      return NextResponse.json({
        success: true,
        count: 0,
        message: "No new expenses detected (filtered as refunds/notifications).",
      });
    }

    // 5. Stage 1: deterministic rule-based classification.
    const priorExpenses = await prisma.expense.findMany({
      where: { userId: user.id },
      select: { merchant: true, amount: true, date: true },
      orderBy: { date: "desc" },
      take: 200,
    });

    type Prepared = {
      email: (typeof candidates)[number];
      amount: number;
      paymentMode: string | null;
      classified?: {
        category: ExpenseCategory;
        subcategory?: string;
        merchant?: string;
        confidence: number;
        method: "rule" | "keyword" | "ai";
      };
    };

    const prepared: Prepared[] = [];
    const needsAi: Prepared[] = [];

    for (const em of candidates) {
      const blob = `${em.from} ${em.subject} ${em.snippet}`;
      const amount = extractAmount(blob);
      if (!amount) {
        // No parseable amount → not an expense row we can persist.
        await markProcessed({
          userId: user.id,
          emailId: em.id,
          purpose: "finance_sync",
          outcome: "ignored",
          subject: em.subject,
          snippet: em.snippet,
        });
        continue;
      }

      const rule = classifyExpense({
        from: em.from,
        subject: em.subject,
        snippet: em.snippet,
      });
      const paymentMode = extractPaymentMode(blob);

      const entry: Prepared = { email: em, amount, paymentMode };

      if (rule.method === "rule" && rule.confidence >= 0.85) {
        entry.classified = {
          category: rule.category,
          subcategory: rule.subcategory,
          merchant: rule.merchant,
          confidence: rule.confidence,
          method: "rule",
        };
        prepared.push(entry);
      } else if (rule.method === "keyword" && rule.confidence >= 0.55) {
        entry.classified = {
          category: rule.category,
          subcategory: rule.subcategory,
          merchant: rule.merchant,
          confidence: rule.confidence,
          method: "keyword",
        };
        prepared.push(entry);
        needsAi.push(entry); // AI can refine merchant name, but we'll keep rule category.
      } else {
        needsAi.push(entry);
        prepared.push(entry);
      }
    }

    // 6. Stage 2: AI fills in what rules missed. Single batched call.
    if (needsAi.length > 0) {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) throw new Error("GEMINI_API_KEY is not configured.");
      const genAI = new GoogleGenerativeAI(apiKey);
      const model = await getRobustModel(genAI);

      const aiPrompt = `
You are a specialised Finance Extraction AI for an Indian user. For each email below, return a JSON object describing the expense.

STRICT RULES:
- Only output real DEBIT transactions. Ignore refunds, OTPs, login alerts, promos.
- Categories MUST be one of: ${ALLOWED_CATEGORIES.join(", ")}.
- Pick the most specific category (e.g. "Subscription" for Netflix, not "Entertainment"; "Groceries" for Blinkit, not "Food").
- Merchant should be the specific app/shop/biller ("Swiggy", "Uber", "Airtel"). Never return the bank as the merchant.
- date must be YYYY-MM-DD (fall back to the email Date header if no explicit date is in the body).

OUTPUT: JSON ARRAY, one object per input:
[{"sourceId": "...", "merchant": "...", "category": "...", "subcategory": "...", "date": "YYYY-MM-DD"}]

EMAILS:
${needsAi
  .map(
    (p) =>
      `[ID: ${p.email.id}] FROM: ${p.email.from} | DATE: ${p.email.date} | SUBJECT: ${p.email.subject} | SNIPPET: ${p.email.snippet}`
  )
  .join("\n")}
`.trim();

      try {
        const result = await model.generateContent(aiPrompt);
        const text = await result.response.text();
        const aiArr: any[] = parseAIJson(text);
        const byId = new Map<string, any>();
        for (const a of aiArr) if (a?.sourceId) byId.set(a.sourceId, a);

        for (const entry of needsAi) {
          const ai = byId.get(entry.email.id);
          if (!ai) continue;
          const cat = ALLOWED_CATEGORIES.includes(ai.category)
            ? (ai.category as ExpenseCategory)
            : "Other";

          // Prefer rule category when it exists — AI only fills merchant/subcategory.
          const existing = entry.classified;
          entry.classified = {
            category: existing?.category && existing.method === "rule" ? existing.category : cat,
            subcategory: ai.subcategory || existing?.subcategory,
            merchant: ai.merchant || existing?.merchant,
            confidence: existing?.method === "rule" ? existing.confidence : 0.75,
            method: existing?.method === "rule" ? existing.method : "ai",
          };
        }
      } catch (e) {
        console.warn("[finance/sync] AI stage failed, falling back to rule categories", e);
      }
    }

    // 7. Persist. We also detect subscriptions by recurrence regardless of
    //    what the classifier said — if the same merchant+amount shows up
    //    monthly, it's a subscription.
    //
    //    CROSS-EMAIL DEDUP: Before inserting, we compute a fingerprint
    //    from (userId, normalizedMerchant, amount, date) and check whether
    //    an expense with the same fingerprint already exists. This catches
    //    the case where the same ₹500 Swiggy purchase is reported by both
    //    the Swiggy email AND an HDFC Bank debit alert (different email IDs
    //    but the same underlying transaction).
    let syncCount = 0;
    let dupCount = 0;
    for (const entry of prepared) {
      const c = entry.classified;
      if (!c) {
        await markProcessed({
          userId: user.id,
          emailId: entry.email.id,
          purpose: "finance_sync",
          outcome: "ignored",
          subject: entry.email.subject,
          snippet: entry.email.snippet,
        });
        continue;
      }

      // ── Merchant resolution ──────────────────────────────────────────
      // If the email came from a bank / CRED / UPI app, try to extract
      // the actual merchant from the body. Bank alerts say things like
      // "spent at SWIGGY" — we want "Swiggy", not "HDFC Bank".
      let merchant = (c.merchant || "").slice(0, 120);
      const fromIntermediary = isIntermediarySender(entry.email.from);

      if (fromIntermediary || !merchant || merchant === "Unknown") {
        const bodyMerchant = extractMerchantFromBody(
          `${entry.email.subject} ${entry.email.snippet}`
        );
        if (bodyMerchant) {
          merchant = bodyMerchant.slice(0, 120);
        } else if (!merchant) {
          merchant = (entry.email.from.split("<")[0].trim() || "Unknown").slice(0, 120);
        }
      }

      // ── Fingerprint dedup ────────────────────────────────────────────
      const txnDate = parseDate(entry.email.date);
      const normalizedM = normalizeMerchant(merchant);
      const fingerprint = computeExpenseFingerprint({
        userId: user.id,
        merchant,
        amount: entry.amount,
        date: txnDate,
      });

      const existingId = await findDuplicateExpense({
        userId: user.id,
        fingerprint,
        normalizedMerchant: normalizedM,
        amount: entry.amount,
        date: txnDate,
      });

      if (existingId) {
        // Another email already created this expense — skip.
        dupCount++;
        await markProcessed({
          userId: user.id,
          emailId: entry.email.id,
          purpose: "finance_sync",
          outcome: "duplicate",
          externalRef: existingId,
          subject: entry.email.subject,
          snippet: entry.email.snippet,
        });
        continue;
      }

      // Subscription detection override
      let finalCategory = c.category;
      let finalSubcategory = c.subcategory;
      if (
        finalCategory !== "Subscription" &&
        looksRecurring({ merchant, amount: entry.amount }, priorExpenses)
      ) {
        finalCategory = "Subscription";
        finalSubcategory = finalSubcategory || "recurring";
      }

      try {
        const saved = await prisma.expense.upsert({
          where: { sourceId: entry.email.id },
          update: {
            amount: entry.amount,
            merchant,
            category: finalCategory,
            subcategory: finalSubcategory,
            paymentMode: entry.paymentMode,
            confidence: c.confidence,
            method: c.method,
            fingerprint,
          },
          create: {
            amount: entry.amount,
            merchant,
            category: finalCategory,
            subcategory: finalSubcategory,
            description: entry.email.snippet?.slice(0, 500),
            paymentMode: entry.paymentMode,
            confidence: c.confidence,
            method: c.method,
            date: txnDate,
            sourceId: entry.email.id,
            sourceType: "GMAIL",
            fingerprint,
            userId: user.id,
          },
        });
        syncCount++;

        await markProcessed({
          userId: user.id,
          emailId: entry.email.id,
          purpose: "finance_sync",
          outcome: "expense",
          externalRef: saved.id,
          subject: entry.email.subject,
          snippet: entry.email.snippet,
        });
      } catch (e) {
        console.warn(`[finance/sync] upsert failed for ${entry.email.id}:`, e);
        await markProcessed({
          userId: user.id,
          emailId: entry.email.id,
          purpose: "finance_sync",
          outcome: "error",
          subject: entry.email.subject,
          snippet: entry.email.snippet,
        });
      }
    }

    return NextResponse.json({
      success: true,
      count: syncCount,
      duplicates: dupCount,
      message: `Synced ${syncCount} transactions (${prepared.length} candidates, ${needsAi.length} used AI, ${dupCount} duplicates skipped).`,
    });
  } catch (error: any) {
    console.error("[FinanceSync] ERROR:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/**
 * GET /api/finance/sync — list saved expenses for the current user.
 */
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    const userEmail = session?.user?.email;
    if (!userEmail) return NextResponse.json({ expenses: [] });

    const user = await prisma.user.findUnique({ where: { email: userEmail } });
    if (!user) return NextResponse.json({ expenses: [] });

    const expenses = await prisma.expense.findMany({
      where: { userId: user.id },
      orderBy: { date: "desc" },
      take: 250,
    });

    return NextResponse.json({ expenses });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

function parseDate(raw?: string): Date {
  if (!raw) return new Date();
  const d = new Date(raw);
  return isNaN(d.getTime()) ? new Date() : d;
}

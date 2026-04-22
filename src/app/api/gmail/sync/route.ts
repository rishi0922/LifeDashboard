import { GoogleGenerativeAI } from "@google/generative-ai";
import { getRobustModel, parseAIJson } from "@/lib/gemini";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { fetchGmailSnippets } from "@/lib/gmail";
import {
  calendarEventIdFromEmail,
  filterUnprocessed,
  markProcessed,
} from "@/lib/dedup";

export const dynamic = "force-dynamic";

/**
 * POST /api/gmail/sync
 *
 * Scans recent unread emails, asks Gemini to extract actionable items, and
 * creates tasks / calendar events. Idempotent — each email is processed at
 * most once, and calendar events use deterministic IDs so retries can never
 * produce duplicates.
 */
export async function POST() {
  try {
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

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error("GEMINI_API_KEY missing");

    const user = await prisma.user.upsert({
      where: { email: userEmail },
      update: {},
      create: {
        email: userEmail,
        name: session.user?.name || userEmail.split("@")[0],
      },
    });

    // 1. Fetch latest unread emails.
    const emails = await fetchGmailSnippets(accessToken);
    if (!emails || emails.length === 0) {
      return NextResponse.json({
        status: "skipped",
        message: "No new unread emails.",
      });
    }

    // 2. Persisted dedup — skip anything we've already seen for inbox_sync.
    //    This is the critical fix: the old code filtered by Task.externalId,
    //    so emails that produced calendar events (no task row) kept coming
    //    back every poll and triggering duplicate events.
    const unprocessedIds = await filterUnprocessed(
      user.id,
      emails.map((e) => e.id),
      "inbox_sync"
    );
    const newEmails = emails.filter((e) => unprocessedIds.includes(e.id));

    if (newEmails.length === 0) {
      return NextResponse.json({
        status: "skipped",
        message: "All unread emails already processed.",
      });
    }

    // 3. AI extraction.
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = await getRobustModel(genAI);

    const emailPrompt = `
You are a precise Task/Event Extraction AI. Analyse these unread email snippets and extract ACTIONABLE items.

EMAIL SNIPPETS:
${newEmails
  .map(
    (e) =>
      `- ID: ${e.id} | From: ${e.from} | Subject: ${e.subject} | Snippet: ${e.snippet}`
  )
  .join("\n")}

RULES:
- Create a TASK if an email clearly implies an action the user must take.
- Create an EVENT if an email mentions a *specific* date/time (meeting, delivery window, flight).
- Do NOT create events for vague references like "next week" without a time.
- Categorise shopping/delivery/personal as "Personal"; office/work/clients as "Work"; deadlines/emergencies as "Urgent".
- If an email is promotional / junk / OTP / newsletter, return outcome "ignored" so we remember it.
- Each email MUST appear exactly once in the output, with one of the outcomes below.

REFERENCE TIME (IST): ${new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" })}
All relative times (today, tomorrow, next Friday) MUST be calculated from this IST reference.

OUTPUT FORMAT — JSON ARRAY ONLY, one object per email:
[
  {"emailId": "...", "outcome": "task",    "title": "...", "category": "Work"},
  {"emailId": "...", "outcome": "event",   "summary": "...", "startTime": "YYYY-MM-DDTHH:mm:ss", "endTime": "YYYY-MM-DDTHH:mm:ss"},
  {"emailId": "...", "outcome": "ignored"}
]

If you cannot produce a valid object for an email, use {"emailId": "...", "outcome": "ignored"}.
`.trim();

    const result = await model.generateContent(emailPrompt);
    const text = result.response.text();

    let actions: any[] = [];
    try {
      actions = parseAIJson(text);
    } catch (e) {
      console.error("[gmail/sync] Malformed AI response, marking batch ignored.");
      for (const em of newEmails) {
        await markProcessed({
          userId: user.id,
          emailId: em.id,
          purpose: "inbox_sync",
          outcome: "error",
          subject: em.subject,
          snippet: em.snippet,
        });
      }
      return NextResponse.json(
        { error: "AI returned invalid JSON; batch marked for retry on next sync." },
        { status: 502 }
      );
    }

    const byEmailId = new Map<string, any>();
    for (const a of actions) if (a && a.emailId) byEmailId.set(a.emailId, a);

    const creations = { tasks: 0, events: 0, ignored: 0, duplicates: 0 };

    // Helper: enforce IST offset on ISO strings that lack one.
    const ensureIst = (iso?: string) => {
      if (!iso) return null;
      if (iso.endsWith("Z") || /[+-]\d{2}:?\d{2}$/.test(iso)) return iso;
      return `${iso}+05:30`;
    };

    for (const em of newEmails) {
      const action = byEmailId.get(em.id);

      // Missing in AI output → mark ignored so we don't retry forever.
      if (!action) {
        await markProcessed({
          userId: user.id,
          emailId: em.id,
          purpose: "inbox_sync",
          outcome: "ignored",
          subject: em.subject,
          snippet: em.snippet,
        });
        creations.ignored++;
        continue;
      }

      try {
        if (action.outcome === "task") {
          // Use email ID as externalId — unique constraint in Prisma protects us.
          const existing = await prisma.task.findUnique({
            where: { externalId: em.id },
          });
          if (existing) {
            creations.duplicates++;
          } else {
            const task = await prisma.task.create({
              data: {
                title: action.title || em.subject || "Untitled",
                category: action.category || "Work",
                isAiGenerated: true,
                externalId: em.id,
                userId: user.id,
              },
            });
            creations.tasks++;
            await markProcessed({
              userId: user.id,
              emailId: em.id,
              purpose: "inbox_sync",
              outcome: "task",
              externalRef: task.id,
              subject: em.subject,
              snippet: em.snippet,
            });
            continue;
          }
        } else if (action.outcome === "event") {
          // Deterministic event ID — Google will reject duplicates with 409.
          const eventId = calendarEventIdFromEmail(em.id);
          const startTime =
            ensureIst(action.startTime) ||
            new Date(Date.now() + 60 * 60 * 1000).toISOString();
          const endTime =
            ensureIst(action.endTime) ||
            new Date(new Date(startTime).getTime() + 60 * 60 * 1000).toISOString();

          const res = await fetch(
            "https://www.googleapis.com/calendar/v3/calendars/primary/events",
            {
              method: "POST",
              headers: {
                Authorization: `Bearer ${accessToken}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                id: eventId,
                summary: `✨ ${action.summary || em.subject}`,
                description: `Generated by Command Center AI from email ${em.id}`,
                start: { dateTime: startTime, timeZone: "Asia/Kolkata" },
                end: { dateTime: endTime, timeZone: "Asia/Kolkata" },
                extendedProperties: {
                  private: {
                    dashboardEmailId: em.id,
                    source: "gmail_sync",
                  },
                },
              }),
            }
          );

          if (res.ok) {
            creations.events++;
            await markProcessed({
              userId: user.id,
              emailId: em.id,
              purpose: "inbox_sync",
              outcome: "event",
              externalRef: eventId,
              subject: em.subject,
              snippet: em.snippet,
            });
            continue;
          } else if (res.status === 409) {
            // Someone (even us, in a previous crashed run) already created
            // this exact event. That's a success for idempotency purposes.
            creations.duplicates++;
            await markProcessed({
              userId: user.id,
              emailId: em.id,
              purpose: "inbox_sync",
              outcome: "event",
              externalRef: eventId,
              subject: em.subject,
              snippet: em.snippet,
            });
            continue;
          } else {
            const errBody = await res.text();
            console.error("[gmail/sync] Calendar insert failed", res.status, errBody);
            await markProcessed({
              userId: user.id,
              emailId: em.id,
              purpose: "inbox_sync",
              outcome: "error",
              subject: em.subject,
              snippet: em.snippet,
            });
            continue;
          }
        }

        // Fallback — "ignored" or unknown outcome.
        await markProcessed({
          userId: user.id,
          emailId: em.id,
          purpose: "inbox_sync",
          outcome: "ignored",
          subject: em.subject,
          snippet: em.snippet,
        });
        creations.ignored++;
      } catch (e) {
        console.error("[gmail/sync] per-email error", em.id, e);
        await markProcessed({
          userId: user.id,
          emailId: em.id,
          purpose: "inbox_sync",
          outcome: "error",
          subject: em.subject,
          snippet: em.snippet,
        });
      }
    }

    return NextResponse.json({
      status: "success",
      message: `Processed ${newEmails.length} emails.`,
      creations,
    });
  } catch (error: any) {
    console.error("Gmail Sync Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

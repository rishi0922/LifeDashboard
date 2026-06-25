import { GoogleGenerativeAI } from "@google/generative-ai";
import { generateContentWithFallback } from "@/lib/gemini";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { fetchGmailSnippets, sendGmailReply, sendGmailNew } from "@/lib/gmail";
import { ZomatoBridge } from "@/lib/zomato";
import { buildSpendIntelligenceBlock } from "@/lib/spendAnalytics";

export const dynamic = "force-dynamic";
// Gmail reply + Gemini + calendar context + Gmail list-snippets can total
// 10-15s on a cold start. Vercel's default 10s cutoff was killing the
// request mid-flight and the frontend then saw a truncated HTML error page
// (which happened to contain the word "fetch") and labelled it a "Network
// error". 60s leaves plenty of headroom on the Pro plan and is clamped to
// the plan's limit on Hobby.
export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY is not configured in .env");
    }

    const session = await getServerSession(authOptions);
    const accessToken = session?.accessToken;
    const userEmail = session?.user?.email || "dummy@local.dev";
    
    const genAI = new GoogleGenerativeAI(apiKey);
    const { messages, newsContext } = await req.json();
    const latestMessage = messages[messages.length - 1]?.content;

    // Compact NEWS FEED block from the client's Intelligence Feed. Used so
    // the assistant can summarise a story and open its exact URL on request.
    let newsFeedContext = "";
    if (Array.isArray(newsContext) && newsContext.length > 0) {
      newsFeedContext = `NEWS FEED — the user's Intelligence Feed (use to answer news/headline questions):\n${newsContext
        .slice(0, 30)
        .map(
          (n: any, i: number) =>
            `[${i + 1}] (${n.category}) ${n.title} — ${n.source}\n    URL: ${n.link}\n    ${(n.description || "").slice(0, 200)}`,
        )
        .join("\n")}`;
    }

    // Resolve the active user ONCE, by email, and reuse it everywhere.
    //
    // Prior bug: every context block did `prisma.user.findFirst()` with no
    // filter, which returns whichever User row was inserted first. During
    // dev a "dummy@local.dev" user was created BEFORE the real OAuth
    // sign-in, so findFirst() kept returning the dummy — and the Smart
    // Brain was reading expenses/tasks from an empty account while the
    // Expense Intelligence widget (which scopes by session email) showed
    // the real user's data. Result: "no food expenses" answers even
    // though the UI clearly listed them.
    const activeUser = await prisma.user.upsert({
      where: { email: userEmail },
      update: {},
      create: {
        email: userEmail,
        name: session?.user?.name || userEmail.split('@')[0],
      },
    });

    // 1. Fetch Context (Optimized)
    const istNow = new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" });
    const istDate = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
    
    let calendarContext = "No live calendar context available.";
    if (accessToken) {
      try {
        const startOfDay = new Date(istDate);
        startOfDay.setHours(0, 0, 0, 0);
        const endOfDay = new Date(istDate);
        endOfDay.setHours(23, 59, 59, 999);

        // Correct range calculation for IST
        const getISTString = (d: Date, time: string) => {
          const year = d.getFullYear();
          const month = String(d.getMonth() + 1).padStart(2, '0');
          const day = String(d.getDate()).padStart(2, '0');
          return `${year}-${month}-${day}T${time}+05:30`;
        };

        const timeMin = encodeURIComponent(getISTString(startOfDay, "00:00:00"));
        const timeMax = encodeURIComponent(getISTString(endOfDay, "23:59:59"));

        const calRes = await fetch(
          `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${timeMin}&timeMax=${timeMax}&singleEvents=true&orderBy=startTime`,
          { headers: { Authorization: `Bearer ${accessToken}` } }
        );
        if (calRes.ok) {
          const data = await calRes.json();
          const items = data.items || [];

          // Precompute a small summary so the AI can answer "how busy am I
          // today" without re-counting the per-event list each time.
          let busyMs = 0;
          let nextLabel = "none";
          const nowMs = Date.now();
          for (const ev of items) {
            const s = ev.start?.dateTime ? new Date(ev.start.dateTime).getTime() : null;
            const e = ev.end?.dateTime ? new Date(ev.end.dateTime).getTime() : null;
            if (s && e && e > s) busyMs += e - s;
            if (s && s > nowMs && nextLabel === "none") {
              const mins = Math.round((s - nowMs) / 60_000);
              nextLabel = `"${ev.summary}" in ${mins} min`;
            }
          }
          const busyHr = Math.floor(busyMs / 3_600_000);
          const busyMin = Math.round((busyMs % 3_600_000) / 60_000);
          const summary = `CALENDAR SUMMARY: ${items.length} event${items.length === 1 ? "" : "s"} today, ~${busyHr}h ${busyMin}m booked, next: ${nextLabel}.`;

          // IMPORTANT: include the Google event ID with every line. Without it
          // the AI had to fabricate IDs when asked to delete or update
          // events, which failed with 404 Not Found.
          const lines = items.map((ev: any) => {
            const t = ev.start?.dateTime
              ? new Date(ev.start.dateTime).toLocaleTimeString('en-IN', {timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit'})
              : 'All Day';
            return `- [ID: ${ev.id}] "${ev.summary}" at ${t}`;
          });
          calendarContext = `${summary}\nToday's Events (IST):\n${lines.join('\n') || "No events today."}`;
        }
      } catch (err) { console.error("Cal context error", err); }
    }

    let taskContext = "No active tasks.";
    try {
      const tasks = await prisma.task.findMany({ where: { userId: activeUser.id, status: 'TODO' }, take: 50 });
      if (tasks.length > 0) {
        const byCat: Record<string, number> = {};
        for (const t of tasks) byCat[t.category] = (byCat[t.category] || 0) + 1;
        const catLine = Object.entries(byCat)
          .sort((a, b) => b[1] - a[1])
          .map(([c, n]) => `${c}: ${n}`)
          .join(", ");
        const summary = `TASK SUMMARY: ${tasks.length} open (${catLine}).`;
        const lines = tasks.map((t: any) => `- [ID: ${t.id}] [${t.category}] ${t.title}`);
        taskContext = `${summary}\nACTIVE TASKS:\n${lines.join('\n')}`;
      } else {
        taskContext = "TASK SUMMARY: 0 open. Inbox zero.";
      }
    } catch (err) { console.error("Task context error", err); }

    let expenseContext = "No expenses recorded.";
    try {
      // 60-day window so the trailing 4-week baseline + last-month
      // comparison both have enough data. 500-row cap is a safety net;
      // real users rarely hit it inside 60 days.
      const sinceDate = new Date();
      sinceDate.setDate(sinceDate.getDate() - 60);
      const expenses = await prisma.expense.findMany({
        where: { userId: activeUser.id, date: { gte: sinceDate } },
        orderBy: { date: "desc" },
        take: 500,
      });
      if (expenses.length > 0) {
        // Pre-computed insights block — totals, baselines, anomalies,
        // MoM, daily pattern, on-pace projection. Gemini reads this
        // first; the raw rows below are only for drill-down.
        const spendBlock = buildSpendIntelligenceBlock(expenses);

        // Raw rows for the last 21 days — guarantees full this-week +
        // last-week coverage even at high txn density, plus a buffer
        // for "last X days" style queries. Bounded at 200 to keep the
        // prompt size sane on outlier accounts.
        const twentyOneDaysAgo = new Date();
        twentyOneDaysAgo.setDate(twentyOneDaysAgo.getDate() - 21);
        const recentRows = expenses
          .filter((e: any) => new Date(e.date) >= twentyOneDaysAgo)
          .slice(0, 200)
          .map((e: any) => {
            const formattedDate = new Date(e.date).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", year: 'numeric', month: 'short', day: 'numeric' });
            return `- ${formattedDate} | Merchant: ${e.merchant} | Category: ${e.category} | Amount: ₹${e.amount}`;
          }).join('\n');

        expenseContext = `${spendBlock}\n\nRECENT TRANSACTIONS (every txn in the last 21 days — use this for any window not pre-summarized above):\n${recentRows}`;
      }
    } catch (err) { console.error("Expense context error", err); }

    // Gmail intent gate. We deliberately keep the keyword list TIGHT so a
    // vague follow-up like "deep search" or "dig deeper" doesn't pull the
    // model into email territory when the user was asking about expenses.
    // Note: history mentions of email do NOT count — only the current turn.
    let gmailContext: string | null = null;
    const hasGmailIntent = ["email", "inbox", "gmail", "mail", "scan", "reply"].some(k => latestMessage.toLowerCase().includes(k));
    if (accessToken && hasGmailIntent) {
      try {
        const emails = await fetchGmailSnippets(accessToken);
        if (emails && emails.length > 0) {
          // Surface the Gmail message id on every line so the AI can emit
          // reply_email / task-sourceId actions with a real id instead of
          // fabricating one. IDs are also what the dedup table keys on.
          gmailContext = `RECENT UNREAD EMAILS:\n${emails.map((e: any) => `- [EMAIL_ID: ${e.id}] From: ${e.from} | Subject: ${e.subject} | Snippet: ${e.snippet}`).join('\n')}`;
        } else { gmailContext = "Inbox is clean!"; }
      } catch (err) { console.error("Gmail context error", err); }
    }

    // 2. System Prompt
    //
    // The GMAIL block is ONLY included when the user explicitly asked about
    // email this turn. Previously it was always present (with a leading
    // "Gmail scan available!" placeholder) AND a duplicate `${gmailContext}`
    // appeared in the GMAIL INTELLIGENCE section — which biased the model
    // into pivoting to email whenever a query was vague.
    const gmailContextLine = gmailContext
      ? `      - GMAIL: ${gmailContext}\n`
      : "";

    const prompt = `
      You are "Command Center AI". Respond clearly and concisely.

      CORE SETTINGS:
      - TIMEZONE: Indian Standard Time (IST, UTC+5:30)
      - REFERENCE NOW: ${istNow}
      - CURRENT DATE: ${istDate.toDateString()}

      IMPORTANT:
      - All relative times like "today", "tonight", "7 PM" must be calculated using the IST reference provided above.
      - When generating "startTime" or "endTime" for calendar actions, DO NOT use UTC. Use local IST time.

      --- ABBREVIATIONS (interpret these naturally, expand when helpful) ---
      F1 = Formula 1 · IPL = Indian Premier League · MF = Mutual Fund · SIP = Systematic Investment Plan · EMI = Equated Monthly Instalment · UPI = Unified Payments Interface · CC = Credit Card · FD = Fixed Deposit · NAV = Net Asset Value · APM = Associate Product Manager · PM = Product Manager or Prime Minister (use context) · DOB = Date of Birth · ETA = Estimated Time of Arrival · cal = calendar · msg = message · txn = transaction. Treat other common shorthand sensibly from context.

      --- TOPIC DISCIPLINE (CRITICAL — READ FIRST) ---
      - Vague follow-ups like "deep search", "dig deeper", "look harder", "search again", "tell me more", "be thorough" CONTINUE the topic of the user's prior turn. They do NOT permit you to pivot to a different data source.
      - Example: if the prior turn was about food expenses, "do a deep search" means search the expense data harder (scan RECENT TRANSACTIONS by merchant, check the INVENTORY block) — NOT scan email.
      - You may ONLY consider email if the user's CURRENT message explicitly contains email / inbox / mail / gmail / reply / scan. Past mentions in HISTORY do NOT permit a fresh email scan or fresh email mention.
      - Answer the question the user actually asked. Never offer to "scan email instead" as a pivot away from an unresolved query.

      CONTEXT:
      - CALENDAR: ${calendarContext}
      - TASKS: ${taskContext}
${gmailContextLine}      - EXPENSES: ${expenseContext}
${newsFeedContext ? `      - ${newsFeedContext}\n` : ""}      - HISTORY: The recent interaction history (last 10 turns max — older turns are intentionally dropped to keep prompt size bounded). Use it for context.
      ${JSON.stringify(messages.slice(0, -1).slice(-10))}
      
      CAPABILITIES (Output JSON for actions):
      - Create Event: {"action": "create_event", "summary": "Title", "startTime": "YYYY-MM-DDTHH:mm:ss", "endTime": "YYYY-MM-DDTHH:mm:ss"}
      - Update/Delete Event: {"action": "update_event", "eventId": "ID"}, {"action": "delete_event", "eventId": "ID"}
      * IMPORTANT: eventId MUST come verbatim from the [ID: ...] prefix in the CALENDAR context above. Never invent IDs, never use summaries as IDs. If the user asks to clear / remove / delete multiple events (e.g. "before 8am"), emit ONE delete_event JSON block per matching event.
      - Reply to email: {"action": "reply_email", "emailId": "GMAIL_MSG_ID", "body": "Your reply text"}
      * IMPORTANT: emailId MUST be a real Gmail message id pulled from the "RECENT UNREAD EMAILS" block below (or an id you extracted from a previous fetch this session). Write a polite, concise reply body in first person as the user. Keep it under 120 words unless the user asks for more. Never invent emailIds.
      - Send a NEW email (no existing thread): {"action": "send_email", "to": "person@example.com", "subject": "Subject line", "body": "Your message", "cc": "optional@x.com", "bcc": "optional@y.com"}
      * Use this whenever the user asks you to email someone and you don't have a pre-existing thread to reply to. "to" must be a valid email address. If the user only gives a name (e.g. "email rishi about the demo"), ASK for the address instead of guessing. "cc" and "bcc" are optional — omit them entirely if not specified. Write a polite, first-person body signed as the user, with a clear subject line.
      - Create Task: {"action": "create_task", "title": "...", "category": "Work" | "Personal" | "Urgent", "sourceId": "GMAIL_MSG_ID_IF_APPLICABLE"}
      - Update/Delete Task: {"action": "update_task", "taskId": "ID", "status": "DONE"}, {"action": "delete_task", "taskId": "ID"}
      - Food Order: {"action": "create_food_order", "restaurant": "...", "items": "...", "cost": 0.0, "etaMinutes": 25}
      - Save Preference: {"action": "save_preference", "key": "...", "value": "..."}
      - Open a news article: {"action": "open_article", "url": "https://..."}
      * ONLY after the user confirms they want to read the full story. The url MUST be the exact URL from the NEWS FEED block for the item you summarised — never invent or guess a URL.
${newsFeedContext ? `      --- NEWS INTELLIGENCE ---
      - The NEWS FEED block under CONTEXT lists the user's current news items with titles, sources, descriptions, and URLs.
      - When the user asks about news, a headline, or a topic (tech, finance, F1/Formula 1, cricket/IPL, policy, etc.), find the most relevant item(s) and give a SHORT paragraph summary — 3 to 4 sentences, in your own words, grounded in the title and description. Don't fabricate details beyond what's given.
      - After the summary, ALWAYS end by asking: "Want me to open the full article?"
      - If the user then confirms (yes / open it / sure / go ahead), emit an open_article action with the EXACT URL from the NEWS FEED for the item you just summarised. If several items matched, summarise the single best one and note that more are available.
      - This is the one news action: summarise as prose first, open only on confirmation.
` : ``}${gmailContext ? `      --- GMAIL INTELLIGENCE (the user asked about email this turn) ---
      The GMAIL block under CONTEXT has the latest unread snippets. Identify actionable tasks (deadlines, invoices, meeting requests). For each, ASK the user before adding as a task. Always include the Gmail Message ID as "sourceId" for dedup.
` : ``}
      --- EXPENSE INTELLIGENCE & ANALYSIS ---
      - The EXPENSES context has THREE sections in order: (1) SPEND INTELLIGENCE block with THIS WEEK + LAST WEEK breakdowns by category and merchant, baselines, anomalies, daily pattern, MTD pace; (2) an INVENTORY block listing every category and every merchant seen in the last 21 days with how each merchant was tagged; (3) a RECENT TRANSACTIONS list covering every transaction in the last 21 days.
      - For THIS WEEK / LAST WEEK pattern questions: read from the corresponding section of the SPEND INTELLIGENCE block. Those numbers are authoritative — do not re-derive them.
      - For "yesterday" / "last Tuesday" / "last 3 days" / specific-day windows: filter RECENT TRANSACTIONS by date yourself.

      MANDATORY DRILL-DOWN BEFORE CLAIMING "NO DATA":
      If the user asks about a category (e.g., "food expenses last week") and you don't see that category in the relevant LAST WEEK / THIS WEEK breakdown, you MUST run these checks BEFORE saying there's nothing:
      1. Look at the INVENTORY "categories present" line for that window. If the category genuinely isn't there, say so AND list the categories that ARE present, with counts.
      2. Look at the INVENTORY "merchants seen" block. Match by brand name — these merchants are FOOD regardless of how the classifier tagged them: Swiggy, Zomato, Eatsure, Domino's, Domino, McDonald, Mcdelivery, KFC, Subway, Starbucks, Chaayos, Third Wave Coffee, Blinkit, Zepto, Instamart, BigBasket, Licious, Dunzo, Faasos, Box8, Behrouz, Cafe Coffee Day, Burger King, Pizza Hut, Wow Momo, Haldiram.
      3. Similarly for other categories: Travel = Uber, Ola, Rapido, IndiGo, Air India, IRCTC, RedBus, MakeMyTrip, Goibibo, ixigo, OYO. Shopping = Amazon, Flipkart, Myntra, Ajio, Meesho, Nykaa. Subscription = Netflix, Spotify, Hotstar, YouTube, ChatGPT, Claude, Notion, Figma.
      4. If you find a brand-match that was tagged with a different category (e.g., Swiggy tagged "Other"), surface it explicitly: "I see 3 Swiggy charges last week totaling ₹X, but they were tagged 'Other' — looks like the classifier mis-tagged them. Hit SYNC in Expense Intelligence to re-classify."
      5. Only after steps 1-4 turn up nothing, respond: "I see [N] transactions in your last 21 days, in these categories: [list]. No Food-related transactions or merchant matches in [period]. If you ordered food and it isn't showing up, hit the SYNC button in Expense Intelligence — the email may not have been processed yet." Do NOT offer to scan email; that's a topic pivot.

      - For "what was that ₹X charge?" drill-down, use RECENT TRANSACTIONS.
      - When answering, cite concrete numbers. Use phrases like "over the board", "in line with usual" only when the SPEND INTELLIGENCE block explicitly says so.
      - Tell a short story: where the spend went, what stands out, the verdict vs baseline.

      --- ANALYTICAL MODE (CRITICAL) ---
      - If the user is asking for analysis / explanation / a summary / a pattern read, respond with prose ONLY. DO NOT emit any {"action": "..."} JSON in analytical responses — those blocks get executed as tool calls and would be wrong for an analysis turn.
      - A NEWS SUMMARY is prose only (no action). Opening the article AFTER the user confirms is the one exception — emit open_article then.
      - Only emit action JSON when the user is asking you to DO something (create/update/delete event or task, send/reply email, save preference, food order, Zomato, open a confirmed news article).
      --- TASK CATEGORIZATION ---
      - Use "Personal" for: Shopping (Amazon, etc.), Family, Home, Health, Hobbies.
      - Use "Work" for: Office, Proejcts, Clients, Meetings.
      - Use "Urgent" for: Immediate deadlines, emergencies.

      --- ZOMATO INTELLIGENCE (HYPER-LOCAL) ---
      - STATUS: You are connected to a Zomato MCP Bridge.
      - CAPABILITIES: 
        1. {"action": "zomato_search", "preference": "Fastest" | "Best Value", "cuisine": "..."} -> Finds top matches using historical boosting.
        2. {"action": "zomato_prepare_cart", "restaurant": "...", "items": [...]} -> Drafts a cart (Human-in-the-loop).
        3. {"action": "zomato_track", "orderId": "..."} -> Force-syncs a specific order.
      - PROACTIVITY: If the current time is between 10:00 PM and 02:00 AM, and the user is active, politely check if they want a late-night snack suggested from their Favorite Restaurants.
      
      User: ${latestMessage}
    `;

    // 3. Resilience Hub — call the real prompt with model fallback. No
    // pre-flight probing (the old pattern burned 20-40s on cold starts
    // round-tripping each candidate model with a "ping").
    const result = await generateContentWithFallback(genAI, prompt);

    if (!result) {
      throw new Error("All AI models failed to generate content.");
    }

    let text = result.response.text();
    let calendarMutated = false;
    // The IST YYYY-MM-DD of the last successful calendar mutation. The client
    // uses this to jump its calendar widget to the right day so a freshly
    // created event is visible without the user having to navigate manually.
    let calendarMutatedDate: string | null = null;
    let tasksMutated = false;
    // URL the client should open in a new tab (news article the user
    // confirmed they want to read). Passed through, not executed server-side.
    let openUrl: string | null = null;

    // Convert an ISO datetime (may or may not carry a UTC offset) to the IST
    // calendar date it falls on. We first normalise to UTC ms, then add the
    // IST offset (+5:30) before reading Y/M/D so the boundary is correct.
    const istDateStrFromISO = (iso: string): string | null => {
      if (!iso) return null;
      const d = new Date(iso);
      if (isNaN(d.getTime())) return null;
      const ist = new Date(d.getTime() + 5.5 * 60 * 60_000);
      const y = ist.getUTCFullYear();
      const m = String(ist.getUTCMonth() + 1).padStart(2, "0");
      const day = String(ist.getUTCDate()).padStart(2, "0");
      return `${y}-${m}-${day}`;
    };

    // 4. Action Interception
    const actionRegex = /\{[\s\S]*?"action":[\s\S]*?\}/g;
    const actionBlocks = text.match(actionRegex) || [];
    
    // De-duplicate identical JSON blocks to prevent double-execution if the LLM repeats itself
    const uniqueBlocks = Array.from(new Set(actionBlocks));
    
    if (uniqueBlocks.length > 0) {
      const executionMessages: string[] = [];
      
      // Helper for IST Offset injection
      const formatTime = (iso: string) => {
        if (!iso) return new Date().toISOString();
        if (iso.includes('+') || iso.endsWith('Z')) return iso;
        return `${iso}+05:30`; // Force IST offset
      };

      for (const jsonStr of uniqueBlocks) {
        try {
          const cmd = JSON.parse(jsonStr);
          
          if (cmd.action === "zomato_search") {
             const userObj = await prisma.user.upsert({
               where: { email: userEmail },
               update: {},
               create: { email: userEmail, name: session?.user?.name || userEmail.split('@')[0] }
             });
             const suggestion = await ZomatoBridge.suggestBestOption(userObj.id, cmd.preference || "Best Value");
             executionMessages.push(`🔍 Zomato Scout found: **${suggestion.name}** (${suggestion.eta}m, ⭐${suggestion.rating}). Should I prepare a cart?`);
          } else if (cmd.action === "send_email" && accessToken) {
             // Fresh email (new thread) — caller supplies to/subject/body.
             // We don't try to validate beyond "to looks like an email"; the
             // helper handles edge cases and structured errors.
             if (!cmd.to || !cmd.subject || !cmd.body) {
               executionMessages.push(`❌ send_email needs to, subject, and body.`);
             } else {
               const sendRes = await sendGmailNew({
                 accessToken,
                 to: String(cmd.to),
                 subject: String(cmd.subject),
                 body: String(cmd.body),
                 cc: cmd.cc ? String(cmd.cc) : undefined,
                 bcc: cmd.bcc ? String(cmd.bcc) : undefined,
               });
               if (sendRes.ok) {
                 executionMessages.push(`✉️ Sent email to ${cmd.to} — subject: "${cmd.subject}".`);
               } else if (sendRes.status === 403) {
                 executionMessages.push(
                   `❌ Can't send emails on this session. Sign out and sign back in so Google re-consents to the gmail.send scope.`
                 );
               } else {
                 executionMessages.push(
                   `❌ Send failed: ${sendRes.error || "Unknown error"}`
                 );
               }
             }
          } else if (cmd.action === "reply_email" && accessToken) {
             // Gmail reply action — the AI must provide a real Gmail message
             // id (surfaced as [EMAIL_ID: ...] in the gmailContext block) and
             // a body string. We don't persist anything locally; Gmail is the
             // source of truth. Failures bubble up as friendly chat lines.
             if (!cmd.emailId || !cmd.body) {
               executionMessages.push(`❌ reply_email needs both emailId and body.`);
             } else {
               const replyRes = await sendGmailReply({
                 accessToken,
                 emailId: String(cmd.emailId),
                 body: String(cmd.body),
               });
               if (replyRes.ok) {
                 executionMessages.push(`✉️ Replied to email ${cmd.emailId} — sent.`);
               } else if (replyRes.status === 403) {
                 executionMessages.push(
                   `❌ Can't send replies on this session. Sign out and sign back in so Google re-consents to the gmail.send scope.`
                 );
               } else {
                 executionMessages.push(
                   `❌ Reply failed: ${replyRes.error || "Unknown error"}`
                 );
               }
             }
          } else if (cmd.action === "zomato_prepare_cart") {
             const userObj = await prisma.user.upsert({
               where: { email: userEmail },
               update: {},
               create: { email: userEmail, name: session?.user?.name || userEmail.split('@')[0] }
             });
             await ZomatoBridge.addToCart(userObj.id, cmd.restaurant, cmd.items);
             executionMessages.push(`🛒 Cart drafted at **${cmd.restaurant}** with: ${cmd.items.join(", ")}. Follow the link in the Food panel to checkout!`);
          } else if (cmd.action.includes("event") && accessToken) {
             // --- Calendar create/update/delete ---
             // Duplicate-prevention strategy:
             //   1. For create_event we query a tight time window around the
             //      requested start/end and reject if an exact (or nearly
             //      exact) summary match already exists.
             //   2. We also tag created events with
             //      extendedProperties.private.chatIdempotencyKey so a retried
             //      message never produces a second event.
             const startDT = formatTime(cmd.startTime);
             const endDT = formatTime(cmd.endTime || cmd.startTime);

             if (cmd.action === "create_event") {
               const startMs = new Date(startDT).getTime();
               const endMs = new Date(endDT).getTime();

               // Idempotency key — bucket the start time to the nearest 15 min
               // so if the LLM regenerates the same request with seconds drift
               // (e.g. "15:00:00" vs "15:00:30") we still see it as the same
               // event. Previous version used the raw ISO string which meant
               // even 1-second drift created a fresh duplicate.
               const bucketMs = 15 * 60_000;
               const roundedStart = Math.floor(startMs / bucketMs) * bucketMs;
               const normTitle = (cmd.summary || "").toLowerCase().replace(/\s+/g, " ").trim();
               const idemKey = `${userEmail}|${normTitle}|${roundedStart}`;

               // Widen the search window to ±30 minutes to catch the same
               // meeting a user might have phrased as "3pm" once and
               // "3:15pm" the next time.
               const searchMin = new Date(startMs - 30 * 60_000).toISOString();
               const searchMax = new Date(Math.max(endMs, startMs) + 30 * 60_000).toISOString();

               const listUrl = `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${encodeURIComponent(searchMin)}&timeMax=${encodeURIComponent(searchMax)}&singleEvents=true&privateExtendedProperty=${encodeURIComponent(`chatIdempotencyKey=${idemKey}`)}`;

               const conflictsRes = await fetch(listUrl, {
                 headers: { Authorization: `Bearer ${accessToken}` }
               });

               if (conflictsRes.ok) {
                 const conflicts = await conflictsRes.json();
                 if ((conflicts.items || []).length > 0) {
                   executionMessages.push(`⚠️ Calendar: "${cmd.summary}" was already created earlier — skipping duplicate.`);
                   continue;
                 }
               }

               // Secondary check: same-title (fuzzy), overlapping-time events.
               // We normalise both sides (lowercase, collapse whitespace,
               // strip the "✨" prefix Gmail-sync adds) so a chat event and a
               // Gmail-sync event for the same meeting don't both get created.
               const overlapUrl = `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${encodeURIComponent(searchMin)}&timeMax=${encodeURIComponent(searchMax)}&singleEvents=true`;
               const overlapRes = await fetch(overlapUrl, {
                 headers: { Authorization: `Bearer ${accessToken}` }
               });
               if (overlapRes.ok) {
                 const overlap = await overlapRes.json();
                 const norm = (s: string) =>
                   (s || "").toLowerCase().replace(/^[\p{Emoji_Presentation}\p{Extended_Pictographic}\s]+/u, "")
                     .replace(/\s+/g, " ").trim();
                 const exactMatch = (overlap.items || []).find((ev: any) =>
                   norm(ev.summary || "") === norm(cmd.summary || "")
                 );
                 if (exactMatch) {
                   executionMessages.push(`⚠️ Calendar: "${cmd.summary}" already exists at this time.`);
                   continue;
                 }
               }

               const res = await fetch("https://www.googleapis.com/calendar/v3/calendars/primary/events", {
                 method: "POST",
                 headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
                 body: JSON.stringify({
                   summary: cmd.summary,
                   start: { dateTime: startDT, timeZone: "Asia/Kolkata" },
                   end: { dateTime: endDT, timeZone: "Asia/Kolkata" },
                   extendedProperties: {
                     private: {
                       chatIdempotencyKey: idemKey,
                       source: "command_center_chat"
                     }
                   }
                 })
               });
               if (res.ok) {
                 executionMessages.push(`📅 Calendar: created "${cmd.summary}"`);
                 calendarMutated = true;
                 calendarMutatedDate =
                   istDateStrFromISO(startDT) ?? calendarMutatedDate;
               } else {
                 const errJson = await res.json().catch(() => ({}));
                 console.error("Google Calendar API Error:", res.status, errJson);
                 executionMessages.push(`❌ Failed to create event: ${errJson.error?.message || "Google API error"}`);
               }
             } else {
               // update_event / delete_event
               if (!cmd.eventId) {
                 executionMessages.push(`❌ ${cmd.action} requires an eventId.`);
                 continue;
               }
               const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${cmd.eventId}`, {
                 method: cmd.action === "update_event" ? "PATCH" : "DELETE",
                 headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
                 body: cmd.action === "update_event" ? JSON.stringify({
                   summary: cmd.summary,
                   start: cmd.startTime ? { dateTime: startDT, timeZone: "Asia/Kolkata" } : undefined,
                   end: cmd.endTime ? { dateTime: endDT, timeZone: "Asia/Kolkata" } : undefined,
                 }) : undefined
               });
               if (res.ok) {
                 executionMessages.push(`📅 Calendar ${cmd.action === "update_event" ? "updated" : "deleted"}: ${cmd.summary || cmd.eventId}`);
                 calendarMutated = true;
                 calendarMutatedDate =
                   istDateStrFromISO(startDT) ??
                   istDateStrFromISO(new Date().toISOString()) ??
                   calendarMutatedDate;
               } else {
                 const errJson = await res.json().catch(() => ({}));
                 console.error("Google Calendar API Error:", res.status, errJson);
                 executionMessages.push(`❌ Failed to ${cmd.action}: ${errJson.error?.message || "Google API error"}`);
               }
             }
          } else if (cmd.action.includes("task")) {
             const userObj = await prisma.user.upsert({
               where: { email: userEmail },
               update: {},
               create: { email: userEmail, name: session?.user?.name || userEmail.split('@')[0] }
             });
             if (cmd.action === "create_task") {
               if (cmd.sourceId) {
                 const exists = await prisma.task.findUnique({ where: { externalId: cmd.sourceId }});
                 if (exists) {
                   executionMessages.push(`⚠️ Task: "${cmd.title}" already exists (Synced from Gmail).`);
                   continue;
                 }
               }
               await prisma.task.create({ data: { title: cmd.title, category: cmd.category || "Work", externalId: cmd.sourceId, userId: userObj.id }});
             }
             else if (cmd.action === "update_task") await prisma.task.update({ where: { id: cmd.taskId }, data: { status: cmd.status || "DONE" }});
             else if (cmd.action === "delete_task") await prisma.task.delete({ where: { id: cmd.taskId }});
             executionMessages.push(`✅ Task ${cmd.action.split('_')[1]}d: ${cmd.title || cmd.taskId}`);
             tasksMutated = true;
          } else if (cmd.action === "create_food_order") {
             const userObj = await prisma.user.upsert({
               where: { email: userEmail },
               update: {},
               create: { email: userEmail, name: session?.user?.name || userEmail.split('@')[0] }
             });
             await prisma.foodOrder.create({ data: { restaurant: cmd.restaurant, items: cmd.items, cost: cmd.cost || 0, etaMinutes: cmd.etaMinutes || 30, userId: userObj.id }});
             executionMessages.push(`🍕 Ordered ${cmd.items} from ${cmd.restaurant}`);
          } else if (cmd.action === "save_preference") {
              const userObj = await prisma.user.upsert({
                where: { email: userEmail },
                update: {},
                create: { email: userEmail, name: session?.user?.name || userEmail.split('@')[0] }
              });
              await prisma.userPreference.upsert({
                where: {
                  userId_key: {
                    userId: userObj.id,
                    key: cmd.key,
                  }
                },
                update: { value: cmd.value },
                create: { userId: userObj.id, key: cmd.key, value: cmd.value }
              });
              executionMessages.push(`⚙️ Saved preference: **${cmd.key}** = "${cmd.value}"`);
           } else if (cmd.action === "open_article") {
              // Client-side action — we just pass the URL back for the
              // browser to open. Validate it's a real http(s) link.
              if (typeof cmd.url === "string" && /^https?:\/\//i.test(cmd.url)) {
                openUrl = cmd.url;
                executionMessages.push(`🔗 Opening the article…`);
              } else {
                executionMessages.push(`❌ Couldn't open that — no valid article URL.`);
              }
           }
        } catch (e) { console.error("Action execution error", e); }
      }
      if (executionMessages.length > 0) text = `Done! ✨\n${executionMessages.map(m => `- ${m}`).join('\n')}`;
    }

    return NextResponse.json({
      role: 'assistant',
      content: text,
      calendarMutated,
      calendarMutatedDate,
      tasksMutated,
      foodMutated: text.includes("🍕") || text.includes("💡"),
      openUrl,
    });

  } catch (error: any) {
    console.error("Critical Chat API Error:", error);
    return NextResponse.json({ error: "System Unavailable", details: error.message }, { status: 500 });
  }
}

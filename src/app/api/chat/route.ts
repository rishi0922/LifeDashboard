import { GoogleGenerativeAI } from "@google/generative-ai";
import { getRobustModel } from "@/lib/gemini";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { fetchGmailSnippets } from "@/lib/gmail";
import { ZomatoBridge } from "@/lib/zomato";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY is not configured in .env");
    }

    const session = await getServerSession(authOptions);
    //@ts-ignore
    const accessToken = session?.accessToken;
    const userEmail = session?.user?.email || "dummy@local.dev";
    
    const genAI = new GoogleGenerativeAI(apiKey);
    const { messages } = await req.json();
    const latestMessage = messages[messages.length - 1]?.content;

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
          calendarContext = `Today's Events (IST):\n${data.items?.map((ev: any) => `- ${ev.summary} at ${ev.start?.dateTime ? new Date(ev.start.dateTime).toLocaleTimeString('en-IN', {timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit'}) : 'All Day'}`).join('\n') || "No events today."}`;
        }
      } catch (err) { console.error("Cal context error", err); }
    }

    let taskContext = "No active tasks.";
    try {
      const activeUser = await prisma.user.findFirst();
      if (activeUser) {
        const tasks = await prisma.task.findMany({ where: { userId: activeUser.id, status: 'TODO' }, take: 20 });
        taskContext = tasks.length > 0 ? `ACTIVE TASKS:\n${tasks.map((t: any) => `- [ID: ${t.id}] ${t.title}`).join('\n')}` : "All tasks done!";
      }
    } catch (err) { console.error("Task context error", err); }

    let gmailContext = "Gmail scan available! Ask me to 'check mail' or 'scan inbox' to see unread updates.";
    const hasGmailIntent = ["email", "inbox", "gmail", "mail", "scan"].some(k => latestMessage.toLowerCase().includes(k));
    if (accessToken && hasGmailIntent) {
      try {
        const emails = await fetchGmailSnippets(accessToken);
        if (emails && emails.length > 0) {
          gmailContext = `RECENT UNREAD EMAILS:\n${emails.map((e: any) => `- From: ${e.from} | Subject: ${e.subject} | Snippet: ${e.snippet}`).join('\n')}`;
        } else { gmailContext = "Inbox is clean!"; }
      } catch (err) { console.error("Gmail context error", err); }
    }

    // 2. System Prompt
    const prompt = `
      You are "Command Center AI". Respond clearly and concisely.
      
      CORE SETTINGS:
      - TIMEZONE: Indian Standard Time (IST, UTC+5:30)
      - REFERENCE NOW: ${istNow}
      - CURRENT DATE: ${istDate.toDateString()}
      
      IMPORTANT:
      - All relative times like "today", "tonight", "7 PM" must be calculated using the IST reference provided above.
      - When generating "startTime" or "endTime" for calendar actions, DO NOT use UTC. Use local IST time.
      
      CONTEXT:
      - CALENDAR: ${calendarContext}
      - TASKS: ${taskContext}
      - GMAIL: ${gmailContext}
      - HISTORY: Below is the recent interaction history of this session. Use it for context.
      ${JSON.stringify(messages.slice(0, -1))}
      
      CAPABILITIES (Output JSON for actions):
      - Create Event: {"action": "create_event", "summary": "Title", "startTime": "YYYY-MM-DDTHH:mm:ss", "endTime": "YYYY-MM-DDTHH:mm:ss"}
      - Update/Delete Event: {"action": "update_event", "eventId": "ID"}, {"action": "delete_event", "eventId": "ID"}
      - Create Task: {"action": "create_task", "title": "...", "category": "Work" | "Personal" | "Urgent", "sourceId": "GMAIL_MSG_ID_IF_APPLICABLE"}
      - Update/Delete Task: {"action": "update_task", "taskId": "ID", "status": "DONE"}, {"action": "delete_task", "taskId": "ID"}
      - Food Order: {"action": "create_food_order", "restaurant": "...", "items": "...", "cost": 0.0, "etaMinutes": 25}
      - Save Preference: {"action": "save_preference", "key": "...", "value": "..."}
      --- GMAIL INTELLIGENCE ---
      ${gmailContext}
      If the user asks to "Scan my inbox" or mentions "email/mail":
      1. The snippets above ARE the latest unread emails. DO NOT ask for permission to scan; analyze them immediately.
      2. Identify actionable tasks (e.g., deadlines, invoices, meeting requests).
      3. For each actionable item, ASK the user if they want to add it as a task. IMPORTANT: Always include the Gmail Message ID as "sourceId" for deduplication.
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

    // 3. Resilience Hub (Robust SDK Utility)
    const model = await getRobustModel(genAI);
    const result = await model.generateContent(prompt);

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
               // Expand window by ±5 minutes so small LLM drift still finds the existing event.
               const startMs = new Date(startDT).getTime();
               const endMs = new Date(endDT).getTime();
               const searchMin = new Date(startMs - 5 * 60_000).toISOString();
               const searchMax = new Date(Math.max(endMs, startMs) + 5 * 60_000).toISOString();

               const idemKey = `${userEmail}|${(cmd.summary || "").toLowerCase().trim()}|${startDT}`;
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

               // Secondary check: same-title, overlapping-time events that
               // weren't created by us (e.g. user already had the meeting).
               const overlapUrl = `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${encodeURIComponent(searchMin)}&timeMax=${encodeURIComponent(searchMax)}&singleEvents=true`;
               const overlapRes = await fetch(overlapUrl, {
                 headers: { Authorization: `Bearer ${accessToken}` }
               });
               if (overlapRes.ok) {
                 const overlap = await overlapRes.json();
                 const exactMatch = (overlap.items || []).find((ev: any) =>
                   ev.summary?.toLowerCase().trim() === (cmd.summary || "").toLowerCase().trim()
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
             //@ts-ignore
             await prisma.foodOrder.create({ data: { restaurant: cmd.restaurant, items: cmd.items, cost: cmd.cost || 0, etaMinutes: cmd.etaMinutes || 30, userId: userObj.id }});
             executionMessages.push(`🍕 Ordered ${cmd.items} from ${cmd.restaurant}`);
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
      foodMutated: text.includes("🍕") || text.includes("💡")
    });

  } catch (error: any) {
    console.error("Critical Chat API Error:", error);
    return NextResponse.json({ error: "System Unavailable", details: error.message }, { status: 500 });
  }
}

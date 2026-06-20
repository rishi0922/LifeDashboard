import { NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { generateContentWithFallback } from "@/lib/gemini";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/sessionUser";

/**
 * Extract the outermost JSON OBJECT from a model reply. We can't reuse
 * lib/gemini's parseAIJson here: it matches a JSON array first, and our
 * response object contains an `actionItems` array — so parseAIJson would
 * grab that inner array instead of the whole object.
 */
function parseAIObject(text: string): Record<string, unknown> {
  const cleaned = text.replace(/```json|```/gi, "");
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) {
    throw new Error("No JSON object in AI response");
  }
  return JSON.parse(cleaned.slice(start, end + 1));
}

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * Structured voice/text capture → Note.
 *
 * GET  /api/notes            → list the user's notes (newest first)
 * POST /api/notes { text }   → Gemini cleans + titles + categorises +
 *                              extracts action items, then persists a Note.
 *
 * This is the "ORGANISE AUTOMATICALLY" pillar: a rambly brain-dump or
 * voice memo comes in raw, a structured record comes out. The chat
 * assistant remains the place for *commands* (create event/task); this
 * endpoint is purely for *capture* — it never mutates the calendar.
 */

const ALLOWED_CATEGORIES = [
  "Idea",
  "Task",
  "Meeting",
  "Personal",
  "Work",
  "Reminder",
  "Note",
] as const;

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ notes: [] });

  const notes = await prisma.note.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  return NextResponse.json({ notes });
}

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { text?: string; source?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const raw = (body.text || "").trim();
  if (!raw) return NextResponse.json({ error: "text is required" }, { status: 400 });
  const source = body.source === "voice" ? "voice" : "manual";

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "AI is not configured." }, { status: 500 });
  }

  // Sensible structured fallback if the AI stage fails — we never want a
  // capture to be lost just because the model hiccuped.
  let structured = {
    title: raw.slice(0, 60),
    category: "Note" as string,
    summary: "",
    content: raw,
    actionItems: [] as string[],
  };

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const prompt = `
You are a note-structuring assistant. The user spoke or typed a raw brain-dump. Turn it into a clean, structured note.

Return ONLY a JSON object with this exact shape:
{
  "title": "a short 3-7 word headline",
  "category": one of ${ALLOWED_CATEGORIES.map((c) => `"${c}"`).join(", ")},
  "summary": "one concise sentence capturing the gist",
  "content": "the cleaned-up note — fix grammar, remove filler words and false starts, organise into short paragraphs or bullet points, but DO NOT invent facts the user didn't say",
  "actionItems": ["any explicit to-dos or follow-ups, as short imperative phrases — empty array if none"]
}

Rules:
- Preserve the user's meaning and all concrete details (names, dates, numbers).
- Pick the single best category. Use "Meeting" for meeting notes, "Idea" for ideas/brainstorms, "Reminder" for time-bound reminders, "Task" when the whole note is essentially one to-do, else "Personal"/"Work"/"Note".
- actionItems are only genuine to-dos, not general statements.

RAW INPUT:
"""${raw.slice(0, 6000)}"""
`.trim();

    const result = await generateContentWithFallback(genAI, prompt);
    const parsed = parseAIObject(result.response.text());

    const rawCategory = String(parsed.category ?? "");
    const category = (ALLOWED_CATEGORIES as readonly string[]).includes(rawCategory)
      ? rawCategory
      : "Note";
    structured = {
      title: String(parsed.title || raw.slice(0, 60)).slice(0, 120),
      category,
      summary: String(parsed.summary || "").slice(0, 300),
      content: String(parsed.content || raw).slice(0, 8000),
      actionItems: Array.isArray(parsed.actionItems)
        ? parsed.actionItems.map((a: unknown) => String(a)).slice(0, 20)
        : [],
    };
  } catch (err) {
    console.warn("[notes] AI structuring failed, saving raw capture", err);
    // structured already holds the raw fallback.
  }

  const note = await prisma.note.create({
    data: {
      content: structured.content,
      title: structured.title,
      category: structured.category,
      summary: structured.summary || null,
      actionItems:
        structured.actionItems.length > 0
          ? JSON.stringify(structured.actionItems)
          : null,
      source,
      userId: user.id,
    },
  });

  return NextResponse.json({ note });
}

export async function DELETE(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { id?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!body.id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  // Scope the delete to the owner so one user can't delete another's note.
  await prisma.note.deleteMany({ where: { id: body.id, userId: user.id } });
  return NextResponse.json({ success: true });
}

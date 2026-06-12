import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/sessionUser";

export const dynamic = "force-dynamic";

/**
 * Goal Milestones — persisted as a single UserPreference row
 * (key "finance_goals") holding a JSON array of goals. A dedicated
 * table would be overkill for a list the UI always reads and writes
 * whole.
 */

export interface Goal {
  id: string;
  emoji: string;
  name: string;
  progress: number; // 0..100
}

/** Shown to users who haven't saved their own goals yet. */
const DEFAULT_GOALS: Goal[] = [
  { id: "default-1", emoji: "🏍️", name: "Triumph Speed 400", progress: 45 },
  { id: "default-2", emoji: "🎮", name: "PS5", progress: 60 },
];

const PREF_KEY = "finance_goals";

function sanitizeGoals(raw: unknown): Goal[] | null {
  if (!Array.isArray(raw)) return null;
  const out: Goal[] = [];
  for (const g of raw.slice(0, 10)) {
    if (!g || typeof g !== "object") continue;
    const name = String((g as Record<string, unknown>).name ?? "").slice(0, 60).trim();
    if (!name) continue;
    const emoji = String((g as Record<string, unknown>).emoji ?? "🎯").slice(0, 8) || "🎯";
    const progressNum = Number((g as Record<string, unknown>).progress);
    const progress = Number.isFinite(progressNum)
      ? Math.min(100, Math.max(0, Math.round(progressNum)))
      : 0;
    const id =
      String((g as Record<string, unknown>).id ?? "") ||
      `goal-${Math.random().toString(36).slice(2, 10)}`;
    out.push({ id, emoji, name, progress });
  }
  return out;
}

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ goals: DEFAULT_GOALS, isDefault: true });

  const pref = await prisma.userPreference.findUnique({
    where: { userId_key: { userId: user.id, key: PREF_KEY } },
  });

  if (!pref) return NextResponse.json({ goals: DEFAULT_GOALS, isDefault: true });

  try {
    const goals = sanitizeGoals(JSON.parse(pref.value));
    if (!goals) throw new Error("malformed");
    return NextResponse.json({ goals, isDefault: false });
  } catch {
    return NextResponse.json({ goals: DEFAULT_GOALS, isDefault: true });
  }
}

export async function PUT(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const goals = sanitizeGoals((body as Record<string, unknown>)?.goals);
  if (!goals) {
    return NextResponse.json(
      { error: "Body must be { goals: Goal[] } with at least a name per goal" },
      { status: 400 },
    );
  }

  await prisma.userPreference.upsert({
    where: { userId_key: { userId: user.id, key: PREF_KEY } },
    update: { value: JSON.stringify(goals) },
    create: { userId: user.id, key: PREF_KEY, value: JSON.stringify(goals) },
  });

  return NextResponse.json({ goals, isDefault: false });
}

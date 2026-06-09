import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ensureMonthlyBudgetSetup } from "@/lib/budgetSetup";

export const dynamic = "force-dynamic";

/**
 * POST /api/budget/ensure
 *
 * Idempotent: hit it as often as you like; only the first call per
 * month per user creates anything. Returns what (if anything) was
 * created so the client can refresh the affected widgets.
 */
export async function POST() {
  const session = await getServerSession(authOptions);
  // @ts-ignore — session.accessToken is added by the next-auth callbacks
  const accessToken: string | undefined = session?.accessToken;
  const userEmail = session?.user?.email;

  if (!userEmail) {
    return NextResponse.json(
      { error: "Unauthorized — sign in with Google first." },
      { status: 401 },
    );
  }

  const user = await prisma.user.upsert({
    where: { email: userEmail },
    update: {},
    create: {
      email: userEmail,
      name: session?.user?.name || userEmail.split("@")[0],
    },
  });

  const result = await ensureMonthlyBudgetSetup({
    userId: user.id,
    accessToken: accessToken || null,
  });

  return NextResponse.json(result);
}

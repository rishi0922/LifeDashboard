import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * Returns the signed-in user (upserting if needed).
 * Falls back to the first user only when nobody is logged in — this is
 * important because /api/gmail/sync writes tasks under session.user.email,
 * while the previous findFirst() often returned a stale dev user
 * ("dummy@local.dev") making the Priorities panel look empty even though
 * tasks existed for the real user.
 */
async function getOrCreateUser() {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email;
  if (email) {
    return prisma.user.upsert({
      where: { email },
      update: {},
      create: {
        email,
        name: session.user?.name || email.split("@")[0],
      },
    });
  }
  let user = await prisma.user.findFirst();
  if (!user) user = await prisma.user.create({ data: { name: "Chief", email: "dummy@local.dev" }});
  return user;
}

export async function GET() {
  try {
    const user = await getOrCreateUser();

    // --- Dynamic Cleanup Logic ---
    // We only want to prune things the user has already handled or that are
    // genuinely stale. The previous rule deleted anything created before today,
    // which threw away fresh Gmail-sync tasks for "tomorrow's meeting" and
    // AI-generated follow-ups the moment the day rolled over. Now we only
    // delete DONE tasks: either completed > 4h ago, or created more than a
    // few days back.
    const now = new Date();
    const fourHoursAgo = new Date(now.getTime() - 4 * 60 * 60 * 1000);
    const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);

    await prisma.task.deleteMany({
      where: {
        userId: user.id,
        OR: [
          { status: 'DONE', updatedAt: { lt: fourHoursAgo } },
          { status: 'DONE', createdAt: { lt: threeDaysAgo } }
        ]
      }
    });
    // ----------------------------

    const tasks = await prisma.task.findMany({ 
      where: { userId: user.id }, 
      orderBy: { createdAt: 'desc' } 
    });
    return NextResponse.json({ tasks });
  } catch (error: any) {
    console.error("GET Tasks Error:", error);
    return NextResponse.json({ 
      error: "Failed to fetch tasks", 
      message: error.message, 
      stack: error.stack 
    }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const { title, category } = await req.json();
    const user = await getOrCreateUser();

    const task = await prisma.task.create({
      data: {
        title,
        category: category || "Work",
        userId: user.id
      }
    });

    const updatedUser = await prisma.user.update({
      where: { id: user.id },
      data: {
        points: { increment: 10 },
        tier: user.points + 10 >= 500 ? "Platinum" : user.points + 10 >= 250 ? "Gold" : "Silver"
      }
    });

    return NextResponse.json({ task, gamification: updatedUser });
  } catch (error) {
    console.error("POST Task Error:", error);
    return NextResponse.json({ error: "Failed to create task" }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const { id, status, title, category } = await req.json();
    
    const data: any = {};
    if (status !== undefined) data.status = status;
    if (title !== undefined) data.title = title;
    if (category !== undefined) data.category = category;

    const task = await prisma.task.update({ 
      where: { id }, 
      data 
    });
    
    return NextResponse.json({ task });
  } catch (error) {
    console.error("PATCH Task Error:", error);
    return NextResponse.json({ error: "Failed to update task" }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const { id } = await req.json();
    await prisma.task.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE Task Error:", error);
    return NextResponse.json({ error: "Failed to delete task" }, { status: 500 });
  }
}

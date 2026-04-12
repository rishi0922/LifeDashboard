import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

async function getOrCreateUser() {
  let user = await prisma.user.findFirst();
  if (!user) user = await prisma.user.create({ data: { name: "Chief", email: "dummy@local.dev" }});
  return user;
}

export async function GET() {
  try {
    const user = await getOrCreateUser();

    // --- Dynamic Cleanup Logic ---
    const now = new Date();
    const fourHoursAgo = new Date(now.getTime() - 4 * 60 * 60 * 1000);
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    // Auto-Delete: Completed > 4h OR anything from previous days
    await prisma.task.deleteMany({
      where: {
        userId: user.id,
        OR: [
          { status: 'DONE', updatedAt: { lt: fourHoursAgo } },
          { createdAt: { lt: startOfToday } }
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

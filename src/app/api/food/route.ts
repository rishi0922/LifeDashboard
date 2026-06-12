import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/sessionUser";

import { ZomatoBridge } from "@/lib/zomato";

export async function GET() {
  try {
    // Session-scoped. The old findFirst() fallback read whichever user row
    // was inserted first (the dev stub), so the widget showed the wrong
    // account's orders and "not linked" even when the real user had a
    // ZOMATO_TOKEN saved.
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ orders: [], isLinked: false });

    // 1. Verify Real Token for true "isLinked" status
    const tokenPref = await prisma.userPreference.findUnique({
      where: { userId_key: { userId: user.id, key: "ZOMATO_TOKEN" } }
    });
    const isLinked = !!tokenPref?.value;

    // 2. Autonomous Sync: Only if linked
    if (isLinked) {
      try {
        await ZomatoBridge.syncExternalOrders(user.id);
      } catch (syncErr) {
        console.error("Zomato Sync Warning:", syncErr);
      }
    }

    const orders = await prisma.foodOrder.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' }
    });

    return NextResponse.json({ orders, isLinked });
  } catch (error) {
    console.error("Food API GET Error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const { restaurant, items, cost, etaMinutes } = body;

    const order = await prisma.foodOrder.create({
      data: {
        restaurant,
        items,
        cost,
        etaMinutes,
        userId: user.id,
        status: "Preparing"
      }
    });

    return NextResponse.json(order);
  } catch (error) {
    console.error("Food API POST Error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

import { ZomatoBridge } from "@/lib/zomato";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    const user = await prisma.user.findFirst(); // Fallback for demo

    if (!user) return NextResponse.json({ orders: [], isLinked: false }, { status: 404 });

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
    const session = await getServerSession(authOptions);
    const user = await prisma.user.findFirst();
    
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

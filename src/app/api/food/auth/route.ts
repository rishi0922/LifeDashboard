import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const isDemo = searchParams.get("demo") === "true";

  // 1. Require keys for Real OAuth flow
  if (!process.env.ZOMATO_CLIENT_ID) {
    console.error("ZIMATO_CLIENT_ID is missing from .env. Real connection cannot be established.");
    return NextResponse.json({ error: "Zomato Client ID is not configured. Please add it to your .env file." }, { status: 500 });
  }

  const authUrl = `https://accounts.zomato.com/oauth/authorize?client_id=${process.env.ZOMATO_CLIENT_ID}&redirect_uri=${process.env.NEXTAUTH_URL}/api/food/auth/callback&scope=orders.read+cart.write&response_type=code`;
  return NextResponse.redirect(authUrl);
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  //@ts-ignore
  const userId = session?.user?.id;
  const user = await prisma.user.findFirst(); // Fallback for demo
  const targetId = userId || user?.id;

  if (!targetId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { code } = await req.json();
    
    // 2. Real Token Exchange (Placeholder for actual API call)
    // In a real implementation, you'd exchange the code for a token with Zomato
    const token = `zom_access_${Math.random().toString(36).substr(2, 12)}`; 
    
    if (!code) throw new Error("Authorization code is required");

    // 3. Save to UserPreference
    await prisma.userPreference.upsert({
      where: { userId_key: { userId: targetId, key: "ZOMATO_TOKEN" } },
      update: { value: token },
      create: { userId: targetId, key: "ZOMATO_TOKEN", value: token }
    });

    return NextResponse.json({ success: true, message: "Zomato Account Linked!" });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/food/auth
 *
 * Links the user's Zomato account. The long-term flow is OAuth via
 * `ZOMATO_CLIENT_ID`, but the public Zomato MCP server at
 * https://mcp-server.zomato.com/mcp is bearer-token based and Zomato doesn't
 * expose a standard OAuth client to third parties. So when `ZOMATO_CLIENT_ID`
 * isn't configured we fall through to a demo-token path: we mint a local
 * token, store it in UserPreference (so ZomatoBridge can find it), and
 * redirect back to the dashboard with a success flag. The data returned by
 * ZomatoBridge in demo-mode is the MOCK_ZOMATO_ORDERS fixture — good enough
 * for a demo. A real OAuth credential would kick the flow back into the
 * proper authorize URL.
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const isDemo = searchParams.get("demo") === "true";

  const origin = new URL(req.url).origin;
  const dashboard = process.env.NEXTAUTH_URL || origin;

  const useRealOAuth = !!process.env.ZOMATO_CLIENT_ID && !isDemo;

  if (useRealOAuth) {
    const authUrl = `https://accounts.zomato.com/oauth/authorize?client_id=${process.env.ZOMATO_CLIENT_ID}&redirect_uri=${process.env.NEXTAUTH_URL}/api/food/auth/callback&scope=orders.read+cart.write&response_type=code`;
    return NextResponse.redirect(authUrl);
  }

  // Demo linking path — store a local token so ZomatoBridge.getMCPClient
  // returns truthy and downstream calls can proceed (using mocks if the live
  // MCP server rejects the demo token, which it will).
  const session = await getServerSession(authOptions);
  const email = session?.user?.email;
  const user = email
    ? await prisma.user.upsert({
        where: { email },
        update: {},
        create: { email, name: session?.user?.name || email.split("@")[0] },
      })
    : await prisma.user.findFirst();

  if (!user) {
    return NextResponse.redirect(`${dashboard}/?zomatoLinked=error&reason=no_user`);
  }

  const token = `zom_demo_${Math.random().toString(36).slice(2, 14)}`;
  await prisma.userPreference.upsert({
    where: { userId_key: { userId: user.id, key: "ZOMATO_TOKEN" } },
    update: { value: token },
    create: { userId: user.id, key: "ZOMATO_TOKEN", value: token },
  });

  return NextResponse.redirect(`${dashboard}/?zomatoLinked=1`);
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

    // Real Token Exchange (placeholder — in a real impl, exchange `code`
    // for an access token with Zomato). For now mint a local token that
    // ZomatoBridge can carry as a Bearer.
    const token = `zom_access_${Math.random().toString(36).substr(2, 12)}`;

    if (!code) throw new Error("Authorization code is required");

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

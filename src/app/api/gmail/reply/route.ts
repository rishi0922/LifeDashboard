import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { sendGmailReply } from "@/lib/gmail";

export const dynamic = "force-dynamic";

/**
 * POST /api/gmail/reply
 *
 * Body: { emailId: string, body: string }
 *
 * Sends a threaded reply to the specified Gmail message. The heavy lifting
 * (fetching the original for Subject / In-Reply-To / References, building
 * the RFC2822 message, base64url encoding) is in `sendGmailReply`.
 *
 * Returns 401 if the user isn't signed in, 403 with a helpful hint if the
 * legacy gmail.readonly-only OAuth token is still in play (signed in before
 * we added gmail.send), and 400 for bad inputs.
 */
export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    //@ts-ignore
    const accessToken = session?.accessToken;
    if (!accessToken) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { emailId, body } = await req.json();
    if (!emailId || typeof emailId !== "string") {
      return NextResponse.json({ error: "emailId is required" }, { status: 400 });
    }
    if (!body || typeof body !== "string" || !body.trim()) {
      return NextResponse.json({ error: "body is required" }, { status: 400 });
    }

    const result = await sendGmailReply({ accessToken, emailId, body });
    if (!result.ok) {
      if (result.status === 403) {
        return NextResponse.json(
          {
            error: "Gmail send not permitted on this session.",
            details:
              "The gmail.send scope was added after your current sign-in. Please sign out and sign back in to re-consent.",
          },
          { status: 403 }
        );
      }
      return NextResponse.json(
        { error: result.error || "Failed to send reply" },
        { status: result.status || 500 }
      );
    }
    return NextResponse.json({
      success: true,
      id: result.id,
      threadId: result.threadId,
    });
  } catch (err: any) {
    console.error("POST /api/gmail/reply error:", err);
    return NextResponse.json(
      { error: "Internal error", details: err?.message },
      { status: 500 }
    );
  }
}

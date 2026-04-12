import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { fetchGmailSnippets } from "@/lib/gmail";

export async function GET() {
  const session = await getServerSession(authOptions);
  //@ts-ignore
  const accessToken = session?.accessToken;

  if (!accessToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const emailDetails = await fetchGmailSnippets(accessToken);
    return NextResponse.json({ emails: emailDetails });
  } catch (error: any) {
    console.error("Gmail API Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

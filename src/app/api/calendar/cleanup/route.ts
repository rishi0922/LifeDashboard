import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  //@ts-ignore
  const accessToken = session?.accessToken;

  if (!accessToken) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const now = new Date();
    const sevenDaysAgo = new Date(now);
    sevenDaysAgo.setDate(now.getDate() - 7);
    const sevenDaysFound = new Date(now);
    sevenDaysFound.setDate(now.getDate() + 7);

    const timeMin = encodeURIComponent(sevenDaysAgo.toISOString());
    const timeMax = encodeURIComponent(sevenDaysFound.toISOString());

    console.log(`🧹 Scanning calendar from ${sevenDaysAgo.toISOString()} to ${sevenDaysFound.toISOString()}`);

    const url = `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${timeMin}&timeMax=${timeMax}&singleEvents=true&orderBy=startTime`;
    
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!response.ok) throw new Error("Google API Error during scan");

    const data = await response.json();
    const events = data.items || [];
    
    const seen = new Map<string, string>(); // Key: "title|time", Value: firstEventId
    const toDelete: string[] = [];

    for (const ev of events) {
      const startTime = ev.start?.dateTime || ev.start?.date;
      const key = `${(ev.summary || "Busy").toLowerCase()}|${startTime}`;
      
      if (seen.has(key)) {
        toDelete.push(ev.id);
      } else {
        seen.set(key, ev.id);
      }
    }

    console.log(`🤖 Found ${toDelete.length} duplicates to purge.`);

    let deletedCount = 0;
    // Execute deletions in small batches to avoid rate limiting
    for (const eventId of toDelete) {
      const delRes = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${eventId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (delRes.ok) deletedCount++;
    }

    return NextResponse.json({ 
      success: true, 
      scannedCount: events.length,
      purgedCount: deletedCount 
    });

  } catch (error: any) {
    console.error("Cleanup API Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const targetDateParam = searchParams.get("date");
  
  const session = await getServerSession(authOptions);

  //@ts-ignore
  const accessToken = session?.accessToken;

  if (!accessToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Determine the base date (target date or today) in IST
    const dateToProcess = targetDateParam ? new Date(targetDateParam) : new Date();
    
    // To ensure we get the full day in IST (+05:30), we construct the RFC3339 strings manually
    const getISTString = (d: Date, time: string) => {
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}T${time}+05:30`;
    };

    const timeMin = encodeURIComponent(getISTString(dateToProcess, "00:00:00"));
    const timeMax = encodeURIComponent(getISTString(dateToProcess, "23:59:59"));

    const url = `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${timeMin}&timeMax=${timeMax}&singleEvents=true&orderBy=startTime`;
    
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({}));
      return NextResponse.json({ 
        error: "Google API Error", 
        details: errorBody.error?.message || response.statusText 
      }, { status: response.status });
    }

    const data = await response.json();
    return NextResponse.json({ 
      events: data.items || [],
      syncTime: new Date().toISOString(),
      timezone: "Asia/Kolkata"
    });
  } catch (error: any) {
    console.error("Calendar GET Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  //@ts-ignore
  const accessToken = session?.accessToken;

  if (!accessToken) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { summary, startTime, endTime } = await req.json();

    const event = {
      summary,
      description: "Created via Platform Command Center",
      start: {
        dateTime: startTime,
        timeZone: "Asia/Kolkata",
      },
      end: {
        dateTime: endTime,
        timeZone: "Asia/Kolkata",
      },
    };

    const response = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(event),
      }
    );

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error?.message || "Failed to create event");
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  const session = await getServerSession(authOptions);
  //@ts-ignore
  const accessToken = session?.accessToken;
  const { searchParams } = new URL(req.url);
  const eventId = searchParams.get("eventId");
  const batchTime = searchParams.get("batchTime"); // e.g. "09:00"

  if (!accessToken) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    if (batchTime) {
      // BATCH PURGE LOGIC: Delete all events at a specific time today
      const now = new Date();
      const timeMin = encodeURIComponent(`${now.toISOString().split('T')[0]}T${batchTime}:00+05:30`);
      const timeMax = encodeURIComponent(`${now.toISOString().split('T')[0]}T${batchTime}:59+05:30`);

      const listRes = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${timeMin}&timeMax=${timeMax}&singleEvents=true`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      const listData = await listRes.json();
      const eventsToDelete = listData.items || [];

      let deletedCount = 0;
      for (const ev of eventsToDelete) {
        await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${ev.id}`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        deletedCount++;
      }
      return NextResponse.json({ success: true, deletedCount });
    }

    if (!eventId) return NextResponse.json({ error: "Missing eventId" }, { status: 400 });

    await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${eventId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

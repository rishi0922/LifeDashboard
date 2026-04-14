import { NextResponse } from "next/server";

export async function GET() {
  try {
    const url = "https://site.api.espn.com/apis/site/v2/sports/cricket/8048/scoreboard";
    
    // We add a realistic User-Agent just in case, though ESPN doesn't currently strictly block
    const res = await fetch(url, {
      cache: "no-store",
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36"
      }
    });

    if (!res.ok) {
      return NextResponse.json({ error: "ESPN API returned " + res.status }, { status: res.status });
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (error: any) {
    console.error("[IPL Proxy] Error:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

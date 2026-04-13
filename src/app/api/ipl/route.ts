import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 30;

interface IPLMatch {
  team1: string;
  team2: string;
  score1: string;
  score2: string;
  status: string;
  isLive: boolean;
  matchTitle: string;
}

export async function GET() {
  try {
    // Fetch from Cricbuzz RSS feed for live scores
    const res = await fetch(
      "https://www.cricbuzz.com/match-api/livematches.json",
      { 
        next: { revalidate: 30 },
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
        }
      }
    );

    if (!res.ok) {
      // Fallback: Try alternate score source
      return await fetchFromAlternateSource();
    }

    const data = await res.json();
    const matches: IPLMatch[] = [];

    // Parse the Cricbuzz response
    if (data?.matches) {
      for (const match of Object.values(data.matches) as any[]) {
        const header = match?.header;
        const miniscore = match?.miniscore;
        
        if (!header) continue;
        
        // Filter for IPL matches only
        const seriesName = header?.seriesName || "";
        const isIPL = seriesName.toLowerCase().includes("indian premier league") || 
                      seriesName.toLowerCase().includes("ipl");
        
        if (!isIPL) continue;
        
        const team1 = header?.team1?.name || header?.team1?.shortName || "TBD";
        const team2 = header?.team2?.name || header?.team2?.shortName || "TBD";
        const status = header?.status || "";
        const state = header?.state || "";
        const isLive = state === "In Progress" || state === "innings break";

        let score1 = "";
        let score2 = "";

        if (miniscore) {
          const batTeam = miniscore?.batTeam;
          const bowlTeam = miniscore?.bowlTeam;
          
          if (batTeam) {
            score1 = `${batTeam.teamScore || ""}/${batTeam.teamWkts || ""} (${batTeam.overs || ""})`;
          }
          if (bowlTeam) {
            score2 = `${bowlTeam.teamScore || ""}/${bowlTeam.teamWkts || ""}`;
          }
        }

        // Use status text for scores if miniscore isn't available
        if (!score1 && !score2 && status) {
          // Status usually contains the score summary
        }

        matches.push({
          team1: getTeamShortName(team1),
          team2: getTeamShortName(team2),
          score1,
          score2,
          status: status || (isLive ? "LIVE" : "Upcoming"),
          isLive,
          matchTitle: `${getTeamShortName(team1)} vs ${getTeamShortName(team2)}`
        });
      }
    }

    // If no Cricbuzz data, try alternate source
    if (matches.length === 0) {
      return await fetchFromAlternateSource();
    }

    return NextResponse.json({ 
      matches,
      lastUpdated: new Date().toISOString()
    });

  } catch (error: any) {
    console.error("IPL Score Fetch Error:", error.message);
    return await fetchFromAlternateSource();
  }
}

async function fetchFromAlternateSource(): Promise<NextResponse> {
  try {
    // Use ESPN Cricinfo API as fallback
    const res = await fetch(
      "https://hs-consumer-api.espncricinfo.com/v1/pages/matches/current?lang=en&latest=true",
      {
        next: { revalidate: 30 },
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
        }
      }
    );

    if (!res.ok) {
      return NextResponse.json({ matches: [], lastUpdated: new Date().toISOString() });
    }

    const data = await res.json();
    const matches: IPLMatch[] = [];

    const matchList = data?.matches || [];
    for (const match of matchList) {
      const series = match?.series?.alternateName || match?.series?.longName || "";
      const isIPL = series.toLowerCase().includes("ipl") || 
                    series.toLowerCase().includes("indian premier league");

      if (!isIPL) continue;

      const teams = match?.teams || [];
      const team1 = teams[0]?.team?.abbreviation || teams[0]?.team?.name || "TBD";
      const team2 = teams[1]?.team?.abbreviation || teams[1]?.team?.name || "TBD";

      const score1Innings = teams[0]?.score || "";
      const score2Innings = teams[1]?.score || "";

      const state = match?.state || "";
      const status = match?.statusText || match?.status || "";
      const isLive = state === "LIVE" || state === "IN_PROGRESS";

      matches.push({
        team1,
        team2,
        score1: score1Innings,
        score2: score2Innings,
        status,
        isLive,
        matchTitle: `${team1} vs ${team2}`
      });
    }

    return NextResponse.json({
      matches,
      lastUpdated: new Date().toISOString()
    });

  } catch (err) {
    console.error("Alternate IPL source also failed:", err);
    return NextResponse.json({ matches: [], lastUpdated: new Date().toISOString() });
  }
}

function getTeamShortName(name: string): string {
  const mapping: Record<string, string> = {
    "Chennai Super Kings": "CSK",
    "Mumbai Indians": "MI",
    "Royal Challengers Bengaluru": "RCB",
    "Royal Challengers Bangalore": "RCB",
    "Kolkata Knight Riders": "KKR",
    "Delhi Capitals": "DC",
    "Punjab Kings": "PBKS",
    "Rajasthan Royals": "RR",
    "Sunrisers Hyderabad": "SRH",
    "Gujarat Titans": "GT",
    "Lucknow Super Giants": "LSG",
  };
  return mapping[name] || name;
}

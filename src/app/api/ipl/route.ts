import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

interface IPLMatch {
  team1: string;
  team2: string;
  score1: string;
  score2: string;
  status: string;
  isLive: boolean;
}

// All 10 IPL franchise names + abbreviations
const IPL_TEAMS = new Set([
  "CSK", "MI", "RCB", "KKR", "DC", "PBKS", "RR", "SRH", "GT", "LSG",
  "Chennai Super Kings",
  "Mumbai Indians",
  "Royal Challengers Bengaluru",
  "Royal Challengers Bangalore",
  "Kolkata Knight Riders",
  "Delhi Capitals",
  "Punjab Kings",
  "Rajasthan Royals",
  "Sunrisers Hyderabad",
  "Gujarat Titans",
  "Lucknow Super Giants",
]);

const TEAM_SHORT: Record<string, string> = {
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

function short(name: string): string {
  return TEAM_SHORT[name] ?? name;
}

// True if either team is an IPL franchise
function isIPLMatch(t1: string, t2: string): boolean {
  return IPL_TEAMS.has(t1) || IPL_TEAMS.has(t2) ||
    Object.keys(TEAM_SHORT).some(k => t1.includes(k) || t2.includes(k));
}

// Also accept if series name looks like IPL (broad check)
function isIPLSeries(name: string): boolean {
  const n = name.toLowerCase();
  return n.includes("ipl") ||
    n.includes("indian premier league") ||
    n.includes("premier league") && n.includes("india");
}

export async function GET() {
  // ---------- Source 1: Cricbuzz live matches ----------
  try {
    const cb = await fetch("https://www.cricbuzz.com/match-api/livematches.json", {
      headers: {
        "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36",
        "Accept": "application/json",
      },
      cache: "no-store",
    });

    if (cb.ok) {
      const data = await cb.json();
      const matches: IPLMatch[] = [];

      for (const m of Object.values(data?.matches ?? {}) as any[]) {
        const h = m?.header;
        if (!h) continue;

        const t1Raw = h.team1?.name ?? h.team1?.shortName ?? "";
        const t2Raw = h.team2?.name ?? h.team2?.shortName ?? "";
        const series = h.seriesName ?? "";

        // Accept if team names match IPL franchises OR series name looks like IPL
        if (!isIPLMatch(t1Raw, t2Raw) && !isIPLSeries(series)) continue;

        const ms = m?.miniscore;
        let score1 = "", score2 = "";
        if (ms?.batTeam) {
          const bt = ms.batTeam;
          score1 = `${bt.teamScore ?? ""}/${bt.teamWkts ?? ""} (${bt.overs ?? ""})`;
        }
        if (ms?.bowlTeam) {
          const bw = ms.bowlTeam;
          score2 = `${bw.teamScore ?? ""}/${bw.teamWkts ?? ""}`;
        }
        if (!score1 && !score2 && h.status) {
          // status text often contains the scores for completed innings
          score1 = "";
        }

        const isLive = ["In Progress", "innings break"].includes(h.state ?? "");
        matches.push({
          team1: short(t1Raw) || t1Raw,
          team2: short(t2Raw) || t2Raw,
          score1,
          score2,
          status: h.status ?? (isLive ? "LIVE" : "Upcoming"),
          isLive,
        });
      }

      if (matches.length > 0) {
        return NextResponse.json({ matches, source: "cricbuzz" });
      }
    }
  } catch (e) {
    console.error("Cricbuzz failed:", e);
  }

  // ---------- Source 2: ESPN Cricinfo ----------
  try {
    const es = await fetch(
      "https://hs-consumer-api.espncricinfo.com/v1/pages/matches/current?lang=en&latest=true",
      {
        headers: {
          "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36",
          "Accept": "application/json",
        },
        cache: "no-store",
      }
    );

    if (es.ok) {
      const data = await es.json();
      const matches: IPLMatch[] = [];

      for (const m of data?.matches ?? []) {
        const series = m?.series?.alternateName ?? m?.series?.longName ?? "";
        const teams = m?.teams ?? [];
        const t1Raw = teams[0]?.team?.abbreviation ?? teams[0]?.team?.name ?? "";
        const t2Raw = teams[1]?.team?.abbreviation ?? teams[1]?.team?.name ?? "";

        if (!isIPLMatch(t1Raw, t2Raw) && !isIPLSeries(series)) continue;

        const isLive = ["LIVE", "IN_PROGRESS"].includes(m?.state ?? "");
        matches.push({
          team1: short(t1Raw) || t1Raw,
          team2: short(t2Raw) || t2Raw,
          score1: typeof teams[0]?.score === "string" ? teams[0].score : "",
          score2: typeof teams[1]?.score === "string" ? teams[1].score : "",
          status: m?.statusText ?? m?.status ?? (isLive ? "LIVE" : "Upcoming"),
          isLive,
        });
      }

      if (matches.length > 0) {
        return NextResponse.json({ matches, source: "espn" });
      }
    }
  } catch (e) {
    console.error("ESPN failed:", e);
  }

  // ---------- Source 3: CricAPI ----------
  try {
    const ca = await fetch(
      "https://api.cricapi.com/v1/currentMatches?apikey=free&offset=0",
      {
        headers: { "User-Agent": "Mozilla/5.0" },
        cache: "no-store",
      }
    );
    if (ca.ok) {
      const data = await ca.json();
      const matches: IPLMatch[] = [];
      for (const m of data?.data ?? []) {
        const name = m?.name ?? "";
        const series = m?.series ?? "";

        // Extract team names from "Team A vs Team B, N Match"
        const parts = name.split(" vs ");
        const t1Raw = parts[0]?.trim() ?? "";
        const t2Raw = (parts[1] ?? "").split(",")[0]?.trim() ?? "";

        if (!isIPLMatch(t1Raw, t2Raw) && !isIPLSeries(name) && !isIPLSeries(series)) continue;

        const isLive = !!m?.matchStarted && !m?.matchEnded;
        matches.push({
          team1: short(t1Raw) || t1Raw,
          team2: short(t2Raw) || t2Raw,
          score1: m?.score?.[0]?.r != null
            ? `${m.score[0].r}/${m.score[0].w} (${m.score[0].o})`
            : "",
          score2: m?.score?.[1]?.r != null
            ? `${m.score[1].r}/${m.score[1].w}`
            : "",
          status: m?.status ?? (isLive ? "LIVE" : "Upcoming"),
          isLive,
        });
      }
      if (matches.length > 0) {
        return NextResponse.json({ matches, source: "cricapi" });
      }
    }
  } catch (e) {
    console.error("CricAPI failed:", e);
  }

  return NextResponse.json({ matches: [], source: "none" });
}

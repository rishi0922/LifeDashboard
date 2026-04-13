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

// Reliable short names
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

function short(name: string) {
  return TEAM_SHORT[name] || name;
}

export async function GET() {
  // ---------- Source 1: Cricbuzz live matches ----------
  try {
    const cb = await fetch("https://www.cricbuzz.com/match-api/livematches.json", {
      headers: { "User-Agent": "Mozilla/5.0" },
      cache: "no-store",
    });

    if (cb.ok) {
      const data = await cb.json();
      const matches: IPLMatch[] = [];

      for (const m of Object.values(data?.matches ?? {}) as any[]) {
        const h = m?.header;
        if (!h) continue;
        const series: string = h.seriesName ?? "";
        if (!series.toLowerCase().includes("ipl") &&
            !series.toLowerCase().includes("indian premier league")) continue;

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

        const isLive = ["In Progress", "innings break"].includes(h.state ?? "");
        matches.push({
          team1: short(h.team1?.name ?? h.team1?.shortName ?? "TBD"),
          team2: short(h.team2?.name ?? h.team2?.shortName ?? "TBD"),
          score1, score2,
          status: h.status ?? (isLive ? "LIVE" : "Upcoming"),
          isLive,
        });
      }

      if (matches.length > 0) {
        return NextResponse.json({ matches, source: "cricbuzz" });
      }
    }
  } catch (_) { /* fall through */ }

  // ---------- Source 2: ESPN Cricinfo ----------
  try {
    const es = await fetch(
      "https://hs-consumer-api.espncricinfo.com/v1/pages/matches/current?lang=en&latest=true",
      { headers: { "User-Agent": "Mozilla/5.0" }, cache: "no-store" }
    );

    if (es.ok) {
      const data = await es.json();
      const matches: IPLMatch[] = [];

      for (const m of data?.matches ?? []) {
        const series: string =
          m?.series?.alternateName ?? m?.series?.longName ?? "";
        if (!series.toLowerCase().includes("ipl") &&
            !series.toLowerCase().includes("indian premier league")) continue;

        const teams = m?.teams ?? [];
        const t1 = teams[0]?.team?.abbreviation ?? teams[0]?.team?.name ?? "TBD";
        const t2 = teams[1]?.team?.abbreviation ?? teams[1]?.team?.name ?? "TBD";
        const isLive = ["LIVE", "IN_PROGRESS"].includes(m?.state ?? "");

        matches.push({
          team1: short(t1), team2: short(t2),
          score1: teams[0]?.score ?? "",
          score2: teams[1]?.score ?? "",
          status: m?.statusText ?? m?.status ?? (isLive ? "LIVE" : "Upcoming"),
          isLive,
        });
      }

      if (matches.length > 0) {
        return NextResponse.json({ matches, source: "espn" });
      }
    }
  } catch (_) { /* fall through */ }

  // ---------- Source 3: cricapi.com (free tier, no key needed for basic) ----------
  try {
    const ca = await fetch(
      "https://api.cricapi.com/v1/currentMatches?apikey=free&offset=0",
      { headers: { "User-Agent": "Mozilla/5.0" }, cache: "no-store" }
    );
    if (ca.ok) {
      const data = await ca.json();
      const matches: IPLMatch[] = [];
      for (const m of data?.data ?? []) {
        if (!m?.name?.toLowerCase().includes("ipl") &&
            !m?.series?.toLowerCase().includes("ipl")) continue;
        const parts = (m?.name ?? "").split(" vs ");
        const t1 = short(parts[0]?.trim() ?? "TBD");
        const t2 = short((parts[1] ?? "").split(",")[0]?.trim() ?? "TBD");
        const isLive = m?.matchStarted && !m?.matchEnded;
        matches.push({
          team1: t1, team2: t2,
          score1: m?.score?.[0]?.r != null
            ? `${m.score[0].r}/${m.score[0].w} (${m.score[0].o})`
            : "",
          score2: m?.score?.[1]?.r != null
            ? `${m.score[1].r}/${m.score[1].w}`
            : "",
          status: m?.status ?? (isLive ? "LIVE" : "Upcoming"),
          isLive: !!isLive,
        });
      }
      if (matches.length > 0) {
        return NextResponse.json({ matches, source: "cricapi" });
      }
    }
  } catch (_) { /* fall through */ }

  // ---------- No live data: return empty so UI shows "No live match" ----------
  return NextResponse.json({ matches: [], source: "none" });
}

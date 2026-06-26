import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * FIFA World Cup scoreboard proxy (ESPN). Pulls a window around today and
 * distills it to the three things the header pill shows: the live match
 * (if any), the most recent completed match (previous), and the next
 * scheduled match.
 */
function ymd(d: Date): string {
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
}

interface FifaMatch {
  date: string;
  state: string; // pre | in | post
  detail: string;
  team1: string;
  team2: string;
  score1: string;
  score2: string;
}

export async function GET() {
  try {
    const now = new Date();
    const from = new Date(now);
    from.setDate(from.getDate() - 7);
    const to = new Date(now);
    to.setDate(to.getDate() + 12);

    const url = `https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard?dates=${ymd(from)}-${ymd(to)}`;
    const res = await fetch(url, {
      cache: "no-store",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
      },
    });

    if (!res.ok) {
      return NextResponse.json({ error: "ESPN API returned " + res.status }, { status: res.status });
    }

    const data = await res.json();
    const teamName = (x: any) =>
      x?.team?.abbreviation || x?.team?.shortDisplayName || x?.team?.displayName || "";

    const matches: FifaMatch[] = (data?.events ?? [])
      .map((e: any): FifaMatch | null => {
        const c = e.competitions?.[0];
        const comps = c?.competitors || [];
        if (comps.length < 2) return null;
        const st = c?.status?.type || {};
        return {
          date: e.date,
          state: st.state || "pre",
          detail: st.shortDetail || st.detail || st.description || "",
          team1: teamName(comps[0]),
          team2: teamName(comps[1]),
          score1: comps[0]?.score ?? "",
          score2: comps[1]?.score ?? "",
        };
      })
      .filter((m: FifaMatch | null): m is FifaMatch => !!m && !!m.team1 && !!m.team2);

    const sorted = matches.sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
    );
    const nowMs = now.getTime();

    const live = sorted.find((m) => m.state === "in") || null;
    const posts = sorted.filter((m) => m.state === "post");
    const previous = posts.length ? posts[posts.length - 1] : null;
    const next =
      sorted.find((m) => m.state === "pre" && new Date(m.date).getTime() >= nowMs) ||
      sorted.find((m) => m.state === "pre") ||
      null;

    return NextResponse.json({
      live,
      previous,
      next,
      season: data?.leagues?.[0]?.season?.displayName || "FIFA World Cup 2026",
    });
  } catch (error: any) {
    console.error("[FIFA Proxy] Error:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

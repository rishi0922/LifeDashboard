"use client";

import { useState, useEffect } from "react";

interface IPLMatch {
  team1: string;
  team2: string;
  score1: string;
  score2: string;
  status: string;
  isLive: boolean;
}

const IPL_TEAMS = new Set([
  "CSK", "MI", "RCB", "KKR", "DC", "PBKS", "RR", "SRH", "GT", "LSG",
  "Chennai Super Kings", "Mumbai Indians",
  "Royal Challengers Bengaluru", "Royal Challengers Bangalore",
  "Kolkata Knight Riders", "Delhi Capitals", "Punjab Kings",
  "Rajasthan Royals", "Sunrisers Hyderabad", "Gujarat Titans",
  "Lucknow Super Giants",
]);

const TEAM_SHORT: Record<string, string> = {
  "Chennai Super Kings": "CSK", "Mumbai Indians": "MI",
  "Royal Challengers Bengaluru": "RCB", "Royal Challengers Bangalore": "RCB",
  "Kolkata Knight Riders": "KKR", "Delhi Capitals": "DC",
  "Punjab Kings": "PBKS", "Rajasthan Royals": "RR",
  "Sunrisers Hyderabad": "SRH", "Gujarat Titans": "GT",
  "Lucknow Super Giants": "LSG",
};

function short(name: string) { return TEAM_SHORT[name] ?? name; }

function isIPLTeam(name: string) {
  if (IPL_TEAMS.has(name)) return true;
  return Object.keys(TEAM_SHORT).some(k => name.includes(k));
}

async function fetchLiveMatches(): Promise<IPLMatch[]> {
  // Fetch directly from browser — Cricbuzz allows browser requests (CORS open for JSON endpoint)
  try {
    const res = await fetch("https://www.cricbuzz.com/match-api/livematches.json", {
      headers: {
        "Accept": "application/json",
        // No Authorization needed — public endpoint, works from browser
      },
      cache: "no-store",
    });

    if (res.ok) {
      const data = await res.json();
      const out: IPLMatch[] = [];

      for (const m of Object.values(data?.matches ?? {}) as any[]) {
        const h = m?.header;
        if (!h) continue;

        const t1Raw = h.team1?.name ?? h.team1?.shortName ?? "";
        const t2Raw = h.team2?.name ?? h.team2?.shortName ?? "";
        const series: string = (h.seriesName ?? "").toLowerCase();

        const isIPL =
          isIPLTeam(t1Raw) || isIPLTeam(t2Raw) ||
          series.includes("ipl") ||
          series.includes("indian premier league");

        if (!isIPL) continue;

        const ms = m?.miniscore;
        let score1 = "", score2 = "";
        if (ms?.batTeam) {
          score1 = `${ms.batTeam.teamScore ?? ""}/${ms.batTeam.teamWkts ?? ""} (${ms.batTeam.overs ?? ""})`;
        }
        if (ms?.bowlTeam) {
          score2 = `${ms.bowlTeam.teamScore ?? ""}/${ms.bowlTeam.teamWkts ?? ""}`;
        }

        const isLive = ["In Progress", "innings break"].includes(h.state ?? "");
        out.push({
          team1: short(t1Raw) || t1Raw,
          team2: short(t2Raw) || t2Raw,
          score1, score2,
          status: h.status ?? (isLive ? "LIVE" : "Upcoming"),
          isLive,
        });
      }
      if (out.length > 0) return out;
    }
  } catch (_) {}

  // Fallback: ESPN Cricinfo (also allows browser requests)
  try {
    const res = await fetch(
      "https://hs-consumer-api.espncricinfo.com/v1/pages/matches/current?lang=en&latest=true",
      { cache: "no-store" }
    );
    if (res.ok) {
      const data = await res.json();
      const out: IPLMatch[] = [];
      for (const m of data?.matches ?? []) {
        const series = (m?.series?.alternateName ?? m?.series?.longName ?? "").toLowerCase();
        const teams = m?.teams ?? [];
        const t1Raw = teams[0]?.team?.abbreviation ?? teams[0]?.team?.name ?? "";
        const t2Raw = teams[1]?.team?.abbreviation ?? teams[1]?.team?.name ?? "";
        const isIPL = isIPLTeam(t1Raw) || isIPLTeam(t2Raw) || series.includes("ipl") || series.includes("indian premier league");
        if (!isIPL) continue;
        const isLive = ["LIVE", "IN_PROGRESS"].includes(m?.state ?? "");
        out.push({
          team1: short(t1Raw) || t1Raw,
          team2: short(t2Raw) || t2Raw,
          score1: typeof teams[0]?.score === "string" ? teams[0].score : "",
          score2: typeof teams[1]?.score === "string" ? teams[1].score : "",
          status: m?.statusText ?? m?.status ?? (isLive ? "LIVE" : "Upcoming"),
          isLive,
        });
      }
      if (out.length > 0) return out;
    }
  } catch (_) {}

  return [];
}

export function IPLScoreWidget() {
  const [matches, setMatches] = useState<IPLMatch[]>([]);
  const [idx, setIdx] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const m = await fetchLiveMatches();
      setMatches(m);
      setLoading(false);
    };
    load();
    const iv = setInterval(load, 30000);
    return () => clearInterval(iv);
  }, []);

  // Rotate matches every 7s if multiple
  useEffect(() => {
    if (matches.length <= 1) return;
    const iv = setInterval(() => setIdx(p => (p + 1) % matches.length), 7000);
    return () => clearInterval(iv);
  }, [matches.length]);

  const m = matches[idx] ?? null;
  const isLive = m?.isLive ?? false;

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: '0.5rem',
      padding: '0.35rem 0.85rem',
      borderRadius: 'var(--radius-xl)',
      border: `1px solid ${isLive ? 'rgba(239,68,68,0.3)' : 'var(--border-color)'}`,
      background: isLive ? 'rgba(239,68,68,0.07)' : 'var(--bg-secondary)',
      minWidth: '190px',
      maxWidth: '310px',
      transition: 'all 0.4s ease',
    }}>
      <span style={{ fontSize: '0.85rem', flexShrink: 0 }}>🏏</span>

      {loading ? (
        <span style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', fontWeight: 600 }}>
          Loading…
        </span>
      ) : !m ? (
        <span style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', fontWeight: 600, whiteSpace: 'nowrap' }}>
          IPL 2026 · No live match
        </span>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', overflow: 'hidden', flex: 1 }}>
          {/* LIVE pulse dot */}
          {isLive && (
            <span style={{
              width: 6, height: 6, borderRadius: '50%',
              background: '#ef4444',
              boxShadow: '0 0 6px rgba(239,68,68,0.7)',
              animation: 'pulse 1.2s ease-in-out infinite',
              flexShrink: 0,
            }} />
          )}

          <span style={{ fontSize: '0.7rem', fontWeight: 800, color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>
            {m.team1}
          </span>
          {m.score1 && (
            <span style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--accent-color)', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
              {m.score1}
            </span>
          )}
          <span style={{ fontSize: '0.55rem', color: 'var(--text-secondary)', opacity: 0.5, flexShrink: 0 }}>vs</span>
          <span style={{ fontSize: '0.7rem', fontWeight: 800, color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>
            {m.team2}
          </span>
          {m.score2 && (
            <span style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--accent-color)', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
              {m.score2}
            </span>
          )}
          {m.status && (
            <span style={{
              fontSize: '0.55rem', fontWeight: 700,
              color: isLive ? '#ef4444' : 'var(--text-secondary)',
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              maxWidth: 90,
            }}>
              · {m.status}
            </span>
          )}
          {matches.length > 1 && (
            <span style={{ fontSize: '0.5rem', color: 'var(--text-secondary)', opacity: 0.4, flexShrink: 0 }}>
              {idx + 1}/{matches.length}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

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
  try {
    // The proxy API handles the external fetch, bypassing Adblockers and CORS
    const res = await fetch("/api/ipl", { cache: "no-store", headers: { "Accept": "application/json" } });
    
    if (res.ok) {
      const data = await res.json();
      const out: IPLMatch[] = [];
      
      for (const m of data?.events ?? []) {
        const competition = m.competitions?.[0];
        if (!competition || !competition.competitors || competition.competitors.length < 2) continue;

        const t1 = competition.competitors[0];
        const t2 = competition.competitors[1];

        const t1Raw = t1.team?.shortDisplayName || t1.team?.name || "";
        const t2Raw = t2.team?.shortDisplayName || t2.team?.name || "";

        const score1 = t1.score || "";
        const score2 = t2.score || "";

        const statusStr = m.status?.type?.detail || "Upcoming";
        const isLive = m.status?.type?.state === "in";

        out.push({
          team1: short(t1Raw) || t1Raw,
          team2: short(t2Raw) || t2Raw,
          score1,
          score2,
          status: statusStr,
          isLive,
        });
      }
      return out;
    }
  } catch (err) {
    console.warn("ESPN Scoreboard API fetch failed:", err);
  }

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

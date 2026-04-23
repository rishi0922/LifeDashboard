"use client";

import { useState, useEffect } from "react";

interface IPLMatch {
  team1: string;
  team2: string;
  score1: string;
  score2: string;
  status: string;
  isLive: boolean;
  isFinished: boolean;
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

        const statusType = m.status?.type || {};
        const statusStr = statusType.detail || statusType.description || "Upcoming";
        const state = statusType.state;
        const isLive = state === "in";
        // ESPN marks completed games with state "post" (or completed: true).
        // We also treat result-style status strings (e.g. "CSK won by 5 wickets",
        // "Match tied", "No result") as finished, so a late-arriving state flag
        // doesn't keep the ticker on the live layout forever.
        const finishedByText = /won by|tie|no result|abandoned|match ended|final/i.test(statusStr);
        const isFinished =
          state === "post" || statusType.completed === true || (!isLive && finishedByText);

        out.push({
          team1: short(t1Raw) || t1Raw,
          team2: short(t2Raw) || t2Raw,
          score1,
          score2,
          status: statusStr,
          isLive,
          isFinished,
        });
      }
      return out;
    }
  } catch (err) {
    console.warn("ESPN Scoreboard API fetch failed:", err);
  }

  return [];
}

function MatchIcon({
  status,
  isLive,
  isFinished,
}: {
  status: string;
  isLive: boolean;
  isFinished: boolean;
}) {
  const s = status.toLowerCase();

  // Finished matches get a trophy (or a prohibition symbol for no-result/abandoned)
  // instead of the generic bat icon, so a quick glance tells you it's over.
  if (isFinished) {
    return (
      <span style={{ fontSize: '1rem' }}>
        {s.includes("no result") || s.includes("abandoned") ? "🚫" : "🏆"}
      </span>
    );
  }

  if (s.includes("rain") || s.includes("delay")) {
    return (
      <span style={{ fontSize: '1rem', animation: 'rain-shake 0.5s ease-in-out infinite' }}>
        🌧️
      </span>
    );
  }

  if (s.includes("timeout")) {
    return (
      <span style={{ fontSize: '1rem', animation: 'timeout-spin 3s linear infinite' }}>
        ⏱️
      </span>
    );
  }

  if (isLive) return null;
  return <span style={{ fontSize: '0.85rem' }}>🏏</span>;
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
  const isFinished = m?.isFinished ?? false;

  // Tint the pill amber for a finished match so it reads as "done" rather than
  // "still live but quiet", but keep the red live accent higher-priority.
  const borderColor = isLive
    ? 'rgba(239,68,68,0.3)'
    : isFinished
      ? 'rgba(234,179,8,0.35)'
      : 'var(--border-color)';
  const backgroundColor = isLive
    ? 'rgba(239,68,68,0.07)'
    : isFinished
      ? 'rgba(234,179,8,0.08)'
      : 'var(--bg-secondary)';

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: '0.5rem',
      padding: '0.35rem 0.85rem',
      borderRadius: 'var(--radius-xl)',
      border: `1px solid ${borderColor}`,
      background: backgroundColor,
      minWidth: '190px',
      maxWidth: '310px',
      transition: 'all 0.4s ease',
    }}>
      <MatchIcon status={m?.status || ""} isLive={isLive} isFinished={isFinished} />

      {/* FT badge for finished matches */}
      {isFinished && (
        <span style={{
          fontSize: '0.5rem',
          fontWeight: 900,
          letterSpacing: '0.08em',
          color: '#b45309',
          background: 'rgba(234,179,8,0.18)',
          padding: '1px 5px',
          borderRadius: 4,
          textTransform: 'uppercase',
          flexShrink: 0,
        }}>FT</span>
      )}

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
              fontSize: '0.55rem',
              // Finished matches get the same amber accent as the FT badge so
              // the result string (the interesting bit) stands out.
              fontWeight: isFinished ? 800 : 700,
              color: isLive ? '#ef4444' : (isFinished ? '#b45309' : 'var(--text-secondary)'),
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              maxWidth: isFinished ? 140 : 90,
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

      <style jsx>{`
        @keyframes rain-shake {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(2px); }
        }
        @keyframes timeout-spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes pulse {
          0% { transform: scale(0.95); opacity: 0.7; }
          50% { transform: scale(1.1); opacity: 1; }
          100% { transform: scale(0.95); opacity: 0.7; }
        }
      `}</style>
    </div>
  );
}

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

function isIPLMatch(t1: string, t2: string): boolean {
  return IPL_TEAMS.has(t1) || IPL_TEAMS.has(t2) ||
    Object.keys(TEAM_SHORT).some(k => t1.includes(k) || t2.includes(k));
}

function isIPLSeries(name: string): boolean {
  const n = name.toLowerCase();
  return n.includes("ipl") ||
    n.includes("indian premier league") ||
    (n.includes("premier league") && n.includes("india"));
}

export function IPLScoreTicker() {
  const [matches, setMatches] = useState<IPLMatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentIndex, setCurrentIndex] = useState(0);

  const fetchScores = async () => {
    try {
      const url = "https://site.api.espn.com/apis/site/v2/sports/cricket/8048/scoreboard";
      
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) throw new Error("ESPN fetch failed");
      const data = await res.json();
      
      const newMatches: IPLMatch[] = [];

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
        // 'in' means currently live, 'pre' means upcoming, 'post' means finished
        const isLive = m.status?.type?.state === "in";

        newMatches.push({
          team1: short(t1Raw) || t1Raw,
          team2: short(t2Raw) || t2Raw,
          score1,
          score2,
          status: statusStr,
          isLive,
        });
      }

      setMatches(newMatches);
    } catch (err) {
      console.error("IPL ticker fetch failed via ESPN", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchScores();
    // Refresh every 30s during live matches
    const interval = setInterval(fetchScores, 30000);
    return () => clearInterval(interval);
  }, []);

  // Auto-rotate between matches every 6 seconds
  useEffect(() => {
    if (matches.length <= 1) return;
    const rotator = setInterval(() => {
      setCurrentIndex(prev => (prev + 1) % matches.length);
    }, 6000);
    return () => clearInterval(rotator);
  }, [matches.length]);

  // Don't render anything if no matches
  if (!loading && matches.length === 0) return null;

  const match = matches[currentIndex];

  return (
    <div style={{
      margin: '0 3rem 0.5rem 3rem',
      padding: '0.45rem 1.25rem',
      background: 'linear-gradient(135deg, rgba(0, 100, 60, 0.12), rgba(0, 180, 100, 0.08))',
      backdropFilter: 'blur(16px)',
      WebkitBackdropFilter: 'blur(16px)',
      border: '1px solid rgba(0, 180, 100, 0.15)',
      borderRadius: 'var(--radius-xl)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '1rem',
      overflow: 'hidden',
      position: 'relative',
      minHeight: '38px',
    }}>
      {loading ? (
        <span style={{ 
          fontSize: '0.75rem', 
          color: 'var(--text-secondary)', 
          fontWeight: 600 
        }}>
          🏏 Fetching live IPL scores...
        </span>
      ) : match ? (
        <>
          {/* Live pulse indicator */}
          {match.isLive && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.35rem',
              marginRight: '0.25rem'
            }}>
              <span style={{
                width: '6px',
                height: '6px',
                borderRadius: '50%',
                background: '#ef4444',
                animation: 'pulse 1.5s ease-in-out infinite',
                boxShadow: '0 0 8px rgba(239, 68, 68, 0.6)'
              }} />
              <span style={{
                fontSize: '0.6rem',
                fontWeight: 900,
                color: '#ef4444',
                letterSpacing: '0.08em',
                textTransform: 'uppercase'
              }}>LIVE</span>
            </div>
          )}

          {/* Cricket emoji */}
          <span style={{ fontSize: '1rem' }}>🏏</span>

          {/* Match info - compact single line */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.6rem',
            transition: 'all 0.4s ease',
          }}>
            {/* Team 1 */}
            <span style={{
              fontWeight: 800,
              fontSize: '0.8rem',
              color: 'var(--text-primary)',
              letterSpacing: '-0.01em'
            }}>
              {match.team1}
            </span>

            {match.score1 && (
              <span style={{
                fontWeight: 700,
                fontSize: '0.75rem',
                color: 'var(--accent-color)',
                fontVariantNumeric: 'tabular-nums'
              }}>
                {match.score1}
              </span>
            )}

            <span style={{
              fontSize: '0.65rem',
              fontWeight: 700,
              color: 'var(--text-secondary)',
              opacity: 0.6
            }}>vs</span>

            {/* Team 2 */}
            <span style={{
              fontWeight: 800,
              fontSize: '0.8rem',
              color: 'var(--text-primary)',
              letterSpacing: '-0.01em'
            }}>
              {match.team2}
            </span>

            {match.score2 && (
              <span style={{
                fontWeight: 700,
                fontSize: '0.75rem',
                color: 'var(--accent-color)',
                fontVariantNumeric: 'tabular-nums'
              }}>
                {match.score2}
              </span>
            )}
          </div>

          {/* Status / Result */}
          <span style={{
            fontSize: '0.65rem',
            fontWeight: 700,
            color: match.isLive ? 'var(--success-color)' : 'var(--text-secondary)',
            maxWidth: '200px',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            marginLeft: '0.25rem'
          }}>
            {match.status}
          </span>

          {/* Match counter if multiple */}
          {matches.length > 1 && (
            <span style={{
              fontSize: '0.55rem',
              fontWeight: 700,
              color: 'var(--text-secondary)',
              opacity: 0.5,
              marginLeft: '0.5rem'
            }}>
              {currentIndex + 1}/{matches.length}
            </span>
          )}
        </>
      ) : null}

      <style jsx>{`
        @keyframes tickerSlide {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}

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

export function IPLScoreWidget() {
  const [matches, setMatches] = useState<IPLMatch[]>([]);
  const [idx, setIdx] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetch_ = async () => {
      try {
        const res = await fetch("/api/ipl");
        if (res.ok) setMatches((await res.json()).matches ?? []);
      } catch (_) {}
      finally { setLoading(false); }
    };
    fetch_();
    const iv = setInterval(fetch_, 30000);
    return () => clearInterval(iv);
  }, []);

  // Rotate matches every 7s
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
      border: `1px solid ${isLive ? 'rgba(239,68,68,0.25)' : 'var(--border-color)'}`,
      background: isLive
        ? 'rgba(239,68,68,0.06)'
        : 'var(--bg-secondary)',
      minWidth: '200px',
      maxWidth: '320px',
      transition: 'all 0.4s ease',
      overflow: 'hidden',
    }}>
      {/* Cricket bat icon */}
      <span style={{ fontSize: '0.9rem', flexShrink: 0 }}>🏏</span>

      {loading ? (
        <span style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', fontWeight: 600 }}>
          Loading IPL…
        </span>
      ) : !m ? (
        /* No live match — still show the widget */
        <span style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', fontWeight: 600, whiteSpace: 'nowrap' }}>
          IPL 2025 · No live match
        </span>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', overflow: 'hidden', flex: 1 }}>
          {/* LIVE dot */}
          {isLive && (
            <span style={{
              width: 6, height: 6, borderRadius: '50%',
              background: '#ef4444',
              boxShadow: '0 0 6px rgba(239,68,68,0.7)',
              animation: 'pulse 1.2s ease-in-out infinite',
              flexShrink: 0,
            }} />
          )}

          {/* Teams + scores — single tight line */}
          <span style={{ fontSize: '0.7rem', fontWeight: 800, color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>
            {m.team1}
          </span>

          {m.score1 ? (
            <span style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--accent-color)', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
              {m.score1}
            </span>
          ) : null}

          <span style={{ fontSize: '0.55rem', color: 'var(--text-secondary)', opacity: 0.5, flexShrink: 0 }}>vs</span>

          <span style={{ fontSize: '0.7rem', fontWeight: 800, color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>
            {m.team2}
          </span>

          {m.score2 ? (
            <span style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--accent-color)', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
              {m.score2}
            </span>
          ) : null}

          {/* Status badge */}
          {m.status ? (
            <span style={{
              fontSize: '0.55rem', fontWeight: 700,
              color: isLive ? '#ef4444' : 'var(--text-secondary)',
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              maxWidth: 90,
            }}>
              · {m.status}
            </span>
          ) : null}

          {/* Counter */}
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

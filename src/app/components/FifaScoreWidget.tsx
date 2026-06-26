"use client";

import { useState, useEffect, useMemo } from "react";

interface FifaMatch {
  date: string;
  state: string; // pre | in | post
  detail: string;
  team1: string;
  team2: string;
  score1: string;
  score2: string;
}

interface FifaData {
  live: FifaMatch | null;
  previous: FifaMatch | null;
  next: FifaMatch | null;
  season?: string;
}

type Card = { kind: "live" | "previous" | "next"; match: FifaMatch };

function kickoff(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Header pill showing FIFA World Cup matches — rotates through the live
 * match (if any), the previous result, and the next fixture. Replaces the
 * IPL ticker. Data via the /api/fifa ESPN proxy.
 */
export function FifaScoreWidget() {
  const [data, setData] = useState<FifaData | null>(null);
  const [loading, setLoading] = useState(true);
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch("/api/fifa", { cache: "no-store" });
        if (res.ok) setData(await res.json());
      } catch {
        /* keep last data on transient failure */
      } finally {
        setLoading(false);
      }
    };
    load();
    const iv = setInterval(load, 60000);
    return () => clearInterval(iv);
  }, []);

  const cards = useMemo<Card[]>(() => {
    if (!data) return [];
    const out: Card[] = [];
    if (data.live) out.push({ kind: "live", match: data.live });
    if (data.previous) out.push({ kind: "previous", match: data.previous });
    if (data.next) out.push({ kind: "next", match: data.next });
    return out;
  }, [data]);

  // Rotate through available cards every 6s.
  useEffect(() => {
    if (cards.length <= 1) return;
    const iv = setInterval(() => setIdx((p) => (p + 1) % cards.length), 6000);
    return () => clearInterval(iv);
  }, [cards.length]);

  const card = cards[idx % (cards.length || 1)] ?? null;
  const isLive = card?.kind === "live";
  const isPrev = card?.kind === "previous";

  const label = isLive ? "LIVE" : isPrev ? "FT" : "NEXT";
  const labelColor = isLive ? "#ef4444" : isPrev ? "#b45309" : "var(--accent-color)";
  const borderColor = isLive
    ? "rgba(239,68,68,0.3)"
    : isPrev
      ? "rgba(234,179,8,0.35)"
      : "var(--border-color)";
  const background = isLive
    ? "rgba(239,68,68,0.07)"
    : isPrev
      ? "rgba(234,179,8,0.08)"
      : "var(--bg-secondary)";

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "0.5rem",
        padding: "0.35rem 0.85rem",
        borderRadius: "var(--radius-xl)",
        border: `1px solid ${borderColor}`,
        background,
        minWidth: "190px",
        maxWidth: "320px",
        transition: "all 0.4s ease",
      }}
    >
      <span style={{ fontSize: "1rem", flexShrink: 0 }}>{isLive ? "🔴" : isPrev ? "🏆" : "⚽"}</span>

      {loading ? (
        <span style={{ fontSize: "0.65rem", color: "var(--text-secondary)", fontWeight: 600 }}>
          Loading…
        </span>
      ) : !card ? (
        <span style={{ fontSize: "0.65rem", color: "var(--text-secondary)", fontWeight: 600, whiteSpace: "nowrap" }}>
          FIFA World Cup 2026
        </span>
      ) : (
        <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", overflow: "hidden", flex: 1 }}>
          <span
            style={{
              fontSize: "0.5rem",
              fontWeight: 900,
              letterSpacing: "0.08em",
              color: labelColor,
              background: isLive ? "rgba(239,68,68,0.15)" : isPrev ? "rgba(234,179,8,0.18)" : "rgba(0,122,255,0.12)",
              padding: "1px 5px",
              borderRadius: 4,
              flexShrink: 0,
            }}
          >
            {label}
          </span>

          <span style={{ fontSize: "0.72rem", fontWeight: 800, color: "var(--text-primary)", whiteSpace: "nowrap" }}>
            {card.match.team1}
          </span>
          {card.kind !== "next" && card.match.score1 !== "" && (
            <span style={{ fontSize: "0.7rem", fontWeight: 800, color: "var(--accent-color)", fontVariantNumeric: "tabular-nums" }}>
              {card.match.score1}
            </span>
          )}
          <span style={{ fontSize: "0.55rem", color: "var(--text-secondary)", opacity: 0.5, flexShrink: 0 }}>vs</span>
          {card.kind !== "next" && card.match.score2 !== "" && (
            <span style={{ fontSize: "0.7rem", fontWeight: 800, color: "var(--accent-color)", fontVariantNumeric: "tabular-nums" }}>
              {card.match.score2}
            </span>
          )}
          <span style={{ fontSize: "0.72rem", fontWeight: 800, color: "var(--text-primary)", whiteSpace: "nowrap" }}>
            {card.match.team2}
          </span>

          <span
            style={{
              fontSize: "0.55rem",
              fontWeight: 700,
              color: isLive ? "#ef4444" : "var(--text-secondary)",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
              maxWidth: 120,
            }}
          >
            · {card.kind === "next" ? kickoff(card.match.date) : card.match.detail}
          </span>

          {cards.length > 1 && (
            <span style={{ fontSize: "0.5rem", color: "var(--text-secondary)", opacity: 0.4, flexShrink: 0 }}>
              {idx + 1}/{cards.length}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

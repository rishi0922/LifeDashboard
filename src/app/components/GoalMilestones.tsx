"use client";

import { useState, useEffect } from "react";

/**
 * Goal Milestones panel — DB-backed (UserPreference key "finance_goals")
 * and editable inline. Replaces the hardcoded Triumph/PS5 placeholders.
 *
 * View mode: emoji + name + % + progress bar per goal.
 * Edit mode (pencil toggle): emoji/name/% inputs per row, remove rows,
 * add rows, Save (PUT /api/goals) or Cancel.
 */

interface Goal {
  id: string;
  emoji: string;
  name: string;
  progress: number;
}

const BAR_COLORS = ["var(--accent-color)", "var(--success-color)", "#eab308", "#ec4899", "#14b8a6"];

export function GoalMilestones() {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Goal[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/goals");
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled && Array.isArray(data.goals)) setGoals(data.goals);
      } catch {
        // Panel quietly shows nothing extra on fetch failure.
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const startEdit = () => {
    setDraft(goals.map((g) => ({ ...g })));
    setError(null);
    setEditing(true);
  };

  const save = async () => {
    const cleaned = draft.filter((g) => g.name.trim().length > 0);
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/goals", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ goals: cleaned }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Save failed");
      setGoals(data.goals);
      setEditing(false);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const updateDraft = (id: string, patch: Partial<Goal>) => {
    setDraft((prev) => prev.map((g) => (g.id === id ? { ...g, ...patch } : g)));
  };

  const inputStyle: React.CSSProperties = {
    background: "var(--bg-secondary)",
    color: "var(--text-primary)",
    border: "1px solid var(--border-color)",
    borderRadius: "6px",
    padding: "4px 6px",
    fontSize: "0.78rem",
    fontWeight: 600,
    outline: "none",
  };

  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" }}>
        <h3 style={{ fontSize: "1.25rem", margin: 0 }}>🎯 Goal Milestones</h3>
        {!editing ? (
          <button
            onClick={startEdit}
            title="Edit goals"
            aria-label="Edit goals"
            style={{
              width: 28,
              height: 28,
              borderRadius: 8,
              border: "1px solid var(--border-color)",
              background: "var(--bg-secondary)",
              color: "var(--text-secondary)",
              cursor: "pointer",
              fontSize: "0.8rem",
            }}
          >
            ✎
          </button>
        ) : (
          <div style={{ display: "flex", gap: 6 }}>
            <button
              onClick={() => setEditing(false)}
              disabled={saving}
              style={{
                padding: "4px 10px",
                borderRadius: 8,
                border: "1px solid var(--border-color)",
                background: "transparent",
                color: "var(--text-secondary)",
                cursor: "pointer",
                fontSize: "0.7rem",
                fontWeight: 700,
              }}
            >
              Cancel
            </button>
            <button
              onClick={save}
              disabled={saving}
              style={{
                padding: "4px 10px",
                borderRadius: 8,
                border: "1px solid var(--accent-color)",
                background: "var(--accent-color)",
                color: "#fff",
                cursor: saving ? "wait" : "pointer",
                fontSize: "0.7rem",
                fontWeight: 800,
              }}
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        )}
      </div>

      {error && (
        <div style={{ fontSize: "0.7rem", color: "#ef4444", marginBottom: "0.75rem", fontWeight: 600 }}>
          {error}
        </div>
      )}

      {!editing ? (
        <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
          {goals.map((g, i) => (
            <div key={g.id}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.5rem", fontSize: "0.85rem" }}>
                <span>{g.emoji} {g.name}</span>
                <span style={{ fontWeight: 700 }}>{g.progress}%</span>
              </div>
              <div style={{ width: "100%", height: "8px", background: "var(--bg-secondary)", borderRadius: "10px", overflow: "hidden" }}>
                <div
                  style={{
                    width: `${g.progress}%`,
                    height: "100%",
                    background: BAR_COLORS[i % BAR_COLORS.length],
                    transition: "width 0.6s cubic-bezier(0.16, 1, 0.3, 1)",
                  }}
                />
              </div>
            </div>
          ))}
          {loaded && goals.length === 0 && (
            <div style={{ fontSize: "0.78rem", color: "var(--text-secondary)", fontStyle: "italic", border: "1px dashed var(--border-color)", borderRadius: "var(--radius-md)", padding: "1rem", textAlign: "center" }}>
              No goals yet — hit ✎ to add one.
            </div>
          )}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          {draft.map((g) => (
            <div key={g.id} style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <input
                value={g.emoji}
                onChange={(e) => updateDraft(g.id, { emoji: e.target.value })}
                aria-label="Goal emoji"
                style={{ ...inputStyle, width: 38, textAlign: "center", flexShrink: 0 }}
              />
              <input
                value={g.name}
                onChange={(e) => updateDraft(g.id, { name: e.target.value })}
                placeholder="Goal name"
                aria-label="Goal name"
                style={{ ...inputStyle, flex: 1, minWidth: 0 }}
              />
              <input
                type="number"
                min={0}
                max={100}
                value={g.progress}
                onChange={(e) => updateDraft(g.id, { progress: Number(e.target.value) })}
                aria-label="Progress percent"
                style={{ ...inputStyle, width: 56, flexShrink: 0 }}
              />
              <button
                onClick={() => setDraft((prev) => prev.filter((x) => x.id !== g.id))}
                title="Remove goal"
                aria-label="Remove goal"
                style={{
                  width: 26,
                  height: 26,
                  borderRadius: 6,
                  border: "1px solid var(--border-color)",
                  background: "transparent",
                  color: "var(--text-secondary)",
                  cursor: "pointer",
                  fontSize: "0.7rem",
                  flexShrink: 0,
                }}
              >
                ✕
              </button>
            </div>
          ))}
          <button
            onClick={() =>
              setDraft((prev) => [
                ...prev,
                { id: `goal-${Math.random().toString(36).slice(2, 10)}`, emoji: "🎯", name: "", progress: 0 },
              ])
            }
            style={{
              padding: "0.5rem",
              borderRadius: 8,
              border: "1px dashed var(--border-color)",
              background: "transparent",
              color: "var(--text-secondary)",
              cursor: "pointer",
              fontSize: "0.75rem",
              fontWeight: 700,
            }}
          >
            + Add goal
          </button>
        </div>
      )}
    </>
  );
}

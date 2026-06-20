"use client";

import { useState, useEffect } from "react";
import { useSpeechRecognition } from "@/lib/useSpeechRecognition";

interface Note {
  id: string;
  title: string | null;
  content: string;
  category: string;
  summary: string | null;
  actionItems: string | null; // JSON string array
  source: string;
  createdAt: string;
}

const CATEGORY_STYLE: Record<string, { color: string; icon: string }> = {
  Idea: { color: "#a855f7", icon: "💡" },
  Task: { color: "#6366f1", icon: "✅" },
  Meeting: { color: "#0ea5e9", icon: "🗣️" },
  Personal: { color: "#ec4899", icon: "🏠" },
  Work: { color: "#f97316", icon: "💼" },
  Reminder: { color: "#eab308", icon: "⏰" },
  Note: { color: "#64748b", icon: "📝" },
};
const catStyle = (c: string) => CATEGORY_STYLE[c] || CATEGORY_STYLE.Note;

export function NotesPanel() {
  const [draft, setDraft] = useState("");
  const [notes, setNotes] = useState<Note[]>([]);
  const [isCapturing, setIsCapturing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const stt = useSpeechRecognition({
    lang: "en-IN",
    onResult: (text) => setDraft(text),
  });

  const fetchNotes = async () => {
    try {
      const res = await fetch("/api/notes");
      if (!res.ok) return;
      const data = await res.json();
      if (Array.isArray(data.notes)) setNotes(data.notes);
    } catch {
      /* panel just shows nothing extra on fetch failure */
    }
  };

  useEffect(() => {
    fetchNotes();
    const onRefresh = () => fetchNotes();
    window.addEventListener("refreshNotes", onRefresh);
    return () => window.removeEventListener("refreshNotes", onRefresh);
  }, []);

  const capture = async () => {
    const text = draft.trim();
    if (!text) return;
    if (stt.listening) stt.stop();
    setIsCapturing(true);
    setError(null);
    try {
      const res = await fetch("/api/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, source: stt.listening ? "voice" : "manual" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Capture failed");
      setNotes((prev) => [data.note, ...prev]);
      setDraft("");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Capture failed");
    } finally {
      setIsCapturing(false);
    }
  };

  const removeNote = async (id: string) => {
    setNotes((prev) => prev.filter((n) => n.id !== id));
    try {
      await fetch("/api/notes", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
    } catch {
      /* optimistic — re-fetch on next mount corrects any drift */
    }
  };

  const parseItems = (raw: string | null): string[] => {
    if (!raw) return [];
    try {
      const arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr.map(String) : [];
    } catch {
      return [];
    }
  };

  return (
    <div className="glass-panel" style={{ height: "350px", display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
        <h2 style={{ fontSize: "1.25rem", margin: 0, display: "flex", alignItems: "center", gap: "0.5rem" }}>
          🧠 Smart Brain
        </h2>
        <div style={{ display: "flex", gap: "0.4rem", alignItems: "center" }}>
          {stt.supported && (
            <button
              onClick={stt.toggle}
              className="btn-icon"
              title={stt.listening ? "Stop" : "Speak a note"}
              aria-label={stt.listening ? "Stop listening" : "Speak a note"}
              style={{
                width: 38,
                height: 38,
                background: stt.listening ? "var(--danger-color, #ff3b30)" : "var(--bg-secondary)",
                color: stt.listening ? "#fff" : "var(--text-primary)",
                border: "1px solid var(--border-color)",
              }}
            >
              <span className={stt.listening ? "animate-pulse" : ""}>🎙️</span>
            </button>
          )}
          <button
            onClick={capture}
            className="btn-primary"
            style={{
              padding: "0.45rem 0.9rem",
              fontSize: "0.8rem",
              opacity: draft.trim().length > 0 ? 1 : 0.4,
              pointerEvents: draft.trim().length > 0 ? "auto" : "none",
              transition: "opacity 0.2s ease",
            }}
            disabled={isCapturing}
          >
            {isCapturing ? "✨ Structuring…" : "✨ Capture"}
          </button>
        </div>
      </div>

      <textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder={stt.listening ? "Listening… speak your thought" : "Brain-dump a thought, idea, or meeting note — type or tap 🎙️. AI cleans and files it."}
        style={{
          height: "84px",
          width: "100%",
          resize: "none",
          padding: "0.85rem 1rem",
          borderRadius: "var(--radius-md)",
          border: `1px solid ${stt.listening ? "var(--accent-color)" : "var(--border-color)"}`,
          background: "var(--bg-secondary)",
          color: "var(--text-primary)",
          fontSize: "0.95rem",
          lineHeight: 1.5,
          outline: "none",
          transition: "border-color 0.2s ease",
        }}
      />

      {error && (
        <div style={{ fontSize: "0.7rem", color: "#ef4444", marginTop: "0.4rem", fontWeight: 600 }}>{error}</div>
      )}

      {/* Captured notes */}
      <div style={{ flex: 1, overflowY: "auto", marginTop: "0.75rem", display: "flex", flexDirection: "column", gap: "0.6rem", paddingRight: "0.25rem" }}>
        {notes.length === 0 ? (
          <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-secondary)", fontSize: "0.8rem", fontStyle: "italic", textAlign: "center", padding: "1rem" }}>
            Your captured thoughts will appear here, cleaned and categorised.
          </div>
        ) : (
          notes.map((n) => {
            const cs = catStyle(n.category);
            const items = parseItems(n.actionItems);
            return (
              <div
                key={n.id}
                style={{
                  background: "var(--bg-secondary)",
                  border: "1px solid var(--border-color)",
                  borderLeft: `3px solid ${cs.color}`,
                  borderRadius: "var(--radius-md)",
                  padding: "0.7rem 0.85rem",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.5rem" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.45rem", minWidth: 0 }}>
                    <span style={{ fontSize: "0.85rem" }}>{cs.icon}</span>
                    <span style={{ fontWeight: 700, fontSize: "0.85rem", color: "var(--text-primary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {n.title || "Untitled note"}
                    </span>
                    {n.source === "voice" && <span title="Captured by voice" style={{ fontSize: "0.7rem", opacity: 0.6 }}>🎙️</span>}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", flexShrink: 0 }}>
                    <span style={{ fontSize: "0.6rem", fontWeight: 700, color: cs.color, background: cs.color + "1a", padding: "2px 7px", borderRadius: "999px", textTransform: "uppercase", letterSpacing: "0.03em" }}>
                      {n.category}
                    </span>
                    <button
                      onClick={() => removeNote(n.id)}
                      aria-label="Delete note"
                      title="Delete"
                      style={{ background: "none", border: "none", color: "var(--text-secondary)", cursor: "pointer", fontSize: "0.8rem", lineHeight: 1, padding: 0 }}
                    >
                      ✕
                    </button>
                  </div>
                </div>

                <p style={{ margin: "0.45rem 0 0", fontSize: "0.8rem", color: "var(--text-secondary)", lineHeight: 1.45, whiteSpace: "pre-wrap" }}>
                  {n.summary || n.content}
                </p>

                {items.length > 0 && (
                  <div style={{ marginTop: "0.5rem", display: "flex", flexDirection: "column", gap: "0.25rem" }}>
                    {items.map((it, i) => (
                      <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: "0.4rem", fontSize: "0.76rem", color: "var(--text-primary)" }}>
                        <span style={{ color: cs.color, fontWeight: 800, lineHeight: 1.4 }}>○</span>
                        <span>{it}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

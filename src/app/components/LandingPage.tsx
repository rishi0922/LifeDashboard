"use client";

import { signIn } from "next-auth/react";

/**
 * Public marketing landing page shown to signed-out visitors at "/".
 * Signed-in users see the dashboard instead (gated in page.tsx).
 * Reuses the app's design system (glass-panel, CSS vars, fonts) so the
 * landing visually previews the product.
 */

const FEATURES: Array<{ icon: string; title: string; desc: string; accent: string }> = [
  {
    icon: "🧠",
    title: "Smart Brain Capture",
    desc: "Brain-dump by voice or text. AI cleans it up, titles it, files it by category, and pulls out the action items — automatically.",
    accent: "#a855f7",
  },
  {
    icon: "🎙️",
    title: "Voice Assistant",
    desc: "Talk to it like a chief of staff and it talks back in a natural voice. Schedule meetings, add tasks, or draft emails — hands-free.",
    accent: "#0a84ff",
  },
  {
    icon: "📅",
    title: "Calendar & Timeline",
    desc: "Two-way Google Calendar sync. Create, move, and clear events by voice or chat — with duplicate-proof scheduling in your timezone.",
    accent: "#0ea5e9",
  },
  {
    icon: "✅",
    title: "Priorities",
    desc: "A living task board that fills itself — action items from your notes and emails land here, sorted into Urgent, Work, and Personal.",
    accent: "#6366f1",
  },
  {
    icon: "💰",
    title: "Finance Intelligence",
    desc: "Expenses auto-extracted from your inbox and categorised across 80+ Indian merchants. Live Groww portfolio and a monthly budget guardian.",
    accent: "#22c55e",
  },
  {
    icon: "📊",
    title: "Expense Intelligence",
    desc: "List, pie, and trend views with a date-jump calendar. Ask the assistant 'how's my spend this week?' and get a real answer, not a number dump.",
    accent: "#ef4444",
  },
  {
    icon: "📧",
    title: "Inbox Scout",
    desc: "Quietly triages your Gmail in the background, turning deadlines, invoices, and invites into tasks and calendar events — no inbox-zero grind.",
    accent: "#f97316",
  },
  {
    icon: "📰",
    title: "Intelligence Feed",
    desc: "A news feed that learns. Tech, finance, policy, F1, cricket — it watches what you open and what you skip, and tunes itself to you.",
    accent: "#14b8a6",
  },
  {
    icon: "🎯",
    title: "Goal Milestones",
    desc: "Track what you're working toward with editable, progress-tracked goals right alongside your money and your week.",
    accent: "#eab308",
  },
];

export function LandingPage() {
  // Primary CTA → Google sign-in. Used in the hero and the closing CTA.
  const cta = (label: string) => (
    <button
      onClick={() => signIn("google")}
      className="btn-primary"
      style={{ padding: "0.9rem 1.75rem", borderRadius: "var(--radius-xl)", fontSize: "1rem" }}
    >
      {label}
    </button>
  );

  return (
    <main className="landing" style={{ minHeight: "100vh", scrollBehavior: "smooth" }}>
      {/* ── Nav ───────────────────────────────────────────────── */}
      <nav className="page-container" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "1.25rem 3rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", fontWeight: 800, fontSize: "1.15rem", fontFamily: "'Outfit', sans-serif" }}>
          <span style={{ fontSize: "1.4rem" }}>✦</span> Command Center
        </div>
        <button
          onClick={() => signIn("google")}
          style={{ padding: "0.55rem 1.2rem", borderRadius: "var(--radius-xl)", fontSize: "0.9rem", fontWeight: 700, background: "transparent", color: "var(--text-primary)", border: "1px solid var(--border-color)" }}
        >
          Sign in
        </button>
      </nav>

      {/* ── Hero ──────────────────────────────────────────────── */}
      <section className="page-container" style={{ textAlign: "center", padding: "3.5rem 3rem 2rem", display: "flex", flexDirection: "column", alignItems: "center" }}>
        <span className="animate-fade-in" style={{ fontSize: "0.8rem", fontWeight: 700, color: "var(--accent-color)", background: "rgba(0,122,255,0.1)", padding: "0.4rem 1rem", borderRadius: "999px", letterSpacing: "0.03em", marginBottom: "1.5rem" }}>
          ✨ Your AI command center for life & work
        </span>
        <h1 className="hero-title animate-slide-up" style={{ fontSize: "clamp(2.4rem, 6vw, 4rem)", lineHeight: 1.05, margin: 0, fontWeight: 800, maxWidth: "16ch" }}>
          One calm screen for your{" "}
          <span style={{ background: "linear-gradient(120deg, var(--accent-color), #a855f7 60%, #34c759)", WebkitBackgroundClip: "text", backgroundClip: "text", WebkitTextFillColor: "transparent" }}>
            entire life
          </span>
        </h1>
        <p className="animate-fade-in delay-100" style={{ fontSize: "1.15rem", color: "var(--text-secondary)", maxWidth: "60ch", margin: "1.5rem 0 2.25rem", lineHeight: 1.6 }}>
          Capture a thought by voice, and watch it become a structured note, a scheduled event, or a tracked task. Command Center pulls your calendar, inbox, money, and news into one place — and an AI does the busywork.
        </p>
        <div className="animate-fade-in delay-200" style={{ display: "flex", gap: "0.85rem", flexWrap: "wrap", justifyContent: "center" }}>
          {cta("Get started with Google")}
          <a
            href="#features"
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "0.9rem 1.75rem",
              borderRadius: "var(--radius-xl)",
              fontSize: "1rem",
              fontWeight: 600,
              background: "var(--bg-secondary)",
              color: "var(--text-primary)",
              border: "1px solid var(--border-color)",
            }}
          >
            Explore features
          </a>
        </div>
        <p className="animate-fade-in delay-300" style={{ fontSize: "0.8rem", color: "var(--text-secondary)", marginTop: "1.25rem", display: "flex", alignItems: "center", gap: "0.4rem" }}>
          🔒 Connects securely with your Google Calendar & Gmail
        </p>
      </section>

      {/* ── Feature bento ─────────────────────────────────────── */}
      <section id="features" className="page-container" style={{ padding: "2.5rem 3rem" }}>
        <h2 style={{ textAlign: "center", fontSize: "clamp(1.6rem, 4vw, 2.25rem)", fontWeight: 800, marginBottom: "0.5rem" }}>
          Everything, working together
        </h2>
        <p style={{ textAlign: "center", color: "var(--text-secondary)", fontSize: "1.02rem", maxWidth: "55ch", margin: "0 auto 2.5rem" }}>
          Nine intelligences in one dashboard — each useful alone, powerful together.
        </p>
        <div className="feature-grid">
          {FEATURES.map((f, i) => (
            <div
              key={f.title}
              className="glass-panel feature-card animate-scale-in"
              style={{ animationDelay: `${i * 60}ms`, padding: "1.5rem" }}
            >
              <div style={{ width: 48, height: 48, borderRadius: 14, background: f.accent + "1f", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.5rem", marginBottom: "1rem" }}>
                {f.icon}
              </div>
              <h3 style={{ fontSize: "1.1rem", fontWeight: 700, margin: "0 0 0.5rem" }}>{f.title}</h3>
              <p style={{ fontSize: "0.92rem", color: "var(--text-secondary)", lineHeight: 1.55, margin: 0 }}>{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── How it works ──────────────────────────────────────── */}
      <section className="page-container" style={{ padding: "3rem" }}>
        <h2 style={{ textAlign: "center", fontSize: "clamp(1.6rem, 4vw, 2.25rem)", fontWeight: 800, marginBottom: "2.5rem" }}>
          Up and running in a minute
        </h2>
        <div className="steps-grid">
          {[
            { n: "1", t: "Sign in with Google", d: "One tap. We securely connect to your Calendar and Gmail — no passwords, no setup forms." },
            { n: "2", t: "Speak or type", d: "Drop a thought, a to-do, a meeting. The AI structures it and files it where it belongs." },
            { n: "3", t: "Stay in flow", d: "Your tasks, events, expenses, and news keep themselves current. You focus on the deep work." },
          ].map((s) => (
            <div key={s.n} style={{ textAlign: "center", padding: "0 1rem" }}>
              <div style={{ width: 44, height: 44, borderRadius: "50%", background: "var(--accent-color)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: "1.15rem", margin: "0 auto 1rem" }}>
                {s.n}
              </div>
              <h3 style={{ fontSize: "1.1rem", fontWeight: 700, marginBottom: "0.5rem" }}>{s.t}</h3>
              <p style={{ fontSize: "0.92rem", color: "var(--text-secondary)", lineHeight: 1.55, maxWidth: "32ch", margin: "0 auto" }}>{s.d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Privacy strip ─────────────────────────────────────── */}
      <section className="page-container" style={{ padding: "1rem 3rem 3rem" }}>
        <div className="glass-panel" style={{ display: "flex", alignItems: "center", gap: "1rem", padding: "1.25rem 1.75rem", flexWrap: "wrap", justifyContent: "center", textAlign: "center" }}>
          <span style={{ fontSize: "1.4rem" }}>🛡️</span>
          <p style={{ margin: 0, fontSize: "0.95rem", color: "var(--text-secondary)", maxWidth: "70ch", lineHeight: 1.55 }}>
            Your data stays yours. Calendar and Gmail access is used only to power your dashboard — never sold, never used for ads. You can disconnect anytime from your Google account.
          </p>
        </div>
      </section>

      {/* ── Final CTA ─────────────────────────────────────────── */}
      <section className="page-container" style={{ textAlign: "center", padding: "2rem 3rem 4.5rem", display: "flex", flexDirection: "column", alignItems: "center" }}>
        <h2 style={{ fontSize: "clamp(1.8rem, 4.5vw, 2.6rem)", fontWeight: 800, marginBottom: "1rem", maxWidth: "20ch" }}>
          Offload the mental load
        </h2>
        <p style={{ fontSize: "1.05rem", color: "var(--text-secondary)", maxWidth: "50ch", marginBottom: "2rem", lineHeight: 1.6 }}>
          Let your voice drive your day. Start free with your Google account.
        </p>
        {cta("Get started with Google")}
      </section>

      {/* ── Footer ────────────────────────────────────────────── */}
      <footer style={{ borderTop: "1px solid var(--border-color)", padding: "1.5rem 3rem", textAlign: "center", color: "var(--text-secondary)", fontSize: "0.85rem" }}>
        <span style={{ fontWeight: 700 }}>✦ Command Center</span> — your AI productivity companion.
      </footer>

      <style jsx>{`
        .feature-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 1.5rem;
        }
        .feature-card {
          transition: transform 0.25s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.25s ease;
        }
        .steps-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 2rem;
        }
        @media (max-width: 900px) {
          .feature-grid { grid-template-columns: repeat(2, 1fr); }
        }
        @media (max-width: 600px) {
          .feature-grid { grid-template-columns: 1fr; }
          .steps-grid { grid-template-columns: 1fr; gap: 2.5rem; }
          :global(.landing nav) { padding-left: 1.25rem; padding-right: 1.25rem; }
          :global(.landing section) { padding-left: 1.25rem; padding-right: 1.25rem; }
        }
      `}</style>
    </main>
  );
}

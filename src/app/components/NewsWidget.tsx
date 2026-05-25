"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";

interface NewsItem {
  title: string;
  link: string;
  pubDate: string;
  description: string;
  source: string;
  category?: string;
  reason?: string;
}

interface NewsData {
  tech: NewsItem[];
  finance: NewsItem[];
  general: NewsItem[];
  f1: NewsItem[];
  cricket: NewsItem[];
  government: NewsItem[];
  forYou: NewsItem[];
}

const TABS = [
  { id: "forYou" as const, label: "★ For You", emoji: "⭐" },
  { id: "tech" as const, label: "Tech & Systems", emoji: "💻" },
  { id: "finance" as const, label: "Indian Finance", emoji: "📈" },
  { id: "government" as const, label: "Govt Policy", emoji: "🏛️" },
  { id: "f1" as const, label: "Formula 1", emoji: "🏎️" },
  { id: "cricket" as const, label: "Cricket Hub", emoji: "🏏" },
  { id: "general" as const, label: "Global News", emoji: "🌍" }
];

export function NewsWidget() {
  const [news, setNews] = useState<NewsData>({
    tech: [], finance: [], general: [], f1: [], cricket: [], government: [], forYou: []
  });
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState<typeof TABS[number]["id"]>("forYou");
  const [dismissedUrls, setDismissedUrls] = useState<Set<string>>(new Set());
  const [isFocused, setIsFocused] = useState(false);
  const widgetRef = useRef<HTMLDivElement>(null);

  // AI Briefing State
  const [briefing, setBriefing] = useState<string | null>(null);
  const [loadingBriefing, setLoadingBriefing] = useState(false);
  const [showBriefingPanel, setShowBriefingPanel] = useState(false);

  // 1. Fetch News from Database/API
  const fetchNews = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/news");
      if (res.ok) {
        const data = await res.json();
        setNews(data);
      }
    } catch (err) {
      console.error("Failed to fetch news feeds", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchNews();
  }, []);

  // 2. Track Interaction (PATCH request to server-side weights)
  const handleInteraction = async (action: "click" | "dismiss", item: NewsItem) => {
    if (action === "dismiss") {
      setDismissedUrls(prev => {
        const next = new Set(prev);
        next.add(item.link);
        return next;
      });
    }

    try {
      await fetch("/api/news", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          category: item.category || "general",
          title: item.title
        })
      });
      
      // If user dismisses an article in "For You", trigger a background refetch
      // so the feed updates with a replacement article immediately.
      if (action === "dismiss" && activeTab === "forYou") {
        const res = await fetch("/api/news");
        if (res.ok) {
          const data = await res.json();
          setNews(data);
        }
      }
    } catch (err) {
      console.error(`Failed to register ${action} interaction:`, err);
    }
  };

  // 3. Generate AI Briefing (based on currently selected tab)
  const handleGenerateBriefing = async () => {
    setLoadingBriefing(true);
    setShowBriefingPanel(true);
    setBriefing(null);
    
    // Gather headlines from active tab
    const currentFeed = news[activeTab] || [];
    const activeHeadlines = currentFeed
      .filter(item => !dismissedUrls.has(item.link))
      .slice(0, 5)
      .map(item => item.title);

    if (activeHeadlines.length === 0) {
      setBriefing("No headlines available to summarize.");
      setLoadingBriefing(false);
      return;
    }

    try {
      const res = await fetch("/api/news", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ headlines: activeHeadlines }),
      });
      if (res.ok) {
        const data = await res.json();
        setBriefing(data.briefing);
      } else {
        setBriefing("Could not generate briefing. Ensure GEMINI_API_KEY is configured.");
      }
    } catch (err) {
      console.error("AI briefing generation failed", err);
      setBriefing("Failed to generate intelligence briefing due to network error.");
    } finally {
      setLoadingBriefing(false);
    }
  };

  // 4. Keyboard Navigation (Restricted to Widget Focus)
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (!isFocused) return;
    
    if (e.key === "ArrowRight") {
      e.preventDefault();
      setActiveTab(current => {
        const currentIndex = TABS.findIndex(t => t.id === current);
        const nextIndex = (currentIndex + 1) % TABS.length;
        return TABS[nextIndex].id;
      });
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      setActiveTab(current => {
        const currentIndex = TABS.findIndex(t => t.id === current);
        const prevIndex = (currentIndex - 1 + TABS.length) % TABS.length;
        return TABS[prevIndex].id;
      });
    }
  }, [isFocused]);

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [handleKeyDown]);

  // 5. Search filtering of currently selected feed
  const activeFeed = useMemo(() => {
    const feed = news[activeTab] || [];
    const visible = feed.filter(item => !dismissedUrls.has(item.link));
    
    if (!searchQuery.trim()) return visible;
    const query = searchQuery.toLowerCase();
    
    return visible.filter(
      (item) =>
        item.title.toLowerCase().includes(query) ||
        item.description.toLowerCase().includes(query) ||
        item.source.toLowerCase().includes(query)
    );
  }, [news, activeTab, dismissedUrls, searchQuery]);

  return (
    <div 
      ref={widgetRef}
      tabIndex={0}
      onFocus={() => setIsFocused(true)}
      onBlur={(e) => {
        // Only blur if the focus didn't move to a child element inside this widget
        if (widgetRef.current && !widgetRef.current.contains(e.relatedTarget as Node)) {
          setIsFocused(false);
        }
      }}
      className={`glass-panel news-widget-wrapper ${isFocused ? "focused-widget" : ""}`}
      style={{
        width: "100%",
        display: "flex",
        flexDirection: "column",
        gap: "1.25rem",
        outline: "none",
        border: isFocused ? "1px solid var(--accent-color)" : "1px solid var(--glass-border)",
        boxShadow: isFocused ? "0 0 16px rgba(0, 122, 255, 0.15)" : "var(--glass-shadow)"
      }}
    >
      {/* Top Header Section */}
      <div className="news-header-container" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "1rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
          <h2 style={{ fontSize: "1.4rem", margin: 0, display: "flex", alignItems: "center", gap: "0.5rem" }}>
            📰 Intelligence Feed
          </h2>
          {isFocused && (
            <span style={{ 
              fontSize: "0.6rem", 
              background: "rgba(0, 122, 255, 0.15)", 
              color: "var(--accent-color)", 
              padding: "2px 8px", 
              borderRadius: "10px", 
              fontWeight: 800,
              letterSpacing: "0.5px"
            }}>⌨️ ARROWS ACTIVE</span>
          )}
        </div>

        {/* Action Controls */}
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
          <input
            type="text"
            placeholder="Search active feed..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              padding: "0.4rem 0.85rem",
              borderRadius: "var(--radius-xl)",
              border: "1px solid var(--border-color)",
              background: "var(--bg-primary)",
              color: "var(--text-primary)",
              outline: "none",
              fontSize: "0.75rem",
              width: "150px",
            }}
          />

          <button
            onClick={handleGenerateBriefing}
            className="btn-primary"
            style={{ 
              padding: "0.4rem 0.85rem", 
              borderRadius: "var(--radius-xl)", 
              fontSize: "0.75rem",
              boxShadow: "0 2px 10px rgba(99, 102, 241, 0.2)",
              background: "linear-gradient(135deg, var(--accent-color) 0%, #a855f7 100%)",
              border: "none"
            }}
          >
            ✨ Brief Feed
          </button>

          <button
            onClick={fetchNews}
            className="btn-icon"
            title="Refresh News"
            style={{ width: "32px", height: "32px", fontSize: "0.8rem" }}
          >
            🔄
          </button>
        </div>
      </div>

      {/* Horizontal Tabs Header */}
      <div 
        className="tabs-scroller"
        style={{ 
          display: "flex", 
          gap: "0.5rem", 
          overflowX: "auto", 
          paddingBottom: "0.5rem",
          borderBottom: "1px solid var(--border-color)",
          scrollbarWidth: "none"
        }}
      >
        {TABS.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                padding: "0.45rem 0.85rem",
                borderRadius: "var(--radius-md)",
                border: "1px solid",
                borderColor: isActive ? "var(--accent-color)" : "var(--border-color)",
                background: isActive ? "rgba(0, 122, 255, 0.08)" : "transparent",
                color: isActive ? "var(--accent-color)" : "var(--text-secondary)",
                fontSize: "0.8rem",
                fontWeight: isActive ? 700 : 500,
                whiteSpace: "nowrap",
                transition: "all 0.2s ease",
                display: "flex",
                alignItems: "center",
                gap: "4px"
              }}
            >
              <span>{tab.emoji}</span>
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* AI Briefing Expandable Panel */}
      {showBriefingPanel && (
        <div className="animate-scale-in" style={{
          background: "linear-gradient(135deg, rgba(99, 102, 241, 0.08) 0%, rgba(168, 85, 247, 0.05) 100%)",
          border: "1px solid rgba(99, 102, 241, 0.25)",
          borderRadius: "var(--radius-md)",
          padding: "1.25rem",
          position: "relative",
          boxShadow: "0 8px 24px rgba(99, 102, 241, 0.05)"
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
            <h3 style={{ margin: 0, fontSize: "0.9rem", color: "var(--accent-color)", display: "flex", alignItems: "center", gap: "0.4rem", fontWeight: 800 }}>
              ✨ Gemini AI Curation Summary
            </h3>
            <button 
              onClick={() => setShowBriefingPanel(false)}
              style={{ fontSize: "0.8rem", color: "var(--text-secondary)", cursor: "pointer", opacity: 0.7 }}
            >
              ✕ Close
            </button>
          </div>

          {loadingBriefing ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", padding: "0.5rem 0" }}>
              <div className="animate-pulse" style={{ height: "12px", background: "var(--border-color)", borderRadius: "4px", width: "90%" }}></div>
              <div className="animate-pulse" style={{ height: "12px", background: "var(--border-color)", borderRadius: "4px", width: "85%" }}></div>
              <div className="animate-pulse" style={{ height: "12px", background: "var(--border-color)", borderRadius: "4px", width: "60%" }}></div>
            </div>
          ) : (
            <div style={{ fontSize: "0.85rem", lineHeight: "1.6", color: "var(--text-primary)" }}>
              {briefing ? (
                <div style={{ whiteSpace: "pre-line" }}>{briefing}</div>
              ) : (
                <span style={{ color: "var(--text-secondary)" }}>Summary loaded successfully.</span>
              )}
            </div>
          )}
        </div>
      )}

      {/* Main Feed Content Area */}
      {loading ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: "1.25rem" }}>
          {[1, 2, 3, 4].map((n) => (
            <div key={n} className="animate-pulse" style={{ height: "120px", background: "var(--border-color)", borderRadius: "var(--radius-md)" }}></div>
          ))}
        </div>
      ) : activeFeed.length === 0 ? (
        <div style={{ padding: "3rem", textAlign: "center", color: "var(--text-secondary)", background: "var(--bg-secondary)", borderRadius: "var(--radius-md)", border: "1px dashed var(--border-color)" }}>
          <p style={{ fontSize: "0.85rem" }}>No matching articles found in this feed.</p>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "1.25rem" }}>
          {activeFeed.map((item) => (
            <NewsCard 
              key={item.link} 
              item={item} 
              onClick={() => handleInteraction("click", item)}
              onDismiss={() => handleInteraction("dismiss", item)}
            />
          ))}
        </div>
      )}

      <style jsx>{`
        .tabs-scroller::-webkit-scrollbar {
          display: none;
        }
        .focused-widget {
          transition: border-color 0.3s ease, box-shadow 0.3s ease;
        }
      `}</style>
    </div>
  );
}

/* ── INNER COMPONENT: INDIVIDUAL NEWS CARD ── */
function NewsCard({ 
  item, 
  onClick, 
  onDismiss 
}: { 
  item: NewsItem; 
  onClick: () => void; 
  onDismiss: () => void;
}) {
  return (
    <div 
      className="news-card animate-fade-in"
      style={{
        background: "var(--bg-secondary)",
        border: "1px solid var(--border-color)",
        borderRadius: "var(--radius-md)",
        padding: "1rem",
        display: "flex",
        flexDirection: "column",
        gap: "0.4rem",
        transition: "var(--transition-smooth)",
        position: "relative"
      }}
    >
      {/* Dismiss Button */}
      <button
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onDismiss();
        }}
        title="Dismiss / Mute this topic"
        style={{
          position: "absolute",
          top: "8px",
          right: "8px",
          border: "none",
          background: "transparent",
          cursor: "pointer",
          fontSize: "0.75rem",
          color: "var(--text-secondary)",
          opacity: 0.3,
          transition: "opacity 0.2s ease, transform 0.2s ease",
          zIndex: 5
        }}
        className="dismiss-btn"
      >
        ✕
      </button>

      {/* Badge/Source & Personalization Reason */}
      <div style={{ display: "flex", flexDirection: "column", gap: "0.15rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <span style={{ 
            fontSize: "0.6rem", 
            fontWeight: 700, 
            background: "rgba(0, 122, 255, 0.08)", 
            color: "var(--accent-color)", 
            padding: "2px 6px", 
            borderRadius: "4px"
          }}>
            {item.source}
          </span>
          <span style={{ fontSize: "0.6rem", color: "var(--text-secondary)", fontWeight: 500 }}>
            {item.pubDate}
          </span>
        </div>
        
        {item.reason && (
          <span style={{ 
            fontSize: "0.65rem", 
            fontWeight: 750, 
            color: "#8b5cf6", // Indigo/Purple accent
            display: "inline-flex",
            alignItems: "center",
            gap: "2px",
            marginTop: "0.1rem"
          }}>
            ✨ {item.reason}
          </span>
        )}
      </div>

      {/* Title */}
      <h4 style={{ 
        fontSize: "0.85rem", 
        margin: 0, 
        lineHeight: "1.3", 
        fontWeight: 650, 
        color: "var(--text-primary)" 
      }}>
        {item.title}
      </h4>

      {/* Excerpt */}
      <p style={{ 
        fontSize: "0.7rem", 
        color: "var(--text-secondary)", 
        margin: 0, 
        lineHeight: "1.4",
        flex: 1
      }}>
        {item.description}
      </p>

      {/* Read link */}
      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "0.2rem" }}>
        <a 
          href={item.link} 
          target="_blank" 
          rel="noopener noreferrer"
          onClick={onClick}
          style={{ 
            fontSize: "0.7rem", 
            fontWeight: 700, 
            color: "var(--accent-color)",
            display: "inline-flex",
            alignItems: "center",
            gap: "2px"
          }}
          className="read-more-link"
        >
          Read Coverage ↗
        </a>
      </div>

      <style jsx>{`
        .news-card:hover {
          transform: translateY(-2px);
          border-color: var(--accent-color) !important;
          box-shadow: 0 4px 16px rgba(0, 122, 255, 0.05);
        }
        .dismiss-btn:hover {
          opacity: 0.95 !important;
          transform: scale(1.15);
        }
        .read-more-link:hover {
          text-decoration: underline;
        }
      `}</style>
    </div>
  );
}

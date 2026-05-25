"use client";

import { useState, useEffect, useMemo, useCallback } from "react";

interface NewsItem {
  title: string;
  link: string;
  pubDate: string;
  description: string;
  source: string;
}

interface NewsData {
  tech: NewsItem[];
  finance: NewsItem[];
  general: NewsItem[];
}

export function NewsWidget() {
  const [news, setNews] = useState<NewsData>({ tech: [], finance: [], general: [] });
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [showBookmarks, setShowBookmarks] = useState(false);
  const [bookmarks, setBookmarks] = useState<NewsItem[]>([]);
  
  // AI Briefing State
  const [briefing, setBriefing] = useState<string | null>(null);
  const [loadingBriefing, setLoadingBriefing] = useState(false);
  const [showBriefingPanel, setShowBriefingPanel] = useState(false);

  // 1. Fetch News on Mount
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
    // Load Bookmarks
    try {
      const saved = localStorage.getItem("news_bookmarks");
      if (saved) setBookmarks(JSON.parse(saved));
    } catch (e) {
      console.error(e);
    }
  }, []);

  // 2. Bookmark Action
  const toggleBookmark = (item: NewsItem, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    let updated;
    const exists = bookmarks.some((b) => b.link === item.link);
    if (exists) {
      updated = bookmarks.filter((b) => b.link !== item.link);
    } else {
      updated = [...bookmarks, item];
    }
    
    setBookmarks(updated);
    try {
      localStorage.setItem("news_bookmarks", JSON.stringify(updated));
    } catch (e) {
      console.error(e);
    }
  };

  // 3. Generate AI Briefing
  const handleGenerateBriefing = async () => {
    setLoadingBriefing(true);
    setShowBriefingPanel(true);
    setBriefing(null);
    
    // Gather current headlines
    const headlines: string[] = [];
    const collectHeadlines = (items: NewsItem[]) => {
      items.slice(0, 3).forEach(item => headlines.push(item.title));
    };
    collectHeadlines(news.tech);
    collectHeadlines(news.finance);
    collectHeadlines(news.general);

    try {
      const res = await fetch("/api/news", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ headlines }),
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

  // 4. Search Filter logic
  const filterList = useCallback((items: NewsItem[]) => {
    if (!searchQuery.trim()) return items;
    const query = searchQuery.toLowerCase();
    return items.filter(
      (item) =>
        item.title.toLowerCase().includes(query) ||
        item.description.toLowerCase().includes(query) ||
        item.source.toLowerCase().includes(query)
    );
  }, [searchQuery]);

  const filteredTech = useMemo(() => filterList(news.tech), [news.tech, filterList]);
  const filteredFinance = useMemo(() => filterList(news.finance), [news.finance, filterList]);
  const filteredGeneral = useMemo(() => filterList(news.general), [news.general, filterList]);
  const filteredBookmarks = useMemo(() => filterList(bookmarks), [bookmarks, filterList]);

  return (
    <div className="glass-panel" style={{ width: "100%", display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      {/* Top Header Section */}
      <div className="news-header-container" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "1rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
          <h2 style={{ fontSize: "1.5rem", margin: 0, display: "flex", alignItems: "center", gap: "0.5rem" }}>
            📰 Intelligence Feed
          </h2>
          <span style={{ 
            fontSize: "0.65rem", 
            background: "var(--accent-color)", 
            color: "#fff", 
            padding: "2px 8px", 
            borderRadius: "10px", 
            fontWeight: 800,
            letterSpacing: "0.5px"
          }}>LIVE SCAN</span>
        </div>

        {/* Action Controls */}
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
          {/* Search bar */}
          <input
            type="text"
            placeholder="Search news..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              padding: "0.45rem 1rem",
              borderRadius: "var(--radius-xl)",
              border: "1px solid var(--border-color)",
              background: "var(--bg-primary)",
              color: "var(--text-primary)",
              outline: "none",
              fontSize: "0.8rem",
              width: "160px",
            }}
          />

          {/* AI Briefing Button */}
          <button
            onClick={handleGenerateBriefing}
            className="btn-primary"
            style={{ 
              padding: "0.45rem 1rem", 
              borderRadius: "var(--radius-xl)", 
              fontSize: "0.8rem",
              boxShadow: "0 2px 10px rgba(99, 102, 241, 0.2)",
              background: "linear-gradient(135deg, var(--accent-color) 0%, #a855f7 100%)",
              border: "none"
            }}
          >
            ✨ AI Briefing
          </button>

          {/* Bookmark view toggle */}
          <button
            onClick={() => setShowBookmarks(!showBookmarks)}
            className="btn-icon"
            title={showBookmarks ? "Show all news" : "Show saved bookmarks"}
            style={{
              width: "36px",
              height: "36px",
              background: showBookmarks ? "var(--warning-color)" : "var(--bg-secondary)",
              color: showBookmarks ? "#fff" : "var(--text-primary)",
              borderColor: showBookmarks ? "transparent" : "var(--border-color)",
              fontSize: "1rem"
            }}
          >
            ⭐
          </button>

          {/* Refresh Button */}
          <button
            onClick={fetchNews}
            className="btn-icon"
            title="Refresh News"
            style={{ width: "36px", height: "36px", fontSize: "0.9rem" }}
          >
            🔄
          </button>
        </div>
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
            <h3 style={{ margin: 0, fontSize: "0.95rem", color: "var(--accent-color)", display: "flex", alignItems: "center", gap: "0.4rem", fontWeight: 800 }}>
              ✨ Gemini Morning Intelligence Briefing
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
              <div className="animate-pulse" style={{ height: "14px", background: "var(--border-color)", borderRadius: "4px", width: "90%" }}></div>
              <div className="animate-pulse" style={{ height: "14px", background: "var(--border-color)", borderRadius: "4px", width: "85%" }}></div>
              <div className="animate-pulse" style={{ height: "14px", background: "var(--border-color)", borderRadius: "4px", width: "60%" }}></div>
            </div>
          ) : (
            <div style={{ fontSize: "0.9rem", lineHeight: "1.6", color: "var(--text-primary)" }}>
              {briefing ? (
                <div style={{ whiteSpace: "pre-line" }}>{briefing}</div>
              ) : (
                <span style={{ color: "var(--text-secondary)" }}>Briefing could not be loaded.</span>
              )}
            </div>
          )}
        </div>
      )}

      {/* Main Feed Container */}
      {loading ? (
        <div style={{ display: "flex", gap: "1.5rem", width: "100%", minHeight: "200px" }} className="news-columns-container">
          {[1, 2, 3].map((n) => (
            <div key={n} style={{ flex: 1, display: "flex", flexDirection: "column", gap: "1rem" }}>
              <div className="animate-pulse" style={{ height: "24px", background: "var(--border-color)", borderRadius: "4px", width: "40%" }}></div>
              <div className="animate-pulse" style={{ height: "100px", background: "var(--border-color)", borderRadius: "var(--radius-md)" }}></div>
              <div className="animate-pulse" style={{ height: "100px", background: "var(--border-color)", borderRadius: "var(--radius-md)" }}></div>
            </div>
          ))}
        </div>
      ) : showBookmarks ? (
        /* ── BOOKMARKS VIEW ── */
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "1rem" }}>
            <span style={{ fontSize: "1.25rem" }}>⭐</span>
            <h3 style={{ margin: 0, fontSize: "1.1rem" }}>Saved Articles ({filteredBookmarks.length})</h3>
          </div>
          {filteredBookmarks.length === 0 ? (
            <div style={{ padding: "3rem", textAlign: "center", color: "var(--text-secondary)", background: "var(--bg-secondary)", borderRadius: "var(--radius-md)", border: "1px dashed var(--border-color)" }}>
              <p style={{ fontSize: "0.9rem" }}>No bookmarked articles yet. Click the star icon on news cards to save them.</p>
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: "1.25rem" }}>
              {filteredBookmarks.map((item) => (
                <NewsCard key={item.link} item={item} isBookmarked={true} onToggleBookmark={(e) => toggleBookmark(item, e)} />
              ))}
            </div>
          )}
        </div>
      ) : (
        /* ── THREE COLUMN FEEDS VIEW ── */
        <div className="news-columns-container" style={{ display: "flex", gap: "2rem", width: "100%" }}>
          {/* Tech Feed */}
          <div className="news-column" style={{ flex: 1, display: "flex", flexDirection: "column", gap: "1rem" }}>
            <h3 style={{ fontSize: "1rem", color: "var(--text-primary)", display: "flex", alignItems: "center", gap: "0.5rem", borderBottom: "1px solid var(--border-color)", paddingBottom: "0.5rem" }}>
              💻 Tech & Systems
            </h3>
            <div className="news-list" style={{ display: "flex", flexDirection: "column", gap: "1rem", maxHeight: "400px", overflowY: "auto", paddingRight: "4px" }}>
              {filteredTech.length > 0 ? (
                filteredTech.map((item) => {
                  const isSaved = bookmarks.some((b) => b.link === item.link);
                  return <NewsCard key={item.link} item={item} isBookmarked={isSaved} onToggleBookmark={(e) => toggleBookmark(item, e)} />;
                })
              ) : (
                <div style={{ fontSize: "0.85rem", color: "var(--text-secondary)", fontStyle: "italic" }}>No matching stories.</div>
              )}
            </div>
          </div>

          {/* Finance Feed */}
          <div className="news-column" style={{ flex: 1, display: "flex", flexDirection: "column", gap: "1rem" }}>
            <h3 style={{ fontSize: "1rem", color: "var(--text-primary)", display: "flex", alignItems: "center", gap: "0.5rem", borderBottom: "1px solid var(--border-color)", paddingBottom: "0.5rem" }}>
              📈 Markets & Economy
            </h3>
            <div className="news-list" style={{ display: "flex", flexDirection: "column", gap: "1rem", maxHeight: "400px", overflowY: "auto", paddingRight: "4px" }}>
              {filteredFinance.length > 0 ? (
                filteredFinance.map((item) => {
                  const isSaved = bookmarks.some((b) => b.link === item.link);
                  return <NewsCard key={item.link} item={item} isBookmarked={isSaved} onToggleBookmark={(e) => toggleBookmark(item, e)} />;
                })
              ) : (
                <div style={{ fontSize: "0.85rem", color: "var(--text-secondary)", fontStyle: "italic" }}>No matching stories.</div>
              )}
            </div>
          </div>

          {/* General Feed */}
          <div className="news-column" style={{ flex: 1, display: "flex", flexDirection: "column", gap: "1rem" }}>
            <h3 style={{ fontSize: "1rem", color: "var(--text-primary)", display: "flex", alignItems: "center", gap: "0.5rem", borderBottom: "1px solid var(--border-color)", paddingBottom: "0.5rem" }}>
              🌍 Global Coverage
            </h3>
            <div className="news-list" style={{ display: "flex", flexDirection: "column", gap: "1rem", maxHeight: "400px", overflowY: "auto", paddingRight: "4px" }}>
              {filteredGeneral.length > 0 ? (
                filteredGeneral.map((item) => {
                  const isSaved = bookmarks.some((b) => b.link === item.link);
                  return <NewsCard key={item.link} item={item} isBookmarked={isSaved} onToggleBookmark={(e) => toggleBookmark(item, e)} />;
                })
              ) : (
                <div style={{ fontSize: "0.85rem", color: "var(--text-secondary)", fontStyle: "italic" }}>No matching stories.</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Styled JSX for Responsive layouts */}
      <style jsx>{`
        .news-columns-container {
          flex-direction: row;
        }

        @media (max-width: 992px) {
          .news-columns-container {
            flex-direction: column;
            gap: 1.5rem !important;
          }
          
          .news-list {
            max-height: 300px !important;
          }
        }
      `}</style>
    </div>
  );
}

/* ── INNER COMPONENT: INDIVIDUAL CARD ── */
function NewsCard({ 
  item, 
  isBookmarked, 
  onToggleBookmark 
}: { 
  item: NewsItem; 
  isBookmarked: boolean; 
  onToggleBookmark: (e: React.MouseEvent) => void 
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
        gap: "0.5rem",
        transition: "var(--transition-smooth)",
        position: "relative"
      }}
    >
      {/* Badge & Star */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ 
          fontSize: "0.65rem", 
          fontWeight: 700, 
          background: "rgba(0, 122, 255, 0.08)", 
          color: "var(--accent-color)", 
          padding: "2px 8px", 
          borderRadius: "6px"
        }}>
          {item.source}
        </span>
        <button
          onClick={onToggleBookmark}
          style={{
            fontSize: "0.95rem",
            color: isBookmarked ? "var(--warning-color)" : "var(--text-secondary)",
            opacity: isBookmarked ? 1 : 0.4,
            cursor: "pointer",
            transition: "all 0.2s ease"
          }}
          className="bookmark-btn"
          title={isBookmarked ? "Remove Bookmark" : "Save Bookmark"}
        >
          ★
        </button>
      </div>

      {/* Title */}
      <h4 style={{ 
        fontSize: "0.9rem", 
        margin: 0, 
        lineHeight: "1.3", 
        fontWeight: 650, 
        color: "var(--text-primary)" 
      }}>
        {item.title}
      </h4>

      {/* Description */}
      <p style={{ 
        fontSize: "0.75rem", 
        color: "var(--text-secondary)", 
        margin: 0, 
        lineHeight: "1.4"
      }}>
        {item.description}
      </p>

      {/* Footer */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "0.25rem" }}>
        <span style={{ fontSize: "0.65rem", color: "var(--text-secondary)", fontWeight: 500 }}>
          {item.pubDate}
        </span>
        <a 
          href={item.link} 
          target="_blank" 
          rel="noopener noreferrer"
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
        .bookmark-btn:hover {
          opacity: 1 !important;
          transform: scale(1.15);
        }
        .read-more-link:hover {
          text-decoration: underline;
        }
      `}</style>
    </div>
  );
}

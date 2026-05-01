import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { 
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RechartsTooltip, 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Cell as BarCell
} from 'recharts';

export function FinanceGrid() {
  const [data, setData] = useState<any>(null);
  const [market, setMarket] = useState<any[]>([]);
  const [expenses, setExpenses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastSync, setLastSync] = useState<string>("");
  const [isMarketOpen, setIsMarketOpen] = useState(true);
  const [syncFeedback, setSyncFeedback] = useState<{ type: 'success' | 'error' | null, message: string }>({ type: null, message: "" });
  
  // Tab State: 0 = List, 1 = Pie (Categories), 2 = Bar (Monthly)
  const [activeTab, setActiveTab] = useState(0);
  const [pieMonthOffset, setPieMonthOffset] = useState(0);
  // When a user clicks a pie slice or a list-row category, we open a modal
  // with that category's full breakdown (txns, totals, MoM trend, etc).
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);

  const fetchData = async () => {
    try {
      // Fetch Portfolio
      const portRes = await fetch('/api/groww/portfolio');
      const portJson = await portRes.json();
      setData(portJson);

      // Fetch Live Market Data
      const marketRes = await fetch('/api/finance/market');
      const marketJson = await marketRes.json();
      const marketList = marketJson.market || [];
      setMarket(marketList);
      
      // Fetch Expenses
      const expRes = await fetch('/api/finance/sync');
      const expJson = await expRes.json();
      setExpenses(expJson.expenses || []);
      
      // Determine if market is open
      const isOpen = marketList.some((m: any) => m.state === 'LIVE');
      setIsMarketOpen(isOpen);
      
      setLastSync(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
    } catch (e) {
      console.error("Failed to fetch finance data", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 600000); // 10 min sync as requested
    return () => clearInterval(interval);
  }, []);

  // Keyboard navigation is now handled locally on the container for better focus control


  // Data Aggregation for Charts
  const categoryData = useMemo(() => {
    const counts: Record<string, number> = {};
    const now = new Date();
    const targetDate = new Date(now.getFullYear(), now.getMonth() - pieMonthOffset, 1);
    const targetMonth = targetDate.getMonth();
    const targetYear = targetDate.getFullYear();

    expenses.forEach(exp => {
      const d = new Date(exp.date);
      if (d.getMonth() === targetMonth && d.getFullYear() === targetYear) {
        counts[exp.category] = (counts[exp.category] || 0) + exp.amount;
      }
    });
    return Object.entries(counts).map(([name, value]) => ({ name, value }));
  }, [expenses, pieMonthOffset]);

  const monthlyData = useMemo(() => {
    const now = new Date();
    const months = Array.from({ length: 3 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      return { 
        name: d.toLocaleString('default', { month: 'short' }), 
        month: d.getMonth(), 
        year: d.getFullYear(), 
        total: 0 
      };
    }).reverse();

    expenses.forEach(exp => {
      const d = new Date(exp.date);
      const mIdx = months.findIndex(m => m.month === d.getMonth() && m.year === d.getFullYear());
      if (mIdx !== -1) months[mIdx].total += exp.amount;
    });

    return months;
  }, [expenses]);

  // Build the breakdown for whichever category is currently expanded.
  // Recomputes only when the selection or the underlying expenses change.
  // We sort transactions newest-first so the modal opens on the user's most
  // recent activity in that category — which is what people scan for first.
  const expandedData = useMemo(() => {
    if (!expandedCategory) return null;
    const items = expenses.filter((e: any) => e.category === expandedCategory);
    if (items.length === 0) return null;
    const total = items.reduce((s: number, e: any) => s + e.amount, 0);
    const grandTotal = expenses.reduce((s: number, e: any) => s + e.amount, 0);
    const pctOfSpend = grandTotal > 0 ? (total / grandTotal) * 100 : 0;
    const sorted = [...items].sort(
      (a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime()
    );
    const largest = items.reduce(
      (max: any, e: any) => (e.amount > max.amount ? e : max),
      items[0]
    );
    const avg = total / items.length;
    const merchantCounts: Record<string, number> = {};
    items.forEach((e: any) => {
      merchantCounts[e.merchant] = (merchantCounts[e.merchant] || 0) + 1;
    });
    const topMerchantEntry = Object.entries(merchantCounts).sort(
      (a, b) => b[1] - a[1]
    )[0];
    const topMerchant = topMerchantEntry
      ? { name: topMerchantEntry[0], visits: topMerchantEntry[1] }
      : null;
    const lastSpend = sorted[0];
    const firstSpend = sorted[sorted.length - 1];
    const daysSinceLast = Math.max(
      0,
      Math.floor(
        (Date.now() - new Date(lastSpend.date).getTime()) / (1000 * 60 * 60 * 24)
      )
    );

    // Month-over-month — useful insight: "you spent 32% more on Food this
    // month than last." If we don't have data for last month we just hide
    // that pill rather than printing a misleading 0% / NaN.
    const now = new Date();
    const monthTotals: Record<string, number> = {};
    items.forEach((e: any) => {
      const d = new Date(e.date);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      monthTotals[key] = (monthTotals[key] || 0) + e.amount;
    });
    const curKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const prevKey = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, "0")}`;
    const currentMonthTotal = monthTotals[curKey] || 0;
    const lastMonthTotal = monthTotals[prevKey] || 0;
    const momChange =
      lastMonthTotal > 0
        ? ((currentMonthTotal - lastMonthTotal) / lastMonthTotal) * 100
        : null;

    return {
      items: sorted,
      total,
      pctOfSpend,
      largest,
      avg,
      topMerchant,
      daysSinceLast,
      momChange,
      currentMonthTotal,
      lastMonthTotal,
      firstSpendDate: firstSpend?.date,
      lastSpendDate: lastSpend?.date,
      count: items.length,
    };
  }, [expandedCategory, expenses]);

  const CATEGORY_COLORS: Record<string, string> = {
    'Food': '#ef4444',
    'Shopping': '#6366f1',
    'Entertainment': '#a855f7',
    'Travel': '#eab308',
    'Investment': '#0ea5e9',
    'Health': '#ec4899',
    'Bills': '#22c55e',
    'Other': '#64748b'
  };

  if (loading) {
    return (
      <div className="finance-grid animate-pulse">
        <div className="bento-item wealth-area glass-panel" style={{ height: '200px' }}>Syncing with Groww...</div>
      </div>
    );
  }

  return (
    <div className="finance-grid">

      {/* Wealth Summary (50-50 Weightage Design) */}
      <div className="bento-item wealth-area glass-panel animate-scale-in">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.9rem' }}>
          <h2 style={{ fontSize: '1.25rem', margin: 0 }}>💰 Wealth Canvas</h2>
          <span style={{ fontSize: '0.7rem', background: 'rgba(34, 197, 94, 0.1)', color: 'var(--success-color)', padding: '4px 10px', borderRadius: '12px', fontWeight: 800 }}>GROWW LIVE</span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem' }}>
          {/* Equity Side */}
          <div style={{ padding: '0.9rem', background: 'rgba(99, 102, 241, 0.05)', borderRadius: 'var(--radius-lg)', border: '1px solid rgba(99, 102, 241, 0.1)' }}>
            <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>EQUITY PULSE (50%)</span>
            <div style={{ fontSize: '1.4rem', fontWeight: 800, marginTop: '0.35rem' }}>₹{ (data?.stocks?.value / 100000).toFixed(2) } L</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--success-color)', fontWeight: 600 }}>{data?.stocks?.holdings?.length} Active Holdings</div>

            <div style={{ marginTop: '0.6rem', display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
               {data?.stocks?.holdings?.slice(0, 2).map((h: any) => (
                 <div key={h.symbol} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem' }}>
                   <span>{h.symbol}</span>
                   <span style={{ fontWeight: 600 }}>{h.change}</span>
                 </div>
               ))}
            </div>
          </div>

          {/* Mutual Fund Side */}
          <div style={{ padding: '0.9rem', background: 'rgba(34, 197, 94, 0.05)', borderRadius: 'var(--radius-lg)', border: '1px solid rgba(34, 197, 94, 0.1)' }}>
            <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>MF PULSE (50%)</span>
            <div style={{ fontSize: '1.4rem', fontWeight: 800, marginTop: '0.35rem' }}>₹{ (data?.mutualFunds?.value / 100000).toFixed(2) } L</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--accent-color)', fontWeight: 600 }}>{data?.mutualFunds?.funds?.length} active Portfolios</div>

            <div style={{ marginTop: '0.6rem', display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
               {data?.mutualFunds?.funds?.slice(0, 2).map((f: any) => (
                 <div key={f.name} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem' }}>
                   <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100px' }}>{f.name}</span>
                   <span style={{ fontWeight: 600 }}>{f.returns}</span>
                 </div>
               ))}
            </div>
          </div>
        </div>
      </div>

      {/* Market Hub (Live Integration) */}
      <div className="bento-item market-area glass-panel animate-scale-in delay-100">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <h3 style={{ fontSize: '1.25rem', margin: 0 }}>📊 Market Hub</h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.6rem', color: 'var(--text-secondary)', fontWeight: 800 }}>
            <span className="pulse-dot" style={{ width: '6px', height: '6px', background: 'var(--success-color)', borderRadius: '50%' }}></span>
            📡 LIVE • {lastSync}
          </div>
        </div>
        
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {market.length > 0 ? market.map((inv: any) => (
            <div key={inv.symbol} style={{ 
              display: 'flex', 
              justifyContent: 'space-between', 
              padding: '1rem', 
              background: 'var(--bg-secondary)', 
              borderRadius: 'var(--radius-md)', 
              border: '1px solid var(--border-color)',
              transition: 'transform 0.2s ease',
              cursor: 'default'
            }}>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>{inv.name}</span>
                <span style={{ fontSize: '0.65rem', color: 'var(--text-secondary)' }}>{inv.symbol}</span>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontWeight: 700, fontSize: '1rem' }}>{inv.price}</div>
                <div style={{ fontSize: '0.8rem', color: inv.up ? 'var(--success-color)' : '#ef4444', fontWeight: 700 }}>{inv.change}</div>
              </div>
            </div>
          )) : (
            <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)', border: '1px dashed var(--border-color)', borderRadius: 'var(--radius-md)' }}>
              Syncing Market...
            </div>
          )}

          {/* Reserved Slots for Future Stocks */}
          <div style={{ 
            padding: '1rem', 
            border: '1px dashed var(--border-color)', 
            borderRadius: 'var(--radius-md)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--text-secondary)',
            fontSize: '0.75rem',
            opacity: 0.5
          }}>
            + Add to Watchlist (Max 3)
          </div>
        </div>
      </div>

      {/* Expense Intelligence (Gmail Synced Ledger / Visuals) */}
      <div
        className="bento-item sub-area glass-panel animate-scale-in delay-200"
        style={{ display: 'flex', flexDirection: 'column', outline: 'none', overflow: 'hidden' }}
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'ArrowRight') setActiveTab(p => (p + 1) % 3);
          if (e.key === 'ArrowLeft') setActiveTab(p => (p - 1 + 3) % 3);
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <h3 style={{ fontSize: '1.25rem', margin: 0, whiteSpace: 'nowrap' }}>📊 Expense Intelligence</h3>
            <div style={{ 
              display: 'flex', 
              gap: '2px', 
              background: 'rgba(0,0,0,0.05)', 
              padding: '3px', 
              borderRadius: '10px',
              border: '1px solid var(--border-color)',
              boxShadow: 'inset 0 1px 4px rgba(0,0,0,0.02)'
            }}>
              {[
                { id: 0, label: 'LIST', icon: '📑' },
                { id: 1, label: 'PIE', icon: '🥧' },
                { id: 2, label: 'BAR', icon: '📊' }
              ].map(t => (
                <button 
                  key={t.id}
                  onClick={() => setActiveTab(t.id)}
                  style={{
                    padding: '6px 12px',
                    fontSize: '0.7rem',
                    borderRadius: '7px',
                    border: 'none',
                    background: activeTab === t.id ? 'var(--accent-color)' : 'transparent',
                    color: activeTab === t.id ? '#fff' : 'var(--text-secondary)',
                    fontWeight: 800,
                    cursor: 'pointer',
                    transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    boxShadow: activeTab === t.id ? '0 2px 8px rgba(99, 102, 241, 0.3)' : 'none'
                  }}
                >
                  <span style={{ fontSize: '0.8rem' }}>{t.icon}</span>
                  {t.label}
                </button>
              ))}
            </div>
          </div>
          <button 
            onClick={async () => {
              setLoading(true);
              setSyncFeedback({ type: null, message: "" });
              try {
                const res = await fetch('/api/finance/sync', { method: 'POST' });
                const json = await res.json();
                
                if (res.ok) {
                  setSyncFeedback({ type: 'success', message: json.message || "Sync complete." });
                  fetchData();
                  setTimeout(() => setSyncFeedback({ type: null, message: "" }), 5000);
                } else {
                  setSyncFeedback({ type: 'error', message: json.error || "Sync failed." });
                }
              } catch (e) {
                setSyncFeedback({ type: 'error', message: "Network error during sync." });
              } finally {
                setLoading(false);
              }
            }}
            style={{
              padding: '0.4rem 0.8rem',
              fontSize: '0.65rem',
              fontWeight: 800,
              background: 'rgba(99, 102, 241, 0.1)',
              color: 'var(--accent-color)',
              border: '1px solid var(--accent-color)',
              borderRadius: '8px',
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.7 : 1
            }}
          >
            {loading ? 'SYNCING...' : '✨ SYNC'}
          </button>
        </div>

        {syncFeedback.type && (
          <div style={{ 
            fontSize: '0.7rem', 
            padding: '0.5rem 0.75rem', 
            borderRadius: '6px', 
            marginBottom: '1rem',
            background: syncFeedback.type === 'success' ? 'rgba(34, 197, 94, 0.1)' : 'rgba(239, 68, 68, 0.1)',
            color: syncFeedback.type === 'success' ? 'var(--success-color)' : '#ef4444',
            border: `1px solid ${syncFeedback.type === 'success' ? 'rgba(34, 197, 94, 0.2)' : 'rgba(239, 68, 68, 0.2)'}`,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            animation: 'slideDown 0.3s ease'
          }}>
            <span>{syncFeedback.message}</span>
            <button onClick={() => setSyncFeedback({ type: null, message: "" })} style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', fontSize: '0.8rem' }}>✕</button>
          </div>
        )}

        <div style={{ flex: 1, overflowY: 'auto' }}>
          {activeTab === 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', paddingRight: '0.5rem' }}>
              {expenses.length > 0 ? expenses.slice(0, 30).map((exp: any, i: number) => (
                <div
                  key={exp.id}
                  onClick={() => setExpandedCategory(exp.category)}
                  title={`See all ${exp.category} spend`}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '1rem',
                    padding: '0.75rem',
                    background: 'var(--bg-secondary)',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--border-color)',
                    animation: `slideLeft 0.3s ease forwards ${i * 50}ms`,
                    opacity: 0,
                    transform: 'translateX(20px)',
                    cursor: 'pointer',
                    transition: 'transform 0.15s ease, box-shadow 0.15s ease'
                  }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.transform = 'translateX(0) scale(1.01)'; (e.currentTarget as HTMLDivElement).style.boxShadow = '0 4px 12px rgba(99,102,241,0.15)'; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.transform = 'translateX(0) scale(1)'; (e.currentTarget as HTMLDivElement).style.boxShadow = 'none'; }}
                >
                  <div style={{ 
                    width: '32px', 
                    height: '32px', 
                    borderRadius: '8px', 
                    background: CATEGORY_COLORS[exp.category] + '20' || 'rgba(34, 197, 94, 0.1)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '1rem'
                  }}>
                    {exp.category === 'Food' ? '🍕' : 
                     exp.category === 'Shopping' ? '🛍️' : 
                     exp.category === 'Travel' ? '🚕' : 
                     exp.category === 'Entertainment' ? '🍿' :
                     exp.category === 'Investment' ? '📈' :
                     exp.category === 'Health' ? '⚕️' : '📑'}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--text-primary)' }}>{exp.merchant}</div>
                    <div style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{exp.category} • {new Date(exp.date).toLocaleDateString()}</div>
                  </div>
                  <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>₹{exp.amount}</div>
                </div>
              )) : (
                <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)', fontSize: '0.8rem', fontStyle: 'italic', border: '1px dashed var(--border-color)', borderRadius: 'var(--radius-md)' }}>
                  No transactions detected.
                </div>
              )}
            </div>
          )}

          {activeTab === 1 && (
            <div style={{ width: '100%', height: '240px', position: 'relative' }}>
              <div style={{ position: 'absolute', top: '-5px', right: '5px', zIndex: 10 }}>
                <select 
                  value={pieMonthOffset} 
                  onChange={e => setPieMonthOffset(Number(e.target.value))}
                  style={{
                    background: 'var(--bg-secondary)',
                    color: 'var(--text-primary)',
                    border: '1px solid var(--border-color)',
                    padding: '4px 8px',
                    borderRadius: '6px',
                    fontSize: '0.7rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    outline: 'none'
                  }}
                >
                  {Array.from({ length: 4 }).map((_, i) => {
                    const d = new Date();
                    d.setMonth(d.getMonth() - i);
                    const label = i === 0 ? "This Month" : i === 1 ? "Last Month" : d.toLocaleString('default', { month: 'short', year: 'numeric' });
                    return <option key={i} value={i}>{label}</option>;
                  })}
                </select>
              </div>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={categoryData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={80}
                    paddingAngle={5}
                    dataKey="value"
                    animationBegin={0}
                    animationDuration={800}
                    // Recharts hands the slice payload to onClick — we read
                    // .name (the category) rather than passing the whole
                    // object so the modal selector stays a plain string.
                    onClick={(slice: any) => {
                      const name = slice?.name || slice?.payload?.name;
                      if (name) setExpandedCategory(name);
                    }}
                    style={{ cursor: 'pointer', outline: 'none' }}
                  >
                    {categoryData.map((entry, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={CATEGORY_COLORS[entry.name] || '#64748b'}
                        style={{ cursor: 'pointer', outline: 'none' }}
                      />
                    ))}
                  </Pie>
                  <RechartsTooltip
                    // pointerEvents:none lets the mouse "pass through" the
                    // tooltip to the slice beneath it. Without this the
                    // tooltip itself intercepts hover, briefly hides, then
                    // re-shows — which reads as a jittery overlap when you
                    // drag the cursor across the pie. offset bumps the
                    // tooltip away from the cursor so the box sits off the
                    // slice instead of on top of it.
                    wrapperStyle={{ pointerEvents: 'none', zIndex: 50, outline: 'none' }}
                    offset={24}
                    allowEscapeViewBox={{ x: false, y: false }}
                    content={({ active, payload }: any) => {
                      if (active && payload && payload.length) {
                        const total = categoryData.reduce((s: number, e: any) => s + e.value, 0);
                        const value = payload[0].value;
                        const percent = total > 0 ? ((value / total) * 100).toFixed(1) : 0;
                        return (
                          <div style={{
                            background: 'var(--bg-primary, #fff)',
                            border: '1px solid var(--border-color)',
                            padding: '10px 12px',
                            borderRadius: '12px',
                            boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
                            minWidth: '130px',
                            pointerEvents: 'none'
                          }}>
                            <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', fontWeight: 700, textTransform: 'uppercase', marginBottom: '4px' }}>{payload[0].name}</div>
                            <div style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--text-primary)' }}>₹{value.toLocaleString()}</div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--accent-color)', fontWeight: 700, marginTop: '2px' }}>{percent}% of Spend</div>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', textAlign: 'center', pointerEvents: 'none' }}>
                <span style={{ fontSize: '0.6rem', color: 'var(--text-secondary)', fontWeight: 700, textTransform: 'uppercase' }}>Total Spent</span>
                <div style={{ fontSize: '1.1rem', fontWeight: 800 }}>₹{categoryData.reduce((s: number, e: any) => s + e.value, 0).toLocaleString()}</div>
              </div>
              <div style={{ marginTop: '0.4rem', textAlign: 'center', fontSize: '0.65rem', color: 'var(--text-secondary)', fontWeight: 600, opacity: 0.75 }}>
                💡 Tap a slice to break down that category
              </div>
            </div>
          )}

          {activeTab === 2 && (
            <div style={{ width: '100%', height: '240px' }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthlyData} margin={{ top: 20, right: 10, left: 10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.05)" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: 'var(--text-secondary)', fontWeight: 600 }} />
                  <RechartsTooltip 
                    cursor={{ fill: 'rgba(255,255,255,0.05)' }} 
                    contentStyle={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '8px', fontSize: '0.8rem' }}
                    formatter={(value: any) => [`₹${Number(value).toLocaleString()}`, 'Expenses']}
                  />
                  <Bar dataKey="total" radius={[6, 6, 0, 0]}>
                    {monthlyData.map((entry, index) => (
                       <BarCell key={`cell-${index}`} fill={index === 2 ? 'var(--accent-color)' : 'rgba(99, 102, 241, 0.3)'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              <div style={{ marginTop: '0.5rem', textAlign: 'center', fontSize: '0.7rem', color: 'var(--text-secondary)', fontWeight: 600 }}>
                 Burn rate comparison for last 3 cycles
              </div>
            </div>
          )}
        </div>
        
        <div style={{ marginTop: '1rem', fontSize: '0.6rem', color: 'var(--text-secondary)', display: 'flex', justifyContent: 'center', gap: '1rem', opacity: 0.5 }}>
           <span>💡 Use Arrow Keys to switch views</span>
        </div>
      </div>

      {/* Goal Tracker */}
      <div className="bento-item goals-area glass-panel animate-scale-in delay-300">
        <h3 style={{ fontSize: '1.25rem', marginBottom: '1.5rem' }}>🎯 Goal Milestones</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem', fontSize: '0.85rem' }}>
              <span>🏍️ Triumph Speed 400</span>
              <span style={{ fontWeight: 700 }}>45%</span>
            </div>
            <div style={{ width: '100%', height: '8px', background: 'var(--bg-secondary)', borderRadius: '10px', overflow: 'hidden' }}>
              <div style={{ width: '45%', height: '100%', background: 'var(--accent-color)' }}></div>
            </div>
          </div>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem', fontSize: '0.85rem' }}>
              <span>🎮 PS5</span>
              <span style={{ fontWeight: 700 }}>60%</span>
            </div>
            <div style={{ width: '100%', height: '8px', background: 'var(--bg-secondary)', borderRadius: '10px', overflow: 'hidden' }}>
              <div style={{ width: '60%', height: '100%', background: 'var(--success-color)' }}></div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Category Detail Modal ─────────────────────────────────────────
          Opens when expandedCategory is set (via pie slice click or list-row
          click). Click on the backdrop closes; ESC close is handled by the
          tabIndex+onKeyDown on the inner panel. */}
      {expandedCategory && expandedData && (
        <div
          onClick={() => setExpandedCategory(null)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 17, 26, 0.55)',
            backdropFilter: 'blur(4px)',
            zIndex: 5000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1rem',
            animation: 'fadeIn 0.2s ease'
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            tabIndex={-1}
            onKeyDown={(e) => { if (e.key === 'Escape') setExpandedCategory(null); }}
            style={{
              width: '100%',
              maxWidth: '560px',
              maxHeight: '85vh',
              background: 'var(--bg-primary, #fff)',
              borderRadius: 'var(--radius-lg)',
              border: '1px solid var(--border-color)',
              boxShadow: '0 24px 60px rgba(0,0,0,0.35)',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
              animation: 'scaleIn 0.2s cubic-bezier(0.4, 0, 0.2, 1)'
            }}
          >
            {/* Header */}
            <div style={{
              padding: '1.25rem 1.5rem',
              borderBottom: '1px solid var(--border-color)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '1rem',
              background: `linear-gradient(135deg, ${(CATEGORY_COLORS[expandedCategory] || '#6366f1')}18 0%, transparent 100%)`
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem', minWidth: 0 }}>
                <div style={{
                  width: '44px',
                  height: '44px',
                  borderRadius: '12px',
                  background: (CATEGORY_COLORS[expandedCategory] || '#6366f1') + '22',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '1.5rem',
                  flexShrink: 0
                }}>
                  {expandedCategory === 'Food' ? '🍕' :
                   expandedCategory === 'Shopping' ? '🛍️' :
                   expandedCategory === 'Travel' ? '🚕' :
                   expandedCategory === 'Entertainment' ? '🍿' :
                   expandedCategory === 'Investment' ? '📈' :
                   expandedCategory === 'Health' ? '⚕️' :
                   expandedCategory === 'Bills' ? '🧾' : '📑'}
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--text-primary)' }}>{expandedCategory}</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 600 }}>
                    {expandedData.count} transaction{expandedData.count === 1 ? '' : 's'} • {expandedData.pctOfSpend.toFixed(1)}% of total spend
                  </div>
                </div>
              </div>
              <button
                onClick={() => setExpandedCategory(null)}
                aria-label="Close"
                style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '8px',
                  border: '1px solid var(--border-color)',
                  background: 'var(--bg-secondary)',
                  color: 'var(--text-secondary)',
                  fontSize: '1rem',
                  cursor: 'pointer',
                  flexShrink: 0
                }}
              >✕</button>
            </div>

            {/* Stat Tiles */}
            <div style={{ padding: '1.25rem 1.5rem 0.5rem', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.75rem' }}>
              <div style={{ padding: '0.75rem', background: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
                <div style={{ fontSize: '0.6rem', color: 'var(--text-secondary)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total</div>
                <div style={{ fontSize: '1.15rem', fontWeight: 800, marginTop: '4px' }}>₹{expandedData.total.toLocaleString()}</div>
              </div>
              <div style={{ padding: '0.75rem', background: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
                <div style={{ fontSize: '0.6rem', color: 'var(--text-secondary)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Avg / txn</div>
                <div style={{ fontSize: '1.15rem', fontWeight: 800, marginTop: '4px' }}>₹{Math.round(expandedData.avg).toLocaleString()}</div>
              </div>
              <div style={{ padding: '0.75rem', background: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
                <div style={{ fontSize: '0.6rem', color: 'var(--text-secondary)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Largest</div>
                <div style={{ fontSize: '1.15rem', fontWeight: 800, marginTop: '4px' }}>₹{expandedData.largest.amount.toLocaleString()}</div>
              </div>
            </div>

            {/* Insights */}
            <div style={{ padding: '0.75rem 1.5rem 0.5rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <div style={{ fontSize: '0.6rem', color: 'var(--text-secondary)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Insights</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                {expandedData.momChange !== null && (
                  <span style={{
                    fontSize: '0.72rem',
                    padding: '5px 10px',
                    borderRadius: '999px',
                    fontWeight: 700,
                    background: expandedData.momChange >= 0 ? 'rgba(239, 68, 68, 0.1)' : 'rgba(34, 197, 94, 0.1)',
                    color: expandedData.momChange >= 0 ? '#ef4444' : 'var(--success-color)',
                    border: `1px solid ${expandedData.momChange >= 0 ? 'rgba(239, 68, 68, 0.2)' : 'rgba(34, 197, 94, 0.2)'}`
                  }}>
                    {expandedData.momChange >= 0 ? '↑' : '↓'} {Math.abs(expandedData.momChange).toFixed(0)}% vs last month
                  </span>
                )}
                {expandedData.topMerchant && (
                  <span style={{ fontSize: '0.72rem', padding: '5px 10px', borderRadius: '999px', fontWeight: 700, background: 'rgba(99, 102, 241, 0.1)', color: 'var(--accent-color)', border: '1px solid rgba(99, 102, 241, 0.2)' }}>
                    🏆 Top: {expandedData.topMerchant.name} ({expandedData.topMerchant.visits}×)
                  </span>
                )}
                <span style={{ fontSize: '0.72rem', padding: '5px 10px', borderRadius: '999px', fontWeight: 700, background: 'var(--bg-secondary)', color: 'var(--text-secondary)', border: '1px solid var(--border-color)' }}>
                  ⏱ Last spend {expandedData.daysSinceLast === 0 ? 'today' : `${expandedData.daysSinceLast}d ago`}
                </span>
                <span style={{ fontSize: '0.72rem', padding: '5px 10px', borderRadius: '999px', fontWeight: 700, background: 'var(--bg-secondary)', color: 'var(--text-secondary)', border: '1px solid var(--border-color)' }}>
                  💸 This month ₹{expandedData.currentMonthTotal.toLocaleString()}
                </span>
              </div>
            </div>

            {/* Transaction list */}
            <div style={{ padding: '0.75rem 1.5rem 0.25rem', fontSize: '0.6rem', color: 'var(--text-secondary)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              All transactions ({expandedData.count})
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '0 1.5rem 1.25rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {expandedData.items.map((tx: any) => (
                <div key={tx.id} style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '0.7rem 0.85rem',
                  background: 'var(--bg-secondary)',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--border-color)'
                }}>
                  <div style={{ minWidth: 0, marginRight: '0.75rem' }}>
                    <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{tx.merchant}</div>
                    <div style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', fontWeight: 600 }}>
                      {new Date(tx.date).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}
                    </div>
                  </div>
                  <div style={{ fontSize: '0.95rem', fontWeight: 800, color: 'var(--text-primary)', flexShrink: 0 }}>₹{tx.amount.toLocaleString()}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <style jsx>{`
        .finance-grid {
          display: grid;
          /* Adjusted ratios: Giving more width to Goal Milestones (1.3fr) and 
             reducing Expense Intelligence (2.1fr). Row 2 height reduced 
             to 410px as requested. */
          grid-template-columns: 2.1fr 1.3fr 2fr;
          grid-template-rows: auto 410px;
          grid-template-areas:
            "wealth wealth market"
            "sub goals market";
          gap: 2rem;
        }

        .wealth-area { grid-area: wealth; }
        .market-area { grid-area: market; }
        .sub-area { grid-area: sub; }
        .goals-area { grid-area: goals; }

        @keyframes slideLeft {
          from { opacity: 0; transform: translateX(20px); }
          to { opacity: 1; transform: translateX(0); }
        }

        @media (max-width: 1200px) {
          .finance-grid {
            grid-template-columns: repeat(2, 1fr);
            grid-template-areas: 
              "wealth wealth"
              "market sub"
              "market goals";
          }
        }

        @media (max-width: 768px) {
          .finance-grid {
            grid-template-columns: 1fr;
            grid-template-areas: 
              "wealth"
              "market"
              "sub"
              "goals";
          }
        }
      `}</style>
    </div>
  );
}

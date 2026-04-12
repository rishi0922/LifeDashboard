"use client";

import React, { useState, useEffect } from 'react';

export function FinanceGrid() {
  const [data, setData] = useState<any>(null);
  const [market, setMarket] = useState<any[]>([]);
  const [expenses, setExpenses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastSync, setLastSync] = useState<string>("");
  const [isMarketOpen, setIsMarketOpen] = useState(true);
  const [syncFeedback, setSyncFeedback] = useState<{ type: 'success' | 'error' | null, message: string }>({ type: null, message: "" });

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
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <h2 style={{ fontSize: '1.5rem', margin: 0 }}>💰 Wealth Canvas</h2>
          <span style={{ fontSize: '0.7rem', background: 'rgba(34, 197, 94, 0.1)', color: 'var(--success-color)', padding: '4px 10px', borderRadius: '12px', fontWeight: 800 }}>GROWW LIVE</span>
        </div>
        
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
          {/* Equity Side */}
          <div style={{ padding: '1.25rem', background: 'rgba(99, 102, 241, 0.05)', borderRadius: 'var(--radius-lg)', border: '1px solid rgba(99, 102, 241, 0.1)' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>EQUITY PULSE (50%)</span>
            <div style={{ fontSize: '1.75rem', fontWeight: 800, marginTop: '0.5rem' }}>₹{ (data?.stocks?.value / 100000).toFixed(2) } L</div>
            <div style={{ fontSize: '0.8rem', color: 'var(--success-color)', fontWeight: 600 }}>{data?.stocks?.holdings?.length} Active Holdings</div>
            
            <div style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
               {data?.stocks?.holdings?.slice(0, 2).map((h: any) => (
                 <div key={h.symbol} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem' }}>
                   <span>{h.symbol}</span>
                   <span style={{ fontWeight: 600 }}>{h.change}</span>
                 </div>
               ))}
            </div>
          </div>

          {/* Mutual Fund Side */}
          <div style={{ padding: '1.25rem', background: 'rgba(34, 197, 94, 0.05)', borderRadius: 'var(--radius-lg)', border: '1px solid rgba(34, 197, 94, 0.1)' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>MF PULSE (50%)</span>
            <div style={{ fontSize: '1.75rem', fontWeight: 800, marginTop: '0.5rem' }}>₹{ (data?.mutualFunds?.value / 100000).toFixed(2) } L</div>
            <div style={{ fontSize: '0.8rem', color: 'var(--accent-color)', fontWeight: 600 }}>{data?.mutualFunds?.funds?.length} active Portfolios</div>

            <div style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
               {data?.mutualFunds?.funds?.slice(0, 2).map((f: any) => (
                 <div key={f.name} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem' }}>
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

      {/* Expense Intelligence (Gmail Synced Ledger) */}
      <div className="bento-item sub-area glass-panel animate-scale-in delay-200" style={{ display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <h3 style={{ fontSize: '1.25rem', margin: 0 }}>📊 Expense Intelligence</h3>
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
                  // Clear success message after 5s
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
            {loading ? 'SYNCING...' : '✨ SYNC GMAIL'}
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

        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '1rem', paddingRight: '0.5rem' }}>
          {expenses.length > 0 ? expenses.map((exp: any, i: number) => (
            <div key={exp.id} style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: '1rem', 
              padding: '0.75rem', 
              background: 'var(--bg-secondary)', 
              borderRadius: 'var(--radius-md)', 
              border: '1px solid var(--border-color)',
              animation: `slideLeft 0.3s ease forwards ${i * 50}ms`,
              opacity: 0,
              transform: 'translateX(20px)'
            }}>
              <div style={{ 
                width: '32px', 
                height: '32px', 
                borderRadius: '8px', 
                background: exp.category === 'Food' ? 'rgba(239, 68, 68, 0.1)' : exp.category === 'Shopping' ? 'rgba(99, 102, 241, 0.1)' : 'rgba(34, 197, 94, 0.1)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '1rem'
              }}>
                {exp.category === 'Food' ? '🍕' : exp.category === 'Shopping' ? '🛍️' : exp.category === 'Travel' ? '🚕' : '📑'}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--text-primary)' }}>{exp.merchant}</div>
                <div style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{exp.category} • {new Date(exp.date).toLocaleDateString()}</div>
              </div>
              <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>₹{exp.amount}</div>
            </div>
          )) : (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)', fontSize: '0.8rem', fontStyle: 'italic', border: '1px dashed var(--border-color)', borderRadius: 'var(--radius-md)' }}>
              No transactions detected this week.
            </div>
          )}
        </div>
      </div>

      {/* Goal Tracker */}
      <div className="bento-item goals-area glass-panel animate-scale-in delay-300">
        <h3 style={{ fontSize: '1.25rem', marginBottom: '1.5rem' }}>🎯 Goal Milestones</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem', fontSize: '0.85rem' }}>
              <span>Dream Home</span>
              <span style={{ fontWeight: 700 }}>65%</span>
            </div>
            <div style={{ width: '100%', height: '8px', background: 'var(--bg-secondary)', borderRadius: '10px', overflow: 'hidden' }}>
              <div style={{ width: '65%', height: '100%', background: 'var(--accent-color)' }}></div>
            </div>
          </div>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem', fontSize: '0.85rem' }}>
              <span>Retirement Core</span>
              <span style={{ fontWeight: 700 }}>42%</span>
            </div>
            <div style={{ width: '100%', height: '8px', background: 'var(--bg-secondary)', borderRadius: '10px', overflow: 'hidden' }}>
              <div style={{ width: '42%', height: '100%', background: 'var(--success-color)' }}></div>
            </div>
          </div>
        </div>
      </div>

      <style jsx>{`
        .finance-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          grid-template-rows: auto 300px;
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

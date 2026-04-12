"use client";

import { useState, useEffect } from "react";

interface FoodOrder {
  id: string;
  restaurant: string;
  items: string;
  cost: number;
  status: string;
  etaMinutes: number | null;
  createdAt: string;
}

export function FoodOrdersWidget() {
  const [orders, setOrders] = useState<FoodOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [isLinked, setIsLinked] = useState(false);
  const [syncFrequency, setSyncFrequency] = useState(120000); // Default 2 min

  const fetchOrders = async () => {
    try {
      const res = await fetch("/api/food");
      if (res.ok) {
        const data = await res.json();
        
        // Resilience: Handle both {orders, isLinked} and legacy array formats
        const orderList = Array.isArray(data) ? data : (data.orders || []);
        const linkedStatus = Array.isArray(data) ? data.some((o: any) => o.source === "Zomato") : !!data.isLinked;
        
        setOrders(orderList);
        setIsLinked(linkedStatus);
        
        const hasActive = orderList.some((o: any) => o.status !== "Delivered");
        setSyncFrequency(hasActive ? 30000 : 120000);
      }
    } catch (err) {
      console.error("Failed to fetch food orders", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrders();
    // Adaptive sync logic
    const interval = setInterval(fetchOrders, syncFrequency);
    window.addEventListener("refreshFood", fetchOrders);
    return () => {
      clearInterval(interval);
      window.removeEventListener("refreshFood", fetchOrders);
    };
  }, [syncFrequency]);

  const activeOrders = orders.filter(o => o.status !== "Delivered");
  const pastOrders = orders.filter(o => o.status === "Delivered").slice(0, 3);

  return (
    <div className="glass-panel h-full" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          <span style={{ fontSize: '1.5rem' }}>🍔</span> Food Intelligence
        </h3>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          {!isLinked && !loading && (
            <button 
              onClick={() => window.open('/api/food/auth', '_blank')}
              style={{
                background: '#eb3538',
                color: '#fff',
                border: 'none',
                padding: '4px 12px',
                borderRadius: '8px',
                fontSize: '0.65rem',
                fontWeight: 800,
                cursor: 'pointer',
                boxShadow: '0 4px 12px rgba(235, 53, 56, 0.3)'
              }}
            >
              LINK ZOMATO
            </button>
          )}
          {isLinked && (
            <span className="badge-pulse" style={{ 
              background: 'rgba(235, 53, 56, 0.1)', 
              color: '#eb3538', 
              fontSize: '0.65rem', 
              padding: '2px 8px', 
              borderRadius: '12px',
              fontWeight: 800,
              border: '1px solid rgba(235, 53, 56, 0.2)',
              letterSpacing: '0.5px'
            }}>
              LIVE SYNC
            </span>
          )}
          {activeOrders.length > 0 && (
            <span className="badge" style={{ 
              background: 'var(--warning-color)', 
              color: '#fff', 
              fontSize: '0.75rem', 
              padding: '2px 8px', 
              borderRadius: '12px',
              fontWeight: 600
            }}>
              {activeOrders.length} ACTIVE
            </span>
          )}
        </div>
      </div>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '1rem', overflowY: 'auto', paddingRight: '4px', position: 'relative' }}>
        {loading ? (
          <div className="animate-pulse" style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Synchronizing with MCP...</div>
        ) : !isLinked && activeOrders.length === 0 && pastOrders.length === 0 ? (
          <div style={{ 
            height: '100%', 
            display: 'flex', 
            flexDirection: 'column', 
            justifyContent: 'center', 
            alignItems: 'center', 
            textAlign: 'center',
            padding: '1.5rem',
            background: 'rgba(255,255,255,0.02)',
            borderRadius: 'var(--radius-md)',
            border: '1px dashed var(--border-color)'
          }}>
            <div style={{ fontSize: '2rem', marginBottom: '1rem' }}>🤖</div>
            <h4 style={{ margin: '0 0 0.5rem 0', fontSize: '1rem' }}>Setup Intelligence</h4>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '1.5rem' }}>
              Connect your Zomato account to enable autonomous tracking and AI suggestions.
            </p>
            <div style={{ display: 'grid', gap: '0.75rem', width: '100%', maxWidth: '240px' }}>
              <button 
                onClick={() => window.open('/api/food/auth', '_blank')}
                className="btn-primary" 
                style={{ width: '100%', fontSize: '0.8rem', padding: '10px' }}
              >
                1. Link Zomato Account
              </button>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.5rem', justifyContent: 'center' }}>
                <span style={{ width: '12px', height: '12px', borderRadius: '50%', border: '1px solid var(--border-color)' }}></span>
                2. Calibrate Preferences
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.5rem', justifyContent: 'center' }}>
                <span style={{ width: '12px', height: '12px', borderRadius: '50%', border: '1px solid var(--border-color)' }}></span>
                3. Go Live (Silent Sync)
              </div>
            </div>
          </div>
        ) : activeOrders.length === 0 && pastOrders.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '2rem 0', color: 'var(--text-secondary)' }}>
            <div style={{ fontSize: '2.5rem', marginBottom: '1rem', opacity: 0.5 }}>🍽️</div>
            <p style={{ fontSize: '0.9rem' }}>Hungry? Ask AI to order your favorite!</p>
          </div>
        ) : (
          <>
            {/* Active Orders */}
            {activeOrders.map(order => (
              <div key={order.id} className="active-order-card" style={{
                background: (order as any).source === "Zomato" ? 'rgba(235, 53, 56, 0.05)' : 'rgba(255, 149, 0, 0.1)',
                border: (order as any).source === "Zomato" ? '1px solid rgba(235, 53, 56, 0.1)' : '1px solid rgba(255, 149, 0, 0.2)',
                borderRadius: 'var(--radius-md)',
                padding: '1rem',
                position: 'relative',
                overflow: 'hidden'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span style={{ fontWeight: 600, fontSize: '0.95rem' }}>{order.restaurant}</span>
                    {(order as any).source === "Zomato" && <span style={{ fontSize: '0.8rem' }}>🔴</span>}
                  </div>
                  <span style={{ 
                    fontSize: '0.85rem', 
                    fontWeight: 700, 
                    color: (order.etaMinutes !== null && order.etaMinutes <= 2) ? 'var(--danger-color)' : (order as any).source === "Zomato" ? '#eb3538' : 'var(--warning-color)',
                    animation: (order.etaMinutes !== null && order.etaMinutes <= 2) ? 'pulse 1s infinite' : 'none'
                  }}>
                    {order.status === "On the Way" ? `ETA: ${order.etaMinutes}m` : order.status}
                  </span>
                </div>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.75rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {order.items}
                </p>
                
                {/* Progress Bar */}
                <div style={{ 
                  height: '4px', 
                  background: 'rgba(0,0,0,0.05)', 
                  borderRadius: '2px',
                  position: 'relative'
                }}>
                  <div style={{ 
                    height: '100%', 
                    background: (order as any).source === "Zomato" ? '#eb3538' : 'var(--warning-color)', 
                    borderRadius: '2px',
                    width: order.status === "Preparing" ? '30%' : '70%',
                    transition: 'width 1s ease'
                  }} />
                </div>

                {order.etaMinutes !== null && order.etaMinutes <= 2 && (
                  <div style={{ 
                    marginTop: '0.75rem', 
                    fontSize: '0.75rem', 
                    background: 'var(--danger-color)', 
                    color: '#fff', 
                    padding: '4px 8px', 
                    borderRadius: '4px',
                    textAlign: 'center',
                    fontWeight: 600
                  }}>
                    🚀 Almost here! Get ready to receive.
                  </div>
                )}
              </div>
            ))}

            {/* History Header */}
            {pastOrders.length > 0 && (
              <h4 style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '0.5rem', marginBottom: '0.25rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Recent Deliveries
              </h4>
            )}

            {/* Past Orders */}
            {pastOrders.map(order => (
              <div key={order.id} style={{ 
                display: 'flex', 
                justifyContent: 'space-between', 
                alignItems: 'center',
                padding: '0.5rem 0',
                borderBottom: '1px solid var(--border-color)',
                fontSize: '0.85rem'
              }}>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <span style={{ fontWeight: 500 }}>{order.restaurant}</span>
                    {(order as any).source === "Zomato" && <span style={{ fontSize: '0.65rem', opacity: 0.6 }}>Zomato</span>}
                  </div>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{new Date(order.createdAt).toLocaleDateString()}</span>
                </div>
                <span style={{ fontWeight: 600 }}>${order.cost.toFixed(2)}</span>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}

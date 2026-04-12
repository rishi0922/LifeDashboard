"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";

type CalendarEvent = {
  id: string;
  summary: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
};

export function CalendarWidget() {
  const { data: session, status } = useSession();
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [newTitle, setNewTitle] = useState("");
  const [isAdding, setIsAdding] = useState(false);
  const [syncStatus, setSyncStatus] = useState<"synced" | "error" | "loading">("loading");
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState(new Date());

  const playNotification = () => {
    // Simple notification sound using an Oscillator (no external files needed)
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const oscillator = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();

      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(880, audioCtx.currentTime); // High A
      gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.5);

      oscillator.connect(gainNode);
      gainNode.connect(audioCtx.destination);

      oscillator.start();
      oscillator.stop(audioCtx.currentTime + 0.5);
    } catch (e) {
      console.warn("Audio Context error", e);
    }
  };

  const fetchEvents = async (targetDate: Date = selectedDate) => {
    setSyncStatus("loading");
    const dateStr = targetDate.toISOString().split('T')[0];
    try {
      const res = await fetch(`/api/calendar?date=${dateStr}`);
      const data = await res.json();

      if (res.status === 401) {
        setSyncStatus('error');
        setEvents([]);
        setLoading(false);
        return;
      }

      if (!res.ok) throw new Error(data.details || "Failed to fetch");
        
        // Detect new events for notification (only for TODAY)
        const isToday = new Date().toISOString().split('T')[0] === dateStr;
        if (isToday && events.length > 0 && data.events && data.events.length > events.length) {
          const currentIds = new Set(events.map(e => e.id));
          const hasNew = data.events.some((e: any) => !currentIds.has(e.id));
          if (hasNew) playNotification();
        }

        if (data.events) setEvents(data.events);
        setSyncStatus("synced");
        setLastUpdated(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
        setLoading(false);
      } catch (err) {
        console.error("Sync Error:", err);
        // If the fetch fails with a network error or similar, but the session is still active
        setSyncStatus("error");
        setLoading(false);
      }
  };

  // Proactive Session Check
  useEffect(() => {
    //@ts-ignore
    if (session?.error === "RefreshAccessTokenError") {
      setSyncStatus("error");
    }
  }, [session]);

  useEffect(() => {
    if (status === "authenticated") {
      fetchEvents(selectedDate);
      
      const handleSync = () => fetchEvents(selectedDate);
      window.addEventListener('refreshCalendar', handleSync);
      
      // Fixed 60-second background heartbeat
      const pollId = setInterval(() => fetchEvents(selectedDate), 60000);
      
      return () => {
        window.removeEventListener('refreshCalendar', handleSync);
        clearInterval(pollId);
      };
    } else {
      setLoading(false);
    }
  }, [status, selectedDate]);

  const changeDate = (days: number) => {
    const next = new Date(selectedDate);
    next.setDate(next.getDate() + days);
    setSelectedDate(next);
  };

  const goToToday = () => {
    setSelectedDate(new Date());
  };

  const handleQuickAdd = async (eOrMins: React.FormEvent | number) => {
    if (typeof eOrMins !== 'number') eOrMins.preventDefault();
    if (!newTitle.trim()) return;
    setIsAdding(true);

    const mins = typeof eOrMins === 'number' ? eOrMins : 30;

    try {
      // Dynamic Scheduling: Current Time + Selected Delay
      const startTime = new Date();
      startTime.setMinutes(startTime.getMinutes() + mins);
      
      const endTime = new Date(startTime);
      endTime.setMinutes(endTime.getMinutes() + 30); // 30 min duration

      const response = await fetch('/api/calendar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          summary: newTitle,
          startTime: startTime.toISOString(),
          endTime: endTime.toISOString()
        })
      });
      if (response.ok) {
        setNewTitle("");
        fetchEvents(selectedDate);
      } else {
         alert("Failed to add event. Check Calendar permissions!");
      }
    } catch (err) {
      console.error(err);
    }
    setIsAdding(false);
  };

  const deleteEvent = async (id: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      await fetch(`/api/calendar?eventId=${id}`, { method: 'DELETE' });
      fetchEvents(selectedDate);
    } catch (e) {
      console.error("Failed to delete event", e);
    }
  };

  const isToday = new Date().toDateString() === selectedDate.toDateString();

  return (
    <div className="glass-panel" style={{ height: '475px', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <h2 style={{ fontSize: '1.25rem', margin: 0, display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          📅 Timeline
        </h2>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div style={{ 
            fontSize: '0.7rem', 
            fontWeight: 700, 
            color: syncStatus === 'synced' ? '#10b981' : syncStatus === 'error' ? '#ef4444' : 'var(--text-secondary)',
            display: 'flex',
            alignItems: 'center',
            gap: '4px'
          }}>
            <span style={{ 
              width: '6px', 
              height: '6px', 
              borderRadius: '50%', 
              background: syncStatus === 'synced' ? '#10b981' : syncStatus === 'error' ? '#ef4444' : 'var(--text-secondary)',
            }} className={syncStatus === 'loading' ? 'animate-pulse' : ''}></span>
            {syncStatus === 'synced' ? `UPDATED ${lastUpdated}` : syncStatus === 'loading' ? 'SYNCING...' : 'SYNC ERROR'}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', background: 'var(--bg-secondary)', padding: '0.2rem', borderRadius: 'var(--radius-xl)', border: '1px solid var(--border-color)' }}>
            <button onClick={goToToday} style={{ 
              padding: '0.4rem 0.8rem', 
              fontSize: '0.75rem', 
              fontWeight: 800, 
              background: isToday ? 'var(--accent-color)' : 'var(--bg-secondary)',
              color: isToday ? '#fff' : 'var(--text-primary)',
              border: isToday ? '1px solid var(--accent-color)' : '1px solid var(--border-color)',
              borderRadius: 'var(--radius-xl)',
              cursor: 'pointer',
              boxShadow: isToday ? '0 2px 8px rgba(99, 102, 241, 0.3)' : 'none',
              transition: 'all 0.2s ease'
            }}>
              TODAY
            </button>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
              <button 
                onClick={() => changeDate(-1)} 
                className="btn-icon" 
                style={{ padding: '0', width: '32px', height: '32px', fontSize: '1.25rem', fontWeight: 900, border: '1px solid var(--border-color)' }}
              >
                ‹
              </button>
              
              <span style={{ 
                background: 'var(--bg-secondary)', 
                padding: '0.45rem 1rem', 
                borderRadius: 'var(--radius-xl)', 
                border: '1px solid var(--border-color)',
                fontSize: '0.85rem',
                fontWeight: 700,
                minWidth: '110px',
                textAlign: 'center',
                color: 'var(--text-primary)'
              }}>
                {selectedDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
              </span>

              <button 
                onClick={() => changeDate(1)} 
                className="btn-icon" 
                style={{ padding: '0', width: '32px', height: '32px', fontSize: '1.25rem', fontWeight: 900, border: '1px solid var(--border-color)' }}
              >
                ›
              </button>
            </div>
          </div>
        </div>
      </div>

      {syncStatus === 'error' && (
        <div style={{ 
          background: 'rgba(239, 68, 68, 0.1)', 
          padding: '0.75rem', 
          borderRadius: 'var(--radius-md)', 
          marginBottom: '1rem',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          animation: 'slideDown 0.3s ease'
        }}>
          <span style={{ fontSize: '0.85rem', color: '#ef4444', fontWeight: 500 }}>
            {/* @ts-ignore */}
            {session?.error === "RefreshAccessTokenError" 
              ? "Critical Session Failure. Please re-authenticate." 
              : "Sync heartbeat lost or session expired."}
          </span>
          <button 
            onClick={() => window.location.href='/api/auth/signin'} 
            className="btn-primary" 
            style={{ padding: '0.3rem 0.75rem', fontSize: '0.75rem', background: '#ef4444', border: 'none', borderRadius: 'var(--radius-md)', cursor: 'pointer' }}
          >
            Relogin Now
          </button>
        </div>
      )}

      {status === "authenticated" && (
        <form onSubmit={(e) => { e.preventDefault(); handleQuickAdd(30); }} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1.5rem' }}>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <input 
              value={newTitle} 
              onChange={e=>setNewTitle(e.target.value)} 
              placeholder="Quick add event..." 
              style={{ 
                flex: 1, 
                padding: '0.65rem 1rem', 
                borderRadius: 'var(--radius-xl)', 
                border: '1px solid var(--border-color)', 
                background: 'var(--bg-primary)',
                color: 'var(--text-primary)',
                outline: 'none'
              }}
            />
          </div>
          
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <span style={{ fontSize: '0.65rem', fontWeight: 800, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Instant Add:</span>
            {[30, 60].map(mins => (
              <button
                key={mins}
                type="button"
                disabled={isAdding || !newTitle.trim()}
                onClick={() => handleQuickAdd(mins as 30 | 60)}
                style={{
                  padding: '0.4rem 1rem',
                  fontSize: '0.7rem',
                  fontWeight: 700,
                  borderRadius: 'var(--radius-xl)',
                  border: '1px solid var(--accent-color)',
                  background: 'rgba(99, 102, 241, 0.1)',
                  color: 'var(--accent-color)',
                  cursor: (isAdding || !newTitle.trim()) ? 'not-allowed' : 'pointer',
                  opacity: (isAdding || !newTitle.trim()) ? 0.5 : 1,
                  transition: 'all 0.2s ease'
                }}
              >
                {isAdding ? '...' : `+${mins}m`}
              </button>
            ))}
          </div>
        </form>
      )}

      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', paddingRight: '0.5rem', position: 'relative' }}>
        {status === "unauthenticated" ? (
          <div style={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)' }}>
            Please sign in to view and edit your calendar.
          </div>
        ) : loading ? (
          <div style={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)' }}>
            Loading events...
          </div>
        ) : events.length === 0 ? (
          <div style={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)' }}>
            No upcoming events today.
          </div>
        ) : (
          <>
            <div style={{ position: 'absolute', left: '10px', top: '10px', bottom: '10px', width: '2px', background: 'var(--border-color)', zIndex: 0 }}></div>
            {events.map((ev, index) => {
              const startTime = ev.start?.dateTime ? new Date(ev.start.dateTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'All Day';
              const isAi = ev.summary?.startsWith('✨');
              
              return (
                <div key={ev.id} className="animate-fade-in" style={{
                  display: 'flex',
                  gap: '1.5rem',
                  marginBottom: '1.5rem',
                  position: 'relative',
                  zIndex: 1,
                  animationDelay: `${index * 50}ms`
                }}>
                  <div style={{ 
                    width: '12px', 
                    height: '12px', 
                    borderRadius: '50%', 
                    background: isAi ? 'var(--accent-color)' : 'var(--accent-color)', 
                    boxShadow: isAi ? `0 0 12px var(--accent-color)` : `0 0 0 4px var(--bg-primary), 0 0 12px var(--accent-color)`,
                    transform: 'translateX(5px)',
                    marginTop: '6px'
                  }}></div>
                  
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.75rem', marginBottom: '0.25rem' }}>
                      <span style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--text-primary)' }}>
                        {ev.start?.dateTime ? new Date(ev.start.dateTime).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit' }) : 'All Day'}
                      </span>
                      {isAi && (
                        <span style={{ fontSize: '0.65rem', background: 'rgba(99, 102, 241, 0.1)', color: 'var(--accent-color)', padding: '1px 6px', borderRadius: '8px', fontWeight: 800 }}>AI SUGGESTION</span>
                      )}
                    </div>
                    <div style={{
                      background: isAi ? 'linear-gradient(135deg, rgba(99, 102, 241, 0.05) 0%, var(--bg-secondary) 100%)' : 'var(--bg-secondary)',
                      padding: '1rem',
                      borderRadius: 'var(--radius-md)',
                      border: '1px solid',
                      borderColor: isAi ? 'rgba(99, 102, 241, 0.2)' : 'var(--border-color)',
                      boxShadow: '0 2px 8px rgba(0,0,0,0.02)',
                      fontWeight: 500,
                      fontSize: '1.05rem',
                      color: 'var(--text-primary)',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center'
                    }}>
                      <span>{ev.summary || "Busy"}</span>
                      {isAi && (
                        <button 
                          onClick={(e) => deleteEvent(ev.id, e)}
                          title="Remove AI Event"
                          style={{ background: 'transparent', border: 'none', color: '#ef4444', opacity: 0.5, cursor: 'pointer', fontSize: '0.8rem' }}
                        >
                          🗑️
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </>
        )}
      </div>
    </div>
  );
}

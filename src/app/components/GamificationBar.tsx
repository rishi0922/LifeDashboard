"use client";

import { useState } from "react";
import { signIn, signOut, useSession } from "next-auth/react";

export function GamificationBar() {
  const { data: session, status } = useSession();
  const [points] = useState(320);
  const [tier] = useState("Gold");
  const [streak] = useState(12);

  return (
    <div style={{ 
      position: 'sticky', 
      top: 0, 
      zIndex: 50, 
      padding: '1rem 3rem',
      background: 'var(--glass-bg)',
      backdropFilter: 'blur(24px)',
      WebkitBackdropFilter: 'blur(24px)',
      borderBottom: '1px solid var(--border-color)',
      marginBottom: '2rem'
    }}>
      <div style={{ 
        maxWidth: '1440px', 
        margin: '0 auto', 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center' 
      }}>
        {status === "unauthenticated" ? (
          <div style={{ display: 'flex', gap: '2rem', alignItems: 'center' }}>
            <span style={{ fontWeight: 600 }}>Command Center</span>
            <button className="btn-primary" onClick={() => signIn("google")} style={{ padding: '0.5rem 1.25rem', borderRadius: 'var(--radius-xl)' }}>
              Sign in with Google
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', gap: '3rem', alignItems: 'center' }}>
            <div className="animate-fade-in delay-100">
              <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-secondary)' }}>Current Tier</span>
              <div style={{ fontWeight: 700, fontSize: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span style={{ color: 'var(--warning-color)' }}>✨</span> {tier}
              </div>
            </div>
            
            <div className="animate-fade-in delay-200">
              <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-secondary)' }}>Weekly Points</span>
              <div style={{ fontWeight: 700, fontSize: '1.1rem' }}>{points} / 500 XP</div>
              {/* Smooth Progress Bar */}
              <div style={{ 
                width: '180px', 
                height: '6px', 
                background: 'var(--border-color)', 
                borderRadius: '3px',
                marginTop: '4px',
                overflow: 'hidden'
              }}>
                <div style={{ 
                  width: `${(points / 500) * 100}%`, 
                  height: '100%', 
                  background: 'linear-gradient(90deg, var(--accent-color), #34c759)',
                  borderRadius: '3px',
                  transition: 'width 1s cubic-bezier(0.16, 1, 0.3, 1)'
                }} />
              </div>
            </div>
          </div>
        )}
        
        <div className="animate-fade-in delay-300" style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
          {status === "authenticated" && (
             <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'center' }}>
               <div style={{ 
                 display: 'flex', 
                 alignItems: 'center', 
                 gap: '0.5rem', 
                 fontWeight: 700, 
                 color: 'var(--warning-color)',
                 background: 'rgba(255, 149, 0, 0.1)',
                 padding: '0.5rem 1rem',
                 borderRadius: 'var(--radius-xl)'
               }}>
                 🔥 {streak} Day Streak
               </div>
               <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 600 }}>
                 <img src={session.user?.image || ""} alt="" style={{ width: 32, height: 32, borderRadius: '50%' }} />
                 {session.user?.name}
               </div>
               <button onClick={() => signOut()} style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', cursor: 'pointer', background: 'none', border: 'none' }}>Logout</button>
             </div>
          )}
        </div>
      </div>
    </div>
  );
}

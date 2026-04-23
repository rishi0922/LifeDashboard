"use client";

import { useState } from "react";

export function NotesPanel() {
  const [note, setNote] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);

  const handleProcessNotes = () => {
    if (!note.trim()) return;
    setIsProcessing(true);
    
    // Dispatch text to the master AI brain
    window.dispatchEvent(new CustomEvent('brainDump', { detail: note }));
    
    setTimeout(() => {
      setIsProcessing(false);
      setNote("");
    }, 500);
  };

  return (
    <div className="glass-panel" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
        <h2 style={{ fontSize: '1.25rem', margin: 0, display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          🧠 Smart Brain
        </h2>
        
        <button 
          onClick={handleProcessNotes}
          className="btn-primary" 
          style={{ 
            padding: '0.5rem 1rem', 
            fontSize: '0.85rem', 
            opacity: note.length > 0 ? 1 : 0, 
            transform: note.length > 0 ? 'scale(1)' : 'scale(0.95)',
            transition: 'all 0.3s ease',
            pointerEvents: note.length > 0 ? 'auto' : 'none'
          }}
          disabled={isProcessing}
        >
          {isProcessing ? '✨ Processing...' : '✨ Extract'}
        </button>
      </div>

      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Type anything here... E.g. 'Meeting with Sarah tomorrow at 10 AM regarding the Q3 presentation.'"
        style={{
          flex: 1,
          width: '100%',
          resize: 'none',
          padding: '1.25rem',
          borderRadius: 'var(--radius-md)',
          border: '1px solid var(--border-color)',
          background: 'var(--bg-secondary)',
          color: 'var(--text-primary)',
          fontFamily: 'var(--font-inter)',
          fontSize: '1.05rem',
          lineHeight: 1.6,
          outline: 'none',
          boxShadow: 'inset 0 4px 12px rgba(0,0,0,0.02)',
          transition: 'all 0.3s ease'
        }}
      />
    </div>
  );
}

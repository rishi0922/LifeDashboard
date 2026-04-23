"use client";

import { useState, useEffect, useRef } from "react";

export function AIChatAssistant() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<{role: string, content: string}[]>([]);
  const messagesRef = useRef(messages);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Load history from LocalStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem('chat_history');
    if (saved) {
      const parsed = JSON.parse(saved);
      setMessages(parsed);
      messagesRef.current = parsed;
    } else {
      const initialMsgs = [
        { role: 'assistant', content: 'Hi! I am your AI productivity assistant. Ask me to schedule a meeting, summarize tasks, or extract reminders from your notes!' }
      ];
      setMessages(initialMsgs);
      messagesRef.current = initialMsgs;
    }
  }, []);

  useEffect(() => {
    messagesRef.current = messages;
    // Save to LocalStorage whenever messages change
    if (messages.length > 0) {
      localStorage.setItem('chat_history', JSON.stringify(messages));
    }
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isLoading]);

  const processInput = async (inputText: string) => {
    if (!inputText.trim()) return;
    
    setMessages(prev => [...prev, { role: 'user', content: inputText }]);
    
    setIsLoading(true);
    
    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: [...messagesRef.current, { role: 'user', content: inputText }] })
      });
      
      const contentType = response.headers.get("content-type");
      let data;
      
      if (contentType && contentType.includes("application/json")) {
        data = await response.json();
      } else {
        const text = await response.text();
        // If it's HTML (likely a 500 error page), show a friendly message instead of the raw code
        if (text.trim().startsWith('<')) {
          throw new Error("I'm having trouble connecting to the Command Center. Please verify the system is running.");
        }
        throw new Error(`Server error: ${text.substring(0, 100)}...`);
      }

      if (!response.ok) {
        throw new Error(data?.details || data?.error || `Server error (${response.status})`);
      }
      
      setMessages(prev => [...prev, data]);
      
      // Notify other components if a mutation took place. We send the IST
      // date of the mutated event along with the signal so CalendarWidget can
      // jump to the right day — otherwise a user asking chat to create a
      // meeting for tomorrow wouldn't see it appear until they manually
      // navigated forward a day.
      if (data.calendarMutated) {
        window.dispatchEvent(new CustomEvent('refreshCalendar', {
          detail: { date: data.calendarMutatedDate ?? null }
        }));
      }
      if (data.tasksMutated) {
        window.dispatchEvent(new Event('refreshTasks'));
        window.dispatchEvent(new Event('refreshGamification'));
      }
      if (data.foodMutated) {
        window.dispatchEvent(new Event('refreshFood'));
      }
      
    } catch (err: any) {
      console.error("Chat Error:", err);
      // True native fetch failures are TypeError with a message like
      // "Failed to fetch" or "NetworkError when attempting to fetch
      // resource". Matching on the TypeError instance (or "Failed to fetch"
      // specifically) avoids flagging a server-side error that just happens
      // to contain the word "fetch" somewhere in its body as a network issue.
      const isNetwork =
        err?.name === "TypeError" ||
        err?.message?.includes("Failed to fetch") ||
        err?.message?.includes("NetworkError");
      const friendlyError = isNetwork
        ? "Network error. Please check your connection."
        : `AI Assistant: ${err.message}`;
      setMessages(prev => [...prev, { role: 'assistant', content: friendlyError }]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    const handleBrainDump = (e: any) => {
      setIsOpen(true);
      const dumpText = `[Brain Dump Extract]: ${e.detail}`;
      processInput(dumpText);
    };

    window.addEventListener('brainDump', handleBrainDump);
    return () => window.removeEventListener('brainDump', handleBrainDump);
  }, []);

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    processInput(input);
    setInput("");
  };

  return (
    <>
      {/* Floating Chat Button */}
      <button 
        className="btn-primary"
        style={{ 
          position: 'fixed', 
          bottom: '2rem', 
          right: '2rem',
          borderRadius: '50%',
          width: '60px',
          height: '60px',
          padding: 0,
          boxShadow: '0 8px 32px rgba(99, 102, 241, 0.4)',
          zIndex: 1000,
          fontSize: '1.5rem'
        }}
        onClick={() => setIsOpen(!isOpen)}
      >
        ✨
      </button>

      {/* Chat Window */}
      {isOpen && (
        <div className="glass-panel animate-slide-up" style={{
          position: 'fixed',
          bottom: '6.5rem',
          right: '2rem',
          width: '380px',
          height: '500px',
          display: 'flex',
          flexDirection: 'column',
          zIndex: 2000,
          padding: 0,
          overflow: 'hidden',
          background: 'rgba(255, 255, 255, 0.98)', // High opacity background
          backdropFilter: 'blur(20px)',
          boxShadow: '0 20px 50px rgba(0,0,0,0.15)',
          border: '1px solid var(--border-color)',
        }}>
          <div style={{ padding: '1rem', borderBottom: '1px solid var(--border-color)', background: 'var(--bg-secondary)' }}>
            <h3 style={{ margin: 0, fontSize: '1.1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              ✨ Gemini Assistant
            </h3>
          </div>
          
          <div 
            ref={scrollRef}
            style={{ flex: 1, padding: '1rem', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '1rem' }}
          >
            {messages.map((msg, i) => (
              <div key={i} style={{
                alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
                background: msg.role === 'user' ? 'var(--accent-color)' : 'var(--bg-secondary)',
                color: msg.role === 'user' ? '#fff' : 'var(--text-primary)',
                padding: '0.75rem 1rem',
                borderRadius: '1rem',
                borderBottomRightRadius: msg.role === 'user' ? '4px' : '1rem',
                borderBottomLeftRadius: msg.role === 'assistant' ? '4px' : '1rem',
                maxWidth: '85%',
                boxShadow: '0 2px 8px rgba(0,0,0,0.05)',
                animation: 'fadeIn 0.3s ease forwards'
              }}>
                <p style={{ fontSize: '0.9rem', margin: 0, whiteSpace: 'pre-wrap' }}>{msg.content}</p>
              </div>
            ))}
            {isLoading && (
              <div style={{
                alignSelf: 'flex-start',
                background: 'var(--bg-secondary)',
                padding: '0.75rem 1rem',
                borderRadius: '1rem',
                borderBottomLeftRadius: '4px',
                maxWidth: '85%',
                boxShadow: '0 2px 8px rgba(0,0,0,0.05)',
                display: 'flex',
                gap: '4px'
              }} className="animate-pulse">
                <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Typing...</span>
              </div>
            )}
          </div>

          <form onSubmit={handleSend} style={{ padding: '1rem', borderTop: '1px solid var(--border-color)', display: 'flex', gap: '0.5rem', background: 'var(--bg-secondary)' }}>
            <input 
              type="text" 
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask anything..." 
              style={{
                flex: 1,
                padding: '0.75rem',
                borderRadius: 'var(--radius-lg)',
                border: '1px solid var(--border-color)',
                outline: 'none',
                background: 'var(--bg-primary)',
                color: 'var(--text-primary)'
              }}
            />
            <button 
              type="submit" 
              className="btn-icon" 
              disabled={isLoading}
              style={{ 
                background: isLoading ? 'var(--text-secondary)' : 'var(--accent-color)', 
                color: '#fff', 
                border: 'none',
                opacity: isLoading ? 0.7 : 1,
                cursor: isLoading ? 'not-allowed' : 'pointer'
              }}
            >
              {isLoading ? '⌛' : '↑'}
            </button>
          </form>
        </div>
      )}
    </>
  );
}

"use client";

import { useState, useEffect, useRef } from "react";
import { useSpeechRecognition } from "@/lib/useSpeechRecognition";

export function AIChatAssistant() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<{role: string, content: string}[]>([]);
  const messagesRef = useRef(messages);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // ── Voice I/O state ──────────────────────────────────────────────
  // voiceMode: when on, replies are spoken aloud. isListening: mic is
  // actively transcribing. isSpeaking: audio is currently playing.
  const [voiceMode, setVoiceMode] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  // Ref mirror so the async processInput closure reads the current mode.
  const voiceModeRef = useRef(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => { voiceModeRef.current = voiceMode; }, [voiceMode]);

  // Speech-to-text via the shared hook. Live results stream into the
  // input box; a completed utterance is sent through processInput so a
  // spoken command runs exactly like a typed one.
  const stt = useSpeechRecognition({
    lang: "en-IN",
    onResult: (text) => setInput(text),
    onFinal: (text) => {
      processInput(text);
      setInput("");
    },
  });
  const isListening = stt.listening;
  const voiceSupported = stt.supported;

  // Speak text: try the natural Neural2 voice via /api/tts, and fall
  // back to the browser's built-in voice if no key is configured or the
  // call fails. Cancels any in-flight speech first so replies don't overlap.
  const speak = async (text: string) => {
    const clean = (text || "").replace(/[*_`#>]/g, "").trim();
    if (!clean) return;

    const browserSpeak = () => {
      if (typeof window === "undefined" || !window.speechSynthesis) return;
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(clean);
      u.onstart = () => setIsSpeaking(true);
      u.onend = () => setIsSpeaking(false);
      window.speechSynthesis.speak(u);
    };

    try {
      const res = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: clean }),
      });
      const data = await res.json();
      if (data.audioContent) {
        if (audioRef.current) audioRef.current.pause();
        const audio = new Audio(`data:audio/mp3;base64,${data.audioContent}`);
        audioRef.current = audio;
        setIsSpeaking(true);
        audio.onended = () => setIsSpeaking(false);
        audio.onerror = () => { setIsSpeaking(false); browserSpeak(); };
        await audio.play();
      } else {
        browserSpeak();
      }
    } catch {
      browserSpeak();
    }
  };

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

      // In voice mode, read the reply aloud. Fire-and-forget so the UI
      // and the cross-component refresh events below aren't blocked.
      if (voiceModeRef.current && data?.content) {
        speak(data.content);
      }

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

  // Mic toggle: turning the mic on implies a voice conversation, so we
  // auto-enable spoken replies. The hook handles start/stop + dispatch.
  const toggleListening = () => {
    if (!isListening && !voiceMode) setVoiceMode(true);
    stt.toggle();
  };

  // Stop any audio + recognition when the panel closes so a reply doesn't
  // keep talking into a closed window.
  useEffect(() => {
    if (!isOpen) {
      stt.abort();
      audioRef.current?.pause();
      if (typeof window !== "undefined" && window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
      setIsSpeaking(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

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
          <div style={{ padding: '1rem', borderBottom: '1px solid var(--border-color)', background: 'var(--bg-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
            <h3 style={{ margin: 0, fontSize: '1.1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              ✨ Gemini Assistant
            </h3>
            {/* Voice-mode toggle: when on, replies are spoken aloud.
                isSpeaking shows a live indicator; click while speaking
                stops playback. */}
            <button
              onClick={() => {
                if (isSpeaking) {
                  audioRef.current?.pause();
                  if (window.speechSynthesis) window.speechSynthesis.cancel();
                  setIsSpeaking(false);
                }
                setVoiceMode(v => !v);
              }}
              title={voiceMode ? "Voice replies on" : "Voice replies off"}
              aria-label="Toggle voice replies"
              style={{
                display: 'flex', alignItems: 'center', gap: '0.35rem',
                padding: '0.35rem 0.7rem', borderRadius: 'var(--radius-xl)',
                fontSize: '0.7rem', fontWeight: 700,
                border: `1px solid ${voiceMode ? 'var(--accent-color)' : 'var(--border-color)'}`,
                background: voiceMode ? 'var(--accent-color)' : 'transparent',
                color: voiceMode ? '#fff' : 'var(--text-secondary)',
                transition: 'var(--transition-smooth)',
              }}
            >
              <span className={isSpeaking ? 'animate-pulse' : ''}>{voiceMode ? '🔊' : '🔇'}</span>
              {isSpeaking ? 'Speaking' : voiceMode ? 'Voice' : 'Muted'}
            </button>
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
            {voiceSupported && (
              <button
                type="button"
                onClick={toggleListening}
                className="btn-icon"
                title={isListening ? "Stop listening" : "Speak"}
                aria-label={isListening ? "Stop listening" : "Speak to assistant"}
                style={{
                  background: isListening ? 'var(--danger-color, #ff3b30)' : 'var(--bg-primary)',
                  color: isListening ? '#fff' : 'var(--text-primary)',
                  border: '1px solid var(--border-color)',
                  flexShrink: 0,
                }}
              >
                <span className={isListening ? 'animate-pulse' : ''}>🎙️</span>
              </button>
            )}
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={isListening ? "Listening…" : "Ask anything..."}
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
                cursor: isLoading ? 'not-allowed' : 'pointer',
                flexShrink: 0,
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

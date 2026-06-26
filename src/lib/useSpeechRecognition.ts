"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Simple, robust wrapper over the browser Web Speech API (Chrome/Edge).
 *
 * Deliberately minimal: one recognition session per start(), continuous so
 * it survives natural pauses, and a silence timer that finalizes after the
 * user stops talking. Earlier versions auto-restarted sessions and added a
 * cross-instance mic lock — that kept a recogniser looping in the
 * background and starved the other mic (Smart Brain went red but silent,
 * then errored). Keeping it simple means each mic only holds the
 * microphone while actually in use, so the assistant and Smart Brain never
 * fight over it.
 *
 * `onResult` streams the running transcript; `onFinal` fires once with the
 * full text when the session ends.
 */
export interface UseSpeechRecognitionOptions {
  lang?: string;
  /** Silence (ms) before finalizing once the user has started talking. Default 3000. */
  silenceMs?: number;
  onResult?: (text: string) => void;
  onFinal?: (text: string) => void;
}

export function useSpeechRecognition(opts: UseSpeechRecognitionOptions = {}) {
  const { lang = "en-IN", silenceMs = 3000, onResult, onFinal } = opts;
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultCount, setResultCount] = useState(0);

  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const silenceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onResultRef = useRef(onResult);
  const onFinalRef = useRef(onFinal);
  useEffect(() => { onResultRef.current = onResult; }, [onResult]);
  useEffect(() => { onFinalRef.current = onFinal; }, [onFinal]);

  useEffect(() => {
    setSupported(
      typeof window !== "undefined" &&
        !!(window.SpeechRecognition || window.webkitSpeechRecognition),
    );
  }, []);

  const clearSilence = () => {
    if (silenceRef.current) {
      clearTimeout(silenceRef.current);
      silenceRef.current = null;
    }
  };

  const start = useCallback(() => {
    const Ctor =
      (typeof window !== "undefined" &&
        (window.SpeechRecognition || window.webkitSpeechRecognition)) ||
      null;
    if (!Ctor) return;

    // Drop any previous session before starting a fresh one.
    try { recognitionRef.current?.abort(); } catch { /* noop */ }
    clearSilence();

    const recognition = new Ctor();
    recognition.lang = lang;
    recognition.interimResults = true;
    recognition.continuous = true;

    let finalText = "";
    setError(null);
    setResultCount(0);

    const armSilence = () => {
      clearSilence();
      silenceRef.current = setTimeout(() => {
        try { recognition.stop(); } catch { /* already stopped */ }
      }, silenceMs);
    };

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      setResultCount((c) => c + 1);
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const chunk = event.results[i][0].transcript;
        if (event.results[i].isFinal) finalText += chunk;
        else interim += chunk;
      }
      onResultRef.current?.((finalText + interim).trim());
      armSilence(); // start/extend the grace window once speech is flowing
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      setError(event.error);
    };

    recognition.onend = () => {
      clearSilence();
      setListening(false);
      const text = finalText.trim();
      if (text) onFinalRef.current?.(text);
    };

    recognitionRef.current = recognition;
    setListening(true);
    try { recognition.start(); } catch { setListening(false); }
  }, [lang, silenceMs]);

  const stop = useCallback(() => {
    clearSilence();
    try { recognitionRef.current?.stop(); } catch { /* noop */ }
  }, []);

  const abort = useCallback(() => {
    clearSilence();
    try { recognitionRef.current?.abort(); } catch { /* noop */ }
    setListening(false);
  }, []);

  const toggle = useCallback(() => {
    if (listening) stop();
    else start();
  }, [listening, start, stop]);

  // Release the mic if the component unmounts.
  useEffect(() => {
    return () => {
      clearSilence();
      try { recognitionRef.current?.abort(); } catch { /* noop */ }
    };
  }, []);

  return { supported, listening, error, resultCount, start, stop, abort, toggle };
}

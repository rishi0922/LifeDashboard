"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * React wrapper over the browser Web Speech API (Chrome/Edge).
 *
 * The hard part this solves: Chrome's SpeechRecognition ends itself on its
 * own — after a few seconds of silence or an internal time cap — even in
 * `continuous` mode. Left alone, the mic "turns off automatically". So we
 * auto-restart a fresh session on every unintended end and accumulate the
 * transcript across restarts, giving a mic that stays on until the caller
 * decides it's done.
 *
 * Two stop policies:
 *   - keepAlive=false (default, the assistant): finalize after `silenceMs`
 *     of silence once the user has spoken — i.e. auto-submit a command.
 *   - keepAlive=true (note dictation): never auto-stop; the mic stays on,
 *     restarting through Chrome's auto-ends, until the caller calls stop().
 *
 * `onResult` streams the running transcript; `onFinal` fires once with the
 * full text when the session is intentionally finalized.
 */
export interface UseSpeechRecognitionOptions {
  lang?: string;
  /** Silence (ms) before auto-finalizing. Ignored when keepAlive. Default 3000. */
  silenceMs?: number;
  /** Keep the mic on until the caller stops it (no silence auto-stop). */
  keepAlive?: boolean;
  onResult?: (text: string) => void;
  onFinal?: (text: string) => void;
}

export function useSpeechRecognition(opts: UseSpeechRecognitionOptions = {}) {
  const { lang = "en-IN", silenceMs = 3000, keepAlive = false, onResult, onFinal } = opts;
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);

  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const accumRef = useRef(""); // transcript committed across restarts
  const finalizingRef = useRef(false); // intentional stop → don't restart
  const fatalRef = useRef(false); // permission/hardware error → don't restart
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

  // Request the session to end and deliver onFinal (not a restart).
  const finalize = useCallback(() => {
    finalizingRef.current = true;
    clearSilence();
    try { recognitionRef.current?.stop(); } catch { /* already stopped */ }
  }, []);

  const startSession = useCallback(() => {
    const Ctor =
      (typeof window !== "undefined" &&
        (window.SpeechRecognition || window.webkitSpeechRecognition)) ||
      null;
    if (!Ctor) return;

    const recognition = new Ctor();
    recognition.lang = lang;
    recognition.interimResults = true;
    recognition.continuous = true;

    let sessionFinal = "";

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const chunk = event.results[i][0].transcript;
        if (event.results[i].isFinal) sessionFinal += chunk;
        else interim += chunk;
      }
      onResultRef.current?.((accumRef.current + sessionFinal + interim).trim());
      // Auto-finalize after silence only when not keep-alive. The timer
      // lives at hook level so a pending grace survives an auto-restart.
      if (!keepAlive) {
        clearSilence();
        silenceRef.current = setTimeout(() => finalize(), silenceMs);
      }
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      if (
        event.error === "not-allowed" ||
        event.error === "service-not-allowed" ||
        event.error === "audio-capture"
      ) {
        fatalRef.current = true; // can't recover by restarting
      }
    };

    recognition.onend = () => {
      if (sessionFinal) accumRef.current = `${accumRef.current}${sessionFinal} `;
      // Chrome ended on its own and we still want to listen → restart with
      // a fresh session, preserving the accumulated transcript.
      if (!finalizingRef.current && !fatalRef.current) {
        setTimeout(() => startSession(), 100);
        return;
      }
      // Intentional finish (user stop, grace timeout, or fatal error).
      clearSilence();
      setListening(false);
      const text = accumRef.current.trim();
      accumRef.current = "";
      finalizingRef.current = false;
      fatalRef.current = false;
      if (text) onFinalRef.current?.(text);
    };

    recognitionRef.current = recognition;
    setListening(true);
    try { recognition.start(); } catch { /* start race — onend will retry */ }
  }, [lang, silenceMs, keepAlive, finalize]);

  const start = useCallback(() => {
    accumRef.current = "";
    finalizingRef.current = false;
    fatalRef.current = false;
    startSession();
  }, [startSession]);

  const stop = useCallback(() => finalize(), [finalize]);

  const abort = useCallback(() => {
    finalizingRef.current = true; // suppress restart
    clearSilence();
    try { recognitionRef.current?.abort(); } catch { /* noop */ }
    accumRef.current = "";
    setListening(false);
  }, []);

  const toggle = useCallback(() => {
    if (listening) stop();
    else start();
  }, [listening, start, stop]);

  // Stop the mic if the component using it unmounts.
  useEffect(() => {
    return () => {
      finalizingRef.current = true;
      clearSilence();
      try { recognitionRef.current?.abort(); } catch { /* noop */ }
    };
  }, []);

  return { supported, listening, start, stop, abort, toggle };
}

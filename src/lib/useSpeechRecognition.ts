"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Thin React wrapper over the browser Web Speech API (Chrome/Edge).
 * Centralises the STT setup so the chat assistant and the notes panel
 * don't each carry their own copy.
 *
 * Usage:
 *   const stt = useSpeechRecognition({ lang: "en-IN", onFinal: text => ... });
 *   stt.supported // boolean
 *   stt.listening // boolean
 *   stt.toggle()  // start if idle, stop if listening
 *
 * `onResult` fires with live (interim + final) text so the caller can
 * show a running transcript. `onFinal` fires once with the completed
 * utterance when recognition ends.
 */
export interface UseSpeechRecognitionOptions {
  lang?: string;
  /**
   * Grace period (ms) of silence before an utterance is treated as
   * complete. The recogniser runs in continuous mode and the timer is
   * reset on every speech result — so pausing to think doesn't cut the
   * user off mid-sentence. Default 3000.
   */
  silenceMs?: number;
  onResult?: (text: string) => void;
  onFinal?: (text: string) => void;
}

export function useSpeechRecognition(opts: UseSpeechRecognitionOptions = {}) {
  const { lang = "en-IN", silenceMs = 3000, onResult, onFinal } = opts;
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef<SpeechRecognition | null>(null);

  // Keep the latest callbacks in refs so the recognition handlers always
  // call the current closures without re-creating the recogniser.
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

  const stop = useCallback(() => {
    recognitionRef.current?.stop();
  }, []);

  const abort = useCallback(() => {
    recognitionRef.current?.abort();
    setListening(false);
  }, []);

  const start = useCallback(() => {
    const Ctor =
      (typeof window !== "undefined" &&
        (window.SpeechRecognition || window.webkitSpeechRecognition)) ||
      null;
    if (!Ctor) return;

    const recognition = new Ctor();
    recognition.lang = lang;
    recognition.interimResults = true;
    // Continuous so the session survives natural pauses; we decide when
    // the user is done via our own silence timer below.
    recognition.continuous = true;

    let finalText = "";
    let silenceTimer: ReturnType<typeof setTimeout> | null = null;
    const armSilence = () => {
      if (silenceTimer) clearTimeout(silenceTimer);
      silenceTimer = setTimeout(() => {
        try { recognition.stop(); } catch { /* already stopped */ }
      }, silenceMs);
    };

    recognition.onstart = () => armSilence();
    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const chunk = event.results[i][0].transcript;
        if (event.results[i].isFinal) finalText += chunk;
        else interim += chunk;
      }
      onResultRef.current?.((finalText + interim).trim());
      armSilence(); // any speech resets the grace window
    };
    recognition.onerror = () => {
      if (silenceTimer) clearTimeout(silenceTimer);
      setListening(false);
    };
    recognition.onend = () => {
      if (silenceTimer) clearTimeout(silenceTimer);
      setListening(false);
      const text = finalText.trim();
      if (text) onFinalRef.current?.(text);
    };

    recognitionRef.current = recognition;
    setListening(true);
    recognition.start();
  }, [lang, silenceMs]);

  const toggle = useCallback(() => {
    if (listening) stop();
    else start();
  }, [listening, start, stop]);

  return { supported, listening, start, stop, abort, toggle };
}

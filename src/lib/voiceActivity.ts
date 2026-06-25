/**
 * Barge-in voice activity detector.
 *
 * While the assistant is speaking, we want to interrupt it the moment the
 * user starts talking. Running the SpeechRecognition mic during playback
 * would transcribe the assistant's own voice (echo), so instead we open a
 * dedicated mic stream with `echoCancellation` — which removes most of the
 * speaker output — and watch the input level. When sustained speech is
 * detected we fire `onSpeech` once and tear down.
 *
 * Returns a stop() for the caller to cancel detection (e.g. when the
 * reply finishes playing on its own). Degrades to a no-op if the mic or
 * Web Audio API isn't available.
 */
export async function createBargeInDetector(
  onSpeech: () => void,
  opts: { threshold?: number; framesNeeded?: number } = {},
): Promise<() => void> {
  const threshold = opts.threshold ?? 0.12; // RMS; tuned to ignore residual echo
  const framesNeeded = opts.framesNeeded ?? 4; // consecutive loud frames = real speech

  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
    return () => {};
  }

  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
  } catch {
    return () => {};
  }

  const Ctx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) {
    stream.getTracks().forEach((t) => t.stop());
    return () => {};
  }

  const ctx = new Ctx();
  const source = ctx.createMediaStreamSource(stream);
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 512;
  source.connect(analyser);
  const buf = new Uint8Array(analyser.fftSize);

  let raf = 0;
  let above = 0;
  let stopped = false;

  const cleanup = () => {
    if (stopped) return;
    stopped = true;
    cancelAnimationFrame(raf);
    try { source.disconnect(); } catch { /* noop */ }
    stream.getTracks().forEach((t) => t.stop());
    ctx.close().catch(() => {});
  };

  const tick = () => {
    if (stopped) return;
    analyser.getByteTimeDomainData(buf);
    let sum = 0;
    for (let i = 0; i < buf.length; i++) {
      const x = (buf[i] - 128) / 128;
      sum += x * x;
    }
    const rms = Math.sqrt(sum / buf.length);
    if (rms > threshold) {
      above++;
      if (above >= framesNeeded) {
        cleanup();
        onSpeech();
        return;
      }
    } else {
      above = 0;
    }
    raf = requestAnimationFrame(tick);
  };

  raf = requestAnimationFrame(tick);
  return cleanup;
}

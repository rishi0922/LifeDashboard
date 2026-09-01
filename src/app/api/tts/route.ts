import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/sessionUser";

export const dynamic = "force-dynamic";

/**
 * POST /api/tts  — text → natural speech for the voice assistant.
 *
 * Voice quality ladder (best → safe), tried in order until one succeeds:
 *   1. TTS_VOICE env override (if set)
 *   2. Chirp3-HD  — Google's most human-sounding tier (Indian, then US)
 *   3. Neural2 / Wavenet — natural fallbacks that exist in every account
 * The first voice that actually returns audio is cached for the process,
 * so we probe at most once. If NO Google voice works (or GOOGLE_TTS_API_KEY
 * is missing) we return { fallback: true } and the client speaks with the
 * browser's built-in voice — the robotic one, only as a last resort.
 *
 * Requires GOOGLE_TTS_API_KEY (enable "Cloud Text-to-Speech API" in Google
 * Cloud and create an API key). Without it, the voice stays robotic.
 *
 * Note: Chirp3-HD takes plain text only (no SSML) and does not support
 * pitch — so we send input.text and omit pitch below.
 */

const MAX_CHARS = 2000;

// Ordered best → safest. Chirp3-HD voice names use celestial names; the
// Neural2/Wavenet entries are near-universally available so the loop
// almost always lands on a natural voice before giving up.
const VOICE_CANDIDATES = [
  process.env.TTS_VOICE, // optional explicit override
  "en-IN-Chirp3-HD-Achernar", // Chirp3-HD, Indian English (female)
  "en-US-Chirp3-HD-Aoede", // Chirp3-HD, US English
  "en-IN-Wavenet-D", // natural, Indian English
  "en-US-Neural2-F", // natural, always available
].filter((v): v is string => !!v);

// Remember the first voice that worked so we don't re-probe every request.
let cachedVoice: string | null = null;

async function synthesize(
  apiKey: string,
  voiceName: string,
  text: string,
): Promise<string | null> {
  const languageCode = voiceName.split("-").slice(0, 2).join("-") || "en-US";
  try {
    const res = await fetch(
      `https://texttospeech.googleapis.com/v1/text:synthesize?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          input: { text },
          voice: { languageCode, name: voiceName },
          // No pitch — Chirp3-HD rejects it. speakingRate is supported.
          audioConfig: { audioEncoding: "MP3", speakingRate: 1.0 },
        }),
      },
    );
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      console.warn(`[tts] voice ${voiceName} failed ${res.status}: ${detail.slice(0, 160)}`);
      return null;
    }
    const data = await res.json();
    return (data.audioContent as string) || null;
  } catch (err) {
    console.warn(`[tts] voice ${voiceName} threw`, err);
    return null;
  }
}

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { text?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const text = (body.text || "").trim().slice(0, MAX_CHARS);
  if (!text) {
    return NextResponse.json({ error: "text is required" }, { status: 400 });
  }

  const apiKey = process.env.GOOGLE_TTS_API_KEY;
  if (!apiKey) {
    // No key — client uses its (robotic) browser voice.
    return NextResponse.json({ fallback: true });
  }

  // Try the cached working voice first, then the rest of the ladder.
  const order = cachedVoice
    ? [cachedVoice, ...VOICE_CANDIDATES.filter((v) => v !== cachedVoice)]
    : [...VOICE_CANDIDATES];

  for (const voice of order) {
    const audioContent = await synthesize(apiKey, voice, text);
    if (audioContent) {
      cachedVoice = voice;
      return NextResponse.json({ audioContent, encoding: "mp3", voice });
    }
  }

  // Every Google voice failed — fall back to the browser voice.
  return NextResponse.json({ fallback: true });
}

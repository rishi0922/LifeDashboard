import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/sessionUser";

export const dynamic = "force-dynamic";

/**
 * POST /api/tts  — text → natural speech for the voice assistant.
 *
 * Graceful degradation: when GOOGLE_TTS_API_KEY is set we synthesise with
 * Google Cloud Text-to-Speech (Neural2 — natural voice, 1M free chars/mo).
 * When it isn't, we return { fallback: true } and the client falls back to
 * the browser's built-in SpeechSynthesis. So the feature works the moment
 * it ships (robotic) and upgrades to a natural voice the instant the key
 * is added — no code change required.
 *
 * Voice is configurable via TTS_VOICE (defaults to a US Neural2 voice).
 * Indian-English Neural2 voices like "en-IN-Neural2-A" can be set there.
 */

// Hard cap so a runaway reply can't blow the monthly free character quota
// in one call. ~2k chars is far longer than any spoken assistant reply.
const MAX_CHARS = 2000;

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
    // No key configured — tell the client to use its browser voice.
    return NextResponse.json({ fallback: true });
  }

  const voiceName = process.env.TTS_VOICE || "en-US-Neural2-F";
  // Derive the languageCode from the voice name's first two segments
  // (e.g. "en-IN-Neural2-A" → "en-IN").
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
          audioConfig: { audioEncoding: "MP3", speakingRate: 1.0 },
        }),
      },
    );

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      console.error("[tts] Google TTS error", res.status, detail.slice(0, 200));
      // Don't fail the turn — let the client speak with its browser voice.
      return NextResponse.json({ fallback: true });
    }

    const data = await res.json();
    if (!data.audioContent) return NextResponse.json({ fallback: true });

    return NextResponse.json({
      audioContent: data.audioContent as string, // base64 MP3
      encoding: "mp3",
    });
  } catch (err) {
    console.error("[tts] synthesis failed", err);
    return NextResponse.json({ fallback: true });
  }
}

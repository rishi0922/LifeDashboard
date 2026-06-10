import { GoogleGenerativeAI, GenerativeModel } from "@google/generative-ai";

// Ordered from newest/cheapest first to older/stable last. When the newer
// 2.5 / 3.1 models hit demand spikes or go down we want the assistant to
// degrade gracefully to the well-proven 1.5 family instead of throwing. 1.5
// models are still fully supported by the v1 API as of this writing.
// Locked per AGENTS.md — do not edit without explicit user approval.
const FALLBACK_MODELS = [
  "gemini-3.1-flash-lite-preview",
  "gemini-2.5-flash",
  "gemini-2.5-flash-lite",
  "gemini-flash-lite-latest",
  "gemini-flash-latest",
  // Gemini 1.5 safety net — slower but consistently available.
  "gemini-1.5-flash",
  "gemini-1.5-flash-8b",
  "gemini-1.5-pro"
];

let cachedWorkingModel: string | null = null;

/**
 * Generate content against the locked fallback list of Gemini models,
 * preferring the cached model from a prior successful call.
 *
 * Replaces the old `getRobustModel` + per-model `generateContent("ping")`
 * probe pattern, which on a cold serverless invocation would burn 20-40s
 * round-tripping each candidate before the real request even fired —
 * causing FUNCTION_INVOCATION_TIMEOUT on Vercel.
 *
 * New approach: try each model with the REAL prompt; the first one that
 * doesn't throw is the one. Cache its name so subsequent calls in the
 * same Lambda hit it first.
 */
export async function generateContentWithFallback(
  genAI: GoogleGenerativeAI,
  prompt: string,
): Promise<{ response: { text(): string } }> {
  // Try the cached model first if we have one, then the rest of the list.
  const ordered = cachedWorkingModel
    ? [
        cachedWorkingModel,
        ...FALLBACK_MODELS.filter((m) => m !== cachedWorkingModel),
      ]
    : [...FALLBACK_MODELS];

  let lastError: any = null;

  for (const modelName of ordered) {
    try {
      const model = genAI.getGenerativeModel({ model: modelName });
      const result = await model.generateContent(prompt);
      cachedWorkingModel = modelName;
      return result;
    } catch (err: any) {
      lastError = err;
      console.warn(
        `Model ${modelName} failed (${err?.message || "unknown"}); trying next…`,
      );
      // If the cached model failed, drop the cache so we don't re-prefer it.
      if (modelName === cachedWorkingModel) cachedWorkingModel = null;
      continue;
    }
  }

  throw (
    lastError ||
    new Error(
      "All Gemini models in the fallback list failed. Check API key and quota.",
    )
  );
}

/**
 * @deprecated Prefer `generateContentWithFallback(genAI, prompt)` — that
 * function tries each model with the real request instead of probing.
 *
 * Kept for backward compatibility with finance/sync (which still calls it).
 * Now also probe-free: returns the cached model if any, otherwise the
 * primary; relies on the caller to catch errors and retry if needed.
 */
export async function getRobustModel(
  genAI: GoogleGenerativeAI,
): Promise<GenerativeModel> {
  const modelName = cachedWorkingModel || FALLBACK_MODELS[0];
  return genAI.getGenerativeModel({ model: modelName });
}

/**
 * Normalizes AI JSON response by stripping markdown code blocks.
 */
export function parseAIJson(text: string): any {
  // Try to find an array first, then an object
  const jsonMatch = text.match(/\[[\s\S]*\]/) || text.match(/\{[\s\S]*\}/);
  
  if (!jsonMatch) {
    console.error("AI Response failed regex match:", text);
    throw new Error("Could not extract valid JSON from AI response.");
  }
  
  try {
    return JSON.parse(jsonMatch[0].trim());
  } catch (e) {
    console.error("Malformed AI JSON:", jsonMatch[0]);
    throw new Error("AI returned malformed JSON data.");
  }
}

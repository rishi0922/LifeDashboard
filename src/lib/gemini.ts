import { GoogleGenerativeAI, GenerativeModel } from "@google/generative-ai";

// Ordered from newest/cheapest first to older/stable last. When the newer
// 2.5 / 3.1 models hit demand spikes or go down we want the assistant to
// degrade gracefully to the well-proven 1.5 family instead of throwing. 1.5
// models are still fully supported by the v1 API as of this writing.
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
 * Returns a working Gemini model by trying a chain of fallback options.
 * Caches the first successful model name for the duration of the process.
 * Prefers the 2.5/3.1 family; falls through to 1.5 when those are
 * throttled or unavailable.
 */
export async function getRobustModel(genAI: GoogleGenerativeAI): Promise<GenerativeModel> {
  if (cachedWorkingModel) {
    return genAI.getGenerativeModel({ model: cachedWorkingModel });
  }

  let lastError: any = null;

  for (const modelName of FALLBACK_MODELS) {
    try {
      const model = genAI.getGenerativeModel({ model: modelName });
      
      // Probe to see if the model exists and is responsive
      await model.generateContent("ping");
      
      cachedWorkingModel = modelName;
      return model;
    } catch (err: any) {
      lastError = err;
      console.warn(`Model ${modelName} is unavailable: ${err.message || "Unknown Error"}`);
      continue;
    }
  }

  throw lastError || new Error("All Gemini models (3.1 / 2.5 / 1.5) failed to initialize. Check your API key.");
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

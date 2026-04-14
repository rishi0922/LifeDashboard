import { GoogleGenerativeAI, GenerativeModel } from "@google/generative-ai";

const FALLBACK_MODELS = [
  "gemini-3.1-flash-lite-preview",
  "gemini-2.5-flash",
  "gemini-2.5-flash-lite",
  "gemini-flash-lite-latest",
  "gemini-flash-latest"
];

let cachedWorkingModel: string | null = null;

/**
 * Returns a working Gemini model by trying a chain of fallback options.
 * Caches the first successful model name for the duration of the process.
 * ONLY uses gemini-3.1-flash-lite and gemini-2.5-flash per user instructions.
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

  throw lastError || new Error("Selected Gemini models (2.5/3.1) failed to initialize. Check your API key.");
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

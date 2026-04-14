import { GoogleGenerativeAI, GenerativeModel } from "@google/generative-ai";

const FALLBACK_MODELS = [
  "gemini-3.1-flash-lite-preview",
  "gemini-2.5-flash",
  "gemini-2.0-flash",
  "gemini-1.5-flash",
  "gemini-1.5-flash-latest",
  "gemini-pro"
];

let cachedWorkingModel: string | null = null;

/**
 * Returns a robust Gemini model instance, preferring gemini-1.5-flash 
 * for maximum stability and availability on Vercel Serverless.
 */
export async function getRobustModel(genAI: GoogleGenerativeAI): Promise<GenerativeModel> {
  // Use gemini-1.5-flash which has the highest request limits and availability
  return genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
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

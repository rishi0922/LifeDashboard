const { GoogleGenerativeAI } = require("@google/generative-ai");
const FALLBACK_MODELS = [
  "gemini-3.1-flash-lite-preview",
  "gemini-2.5-flash",
  "gemini-2.0-flash",
  "gemini-1.5-flash",
  "gemini-1.5-flash-latest",
  "gemini-pro"
];
async function check() {
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  for (const modelName of FALLBACK_MODELS) {
    try {
      const model = genAI.getGenerativeModel({ model: modelName });
      console.log(`Trying ${modelName}...`);
      await model.generateContent("ping");
      console.log(`Working: ${modelName}`);
      return;
    } catch (e) {
      console.log(`Failed ${modelName}:`, e.message);
    }
  }
}
require('dotenv').config();
check();

const { GoogleGenerativeAI } = require("@google/generative-ai");
require('dotenv').config();

async function list() {
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${process.env.GEMINI_API_KEY}`);
    const data = await response.json();
    console.log("AVAILABLE MODELS:");
    if (data.models) {
      data.models.forEach(m => console.log(`- ${m.name} (Methods: ${m.supportedGenerationMethods})`));
    } else {
      console.log("No models found or error:", data);
    }
  } catch (e) {
    console.error("List error:", e.message);
  }
}
list();

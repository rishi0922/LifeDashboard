require('dotenv').config();
const { GoogleGenerativeAI } = require("@google/generative-ai");

async function check() {
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  const models = [
    "gemini-2.0-flash-lite-001",
    "gemini-2.0-flash-lite", 
    "gemini-2.5-flash-lite",
    "gemini-flash-lite-latest"
  ];
  for (const m of models) {
    try {
      const model = genAI.getGenerativeModel({ model: m });
      console.log(`Checking ${m}...`);
      await model.generateContent("ping");
      console.log(`- ${m} works!`);
      break;
    } catch (e) {
      console.log(`- ${m} failed: ${e.message}`);
    }
  }
}
check();

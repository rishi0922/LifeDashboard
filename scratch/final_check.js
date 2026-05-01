const { GoogleGenerativeAI } = require("@google/generative-ai");
require('dotenv').config();

async function check() {
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  const models = ["gemini-3.1-flash-lite-preview", "gemini-2.5-flash", "gemini-flash-latest"];
  for (const m of models) {
    try {
      const model = genAI.getGenerativeModel({ model: m });
      console.log(`Checking ${m}...`);
      await model.generateContent("hi");
      console.log(`- ${m} works!`);
    } catch (e) {
      console.log(`- ${m} failed: ${e.message}`);
    }
  }
}
check();

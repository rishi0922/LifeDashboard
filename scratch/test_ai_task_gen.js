require('dotenv').config();
const { GoogleGenerativeAI } = require("@google/generative-ai");

async function testAI() {
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  const model = genAI.getGenerativeModel({ model: "gemini-flash-latest" }); 
  
  const prompt = `
    You are "Command Center AI". Respond clearly and concisely.
    CAPABILITIES (Output JSON for actions):
    - Create Task: {"action": "create_task", "title": "...", "category": "Work" | "Personal" | "Urgent", "sourceId": "GMAIL_MSG_ID_IF_APPLICABLE"}
    User: Add a task to fix the database
  `;
  
  try {
    const result = await model.generateContent(prompt);
    const text = result.response.text();
    console.log("AI TEXT OUTPUT:\n", text);
    
    const actionRegex = /\{[\s\S]*?"action":[\s\S]*?\}/g;
    const actionBlocks = text.match(actionRegex) || [];
    console.log("EXTRACTED BLOCKS:", actionBlocks);
    
    for (const block of actionBlocks) {
      try {
         JSON.parse(block);
         console.log("JSON Parse: SUCCESS");
      } catch(e) {
         console.error("JSON Parse: FAILED", e.message);
      }
    }
  } catch (e) {
    console.error(e);
  }
}
testAI();

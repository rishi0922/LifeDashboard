require('dotenv').config();
const { GoogleGenerativeAI } = require("@google/generative-ai");

/**
 * Mocks the logic in src/app/api/chat/route.ts to verify deduplication and conflict expansion.
 */
async function verify() {
  const text = `
    I'll schedule a meeting for you.
    {"action": "create_event", "summary": "Sync", "startTime": "2026-04-14T17:00:00"}
    And again:
    {"action": "create_event", "summary": "Sync", "startTime": "2026-04-14T17:00:00"}
  `;
  
  const actionRegex = /\{[\s\S]*?"action":[\s\S]*?\}/g;
  const actionBlocks = text.match(actionRegex) || [];
  
  console.log("Extracted Blocks:", actionBlocks.length);
  
  const uniqueBlocks = Array.from(new Set(actionBlocks));
  console.log("Unique Blocks:", uniqueBlocks.length);
  
  if (uniqueBlocks.length !== 1) {
    console.error("❌ FAILED: Action blocks not de-duplicated!");
    return;
  }
  
  const formatTime = (iso) => {
    if (!iso) return new Date().toISOString();
    if (iso.includes('+') || iso.endsWith('Z')) return iso;
    return `${iso}+05:30`; 
  };

  const cmd = JSON.parse(uniqueBlocks[0]);
  const startDT = formatTime(cmd.startTime);
  const endDT = formatTime(cmd.endTime || cmd.startTime);
  
  let searchEnd = endDT;
  if (startDT === endDT) {
    const d = new Date(startDT);
    d.setMinutes(d.getMinutes() + 1);
    searchEnd = d.toISOString();
  }
  
  console.log("Time Check:");
  console.log("Start:", startDT);
  console.log("Orig End:", endDT);
  console.log("Search End:", searchEnd);
  
  if (startDT === searchEnd) {
    console.error("❌ FAILED: Search window not expanded!");
    return;
  }
  
  console.log("✅ SUCCESS: Deduplication and Window expansion logic verified.");
}

verify();

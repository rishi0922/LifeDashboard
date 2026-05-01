async function test() {
  const url = "https://www.cricbuzz.com/match-api/livematches.json";
  
  const proxies = [
    `https://corsproxy.io/?${encodeURIComponent(url)}`,
    `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
    `https://api.codetabs.com/v1/proxy/?quest=${encodeURIComponent(url)}`
  ];
  
  for (const proxy of proxies) {
    console.log("Testing:", proxy);
    try {
      const res = await fetch(proxy);
      const text = await res.text();
      console.log("STATUS:", res.status);
      console.log("RESPONSE (first 50 chars):", text.substring(0, 50).replace(/\n/g, ''));
      if (text.startsWith("{")) {
        console.log("✅ SUCCESS, JSON RETRIEVED.\n");
      } else {
         console.log("❌ FAILED (Not JSON).\n");
      }
    } catch (e) {
      console.error("ERROR:", e.message);
    }
  }
}
test();

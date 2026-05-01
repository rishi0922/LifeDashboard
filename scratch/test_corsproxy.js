async function test() {
  const url = "https://www.cricbuzz.com/match-api/livematches.json";
  const proxy = `https://corsproxy.io/?${encodeURIComponent(url)}`;
  
  try {
    const res = await fetch(proxy, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
        "Origin": "http://localhost:3000",
        "Referer": "http://localhost:3000/"
      }
    });
    const text = await res.text();
    console.log("STATUS:", res.status);
    console.log("RESPONSE (first 100 chars):", text.substring(0, 100).replace(/\n/g, ''));
  } catch (e) {
    console.error("ERROR:", e.message);
  }
}
test();

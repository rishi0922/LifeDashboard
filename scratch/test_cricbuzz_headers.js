async function test() {
  const url = "https://www.cricbuzz.com/match-api/livematches.json";
  
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
        "Accept": "application/json, text/plain, */*",
        "Accept-Language": "en-US,en;q=0.9",
        "Referer": "https://www.cricbuzz.com/",
        "Connection": "keep-alive"
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

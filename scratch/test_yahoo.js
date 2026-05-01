async function test() {
  const url = "https://cricket.yahoo.net/sifeeds/cricket/live/json/matches.json";
  try {
    const res = await fetch(url);
    const text = await res.text();
    console.log("STATUS:", res.status);
    console.log("RESPONSE (first 100 chars):", text.substring(0, 100).replace(/\n/g, ''));
  } catch (e) {
    console.error("ERROR:", e.message);
  }
}
test();

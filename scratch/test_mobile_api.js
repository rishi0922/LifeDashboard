async function test() {
  const url = "https://mapps.cricbuzz.com/cbzios/match/livematches";
  
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

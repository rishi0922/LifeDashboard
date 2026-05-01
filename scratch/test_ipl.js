async function test() {
  const url = "https://www.cricbuzz.com/match-api/livematches.json";
  const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`;
  
  try {
    const res = await fetch(proxyUrl);
    console.log("STATUS:", res.status);
    const text = await res.text();
    console.log("BODY START:", text.substring(0, 200));
  } catch (e) {
    console.error(e);
  }
}
test();

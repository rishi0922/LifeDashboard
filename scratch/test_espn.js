async function test() {
  const url = "https://hs-consumer-api.espncricinfo.com/v1/pages/matches/current?lang=en&latest=true";
  
  try {
    const res = await fetch(url);
    const text = await res.text();
    console.log("STATUS:", res.status);
    console.log("RESPONSE (first 200 chars):", text.substring(0, 200).replace(/\n/g, ''));
  } catch (e) {
    console.error("ERROR:", e.message);
  }
}
test();

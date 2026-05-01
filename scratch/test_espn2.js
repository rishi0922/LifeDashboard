async function test() {
  const url = "https://site.api.espn.com/apis/site/v2/sports/cricket/8039/scoreboard";
  try {
    const res = await fetch(url);
    const text = await res.text();
    console.log("STATUS:", res.status);
    console.log("RESPONSE (first 200 chars):", text.substring(0, 200).replace(/\n/g, ''));
    if (res.status === 200) {
      const data = JSON.parse(text);
      console.log("League:", data.leagues?.[0]?.name);
      console.log("Matches:", data.events?.length);
    }
  } catch (e) {
    console.error("ERROR:", e.message);
  }
}
test();

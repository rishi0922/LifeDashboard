async function test() {
  const url = "https://site.api.espn.com/apis/site/v2/sports/cricket/8048/scoreboard";
  try {
    const res = await fetch(url);
    const data = await res.json();
    console.log(JSON.stringify(data.events[0], null, 2));
  } catch (e) {
    console.error("ERROR:", e.message);
  }
}
test();

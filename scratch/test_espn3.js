async function test() {
  const urls = [
    "https://site.api.espn.com/apis/site/v2/sports/cricket/8048/scoreboard",
    "https://site.api.espn.com/apis/site/v2/sports/cricket/scoreboard"
  ];
  for (const url of urls) {
    console.log("----");
    try {
      const res = await fetch(url);
      const text = await res.text();
      console.log("URL:", url);
      console.log("STATUS:", res.status);
      if (res.status === 200) {
        const data = JSON.parse(text);
        if (data.leagues) console.log("Leagues:", data.leagues.map(l => l.name).join(", "));
        console.log("Matches:", data.events?.length);
        if (data.events?.length > 0) {
          const ev = data.events[0];
          console.log("First Match:", ev.name, "Status:", ev.status?.type?.detail);
        }
      }
    } catch (e) {
      console.error("ERROR:", e.message);
    }
  }
}
test();

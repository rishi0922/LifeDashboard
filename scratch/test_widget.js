async function check() {
  try {
    const res = await fetch("https://site.api.espn.com/apis/site/v2/sports/cricket/8048/scoreboard", { cache: "no-store" });
    const data = await res.json();
    const out = [];

    for (const m of data?.events ?? []) {
      const competition = m.competitions?.[0];
      if (!competition || !competition.competitors || competition.competitors.length < 2) continue;

      const t1 = competition.competitors[0];
      const t2 = competition.competitors[1];

      const t1Raw = t1.team?.shortDisplayName || t1.team?.name || "";
      const t2Raw = t2.team?.shortDisplayName || t2.team?.name || "";

      out.push({ t1Raw, t2Raw, score1: t1.score, score2: t2.score });
    }
    console.log("OUT:", out);
  } catch (e) {
    console.error(e.message);
  }
}
check();

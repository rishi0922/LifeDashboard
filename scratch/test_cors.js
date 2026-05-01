async function checkCORS() {
  try {
    const res = await fetch("https://site.api.espn.com/apis/site/v2/sports/cricket/8048/scoreboard", {
      method: "OPTIONS",
      headers: {
        "Origin": "http://localhost:3000",
        "Access-Control-Request-Method": "GET"
      }
    });
    console.log("OPTIONS Status:", res.status);
    console.log("CORS Header:", res.headers.get("Access-Control-Allow-Origin"));
    
    // Also check GET
    const res2 = await fetch("https://site.api.espn.com/apis/site/v2/sports/cricket/8048/scoreboard", {
      headers: { "Origin": "http://localhost:3000" }
    });
    console.log("GET CORS Header:", res2.headers.get("Access-Control-Allow-Origin"));
  } catch(e) {
    console.log("Error:", e.message);
  }
}
checkCORS();

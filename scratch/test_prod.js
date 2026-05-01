async function t() {
  const res = await fetch("https://life-dashboard-gules.vercel.app/api/chat", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages: [{ role: "user", content: "Hi" }] })
  });
  const t = await res.text();
  console.log("STATUS:", res.status, "BODY:", t);
}
t();

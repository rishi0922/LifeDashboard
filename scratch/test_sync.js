fetch("http://localhost:3000/api/finance/sync", {
  method: "POST",
  headers: { "Content-Type": "application/json" }
}).then(res => res.json()).then(console.log).catch(console.error);

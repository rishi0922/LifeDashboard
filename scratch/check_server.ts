async function check() {
  try {
    console.log("Fetching /api/tasks from local server...");
    const res = await fetch("http://localhost:3000/api/tasks");
    console.log("STATUS:", res.status);
    const data = await res.json();
    console.log("DATA.tasks.length:", data.tasks?.length);
  } catch (e: any) {
    console.error("FETCH FAILED:", e.message);
  }
}
check();

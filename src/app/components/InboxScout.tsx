"use client";

import { useEffect } from "react";

export function InboxScout() {
  useEffect(() => {
    // Initial sync
    const runSync = async () => {
      try {
        console.log("Inbox Scout: Starting autonomous scan...");
        const res = await fetch('/api/gmail/sync', { method: 'POST' });
        const data = await res.json();
        
        if (res.status === 401) {
          console.warn("Inbox Scout: Session expired or missing Gmail permissions. Please sign out and sign in again.");
          return;
        }

        if (data.creations?.tasks > 0) {
          window.dispatchEvent(new Event('refreshTasks'));
        }
        if (data.creations?.events > 0) {
          window.dispatchEvent(new Event('refreshCalendar'));
        }
        console.log("Inbox Scout: Scan complete.", data.message || "");
      } catch (e) {
        // Silent fail for background scout
      }
    };

    // Delay initial sync slightly to allow page load
    const timeoutId = setTimeout(runSync, 5000);

    // Set 10-minute interval (600,000 ms)
    const intervalId = setInterval(runSync, 600000);

    return () => {
      clearTimeout(timeoutId);
      clearInterval(intervalId);
    };
  }, []);

  return null; // Hidden background component
}

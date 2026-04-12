export async function fetchGmailSnippets(accessToken: string) {
  try {
    // 1. List unread messages
    const listResponse = await fetch(
      "https://gmail.googleapis.com/gmail/v1/users/me/messages?q=is:unread&maxResults=10",
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );

    if (!listResponse.ok) {
      const errText = await listResponse.text();
      throw new Error(`Google API Error (${listResponse.status}): ${errText}`);
    }

    const { messages } = await listResponse.json();
    if (!messages || messages.length === 0) {
      return [];
    }

    // 2. Fetch snippets for each message
    const emailDetails = await Promise.all(
      messages.map(async (msg: any) => {
        const detailRes = await fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=full`,
          {
            headers: { Authorization: `Bearer ${accessToken}` },
          }
        );
        const detail = await detailRes.json();
        
        const subject = detail.payload?.headers?.find((h: any) => h.name === "Subject")?.value || "No Subject";
        const from = detail.payload?.headers?.find((h: any) => h.name === "From")?.value || "Unknown";
        
        return {
          id: msg.id,
          snippet: detail.snippet,
          subject,
          from,
          date: detail.internalDate,
        };
      })
    );

    return emailDetails;
  } catch (error) {
    console.error("Gmail Lib Error:", error);
    throw error;
  }
}

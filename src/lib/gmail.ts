/**
 * Base64url encoder — Gmail's users.messages.send wants the raw RFC2822
 * message base64url-encoded (url-safe, no padding).
 */
function base64UrlEncode(str: string): string {
  return Buffer.from(str, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export type GmailReplyResult = {
  ok: boolean;
  id?: string;
  threadId?: string;
  error?: string;
  status?: number;
};

/**
 * Sends a reply to a Gmail message, preserving thread context.
 *
 * We fetch the original so we can pull Subject / From / Message-ID / References
 * and build a proper RFC2822 reply (In-Reply-To + References chain so Gmail
 * threads it correctly). The outbound message is sent via
 * users.messages.send with threadId set to the original's threadId.
 *
 * Requires the `gmail.send` OAuth scope. Existing sessions signed in before
 * that scope was added will get a 403 until they re-consent.
 */
export async function sendGmailReply(params: {
  accessToken: string;
  emailId: string;
  body: string;
}): Promise<GmailReplyResult> {
  const { accessToken, emailId, body } = params;
  try {
    const detailRes = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${emailId}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Message-ID&metadataHeaders=References`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    if (!detailRes.ok) {
      const t = await detailRes.text();
      return { ok: false, status: detailRes.status, error: `fetch source email: ${t}` };
    }
    const detail = await detailRes.json();
    const headers = detail.payload?.headers || [];
    const headerFind = (name: string) =>
      headers.find((h: any) => h.name?.toLowerCase() === name.toLowerCase())?.value || "";
    const origSubject = headerFind("Subject") || "";
    const origFrom = headerFind("From") || "";
    const origMsgId = headerFind("Message-ID") || headerFind("Message-Id");
    const origReferences = headerFind("References");
    const match = origFrom.match(/<([^>]+)>/);
    const toEmail = match ? match[1] : origFrom.trim();
    if (!toEmail) {
      return { ok: false, error: "Could not determine recipient from source email." };
    }

    const subject = /^re:/i.test(origSubject) ? origSubject : `Re: ${origSubject}`;
    const referencesChain = [origReferences, origMsgId].filter(Boolean).join(" ").trim();

    const rfc2822Lines = [
      `To: ${toEmail}`,
      `Subject: ${subject}`,
      "MIME-Version: 1.0",
      "Content-Type: text/plain; charset=UTF-8",
      origMsgId ? `In-Reply-To: ${origMsgId}` : "",
      referencesChain ? `References: ${referencesChain}` : "",
      "",
      body,
    ].filter(Boolean);
    const raw = base64UrlEncode(rfc2822Lines.join("\r\n"));

    const sendRes = await fetch(
      "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          raw,
          threadId: detail.threadId,
        }),
      }
    );
    if (!sendRes.ok) {
      const errJson = await sendRes.json().catch(() => ({}));
      return {
        ok: false,
        status: sendRes.status,
        error: errJson.error?.message || "Gmail send failed",
      };
    }
    const sent = await sendRes.json();
    return { ok: true, id: sent.id, threadId: sent.threadId };
  } catch (err: any) {
    return { ok: false, error: err?.message || "Unknown reply error" };
  }
}

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
        
        const headers = detail.payload?.headers || [];
        const headerFind = (name: string) =>
          headers.find((h: any) => h.name?.toLowerCase() === name.toLowerCase())?.value || "";
        const subject = headerFind("Subject") || "No Subject";
        const from = headerFind("From") || "Unknown";
        const messageIdHeader = headerFind("Message-ID") || headerFind("Message-Id");
        const references = headerFind("References");
        // Extract "foo@bar.com" from "Name <foo@bar.com>"; fallback to raw
        // value if there's no angle-bracket form.
        const match = from.match(/<([^>]+)>/);
        const fromEmail = match ? match[1] : from.trim();

        return {
          id: msg.id,
          threadId: detail.threadId,
          snippet: detail.snippet,
          subject,
          from,
          fromEmail,
          messageIdHeader,
          references,
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

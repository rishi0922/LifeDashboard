import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { getRobustModel, parseAIJson } from "@/lib/gemini";

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  //@ts-ignore
  const accessToken = session?.accessToken;
  const userEmail = session?.user?.email;

  if (!accessToken || !userEmail) {
    return NextResponse.json({ error: "Unauthorized. Please sign in again." }, { status: 401 });
  }

  try {
    const user = await prisma.user.upsert({
      where: { email: userEmail },
      update: {},
      create: { 
        email: userEmail,
        name: session.user?.name || userEmail.split('@')[0],
      }
    });

    console.log(`[FinanceSync] Starting sync for user: ${userEmail} (ID: ${user.id})`);

    // 1. Fetch Targeted Gmail Snippets
    const keywords = [
      "debited", "spent", "paid", "txn", "PhonePe", "GPay", "HDFC", "Axis", "CRED", 
      "transfer", "payment", "shopping", "order confirmed", "transaction", "amount", "₹",
      "UPI", "Swiggy", "Zomato", "BookMyShow", "Netflix", "Subscription", "Investment"
    ].join(" OR ");
    const query = encodeURIComponent(keywords);
    
    const listRes = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${query}&maxResults=100`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    
    if (!listRes.ok) {
      if (listRes.status === 401) throw new Error("Gmail session expired.");
      const errorText = await listRes.text();
      throw new Error(`Gmail API Error: ${listRes.status} - ${errorText}`);
    }

    const listData = await listRes.json();
    const messages = listData.messages;
    
    if (!messages || messages.length === 0) {
      console.log("[FinanceSync] No matching financial emails found.");
      return NextResponse.json({ success: true, count: 0, message: "No potential transactions found in Gmail." });
    }

    // Fetch details for each message (Metadata format to get Context + Subject + Snippet)
    const emailDetails = await Promise.all(
      messages.map(async (msg: any) => {
        const dRes = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date`, {
          headers: { Authorization: `Bearer ${accessToken}` }
        });
        if (!dRes.ok) return null;
        const data = await dRes.json();
        const headers = data.payload?.headers || [];
        const subject = headers.find((h: any) => h.name === 'Subject')?.value || "";
        const from = headers.find((h: any) => h.name === 'From')?.value || "";
        const date = headers.find((h: any) => h.name === 'Date')?.value || "";
        return { id: data.id, snippet: data.snippet, subject, from, date };
      })
    );

    const validDetails = emailDetails.filter(e => e !== null);
    console.log(`[FinanceSync] Processing ${validDetails.length} emails with AI...`);

    // 2. AI Parsing - Extract Finance Data
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error("GEMINI_API_KEY is not configured.");

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = await getRobustModel(genAI);

    const prompt = `
      You are a specialized Finance Extraction AI. Analyze these Gmail alerts and extract financial DEBIT transactions.
      
      RULES:
      1. Only extract genuine expenses (money debited, spent, or shopping orders).
      2. IGNORE refunds, OTPs, login alerts, or credit/deposit alerts.
      3. Categorize exactly as: "Food", "Travel", "Bills", "Shopping", "Entertainment", "Investment", "Health", "Other".
      4. MERCHANT: Identify the specific shop, app (e.g., Zomato, BookMyShow, Amazon, Uber), or bank/biller.
      
      IMPORTANT:
      - Return a JSON array. 
      - Use the provided [Gmail ID] as sourceId.
      - If NO transactions are found, return exactly [].
      
      OUTPUT FORMAT: [{"merchant": "...", "amount": 123.45, "category": "...", "date": "YYYY-MM-DD", "sourceId": "..."}]
      
      EMAIL DATA:
      ${validDetails.map(e => `[Gmail ID: ${e.id}] FROM: ${e.from} | DATE: ${e.date} | SUBJECT: ${e.subject} | SNIPPET: ${e.snippet}`).join("\n")}
    `;

    const result = await model.generateContent(prompt);
    const text = await result.response.text();
    const extractedExpenses = parseAIJson(text);
    
    console.log(`[FinanceSync] AI identified ${extractedExpenses.length} transactions.`);

    // 3. Upsert into Database
    let syncCount = 0;
    for (const exp of extractedExpenses) {
      if (!exp.amount || !exp.merchant || !exp.sourceId) continue;
      
      try {
        await prisma.expense.upsert({
          where: { sourceId: exp.sourceId },
          update: {}, 
          create: {
            amount: parseFloat(exp.amount),
            merchant: exp.merchant,
            category: exp.category || "Bills",
            date: new Date(exp.date || new Date()),
            sourceId: exp.sourceId,
            sourceType: "GMAIL",
            userId: user.id
          }
        });
        syncCount++;
      } catch (e) {
        console.warn(`[FinanceSync] Failed to upsert ${exp.sourceId}:`, e);
      }
    }

    return NextResponse.json({ 
      success: true, 
      count: syncCount, 
      message: `Successfully synced ${syncCount} transactions from Gmail.` 
    });

  } catch (error: any) {
    console.error("[FinanceSync] ERROR:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    const userEmail = session?.user?.email;
    if (!userEmail) return NextResponse.json({ expenses: [] });

    const user = await prisma.user.findUnique({ where: { email: userEmail } });
    if (!user) return NextResponse.json({ expenses: [] });

    const expenses = await prisma.expense.findMany({
      where: { userId: user.id },
      orderBy: { date: 'desc' },
      take: 20
    });

    return NextResponse.json({ expenses });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

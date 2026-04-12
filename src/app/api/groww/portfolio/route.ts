import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const apiKey = process.env.GROWW_API_KEY;
  const apiSecret = process.env.GROWW_API_SECRET;

  // Fallback for Demo/Setup mode
  if (!apiKey || apiKey === "your_groww_key_here") {
    return NextResponse.json({
      status: "demo",
      timestamp: new Date().toISOString(),
      summary: {
        totalValue: 12450000,
        unrealizedGain: 520000,
        gainPercentage: 4.35
      },
      stocks: {
        value: 6225000,
        weight: 50,
        holdings: [
          { symbol: "RELIANCE", qty: 45, price: 2950, change: "+1.2%" },
          { symbol: "TCS", qty: 20, price: 3850, change: "-0.5%" },
          { symbol: "HDFC BANK", qty: 110, price: 1450, change: "+0.8%" }
        ]
      },
      mutualFunds: {
        value: 6225000,
        weight: 50,
        funds: [
          { name: "Quant Small Cap", nav: 210, value: 2500000, returns: "24.5%" },
          { name: "Parag Parikh Flexi", nav: 72, value: 2200000, returns: "18.2%" },
          { name: "UTI Nifty 50 Index", nav: 145, value: 1525000, returns: "12.8%" }
        ]
      }
    });
  }

  try {
    // REAL INTEGRATION LOGIC:
    // This would typically use the Groww SDK or direct REST calls to:
    // https://api.groww.in/v1/portfolio/holdings
    // For now, we return the structure to the UI expects.
    
    return NextResponse.json({ 
       error: "Connection Pending", 
       details: "Please ensure your Groww API Key and Secret are active." 
    }, { status: 503 });

  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

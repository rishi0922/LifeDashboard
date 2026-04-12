import { NextResponse } from "next/server";

export async function GET() {
  const symbols = ["^NSEI", "^BSESN", "BTC-USD"];
  
  try {
    const results = await Promise.all(
      symbols.map(async (sym) => {
        try {
          const res = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${sym}?interval=1d&range=1d`, {
             next: { revalidate: 30 } // Cache for 30s
          });
          const data = await res.json();
          const meta = data.chart.result[0].meta;
          
          // Use chartPreviousClose for the most reliable daily change baseline
          const current = meta.regularMarketPrice || meta.previousClose;
          const baseline = meta.chartPreviousClose || meta.previousClose || current;
          const change = current - baseline;
          const changePercent = baseline !== 0 ? (change / baseline) * 100 : 0;
          
          // Enhanced logic for market state (Bitcoin is 24/7)
          const isCrypto = sym.includes("-USD");
          const rawState = meta.marketState;
          const isActive = isCrypto || rawState === "REGULAR";

          return {
            symbol: sym,
            name: sym === "^NSEI" ? "NIFTY 50" : sym === "^BSESN" ? "SENSEX" : "Bitcoin",
            price: current.toLocaleString('en-IN', { 
              minimumFractionDigits: 2, 
              maximumFractionDigits: 2 
            }),
            change: `${changePercent >= 0 ? '+' : ''}${changePercent.toFixed(2)}%`,
            up: changePercent >= 0,
            state: isActive ? "LIVE" : "CLOSED"
          };
        } catch (e) {
          console.error(`Failed to fetch ${sym}`, e);
          return null;
        }
      })
    );

    const filtered = results.filter(r => r !== null);

    return NextResponse.json({
      timestamp: new Date().toISOString(),
      market: filtered
    });

  } catch (error: any) {
    console.error("Market Hub Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

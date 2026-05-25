import { NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { getRobustModel } from "@/lib/gemini";

interface NewsItem {
  title: string;
  link: string;
  pubDate: string;
  description: string;
  source: string;
}

interface NewsData {
  tech: NewsItem[];
  finance: NewsItem[];
  general: NewsItem[];
}

// In-memory simple cache to avoid spamming Google News RSS feeds
let newsCache: {
  timestamp: number;
  data: NewsData;
} | null = null;

const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

function parseRss(xmlText: string, defaultSource: string): NewsItem[] {
  const items: NewsItem[] = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let match;

  while ((match = itemRegex.exec(xmlText)) !== null) {
    const itemContent = match[1];

    const extract = (tag: string) => {
      const tagRegex = new RegExp(`<${tag}>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?</${tag}>`, 'i');
      const m = itemContent.match(tagRegex);
      if (!m) return '';
      return m[1]
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        .trim();
    };

    const title = extract('title');
    const link = extract('link');
    const pubDate = extract('pubDate');
    const description = extract('description');

    // Extract source if available (Google News specific)
    const sourceMatch = itemContent.match(/<source[^>]*>(?:<!\\[CDATA\\[)?([\s\S]*?)(?:\\]\\]>)?<\/source>/i);
    const source = sourceMatch ? sourceMatch[1].trim() : defaultSource;

    // Clean description: remove HTML and trim
    let cleanDesc = description.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim();
    if (cleanDesc.length > 150) {
      cleanDesc = cleanDesc.slice(0, 150) + '...';
    }

    if (title && link) {
      items.push({
        title,
        link,
        pubDate: pubDate ? new Date(pubDate).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : '',
        description: cleanDesc || 'Click to view full coverage.',
        source
      });
    }
  }
  return items.slice(0, 8); // Return top 8 items per category
}

const FALLBACK_NEWS: NewsData = {
  tech: [
    { title: "Next.js 16 Released with Improved Server Actions", link: "https://nextjs.org/blog", pubDate: "Today", description: "Next.js introduces revolutionary partial pre-rendering and fine-grained React Server Components compilation features.", source: "NextJS Blog" },
    { title: "OpenAI Announces Advanced Custom Agent Capabilities", link: "https://openai.com", pubDate: "Yesterday", description: "Developers can now build deeply integrated multi-agent workflows with state sharing and structured memory retention.", source: "TechCrunch" },
    { title: "Gemini 3.5 Flash Model Dominates Speed Benchmarks", link: "https://deepmind.google", pubDate: "2 days ago", description: "Google releases the 3.5 Flash model with massive token throughput and near-zero latency for edge operations.", source: "Google DeepMind" }
  ],
  finance: [
    { title: "Global Stock Markets Stabilize Post Inflation Index Report", link: "https://finance.yahoo.com", pubDate: "Today", description: "Main indices report steady growth as core inflation drops to target 2% levels, lifting technology stocks.", source: "Bloomberg" },
    { title: "Venture Capital Funding Surges in AI Infrastructure Startups", link: "https://techcrunch.com", pubDate: "Yesterday", description: "Over $12B raised in Q1 alone for startups building customized silicon chips and specialized AI workloads.", source: "Wall Street Journal" }
  ],
  general: [
    { title: "James Webb Telescope Discovers Atmospheres on Exo-Planets", link: "https://nasa.gov", pubDate: "Today", description: "Spectroscopy data indicates carbon dioxide and water vapor signatures on a super-Earth in the goldilocks zone.", source: "NASA Space" },
    { title: "Global Clean Energy Initiative Reaches Milestone Milestone", link: "https://reuters.com", pubDate: "Yesterday", description: "Solar and wind output exceeds coal power generation in major economic zones for the consecutive second quarter.", source: "Reuters" }
  ]
};

export async function GET() {
  try {
    // Return cache if fresh
    if (newsCache && Date.now() - newsCache.timestamp < CACHE_TTL) {
      return NextResponse.json(newsCache.data);
    }

    const categories = [
      { key: "tech" as const, url: "https://news.google.com/rss/search?q=technology&hl=en-US&gl=US&ceid=US:en", defaultSource: "Tech News" },
      { key: "finance" as const, url: "https://news.google.com/rss/search?q=finance&hl=en-US&gl=US&ceid=US:en", defaultSource: "Finance News" },
      { key: "general" as const, url: "https://news.google.com/rss?hl=en-US&gl=US&ceid=US:en", defaultSource: "Global News" }
    ];

    const results = await Promise.allSettled(
      categories.map(async (cat) => {
        const res = await fetch(cat.url, {
          cache: "no-store",
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
          }
        });
        if (!res.ok) throw new Error(`HTTP Error ${res.status}`);
        const text = await res.text();
        return parseRss(text, cat.defaultSource);
      })
    );

    const data: NewsData = { tech: [], finance: [], general: [] };

    categories.forEach((cat, index) => {
      const result = results[index];
      if (result.status === "fulfilled" && result.value.length > 0) {
        data[cat.key] = result.value;
      } else {
        const reason = result.status === "rejected" ? result.reason : "Unknown error";
        console.warn(`[News API] Failed to fetch feed for '${cat.key}', using fallbacks:`, reason);
        data[cat.key] = FALLBACK_NEWS[cat.key];
      }
    });

    // Save in cache
    newsCache = {
      timestamp: Date.now(),
      data
    };

    return NextResponse.json(data);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error("[News Proxy] Error:", msg);
    return NextResponse.json(FALLBACK_NEWS);
  }
}

export async function POST(req: Request) {
  try {
    const { headlines } = await req.json();
    if (!headlines || !Array.isArray(headlines) || headlines.length === 0) {
      return NextResponse.json({ error: "No headlines provided" }, { status: 400 });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "GEMINI_API_KEY not configured" }, { status: 500 });
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = await getRobustModel(genAI);

    const prompt = `
You are a top-tier executive assistant. Summarize the following news headlines into a clean, highly professional, 3-bullet morning intelligence briefing.
Keep it extremely concise (max 2 sentences per bullet), engaging, and action-oriented for a busy professional.
Focus on grouping related news and drawing quick insights rather than listing single headlines.

Headlines:
${headlines.map((h: string, idx: number) => `${idx + 1}. ${h}`).join("\n")}

Format the response strictly with 3 bullet points starting with modern emojis. Do not output markdown other than bold text. Do not output intro or outro.
`;

    const response = await model.generateContent(prompt);
    const text = response.response.text();

    return NextResponse.json({ briefing: text.trim() });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to generate AI Briefing";
    console.error("[News Briefing Error]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { getRobustModel, parseAIJson } from "@/lib/gemini";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

interface NewsItem {
  title: string;
  link: string;
  pubDate: string;
  description: string;
  source: string;
  category?: string;
  reason?: string; // Personalization reason
}

interface NewsData {
  tech: NewsItem[];
  finance: NewsItem[];
  general: NewsItem[];
  f1: NewsItem[];
  cricket: NewsItem[];
  government: NewsItem[];
  forYou: NewsItem[];
}

interface NewsProfile {
  categories: Record<string, number>;
  keywords: Record<string, number>;
}

const DEFAULT_PROFILE: NewsProfile = {
  categories: { tech: 1.0, finance: 1.0, f1: 1.0, cricket: 1.0, government: 1.0, general: 1.0 },
  keywords: {
    "lando": 2.5,
    "norris": 2.5,
    "mclaren": 2.5,
    "cricket": 2.0,
    "bcci": 2.0,
    "ipl": 2.0,
    "government": 1.5,
    "policy": 1.5,
    "finance": 1.5,
    "economy": 1.5,
    "sensex": 1.5
  }
};

// In-memory cache to avoid spamming Google News RSS feeds
let newsCache: {
  timestamp: number;
  data: Omit<NewsData, "forYou">;
} | null = null;

const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

async function getOrCreateUser() {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email;
  if (email) {
    return prisma.user.upsert({
      where: { email },
      update: {},
      create: {
        email,
        name: session.user?.name || email.split("@")[0],
      },
    });
  }
  let user = await prisma.user.findFirst();
  if (!user) {
    user = await prisma.user.create({
      data: { name: "Chief", email: "dummy@local.dev" }
    });
  }
  return user;
}

async function getNewsProfile(userId: string): Promise<NewsProfile> {
  const pref = await prisma.userPreference.findUnique({
    where: {
      userId_key: {
        userId,
        key: "news_profile"
      }
    }
  });
  if (!pref) return DEFAULT_PROFILE;
  try {
    const parsed = JSON.parse(pref.value);
    return {
      categories: { ...DEFAULT_PROFILE.categories, ...parsed.categories },
      keywords: { ...DEFAULT_PROFILE.keywords, ...parsed.keywords }
    };
  } catch {
    return DEFAULT_PROFILE;
  }
}

async function saveNewsProfile(userId: string, profile: NewsProfile) {
  await prisma.userPreference.upsert({
    where: {
      userId_key: {
        userId,
        key: "news_profile"
      }
    },
    update: {
      value: JSON.stringify(profile)
    },
    create: {
      userId,
      key: "news_profile",
      value: JSON.stringify(profile)
    }
  });
}

function extractKeywords(title: string): string[] {
  const STOP_WORDS = new Set([
    "the", "a", "an", "and", "or", "but", "in", "on", "at", "to", "for", "with", 
    "by", "of", "from", "is", "are", "was", "were", "be", "been", "have", "has", 
    "had", "do", "does", "did", "that", "this", "these", "those", "it", "its", 
    "they", "them", "their", "we", "us", "our", "you", "your", "i", "my", "me",
    "he", "him", "his", "she", "her", "who", "whom", "which", "what", "how", 
    "why", "where", "when", "about", "above", "after", "again", "against", "all",
    "am", "any", "as", "at", "because", "before", "being", "below", "between", 
    "both", "during", "each", "few", "more", "most", "other", "some", "such", 
    "than", "too", "very", "can", "will", "just", "should", "now", "vs", "versus"
  ]);
  
  return title
    .toLowerCase()
    .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?"']/g, "")
    .split(/\s+/)
    .filter(w => w.length > 2 && !STOP_WORDS.has(w));
}

function parseRss(xmlText: string, defaultSource: string, category: string): NewsItem[] {
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

    const sourceMatch = itemContent.match(/<source[^>]*>(?:<!\\[CDATA\\[)?([\s\S]*?)(?:\\]\\]>)?<\/source>/i);
    const source = sourceMatch ? sourceMatch[1].trim() : defaultSource;

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
        source,
        category
      });
    }
  }
  return items.slice(0, 10);
}

const FALLBACK_NEWS: Omit<NewsData, "forYou"> = {
  tech: [
    { title: "Next.js 16 Released with Improved Server Actions", link: "https://nextjs.org/blog", pubDate: "Today", description: "Next.js introduces revolutionary partial pre-rendering and fine-grained React Server Components compilation features.", source: "NextJS Blog", category: "tech" }
  ],
  finance: [
    { title: "Sensex Surges 800 Points on Infrastructure Growth", link: "https://finance.yahoo.com", pubDate: "Today", description: "Indian markets hit historic highs as foreign institutional investment returns to major bluechip stocks.", source: "Economic Times", category: "finance" }
  ],
  general: [
    { title: "James Webb Telescope Discovers Atmospheres on Exo-Planets", link: "https://nasa.gov", pubDate: "Today", description: "Spectroscopy data indicates carbon dioxide and water vapor signatures on a super-Earth in the goldilocks zone.", source: "NASA Space", category: "general" }
  ],
  f1: [
    { title: "Lando Norris Secures Front Row for Monaco Grand Prix", link: "https://formula1.com", pubDate: "Today", description: "McLaren star Lando Norris outpaces Ferrari to secure P2 in Monaco qualifying, setting up a thrilling race.", source: "ESPN F1", category: "f1" }
  ],
  cricket: [
    { title: "IPL 2026: Kohli Smashes Century to Seal Thrilling Run Chase", link: "https://cricinfo.com", pubDate: "Today", description: "A masterclass knock of 104* helps guide his team to victory in a packed stadium.", source: "Cricinfo", category: "cricket" }
  ],
  government: [
    { title: "Union Cabinet Approves New Clean Energy Infrastructure Subsidy", link: "https://pib.gov.in", pubDate: "Today", description: "Indian government commits $5B towards domestic manufacture of solar panels and micro-grid storage solutions.", source: "PIB Delhi", category: "government" }
  ]
};

export async function GET() {
  try {
    const user = await getOrCreateUser();
    const profile = await getNewsProfile(user.id);

    // 1. Resolve RSS Feeds Cache
    let cachedFeeds = newsCache?.data;
    if (!newsCache || Date.now() - newsCache.timestamp < CACHE_TTL) {
      const categories = [
        { key: "tech" as const, url: "https://news.google.com/rss/search?q=technology&hl=en-US&gl=US&ceid=US:en", defaultSource: "Tech News" },
        { key: "finance" as const, url: "https://news.google.com/rss/search?q=indian%20finance%20OR%20indian%20economy%20OR%20sensex&hl=en-IN&gl=IN&ceid=IN:en", defaultSource: "Indian Finance" },
        { key: "general" as const, url: "https://news.google.com/rss?hl=en-US&gl=US&ceid=US:en", defaultSource: "Global News" },
        { key: "f1" as const, url: "https://news.google.com/rss/search?q=Formula%201%20OR%20F1%20OR%20McLaren%20F1%20OR%20Lando%20Norris&hl=en-US&gl=US&ceid=US:en", defaultSource: "Formula 1" },
        { key: "cricket" as const, url: "https://news.google.com/rss/search?q=indian%20cricket%20OR%20BCCI%20OR%20ipl&hl=en-IN&gl=IN&ceid=IN:en", defaultSource: "Indian Cricket" },
        { key: "government" as const, url: "https://news.google.com/rss/search?q=india%20government%20OR%20pib%20OR%20union%20cabinet%20OR%20modi%20government&hl=en-IN&gl=IN&ceid=IN:en", defaultSource: "Government News" }
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
          return parseRss(text, cat.defaultSource, cat.key);
        })
      );

      const fetchedData: Omit<NewsData, "forYou"> = {
        tech: [], finance: [], general: [], f1: [], cricket: [], government: []
      };

      categories.forEach((cat, index) => {
        const result = results[index];
        if (result.status === "fulfilled" && result.value.length > 0) {
          fetchedData[cat.key] = result.value;
        } else {
          const reason = result.status === "rejected" ? result.reason : "Empty response";
          console.warn(`[News API] Fallback used for '${cat.key}':`, reason);
          fetchedData[cat.key] = FALLBACK_NEWS[cat.key];
        }
      });

      newsCache = {
        timestamp: Date.now(),
        data: fetchedData
      };
      cachedFeeds = fetchedData;
    }

    if (!cachedFeeds) cachedFeeds = FALLBACK_NEWS;

    // 2. Perform Heuristic Ranking for "For You" Section
    const allArticles = [
      ...cachedFeeds.tech,
      ...cachedFeeds.finance,
      ...cachedFeeds.general,
      ...cachedFeeds.f1,
      ...cachedFeeds.cricket,
      ...cachedFeeds.government
    ];

    const scoredArticles = allArticles.map(item => {
      const cat = item.category || "general";
      let score = profile.categories[cat] || 1.0;

      const keywords = extractKeywords(item.title);
      keywords.forEach(w => {
        if (profile.keywords[w] !== undefined) {
          score += profile.keywords[w];
        }
      });

      return { item, score };
    });

    // Sort by score descending and take top 12 candidates
    scoredArticles.sort((a, b) => b.score - a.score);
    const topCandidates = scoredArticles.slice(0, 12).map(sa => sa.item);

    // 3. AI Curation: Select top 5 and write custom personalization reasons
    interface AISelection {
      id: number;
      reason: string;
    }

    let forYouFeed: NewsItem[] = [];
    const apiKey = process.env.GEMINI_API_KEY;
    if (apiKey && topCandidates.length > 0) {
      try {
        const genAI = new GoogleGenerativeAI(apiKey);
        const model = await getRobustModel(genAI);

        // Filter out low weight keywords to keep prompt size small
        const highKeywords = Object.entries(profile.keywords)
          .filter(([, w]) => w > 1.2)
          .map(([k]) => k);
        const lowKeywords = Object.entries(profile.keywords)
          .filter(([, w]) => w < 0.8)
          .map(([k]) => k);

        const prompt = `
You are a news personalization engine.
User Interests Profile:
- Categories weights: ${JSON.stringify(profile.categories)}
- Liked Keywords: ${JSON.stringify(highKeywords)}
- Disliked Keywords: ${JSON.stringify(lowKeywords)}

Select the 5 most relevant articles from the candidate list below.
For each selected article, provide a brief, professional 1-sentence personalization note (max 10 words) explaining why it fits their profile (e.g. "Matches your F1 interest" or "Relevant to Sensex tracking").

Candidates:
${topCandidates.map((a, idx) => `[ID: ${idx}] Title: ${a.title} | Cat: ${a.category} | Desc: ${a.description}`).join("\n")}

Respond ONLY in JSON format as an array of objects:
[
  { "id": number, "reason": "string" }
]
`;

        const response = await model.generateContent(prompt);
        const parsed = parseAIJson(response.response.text());

        if (Array.isArray(parsed)) {
          const selectedSet = new Set<number>();
          parsed.forEach((select: AISelection) => {
            const idx = Number(select.id);
            if (idx >= 0 && idx < topCandidates.length && !selectedSet.has(idx)) {
              selectedSet.add(idx);
              const article = { ...topCandidates[idx] };
              article.reason = select.reason || `Relevant to your interest in ${article.category}`;
              forYouFeed.push(article);
            }
          });
        }
      } catch {
        console.warn("[For You AI Curation Failed] Using heuristics fallback");
      }
    }

    // Fallback if AI curation failed or was skipped: pick top 5 heuristic scored items
    if (forYouFeed.length === 0) {
      forYouFeed = topCandidates.slice(0, 5).map(item => ({
        ...item,
        reason: `Recommended based on your interest in ${item.category || "general"}`
      }));
    }

    const payload: NewsData = {
      ...cachedFeeds,
      forYou: forYouFeed
    };

    return NextResponse.json(payload);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error("[News Proxy GET] Error:", msg);
    return NextResponse.json({
      ...FALLBACK_NEWS,
      forYou: FALLBACK_NEWS.tech.map(item => ({ ...item, reason: "Fallback feed loaded" }))
    });
  }
}

export async function PATCH(req: Request) {
  try {
    const user = await getOrCreateUser();
    const { action, category, title } = await req.json();

    if (!action || !category || !title) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const profile = await getNewsProfile(user.id);
    
    // Adjust weights
    const categoryDelta = action === "click" ? 0.2 : -0.3;
    const keywordDelta = action === "click" ? 0.3 : -0.5;

    // Update Category Weight
    if (profile.categories[category] === undefined) {
      profile.categories[category] = 1.0;
    }
    profile.categories[category] = Math.max(0.1, Math.min(3.0, profile.categories[category] + categoryDelta));

    // Update Keyword Weights
    const keywords = extractKeywords(title);
    keywords.forEach(w => {
      if (profile.keywords[w] === undefined) {
        profile.keywords[w] = 1.0;
      }
      profile.keywords[w] = Math.max(0.1, Math.min(5.0, profile.keywords[w] + keywordDelta));
    });

    await saveNewsProfile(user.id, profile);

    return NextResponse.json({ success: true, profile });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error("[News Proxy PATCH] Error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
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

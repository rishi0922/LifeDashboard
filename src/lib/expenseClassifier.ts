/**
 * Expense Classifier
 * ------------------
 * Deterministic merchant -> category mapping with a keyword fallback, used
 * BEFORE we call Gemini. This has two benefits:
 *
 *   1. Reliability — common Indian merchants (Swiggy, Zomato, Uber, etc.)
 *      always get the right category, even if Gemini hiccups or returns
 *      malformed JSON.
 *   2. Cost / rate-limit — we only spend AI tokens on the ambiguous
 *      long-tail, not on obvious transactions.
 *
 * Public API:
 *   - classifyExpense(input)   → ClassifierResult (rule-based best-effort)
 *   - extractAmount(text)      → first plausible INR amount in a string
 *   - extractPaymentMode(text) → UPI / CARD / NETBANKING / WALLET / CASH
 *   - isLikelyExpense(text)    → heuristic "is this a real debit email?"
 *   - isRefundOrCredit(text)   → heuristic to filter out refunds / credits
 */

export type ExpenseCategory =
  | "Food"
  | "Groceries"
  | "Travel"
  | "Bills"
  | "Shopping"
  | "Entertainment"
  | "Subscription"
  | "Investment"
  | "Health"
  | "Transfer"
  | "Other";

export interface ClassifierResult {
  category: ExpenseCategory;
  subcategory?: string;
  merchant?: string;
  confidence: number; // 0..1
  method: "rule" | "keyword" | "unknown";
}

/**
 * High-precision merchant map. Keys are lowercase substrings to match against
 * the combined "from + subject + snippet" text.
 */
const MERCHANT_RULES: Array<{
  patterns: string[];
  category: ExpenseCategory;
  subcategory: string;
  merchant: string;
}> = [
  // Food delivery
  { patterns: ["swiggy"], category: "Food", subcategory: "food_delivery", merchant: "Swiggy" },
  { patterns: ["zomato"], category: "Food", subcategory: "food_delivery", merchant: "Zomato" },
  { patterns: ["eatsure", "eat.sure"], category: "Food", subcategory: "food_delivery", merchant: "EatSure" },
  { patterns: ["dominos", "domino's"], category: "Food", subcategory: "dining_out", merchant: "Domino's" },
  { patterns: ["mcdonald", "mcdelivery"], category: "Food", subcategory: "dining_out", merchant: "McDonald's" },
  { patterns: ["kfc"], category: "Food", subcategory: "dining_out", merchant: "KFC" },
  { patterns: ["starbucks"], category: "Food", subcategory: "cafe", merchant: "Starbucks" },
  { patterns: ["chaayos"], category: "Food", subcategory: "cafe", merchant: "Chaayos" },
  { patterns: ["third wave coffee"], category: "Food", subcategory: "cafe", merchant: "Third Wave Coffee" },

  // Groceries
  { patterns: ["blinkit", "grofers"], category: "Groceries", subcategory: "quick_commerce", merchant: "Blinkit" },
  { patterns: ["zepto"], category: "Groceries", subcategory: "quick_commerce", merchant: "Zepto" },
  { patterns: ["instamart", "swiggy instamart"], category: "Groceries", subcategory: "quick_commerce", merchant: "Swiggy Instamart" },
  { patterns: ["bigbasket", "big basket"], category: "Groceries", subcategory: "grocery", merchant: "BigBasket" },
  { patterns: ["dmart ready", "dmart"], category: "Groceries", subcategory: "grocery", merchant: "DMart" },
  { patterns: ["licious"], category: "Groceries", subcategory: "meat", merchant: "Licious" },

  // Travel / Ride-hailing
  { patterns: ["uber"], category: "Travel", subcategory: "ride_hailing", merchant: "Uber" },
  { patterns: ["ola cabs", "ola "], category: "Travel", subcategory: "ride_hailing", merchant: "Ola" },
  { patterns: ["rapido"], category: "Travel", subcategory: "ride_hailing", merchant: "Rapido" },
  { patterns: ["namma yatri"], category: "Travel", subcategory: "ride_hailing", merchant: "Namma Yatri" },
  { patterns: ["indigo", "6e "], category: "Travel", subcategory: "flight", merchant: "IndiGo" },
  { patterns: ["air india"], category: "Travel", subcategory: "flight", merchant: "Air India" },
  { patterns: ["akasa"], category: "Travel", subcategory: "flight", merchant: "Akasa Air" },
  { patterns: ["vistara"], category: "Travel", subcategory: "flight", merchant: "Vistara" },
  { patterns: ["makemytrip", "make my trip"], category: "Travel", subcategory: "booking", merchant: "MakeMyTrip" },
  { patterns: ["goibibo"], category: "Travel", subcategory: "booking", merchant: "Goibibo" },
  { patterns: ["ixigo"], category: "Travel", subcategory: "booking", merchant: "ixigo" },
  { patterns: ["irctc"], category: "Travel", subcategory: "train", merchant: "IRCTC" },
  { patterns: ["redbus"], category: "Travel", subcategory: "bus", merchant: "RedBus" },
  { patterns: ["oyo"], category: "Travel", subcategory: "hotel", merchant: "OYO" },

  // Bills / Utilities
  { patterns: ["airtel"], category: "Bills", subcategory: "telecom", merchant: "Airtel" },
  { patterns: ["jio"], category: "Bills", subcategory: "telecom", merchant: "Jio" },
  { patterns: ["vi ", "vodafone", "vi postpaid"], category: "Bills", subcategory: "telecom", merchant: "Vi" },
  { patterns: ["bescom", "tata power", "adani electricity", "bses", "msedcl"], category: "Bills", subcategory: "electricity", merchant: "Electricity Board" },
  { patterns: ["act fibernet", "act broadband"], category: "Bills", subcategory: "internet", merchant: "ACT Fibernet" },
  { patterns: ["piped natural gas", "mahanagar gas", "igl"], category: "Bills", subcategory: "gas", merchant: "Gas Utility" },
  { patterns: ["bbmp"], category: "Bills", subcategory: "property_tax", merchant: "BBMP" },

  // Subscriptions / Entertainment
  { patterns: ["netflix"], category: "Subscription", subcategory: "ott", merchant: "Netflix" },
  { patterns: ["spotify"], category: "Subscription", subcategory: "music", merchant: "Spotify" },
  { patterns: ["apple.com/bill", "apple services"], category: "Subscription", subcategory: "app_store", merchant: "Apple" },
  { patterns: ["google one", "google.*storage", "google play"], category: "Subscription", subcategory: "cloud", merchant: "Google" },
  { patterns: ["amazon prime"], category: "Subscription", subcategory: "ott", merchant: "Amazon Prime" },
  { patterns: ["hotstar", "disney+"], category: "Subscription", subcategory: "ott", merchant: "Hotstar" },
  { patterns: ["sonyliv"], category: "Subscription", subcategory: "ott", merchant: "SonyLIV" },
  { patterns: ["youtube premium", "youtube music"], category: "Subscription", subcategory: "ott", merchant: "YouTube Premium" },
  { patterns: ["chatgpt", "openai"], category: "Subscription", subcategory: "saas", merchant: "OpenAI" },
  { patterns: ["claude.ai", "anthropic"], category: "Subscription", subcategory: "saas", merchant: "Anthropic" },
  { patterns: ["github"], category: "Subscription", subcategory: "saas", merchant: "GitHub" },
  { patterns: ["notion"], category: "Subscription", subcategory: "saas", merchant: "Notion" },
  { patterns: ["figma"], category: "Subscription", subcategory: "saas", merchant: "Figma" },
  { patterns: ["bookmyshow"], category: "Entertainment", subcategory: "movies_events", merchant: "BookMyShow" },
  { patterns: ["pvr", "inox"], category: "Entertainment", subcategory: "movies", merchant: "PVR INOX" },

  // Shopping
  { patterns: ["amazon.in", "amazon order", "amzn"], category: "Shopping", subcategory: "ecommerce", merchant: "Amazon" },
  { patterns: ["flipkart"], category: "Shopping", subcategory: "ecommerce", merchant: "Flipkart" },
  { patterns: ["myntra"], category: "Shopping", subcategory: "fashion", merchant: "Myntra" },
  { patterns: ["ajio"], category: "Shopping", subcategory: "fashion", merchant: "Ajio" },
  { patterns: ["meesho"], category: "Shopping", subcategory: "ecommerce", merchant: "Meesho" },
  { patterns: ["nykaa"], category: "Shopping", subcategory: "beauty", merchant: "Nykaa" },
  { patterns: ["ikea"], category: "Shopping", subcategory: "home", merchant: "IKEA" },
  { patterns: ["decathlon"], category: "Shopping", subcategory: "sports", merchant: "Decathlon" },

  // Investments
  { patterns: ["groww"], category: "Investment", subcategory: "broker", merchant: "Groww" },
  { patterns: ["zerodha", "kite.zerodha"], category: "Investment", subcategory: "broker", merchant: "Zerodha" },
  { patterns: ["upstox"], category: "Investment", subcategory: "broker", merchant: "Upstox" },
  { patterns: ["indmoney", "ind money"], category: "Investment", subcategory: "broker", merchant: "INDmoney" },
  { patterns: ["kuvera"], category: "Investment", subcategory: "mutual_fund", merchant: "Kuvera" },
  { patterns: ["coin.dcx", "coindcx"], category: "Investment", subcategory: "crypto", merchant: "CoinDCX" },
  { patterns: ["wazirx"], category: "Investment", subcategory: "crypto", merchant: "WazirX" },

  // Health
  { patterns: ["practo"], category: "Health", subcategory: "doctor", merchant: "Practo" },
  { patterns: ["1mg", "tata 1mg"], category: "Health", subcategory: "pharmacy", merchant: "1mg" },
  { patterns: ["pharmeasy"], category: "Health", subcategory: "pharmacy", merchant: "PharmEasy" },
  { patterns: ["cult.fit", "cultfit", "cult fit"], category: "Health", subcategory: "fitness", merchant: "cult.fit" },
  { patterns: ["healthify"], category: "Health", subcategory: "fitness", merchant: "HealthifyMe" },
  { patterns: ["apollo 24/7", "apollo24"], category: "Health", subcategory: "pharmacy", merchant: "Apollo 24/7" },

  // UPI apps (treat as Transfer — real category depends on merchant inside the message; handled later)
  { patterns: ["phonepe"], category: "Transfer", subcategory: "upi", merchant: "PhonePe" },
  { patterns: ["google pay", "gpay", "googlepay"], category: "Transfer", subcategory: "upi", merchant: "Google Pay" },
  { patterns: ["paytm"], category: "Transfer", subcategory: "upi", merchant: "Paytm" },
  { patterns: ["cred"], category: "Bills", subcategory: "credit_card_bill", merchant: "CRED" },
];

/**
 * Generic keyword fallback. Runs after the merchant map. Lower confidence.
 */
const KEYWORD_RULES: Array<{ patterns: string[]; category: ExpenseCategory; subcategory: string }> = [
  { patterns: ["electricity", "power bill", "kwh"], category: "Bills", subcategory: "electricity" },
  { patterns: ["water bill", "bwssb"], category: "Bills", subcategory: "water" },
  { patterns: ["rent paid", "house rent"], category: "Bills", subcategory: "rent" },
  { patterns: ["insurance premium", "policy renewed"], category: "Bills", subcategory: "insurance" },
  { patterns: ["movie ticket", "cinema"], category: "Entertainment", subcategory: "movies" },
  { patterns: ["gym membership"], category: "Health", subcategory: "fitness" },
  { patterns: ["mutual fund", "sip installment", "sip debit"], category: "Investment", subcategory: "mutual_fund" },
  { patterns: ["flight ticket", "e-ticket"], category: "Travel", subcategory: "flight" },
  { patterns: ["hotel booking"], category: "Travel", subcategory: "hotel" },
  { patterns: ["restaurant", "cafe"], category: "Food", subcategory: "dining_out" },
  { patterns: ["grocery", "supermarket"], category: "Groceries", subcategory: "grocery" },
  { patterns: ["medicine", "pharmacy"], category: "Health", subcategory: "pharmacy" },
  { patterns: ["fuel", "petrol", "diesel"], category: "Travel", subcategory: "fuel" },
  { patterns: ["metro card", "metro recharge"], category: "Travel", subcategory: "public_transport" },
];

/** Credit / refund markers — if present, the message is NOT an expense. */
const CREDIT_MARKERS = [
  "credited to your account",
  "amount credited",
  "refund",
  "refunded",
  "cashback",
  "reversed",
  "salary credit",
  "interest credit",
  "received from",
  "successfully received",
];

/** Obvious non-transaction noise we should never even show Gemini. */
const NOISE_MARKERS = [
  "otp",
  "one time password",
  "verification code",
  "login alert",
  "security alert",
  "newsletter",
  "unsubscribe",
  "sign in from a new",
];

function norm(s: string | undefined | null): string {
  return (s || "").toLowerCase();
}

export function isRefundOrCredit(text: string): boolean {
  const t = norm(text);
  return CREDIT_MARKERS.some((k) => t.includes(k));
}

export function isLikelyExpense(text: string): boolean {
  const t = norm(text);
  if (NOISE_MARKERS.some((k) => t.includes(k))) return false;
  if (isRefundOrCredit(t)) return false;
  // Must contain a debit keyword AND a currency marker
  const hasDebit =
    /\b(debited|spent|paid|purchased|charged|payment of|txn|transaction|order confirmed|placed order|booked|debit)\b/.test(
      t
    );
  const hasAmount = /(rs\.?|inr|₹)\s?\d|\d+\s?(rs|inr)/i.test(text);
  return hasDebit && hasAmount;
}

export function extractAmount(text: string): number | null {
  // Matches: ₹1,234.56 | Rs. 1234 | INR 1,234 | 1234 INR
  const patterns = [
    /(?:₹|rs\.?\s*|inr\s*)\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)/i,
    /([0-9][0-9,]*(?:\.[0-9]{1,2})?)\s*(?:rs\.?|inr)\b/i,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m && m[1]) {
      const v = parseFloat(m[1].replace(/,/g, ""));
      if (!isNaN(v) && v > 0 && v < 10_00_00_000) return v; // sanity cap
    }
  }
  return null;
}

export function extractPaymentMode(text: string): string | null {
  const t = norm(text);
  if (/\bupi\b|vpa|@ok|@ybl|@axl|@hdfc|@icici/.test(t)) return "UPI";
  if (/\bcredit card\b|cc\s*ending|xx\d{4}/.test(t)) return "CARD";
  if (/\bdebit card\b/.test(t)) return "CARD";
  if (/net\s?banking|imps|neft|rtgs/.test(t)) return "NETBANKING";
  if (/wallet|paytm wallet|mobikwik/.test(t)) return "WALLET";
  return null;
}

/**
 * Rule-based classifier. Returns the best-matching category, with a
 * confidence score. Callers can decide to trust the rule or ask Gemini for a
 * second opinion when confidence is low.
 */
export function classifyExpense(input: {
  from?: string;
  subject?: string;
  snippet?: string;
}): ClassifierResult {
  const haystack = norm(`${input.from} ${input.subject} ${input.snippet}`);

  // 1) Merchant map (highest precision)
  for (const rule of MERCHANT_RULES) {
    if (rule.patterns.some((p) => haystack.includes(p))) {
      return {
        category: rule.category,
        subcategory: rule.subcategory,
        merchant: rule.merchant,
        confidence: 0.92,
        method: "rule",
      };
    }
  }

  // 2) Generic keyword match (lower precision)
  for (const rule of KEYWORD_RULES) {
    if (rule.patterns.some((p) => haystack.includes(p))) {
      return {
        category: rule.category,
        subcategory: rule.subcategory,
        confidence: 0.6,
        method: "keyword",
      };
    }
  }

  // 3) Nothing matched — caller should defer to AI or "Other"
  return { category: "Other", confidence: 0, method: "unknown" };
}

/**
 * Detect recurring subscriptions by looking at merchant + amount recurrence.
 * Returns true when the same merchant has charged the same-ish amount in a
 * previous month window. (Stateless helper — caller provides prior expenses.)
 */
export function looksRecurring(
  current: { merchant: string; amount: number },
  prior: Array<{ merchant: string; amount: number; date: Date | string }>
): boolean {
  const m = norm(current.merchant);
  const now = Date.now();
  return prior.some((p) => {
    if (norm(p.merchant) !== m) return false;
    const t = new Date(p.date).getTime();
    const days = (now - t) / 86_400_000;
    if (days < 20 || days > 45) return false;
    const amtClose = Math.abs(p.amount - current.amount) / Math.max(current.amount, 1) < 0.05;
    return amtClose;
  });
}

// ─── Cross-email Dedup Helpers ───────────────────────────────────────────────

/**
 * Financial intermediary senders. Emails from these domains are "forwarding"
 * notifications about a spend that the actual merchant already emailed about.
 * When detected, we try to extract the real merchant from the email body and
 * flag the email for fingerprint dedup.
 */
export const INTERMEDIARY_SENDERS: Array<{
  pattern: string;
  name: string;
}> = [
  // Banks
  { pattern: "hdfcbank",   name: "HDFC Bank" },
  { pattern: "axisbank",   name: "Axis Bank" },
  { pattern: "icicibank",  name: "ICICI Bank" },
  { pattern: "sbi.co.in",  name: "SBI" },
  { pattern: "kotak",      name: "Kotak" },
  { pattern: "idfcfirst",  name: "IDFC First" },
  { pattern: "indusind",   name: "IndusInd" },
  { pattern: "yesbank",    name: "Yes Bank" },
  { pattern: "rblbank",    name: "RBL Bank" },
  { pattern: "federal-bank",name: "Federal Bank" },
  // Credit card / bill-pay aggregators
  { pattern: "cred.club",  name: "CRED" },
  { pattern: "cred.in",    name: "CRED" },
  // UPI / wallet alerts (when they notify about a debit at a merchant)
  { pattern: "phonepe",    name: "PhonePe" },
  { pattern: "paytm",      name: "Paytm" },
  { pattern: "gpay",       name: "Google Pay" },
  { pattern: "googlepay",  name: "Google Pay" },
];

/**
 * Check if the email sender is a financial intermediary (bank / CRED / UPI
 * app) rather than the actual merchant.
 */
export function isIntermediarySender(from: string): boolean {
  const f = norm(from);
  return INTERMEDIARY_SENDERS.some((s) => f.includes(s.pattern));
}

/**
 * Corporate / legal entity names → consumer brand. Banks often use the
 * registered company name ("BUNDL TECHNOLOGIES") instead of the consumer
 * brand ("Swiggy"). This map normalises those.
 */
const MERCHANT_ALIASES: Record<string, string> = {
  "bundl technologies": "swiggy",
  "bundl tech": "swiggy",
  "zomato ltd": "zomato",
  "zomato limited": "zomato",
  "ani technologies": "ola",
  "uber india": "uber",
  "uber bv": "uber",
  "one97 communications": "paytm",
  "flipkart internet": "flipkart",
  "flipkart india": "flipkart",
  "amazon seller": "amazon",
  "amazon pay": "amazon",
  "cloudtail india": "amazon",
  "blinkit": "blinkit",
  "grofers": "blinkit",
  "locobuzz": "swiggy",
  "rapido bike": "rapido",
  "makemytrip india": "makemytrip",
  "ibibo group": "goibibo",
  "nykaa e-retail": "nykaa",
  "nykaa fashion": "nykaa",
  "clues network": "shopclues",
  "prione business": "amazon",
  "jio platforms": "jio",
  "bharti airtel": "airtel",
  "vodafone idea": "vi",
  "irctc web": "irctc",
  "pvr ltd": "pvr inox",
  "inox leisure": "pvr inox",
};

/**
 * Normalise a merchant name to a stable canonical form. Two emails that
 * refer to the same real-world merchant should produce the same string.
 *
 * Pipeline: lowercase → trim → strip "pvt ltd" etc → alias lookup → fallback.
 */
export function normalizeMerchant(raw: string): string {
  let m = norm(raw)
    .replace(/\b(pvt|private|ltd|limited|llp|inc|corp|technologies|tech)\b\.?/g, "")
    .replace(/\s+/g, " ")
    .trim();

  // Direct alias hit
  if (MERCHANT_ALIASES[m]) return MERCHANT_ALIASES[m];

  // Partial alias match (e.g., "bundl technologies private limited" contains "bundl technologies")
  for (const [alias, canonical] of Object.entries(MERCHANT_ALIASES)) {
    if (m.includes(alias)) return canonical;
  }

  // Check against MERCHANT_RULES — if the normalised name matches a known
  // merchant pattern, use that merchant's canonical name.
  for (const rule of MERCHANT_RULES) {
    if (rule.patterns.some((p) => m.includes(p))) {
      return norm(rule.merchant);
    }
  }

  return m;
}

/**
 * Try to extract the real merchant name from a bank / CRED email body.
 * Bank emails typically say things like:
 *   "spent at SWIGGY", "txn at UBER", "payment to BUNDL TECHNOLOGIES"
 */
export function extractMerchantFromBody(text: string): string | null {
  const t = norm(text);
  const patterns = [
    /(?:spent|paid|payment|txn|transaction)\s+(?:at|to|for|towards)\s+([a-z][a-z0-9 &.'/-]{1,40})/i,
    /(?:merchant|payee|beneficiary)\s*[:\-]?\s*([a-z][a-z0-9 &.'/-]{1,40})/i,
    /(?:purchase at|debited for)\s+([a-z][a-z0-9 &.'/-]{1,40})/i,
    /(?:at\s+)([a-z][a-z0-9 &.'/-]{1,40})(?:\s+on\s+\d)/i,
  ];

  for (const p of patterns) {
    const match = t.match(p);
    if (match && match[1]) {
      const raw = match[1].trim().replace(/\s+/g, " ");
      // Ignore if it's just a number or very short
      if (raw.length < 3 || /^\d+$/.test(raw)) continue;
      return raw;
    }
  }
  return null;
}

/**
 * Compute a stable fingerprint for an expense transaction. Two emails about
 * the same real-world spend will produce the same fingerprint, enabling
 * cross-email dedup.
 *
 * Formula: simple string hash of `userId|normalizedMerchant|amount|YYYY-MM-DD`
 */
export function computeExpenseFingerprint(params: {
  userId: string;
  merchant: string;
  amount: number;
  date: Date;
}): string {
  const nm = normalizeMerchant(params.merchant);
  const dateStr = params.date.toISOString().slice(0, 10); // YYYY-MM-DD
  const raw = `${params.userId}|${nm}|${params.amount}|${dateStr}`;

  // djb2 hash — fast, deterministic, good distribution
  let h = 5381;
  for (let i = 0; i < raw.length; i++) {
    h = ((h << 5) + h + raw.charCodeAt(i)) >>> 0;
  }
  return `efp_${h.toString(36)}`;
}

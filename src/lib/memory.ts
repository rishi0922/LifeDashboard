import { randomUUID } from "crypto";
import { prisma } from "./prisma";

/**
 * RAG memory layer — the ONLY place that knows about embeddings + pgvector.
 * Everything else calls storeMemory / deleteMemory / retrieveSimilar, so
 * the vector backend can change without touching the rest of the app.
 *
 * Backend: Gemini `gemini-embedding-001` at 768 dims, stored in the
 * MemoryChunk table (vector(768), cosine HNSW index). Reads/writes go
 * through raw SQL because Prisma doesn't model the `vector` type.
 *
 * NOTE: embeddings use a dedicated embedding model — this does NOT touch
 * the locked generation models in gemini.ts (AGENTS.md).
 */

const EMBED_MODEL = "gemini-embedding-001";
const EMBED_DIMS = 768;
const MAX_EMBED_CHARS = 6000; // keep input under the model's token limit

export type MemorySource = "note" | "chat";

type TaskType = "RETRIEVAL_DOCUMENT" | "RETRIEVAL_QUERY";

/**
 * Embed text → 768-dim vector. Throws on failure (callers decide whether
 * that's fatal — writes log & move on, reads fall back to no-memory).
 */
export async function embed(text: string, taskType: TaskType): Promise<number[]> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY not configured");

  const clean = (text || "").slice(0, MAX_EMBED_CHARS).trim();
  if (!clean) throw new Error("empty text");

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${EMBED_MODEL}:embedContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        content: { parts: [{ text: clean }] },
        outputDimensionality: EMBED_DIMS,
        taskType,
      }),
    },
  );
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`embed ${res.status}: ${detail.slice(0, 160)}`);
  }
  const data = await res.json();
  const values: number[] | undefined = data?.embedding?.values;
  if (!values || values.length !== EMBED_DIMS) {
    throw new Error(`embed returned ${values ? values.length : 0} dims (expected ${EMBED_DIMS})`);
  }
  return values;
}

/** pgvector literal, e.g. "[0.1,0.2,...]". Values are model floats — safe. */
function toVectorLiteral(v: number[]): string {
  return `[${v.join(",")}]`;
}

/**
 * Store (or refresh) one memory chunk. Deletes any existing chunk for the
 * same (userId, source, sourceId) first, so editing a note re-indexes it
 * instead of duplicating. Returns true on success.
 */
export async function storeMemory(params: {
  userId: string;
  source: MemorySource;
  sourceId: string;
  content: string;
}): Promise<boolean> {
  const { userId, source, sourceId, content } = params;
  if (!content?.trim()) return false;
  try {
    const vector = await embed(content, "RETRIEVAL_DOCUMENT");
    const literal = toVectorLiteral(vector);
    await prisma.$executeRawUnsafe(
      `DELETE FROM "MemoryChunk" WHERE "userId" = $1 AND "source" = $2 AND "sourceId" = $3`,
      userId,
      source,
      sourceId,
    );
    await prisma.$executeRawUnsafe(
      `INSERT INTO "MemoryChunk" ("id","userId","source","sourceId","content","embedding")
       VALUES ($1,$2,$3,$4,$5,$6::vector)`,
      randomUUID(),
      userId,
      source,
      sourceId,
      content.slice(0, MAX_EMBED_CHARS),
      literal,
    );
    return true;
  } catch (e) {
    console.warn("[memory] storeMemory failed:", (e as Error).message);
    return false;
  }
}

/** Remove chunks for a source (e.g. a deleted note). */
export async function deleteMemory(params: {
  userId: string;
  source: MemorySource;
  sourceId: string;
}): Promise<void> {
  try {
    await prisma.$executeRawUnsafe(
      `DELETE FROM "MemoryChunk" WHERE "userId" = $1 AND "source" = $2 AND "sourceId" = $3`,
      params.userId,
      params.source,
      params.sourceId,
    );
  } catch (e) {
    console.warn("[memory] deleteMemory failed:", (e as Error).message);
  }
}

export interface MemoryHit {
  content: string;
  source: string;
  score: number; // cosine similarity 0..1 (higher = more similar)
  createdAt: Date;
}

/**
 * Retrieve the most similar stored chunks for a query, scoped to the user.
 * Returns [] on any failure so a chat turn never breaks over memory.
 * `minScore` drops weak matches so we don't inject irrelevant context.
 */
export async function retrieveSimilar(
  userId: string,
  query: string,
  k = 4,
  minScore = 0.64,
  relativeGap = 0.08,
): Promise<MemoryHit[]> {
  try {
    if (!query?.trim()) return [];
    const vector = await embed(query, "RETRIEVAL_QUERY");
    const literal = toVectorLiteral(vector);
    // Over-fetch a little so the relative cutoff has candidates to trim.
    const rows: Array<{ content: string; source: string; score: number; createdAt: Date }> =
      await prisma.$queryRawUnsafe(
        `SELECT "content", "source", "createdAt",
                1 - ("embedding" <=> $2::vector) AS score
         FROM "MemoryChunk"
         WHERE "userId" = $1
         ORDER BY "embedding" <=> $2::vector
         LIMIT $3`,
        userId,
        literal,
        Math.max(k, 6),
      );
    const scored = rows.map((r) => ({ ...r, score: Number(r.score) }));
    if (scored.length === 0) return [];
    // gemini-embedding cosine scores are compressed, so an absolute floor
    // alone lets weak matches through. Also require each hit to be within
    // `relativeGap` of the best score — that keeps the genuinely-closest
    // cluster and drops the long tail of "everything is ~0.55" noise.
    const top = scored[0].score;
    return scored
      .filter((r) => r.score >= minScore && r.score >= top - relativeGap)
      .slice(0, k);
  } catch (e) {
    console.warn("[memory] retrieveSimilar failed:", (e as Error).message);
    return [];
  }
}

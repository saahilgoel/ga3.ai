// Voyage embeddings client + fallback. When VOYAGE_API_KEY is set, we embed
// via voyage-3-lite (1024-dim) and write into the vec0 virtual table. When the
// key is missing, we skip vector inserts; query() falls back to LIKE search.

import { recordUsage } from "@/lib/usage/record";

const EMBED_MODEL = "voyage-3-lite";
const EMBED_DIM = 512; // voyage-3-lite native dim

export const EMBEDDING_DIM = EMBED_DIM;

export function isEmbeddingAvailable(): boolean {
  return !!process.env.VOYAGE_API_KEY;
}

type EmbedInputType = "document" | "query";

async function callVoyage(
  texts: string[],
  inputType: EmbedInputType
): Promise<number[][] | null> {
  const apiKey = process.env.VOYAGE_API_KEY;
  if (!apiKey) return null;
  try {
    const res = await fetch("https://api.voyageai.com/v1/embeddings", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        input: texts,
        model: EMBED_MODEL,
        input_type: inputType,
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.warn(`[voyage] HTTP ${res.status}: ${body.slice(0, 200)}`);
      return null;
    }
    const data = (await res.json()) as {
      data: Array<{ embedding: number[] }>;
      usage?: { total_tokens?: number };
    };
    // Attribute embedding tokens to the active usage context. Defensive.
    recordUsage({ provider: "voyage", tokens: Number(data.usage?.total_tokens ?? 0) || 0 });
    return data.data.map((d) => d.embedding);
  } catch (err) {
    console.warn("[voyage] embed failed:", (err as Error).message);
    return null;
  }
}

export async function embedDocuments(texts: string[]): Promise<number[][] | null> {
  if (texts.length === 0) return [];
  // Voyage batch limit is 128. Chunk if needed.
  const batches: number[][][] = [];
  for (let i = 0; i < texts.length; i += 128) {
    const batch = await callVoyage(texts.slice(i, i + 128), "document");
    if (!batch) return null;
    batches.push(batch);
  }
  return batches.flat();
}

export async function embedQuery(text: string): Promise<number[] | null> {
  const out = await callVoyage([text], "query");
  return out?.[0] ?? null;
}

// Pack a number[] into the Float32Array binary form sqlite-vec expects
export function vectorToBlob(vec: number[]): Buffer {
  const f32 = new Float32Array(vec);
  return Buffer.from(f32.buffer, f32.byteOffset, f32.byteLength);
}

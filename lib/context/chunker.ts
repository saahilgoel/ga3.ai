// Sentence-aware text chunker. Targets ~400 tokens (≈1500 chars) per chunk with
// 50-token overlap. Pure word-count approximation — good enough for retrieval
// quality at this scale.

const TARGET_CHARS = 1500;
const OVERLAP_CHARS = 200;
const MIN_CHARS = 200;

function approxTokens(s: string): number {
  return Math.round(s.split(/\s+/).filter(Boolean).length * 1.3);
}

function splitSentences(text: string): string[] {
  return text
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+(?=[A-Z0-9"'(])/g)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

export type Chunk = { content: string; token_count: number };

export function chunkText(input: string, opts?: { atomic?: boolean }): Chunk[] {
  const clean = input.replace(/\s+/g, " ").trim();
  if (clean.length === 0) return [];

  // Reviews / short atomic content: 1 chunk if under target.
  if (opts?.atomic || clean.length <= TARGET_CHARS) {
    if (clean.length < MIN_CHARS) {
      return clean.length >= 50 ? [{ content: clean, token_count: approxTokens(clean) }] : [];
    }
    return [{ content: clean, token_count: approxTokens(clean) }];
  }

  const sentences = splitSentences(clean);
  const chunks: Chunk[] = [];
  let buf: string[] = [];
  let bufLen = 0;

  for (const sent of sentences) {
    if (bufLen + sent.length > TARGET_CHARS && bufLen > MIN_CHARS) {
      const content = buf.join(" ");
      chunks.push({ content, token_count: approxTokens(content) });
      // Overlap: keep tail sentences until we have OVERLAP_CHARS
      const tail: string[] = [];
      let tailLen = 0;
      for (let i = buf.length - 1; i >= 0 && tailLen < OVERLAP_CHARS; i--) {
        tail.unshift(buf[i]);
        tailLen += buf[i].length + 1;
      }
      buf = tail;
      bufLen = tailLen;
    }
    buf.push(sent);
    bufLen += sent.length + 1;
  }

  if (bufLen >= MIN_CHARS) {
    const content = buf.join(" ");
    chunks.push({ content, token_count: approxTokens(content) });
  }

  return chunks;
}

// USD cost estimates. Public list prices (mid-2026), per 1M tokens for LLM /
// embeddings. Tune via env without a code change where useful. These are
// estimates for an internal cost dashboard, not billing.

const ANTHROPIC_PER_MTOK: Record<string, { in: number; out: number }> = {
  "claude-sonnet-4-6": { in: 3, out: 15 },
  "claude-haiku-4-5-20251001": { in: 1, out: 5 },
  "claude-haiku-4-5": { in: 1, out: 5 },
  "claude-opus-4-8": { in: 15, out: 75 },
};
const ANTHROPIC_DEFAULT = { in: 3, out: 15 };

// gpt-oss on a Together-style OpenAI-compatible host. Defaults are Together's
// list prices; if you switch host (DeepInfra/Groq) override the default via env.
const OSS_PER_MTOK: Record<string, { in: number; out: number }> = {
  "openai/gpt-oss-120b": { in: 0.15, out: 0.6 },
  "openai/gpt-oss-20b": { in: 0.05, out: 0.2 },
  // Ollama-style ids, used for local/dev smoke tests against ollama.com
  "gpt-oss:120b": { in: 0.15, out: 0.6 },
  "gpt-oss:20b": { in: 0.05, out: 0.2 },
};
const OSS_DEFAULT = {
  in: Number(process.env.CHEAP_USD_PER_MTOK_IN || 0.15),
  out: Number(process.env.CHEAP_USD_PER_MTOK_OUT || 0.6),
};

// voyage-3-lite is ~$0.02 / 1M tokens.
const VOYAGE_PER_MTOK = Number(process.env.VOYAGE_USD_PER_MTOK || 0.02);

// ScrapingDog bills per credit; depends on plan. Rough default ~$0.0002/credit.
const SCRAPINGDOG_USD_PER_CREDIT = Number(
  process.env.SCRAPINGDOG_USD_PER_CREDIT || 0.0002
);

export function anthropicCostUsd(
  model: string,
  inputTokens: number,
  outputTokens: number
): number {
  const p = ANTHROPIC_PER_MTOK[model] ?? ANTHROPIC_DEFAULT;
  return (inputTokens / 1e6) * p.in + (outputTokens / 1e6) * p.out;
}

export function cheapCostUsd(
  model: string,
  inputTokens: number,
  outputTokens: number
): number {
  const p = OSS_PER_MTOK[model] ?? OSS_DEFAULT;
  return (inputTokens / 1e6) * p.in + (outputTokens / 1e6) * p.out;
}

export function voyageCostUsd(tokens: number): number {
  return (tokens / 1e6) * VOYAGE_PER_MTOK;
}

export function scrapingdogCostUsd(credits: number): number {
  return credits * SCRAPINGDOG_USD_PER_CREDIT;
}

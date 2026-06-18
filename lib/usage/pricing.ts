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

export function voyageCostUsd(tokens: number): number {
  return (tokens / 1e6) * VOYAGE_PER_MTOK;
}

export function scrapingdogCostUsd(credits: number): number {
  return credits * SCRAPINGDOG_USD_PER_CREDIT;
}

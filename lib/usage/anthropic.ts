import { wrapLanguageModel } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { recordUsage } from "./record";

// Token counts can be a flat number (high-level streamText/generateText usage)
// or a structured V3 model-level object ({ total, cacheRead, ... }). Handle both.
type Tokens = number | { total?: number } | undefined | null;
type AnyUsage = {
  inputTokens?: Tokens;
  outputTokens?: Tokens;
  promptTokens?: number;
  completionTokens?: number;
};

function tok(t: Tokens): number {
  if (typeof t === "number") return Number.isFinite(t) ? t : 0;
  if (t && typeof t === "object") return Number(t.total ?? 0) || 0;
  return 0;
}

function rec(model: string, section: string | undefined, usage: AnyUsage | undefined): void {
  if (!usage) return;
  const input = tok(usage.inputTokens) || Number(usage.promptTokens ?? 0) || 0;
  const output = tok(usage.outputTokens) || Number(usage.completionTokens ?? 0) || 0;
  recordUsage({ provider: "anthropic", model, inputTokens: input, outputTokens: output, section });
}

/**
 * Drop-in replacement for `anthropic(model)` that records token usage for
 * non-streaming calls (generateText / generateObject). Attribution comes from
 * the AsyncLocalStorage usage context; pass `section` to label it. For
 * streaming calls (streamText), use `recordStreamUsage` in `onFinish`.
 */
export function trackedModel(model: string, section?: string) {
  return wrapLanguageModel({
    model: anthropic(model),
    middleware: {
      specificationVersion: "v3",
      wrapGenerate: async ({ doGenerate }) => {
        const result = await doGenerate();
        try {
          rec(model, section, (result as unknown as { usage?: AnyUsage }).usage);
        } catch {
          /* never break the call */
        }
        return result;
      },
    },
  });
}

/** Record usage from a streamText `onFinish` callback. */
export function recordStreamUsage(
  model: string,
  usage: AnyUsage | undefined,
  section?: string
): void {
  try {
    rec(model, section, usage);
  } catch {
    /* never break the call */
  }
}

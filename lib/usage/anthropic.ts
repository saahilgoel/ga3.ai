import { wrapLanguageModel } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { recordUsage } from "./record";
import { cheapRoute, CHEAP_PROVIDER_LABEL } from "./cheap";

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

function rec(
  provider: "anthropic" | "together",
  model: string,
  section: string | undefined,
  usage: AnyUsage | undefined
): void {
  if (!usage) return;
  const input = tok(usage.inputTokens) || Number(usage.promptTokens ?? 0) || 0;
  const output = tok(usage.outputTokens) || Number(usage.completionTokens ?? 0) || 0;
  recordUsage({ provider, model, inputTokens: input, outputTokens: output, section });
}

/**
 * Drop-in replacement for `anthropic(model)` that records token usage for
 * non-streaming calls (generateText / generateObject). Attribution comes from
 * the AsyncLocalStorage usage context; pass `section` to label it.
 *
 * If `section` is opted into cheap routing (CHEAP_SECTIONS + a key), the call is
 * transparently served by gpt-oss on the cheap host instead of Anthropic, and
 * usage is recorded against the cheap provider's pricing. Call sites are
 * untouched. For streaming calls (streamText), use `recordStreamUsage`.
 */
export function trackedModel(model: string, section?: string) {
  const cheap = cheapRoute(section);
  const provider = cheap ? CHEAP_PROVIDER_LABEL : "anthropic";
  const modelId = cheap ? cheap.modelId : model;
  // Both @ai-sdk/anthropic and @ai-sdk/openai-compatible expose v3 models.
  const underlying = cheap ? cheap.model : anthropic(model);
  return wrapLanguageModel({
    model: underlying,
    middleware: {
      specificationVersion: "v3",
      wrapGenerate: async ({ doGenerate }) => {
        const result = await doGenerate();
        try {
          rec(provider, modelId, section, (result as unknown as { usage?: AnyUsage }).usage);
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
    rec("anthropic", model, section, usage);
  } catch {
    /* never break the call */
  }
}

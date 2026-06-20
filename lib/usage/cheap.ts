import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

// The concrete (v3) model type the provider returns — narrower than the `ai`
// `LanguageModel` union (which includes `string`), so it satisfies
// wrapLanguageModel's `model` param.
type CheapModel = ReturnType<ReturnType<typeof createOpenAICompatible>>;

// ---------------------------------------------------------------------------
// Cheap-model routing. Background sections (scan, insights, classify, ...) can
// be served by gpt-oss on a Together-style OpenAI-compatible host at ~1/20th of
// Sonnet's cost. This is fully env-driven and OFF by default — nothing routes
// to the cheap host unless CHEAP_SECTIONS lists the section AND a key is set, so
// it's a safe, instant rollback (clear the env var → back to Anthropic).
//
//   CHEAP_SECTIONS   comma list, e.g. "scan,insights,classify,briefing,title"
//   TOGETHER_API_KEY (or CHEAP_API_KEY) the host key
//   CHEAP_BASE_URL   default https://api.together.xyz/v1  (swap to DeepInfra/Groq/Ollama)
//   CHEAP_MODEL      default openai/gpt-oss-120b
// ---------------------------------------------------------------------------

const BASE_URL = process.env.CHEAP_BASE_URL || "https://api.together.xyz/v1";
const API_KEY = process.env.CHEAP_API_KEY || process.env.TOGETHER_API_KEY || "";
const MODEL = process.env.CHEAP_MODEL || "openai/gpt-oss-120b";

function sections(): Set<string> {
  return new Set(
    (process.env.CHEAP_SECTIONS || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
  );
}

// The cost-attribution label written to usage_events for cheap-routed calls.
export const CHEAP_PROVIDER_LABEL = "together" as const;

let _provider: ReturnType<typeof createOpenAICompatible> | null = null;
function provider() {
  if (!_provider) {
    _provider = createOpenAICompatible({
      name: "cheap",
      baseURL: BASE_URL,
      apiKey: API_KEY,
      // Use the json_schema response format so generateObject (insights /
      // classify) works. Together/DeepInfra/Groq support this; some hosts
      // (e.g. Ollama) ignore it — keep generateObject sections on a host that
      // honours it.
      supportsStructuredOutputs: true,
    });
  }
  return _provider;
}

/**
 * If `section` should be served by the cheap host, return its model id + a ready
 * LanguageModel; otherwise null (caller falls back to Anthropic). Fail-safe: a
 * section listed without a key configured returns null rather than erroring.
 */
export function cheapRoute(
  section?: string
): { modelId: string; model: CheapModel } | null {
  if (!section || !API_KEY) return null;
  if (!sections().has(section)) return null;
  return { modelId: MODEL, model: provider()(MODEL) };
}

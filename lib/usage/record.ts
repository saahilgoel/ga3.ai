import { getDb } from "@/lib/db";
import { getUsageContext } from "./context";
import { anthropicCostUsd, scrapingdogCostUsd, voyageCostUsd } from "./pricing";

type RecordArgs =
  | {
      provider: "anthropic";
      model: string;
      inputTokens: number;
      outputTokens: number;
      section?: string;
    }
  | { provider: "scrapingdog"; credits: number; section?: string }
  | { provider: "voyage"; tokens: number; section?: string };

/**
 * Persist a usage event, attributed to the current AsyncLocalStorage context
 * (account + workspace + section). DEFENSIVE: any failure is swallowed — usage
 * accounting must never break the actual LLM / scrape / embed call.
 */
export function recordUsage(args: RecordArgs): void {
  try {
    const ctx = getUsageContext();
    const section = args.section ?? ctx?.section ?? "unknown";
    const userId = ctx?.userId ?? null;
    const workspaceId = ctx?.workspaceId ?? null;

    let model: string | null = null;
    let inputTokens = 0;
    let outputTokens = 0;
    let credits = 0;
    let cost = 0;

    if (args.provider === "anthropic") {
      model = args.model;
      inputTokens = Math.max(0, Math.round(args.inputTokens || 0));
      outputTokens = Math.max(0, Math.round(args.outputTokens || 0));
      cost = anthropicCostUsd(model, inputTokens, outputTokens);
    } else if (args.provider === "voyage") {
      inputTokens = Math.max(0, Math.round(args.tokens || 0));
      cost = voyageCostUsd(inputTokens);
    } else {
      credits = Math.max(0, Math.round(args.credits || 0));
      cost = scrapingdogCostUsd(credits);
    }

    // Skip empty rows (e.g. a 0-credit failed scrape) to keep the table clean.
    if (inputTokens === 0 && outputTokens === 0 && credits === 0) return;

    getDb()
      .prepare(
        `INSERT INTO usage_events
           (user_id, workspace_id, section, provider, model, input_tokens, output_tokens, credits, cost_usd)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        userId,
        workspaceId,
        section,
        args.provider,
        model,
        inputTokens,
        outputTokens,
        credits,
        cost
      );
  } catch (err) {
    console.warn("[usage] record failed:", (err as Error).message);
  }
}

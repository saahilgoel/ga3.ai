import { trackedModel } from "@/lib/usage/anthropic";
import { runWithUsage } from "@/lib/usage/context";
import { generateText, stepCountIs } from "ai";
import { z } from "zod";
import crypto from "node:crypto";
import { AGENTS, Agent } from "./agents";
import { makeGa4Tools } from "./tools";
import { makeGoogleAdsTools } from "./sources/google_ads/tools";
import { makeMoEngageTools } from "./sources/moengage/tools";
import { workspaceAdsCustomers, workspaceMoEngage } from "./workspace";
import { publish } from "./pubsub";
import {
  getDb,
  getWorkspaceById,
  insertFinding,
  setWorkspaceLastScanAt,
  type FindingRow,
  type WorkspaceRow,
} from "./db";
import {
  parseWorkspacePropertyIds,
  resolveWorkspaceWithTokens,
  type WorkspaceWithTokens,
} from "./workspace";
import { propertySignature } from "./property-signature";
import { vizSchema } from "./viz";
import { SiteProfile } from "./profile";
import { stripEmojis } from "./strip-emojis";
import { getWorkspaceContextSummary } from "./context/summary";

const RawFindingSchema = z.object({
  title: z.string().min(3),
  body: z.string().min(3),
  severity: z.enum(["high", "medium", "low"]),
  data: z.unknown().optional().nullable(),
  visualization: vizSchema.nullable().optional(),
  question: z.string().nullable().optional(),
  source_property_ids: z.array(z.number()).optional().nullable(),
});
type RawFinding = z.infer<typeof RawFindingSchema>;

type ScanLockEntry = { startedAt: number; promise: Promise<ScanResult> };
const scanLocks = new Map<number, ScanLockEntry>();
const MIN_INTERVAL_MS = 30 * 60_000;

type ScanResult = {
  scan_id: string;
  findings: FindingRow[];
  skipped?: "in_flight" | "rate_limited";
};

export async function runScan(args: { workspace_id: number }): Promise<ScanResult> {
  const ws = getWorkspaceById(args.workspace_id);
  if (!ws) throw new Error("workspace_not_found");
  if (ws.archived) throw new Error("workspace_archived");

  const inFlight = scanLocks.get(ws.id);
  if (inFlight && Date.now() - inFlight.startedAt < MIN_INTERVAL_MS) {
    return inFlight.promise;
  }

  const promise = runWithUsage(
    { userId: ws.user_id, workspaceId: ws.id, section: "scan" },
    () => doScan(ws)
  ).finally(() => {
    setTimeout(() => scanLocks.delete(ws.id), MIN_INTERVAL_MS);
  });
  scanLocks.set(ws.id, { startedAt: Date.now(), promise });
  return promise;
}

function publishScanProgress(
  ws: WorkspaceRow,
  phase: string,
  pct: number,
  agent_id?: string
): void {
  try {
    publish(ws.user_id, {
      kind: "scan.progress",
      workspace_id: ws.id,
      phase,
      pct,
      agent_id,
    });
  } catch {
    // best-effort
  }
}

async function doScan(ws: WorkspaceRow): Promise<ScanResult> {
  const scan_id = crypto.randomUUID();
  const propertyIds = parseWorkspacePropertyIds(ws);
  if (propertyIds.length === 0) return { scan_id, findings: [] };

  publishScanProgress(ws, "Loading workspace", 2);
  const withTokens = await resolveWorkspaceWithTokens(ws);
  if (withTokens.properties.length === 0) return { scan_id, findings: [] };

  const ctxSummary = await getWorkspaceContextSummary(ws.id);
  const baseSystem =
    buildScanBaseSystem(withTokens) +
    (ctxSummary.hasContext
      ? `\n\nBRAND CONTEXT (already loaded — use this; only call query_context for more specific lookups):\n${ctxSummary.summary}`
      : "");
  console.log(
    `[scan ${scan_id.slice(0, 8)}] workspace=${ws.id} (${ws.name}) kind=${ws.kind} props=[${withTokens.properties.map((p) => p.property.display_name).join(", ")}]`
  );
  const t0 = Date.now();

  const ga4Tools = makeGa4Tools(withTokens.properties, ws.id);
  const adsTools = makeGoogleAdsTools({
    userId: ws.user_id,
    adsCustomers: workspaceAdsCustomers(ws).map((s) => ({
      customer_id: s.source_id,
      display_name: s.display_name,
      account_email: s.account_email,
    })),
    ga4Active: withTokens.properties,
  });
  const moeTools = makeMoEngageTools({
    userId: ws.user_id,
    attached: workspaceMoEngage(ws).length > 0,
    ga4Active: withTokens.properties,
  });
  const tools = { ...ga4Tools, ...adsTools, ...moeTools };

  publishScanProgress(ws, "Running agents", 10);
  let agentsDone = 0;
  const agentResults = await Promise.all(
    AGENTS.map((a) =>
      runAgentScan(a, tools, baseSystem).then((findings) => {
        agentsDone += 1;
        const pct = 10 + Math.round((agentsDone / AGENTS.length) * 75);
        publishScanProgress(ws, `Analyzing · ${a.name}`, pct, a.id);
        return findings;
      })
    )
  );

  const sig = propertySignature(propertyIds);
  const all = agentResults.flat();
  const inserted: FindingRow[] = [];
  for (const item of all) {
    try {
      const row = insertFinding({
        user_id: ws.user_id,
        agent_id: item.agent_id,
        property_signature: sig,
        title: stripEmojis(item.title),
        body: stripEmojis(item.body),
        severity: item.severity,
        data_json: item.data != null ? JSON.stringify(item.data) : null,
        visualization_json: item.visualization ? JSON.stringify(item.visualization) : null,
        question: item.question ? stripEmojis(item.question) : null,
        scan_id,
      });
      // Set workspace_id + source_property_ids (the inserter doesn't take them)
      const sourceJson = item.source_property_ids
        ? JSON.stringify(item.source_property_ids)
        : null;
      getDb()
        .prepare(
          "UPDATE findings SET workspace_id = ?, source_property_ids = ? WHERE id = ?"
        )
        .run(ws.id, sourceJson, row.id);
      inserted.push(row);
    } catch (err) {
      console.error("[scan] insertFinding failed:", errMsg(err));
    }
  }

  publishScanProgress(ws, "Writing findings", 95);
  setWorkspaceLastScanAt(ws.id, Math.floor(Date.now() / 1000));
  console.log(
    `[scan ${scan_id.slice(0, 8)}] done in ${((Date.now() - t0) / 1000).toFixed(1)}s — ${inserted.length} findings (${inserted.filter((f) => f.severity === "high").length} high, ${inserted.filter((f) => f.severity === "medium").length} medium)`
  );
  // Push the scan-completed event so every open tab refreshes the bell + sidebar.
  try {
    publish(ws.user_id, {
      kind: "scan.completed",
      workspace_id: ws.id,
      new_findings: inserted.length,
    });
    for (const f of inserted) {
      publish(ws.user_id, {
        kind: "finding.new",
        workspace_id: ws.id,
        finding_id: f.id,
        agent_id: f.agent_id,
      });
    }
  } catch {
    // pubsub is best-effort
  }
  return { scan_id, findings: inserted };
}

async function runAgentScan(
  agent: Agent,
  tools: ReturnType<typeof makeGa4Tools>,
  baseSystem: string
): Promise<Array<RawFinding & { agent_id: string }>> {
  const system = `${baseSystem}

PERSONA: ${agent.systemPromptAddendum}

AUTONOMOUS SCAN TASK:
This is an autonomous scan. You have NOT been asked a specific question.
Your job: look at this property's data and surface 1-3 findings YOUR LENS would catch.

Compare the last 7 days (startDate "7daysAgo", endDate "today") vs the prior 7 days (startDate "14daysAgo", endDate "7daysAgo"). Look at week-over-week shifts in YOUR domain.

Call run_report and other tools as needed. Be thorough — you have up to 5 tool calls.

Severity calibration:
- high: meaningful change (>15% shift in a top-5 metric), broken funnel, large segment surprise
- medium: noteworthy pattern, opportunity worth investigating
- low: interesting observation, no urgent action

DO NOT call render_visualization. Instead, when a chart would help, include a "visualization" object in the finding.

If nothing in your domain is notable enough, return [] — do not manufacture findings.

After your queries, respond with ONLY a single JSON code block:
\`\`\`json
[
  {
    "title": "<=12 words",
    "body": "2-3 sentences with specific numbers and the comparison period",
    "severity": "high"|"medium"|"low",
    "data": { /* small JSON snapshot of the numbers backing the finding */ },
    "visualization": null | { "kind": "bar|line|pie|kpi|funnel|table", "title": "...", "data"|"primary"|"steps"|"columns"|"rows": ... },
    "question": null | "<=15 word follow-up question to ask the user, or null",
    "source_property_ids": null | [property_db_id, ...]
  }
]
\`\`\`
No prose outside the code block.`;

  try {
    const { text } = await generateText({
      model: trackedModel("claude-sonnet-4-6", "scan"),
      system,
      prompt: "Run your scan now. Query the data, then return JSON.",
      tools,
      stopWhen: stepCountIs(6),
    });
    return extractFindings(text).map((f) => ({ ...f, agent_id: agent.id }));
  } catch (err) {
    console.warn(`[scan] agent=${agent.id} failed:`, errMsg(err));
    return [];
  }
}

function extractFindings(text: string): RawFinding[] {
  const candidates: string[] = [];
  const block = text.match(/```(?:json)?\s*([\s\S]+?)\s*```/);
  if (block) candidates.push(block[1]);
  const arr = text.match(/\[\s*\{[\s\S]+?\}\s*\]/);
  if (arr) candidates.push(arr[0]);
  candidates.push(text);
  for (const c of candidates) {
    try {
      const parsed = JSON.parse(c);
      if (!Array.isArray(parsed)) continue;
      const valid: RawFinding[] = [];
      for (const item of parsed) {
        const r = RawFindingSchema.safeParse(item);
        if (r.success) valid.push(r.data);
      }
      if (valid.length > 0) return valid;
    } catch {
      // try next
    }
  }
  return [];
}

function buildScanBaseSystem(withTokens: WorkspaceWithTokens): string {
  const isUnion = withTokens.workspace.kind === "union";
  const propertySummaries = withTokens.properties
    .map(({ property }) => {
      let profile: SiteProfile | null = null;
      if (property.site_profile_json) {
        try {
          profile = JSON.parse(property.site_profile_json) as SiteProfile;
        } catch {
          profile = null;
        }
      }
      const business = profile?.business?.split(/[.!?]\s/)[0] || "(not auto-detected)";
      return `- [${property.id}] ${property.display_name} (${property.website_url || "unknown URL"}): ${business}`;
    })
    .join("\n");

  const unionLine = isUnion
    ? `\nUnion workspace "${withTokens.workspace.name}" across ${withTokens.properties.length} properties: run_report sums; use run_per_property_report when you need a per-property breakdown. When a finding is concentrated in specific properties, include their numeric DB ids (shown in brackets above) in "source_property_ids" so the UI can tag the finding.`
    : `\nSingle-property workspace "${withTokens.workspace.name}".`;

  return `You are a GA4 analytics assistant.

EMOJI POLICY: DO NOT use emojis in titles, bodies, or questions. Plain text only.

ACTIVE PROPERTIES:
${propertySummaries}
${unionLine}

DATE RANGES YOU WILL USE FOR THIS SCAN:
- "this week" = startDate "7daysAgo", endDate "today"
- "prior week" = startDate "14daysAgo", endDate "7daysAgo"`;
}

function errMsg(err: unknown): string {
  if (err && typeof err === "object" && "message" in err) {
    return String((err as { message: unknown }).message);
  }
  return String(err);
}

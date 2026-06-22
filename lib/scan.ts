import { trackedModel } from "@/lib/usage/anthropic";
import { runWithUsage } from "@/lib/usage/context";
import { generateText, stepCountIs } from "ai";
import { z } from "zod";
import crypto from "node:crypto";
import { AGENTS } from "./agents";
import { makeGa4Tools } from "./tools";
import { makeGoogleAdsTools } from "./sources/google_ads/tools";
import { makeMoEngageTools } from "./sources/moengage/tools";
import { workspaceAdsCustomers, workspaceMoEngage } from "./workspace";
import { publish } from "./pubsub";
import {
  getDb,
  getWorkspaceById,
  getBusinessType,
  insertFinding,
  setWorkspaceLastScanAt,
  type FindingRow,
  type WorkspaceRow,
} from "./db";
import { getContextStatus } from "./context/db-helpers";
import { BUSINESS_TYPE_LABEL, BUSINESS_TYPE_LENS } from "./business-type";
import type { BusinessType } from "./business-type";
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

const AGENT_IDS = AGENTS.map((a) => a.id);
const DEFAULT_AGENT = AGENT_IDS[0] ?? "maya";

const RawFindingSchema = z.object({
  title: z.string().min(3),
  body: z.string().min(3),
  severity: z.enum(["high", "medium", "low"]),
  // The focused scan assigns each finding to the analyst whose lens it fits.
  agent_id: z.string().optional().nullable(),
  data: z.unknown().optional().nullable(),
  visualization: vizSchema.nullable().optional(),
  question: z.string().nullable().optional(),
  source_property_ids: z.array(z.number()).optional().nullable(),
});
type RawFinding = z.infer<typeof RawFindingSchema>;

// One scan can produce at most this many findings — the newsroom stays a sharp,
// scannable set, not a 30-finding dump.
const MAX_FINDINGS = 5;

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

  const bt = getBusinessType(ws.id);
  const businessType = (bt?.business_type as BusinessType | null) ?? "other";

  publishScanProgress(ws, "Analyzing your analytics", 20);
  const raw = await runFocusedScan(tools, baseSystem, businessType, ctxSummary.summary);
  publishScanProgress(ws, "Ranking the sharpest insights", 88);

  const sig = propertySignature(propertyIds);
  // This scan replaces the previous newsroom set. Pins live in pinned_insights
  // and are untouched; we only archive prior auto-findings for this workspace.
  archivePriorFindings(ws.id, ws.user_id);
  const all = raw.slice(0, MAX_FINDINGS);
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

// One focused, business-type-aware pass. Replaces the old 6-agent fan-out:
// instead of every persona dumping 1-3 findings (→ 30-40 piling up), the lead
// analyst surfaces the 3-5 sharpest, category-relevant insights, each attributed
// to the persona whose lens it fits.
async function runFocusedScan(
  tools: ReturnType<typeof makeGa4Tools>,
  baseSystem: string,
  businessType: BusinessType,
  contextSummary: string
): Promise<Array<RawFinding & { agent_id: string }>> {
  const label = BUSINESS_TYPE_LABEL[businessType];
  const lens = BUSINESS_TYPE_LENS[businessType];

  const system = `${baseSystem}

BUSINESS TYPE: this is a ${label}. The metrics that matter most here are: ${lens}.${
    contextSummary ? `\nWhat we know about the brand:\n${contextSummary}` : ""
  }

YOUR TASK — focused autonomous scan (you are the lead analyst):
Look at this property's last 7 days vs the prior 7 days and surface the 3-5 SHARPEST, most decision-relevant findings for a ${label}. Quality over quantity — a few sharp findings beat many shallow ones. Rank them most-important first, and NEVER return more than ${MAX_FINDINGS}. Focus on what matters for a ${label} (${lens}); ignore vanity metrics.

GROUND EVERY NUMBER:
- Every figure you state MUST come from a tool result you called in THIS scan. Never estimate, recall, or invent a number.
- For any week-over-week / period comparison, call compare_periods ONCE. It returns each metric pre-labelled current vs previous with the change and percent ALREADY computed in code — report those directly and state the direction from the sign of the change. Do NOT make two run_report calls and diff them yourself (that is how the period gets flipped). Use run_report only for single-period lookups (e.g. top landing pages this week).
- Echo the exact supporting figures (current, previous, pct) into "data".
- If the data is too sparse or flat to support a real finding, return FEWER findings (or []). Do not manufacture findings to hit a count.

THINK LIKE A SENIOR ANALYST (this is what separates a useful insight from a metric printout):
- Materiality bar: only surface a change that actually MATTERS — it needs both meaningful volume AND a meaningful move. A 40% swing on 5 sessions is noise; a 6% drop on 80,000 sessions is a fire. Rank by business impact (revenue, conversions, large segments), never by how big the percentage looks.
- Always anchor a percentage to its absolute counts: "conversions fell to 88 from 149 (-41%)", never a bare "-41%". A number without its base is not an insight.
- Low base = low confidence: when compare_periods marks a metric "low_base": true, its pct is null on purpose — the base is too small for a percentage to mean anything. NEVER state or compute a percentage for it (no "+1,000%"); report only the raw counts ("33 sessions, up from 3 last week"), call it an early/low-confidence signal, and never rate it "high" severity.
- Pre-traction / very low traffic: if sessions is low_base (the whole property is tiny — a few dozen sessions a week), do NOT generate 4-5 dramatic findings. Produce AT MOST 2, severity "low", no percentages at all. Say plainly that the site is at very low volume so week-over-week swings aren't yet meaningful, and give the single most useful concrete next step to build real traffic. One honest "you're pre-traction, here's the one lever" beats five fake fires.
- End every finding with the so-what — the implication or the specific lever to pull. A real analyst tells you what to DO, not just what moved.

ATTRIBUTE each finding to the analyst whose lens it fits, via "agent_id":
- maya: acquisition & channel mix (source/medium, paid vs organic, channel ROI)
- arjun: funnel & drop-off (journey, abandonment, checkout/signup friction)
- priya: retention & engagement (returning users, cohorts, frequency, depth)
- kabir: audience & geography (demographics, geo, device, untapped segments)
- raavi: contrarian (a segment moving the other way, a misleading average)
- vera: paid-media economics (CAC, ROAS, wasted spend) — only if ad/spend data exists

DATE WINDOWS (compare_periods uses these by default):
- current = last 7 days ("7daysAgo" → "today"); previous = the 7 days before that ("14daysAgo" → "7daysAgo").

SEVERITY: high = meaningful change (>15% shift in a top metric), broken funnel, big segment surprise; medium = noteworthy pattern/opportunity; low = interesting observation.

DO NOT call render_visualization. Include a "visualization" object in the finding when a chart helps. Use up to 12 tool calls.

After your queries, respond with ONLY one JSON code block:
\`\`\`json
[
  {
    "agent_id": "maya|arjun|priya|kabir|raavi|vera",
    "title": "<=12 words",
    "body": "2-3 sentences with specific numbers and the comparison period",
    "severity": "high"|"medium"|"low",
    "data": { /* the exact numbers from your tool calls backing this finding */ },
    "visualization": null | { "kind": "bar|line|pie|kpi|funnel|table", "title": "...", "data"|"primary"|"steps"|"columns"|"rows": ... },
    "question": null | "<=15 word follow-up question, or null",
    "source_property_ids": null | [property_db_id, ...]
  }
]
\`\`\`
No prose outside the code block.`;

  try {
    const { text } = await generateText({
      model: trackedModel("claude-sonnet-4-6", "scan"),
      system,
      prompt: "Run your focused scan now. Query the data, then return the ranked JSON.",
      tools,
      stopWhen: stepCountIs(12),
    });
    return extractFindings(text).map((f) => ({
      ...f,
      agent_id:
        f.agent_id && AGENT_IDS.includes(f.agent_id) ? f.agent_id : DEFAULT_AGENT,
    }));
  } catch (err) {
    console.warn(`[scan] focused scan failed:`, errMsg(err));
    return [];
  }
}

// Archive the prior auto-findings for a workspace so the newest scan's set
// replaces them in the newsroom. Pins live in a separate table and survive.
function archivePriorFindings(workspaceId: number, userId: number): void {
  try {
    getDb()
      .prepare(
        "UPDATE findings SET status = 'archived' WHERE workspace_id = ? AND user_id = ? AND status != 'archived'"
      )
      .run(workspaceId, userId);
  } catch (err) {
    console.warn("[scan] archivePriorFindings failed:", errMsg(err));
  }
}

/**
 * Lazy, gated auto-scan. Requires onboarding + RAG context to be ready.
 *
 * - App-open (default): refresh if there's no scan yet or the last is >24h old.
 * - initialOnly (the context-ready trigger): fire ONCE, only if the workspace
 *   has never been scanned. This is critical — the context-ready hook lives in a
 *   generic source-refresh path that the scheduler also runs for periodic
 *   industry/competitor refreshes, so without this gate those background
 *   refreshes would re-trigger scans on their own. Recurring scans happen on
 *   app open only; the background only ever does the one first launch.
 *
 * runScan's own lock dedupes concurrency. Fire-and-forget — streams over SSE.
 */
export function maybeAutoScan(
  workspaceId: number,
  opts: { initialOnly?: boolean } = {}
): void {
  try {
    const ws = getWorkspaceById(workspaceId);
    if (!ws || ws.archived) return;
    const ctx = getContextStatus(workspaceId);
    const ready =
      !!ctx &&
      (ctx.status === "ready" || ctx.status === "partial") &&
      (ctx.chunk_count ?? 0) > 0;
    if (!ready) return; // don't scan until the business context exists
    const last = ws.last_scan_at ?? 0;
    if (opts.initialOnly) {
      if (last) return; // already scanned once — never re-fire from the background
    } else {
      const ageS = Math.floor(Date.now() / 1000) - last;
      if (last && ageS < 24 * 3600) return; // daily cache
    }
    void runScan({ workspace_id: workspaceId }).catch(() => {});
  } catch {
    // best-effort
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

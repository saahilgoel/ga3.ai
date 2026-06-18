import { NextRequest, NextResponse } from "next/server";
import { getSession, readUserIds, readPrimaryUserId } from "@/lib/session";
import { runWithUsage } from "@/lib/usage/context";
import {
  briefingCacheKey,
  clearBriefingCache,
  getCachedBriefing,
  runBriefing,
  setCachedBriefing,
} from "@/lib/briefing";
import { resolveActiveWorkspace, resolveWorkspaceWithTokens, parseWorkspacePropertyIds } from "@/lib/workspace";
import { SiteProfile } from "@/lib/profile";

export const maxDuration = 120;

export async function POST(req: NextRequest) {
  const session = await getSession();
  const userIds = readUserIds(session);
  if (userIds.length === 0) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }
  const ws = resolveActiveWorkspace(session);
  if (!ws) {
    return NextResponse.json({ error: "no_active_workspace" }, { status: 400 });
  }

  const body = (await req.json().catch(() => ({}))) as { force?: boolean };
  const key = briefingCacheKey(userIds, parseWorkspacePropertyIds(ws));

  if (body.force) clearBriefingCache(key);

  const cached = getCachedBriefing(key);
  if (cached) {
    return NextResponse.json({
      insights: cached.insights,
      cached: true,
      generated_at: cached.generated_at,
    });
  }

  const withTokens = await resolveWorkspaceWithTokens(ws);
  const baseSystem = buildBriefingBaseSystem(withTokens);

  try {
    const insights = await runWithUsage(
      { userId: readPrimaryUserId(session) ?? userIds[0] ?? null, workspaceId: ws.id, section: "briefing" },
      () => runBriefing(withTokens.properties, baseSystem)
    );
    const entry = setCachedBriefing(key, insights);
    return NextResponse.json({
      insights,
      cached: false,
      generated_at: entry.generated_at,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

function buildBriefingBaseSystem(withTokens: {
  workspace: { name: string; kind: string };
  properties: Array<{
    property: { display_name: string; website_url: string | null; site_profile_json: string | null };
  }>;
}): string {
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
      return `- ${property.display_name} (${property.website_url || "unknown URL"}): ${business}`;
    })
    .join("\n");

  const unionLine = isUnion
    ? `\nUnion workspace "${withTokens.workspace.name}" across ${withTokens.properties.length} properties: run_report sums; call run_per_property_report when you need per-property breakdowns.`
    : `\nSingle-property workspace "${withTokens.workspace.name}".`;

  return `You are a GA4 analytics assistant.

EMOJI POLICY: do not use emojis in titles, bodies, or actions.

ACTIVE PROPERTIES:
${propertySummaries}
${unionLine}

DATE-AWARE TOOL USE:
- Use startDate "7daysAgo" and endDate "today" for this week.
- Use startDate "14daysAgo" and endDate "7daysAgo" for the prior week.
- Don't ask for clarification — just run the queries.`;
}

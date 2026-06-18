import { redirect } from "next/navigation";
import { getSession, readUserIds } from "@/lib/session";
import {
  resolveActiveWorkspace,
  workspaceProperties,
} from "@/lib/workspace";
import {
  listFindings,
  listConversations,
  listBriefsForWorkspace,
} from "@/lib/db";
import {
  getContextStatus,
  summarizeContextBySource,
  listUserUploads,
} from "@/lib/context/db-helpers";
import { WorkspaceOverviewClient } from "./workspace-client";

export default async function WorkspaceOverviewPage() {
  const session = await getSession();
  const userIds = readUserIds(session);
  if (userIds.length === 0) redirect("/");
  const ws = resolveActiveWorkspace(session);
  if (!ws) redirect("/properties");

  const props = workspaceProperties(ws);
  const primaryId = ws.primary_property_id ?? props[0]?.id ?? null;
  // v7: parse connected_sources to find any already-attached Google Ads customers
  let attachedAdsCustomerIds: string[] = [];
  let firstAccountEmail = "";
  try {
    const sources = ws.connected_sources
      ? (JSON.parse(ws.connected_sources) as Array<{
          type: string;
          source_id: string;
          account_email: string;
        }>)
      : [];
    attachedAdsCustomerIds = sources
      .filter((s) => s.type === "google_ads")
      .map((s) => s.source_id);
    firstAccountEmail =
      sources.find((s) => s.account_email)?.account_email ?? "";
  } catch {
    /* ignore */
  }
  const contextStatus = getContextStatus(ws.id);
  const sourceSummary = summarizeContextBySource(ws.id);
  const userUploads = listUserUploads(ws.id);
  const findings = listFindings({
    user_ids: userIds,
    property_signature: "",
    limit: 200,
  }).filter((f) => f.workspace_id === ws.id);
  const conversations = listConversations({
    user_ids: userIds,
    workspace_id: ws.id,
    limit: 100,
  });
  const briefs = listBriefsForWorkspace({ workspace_id: ws.id, limit: 50 });

  const unread = findings.filter((f) => f.status === "new").length;
  const highSev = findings.filter((f) => f.severity === "high").length;
  const last_finding_at = findings.length > 0 ? findings[0].created_at : null;
  const last_conv_at =
    conversations.find((c) => c.last_message_at)?.last_message_at ?? null;
  const last_brief_at = briefs.find((b) => b.completed_at)?.completed_at ?? null;

  return (
    <div className="flex-1 overflow-y-auto">
          <div className="mx-auto w-full px-4 sm:px-6 lg:px-8 max-w-full lg:max-w-[1000px] py-6 lg:py-8">
            <WorkspaceOverviewClient
              workspace={{
                id: ws.id,
                name: ws.name,
                kind: ws.kind as "single" | "union",
                last_used_at: ws.last_used_at,
                last_scan_at: ws.last_scan_at,
                primary_property_id: primaryId,
              }}
              properties={props.map((p) => ({
                id: p.id,
                display_name: p.display_name,
                ga4_property_id: p.ga4_property_id,
                website_url: p.website_url,
                is_primary: p.id === primaryId,
              }))}
              context={{
                status: contextStatus?.status ?? "pending",
                brand_name: contextStatus?.brand_name ?? null,
                progress_pct: contextStatus?.progress_pct ?? 0,
                current_step: contextStatus?.current_step ?? null,
                error_text: contextStatus?.error_text ?? null,
                document_count: contextStatus?.document_count ?? 0,
                chunk_count: contextStatus?.chunk_count ?? 0,
                total_credits_used: contextStatus?.total_credits_used ?? 0,
                last_full_refresh_at: contextStatus?.last_full_refresh_at ?? null,
                failed_sources: contextStatus?.failed_sources ?? null,
                source_count: sourceSummary.length,
                user_upload_count: userUploads.length,
              }}
              stats={{
                findings_count: findings.length,
                unread_count: unread,
                high_severity_count: highSev,
                conversations_count: conversations.filter((c) => !c.archived).length,
                briefs_count: briefs.length,
                last_finding_at,
                last_conv_at,
                last_brief_at,
              }}
              googleAds={{
                attachedCustomerIds: attachedAdsCustomerIds,
                accountEmail: firstAccountEmail,
              }}
            />
          </div>
        </div>
        );
}

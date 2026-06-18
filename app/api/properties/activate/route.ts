import { NextRequest, NextResponse } from "next/server";
import { getSession, readPrimaryUserId, readUserIds } from "@/lib/session";
import {
  getPropertiesByIds,
  setSiteProfile,
  upsertProperty,
  setActiveProperties,
  findSingleWorkspaceForProperty,
  createWorkspace,
  WorkspaceRow,
} from "@/lib/db";
import { getFreshAccessToken, getPropertyWebsiteUrl } from "@/lib/google";
import { generateSiteProfile } from "@/lib/profile";
import { onboardWorkspace } from "@/lib/onboarding";
import { bumpWorkspaceUsage } from "@/lib/workspace";
import { runPropertyDoctor } from "@/lib/doctor";
import { setPropertyDoctor } from "@/lib/db";

export async function POST(req: NextRequest) {
  const session = await getSession();
  const userIds = readUserIds(session);
  const primary = readPrimaryUserId(session);
  if (!primary || userIds.length === 0) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }

  // Google-style: one property at a time. Accept `property_id`, or the first
  // of a legacy `property_ids` array.
  const body = (await req.json()) as { property_id?: number; property_ids?: number[] };
  const id = Number(body.property_id ?? (body.property_ids ?? [])[0]);
  if (!Number.isFinite(id)) {
    return NextResponse.json({ error: "no_property_selected" }, { status: 400 });
  }

  const props = getPropertiesByIds([id]).filter((p) => userIds.includes(p.user_id));
  if (props.length === 0) {
    return NextResponse.json({ error: "property_not_found" }, { status: 404 });
  }

  // Ensure website URLs + profiles for any unprofiled properties.
  await Promise.all(
    props.map(async (p) => {
      try {
        let websiteUrl = p.website_url;
        if (!websiteUrl) {
          const token = await getFreshAccessToken(p.user_id);
          websiteUrl = (await getPropertyWebsiteUrl(token, p.ga4_property_id)) || null;
          if (websiteUrl) {
            upsertProperty({
              user_id: p.user_id,
              ga4_property_id: p.ga4_property_id,
              display_name: p.display_name,
              website_url: websiteUrl,
            });
            p.website_url = websiteUrl;
          }
        }
        if (!p.site_profile_json && websiteUrl) {
          const profile = await generateSiteProfile({
            url: websiteUrl,
            displayName: p.display_name,
          });
          setSiteProfile(p.id, JSON.stringify(profile));
        }
      } catch {
        // soft-fail per-property
      }
    })
  );

  // One property → one context. Reuse the existing context for this property
  // if there is one, otherwise create it. No grouping, no host-dedup.
  const p = props[0];
  const activeIds = [p.id];
  let ws: WorkspaceRow | undefined = findSingleWorkspaceForProperty({
    user_id: primary,
    property_id: p.id,
  });
  if (!ws) {
    ws = createWorkspace({
      user_id: primary,
      name: p.display_name,
      kind: "single",
      property_ids: [p.id],
      primary_property_id: p.id,
    });
  }

  session.active_workspace_id = ws.id;
  session.active_property_ids = undefined;
  session.selected_property_id = undefined;
  await session.save();
  bumpWorkspaceUsage(ws.id);
  setActiveProperties(userIds, activeIds);

  // Fire-and-forget GA4 doctor on every attached property so questions can be
  // ready by the time the user lands on /workspace.
  Promise.all(
    props.map(async (p) => {
      try {
        const token = await getFreshAccessToken(p.user_id);
        const report = await runPropertyDoctor({
          ga4_property_id: p.ga4_property_id,
          access_token: token,
          declared_website_url: p.website_url,
        });
        setPropertyDoctor({ property_id: p.id, doctor_json: JSON.stringify(report) });
      } catch (err) {
        console.warn(`[activate] doctor for ${p.ga4_property_id} failed:`, (err as Error).message);
      }
    })
  ).catch(() => {});

  // Onboard the property: build brand context FIRST, then scan — so findings
  // are grounded in the brand/competitor context, not generic. The ProgressStrip
  // surfaces each step live. Fire-and-forget.
  onboardWorkspace(ws.id).catch(() => {});

  return NextResponse.json({
    ok: true,
    workspace_id: ws.id,
    property_id: p.id,
  });
}

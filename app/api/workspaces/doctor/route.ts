import { NextRequest, NextResponse } from "next/server";
import { getSession, readUserIds } from "@/lib/session";
import {
  getWorkspaceById,
  getPropertiesByIds,
  setPropertyDoctor,
} from "@/lib/db";
import { getFreshAccessToken } from "@/lib/google";
import { runPropertyDoctor } from "@/lib/doctor";

const CACHE_TTL_SECONDS = 60 * 60 * 6;

export async function GET(req: NextRequest) {
  const session = await getSession();
  const userIds = readUserIds(session);
  if (userIds.length === 0) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }
  const url = new URL(req.url);
  const workspaceId = Number(url.searchParams.get("workspace_id") || "");
  const refresh = url.searchParams.get("refresh") === "1";
  const ws = getWorkspaceById(workspaceId);
  if (!ws || !userIds.includes(ws.user_id)) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  let ids: number[] = [];
  try {
    ids = JSON.parse(ws.ga4_property_ids) as number[];
  } catch {
    ids = [];
  }
  const props = getPropertiesByIds(ids);
  const now = Math.floor(Date.now() / 1000);

  const reports = await Promise.all(
    props.map(async (p) => {
      if (
        !refresh &&
        p.doctor_json &&
        p.doctor_checked_at &&
        now - p.doctor_checked_at < CACHE_TTL_SECONDS
      ) {
        try {
          return {
            property_id: p.id,
            display_name: p.display_name,
            ga4_property_id: p.ga4_property_id,
            website_url: p.website_url,
            is_primary: p.id === ws.primary_property_id,
            report: JSON.parse(p.doctor_json),
            cached: true,
          };
        } catch {
          // fall through to refresh
        }
      }
      try {
        const token = await getFreshAccessToken(p.user_id);
        const report = await runPropertyDoctor({
          ga4_property_id: p.ga4_property_id,
          access_token: token,
          declared_website_url: p.website_url,
        });
        setPropertyDoctor({
          property_id: p.id,
          doctor_json: JSON.stringify(report),
        });
        return {
          property_id: p.id,
          display_name: p.display_name,
          ga4_property_id: p.ga4_property_id,
          website_url: p.website_url,
          is_primary: p.id === ws.primary_property_id,
          report,
          cached: false,
        };
      } catch (err) {
        return {
          property_id: p.id,
          display_name: p.display_name,
          ga4_property_id: p.ga4_property_id,
          website_url: p.website_url,
          is_primary: p.id === ws.primary_property_id,
          report: null,
          error: (err as Error).message,
          cached: false,
        };
      }
    })
  );

  return NextResponse.json({ workspace_id: ws.id, properties: reports });
}

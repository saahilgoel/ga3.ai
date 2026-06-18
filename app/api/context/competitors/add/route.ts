import { NextResponse } from "next/server";
import { getSession, readUserIds } from "@/lib/session";
import { resolveActiveWorkspace } from "@/lib/workspace";
import { insertCompetitor } from "@/lib/context/competitors-db";

export async function POST(req: Request) {
  const session = await getSession();
  if (readUserIds(session).length === 0) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }
  const ws = resolveActiveWorkspace(session);
  if (!ws) return NextResponse.json({ error: "no_workspace" }, { status: 400 });
  const body = (await req.json().catch(() => ({}))) as {
    brand_name?: string;
    website_url?: string;
  };
  const brand = body.brand_name?.trim();
  if (!brand || brand.length < 2) {
    return NextResponse.json({ error: "bad_brand_name" }, { status: 400 });
  }
  const row = insertCompetitor({
    workspace_id: ws.id,
    brand_name: brand,
    website_url: body.website_url?.trim() || null,
    detection_query: "manual",
    reasoning: "Added manually by user",
  });
  // Fire-and-forget ingest for the new competitor (main brand + about/pricing
  // + SERP + news + ad library, all in one go).
  try {
    const { buildCompetitorContext } = await import(
      "@/lib/context/competitors"
    );
    buildCompetitorContext({ workspace_id: ws.id }).catch((err) =>
      console.warn(
        `[competitors/add] ingest failed:`,
        (err as Error).message
      )
    );
  } catch (err) {
    console.warn(
      `[competitors/add] could not enqueue ingest:`,
      (err as Error).message
    );
  }
  return NextResponse.json({ ok: true, competitor: row });
}

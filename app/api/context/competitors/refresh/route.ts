import { NextResponse } from "next/server";
import { getSession, readUserIds } from "@/lib/session";
import { resolveActiveWorkspace } from "@/lib/workspace";
import { getDb } from "@/lib/db";
import { buildCompetitorContext } from "@/lib/context/competitors";
import { buildCompetitorAds } from "@/lib/context/ad-library";

export async function POST(req: Request) {
  const session = await getSession();
  if (readUserIds(session).length === 0) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }
  const ws = resolveActiveWorkspace(session);
  if (!ws) return NextResponse.json({ error: "no_workspace" }, { status: 400 });

  const body = (await req.json().catch(() => ({}))) as {
    competitor_id?: number;
    ads_only?: boolean;
  };

  // Force flag — drop existing ad docs so the rebuild picks up the new
  // extractor (we sometimes ship a parser fix and need to invalidate the
  // 24h cache).
  const db = getDb();
  const adSourceTypes = ["competitor_ad_meta", "competitor_ad_google", "competitor_ad_creative_angle"];
  const placeholders = adSourceTypes.map(() => "?").join(",");
  const params: Array<number | string> = [ws.id, ...adSourceTypes];
  let where = `workspace_id = ? AND source_type IN (${placeholders})`;
  if (body.competitor_id) {
    where += ` AND competitor_id = ?`;
    params.push(body.competitor_id);
  }
  // Cascade delete from embeddings + chunks + docs
  db.prepare(
    `DELETE FROM context_embeddings WHERE rowid IN (SELECT id FROM context_chunks WHERE document_id IN (SELECT id FROM context_documents WHERE ${where}))`
  ).run(...params);
  db.prepare(
    `DELETE FROM context_chunks WHERE document_id IN (SELECT id FROM context_documents WHERE ${where})`
  ).run(...params);
  db.prepare(`DELETE FROM context_documents WHERE ${where}`).run(...params);

  // Always force ad re-ingest (we just nuked the gate row).
  buildCompetitorAds({
    workspace_id: ws.id,
    competitor_id: body.competitor_id,
    force: true,
  }).catch((err) => {
    console.warn(
      `[competitors] ad refresh failed for ws=${ws.id}:`,
      (err as Error).message
    );
  });

  // Also re-run the main competitor mirror unless the caller specifically
  // requested ads-only.
  if (!body.ads_only && !body.competitor_id) {
    buildCompetitorContext({ workspace_id: ws.id }).catch((err) => {
      console.warn(
        `[competitors] manual refresh failed for ws=${ws.id}:`,
        (err as Error).message
      );
    });
  }

  return NextResponse.json({ ok: true, workspace_id: ws.id });
}

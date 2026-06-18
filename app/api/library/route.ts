import { NextRequest, NextResponse } from "next/server";
import { getSession, readUserIds } from "@/lib/session";
import { ensureLibrarySeeded } from "@/lib/library/loader";
import { listBriefTemplates } from "@/lib/library/db";

let _seeded = false;
function ensureSeededOnce() {
  if (_seeded) return;
  try {
    ensureLibrarySeeded(false);
  } catch (err) {
    console.warn("[library] seed failed:", (err as Error).message);
  } finally {
    _seeded = true;
  }
}

export async function GET(req: NextRequest) {
  ensureSeededOnce();
  const session = await getSession();
  if (readUserIds(session).length === 0) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }
  const sp = new URL(req.url).searchParams;
  const result = listBriefTemplates({
    q: sp.get("q") || undefined,
    industry: sp.getAll("industry"),
    funnel_stage: sp.getAll("funnel_stage"),
    role: sp.getAll("role"),
    complexity: sp.getAll("complexity"),
    agent_persona: sp.getAll("agent_persona"),
    collection: sp.getAll("collection"),
    geo: sp.getAll("geo"),
    popular: sp.get("popular") === "1",
    is_new: sp.get("is_new") === "1",
    universal: sp.get("universal") === "1",
    limit: sp.get("limit") ? Number(sp.get("limit")) : undefined,
    offset: sp.get("offset") ? Number(sp.get("offset")) : undefined,
  });
  return NextResponse.json(result);
}

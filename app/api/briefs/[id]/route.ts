import { NextRequest, NextResponse } from "next/server";
import { getSession, readUserIds } from "@/lib/session";
import { getBriefById } from "@/lib/db";

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  const userIds = readUserIds(session);
  if (userIds.length === 0) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }
  const { id: idStr } = await context.params;
  const id = parseInt(idStr, 10);
  const brief = getBriefById(id);
  if (!brief) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (!userIds.includes(brief.user_id)) {
    return NextResponse.json({ error: "not_authorized" }, { status: 403 });
  }
  return NextResponse.json({
    id: brief.id,
    template_id: brief.template_id,
    title: brief.title,
    status: brief.status,
    output: brief.output_json ? safeParse(brief.output_json) : null,
    error: brief.error_text,
    pinned: brief.pinned === 1,
    created_at: brief.created_at,
    completed_at: brief.completed_at,
  });
}

function safeParse(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

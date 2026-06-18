import { NextRequest, NextResponse } from "next/server";
import { getSession, readUserIds } from "@/lib/session";
import { updateFindingStatus } from "@/lib/db";

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  const userIds = readUserIds(session);
  if (userIds.length === 0) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }
  const { id: idStr } = await context.params;
  const id = parseInt(idStr, 10);
  if (!id) return NextResponse.json({ error: "invalid_id" }, { status: 400 });
  const body = (await req.json()) as { status?: string };
  if (!body.status || !["new", "viewed", "investigating", "pinned", "dismissed"].includes(body.status)) {
    return NextResponse.json({ error: "invalid_status" }, { status: 400 });
  }
  updateFindingStatus({ id, user_ids: userIds, status: body.status });
  return NextResponse.json({ ok: true });
}

import { NextRequest, NextResponse } from "next/server";
import { getSession, readUserIds } from "@/lib/session";
import { getWorkspaceById } from "@/lib/db";
import { bumpWorkspaceUsage } from "@/lib/workspace";
import { onboardWorkspace } from "@/lib/onboarding";

export async function POST(req: NextRequest) {
  const session = await getSession();
  const userIds = readUserIds(session);
  if (userIds.length === 0) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }
  const body = (await req.json()) as { workspace_id?: number };
  if (!body.workspace_id) {
    return NextResponse.json({ error: "missing_workspace_id" }, { status: 400 });
  }
  const ws = getWorkspaceById(body.workspace_id);
  if (!ws) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (!userIds.includes(ws.user_id)) {
    return NextResponse.json({ error: "not_authorized" }, { status: 403 });
  }
  if (ws.archived) {
    return NextResponse.json({ error: "workspace_archived" }, { status: 400 });
  }

  session.active_workspace_id = ws.id;
  // Clear legacy fields
  session.active_property_ids = undefined;
  await session.save();
  bumpWorkspaceUsage(ws.id);

  // Onboard on switch: build brand context FIRST, then scan — so findings are
  // grounded in the brand/competitor context rather than racing ahead of it.
  // Skips the build if context already exists. Fire-and-forget.
  onboardWorkspace(ws.id).catch(() => {});

  return NextResponse.json({ ok: true, workspace: ws });
}

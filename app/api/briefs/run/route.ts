import { NextRequest, NextResponse } from "next/server";
import { getSession, readPrimaryUserId, readUserIds } from "@/lib/session";
import { createBrief, getWorkspaceById } from "@/lib/db";
import { resolveActiveWorkspace } from "@/lib/workspace";
import { runBrief } from "@/lib/briefs/runner";
import { BRIEF_TEMPLATES } from "@/lib/briefs/templates";
import { runWithUsage } from "@/lib/usage/context";

export const maxDuration = 120;

export async function POST(req: NextRequest) {
  const session = await getSession();
  const userIds = readUserIds(session);
  const userId = readPrimaryUserId(session);
  if (!userId || userIds.length === 0) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }

  const body = (await req.json()) as {
    template_id?: string;
    workspace_id?: number;
    params?: Record<string, unknown>;
    date_range_start?: string;
    date_range_end?: string;
    comparison_range_start?: string;
    comparison_range_end?: string;
  };

  if (!body.template_id || !BRIEF_TEMPLATES[body.template_id]) {
    return NextResponse.json({ error: "invalid_template" }, { status: 400 });
  }

  const ws = body.workspace_id ? getWorkspaceById(body.workspace_id) : resolveActiveWorkspace(session);
  if (!ws) {
    return NextResponse.json({ error: "no_active_workspace" }, { status: 400 });
  }
  if (!userIds.includes(ws.user_id)) {
    return NextResponse.json({ error: "not_authorized" }, { status: 403 });
  }

  const tmpl = BRIEF_TEMPLATES[body.template_id];
  const brief = createBrief({
    user_id: userId,
    workspace_id: ws.id,
    template_id: body.template_id,
    title: tmpl.title,
    params: body.params,
    date_range_start: body.date_range_start,
    date_range_end: body.date_range_end,
    comparison_range_start: body.comparison_range_start,
    comparison_range_end: body.comparison_range_end,
  });

  try {
    await runWithUsage(
      { userId, workspaceId: ws.id, section: "brief" },
      () =>
        runBrief({
          brief_id: brief.id,
          workspace_id: ws.id,
          template_id: body.template_id!,
          params: body.params,
          date_range_start: body.date_range_start,
          date_range_end: body.date_range_end,
          comparison_range_start: body.comparison_range_start,
          comparison_range_end: body.comparison_range_end,
        })
    );
    return NextResponse.json({ ok: true, brief_id: brief.id });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg, brief_id: brief.id }, { status: 500 });
  }
}

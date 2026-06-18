import { NextRequest, NextResponse } from "next/server";
import { getSession, readPrimaryUserId, readUserIds } from "@/lib/session";
import {
  getDb,
  getWorkspaceById,
} from "@/lib/db";
import { resolveActiveWorkspace } from "@/lib/workspace";

type Body = {
  workspace_id?: number;
  customers: Array<{
    customer_id: string;
    display_name: string;
    account_email: string;
  }>;
};

export async function POST(req: NextRequest) {
  const session = await getSession();
  const userIds = readUserIds(session);
  const primary = readPrimaryUserId(session);
  if (!primary || userIds.length === 0) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }
  const body = (await req.json().catch(() => ({}))) as Body;
  if (!body.customers || body.customers.length === 0) {
    return NextResponse.json({ error: "no_customers" }, { status: 400 });
  }
  const ws = body.workspace_id
    ? getWorkspaceById(body.workspace_id)
    : resolveActiveWorkspace(session);
  if (!ws || !userIds.includes(ws.user_id)) {
    return NextResponse.json({ error: "workspace_not_found" }, { status: 404 });
  }
  let existing: Array<{
    type: string;
    source_id: string;
    display_name: string;
    account_email: string;
  }> = [];
  try {
    existing = ws.connected_sources ? JSON.parse(ws.connected_sources) : [];
  } catch {
    existing = [];
  }
  for (const c of body.customers) {
    const key = `google_ads:${c.customer_id}`;
    if (existing.some((s) => `${s.type}:${s.source_id}` === key)) continue;
    existing.push({
      type: "google_ads",
      source_id: c.customer_id,
      display_name: c.display_name,
      account_email: c.account_email,
    });
  }
  getDb()
    .prepare("UPDATE workspaces SET connected_sources = ? WHERE id = ?")
    .run(JSON.stringify(existing), ws.id);
  return NextResponse.json({
    workspace_id: ws.id,
    connected_sources: existing,
  });
}

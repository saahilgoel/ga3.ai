import { NextRequest, NextResponse } from "next/server";
import { getSession, readUserIds } from "@/lib/session";
import { resolveActiveWorkspace } from "@/lib/workspace";
import { getBusinessType } from "@/lib/db";
import { getWorkspaceContextSummary } from "@/lib/context/summary";
import { generateInsights } from "@/lib/insights";
import type { DashboardResponse } from "@/lib/dashboard";

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (readUserIds(session).length === 0) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }
  const body = (await req.json().catch(() => ({}))) as { data?: DashboardResponse };
  if (!body.data) return NextResponse.json({ cards: [] });

  try {
    const ws = resolveActiveWorkspace(session);
    const businessType = ws ? getBusinessType(ws.id)?.business_type ?? undefined : undefined;
    let contextSummary: string | undefined;
    if (ws) {
      try {
        contextSummary = (await getWorkspaceContextSummary(ws.id)).summary;
      } catch {
        /* context optional */
      }
    }
    const cards = await generateInsights({ data: body.data, businessType, contextSummary });
    return NextResponse.json({ cards });
  } catch {
    return NextResponse.json({ cards: [] });
  }
}

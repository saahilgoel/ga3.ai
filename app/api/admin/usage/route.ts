import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { isAdmin } from "@/lib/admin";
import { usageSummary } from "@/lib/usage/query";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!isAdmin(session)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const days = Number(new URL(req.url).searchParams.get("days") || "0");
  const sinceTs = days > 0 ? Math.floor(Date.now() / 1000) - days * 86400 : 0;
  return NextResponse.json(usageSummary(sinceTs));
}

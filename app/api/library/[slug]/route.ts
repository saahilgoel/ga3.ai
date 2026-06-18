import { NextResponse } from "next/server";
import { getSession, readUserIds } from "@/lib/session";
import { getBriefTemplate } from "@/lib/library/db";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const session = await getSession();
  if (readUserIds(session).length === 0) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }
  const { slug } = await params;
  const brief = getBriefTemplate(slug);
  if (!brief) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  return NextResponse.json({ brief });
}

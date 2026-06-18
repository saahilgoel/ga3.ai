import { NextResponse } from "next/server";
import { getSession, readPrimaryUserId, readUserIds } from "@/lib/session";
import { testMoEngageConnection } from "@/lib/sources/moengage/api";

export async function POST() {
  const session = await getSession();
  const userId = readPrimaryUserId(session);
  if (!userId || readUserIds(session).length === 0) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }
  const r = await testMoEngageConnection(userId);
  return NextResponse.json(r);
}

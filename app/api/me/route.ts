import { NextResponse } from "next/server";
import { getSession, readPrimaryUserId } from "@/lib/session";
import { getUserById } from "@/lib/db";

export async function GET() {
  const session = await getSession();
  const userId = readPrimaryUserId(session);
  if (!userId) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }
  const user = getUserById(userId);
  if (!user) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  return NextResponse.json(
    {
      id: user.id,
      email: user.email,
    },
    {
      headers: {
        "Cache-Control": "private, max-age=60, stale-while-revalidate=300",
      },
    }
  );
}

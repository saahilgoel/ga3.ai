import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import { buildAuthUrl } from "@/lib/google";
import { getSession } from "@/lib/session";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const addMode = url.searchParams.get("add") === "1";

  const session = await getSession();
  const state = crypto.randomBytes(16).toString("hex");
  session.oauth_state = state;
  session.oauth_add_mode = addMode || undefined;
  await session.save();

  return NextResponse.redirect(buildAuthUrl(state, { addMode }));
}

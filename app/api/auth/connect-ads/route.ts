import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import { getSession, readPrimaryUserId } from "@/lib/session";
import { buildAdsGrantUrl } from "@/lib/google";
import { relativeRedirect } from "@/lib/redirect";

export async function GET(req: NextRequest) {
  const session = await getSession();
  const userId = readPrimaryUserId(session);
  if (!userId) {
    return relativeRedirect("/");
  }
  const state = crypto.randomBytes(16).toString("hex");
  session.oauth_state = state;
  session.oauth_flow = "ads_grant";
  // Where to send the user after the grant lands.
  const back = new URL(req.url).searchParams.get("back") || "/workspace";
  session.oauth_post_redirect = back;
  await session.save();
  return NextResponse.redirect(buildAdsGrantUrl(state));
}

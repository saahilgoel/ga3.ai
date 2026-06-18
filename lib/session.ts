import { getIronSession, SessionOptions } from "iron-session";
import { cookies } from "next/headers";

export type SessionData = {
  user_ids?: number[];
  primary_user_id?: number;
  active_workspace_id?: number;
  // Legacy: now derived from active workspace, but read for backward-compat
  active_property_ids?: number[];
  oauth_state?: string;
  oauth_add_mode?: boolean;
  // v7: when set, the callback redirects here instead of /properties.
  // Also signals whether the flow was an Ads grant (so callback enriches user tokens).
  oauth_post_redirect?: string;
  oauth_flow?: "login" | "ads_grant";
  // Legacy single-user fields, kept for backward-compat reads:
  user_id?: number;
  selected_property_id?: number;
};

export const sessionOptions: SessionOptions = {
  password: process.env.SESSION_SECRET || "dev_secret_change_me_minimum_32_chars_long_xx",
  cookieName: "ga-chat-session",
  cookieOptions: {
    secure: process.env.NODE_ENV === "production",
    httpOnly: true,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 30,
  },
};

export async function getSession() {
  const cookieStore = await cookies();
  return getIronSession<SessionData>(cookieStore, sessionOptions);
}

export function readUserIds(s: SessionData): number[] {
  if (s.user_ids && s.user_ids.length > 0) return s.user_ids;
  if (s.user_id) return [s.user_id];
  return [];
}

export function readActivePropertyIds(s: SessionData): number[] {
  if (s.active_property_ids && s.active_property_ids.length > 0) return s.active_property_ids;
  if (s.selected_property_id) return [s.selected_property_id];
  return [];
}

export function readPrimaryUserId(s: SessionData): number | undefined {
  if (s.primary_user_id) return s.primary_user_id;
  if (s.user_id) return s.user_id;
  return s.user_ids?.[0];
}

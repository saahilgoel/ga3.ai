import { NextRequest } from "next/server";
import { google } from "googleapis";
import { makeOAuthClient } from "@/lib/google";
import { getDb, upsertUser } from "@/lib/db";
import { getSession, readUserIds } from "@/lib/session";
import { relativeRedirect } from "@/lib/redirect";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");
  const grantedScope = url.searchParams.get("scope") ?? "";

  const session = await getSession();
  if (error) {
    return relativeRedirect(`/?error=${encodeURIComponent(error)}`);
  }
  if (!code || !state || state !== session.oauth_state) {
    return relativeRedirect("/?error=invalid_state");
  }

  const flow = session.oauth_flow ?? "login";
  const postRedirect = session.oauth_post_redirect;
  const addMode = !!session.oauth_add_mode;
  void addMode;

  const client = makeOAuthClient();
  const { tokens } = await client.getToken(code);
  if (!tokens.id_token) {
    return relativeRedirect("/?error=missing_id_token_revoke_app_and_retry");
  }

  client.setCredentials(tokens);
  const oauth2 = google.oauth2({ version: "v2", auth: client });
  const me = await oauth2.userinfo.get();

  const sub = me.data.id;
  const email = me.data.email;
  if (!sub || !email) {
    return relativeRedirect("/?error=no_user_info");
  }

  const expiresAt = Math.floor((tokens.expiry_date || Date.now() + 3500_000) / 1000);
  // Initial logins must have a refresh_token (prompt=consent forces this).
  // Incremental grants reuse the existing refresh_token — if Google omits it,
  // keep the prior one.
  const refreshTokenToStore = tokens.refresh_token;
  if (!refreshTokenToStore && flow === "login") {
    return relativeRedirect("/?error=missing_refresh_token_revoke_app_and_retry");
  }

  // upsertUser only changes refresh_token if a new one is provided.
  const user = upsertUser({
    google_sub: sub,
    email,
    refresh_token: refreshTokenToStore ?? "(reuse_existing)",
    access_token: tokens.access_token ?? null,
    token_expires_at: expiresAt,
  });

  // If incremental grant didn't return a fresh refresh_token, keep the old one.
  if (!refreshTokenToStore) {
    // upsertUser will have written the placeholder; revert to existing token via DB read.
    const db = getDb();
    const row = db
      .prepare("SELECT refresh_token FROM users WHERE id = ?")
      .get(user.id) as { refresh_token: string } | undefined;
    if (row?.refresh_token === "(reuse_existing)") {
      // Shouldn't happen since upsertUser preserves prior refresh_token in update path,
      // but guard anyway.
      console.warn("[oauth] no refresh_token preserved for user", user.id);
    }
  }

  // Persist provider-level tokens into oauth_tokens for multi-source bookkeeping.
  try {
    const db = getDb();
    const scopesArr = grantedScope
      ? grantedScope.split(/\s+/).filter(Boolean)
      : [];
    db.prepare(
      `INSERT INTO oauth_tokens (user_id, provider, account_identifier, access_token, refresh_token, scopes, token_expires_at)
       VALUES (?, 'google', ?, ?, ?, ?, ?)
       ON CONFLICT(user_id, provider, account_identifier)
       DO UPDATE SET access_token = excluded.access_token,
                     refresh_token = COALESCE(excluded.refresh_token, oauth_tokens.refresh_token),
                     scopes = excluded.scopes,
                     token_expires_at = excluded.token_expires_at`
    ).run(
      user.id,
      email,
      tokens.access_token ?? "",
      refreshTokenToStore ?? null,
      JSON.stringify(scopesArr),
      expiresAt
    );
  } catch (err) {
    console.warn("[oauth] could not persist oauth_tokens:", (err as Error).message);
  }

  const existing = new Set(readUserIds(session));
  existing.add(user.id);
  session.user_ids = Array.from(existing);
  if (!session.primary_user_id) {
    session.primary_user_id = user.id;
  }
  session.user_id = undefined;
  session.oauth_state = undefined;
  session.oauth_add_mode = undefined;
  session.oauth_flow = undefined;
  session.oauth_post_redirect = undefined;
  await session.save();

  // Route by flow.
  if (flow === "ads_grant") {
    const dest = postRedirect ? `${postRedirect}?ads_grant=1` : "/workspace?ads_grant=1";
    return relativeRedirect(dest);
  }
  return relativeRedirect(postRedirect ?? "/properties");
}

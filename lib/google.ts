import { google } from "googleapis";
import { getUserById, updateUserTokens, UserRow } from "./db";

export const OAUTH_SCOPES = [
  "openid",
  "email",
  "https://www.googleapis.com/auth/analytics.readonly",
];

// v7: Google Ads scope (incremental grant on top of GA4).
export const ADS_SCOPE = "https://www.googleapis.com/auth/adwords";

export function buildAdsGrantUrl(state: string): string {
  const client = makeOAuthClient();
  return client.generateAuthUrl({
    access_type: "offline",
    // Incremental scope grant: ask only for adwords this time, but use
    // include_granted_scopes so the resulting token has analytics+adwords.
    prompt: "consent",
    scope: [...OAUTH_SCOPES, ADS_SCOPE],
    state,
    include_granted_scopes: true,
  });
}

export function makeOAuthClient() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
}

export function buildAuthUrl(state: string, opts: { addMode?: boolean } = {}) {
  const client = makeOAuthClient();
  return client.generateAuthUrl({
    access_type: "offline",
    // When adding an account, force the Google account picker as well.
    prompt: opts.addMode ? "consent select_account" : "consent",
    scope: OAUTH_SCOPES,
    state,
    include_granted_scopes: true,
  });
}

export async function getFreshAccessToken(userId: number): Promise<string> {
  const user = getUserById(userId);
  if (!user) throw new Error("user not found");

  const now = Math.floor(Date.now() / 1000);
  if (user.access_token && user.token_expires_at && user.token_expires_at - 30 > now) {
    return user.access_token;
  }

  const client = makeOAuthClient();
  client.setCredentials({ refresh_token: user.refresh_token });
  const { credentials } = await client.refreshAccessToken();
  const access_token = credentials.access_token!;
  const expires_at = Math.floor((credentials.expiry_date || Date.now() + 3500_000) / 1000);
  const new_refresh = credentials.refresh_token && credentials.refresh_token !== user.refresh_token
    ? credentials.refresh_token
    : undefined;
  updateUserTokens(userId, access_token, expires_at, new_refresh);
  return access_token;
}

export function authedClient(accessToken: string) {
  const client = makeOAuthClient();
  client.setCredentials({ access_token: accessToken });
  return client;
}

export async function listGa4Properties(accessToken: string) {
  const auth = authedClient(accessToken);
  const admin = google.analyticsadmin({ version: "v1beta", auth });

  const properties: Array<{
    ga4_property_id: string;
    display_name: string;
    account_name: string;
  }> = [];
  let pageToken: string | undefined;
  do {
    const res = await admin.accountSummaries.list({ pageSize: 200, pageToken });
    for (const s of res.data.accountSummaries || []) {
      const accountName = s.displayName || "";
      for (const p of s.propertySummaries || []) {
        if (!p.property || !p.displayName) continue;
        properties.push({
          ga4_property_id: p.property,
          display_name: p.displayName,
          account_name: accountName,
        });
      }
    }
    pageToken = res.data.nextPageToken || undefined;
  } while (pageToken);

  return properties;
}

export async function getPropertyWebsiteUrl(
  accessToken: string,
  propertyId: string
): Promise<string | undefined> {
  const auth = authedClient(accessToken);
  const admin = google.analyticsadmin({ version: "v1beta", auth });
  try {
    const dsRes = await admin.properties.dataStreams.list({
      parent: propertyId,
      pageSize: 50,
    });
    const webStream = (dsRes.data.dataStreams || []).find(
      (s) => s.type === "WEB_DATA_STREAM" && s.webStreamData?.defaultUri
    );
    return webStream?.webStreamData?.defaultUri || undefined;
  } catch {
    return undefined;
  }
}

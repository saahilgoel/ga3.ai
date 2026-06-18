// Google Ads API wrapper.
//
// Uses the `google-ads-api` npm package. Requires a developer token from a
// Google Ads Manager account (set GOOGLE_ADS_DEVELOPER_TOKEN). Until that
// env var is set, listAccessibleCustomers/runGaql degrade gracefully.

import { getDb, getAppSetting } from "@/lib/db";
import { getFreshAccessToken } from "@/lib/google";
import { GoogleAdsApi, type Customer } from "google-ads-api";

// Settings keys
const SETTING_TOKEN = "google_ads_developer_token";
const SETTING_LOGIN_CUSTOMER_ID = "google_ads_login_customer_id";

// Token resolution: env (dev override) → per-user DB setting → null.
function getDeveloperToken(userId: number | null): string | null {
  if (process.env.GOOGLE_ADS_DEVELOPER_TOKEN) {
    return process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
  }
  if (userId == null) return null;
  return getAppSetting({ user_id: userId, key: SETTING_TOKEN });
}

function getLoginCustomerId(userId: number | null): string | undefined {
  if (process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID) {
    return process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID;
  }
  if (userId == null) return undefined;
  const v = getAppSetting({ user_id: userId, key: SETTING_LOGIN_CUSTOMER_ID });
  return v || undefined;
}

// Quick boolean — used in places that don't know the userId.
// Returns true if EITHER env is set OR any user has stored a token.
export function isGoogleAdsConfigured(userId?: number): boolean {
  if (process.env.GOOGLE_ADS_DEVELOPER_TOKEN) return true;
  if (userId != null) {
    return !!getAppSetting({ user_id: userId, key: SETTING_TOKEN });
  }
  // Without a userId we can still answer "is there any token stored anywhere?"
  // Cheap query — single row check.
  try {
    const row = getDb()
      .prepare("SELECT 1 FROM app_settings WHERE key = ? LIMIT 1")
      .get(SETTING_TOKEN) as { 1: number } | undefined;
    return !!row;
  } catch {
    return false;
  }
}

// One client per developer token. Built lazily, cached per token.
// Capped at 4 entries so a long-running dev session can't accumulate SDK
// instances if multiple users / tokens hit the process.
const _clients = new Map<string, GoogleAdsApi>();
const _clientCap = 4;
function getClient(devToken: string): GoogleAdsApi {
  const existing = _clients.get(devToken);
  if (existing) {
    // Touch for LRU semantics.
    _clients.delete(devToken);
    _clients.set(devToken, existing);
    return existing;
  }
  const client = new GoogleAdsApi({
    client_id: process.env.GOOGLE_CLIENT_ID || "",
    client_secret: process.env.GOOGLE_CLIENT_SECRET || "",
    developer_token: devToken,
  });
  _clients.set(devToken, client);
  if (_clients.size > _clientCap) {
    const firstKey = _clients.keys().next().value;
    if (firstKey !== undefined) _clients.delete(firstKey);
  }
  return client;
}

// External helpers used by the settings API + token-form save.
export const ADS_SETTING_KEYS = {
  token: SETTING_TOKEN,
  loginCustomerId: SETTING_LOGIN_CUSTOMER_ID,
};

export type AdsCustomer = {
  customer_id: string;
  display_name: string;
  currency: string | null;
  is_manager: boolean;
};

// Look up a user's stored Google refresh token. Falls back to the legacy
// users.refresh_token if oauth_tokens has nothing for the user.
export function getUserRefreshToken(userId: number): string | null {
  const db = getDb();
  const row = db
    .prepare(
      "SELECT refresh_token FROM oauth_tokens WHERE user_id = ? AND provider = 'google' AND refresh_token IS NOT NULL ORDER BY id DESC LIMIT 1"
    )
    .get(userId) as { refresh_token: string } | undefined;
  if (row?.refresh_token) return row.refresh_token;
  const legacy = db
    .prepare("SELECT refresh_token FROM users WHERE id = ?")
    .get(userId) as { refresh_token: string } | undefined;
  return legacy?.refresh_token ?? null;
}

// Check whether the user has granted the adwords scope.
export function userHasAdsScope(userId: number): boolean {
  const db = getDb();
  const row = db
    .prepare(
      "SELECT scopes FROM oauth_tokens WHERE user_id = ? AND provider = 'google' ORDER BY id DESC LIMIT 1"
    )
    .get(userId) as { scopes: string } | undefined;
  if (!row) return false;
  try {
    const scopes = JSON.parse(row.scopes) as string[];
    return scopes.includes("https://www.googleapis.com/auth/adwords");
  } catch {
    return false;
  }
}

export async function listAccessibleAdsCustomers(args: {
  userId: number;
}): Promise<AdsCustomer[]> {
  const devToken = getDeveloperToken(args.userId);
  if (!devToken) {
    throw new Error(
      "Google Ads developer token not set. Paste yours in the Connect Google Ads wizard."
    );
  }
  const refresh = getUserRefreshToken(args.userId);
  if (!refresh) {
    throw new Error("No Google refresh token on file for this user.");
  }
  const client = getClient(devToken);
  const loginCid = getLoginCustomerId(args.userId);
  // listAccessibleCustomers returns { resource_names: ['customers/123', ...] }
  const accessible = await client.listAccessibleCustomers(refresh);
  // Fetch descriptive metadata for each, in parallel.
  const customers: AdsCustomer[] = await Promise.all(
    accessible.resource_names.map(async (rn: string) => {
      const customer_id = rn.replace(/^customers\//, "");
      try {
        const c = client.Customer({
          customer_id,
          refresh_token: refresh,
          login_customer_id: loginCid,
        });
        const rows = await c.query(`
          SELECT customer.id, customer.descriptive_name, customer.currency_code, customer.manager
          FROM customer
          LIMIT 1
        `);
        const first = rows[0]?.customer;
        return {
          customer_id,
          display_name: first?.descriptive_name || customer_id,
          currency: first?.currency_code ?? null,
          is_manager: !!first?.manager,
        };
      } catch {
        return {
          customer_id,
          display_name: customer_id,
          currency: null,
          is_manager: false,
        };
      }
    })
  );
  return customers;
}

export function getAdsCustomer(args: {
  userId: number;
  customerId: string;
}): Customer {
  const devToken = getDeveloperToken(args.userId);
  if (!devToken) throw new Error("Google Ads developer token not set.");
  const refresh = getUserRefreshToken(args.userId);
  if (!refresh) throw new Error("No Google refresh token on file.");
  const client = getClient(devToken);
  return client.Customer({
    customer_id: args.customerId,
    refresh_token: refresh,
    login_customer_id: getLoginCustomerId(args.userId),
  });
}

export async function runGaql(args: {
  userId: number;
  customerId: string;
  query: string;
}): Promise<unknown[]> {
  const customer = getAdsCustomer(args);
  // Touch access token so the SDK refreshes if needed.
  await getFreshAccessToken(args.userId).catch(() => null);
  return customer.query(args.query);
}

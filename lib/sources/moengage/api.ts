// MoEngage API client.
//
// MoEngage uses HTTP Basic Auth with DATA_API_ID:DATA_API_KEY (different
// from Google's OAuth flow). Each MoEngage account lives on a specific
// data center: DC-01 (Mumbai), DC-02 (US East), DC-03 (Europe), etc.
// Base URL is derived from that selection.
//
// Settings stored in app_settings:
//   - moengage_app_id           (e.g. "P9XYZABC123")
//   - moengage_data_api_id      (REST API ID)
//   - moengage_data_api_key     (REST API password)
//   - moengage_data_center      (e.g. "dc-01")

import { getAppSetting } from "@/lib/db";

export const MOENGAGE_SETTING_KEYS = {
  appId: "moengage_app_id",
  apiId: "moengage_data_api_id",
  apiKey: "moengage_data_api_key",
  dataCenter: "moengage_data_center",
};

// Per MoEngage's public docs.
export const DATA_CENTERS: Record<string, { label: string; host: string }> = {
  "dc-01": { label: "DC-01 · Mumbai (India)", host: "api-01.moengage.com" },
  "dc-02": { label: "DC-02 · US East", host: "api-02.moengage.com" },
  "dc-03": { label: "DC-03 · Frankfurt (EU)", host: "api-03.moengage.com" },
  "dc-04": { label: "DC-04 · Indonesia", host: "api-04.moengage.com" },
};

export type MoEngageConfig = {
  appId: string;
  apiId: string;
  apiKey: string;
  dataCenter: string;
  host: string;
};

export function getMoEngageConfig(userId: number): MoEngageConfig | null {
  const appId = getAppSetting({ user_id: userId, key: MOENGAGE_SETTING_KEYS.appId });
  const apiId = getAppSetting({ user_id: userId, key: MOENGAGE_SETTING_KEYS.apiId });
  const apiKey = getAppSetting({ user_id: userId, key: MOENGAGE_SETTING_KEYS.apiKey });
  const dc =
    getAppSetting({ user_id: userId, key: MOENGAGE_SETTING_KEYS.dataCenter }) ||
    "dc-01";
  if (!appId || !apiId || !apiKey) return null;
  const host = DATA_CENTERS[dc]?.host ?? DATA_CENTERS["dc-01"].host;
  return { appId, apiId, apiKey, dataCenter: dc, host };
}

export function isMoEngageConfigured(userId?: number): boolean {
  if (userId == null) return false;
  return !!getMoEngageConfig(userId);
}

function authHeader(cfg: MoEngageConfig): string {
  // MoEngage accepts Basic Auth with api_id:api_key.
  const credentials = Buffer.from(`${cfg.apiId}:${cfg.apiKey}`).toString("base64");
  return `Basic ${credentials}`;
}

export async function moengageFetch<T>(args: {
  userId: number;
  path: string;
  method?: "GET" | "POST";
  body?: unknown;
  query?: Record<string, string | number | undefined>;
}): Promise<T> {
  const cfg = getMoEngageConfig(args.userId);
  if (!cfg) throw new Error("MoEngage not configured for this user");
  const url = new URL(`https://${cfg.host}${args.path}`);
  for (const [k, v] of Object.entries(args.query ?? {})) {
    if (v != null) url.searchParams.set(k, String(v));
  }
  const res = await fetch(url.toString(), {
    method: args.method ?? "GET",
    headers: {
      Authorization: authHeader(cfg),
      "Content-Type": "application/json",
      // MoEngage rejects missing UA in some DCs; identify the client cleanly.
      "MOE-APPKEY": cfg.appId,
    },
    body: args.body ? JSON.stringify(args.body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `MoEngage HTTP ${res.status} ${args.path}: ${text.slice(0, 240)}`
    );
  }
  return (await res.json()) as T;
}

// --- Test connection ---
// Tries a lightweight endpoint. If it succeeds → credentials are good.
// We use the campaign listing endpoint since that's read-only and stable.
export async function testMoEngageConnection(userId: number): Promise<{
  ok: boolean;
  detail?: string;
  campaign_count?: number;
}> {
  try {
    const cfg = getMoEngageConfig(userId);
    if (!cfg) return { ok: false, detail: "Credentials missing" };
    // The campaigns/info endpoint is the cheapest validation hit.
    const data = await moengageFetch<{
      data?: { campaigns?: unknown[] };
    }>({
      userId,
      path: `/v1.0/campaigns/info`,
      query: { app_id: cfg.appId },
    });
    const count = data.data?.campaigns?.length ?? 0;
    return { ok: true, campaign_count: count };
  } catch (err) {
    return { ok: false, detail: (err as Error).message };
  }
}

// --- Campaign report ---
// Pulls campaign performance over a date window.

export type MoEngageCampaign = {
  campaign_id: string;
  name: string;
  channel: string;
  status: string;
  start_time?: string;
  end_time?: string;
};

export type MoEngageCampaignStats = {
  campaign_id: string;
  name: string;
  channel: string;
  sent: number;
  delivered: number;
  opened: number;
  clicked: number;
  converted: number;
  unsubscribed: number;
};

export async function listMoEngageCampaigns(args: {
  userId: number;
  limit?: number;
}): Promise<MoEngageCampaign[]> {
  const cfg = getMoEngageConfig(args.userId);
  if (!cfg) throw new Error("MoEngage not configured");
  type Resp = {
    data?: {
      campaigns?: Array<{
        campaign_id: string;
        name: string;
        channel?: string;
        type?: string;
        status?: string;
        start_time?: string;
        end_time?: string;
      }>;
    };
  };
  const d = await moengageFetch<Resp>({
    userId: args.userId,
    path: `/v1.0/campaigns/info`,
    query: { app_id: cfg.appId, limit: args.limit ?? 50 },
  });
  return (d.data?.campaigns ?? []).map((c) => ({
    campaign_id: c.campaign_id,
    name: c.name,
    channel: c.channel ?? c.type ?? "unknown",
    status: c.status ?? "unknown",
    start_time: c.start_time,
    end_time: c.end_time,
  }));
}

export async function getCampaignStats(args: {
  userId: number;
  campaignId: string;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
}): Promise<MoEngageCampaignStats | null> {
  const cfg = getMoEngageConfig(args.userId);
  if (!cfg) throw new Error("MoEngage not configured");
  type Resp = {
    data?: {
      campaign_id?: string;
      name?: string;
      channel?: string;
      stats?: {
        sent?: number;
        delivered?: number;
        opened?: number;
        clicked?: number;
        converted?: number;
        unsubscribed?: number;
      };
    };
  };
  const d = await moengageFetch<Resp>({
    userId: args.userId,
    path: `/v1.0/campaigns/${args.campaignId}/stats`,
    query: {
      app_id: cfg.appId,
      start_date: args.startDate,
      end_date: args.endDate,
    },
  });
  if (!d.data) return null;
  const s = d.data.stats ?? {};
  return {
    campaign_id: d.data.campaign_id ?? args.campaignId,
    name: d.data.name ?? args.campaignId,
    channel: d.data.channel ?? "unknown",
    sent: s.sent ?? 0,
    delivered: s.delivered ?? 0,
    opened: s.opened ?? 0,
    clicked: s.clicked ?? 0,
    converted: s.converted ?? 0,
    unsubscribed: s.unsubscribed ?? 0,
  };
}

// --- Segment count ---
// Returns the size of a named segment as MoEngage measures it.

export async function getSegmentCount(args: {
  userId: number;
  segmentId: string;
}): Promise<number | null> {
  const cfg = getMoEngageConfig(args.userId);
  if (!cfg) throw new Error("MoEngage not configured");
  try {
    type Resp = { data?: { count?: number; size?: number } };
    const d = await moengageFetch<Resp>({
      userId: args.userId,
      path: `/v1.0/segments/${args.segmentId}/count`,
      query: { app_id: cfg.appId },
    });
    return d.data?.count ?? d.data?.size ?? null;
  } catch {
    return null;
  }
}

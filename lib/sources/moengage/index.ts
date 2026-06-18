// MoEngage source — live in v7.5.
//
// Auth differs from GA4 / Google Ads: API-key based, not OAuth. The user
// pastes APP_ID + DATA_API_ID + DATA_API_KEY + DATA_CENTER in the connect
// wizard (/connect/moengage), credentials are stored per-user in
// app_settings, then attached to a workspace via /api/sources/moengage/attach.

import type { AvailableSource, DataSource } from "../types";
import { isMoEngageConfigured, getMoEngageConfig } from "./api";

export const moengageSource: DataSource = {
  id: "moengage",
  displayName: "MoEngage",
  icon: "Send",
  status: "live",
  // Provider is not "google" — MoEngage uses its own API keys, but we re-use
  // the oauth_tokens shape conceptually. The provider field stays "meta" as a
  // placeholder for "non-google"; the actual auth happens via app_settings.
  oauthProvider: "meta",
  requiredScopes: [],
  agentToolNames: [
    "list_moengage_campaigns",
    "get_moengage_campaign_stats",
    "get_moengage_segment_count",
    "compare_engagement_to_outcomes",
  ],
  async listAvailableSources({ userId }): Promise<AvailableSource[]> {
    if (!isMoEngageConfigured(userId)) return [];
    const cfg = getMoEngageConfig(userId);
    if (!cfg) return [];
    return [
      {
        source_id: cfg.appId,
        display_name: `MoEngage app · ${cfg.appId}`,
        account_email: "", // not applicable
        metadata: { data_center: cfg.dataCenter },
      },
    ];
  },
};

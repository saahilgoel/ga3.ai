// Meta Ads source — stub for v7.5. (MoEngage shipped before Meta Ads.)

import type { AvailableSource, DataSource } from "../types";

export const metaAdsSource: DataSource = {
  id: "meta_ads",
  displayName: "Meta Ads",
  icon: "Users2",
  status: "stub",
  oauthProvider: "meta",
  requiredScopes: ["ads_read", "ads_management"],
  agentToolNames: ["run_meta_ads_report"],
  async listAvailableSources(): Promise<AvailableSource[]> {
    return [];
  },
};

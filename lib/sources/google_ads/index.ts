// Google Ads source — stub for v7 phase 2.
//
// Phase 2 work: implement OAuth incremental scope grant, install
// `google-ads-api` npm package, wire customer-hierarchy discovery, build
// run_google_ads_report + compare_spend_to_conversions tools.

import type { AvailableSource, DataSource } from "../types";

export const googleAdsSource: DataSource = {
  id: "google_ads",
  displayName: "Google Ads",
  icon: "Megaphone",
  status: "stub",
  oauthProvider: "google",
  // Shares the Google OAuth flow as GA4 — adds the adwords scope on top.
  requiredScopes: ["https://www.googleapis.com/auth/adwords"],
  agentToolNames: [
    "run_google_ads_report",
    "get_google_ads_overview",
    "compare_spend_to_conversions",
  ],
  async listAvailableSources(): Promise<AvailableSource[]> {
    // TODO(v7 phase 2): wire google-ads-api listAccessibleCustomers().
    return [];
  },
};

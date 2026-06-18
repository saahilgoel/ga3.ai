// GA4 source. Thin wrapper delegating to the existing GA4 code paths in
// lib/google.ts and lib/ga4.ts — purely a registration shim so the rest of
// the app can iterate over `SOURCES` and treat GA4 as one of N data sources.

import type { AvailableSource, DataSource } from "../types";
import { listGa4Properties, getFreshAccessToken } from "@/lib/google";

export const ga4Source: DataSource = {
  id: "ga4",
  displayName: "Google Analytics 4",
  icon: "BarChart3",
  status: "live",
  oauthProvider: "google",
  requiredScopes: ["https://www.googleapis.com/auth/analytics.readonly"],
  agentToolNames: [
    "run_report",
    "run_per_property_report",
    "get_metadata",
    "run_realtime",
    "run_funnel_report",
    "get_property_overview",
    "get_demographics_breakdown",
    "get_product_usage",
    "render_visualization",
    "query_context",
  ],
  async listAvailableSources({ userId }) {
    const token = await getFreshAccessToken(userId);
    const props = await listGa4Properties(token);
    return props.map(
      (p): AvailableSource => ({
        source_id: p.ga4_property_id,
        display_name: p.display_name,
        account_email: "", // populated by caller from session
        metadata: { account_name: p.account_name },
      })
    );
  },
};

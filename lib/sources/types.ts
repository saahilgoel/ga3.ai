// Source-plugin architecture for v7+.
//
// A `DataSource` is a connectable third-party (GA4, Google Ads, Meta Ads, ...).
// Each source ships:
//   - OAuth scopes and a token-grant flow
//   - A method to enumerate sub-accounts (e.g. GA4 properties, Ads customers)
//   - Agent tools the AI can call against that source
//   - Optional dashboard-tile fetchers
//
// Adding Meta Ads in v7.5 is just dropping a new file under lib/sources/meta_ads/.

export type SourceType = "ga4" | "google_ads" | "meta_ads" | "moengage";

export type ConnectedSource = {
  type: SourceType;
  source_id: string;       // GA4 property id / Ads customer id / Meta ad-account id
  display_name: string;
  account_email: string;   // OAuth account that owns this resource
};

export type AvailableSource = {
  source_id: string;
  display_name: string;
  account_email: string;
  metadata?: Record<string, string | number | boolean | null>;
};

export type TokenResult = {
  provider: "google" | "meta";
  account_identifier: string;
  access_token: string;
  refresh_token?: string;
  scopes: string[];
  expires_at?: number;
};

// A tiny shape for agent tools — actual Anthropic-SDK Tool objects are produced
// per source in their `getAgentTools(workspaceId, accessToken)` method.
export type SourceAgentTool = {
  name: string;
  description: string;
  // Opaque: the real schema lives in lib/tools.ts. Each source registers its
  // tool definitions there; this type just declares "I add N tools".
};

export interface DataSource {
  id: SourceType;
  displayName: string;
  icon: string; // Lucide icon name
  status: "live" | "stub" | "beta";

  // OAuth — minimal contract. GA4 + Google Ads share the same provider, so
  // the `provider` field distinguishes whether this source uses Google or Meta
  // OAuth.
  oauthProvider: "google" | "meta";
  requiredScopes: string[];

  // Discovery
  listAvailableSources(args: { userId: number }): Promise<AvailableSource[]>;

  // Tool factory — each source produces its own agent tools.
  // Returns the list of tool names it owns (the actual definitions are
  // composed in lib/tools.ts).
  agentToolNames: string[];
}

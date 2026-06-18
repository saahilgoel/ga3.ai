// Ported from Velir's dbt-ga4 default_channel_grouping macro:
// https://github.com/Velir/dbt-ga4/blob/main/macros/default_channel_grouping.sql
//
// Classifies a (source, medium, campaign) tuple into one of GA4's Default
// Channel Group labels. Uses Google's source-category taxonomy where known.
//
// We keep the classifier deterministic and JS-only so the same grouping runs
// in briefs/scans without any GA4 dimension dependency.

export type ChannelGroup =
  | "Direct"
  | "Cross-network"
  | "Paid Shopping"
  | "Paid Search"
  | "Paid Social"
  | "Paid Video"
  | "Display"
  | "Paid Other"
  | "Organic Shopping"
  | "Organic Social"
  | "Organic Video"
  | "Organic Search"
  | "Referral"
  | "Email"
  | "Affiliates"
  | "Audio"
  | "SMS"
  | "Mobile Push Notifications"
  | "Unassigned";

// Source-category taxonomy. Subset of Google's published categories — extend
// as we encounter more. Keep the mapping case-insensitive.
const SOURCE_CATEGORY: Record<string, "SEARCH" | "SOCIAL" | "SHOPPING" | "VIDEO"> = {
  // Search
  google: "SEARCH",
  bing: "SEARCH",
  yahoo: "SEARCH",
  duckduckgo: "SEARCH",
  yandex: "SEARCH",
  baidu: "SEARCH",
  ecosia: "SEARCH",
  brave: "SEARCH",
  // Social
  facebook: "SOCIAL",
  "facebook.com": "SOCIAL",
  "m.facebook.com": "SOCIAL",
  instagram: "SOCIAL",
  "instagram.com": "SOCIAL",
  "l.instagram.com": "SOCIAL",
  twitter: "SOCIAL",
  "twitter.com": "SOCIAL",
  "t.co": "SOCIAL",
  x: "SOCIAL",
  "x.com": "SOCIAL",
  linkedin: "SOCIAL",
  "linkedin.com": "SOCIAL",
  "lnkd.in": "SOCIAL",
  reddit: "SOCIAL",
  "reddit.com": "SOCIAL",
  pinterest: "SOCIAL",
  "pinterest.com": "SOCIAL",
  tiktok: "SOCIAL",
  "tiktok.com": "SOCIAL",
  snapchat: "SOCIAL",
  whatsapp: "SOCIAL",
  threads: "SOCIAL",
  "threads.net": "SOCIAL",
  quora: "SOCIAL",
  // Shopping
  amazon: "SHOPPING",
  "amazon.com": "SHOPPING",
  "amazon.in": "SHOPPING",
  flipkart: "SHOPPING",
  "flipkart.com": "SHOPPING",
  myntra: "SHOPPING",
  meesho: "SHOPPING",
  shopify: "SHOPPING",
  // Video
  youtube: "VIDEO",
  "youtube.com": "VIDEO",
  "m.youtube.com": "VIDEO",
  vimeo: "VIDEO",
  twitch: "VIDEO",
};

function sourceCategory(source: string | null | undefined):
  | "SEARCH"
  | "SOCIAL"
  | "SHOPPING"
  | "VIDEO"
  | null {
  if (!source) return null;
  const s = source.toLowerCase().trim();
  return SOURCE_CATEGORY[s] ?? null;
}

const PAID_MEDIUM = /^(.*cp.*|ppc|retargeting|paid.*)$/i;
const SHOP_CAMPAIGN = /^(.*(([^a-df-z]|^)shop|shopping).*)$/i;
const VIDEO_MEDIUM = /^(.*video.*)$/i;
const EMAIL = /email|e-mail|e_mail|e mail/i;
const PUSH = /push$|mobile|notification/i;

export function classifyChannel(args: {
  source?: string | null;
  medium?: string | null;
  campaign?: string | null;
}): ChannelGroup {
  const source = (args.source || "").toLowerCase().trim() || null;
  const medium = (args.medium || "").toLowerCase().trim() || null;
  const campaign = (args.campaign || "").toLowerCase().trim() || null;
  const sc = sourceCategory(source);

  // Direct
  if (
    (!source && !medium) ||
    (source === "(direct)" && (medium === "(none)" || medium === "(not set)" || !medium))
  ) {
    return "Direct";
  }

  // Cross-network (Performance Max / Smart Shopping)
  if (campaign && /cross-network/.test(campaign)) return "Cross-network";

  // Paid Shopping
  if (
    (sc === "SHOPPING" || (campaign && SHOP_CAMPAIGN.test(campaign))) &&
    medium &&
    PAID_MEDIUM.test(medium)
  ) {
    return "Paid Shopping";
  }
  // Paid Search
  if (sc === "SEARCH" && medium && PAID_MEDIUM.test(medium)) return "Paid Search";
  // Paid Social
  if (sc === "SOCIAL" && medium && PAID_MEDIUM.test(medium)) return "Paid Social";
  // Paid Video
  if (sc === "VIDEO" && medium && PAID_MEDIUM.test(medium)) return "Paid Video";

  // Display
  if (
    medium &&
    ["display", "banner", "expandable", "interstitial", "cpm"].includes(medium)
  ) {
    return "Display";
  }
  // Paid Other (catch-all for paid prefixes not above)
  if (medium && PAID_MEDIUM.test(medium)) return "Paid Other";

  // Organic Shopping
  if (sc === "SHOPPING" || (campaign && SHOP_CAMPAIGN.test(campaign))) {
    return "Organic Shopping";
  }
  // Organic Social
  if (
    sc === "SOCIAL" ||
    (medium &&
      ["social", "social-network", "social-media", "sm", "social network", "social media"].includes(
        medium
      ))
  ) {
    return "Organic Social";
  }
  // Organic Video
  if (sc === "VIDEO" || (medium && VIDEO_MEDIUM.test(medium))) return "Organic Video";
  // Organic Search
  if (sc === "SEARCH" || medium === "organic") return "Organic Search";

  // Referral
  if (medium && ["referral", "app", "link"].includes(medium)) return "Referral";

  // Email
  if ((source && EMAIL.test(source)) || (medium && EMAIL.test(medium))) return "Email";

  // Affiliates
  if (medium === "affiliate") return "Affiliates";

  // Audio
  if (medium === "audio") return "Audio";

  // SMS
  if (source === "sms" || medium === "sms") return "SMS";

  // Mobile Push
  if (
    (medium && PUSH.test(medium)) ||
    source === "firebase"
  ) {
    return "Mobile Push Notifications";
  }

  return "Unassigned";
}

export function isPaidChannel(group: ChannelGroup): boolean {
  return (
    group === "Paid Search" ||
    group === "Paid Social" ||
    group === "Paid Shopping" ||
    group === "Paid Video" ||
    group === "Paid Other" ||
    group === "Display" ||
    group === "Cross-network"
  );
}

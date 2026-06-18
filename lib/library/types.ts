// Schema for the brief library (industry-specific templates).
// Mirrors data/library/seed_briefs.json.

export type BriefMetric = {
  name: string;
  type: "percentage" | "count" | "currency" | "score" | "duration" | "rate" | "ratio" | string;
  description: string;
  is_primary: boolean;
};

export type BriefDimension = {
  name: string;
  type: string;
  description: string;
};

export type BriefDataSource = {
  name: string;
  type: string;
  description?: string;
};

export type LibraryBrief = {
  id: string;
  name: string;
  slug: string;
  version: string;
  status: "published" | "draft" | "archived";
  industry: {
    primary: string;
    secondary?: string[];
    is_universal: boolean;
  };
  use_case_tags: string[];
  one_line_summary: string;
  detailed_description: string;
  metrics: BriefMetric[];
  dimensions: BriefDimension[];
  data_sources: BriefDataSource[];
  funnel_stage: "acquisition" | "activation" | "retention" | "revenue" | "operations" | string;
  secondary_funnel_stages?: string[];
  roles: string[];
  schedule: string;
  complexity: "beginner" | "intermediate" | "advanced" | string;
  agent_persona: string;
  estimated_read_time_minutes: number;
  collections: string[];
  is_popular?: boolean;
  is_new?: boolean;
  customization_required?: boolean;
  /** v7.5: 'india' | 'us' | 'global' (or another locale slug). Defaults to 'global'. */
  geo?: string;
  /** Optional source-of-truth: where the brief insight came from (reddit / x / serp). */
  pain_points?: Array<{ source: string; quote: string }>;
  created_at: string;
  updated_at: string;
};

export const GEO_LABELS: Record<string, string> = {
  global: "Global",
  india: "India",
  us: "United States",
  eu: "Europe",
  uk: "United Kingdom",
  apac: "APAC",
};

// Maps an agent_persona from the seed data to our actual agent IDs.
// "velir" appears in the seed (named after the dbt package) — route it to maya
// for channel/data engineering style briefs.
export function normalizeAgentPersona(p: string | null | undefined): string {
  if (!p) return "any";
  const v = p.toLowerCase().trim();
  if (v === "velir") return "maya";
  if (["maya", "arjun", "priya", "kabir", "raavi", "vera"].includes(v)) return v;
  return "any";
}

// Human labels for industries (used in filter rail).
export const INDUSTRY_LABELS: Record<string, string> = {
  d2c_ecommerce: "D2C E-commerce",
  b2b_saas: "B2B SaaS",
  online_marketplace: "Marketplace",
  fintech: "Fintech",
  financial_services: "Financial Services",
  healthtech: "Healthtech",
  edtech: "EdTech",
  media_publishing: "Media & Publishing",
  travel_hospitality: "Travel & Hospitality",
  food_restaurant: "Food & Restaurant",
  real_estate_proptech: "Real Estate / PropTech",
  automotive: "Automotive",
  gaming: "Gaming",
  beauty_cosmetics: "Beauty & Cosmetics",
  nonprofit: "Nonprofit",
  b2b_services: "B2B Services",
  manufacturing: "Manufacturing",
  energy_utilities: "Energy & Utilities",
  agriculture_agtech: "Agriculture / AgTech",
  legal_compliance: "Legal & Compliance",
  events_ticketing: "Events & Ticketing",
  hr_tech: "HR Tech",
  government: "Government",
  universal: "Universal",
};

export function industryLabel(id: string): string {
  return INDUSTRY_LABELS[id] ?? id.replace(/_/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());
}

export const FUNNEL_LABELS: Record<string, string> = {
  acquisition: "Acquisition",
  activation: "Activation",
  retention: "Retention",
  revenue: "Revenue",
  operations: "Operations",
};

export const COMPLEXITY_LABELS: Record<string, string> = {
  beginner: "Beginner",
  intermediate: "Intermediate",
  advanced: "Advanced",
};

export const ROLE_LABELS: Record<string, string> = {
  ceo: "CEO",
  cfo: "CFO",
  cmo: "CMO",
  cro: "CRO",
  founder: "Founder",
  vp_growth: "VP Growth",
  vp_marketing: "VP Marketing",
  vp_product: "VP Product",
  growth_manager: "Growth Manager",
  product_manager: "Product Manager",
  ecommerce_manager: "Ecom Manager",
  performance_marketer: "Perf Marketer",
  operations_manager: "Ops Manager",
};

export function roleLabel(id: string): string {
  return ROLE_LABELS[id] ?? id.replace(/_/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());
}

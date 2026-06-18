import { getDb } from "@/lib/db";

export type UsageRollup = {
  cost_usd: number;
  input_tokens: number;
  output_tokens: number;
  credits: number;
  events: number;
};

export type ProviderRow = UsageRollup & { provider: string };
export type SectionRow = UsageRollup & { section: string };
export type AccountRow = UsageRollup & {
  user_id: number | null;
  email: string | null;
  anthropic_cost: number;
  scrapingdog_cost: number;
  voyage_cost: number;
};

export type UsageSummary = {
  total: UsageRollup;
  byProvider: ProviderRow[];
  bySection: SectionRow[];
  byAccount: AccountRow[];
};

const SUMS = `
  COALESCE(SUM(cost_usd), 0)      AS cost_usd,
  COALESCE(SUM(input_tokens), 0)  AS input_tokens,
  COALESCE(SUM(output_tokens), 0) AS output_tokens,
  COALESCE(SUM(credits), 0)       AS credits,
  COUNT(*)                        AS events`;

/** Usage + cost rollups for the admin layer. `sinceTs` = unix seconds (0 = all). */
export function usageSummary(sinceTs = 0): UsageSummary {
  const db = getDb();

  const total = db
    .prepare(`SELECT ${SUMS} FROM usage_events WHERE created_at >= ?`)
    .get(sinceTs) as UsageRollup;

  const byProvider = db
    .prepare(
      `SELECT provider, ${SUMS} FROM usage_events WHERE created_at >= ?
       GROUP BY provider ORDER BY cost_usd DESC`
    )
    .all(sinceTs) as ProviderRow[];

  const bySection = db
    .prepare(
      `SELECT section, ${SUMS} FROM usage_events WHERE created_at >= ?
       GROUP BY section ORDER BY cost_usd DESC`
    )
    .all(sinceTs) as SectionRow[];

  const byAccount = db
    .prepare(
      `SELECT
         e.user_id,
         u.email,
         ${SUMS},
         COALESCE(SUM(CASE WHEN e.provider = 'anthropic'   THEN e.cost_usd END), 0) AS anthropic_cost,
         COALESCE(SUM(CASE WHEN e.provider = 'scrapingdog' THEN e.cost_usd END), 0) AS scrapingdog_cost,
         COALESCE(SUM(CASE WHEN e.provider = 'voyage'      THEN e.cost_usd END), 0) AS voyage_cost
       FROM usage_events e
       LEFT JOIN users u ON u.id = e.user_id
       WHERE e.created_at >= ?
       GROUP BY e.user_id
       ORDER BY cost_usd DESC`
    )
    .all(sinceTs) as AccountRow[];

  return { total, byProvider, bySection, byAccount };
}

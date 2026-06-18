// Library reads — filter the catalog by industry / role / funnel stage / etc.

import { getDb } from "@/lib/db";
import type { LibraryBrief } from "./types";

export type BriefListItem = {
  id: string;
  slug: string;
  name: string;
  industry_primary: string;
  funnel_stage: string | null;
  agent_persona: string | null;
  complexity: string | null;
  one_line_summary: string;
  estimated_read_time_minutes: number;
  is_popular: boolean;
  is_new: boolean;
  customization_required: boolean;
  geo: string;
};

export type BriefFilter = {
  q?: string;
  industry?: string[];
  funnel_stage?: string[];
  role?: string[];
  complexity?: string[];
  agent_persona?: string[];
  collection?: string[];
  geo?: string[];
  popular?: boolean;
  is_new?: boolean;
  universal?: boolean;
  limit?: number;
  offset?: number;
};

export function listBriefTemplates(filter: BriefFilter): {
  rows: BriefListItem[];
  total: number;
  facets: {
    industries: Array<{ value: string; count: number }>;
    funnel_stages: Array<{ value: string; count: number }>;
    complexities: Array<{ value: string; count: number }>;
    roles: Array<{ value: string; count: number }>;
    agent_personas: Array<{ value: string; count: number }>;
    collections: Array<{ value: string; count: number }>;
    geos: Array<{ value: string; count: number }>;
  };
} {
  const db = getDb();
  const where: string[] = ["status = 'published'"];
  const params: Array<string | number> = [];

  if (filter.q) {
    where.push(
      "(name LIKE ? OR one_line_summary LIKE ? OR detailed_description LIKE ?)"
    );
    const q = `%${filter.q.toLowerCase()}%`;
    params.push(q, q, q);
  }
  if (filter.industry?.length) {
    where.push(`industry_primary IN (${filter.industry.map(() => "?").join(",")})`);
    params.push(...filter.industry);
  }
  if (filter.funnel_stage?.length) {
    where.push(`funnel_stage IN (${filter.funnel_stage.map(() => "?").join(",")})`);
    params.push(...filter.funnel_stage);
  }
  if (filter.complexity?.length) {
    where.push(`complexity IN (${filter.complexity.map(() => "?").join(",")})`);
    params.push(...filter.complexity);
  }
  if (filter.agent_persona?.length) {
    where.push(`agent_persona IN (${filter.agent_persona.map(() => "?").join(",")})`);
    params.push(...filter.agent_persona);
  }
  if (filter.geo?.length) {
    where.push(`geo IN (${filter.geo.map(() => "?").join(",")})`);
    params.push(...filter.geo);
  }
  if (filter.popular) where.push("is_popular = 1");
  if (filter.is_new) where.push("is_new = 1");
  if (filter.universal) where.push("is_universal = 1");
  // role / collection are many-to-many — use IN subquery
  if (filter.role?.length) {
    where.push(
      `id IN (SELECT template_id FROM brief_template_facets WHERE facet = 'role' AND value IN (${filter.role
        .map(() => "?")
        .join(",")}))`
    );
    params.push(...filter.role);
  }
  if (filter.collection?.length) {
    where.push(
      `id IN (SELECT template_id FROM brief_template_facets WHERE facet = 'collection' AND value IN (${filter.collection
        .map(() => "?")
        .join(",")}))`
    );
    params.push(...filter.collection);
  }

  const whereClause = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";

  const total = (db
    .prepare(`SELECT COUNT(*) as n FROM brief_templates ${whereClause}`)
    .get(...params) as { n: number }).n;

  const limit = filter.limit ?? 60;
  const offset = filter.offset ?? 0;
  const rows = db
    .prepare(
      `SELECT id, slug, name, industry_primary, funnel_stage, agent_persona, complexity,
              one_line_summary, estimated_read_time_minutes, is_popular, is_new,
              customization_required, geo
       FROM brief_templates
       ${whereClause}
       ORDER BY is_popular DESC, is_new DESC, name ASC
       LIMIT ? OFFSET ?`
    )
    .all(...params, limit, offset) as Array<
      Omit<BriefListItem, "is_popular" | "is_new" | "customization_required"> & {
        is_popular: number;
        is_new: number;
        customization_required: number;
      }
    >;

  // Facet counts — run separate aggregates over the same WHERE (minus that facet)
  // For simplicity, all facets are computed against the unfiltered universe.
  // (Good enough for a starter library; revisit when we have 500+.)
  const facetQuery = `WHERE status = 'published'`;
  const ind = db
    .prepare(
      `SELECT industry_primary as value, COUNT(*) as count FROM brief_templates ${facetQuery} GROUP BY industry_primary ORDER BY count DESC`
    )
    .all() as Array<{ value: string; count: number }>;
  const fun = db
    .prepare(
      `SELECT funnel_stage as value, COUNT(*) as count FROM brief_templates ${facetQuery} AND funnel_stage IS NOT NULL GROUP BY funnel_stage ORDER BY count DESC`
    )
    .all() as Array<{ value: string; count: number }>;
  const comp = db
    .prepare(
      `SELECT complexity as value, COUNT(*) as count FROM brief_templates ${facetQuery} AND complexity IS NOT NULL GROUP BY complexity ORDER BY count DESC`
    )
    .all() as Array<{ value: string; count: number }>;
  const ag = db
    .prepare(
      `SELECT agent_persona as value, COUNT(*) as count FROM brief_templates ${facetQuery} AND agent_persona IS NOT NULL GROUP BY agent_persona ORDER BY count DESC`
    )
    .all() as Array<{ value: string; count: number }>;
  const geos = db
    .prepare(
      `SELECT COALESCE(geo,'global') as value, COUNT(*) as count FROM brief_templates ${facetQuery} GROUP BY COALESCE(geo,'global') ORDER BY count DESC`
    )
    .all() as Array<{ value: string; count: number }>;
  const roles = db
    .prepare(
      `SELECT f.value, COUNT(DISTINCT f.template_id) as count
       FROM brief_template_facets f
       JOIN brief_templates t ON t.id = f.template_id AND t.status = 'published'
       WHERE f.facet = 'role'
       GROUP BY f.value
       ORDER BY count DESC`
    )
    .all() as Array<{ value: string; count: number }>;
  const collections = db
    .prepare(
      `SELECT f.value, COUNT(DISTINCT f.template_id) as count
       FROM brief_template_facets f
       JOIN brief_templates t ON t.id = f.template_id AND t.status = 'published'
       WHERE f.facet = 'collection'
       GROUP BY f.value
       ORDER BY count DESC
       LIMIT 25`
    )
    .all() as Array<{ value: string; count: number }>;

  return {
    rows: rows.map((r) => ({
      ...r,
      is_popular: !!r.is_popular,
      is_new: !!r.is_new,
      customization_required: !!r.customization_required,
    })),
    total,
    facets: {
      industries: ind,
      funnel_stages: fun,
      complexities: comp,
      roles,
      agent_personas: ag,
      collections,
      geos,
    },
  };
}

export function getBriefTemplate(slug: string): LibraryBrief | null {
  const db = getDb();
  const row = db
    .prepare("SELECT payload_json FROM brief_templates WHERE slug = ?")
    .get(slug) as { payload_json: string } | undefined;
  if (!row) return null;
  try {
    return JSON.parse(row.payload_json) as LibraryBrief;
  } catch {
    return null;
  }
}

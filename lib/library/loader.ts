// One-shot loader that ingests the seed briefs JSON into brief_templates.
// Idempotent — runs on first DB access, no-ops once rows exist (unless the
// caller passes force=true).

import fs from "node:fs";
import path from "node:path";
import { getDb } from "@/lib/db";
import type { LibraryBrief } from "./types";

const SEED_PATH = path.join(process.cwd(), "data", "library", "seed_briefs.json");

export function ensureLibrarySeeded(force = false): {
  inserted: number;
  total: number;
  skipped: boolean;
} {
  const db = getDb();
  const existing = db
    .prepare("SELECT COUNT(*) as n FROM brief_templates")
    .get() as { n: number };
  // Reseed when extras/ has content — otherwise extras additions won't show up.
  const extrasDir = path.join(process.cwd(), "data", "library", "extras");
  const hasExtras =
    fs.existsSync(extrasDir) &&
    fs.readdirSync(extrasDir).some((f) => f.endsWith(".json"));
  if (!force && existing.n > 0 && !hasExtras) {
    return { inserted: 0, total: existing.n, skipped: true };
  }
  if (!fs.existsSync(SEED_PATH)) {
    return { inserted: 0, total: existing.n, skipped: true };
  }
  // Combine the original seed file with any extras under data/library/extras/*.json
  const briefs: LibraryBrief[] = [];
  const seedRaw = JSON.parse(fs.readFileSync(SEED_PATH, "utf8")) as {
    briefs: LibraryBrief[];
  };
  briefs.push(...seedRaw.briefs);
  if (fs.existsSync(extrasDir)) {
    for (const file of fs.readdirSync(extrasDir)) {
      if (!file.endsWith(".json")) continue;
      try {
        const r = JSON.parse(
          fs.readFileSync(path.join(extrasDir, file), "utf8")
        ) as { briefs?: LibraryBrief[] };
        if (r.briefs?.length) briefs.push(...r.briefs);
      } catch (err) {
        console.warn(`[library] skipping ${file}:`, (err as Error).message);
      }
    }
  }
  // Dedupe by id (extras override seed on conflict — last write wins)
  const dedup = new Map<string, LibraryBrief>();
  for (const b of briefs) dedup.set(b.id, b);
  const allBriefs = [...dedup.values()];

  const upsertBrief = db.prepare(`
    INSERT INTO brief_templates (
      id, slug, name, version, status,
      industry_primary, is_universal, funnel_stage, agent_persona, complexity,
      one_line_summary, detailed_description, estimated_read_time_minutes,
      is_popular, is_new, customization_required, geo, payload_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      slug = excluded.slug,
      name = excluded.name,
      version = excluded.version,
      status = excluded.status,
      industry_primary = excluded.industry_primary,
      is_universal = excluded.is_universal,
      funnel_stage = excluded.funnel_stage,
      agent_persona = excluded.agent_persona,
      complexity = excluded.complexity,
      one_line_summary = excluded.one_line_summary,
      detailed_description = excluded.detailed_description,
      estimated_read_time_minutes = excluded.estimated_read_time_minutes,
      is_popular = excluded.is_popular,
      is_new = excluded.is_new,
      customization_required = excluded.customization_required,
      geo = excluded.geo,
      payload_json = excluded.payload_json,
      updated_at = unixepoch()
  `);
  const clearFacets = db.prepare(
    "DELETE FROM brief_template_facets WHERE template_id = ?"
  );
  const insertFacet = db.prepare(
    "INSERT OR IGNORE INTO brief_template_facets (template_id, facet, value) VALUES (?, ?, ?)"
  );

  let inserted = 0;
  const trx = db.transaction(() => {
    for (const b of allBriefs) {
      upsertBrief.run(
        b.id,
        b.slug,
        b.name,
        b.version,
        b.status,
        b.industry.primary,
        b.industry.is_universal ? 1 : 0,
        b.funnel_stage ?? null,
        b.agent_persona ?? null,
        b.complexity ?? null,
        b.one_line_summary,
        b.detailed_description,
        b.estimated_read_time_minutes,
        b.is_popular ? 1 : 0,
        b.is_new ? 1 : 0,
        b.customization_required ? 1 : 0,
        b.geo ?? "global",
        JSON.stringify(b)
      );
      clearFacets.run(b.id);
      for (const r of b.roles ?? []) insertFacet.run(b.id, "role", r);
      for (const c of b.collections ?? []) insertFacet.run(b.id, "collection", c);
      for (const t of b.use_case_tags ?? []) insertFacet.run(b.id, "tag", t);
      for (const s of b.industry.secondary ?? [])
        insertFacet.run(b.id, "secondary_industry", s);
      if (b.geo) insertFacet.run(b.id, "geo", b.geo);
      inserted += 1;
    }
  });
  trx();
  return { inserted, total: inserted, skipped: false };
}

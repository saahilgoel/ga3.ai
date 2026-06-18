import Database from "better-sqlite3";
import path from "node:path";
import * as sqliteVec from "sqlite-vec";

let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (_db) return _db;
  const dbPath = process.env.DB_PATH || path.join(process.cwd(), "ga-chat.db");
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");

  // Load sqlite-vec extension. Two attempts:
  //  1) the package's bundled load() (uses import.meta — fails under Turbopack)
  //  2) manual loadExtension() against the platform-arch binary path.
  let vecLoaded = false;
  try {
    sqliteVec.load(db);
    vecLoaded = true;
  } catch (err) {
    console.warn("[db] sqlite-vec.load() failed:", (err as Error).message);
  }
  if (!vecLoaded) {
    try {
      const ext =
        process.platform === "win32"
          ? "vec0.dll"
          : process.platform === "darwin"
          ? "vec0.dylib"
          : "vec0.so";
      const pkg = `sqlite-vec-${process.platform}-${process.arch}`;
      const extPath = path.join(process.cwd(), "node_modules", pkg, ext);
      db.loadExtension(extPath);
      vecLoaded = true;
      console.log(`[db] sqlite-vec loaded via fallback: ${pkg}`);
    } catch (err2) {
      console.warn("[db] sqlite-vec fallback failed:", (err2 as Error).message);
    }
  }
  if (!vecLoaded) {
    console.warn("[db] sqlite-vec unavailable — vector search disabled.");
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      google_sub TEXT UNIQUE NOT NULL,
      email TEXT NOT NULL,
      refresh_token TEXT NOT NULL,
      access_token TEXT,
      token_expires_at INTEGER,
      created_at INTEGER DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS properties (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id),
      ga4_property_id TEXT NOT NULL,
      display_name TEXT NOT NULL,
      website_url TEXT,
      site_profile_json TEXT,
      created_at INTEGER DEFAULT (unixepoch()),
      UNIQUE(user_id, ga4_property_id)
    );

    CREATE TABLE IF NOT EXISTS pinned_insights (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      agent TEXT NOT NULL,
      data_json TEXT,
      created_at INTEGER DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS threads (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      agent_id TEXT NOT NULL,
      property_signature TEXT NOT NULL,
      created_at INTEGER DEFAULT (unixepoch()),
      last_message_at INTEGER,
      UNIQUE(user_id, agent_id, property_signature)
    );

    CREATE TABLE IF NOT EXISTS thread_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      thread_id INTEGER NOT NULL REFERENCES threads(id),
      message_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at INTEGER DEFAULT (unixepoch()),
      UNIQUE(thread_id, message_id)
    );

    CREATE TABLE IF NOT EXISTS findings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      agent_id TEXT NOT NULL,
      property_signature TEXT NOT NULL,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      severity TEXT NOT NULL,
      data_json TEXT,
      visualization_json TEXT,
      question TEXT,
      status TEXT NOT NULL DEFAULT 'new',
      scan_id TEXT,
      created_at INTEGER DEFAULT (unixepoch())
    );

    CREATE INDEX IF NOT EXISTS idx_findings_feed ON findings(user_id, property_signature, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_thread_messages_lookup ON thread_messages(thread_id, id);

    CREATE TABLE IF NOT EXISTS workspaces (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      kind TEXT NOT NULL,
      ga4_property_ids TEXT NOT NULL,
      created_at INTEGER DEFAULT (unixepoch()),
      last_used_at INTEGER DEFAULT (unixepoch()),
      last_scan_at INTEGER,
      archived INTEGER DEFAULT 0
    );

    CREATE INDEX IF NOT EXISTS idx_workspaces_user ON workspaces(user_id, archived, last_used_at DESC);

    CREATE TABLE IF NOT EXISTS briefs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      workspace_id INTEGER NOT NULL REFERENCES workspaces(id),
      template_id TEXT NOT NULL,
      title TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'running',
      date_range_start TEXT,
      date_range_end TEXT,
      comparison_range_start TEXT,
      comparison_range_end TEXT,
      params_json TEXT,
      output_json TEXT,
      error_text TEXT,
      pinned INTEGER DEFAULT 0,
      created_at INTEGER DEFAULT (unixepoch()),
      completed_at INTEGER
    );

    CREATE INDEX IF NOT EXISTS idx_briefs_workspace ON briefs(workspace_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_briefs_pinned ON briefs(workspace_id, pinned, created_at DESC);

    -- v5.5 conversations model. Distinct from threads (which were one-per-agent).
    CREATE TABLE IF NOT EXISTS conversations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      workspace_id INTEGER REFERENCES workspaces(id),
      primary_agent_id TEXT,  -- 'maya' | 'arjun' | 'priya' | 'kabir' | 'raavi' | 'any'
      title TEXT,
      pinned INTEGER DEFAULT 0,
      archived INTEGER DEFAULT 0,
      created_at INTEGER DEFAULT (unixepoch()),
      last_message_at INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_conversations_recent
      ON conversations(user_id, workspace_id, archived, last_message_at DESC);

    CREATE TABLE IF NOT EXISTS conversation_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      conversation_id INTEGER NOT NULL REFERENCES conversations(id),
      message_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      author_agent_id TEXT,
      created_at INTEGER DEFAULT (unixepoch()),
      UNIQUE(conversation_id, message_id)
    );
    CREATE INDEX IF NOT EXISTS idx_conversation_messages_lookup
      ON conversation_messages(conversation_id, id);

    -- v6: Customer Intelligence (RAG) tables
    CREATE TABLE IF NOT EXISTS context_status (
      workspace_id INTEGER PRIMARY KEY REFERENCES workspaces(id),
      consent_given_at INTEGER,
      status TEXT NOT NULL DEFAULT 'pending',
      brand_name TEXT,
      brand_aliases TEXT,
      current_step TEXT,
      progress_pct INTEGER DEFAULT 0,
      last_full_refresh_at INTEGER,
      last_news_refresh_at INTEGER,
      last_reviews_refresh_at INTEGER,
      total_credits_used INTEGER DEFAULT 0,
      document_count INTEGER DEFAULT 0,
      chunk_count INTEGER DEFAULT 0,
      failed_sources TEXT,
      error_text TEXT,
      updated_at INTEGER DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS context_documents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      workspace_id INTEGER NOT NULL REFERENCES workspaces(id),
      source_type TEXT NOT NULL,
      source_url TEXT,
      title TEXT,
      content TEXT NOT NULL,
      metadata_json TEXT,
      fetched_at INTEGER DEFAULT (unixepoch()),
      user_uploaded INTEGER DEFAULT 0,
      filename TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_context_docs_workspace
      ON context_documents(workspace_id, source_type);

    CREATE TABLE IF NOT EXISTS context_chunks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      document_id INTEGER NOT NULL REFERENCES context_documents(id) ON DELETE CASCADE,
      workspace_id INTEGER NOT NULL,
      chunk_index INTEGER NOT NULL,
      content TEXT NOT NULL,
      token_count INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_chunks_workspace ON context_chunks(workspace_id);
    CREATE INDEX IF NOT EXISTS idx_chunks_document ON context_chunks(document_id);
  `);

  // Drop legacy form from earlier v6 iteration if present.
  try {
    const row = db
      .prepare(
        "SELECT sql FROM sqlite_master WHERE type='table' AND name='context_embeddings'"
      )
      .get() as { sql?: string } | undefined;
    if (row?.sql && row.sql.includes("chunk_id INTEGER PRIMARY KEY")) {
      db.exec("DROP TABLE context_embeddings");
    }
  } catch {
    // ignore
  }
  // Vector embedding table — partition-key form so workspace filtering happens
  // inside the kNN scan. INSERTs must pass workspace_id and rowid as BigInt.
  // voyage-3-lite produces 512-dim vectors. Drop any earlier 1024-dim form too.
  try {
    const row = db
      .prepare(
        "SELECT sql FROM sqlite_master WHERE type='table' AND name='context_embeddings'"
      )
      .get() as { sql?: string } | undefined;
    if (row?.sql && row.sql.includes("[1024]")) {
      db.exec("DROP TABLE context_embeddings");
    }
  } catch {
    // ignore
  }
  try {
    db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS context_embeddings USING vec0(
        workspace_id integer partition key,
        embedding float[512]
      );
    `);
    const v = db.prepare("SELECT vec_version() AS v").get() as { v?: string };
    if (v?.v) console.log(`[db] sqlite-vec ${v.v}, context_embeddings ready (512-dim)`);
  } catch (err) {
    console.warn(
      "[db] vec0 virtual table not created — vector search disabled:",
      (err as Error).message
    );
  }

  // FTS5 virtual tables for search (idempotent)
  try {
    db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS conversations_fts USING fts5(
        title, body, content='conversation_messages', content_rowid='id'
      );
      CREATE VIRTUAL TABLE IF NOT EXISTS findings_fts USING fts5(
        title, body, content='findings', content_rowid='id'
      );
    `);
  } catch {
    // FTS5 not available — soft-fail; search will fall back to LIKE
  }

  // One-time migration from threads → conversations
  migrateThreadsToConversations(db);

  // Idempotent ALTER for users last_scan_at column
  try {
    db.exec("ALTER TABLE users ADD COLUMN last_scan_at INTEGER");
  } catch {
    // already exists
  }

  // Idempotent ALTER for workspace_id columns + v5.5 conversation extensions
  for (const stmt of [
    "ALTER TABLE threads ADD COLUMN workspace_id INTEGER",
    "ALTER TABLE findings ADD COLUMN workspace_id INTEGER",
    "ALTER TABLE pinned_insights ADD COLUMN workspace_id INTEGER",
    "ALTER TABLE findings ADD COLUMN source_property_ids TEXT",
    "ALTER TABLE conversations ADD COLUMN seed_finding_id INTEGER",
    // v8: competitor intelligence — light context build for 2-3 detected
    // competitors per workspace, queryable by agents.
    "ALTER TABLE context_documents ADD COLUMN competitor_id INTEGER",
    // v9: industry signal feed — auto-detected category + daily news/Reddit
    // pulls per workspace.
    "ALTER TABLE context_status ADD COLUMN industry_category TEXT",
    "ALTER TABLE context_status ADD COLUMN last_industry_refresh_at INTEGER",
    // v10: AI visibility V2 — citations per run + AI-generated recommendations.
    "ALTER TABLE ai_visibility_runs ADD COLUMN citations_json TEXT",
  ]) {
    try {
      db.exec(stmt);
    } catch {
      // already exists
    }
  }

  // v10: AI visibility recommendations — Haiku-generated "what to do next"
  // cards based on a workspace's most recent visibility run.
  db.exec(`
    CREATE TABLE IF NOT EXISTS ai_visibility_recommendations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      workspace_id INTEGER NOT NULL REFERENCES workspaces(id),
      generated_at INTEGER DEFAULT (unixepoch()),
      payload_json TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_aivr_ws
      ON ai_visibility_recommendations(workspace_id, generated_at DESC);
  `);

  // v9: AI visibility — track how often brand + competitors show up in AI
  // search surfaces (Google AI Mode, ChatGPT). One row per (workspace, prompt,
  // surface, brand) — kept normalised so we can chart over time later.
  db.exec(`
    CREATE TABLE IF NOT EXISTS ai_visibility_prompts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      workspace_id INTEGER NOT NULL REFERENCES workspaces(id),
      prompt TEXT NOT NULL,
      rationale TEXT,
      created_at INTEGER DEFAULT (unixepoch()),
      UNIQUE(workspace_id, prompt)
    );
    CREATE INDEX IF NOT EXISTS idx_aiv_prompts_ws
      ON ai_visibility_prompts(workspace_id);

    CREATE TABLE IF NOT EXISTS ai_visibility_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      workspace_id INTEGER NOT NULL,
      prompt_id INTEGER NOT NULL REFERENCES ai_visibility_prompts(id) ON DELETE CASCADE,
      surface TEXT NOT NULL,
      response_text TEXT,
      brands_json TEXT NOT NULL,
      ran_at INTEGER DEFAULT (unixepoch()),
      credits INTEGER DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_aiv_runs_lookup
      ON ai_visibility_runs(workspace_id, prompt_id, surface, ran_at DESC);
  `);

  // v8: competitors table — detected per workspace, each with its own light
  // crawl (homepage + about/pricing + brand SERP + news). Documents/chunks
  // belonging to a competitor have context_documents.competitor_id set.
  db.exec(`
    CREATE TABLE IF NOT EXISTS competitors (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      workspace_id INTEGER NOT NULL REFERENCES workspaces(id),
      brand_name TEXT NOT NULL,
      website_url TEXT,
      detection_query TEXT,
      reasoning TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      progress_pct INTEGER DEFAULT 0,
      current_step TEXT,
      credits_used INTEGER DEFAULT 0,
      document_count INTEGER DEFAULT 0,
      chunk_count INTEGER DEFAULT 0,
      error_text TEXT,
      detected_at INTEGER DEFAULT (unixepoch()),
      ingested_at INTEGER,
      UNIQUE(workspace_id, brand_name)
    );
    CREATE INDEX IF NOT EXISTS idx_competitors_workspace
      ON competitors(workspace_id);
    CREATE INDEX IF NOT EXISTS idx_context_docs_competitor
      ON context_documents(competitor_id);
  `);

  // One-shot migration: backfill workspaces from existing data
  migrateExistingDataToWorkspaces(db);

  // Idempotent ALTER for is_active column
  try {
    db.exec("ALTER TABLE properties ADD COLUMN is_active INTEGER DEFAULT 0");
  } catch {
    // already exists
  }

  // v7: GA4 doctor cache + workspace primary property
  for (const stmt of [
    "ALTER TABLE properties ADD COLUMN doctor_json TEXT",
    "ALTER TABLE properties ADD COLUMN doctor_checked_at INTEGER",
    "ALTER TABLE workspaces ADD COLUMN primary_property_id INTEGER",
    // v7 multi-source: a JSON array of { type, source_id, display_name, account_email }
    "ALTER TABLE workspaces ADD COLUMN connected_sources TEXT",
  ]) {
    try {
      db.exec(stmt);
    } catch {
      // already exists
    }
  }

  // v7.5 brief_templates — industry-specific brief catalog (the 500+ library).
  // Stores rich metadata (industry, role, funnel stage, metrics, agent persona)
  // for browse + filter. Loaded from data/library/seed_briefs.json on boot.
  db.exec(`
    CREATE TABLE IF NOT EXISTS brief_templates (
      id TEXT PRIMARY KEY,
      slug TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      version TEXT NOT NULL,
      status TEXT NOT NULL,
      industry_primary TEXT NOT NULL,
      is_universal INTEGER DEFAULT 0,
      funnel_stage TEXT,
      agent_persona TEXT,
      complexity TEXT,
      one_line_summary TEXT,
      detailed_description TEXT,
      estimated_read_time_minutes INTEGER,
      is_popular INTEGER DEFAULT 0,
      is_new INTEGER DEFAULT 0,
      customization_required INTEGER DEFAULT 0,
      payload_json TEXT NOT NULL,  -- full original record for the detail page
      created_at INTEGER DEFAULT (unixepoch()),
      updated_at INTEGER DEFAULT (unixepoch())
    );
    CREATE INDEX IF NOT EXISTS idx_brief_templates_industry
      ON brief_templates(industry_primary, status);
    CREATE INDEX IF NOT EXISTS idx_brief_templates_funnel
      ON brief_templates(funnel_stage, status);
    CREATE INDEX IF NOT EXISTS idx_brief_templates_agent
      ON brief_templates(agent_persona, status);

    -- Roles + collections + use_case_tags are many-to-many. Store as a single
    -- side table keyed by template_id + facet + value for filter queries.
    CREATE TABLE IF NOT EXISTS brief_template_facets (
      template_id TEXT NOT NULL REFERENCES brief_templates(id) ON DELETE CASCADE,
      facet TEXT NOT NULL,  -- 'role' | 'collection' | 'tag' | 'secondary_industry'
      value TEXT NOT NULL,
      PRIMARY KEY (template_id, facet, value)
    );
    CREATE INDEX IF NOT EXISTS idx_brief_template_facets_lookup
      ON brief_template_facets(facet, value);
  `);

  // Idempotent geo column for brief_templates.
  try {
    db.exec("ALTER TABLE brief_templates ADD COLUMN geo TEXT DEFAULT 'global'");
  } catch {
    // already exists
  }
  try {
    db.exec("CREATE INDEX IF NOT EXISTS idx_brief_templates_geo ON brief_templates(geo)");
  } catch {
    // ignore
  }

  // v7 app_settings — per-user key/value store for things like API tokens
  // we let the user paste in via the UI (Google Ads developer token, etc.).
  db.exec(`
    CREATE TABLE IF NOT EXISTS app_settings (
      user_id INTEGER NOT NULL,
      key TEXT NOT NULL,
      value TEXT NOT NULL,
      updated_at INTEGER DEFAULT (unixepoch()),
      PRIMARY KEY (user_id, key)
    );
  `);

  // v7 oauth_tokens — provider-agnostic refresh tokens. Decouples
  // "which Google account is connected" from "which properties are activated."
  db.exec(`
    CREATE TABLE IF NOT EXISTS oauth_tokens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      provider TEXT NOT NULL,
      account_identifier TEXT,
      access_token TEXT NOT NULL,
      refresh_token TEXT,
      scopes TEXT NOT NULL,
      token_expires_at INTEGER,
      created_at INTEGER DEFAULT (unixepoch()),
      UNIQUE(user_id, provider, account_identifier)
    );
    CREATE INDEX IF NOT EXISTS idx_oauth_tokens_lookup
      ON oauth_tokens(user_id, provider);
  `);

  // Per-account / per-section usage + cost accounting (admin layer).
  db.exec(`
    CREATE TABLE IF NOT EXISTS usage_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      workspace_id INTEGER,
      section TEXT NOT NULL,
      provider TEXT NOT NULL,
      model TEXT,
      input_tokens INTEGER DEFAULT 0,
      output_tokens INTEGER DEFAULT 0,
      credits INTEGER DEFAULT 0,
      cost_usd REAL DEFAULT 0,
      created_at INTEGER DEFAULT (unixepoch())
    );
    CREATE INDEX IF NOT EXISTS idx_usage_user_created ON usage_events(user_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_usage_section ON usage_events(section, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_usage_provider ON usage_events(provider, created_at DESC);
  `);

  // Backfill connected_sources for legacy workspaces (one-shot, idempotent).
  try {
    const stale = db
      .prepare(
        "SELECT id, ga4_property_ids FROM workspaces WHERE connected_sources IS NULL"
      )
      .all() as Array<{ id: number; ga4_property_ids: string }>;
    const lookupProp = db.prepare(
      "SELECT p.ga4_property_id, p.display_name, u.email FROM properties p JOIN users u ON u.id = p.user_id WHERE p.id = ?"
    );
    const upd = db.prepare("UPDATE workspaces SET connected_sources = ? WHERE id = ?");
    for (const row of stale) {
      try {
        const ids = JSON.parse(row.ga4_property_ids) as number[];
        if (!Array.isArray(ids)) continue;
        const sources = ids
          .map((pid) =>
            lookupProp.get(pid) as
              | { ga4_property_id: string; display_name: string; email: string }
              | undefined
          )
          .filter(Boolean)
          .map((p) => ({
            type: "ga4" as const,
            source_id: p!.ga4_property_id,
            display_name: p!.display_name,
            account_email: p!.email,
          }));
        upd.run(JSON.stringify(sources), row.id);
      } catch {
        // skip malformed
      }
    }
  } catch {
    // soft-fail
  }

  // Backfill primary_property_id from first id in ga4_property_ids (one-shot)
  try {
    const needsBackfill = db
      .prepare("SELECT id, ga4_property_ids FROM workspaces WHERE primary_property_id IS NULL")
      .all() as Array<{ id: number; ga4_property_ids: string }>;
    const upd = db.prepare("UPDATE workspaces SET primary_property_id = ? WHERE id = ?");
    for (const row of needsBackfill) {
      try {
        const ids = JSON.parse(row.ga4_property_ids) as number[];
        if (Array.isArray(ids) && ids.length > 0 && Number.isFinite(ids[0])) {
          upd.run(ids[0], row.id);
        }
      } catch {
        // skip malformed rows
      }
    }
  } catch {
    // soft-fail
  }

  _db = db;
  return db;
}

export type UserRow = {
  id: number;
  google_sub: string;
  email: string;
  refresh_token: string;
  access_token: string | null;
  token_expires_at: number | null;
  created_at: number;
};

export type PropertyRow = {
  id: number;
  user_id: number;
  ga4_property_id: string;
  display_name: string;
  website_url: string | null;
  site_profile_json: string | null;
  is_active: number;
  created_at: number;
  doctor_json: string | null;
  doctor_checked_at: number | null;
};

export type PinnedInsightRow = {
  id: number;
  user_id: number;
  title: string;
  body: string;
  agent: string;
  data_json: string | null;
  created_at: number;
};

export function upsertUser(args: {
  google_sub: string;
  email: string;
  refresh_token: string;
  access_token: string | null;
  token_expires_at: number | null;
}): UserRow {
  const db = getDb();
  const existing = db
    .prepare("SELECT * FROM users WHERE google_sub = ?")
    .get(args.google_sub) as UserRow | undefined;

  if (existing) {
    db.prepare(
      `UPDATE users SET refresh_token = ?, access_token = ?, token_expires_at = ?, email = ? WHERE id = ?`
    ).run(
      args.refresh_token || existing.refresh_token,
      args.access_token,
      args.token_expires_at,
      args.email,
      existing.id
    );
    return db.prepare("SELECT * FROM users WHERE id = ?").get(existing.id) as UserRow;
  }

  const result = db
    .prepare(
      `INSERT INTO users (google_sub, email, refresh_token, access_token, token_expires_at)
       VALUES (?, ?, ?, ?, ?)`
    )
    .run(
      args.google_sub,
      args.email,
      args.refresh_token,
      args.access_token,
      args.token_expires_at
    );
  return db.prepare("SELECT * FROM users WHERE id = ?").get(result.lastInsertRowid) as UserRow;
}

export function getUserById(id: number): UserRow | undefined {
  return getDb().prepare("SELECT * FROM users WHERE id = ?").get(id) as UserRow | undefined;
}

export function getUsersByIds(ids: number[]): UserRow[] {
  if (ids.length === 0) return [];
  const placeholders = ids.map(() => "?").join(",");
  return getDb()
    .prepare(`SELECT * FROM users WHERE id IN (${placeholders})`)
    .all(...ids) as UserRow[];
}

export function updateUserTokens(
  id: number,
  access_token: string,
  token_expires_at: number,
  refresh_token?: string
) {
  if (refresh_token) {
    getDb()
      .prepare(
        "UPDATE users SET access_token = ?, token_expires_at = ?, refresh_token = ? WHERE id = ?"
      )
      .run(access_token, token_expires_at, refresh_token, id);
  } else {
    getDb()
      .prepare("UPDATE users SET access_token = ?, token_expires_at = ? WHERE id = ?")
      .run(access_token, token_expires_at, id);
  }
}

export function upsertProperty(args: {
  user_id: number;
  ga4_property_id: string;
  display_name: string;
  website_url: string | null;
}): PropertyRow {
  const db = getDb();
  const existing = db
    .prepare("SELECT * FROM properties WHERE user_id = ? AND ga4_property_id = ?")
    .get(args.user_id, args.ga4_property_id) as PropertyRow | undefined;
  if (existing) {
    db.prepare(
      "UPDATE properties SET display_name = ?, website_url = COALESCE(?, website_url) WHERE id = ?"
    ).run(args.display_name, args.website_url, existing.id);
    return db.prepare("SELECT * FROM properties WHERE id = ?").get(existing.id) as PropertyRow;
  }
  const result = db
    .prepare(
      `INSERT INTO properties (user_id, ga4_property_id, display_name, website_url) VALUES (?, ?, ?, ?)`
    )
    .run(args.user_id, args.ga4_property_id, args.display_name, args.website_url);
  return db.prepare("SELECT * FROM properties WHERE id = ?").get(result.lastInsertRowid) as PropertyRow;
}

export function getPropertyById(id: number): PropertyRow | undefined {
  return getDb().prepare("SELECT * FROM properties WHERE id = ?").get(id) as PropertyRow | undefined;
}

export function getPropertiesByIds(ids: number[]): PropertyRow[] {
  if (ids.length === 0) return [];
  const placeholders = ids.map(() => "?").join(",");
  return getDb()
    .prepare(`SELECT * FROM properties WHERE id IN (${placeholders})`)
    .all(...ids) as PropertyRow[];
}

export function getPropertiesForUsers(userIds: number[]): PropertyRow[] {
  if (userIds.length === 0) return [];
  const placeholders = userIds.map(() => "?").join(",");
  return getDb()
    .prepare(`SELECT * FROM properties WHERE user_id IN (${placeholders}) ORDER BY display_name`)
    .all(...userIds) as PropertyRow[];
}

export function setSiteProfile(propertyId: number, profileJson: string) {
  getDb().prepare("UPDATE properties SET site_profile_json = ? WHERE id = ?").run(profileJson, propertyId);
}

export function setActiveProperties(userIds: number[], activeIds: number[]) {
  const db = getDb();
  if (userIds.length === 0) return;
  const userPlaceholders = userIds.map(() => "?").join(",");
  db.prepare(`UPDATE properties SET is_active = 0 WHERE user_id IN (${userPlaceholders})`).run(...userIds);
  if (activeIds.length === 0) return;
  const activePlaceholders = activeIds.map(() => "?").join(",");
  db.prepare(
    `UPDATE properties SET is_active = 1 WHERE id IN (${activePlaceholders}) AND user_id IN (${userPlaceholders})`
  ).run(...activeIds, ...userIds);
}

export function insertPinnedInsight(args: {
  user_id: number;
  title: string;
  body: string;
  agent: string;
  data_json: string | null;
}): PinnedInsightRow {
  const result = getDb()
    .prepare(
      `INSERT INTO pinned_insights (user_id, title, body, agent, data_json) VALUES (?, ?, ?, ?, ?)`
    )
    .run(args.user_id, args.title, args.body, args.agent, args.data_json);
  return getDb()
    .prepare("SELECT * FROM pinned_insights WHERE id = ?")
    .get(result.lastInsertRowid) as PinnedInsightRow;
}

export function listPinnedInsights(userIds: number[]): PinnedInsightRow[] {
  if (userIds.length === 0) return [];
  const placeholders = userIds.map(() => "?").join(",");
  return getDb()
    .prepare(
      `SELECT * FROM pinned_insights WHERE user_id IN (${placeholders}) ORDER BY created_at DESC`
    )
    .all(...userIds) as PinnedInsightRow[];
}

export function deletePinnedInsight(id: number, userIds: number[]): void {
  if (userIds.length === 0) return;
  const placeholders = userIds.map(() => "?").join(",");
  getDb()
    .prepare(`DELETE FROM pinned_insights WHERE id = ? AND user_id IN (${placeholders})`)
    .run(id, ...userIds);
}

export type ThreadRow = {
  id: number;
  user_id: number;
  agent_id: string;
  property_signature: string;
  workspace_id: number | null;
  created_at: number;
  last_message_at: number | null;
};

export type ThreadMessageRow = {
  id: number;
  thread_id: number;
  message_id: string;
  role: string;
  content: string;
  created_at: number;
};

export type FindingRow = {
  id: number;
  user_id: number;
  agent_id: string;
  property_signature: string;
  workspace_id: number | null;
  source_property_ids: string | null;
  title: string;
  body: string;
  severity: string;
  data_json: string | null;
  visualization_json: string | null;
  question: string | null;
  status: string;
  scan_id: string | null;
  created_at: number;
};

export function getOrCreateThread(args: {
  user_id: number;
  agent_id: string;
  property_signature: string;
}): ThreadRow {
  const db = getDb();
  const existing = db
    .prepare(
      "SELECT * FROM threads WHERE user_id = ? AND agent_id = ? AND property_signature = ?"
    )
    .get(args.user_id, args.agent_id, args.property_signature) as ThreadRow | undefined;
  if (existing) return existing;
  const result = db
    .prepare(
      "INSERT INTO threads (user_id, agent_id, property_signature) VALUES (?, ?, ?)"
    )
    .run(args.user_id, args.agent_id, args.property_signature);
  return db.prepare("SELECT * FROM threads WHERE id = ?").get(result.lastInsertRowid) as ThreadRow;
}

export function listThreadsForUser(args: {
  user_ids: number[];
  property_signature?: string;
}): ThreadRow[] {
  if (args.user_ids.length === 0) return [];
  const userPlaceholders = args.user_ids.map(() => "?").join(",");
  if (args.property_signature) {
    return getDb()
      .prepare(
        `SELECT * FROM threads WHERE user_id IN (${userPlaceholders}) AND property_signature = ? ORDER BY last_message_at DESC NULLS LAST, created_at DESC`
      )
      .all(...args.user_ids, args.property_signature) as ThreadRow[];
  }
  return getDb()
    .prepare(
      `SELECT * FROM threads WHERE user_id IN (${userPlaceholders}) ORDER BY last_message_at DESC NULLS LAST, created_at DESC`
    )
    .all(...args.user_ids) as ThreadRow[];
}

export function listThreadMessages(threadId: number): ThreadMessageRow[] {
  return getDb()
    .prepare("SELECT * FROM thread_messages WHERE thread_id = ? ORDER BY id ASC")
    .all(threadId) as ThreadMessageRow[];
}

export function upsertThreadMessage(args: {
  thread_id: number;
  message_id: string;
  role: string;
  content: string;
}): void {
  const db = getDb();
  db.prepare(
    `INSERT INTO thread_messages (thread_id, message_id, role, content) VALUES (?, ?, ?, ?)
     ON CONFLICT(thread_id, message_id) DO UPDATE SET content = excluded.content`
  ).run(args.thread_id, args.message_id, args.role, args.content);
  db.prepare("UPDATE threads SET last_message_at = unixepoch() WHERE id = ?").run(args.thread_id);
}

export function listFindings(args: {
  user_ids: number[];
  property_signature: string;
  status?: string;
  limit?: number;
}): FindingRow[] {
  if (args.user_ids.length === 0) return [];
  const userPlaceholders = args.user_ids.map(() => "?").join(",");
  const params: Array<string | number> = [...args.user_ids, args.property_signature];
  let sql = `SELECT * FROM findings WHERE user_id IN (${userPlaceholders}) AND property_signature = ?`;
  if (args.status) {
    sql += " AND status = ?";
    params.push(args.status);
  }
  sql += " ORDER BY created_at DESC";
  if (args.limit) {
    sql += " LIMIT ?";
    params.push(args.limit);
  }
  return getDb().prepare(sql).all(...params) as FindingRow[];
}

export function insertFinding(args: {
  user_id: number;
  agent_id: string;
  property_signature: string;
  title: string;
  body: string;
  severity: string;
  data_json: string | null;
  visualization_json: string | null;
  question: string | null;
  scan_id: string;
}): FindingRow {
  const result = getDb()
    .prepare(
      `INSERT INTO findings (user_id, agent_id, property_signature, title, body, severity, data_json, visualization_json, question, scan_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      args.user_id,
      args.agent_id,
      args.property_signature,
      args.title,
      args.body,
      args.severity,
      args.data_json,
      args.visualization_json,
      args.question,
      args.scan_id
    );
  return getDb()
    .prepare("SELECT * FROM findings WHERE id = ?")
    .get(result.lastInsertRowid) as FindingRow;
}

export function updateFindingStatus(args: {
  id: number;
  user_ids: number[];
  status: string;
}): void {
  if (args.user_ids.length === 0) return;
  const placeholders = args.user_ids.map(() => "?").join(",");
  getDb()
    .prepare(
      `UPDATE findings SET status = ? WHERE id = ? AND user_id IN (${placeholders})`
    )
    .run(args.status, args.id, ...args.user_ids);
}

export function getFindingById(id: number, userIds: number[]): FindingRow | undefined {
  if (userIds.length === 0) return undefined;
  const placeholders = userIds.map(() => "?").join(",");
  return getDb()
    .prepare(`SELECT * FROM findings WHERE id = ? AND user_id IN (${placeholders})`)
    .get(id, ...userIds) as FindingRow | undefined;
}

export function countNewFindings(args: {
  user_ids: number[];
  property_signature: string;
}): number {
  if (args.user_ids.length === 0) return 0;
  const userPlaceholders = args.user_ids.map(() => "?").join(",");
  const row = getDb()
    .prepare(
      `SELECT COUNT(*) as n FROM findings WHERE user_id IN (${userPlaceholders}) AND property_signature = ? AND status = 'new'`
    )
    .get(...args.user_ids, args.property_signature) as { n: number };
  return row.n;
}

export function countNewFindingsByAgent(args: {
  user_ids: number[];
  property_signature: string;
}): Record<string, number> {
  if (args.user_ids.length === 0) return {};
  const userPlaceholders = args.user_ids.map(() => "?").join(",");
  const rows = getDb()
    .prepare(
      `SELECT agent_id, COUNT(*) as n FROM findings
       WHERE user_id IN (${userPlaceholders}) AND property_signature = ? AND status = 'new'
       GROUP BY agent_id`
    )
    .all(...args.user_ids, args.property_signature) as Array<{ agent_id: string; n: number }>;
  const out: Record<string, number> = {};
  for (const r of rows) out[r.agent_id] = r.n;
  return out;
}

export function setUserLastScanAt(userId: number, ts: number): void {
  getDb().prepare("UPDATE users SET last_scan_at = ? WHERE id = ?").run(ts, userId);
}

export type WorkspaceRow = {
  id: number;
  user_id: number;
  name: string;
  kind: string; // deprecated: 'single' | 'union' (kept for back-compat, no longer drives behavior)
  ga4_property_ids: string; // JSON array of internal property DB ids (numeric)
  primary_property_id: number | null;
  // v7: JSON array of { type, source_id, display_name, account_email }
  // Source of truth going forward. ga4_property_ids kept for backward compat.
  connected_sources: string | null;
  created_at: number;
  last_used_at: number;
  last_scan_at: number | null;
  archived: number;
};

export function listWorkspaces(args: {
  user_ids: number[];
  include_archived?: boolean;
}): WorkspaceRow[] {
  if (args.user_ids.length === 0) return [];
  const userPlaceholders = args.user_ids.map(() => "?").join(",");
  let sql = `SELECT * FROM workspaces WHERE user_id IN (${userPlaceholders})`;
  if (!args.include_archived) sql += " AND archived = 0";
  sql += " ORDER BY archived ASC, last_used_at DESC, id DESC";
  return getDb().prepare(sql).all(...args.user_ids) as WorkspaceRow[];
}

export function getWorkspaceById(id: number): WorkspaceRow | undefined {
  return getDb().prepare("SELECT * FROM workspaces WHERE id = ?").get(id) as
    | WorkspaceRow
    | undefined;
}

export function findSingleWorkspaceForProperty(args: {
  user_id: number;
  property_id: number;
}): WorkspaceRow | undefined {
  const rows = getDb()
    .prepare(
      "SELECT * FROM workspaces WHERE user_id = ? AND kind = 'single' AND archived = 0"
    )
    .all(args.user_id) as WorkspaceRow[];
  return rows.find((w) => {
    try {
      const ids = JSON.parse(w.ga4_property_ids) as number[];
      return ids.length === 1 && ids[0] === args.property_id;
    } catch {
      return false;
    }
  });
}

export function findUnionWorkspaceForPropertySet(args: {
  user_id: number;
  property_ids: number[];
}): WorkspaceRow | undefined {
  if (args.property_ids.length < 2) return undefined;
  const key = [...args.property_ids].sort((a, b) => a - b).join(",");
  const rows = getDb()
    .prepare("SELECT * FROM workspaces WHERE user_id = ? AND kind = 'union' AND archived = 0")
    .all(args.user_id) as WorkspaceRow[];
  return rows.find((w) => {
    try {
      const ids = JSON.parse(w.ga4_property_ids) as number[];
      return [...ids].sort((a, b) => a - b).join(",") === key;
    } catch {
      return false;
    }
  });
}

export function createWorkspace(args: {
  user_id: number;
  name: string;
  kind: "single" | "union";
  property_ids: number[];
  primary_property_id?: number | null;
}): WorkspaceRow {
  const primary =
    args.primary_property_id ??
    (args.property_ids.length > 0 ? args.property_ids[0] : null);
  const result = getDb()
    .prepare(
      "INSERT INTO workspaces (user_id, name, kind, ga4_property_ids, primary_property_id) VALUES (?, ?, ?, ?, ?)"
    )
    .run(
      args.user_id,
      args.name,
      args.kind,
      JSON.stringify(args.property_ids),
      primary
    );
  return getDb()
    .prepare("SELECT * FROM workspaces WHERE id = ?")
    .get(result.lastInsertRowid) as WorkspaceRow;
}

export function setWorkspacePrimary(args: {
  workspace_id: number;
  primary_property_id: number;
  user_ids: number[];
}): WorkspaceRow | undefined {
  if (args.user_ids.length === 0) return undefined;
  const placeholders = args.user_ids.map(() => "?").join(",");
  getDb()
    .prepare(
      `UPDATE workspaces SET primary_property_id = ? WHERE id = ? AND user_id IN (${placeholders})`
    )
    .run(args.primary_property_id, args.workspace_id, ...args.user_ids);
  return getWorkspaceById(args.workspace_id);
}

export function attachPropertyToWorkspace(args: {
  workspace_id: number;
  property_id: number;
  user_ids: number[];
}): WorkspaceRow | undefined {
  const ws = getWorkspaceById(args.workspace_id);
  if (!ws) return undefined;
  if (args.user_ids.length > 0 && !args.user_ids.includes(ws.user_id))
    return undefined;
  let ids: number[] = [];
  try {
    ids = JSON.parse(ws.ga4_property_ids) as number[];
  } catch {
    ids = [];
  }
  if (!ids.includes(args.property_id)) ids.push(args.property_id);
  getDb()
    .prepare("UPDATE workspaces SET ga4_property_ids = ? WHERE id = ?")
    .run(JSON.stringify(ids), args.workspace_id);
  return getWorkspaceById(args.workspace_id);
}

export function detachPropertyFromWorkspace(args: {
  workspace_id: number;
  property_id: number;
  user_ids: number[];
}): WorkspaceRow | undefined {
  const ws = getWorkspaceById(args.workspace_id);
  if (!ws) return undefined;
  if (args.user_ids.length > 0 && !args.user_ids.includes(ws.user_id))
    return undefined;
  let ids: number[] = [];
  try {
    ids = JSON.parse(ws.ga4_property_ids) as number[];
  } catch {
    ids = [];
  }
  ids = ids.filter((x) => x !== args.property_id);
  let newPrimary = ws.primary_property_id;
  if (newPrimary === args.property_id) {
    newPrimary = ids[0] ?? null;
  }
  getDb()
    .prepare(
      "UPDATE workspaces SET ga4_property_ids = ?, primary_property_id = ? WHERE id = ?"
    )
    .run(JSON.stringify(ids), newPrimary, args.workspace_id);
  return getWorkspaceById(args.workspace_id);
}

// doctor cache writer
// --- app_settings helpers ---

export function getAppSetting(args: {
  user_id: number;
  key: string;
}): string | null {
  const row = getDb()
    .prepare("SELECT value FROM app_settings WHERE user_id = ? AND key = ?")
    .get(args.user_id, args.key) as { value: string } | undefined;
  return row?.value ?? null;
}

export function setAppSetting(args: {
  user_id: number;
  key: string;
  value: string;
}): void {
  getDb()
    .prepare(
      `INSERT INTO app_settings (user_id, key, value, updated_at)
       VALUES (?, ?, ?, unixepoch())
       ON CONFLICT(user_id, key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
    )
    .run(args.user_id, args.key, args.value);
}

export function deleteAppSetting(args: { user_id: number; key: string }): void {
  getDb()
    .prepare("DELETE FROM app_settings WHERE user_id = ? AND key = ?")
    .run(args.user_id, args.key);
}

// --- doctor cache ---

export function setPropertyDoctor(args: {
  property_id: number;
  doctor_json: string;
}): void {
  getDb()
    .prepare(
      "UPDATE properties SET doctor_json = ?, doctor_checked_at = unixepoch() WHERE id = ?"
    )
    .run(args.doctor_json, args.property_id);
}

export function findWorkspaceByPrimaryHost(args: {
  user_id: number;
  host: string;
}): WorkspaceRow | undefined {
  // Returns the most-recent non-archived workspace whose primary property's
  // website_url matches the given (normalized, no www.) host.
  const rows = getDb()
    .prepare(
      `SELECT w.*, p.website_url as primary_website_url
       FROM workspaces w
       JOIN properties p ON p.id = w.primary_property_id
       WHERE w.user_id = ? AND w.archived = 0
       ORDER BY w.last_used_at DESC, w.id DESC`
    )
    .all(args.user_id) as Array<WorkspaceRow & { primary_website_url: string | null }>;
  const target = args.host.replace(/^www\./, "").toLowerCase();
  for (const row of rows) {
    if (!row.primary_website_url) continue;
    const host = extractHost(row.primary_website_url);
    if (host && host.replace(/^www\./, "").toLowerCase() === target) {
      const { primary_website_url: _omit, ...ws } = row;
      void _omit;
      return ws as WorkspaceRow;
    }
  }
  return undefined;
}

function extractHost(url: string): string | null {
  try {
    const u = url.startsWith("http") ? new URL(url) : new URL(`https://${url}`);
    return u.host;
  } catch {
    return null;
  }
}

export function updateWorkspace(args: {
  id: number;
  user_ids: number[];
  name?: string;
  property_ids?: number[];
  kind?: "single" | "union";
  archived?: boolean;
}): WorkspaceRow | undefined {
  if (args.user_ids.length === 0) return undefined;
  const placeholders = args.user_ids.map(() => "?").join(",");
  const sets: string[] = [];
  const params: Array<string | number> = [];
  if (args.name !== undefined) {
    sets.push("name = ?");
    params.push(args.name);
  }
  if (args.property_ids !== undefined) {
    sets.push("ga4_property_ids = ?");
    params.push(JSON.stringify(args.property_ids));
  }
  if (args.kind !== undefined) {
    sets.push("kind = ?");
    params.push(args.kind);
  }
  if (args.archived !== undefined) {
    sets.push("archived = ?");
    params.push(args.archived ? 1 : 0);
  }
  if (sets.length === 0) return getWorkspaceById(args.id);
  params.push(args.id, ...args.user_ids);
  getDb()
    .prepare(
      `UPDATE workspaces SET ${sets.join(", ")} WHERE id = ? AND user_id IN (${placeholders})`
    )
    .run(...params);
  return getWorkspaceById(args.id);
}

export function touchWorkspaceLastUsed(id: number): void {
  getDb()
    .prepare("UPDATE workspaces SET last_used_at = unixepoch() WHERE id = ?")
    .run(id);
}

export function setWorkspaceLastScanAt(id: number, ts: number): void {
  getDb()
    .prepare("UPDATE workspaces SET last_scan_at = ? WHERE id = ?")
    .run(ts, id);
}

export type ConversationRow = {
  id: number;
  user_id: number;
  workspace_id: number | null;
  primary_agent_id: string | null;
  title: string | null;
  pinned: number;
  archived: number;
  seed_finding_id: number | null;
  created_at: number;
  last_message_at: number | null;
};

export type ConversationMessageRow = {
  id: number;
  conversation_id: number;
  message_id: string;
  role: string;
  content: string;
  author_agent_id: string | null;
  created_at: number;
};

export function createConversation(args: {
  user_id: number;
  workspace_id: number;
  primary_agent_id: string | null;
  title?: string | null;
  seed_finding_id?: number | null;
}): ConversationRow {
  const result = getDb()
    .prepare(
      `INSERT INTO conversations (user_id, workspace_id, primary_agent_id, title, seed_finding_id)
       VALUES (?, ?, ?, ?, ?)`
    )
    .run(
      args.user_id,
      args.workspace_id,
      args.primary_agent_id,
      args.title ?? null,
      args.seed_finding_id ?? null
    );
  return getDb()
    .prepare("SELECT * FROM conversations WHERE id = ?")
    .get(result.lastInsertRowid) as ConversationRow;
}

export function getConversationById(id: number): ConversationRow | undefined {
  return getDb().prepare("SELECT * FROM conversations WHERE id = ?").get(id) as
    | ConversationRow
    | undefined;
}

export function listConversations(args: {
  user_ids: number[];
  workspace_id: number;
  limit?: number;
  include_archived?: boolean;
  include_empty?: boolean;
}): ConversationRow[] {
  if (args.user_ids.length === 0) return [];
  const userPlaceholders = args.user_ids.map(() => "?").join(",");
  let sql = `SELECT c.* FROM conversations c
             WHERE c.workspace_id = ? AND c.user_id IN (${userPlaceholders})`;
  if (!args.include_archived) sql += " AND c.archived = 0";
  if (!args.include_empty) {
    // Hide conversations with zero messages — they're empty stubs from "+ New chat"
    // clicks that never got used. Spec calls for auto-archive after 7 days; this
    // covers the immediate UX gap.
    sql += " AND (c.last_message_at IS NOT NULL OR c.seed_finding_id IS NOT NULL)";
  }
  sql += " ORDER BY c.pinned DESC, c.last_message_at DESC NULLS LAST, c.id DESC";
  if (args.limit) sql += ` LIMIT ${args.limit}`;
  return getDb()
    .prepare(sql)
    .all(args.workspace_id, ...args.user_ids) as ConversationRow[];
}

export function updateConversation(args: {
  id: number;
  user_ids: number[];
  title?: string;
  primary_agent_id?: string | null;
  pinned?: boolean;
  archived?: boolean;
}): ConversationRow | undefined {
  if (args.user_ids.length === 0) return undefined;
  const userPlaceholders = args.user_ids.map(() => "?").join(",");
  const sets: string[] = [];
  const params: Array<string | number | null> = [];
  if (args.title !== undefined) {
    sets.push("title = ?");
    params.push(args.title);
  }
  if (args.primary_agent_id !== undefined) {
    sets.push("primary_agent_id = ?");
    params.push(args.primary_agent_id);
  }
  if (args.pinned !== undefined) {
    sets.push("pinned = ?");
    params.push(args.pinned ? 1 : 0);
  }
  if (args.archived !== undefined) {
    sets.push("archived = ?");
    params.push(args.archived ? 1 : 0);
  }
  if (sets.length === 0) return getConversationById(args.id);
  params.push(args.id);
  params.push(...args.user_ids);
  getDb()
    .prepare(
      `UPDATE conversations SET ${sets.join(", ")}
       WHERE id = ? AND user_id IN (${userPlaceholders})`
    )
    .run(...params);
  return getConversationById(args.id);
}

export function deleteConversation(args: { id: number; user_ids: number[] }): void {
  if (args.user_ids.length === 0) return;
  const userPlaceholders = args.user_ids.map(() => "?").join(",");
  const db = getDb();
  db.prepare(
    `DELETE FROM conversation_messages WHERE conversation_id = ?
       AND EXISTS (SELECT 1 FROM conversations
                   WHERE conversations.id = conversation_messages.conversation_id
                     AND conversations.user_id IN (${userPlaceholders}))`
  ).run(args.id, ...args.user_ids);
  db.prepare(
    `DELETE FROM conversations WHERE id = ? AND user_id IN (${userPlaceholders})`
  ).run(args.id, ...args.user_ids);
}

export function listConversationMessages(conversationId: number): ConversationMessageRow[] {
  return getDb()
    .prepare(
      "SELECT * FROM conversation_messages WHERE conversation_id = ? ORDER BY id ASC"
    )
    .all(conversationId) as ConversationMessageRow[];
}

export function upsertConversationMessage(args: {
  conversation_id: number;
  message_id: string;
  role: string;
  content: string;
  author_agent_id?: string | null;
}): void {
  const db = getDb();
  db.prepare(
    `INSERT INTO conversation_messages (conversation_id, message_id, role, content, author_agent_id)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(conversation_id, message_id) DO UPDATE SET content = excluded.content,
       author_agent_id = excluded.author_agent_id`
  ).run(
    args.conversation_id,
    args.message_id,
    args.role,
    args.content,
    args.author_agent_id ?? null
  );
  db.prepare("UPDATE conversations SET last_message_at = unixepoch() WHERE id = ?").run(
    args.conversation_id
  );
}

export function getConversationParticipants(conversationId: number): string[] {
  const rows = getDb()
    .prepare(
      `SELECT DISTINCT author_agent_id FROM conversation_messages
       WHERE conversation_id = ? AND author_agent_id IS NOT NULL`
    )
    .all(conversationId) as Array<{ author_agent_id: string }>;
  return rows.map((r) => r.author_agent_id);
}

// Batched variant — one SQL query returns participants for N conversations.
// Caller-side joins map → list to avoid N+1.
export function getConversationParticipantsBatch(
  conversationIds: number[]
): Map<number, string[]> {
  const out = new Map<number, string[]>();
  if (conversationIds.length === 0) return out;
  const placeholders = conversationIds.map(() => "?").join(",");
  const rows = getDb()
    .prepare(
      `SELECT DISTINCT conversation_id, author_agent_id FROM conversation_messages
       WHERE conversation_id IN (${placeholders}) AND author_agent_id IS NOT NULL`
    )
    .all(...conversationIds) as Array<{
      conversation_id: number;
      author_agent_id: string;
    }>;
  for (const r of rows) {
    const list = out.get(r.conversation_id) ?? [];
    list.push(r.author_agent_id);
    out.set(r.conversation_id, list);
  }
  return out;
}

export function searchEverything(args: {
  user_ids: number[];
  workspace_id: number;
  q: string;
  limit?: number;
}): {
  conversations: Array<{
    id: number;
    title: string;
    snippet: string;
    last_message_at: number | null;
  }>;
  findings: Array<{ id: number; title: string; snippet: string; created_at: number }>;
  briefs: Array<{ id: number; title: string; snippet: string; created_at: number }>;
} {
  if (args.user_ids.length === 0 || !args.q.trim()) {
    return { conversations: [], findings: [], briefs: [] };
  }
  const db = getDb();
  const lim = args.limit ?? 5;
  const userPlaceholders = args.user_ids.map(() => "?").join(",");
  const like = `%${args.q.replace(/[%_]/g, "")}%`;

  const conversations = db
    .prepare(
      `SELECT c.id, c.title, c.last_message_at,
              (SELECT content FROM conversation_messages
               WHERE conversation_id = c.id AND content LIKE ?
               ORDER BY id ASC LIMIT 1) AS snippet
       FROM conversations c
       WHERE c.workspace_id = ? AND c.user_id IN (${userPlaceholders})
         AND (
           c.title LIKE ? OR
           EXISTS (SELECT 1 FROM conversation_messages m
                   WHERE m.conversation_id = c.id AND m.content LIKE ?)
         )
       ORDER BY c.last_message_at DESC NULLS LAST
       LIMIT ${lim}`
    )
    .all(like, args.workspace_id, ...args.user_ids, like, like) as Array<{
      id: number;
      title: string | null;
      last_message_at: number | null;
      snippet: string | null;
    }>;

  const findings = db
    .prepare(
      `SELECT id, title, body, created_at FROM findings
       WHERE workspace_id = ? AND user_id IN (${userPlaceholders})
         AND (title LIKE ? OR body LIKE ?)
       ORDER BY created_at DESC LIMIT ${lim}`
    )
    .all(args.workspace_id, ...args.user_ids, like, like) as Array<{
      id: number;
      title: string;
      body: string;
      created_at: number;
    }>;

  const briefs = db
    .prepare(
      `SELECT id, title, output_json, created_at FROM briefs
       WHERE workspace_id = ?
         AND (title LIKE ? OR output_json LIKE ?)
       ORDER BY created_at DESC LIMIT ${lim}`
    )
    .all(args.workspace_id, like, like) as Array<{
      id: number;
      title: string;
      output_json: string | null;
      created_at: number;
    }>;

  return {
    conversations: conversations.map((c) => ({
      id: c.id,
      title: c.title ?? "Untitled chat",
      snippet: snippetAround(c.snippet ?? "", args.q),
      last_message_at: c.last_message_at,
    })),
    findings: findings.map((f) => ({
      id: f.id,
      title: f.title,
      snippet: snippetAround(f.body, args.q),
      created_at: f.created_at,
    })),
    briefs: briefs.map((b) => ({
      id: b.id,
      title: b.title,
      snippet: snippetAround(b.output_json ?? "", args.q).slice(0, 120),
      created_at: b.created_at,
    })),
  };
}

function snippetAround(text: string, query: string, radius = 60): string {
  if (!text) return "";
  const lower = text.toLowerCase();
  const idx = lower.indexOf(query.toLowerCase());
  if (idx === -1) return text.slice(0, radius * 2);
  const start = Math.max(0, idx - radius);
  const end = Math.min(text.length, idx + query.length + radius);
  return (start > 0 ? "…" : "") + text.slice(start, end).replace(/\s+/g, " ").trim() + (end < text.length ? "…" : "");
}

export type BriefRow = {
  id: number;
  user_id: number;
  workspace_id: number;
  template_id: string;
  title: string;
  status: string;
  date_range_start: string | null;
  date_range_end: string | null;
  comparison_range_start: string | null;
  comparison_range_end: string | null;
  params_json: string | null;
  output_json: string | null;
  error_text: string | null;
  pinned: number;
  created_at: number;
  completed_at: number | null;
};

export function createBrief(args: {
  user_id: number;
  workspace_id: number;
  template_id: string;
  title: string;
  params?: unknown;
  date_range_start?: string;
  date_range_end?: string;
  comparison_range_start?: string;
  comparison_range_end?: string;
}): BriefRow {
  const result = getDb()
    .prepare(
      `INSERT INTO briefs (user_id, workspace_id, template_id, title, params_json,
        date_range_start, date_range_end, comparison_range_start, comparison_range_end)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      args.user_id,
      args.workspace_id,
      args.template_id,
      args.title,
      args.params ? JSON.stringify(args.params) : null,
      args.date_range_start ?? null,
      args.date_range_end ?? null,
      args.comparison_range_start ?? null,
      args.comparison_range_end ?? null
    );
  return getDb()
    .prepare("SELECT * FROM briefs WHERE id = ?")
    .get(result.lastInsertRowid) as BriefRow;
}

export function getBriefById(id: number): BriefRow | undefined {
  return getDb().prepare("SELECT * FROM briefs WHERE id = ?").get(id) as
    | BriefRow
    | undefined;
}

export function listBriefsForWorkspace(args: {
  workspace_id: number;
  limit?: number;
  pinned_only?: boolean;
}): BriefRow[] {
  let sql = "SELECT * FROM briefs WHERE workspace_id = ?";
  if (args.pinned_only) sql += " AND pinned = 1";
  sql += " ORDER BY created_at DESC";
  if (args.limit) sql += ` LIMIT ${args.limit}`;
  return getDb().prepare(sql).all(args.workspace_id) as BriefRow[];
}

export function listBriefsForTemplate(args: {
  workspace_id: number;
  template_id: string;
  limit?: number;
}): BriefRow[] {
  const limit = args.limit ?? 20;
  return getDb()
    .prepare(
      "SELECT * FROM briefs WHERE workspace_id = ? AND template_id = ? ORDER BY created_at DESC LIMIT ?"
    )
    .all(args.workspace_id, args.template_id, limit) as BriefRow[];
}

export function setBriefOutput(args: {
  id: number;
  output: unknown;
  status: string;
}): void {
  getDb()
    .prepare(
      "UPDATE briefs SET output_json = ?, status = ?, completed_at = unixepoch() WHERE id = ?"
    )
    .run(JSON.stringify(args.output), args.status, args.id);
}

export function setBriefError(args: { id: number; error: string }): void {
  getDb()
    .prepare(
      "UPDATE briefs SET status = 'failed', error_text = ?, completed_at = unixepoch() WHERE id = ?"
    )
    .run(args.error, args.id);
}

export function setBriefPinned(args: {
  id: number;
  user_ids: number[];
  pinned: boolean;
}): void {
  if (args.user_ids.length === 0) return;
  const placeholders = args.user_ids.map(() => "?").join(",");
  getDb()
    .prepare(
      `UPDATE briefs SET pinned = ? WHERE id = ? AND user_id IN (${placeholders})`
    )
    .run(args.pinned ? 1 : 0, args.id, ...args.user_ids);
}

export function deleteWorkspace(args: { id: number; user_ids: number[] }): void {
  if (args.user_ids.length === 0) return;
  const placeholders = args.user_ids.map(() => "?").join(",");
  // Soft delete: just archive. Hard delete would orphan threads/findings.
  getDb()
    .prepare(`UPDATE workspaces SET archived = 1 WHERE id = ? AND user_id IN (${placeholders})`)
    .run(args.id, ...args.user_ids);
}

// One-shot migration: for each user with no workspaces, create singles from
// their properties and backfill workspace_id on threads / findings / pinned.
function migrateExistingDataToWorkspaces(db: Database.Database): void {
  const users = db.prepare("SELECT id FROM users").all() as Array<{ id: number }>;
  for (const u of users) {
    const existing = db
      .prepare("SELECT COUNT(*) as n FROM workspaces WHERE user_id = ?")
      .get(u.id) as { n: number };
    if (existing.n > 0) continue;

    const props = db
      .prepare("SELECT id, display_name FROM properties WHERE user_id = ?")
      .all(u.id) as Array<{ id: number; display_name: string }>;

    if (props.length === 0) continue;

    // Per-property single workspaces
    const wsByDbId = new Map<number, number>();
    for (const p of props) {
      const result = db
        .prepare(
          "INSERT INTO workspaces (user_id, name, kind, ga4_property_ids) VALUES (?, ?, 'single', ?)"
        )
        .run(u.id, p.display_name, JSON.stringify([p.id]));
      wsByDbId.set(p.id, result.lastInsertRowid as number);
    }

    // Backfill threads
    const threads = db
      .prepare(
        "SELECT id, property_signature FROM threads WHERE user_id = ? AND (workspace_id IS NULL OR workspace_id = 0)"
      )
      .all(u.id) as Array<{ id: number; property_signature: string }>;
    const unionCache = new Map<string, number>();
    for (const t of threads) {
      const ids = parseSignature(t.property_signature);
      const wsId = resolveOrCreateWorkspaceId(db, u.id, ids, wsByDbId, unionCache, props);
      if (wsId) {
        db.prepare("UPDATE threads SET workspace_id = ? WHERE id = ?").run(wsId, t.id);
      }
    }

    // Backfill findings
    const findings = db
      .prepare(
        "SELECT id, property_signature FROM findings WHERE user_id = ? AND (workspace_id IS NULL OR workspace_id = 0)"
      )
      .all(u.id) as Array<{ id: number; property_signature: string }>;
    for (const f of findings) {
      const ids = parseSignature(f.property_signature);
      const wsId = resolveOrCreateWorkspaceId(db, u.id, ids, wsByDbId, unionCache, props);
      if (wsId) {
        db.prepare("UPDATE findings SET workspace_id = ? WHERE id = ?").run(wsId, f.id);
      }
    }

    // Backfill pinned_insights to first single workspace (no property scope previously)
    const firstSingle = props[0] ? wsByDbId.get(props[0].id) : undefined;
    if (firstSingle) {
      db.prepare(
        "UPDATE pinned_insights SET workspace_id = ? WHERE user_id = ? AND (workspace_id IS NULL OR workspace_id = 0)"
      ).run(firstSingle, u.id);
    }

    // If user had a last_scan_at on their account, copy it to their first workspace
    const userRow = db
      .prepare("SELECT last_scan_at FROM users WHERE id = ?")
      .get(u.id) as { last_scan_at: number | null } | undefined;
    if (userRow?.last_scan_at && firstSingle) {
      db.prepare("UPDATE workspaces SET last_scan_at = ? WHERE id = ?").run(
        userRow.last_scan_at,
        firstSingle
      );
    }
  }
}

function parseSignature(sig: string | null | undefined): number[] {
  if (!sig) return [];
  return sig
    .split(",")
    .map((s) => parseInt(s.trim(), 10))
    .filter((n) => Number.isFinite(n));
}

function migrateThreadsToConversations(db: Database.Database): void {
  // For each non-empty thread, ensure a matching conversation exists (id-keyed).
  try {
    const threads = db
      .prepare(
        `SELECT t.id, t.user_id, t.workspace_id, t.agent_id, t.created_at, t.last_message_at,
                (SELECT COUNT(*) FROM thread_messages WHERE thread_id = t.id) AS msg_count
         FROM threads t`
      )
      .all() as Array<{
        id: number;
        user_id: number;
        workspace_id: number | null;
        agent_id: string;
        created_at: number;
        last_message_at: number | null;
        msg_count: number;
      }>;

    for (const t of threads) {
      if (t.msg_count === 0) continue; // skip stub threads with no messages

      const existing = db
        .prepare("SELECT id FROM conversations WHERE id = ?")
        .get(t.id) as { id: number } | undefined;
      if (existing) continue;

      const title =
        t.agent_id === "all"
          ? "All Agents thread"
          : `${t.agent_id[0].toUpperCase()}${t.agent_id.slice(1)} thread`;

      db.prepare(
        `INSERT INTO conversations (id, user_id, workspace_id, primary_agent_id, title, created_at, last_message_at, archived)
         VALUES (?, ?, ?, ?, ?, ?, ?, 0)`
      ).run(
        t.id,
        t.user_id,
        t.workspace_id,
        t.agent_id === "all" ? null : t.agent_id,
        title,
        t.created_at,
        t.last_message_at
      );

      // Copy thread_messages → conversation_messages with same ids
      const msgs = db
        .prepare(
          "SELECT id, message_id, role, content, created_at FROM thread_messages WHERE thread_id = ?"
        )
        .all(t.id) as Array<{
          id: number;
          message_id: string;
          role: string;
          content: string;
          created_at: number;
        }>;
      for (const m of msgs) {
        try {
          db.prepare(
            `INSERT INTO conversation_messages (id, conversation_id, message_id, role, content, created_at)
             VALUES (?, ?, ?, ?, ?, ?)`
          ).run(m.id, t.id, m.message_id, m.role, m.content, m.created_at);
        } catch {
          // already inserted
        }
      }
    }
  } catch {
    // threads table doesn't exist yet — fresh install, nothing to migrate
  }
}

function resolveOrCreateWorkspaceId(
  db: Database.Database,
  userId: number,
  ids: number[],
  singleByDbId: Map<number, number>,
  unionCache: Map<string, number>,
  props: Array<{ id: number; display_name: string }>
): number | undefined {
  if (ids.length === 0) return undefined;
  if (ids.length === 1) return singleByDbId.get(ids[0]);
  const key = [...ids].sort((a, b) => a - b).join(",");
  const cached = unionCache.get(key);
  if (cached) return cached;
  const names = ids
    .map((id) => props.find((p) => p.id === id)?.display_name)
    .filter(Boolean) as string[];
  const name = names.length > 0 ? `Combined: ${names.slice(0, 2).join(" + ")}${names.length > 2 ? ` +${names.length - 2}` : ""}` : "Combined view";
  const result = db
    .prepare(
      "INSERT INTO workspaces (user_id, name, kind, ga4_property_ids) VALUES (?, ?, 'union', ?)"
    )
    .run(userId, name, JSON.stringify(ids));
  const wsId = result.lastInsertRowid as number;
  unionCache.set(key, wsId);
  return wsId;
}

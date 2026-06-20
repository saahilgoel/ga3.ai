const Database = require("better-sqlite3");
const path = process.env.DB_PATH || "ga-chat.db";
const db = new Database(path, { readonly: true });

const tbl = db
  .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='usage_events'")
  .get();
if (!tbl) {
  console.log("NO usage_events table in", path);
  process.exit(0);
}

const n = db.prepare("SELECT COUNT(*) c FROM usage_events").get().c;
console.log("usage_events rows:", n);

if (n > 0) {
  const span = db.prepare("SELECT MIN(created_at) a, MAX(created_at) b FROM usage_events").get();
  const fmt = (t) => (t ? new Date(t * 1000).toISOString().slice(0, 16) : "-");
  console.log("date range:", fmt(span.a), "->", fmt(span.b));

  console.log("\n-- spend by section (last 30d) --");
  const bySection = db
    .prepare(
      `SELECT section,
              COUNT(*) calls,
              ROUND(SUM(cost_usd),4) usd,
              ROUND(SUM(input_tokens)/1e6,3) in_mtok,
              ROUND(SUM(output_tokens)/1e6,3) out_mtok
       FROM usage_events
       WHERE created_at > unixepoch() - 30*86400
       GROUP BY section ORDER BY usd DESC`
    )
    .all();
  console.table(bySection);

  console.log("\n-- dormant-scan waste (scan spend on workspaces idle >14d, 30d) --");
  try {
    const waste = db
      .prepare(
        `SELECT ROUND(SUM(e.cost_usd),4) wasted_usd_30d, COUNT(*) calls
         FROM usage_events e
         JOIN workspaces w ON w.user_id = e.user_id
         WHERE e.section='scan'
           AND e.created_at > unixepoch() - 30*86400
           AND w.last_used_at < unixepoch() - 14*86400`
      )
      .get();
    console.log(waste);
  } catch (err) {
    console.log("(could not compute:", err.message, ")");
  }
}

// quick footprint
const tables = ["users", "workspaces", "conversations", "conversation_messages", "findings", "context_chunks", "context_embeddings", "ai_visibility_runs"];
console.log("\n-- table row counts --");
for (const t of tables) {
  try {
    const c = db.prepare(`SELECT COUNT(*) c FROM ${t}`).get().c;
    console.log(t.padEnd(24), c);
  } catch {
    console.log(t.padEnd(24), "(missing)");
  }
}

import { getDb, purgeOldFindings } from "./db";

// Autonomous scans are NO LONGER run on a blind timer. They fire (a) when a
// workspace's onboarding + RAG context becomes ready, and (b) lazily on app
// open if >24h stale — see maybeAutoScan() in ./scan. This scheduler only keeps
// the cheap, periodic context refreshes (industry signals, competitor ads) and
// a daily findings-retention sweep.
const INDUSTRY_INTERVAL_S = 24 * 60 * 60; // 24h
const TICK_INTERVAL_MS = 30 * 60_000;
const PURGE_INTERVAL_MS = 23 * 60 * 60_000; // ~daily
const RETENTION_DAYS = Number(process.env.FINDINGS_RETENTION_DAYS || 30);
const MAX_FINDINGS_PER_WS = Number(process.env.FINDINGS_MAX_PER_WORKSPACE || 50);

let started = false;
let lastPurge = 0;

export function startScheduler() {
  if (started) return;
  started = true;
  console.log(
    "[scheduler] starting scan loop — tick every 30 min, per-workspace scan threshold 4h, industry refresh 24h, active-workspace only"
  );
  setTimeout(tick, 60_000);
  setInterval(tick, TICK_INTERVAL_MS);
}

async function tick() {
  const db = getDb();
  const nowS = Math.floor(Date.now() / 1000);

  // Daily retention sweep so the findings corpus stays bounded (age + per-ws cap).
  if (Date.now() - lastPurge >= PURGE_INTERVAL_MS) {
    lastPurge = Date.now();
    try {
      const removed = purgeOldFindings({
        retentionDays: RETENTION_DAYS,
        perWorkspaceCap: MAX_FINDINGS_PER_WS,
      });
      if (removed > 0) console.log(`[scheduler] purged ${removed} old findings`);
    } catch (err) {
      console.warn("[scheduler] findings purge failed:", (err as Error).message);
    }
  }

  // In v4, only the most-recently-used workspace per user is "active" for autonomous scans.
  // This caps cost: a user with 8 workspaces only ever has one scanning on schedule.
  const rows = db
    .prepare(
      `SELECT w.*, u.email FROM workspaces w
       JOIN users u ON u.id = w.user_id
       WHERE w.archived = 0
       ORDER BY w.user_id, w.last_used_at DESC`
    )
    .all() as Array<{
      id: number;
      user_id: number;
      name: string;
      email: string;
      last_used_at: number;
      last_scan_at: number | null;
    }>;

  const seenUsers = new Set<number>();
  for (const w of rows) {
    if (seenUsers.has(w.user_id)) continue; // only the top (most-recently-used) workspace per user
    seenUsers.add(w.user_id);

    // Industry refresh — only on the top workspace per user. Cheap (~5 credits)
    // so we don't gate behind scan cadence.
    try {
      const ctxRow = db
        .prepare(
          "SELECT last_industry_refresh_at FROM context_status WHERE workspace_id = ?"
        )
        .get(w.id) as { last_industry_refresh_at: number | null } | undefined;
      const sinceIndustry = ctxRow?.last_industry_refresh_at
        ? nowS - ctxRow.last_industry_refresh_at
        : Infinity;
      if (sinceIndustry >= INDUSTRY_INTERVAL_S) {
        const { buildIndustrySignals } = await import("./context/industry");
        // Fire-and-forget; the next tick will retry if it fails.
        buildIndustrySignals({ workspace_id: w.id }).catch((err) => {
          console.warn(
            `[scheduler] industry refresh failed for ws=${w.id}:`,
            (err as Error).message
          );
        });
      }
    } catch (err) {
      console.warn(
        `[scheduler] industry tick error for ws=${w.id}:`,
        (err as Error).message
      );
    }

    // Competitor ad library refresh — daily, per workspace. The ad-library
    // module gates per-competitor on its own (24h since last ingest).
    try {
      const { buildCompetitorAds } = await import("./context/ad-library");
      buildCompetitorAds({ workspace_id: w.id }).catch((err) => {
        console.warn(
          `[scheduler] ad library refresh failed for ws=${w.id}:`,
          (err as Error).message
        );
      });
    } catch (err) {
      console.warn(
        `[scheduler] ad library tick error for ws=${w.id}:`,
        (err as Error).message
      );
    }
  }
}

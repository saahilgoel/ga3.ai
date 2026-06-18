// One process-wide ticker that polls GA4 realtime per ACTIVE workspace
// (i.e. workspaces that have at least one SSE subscriber listening) and
// fans the result out via pubsub. Five tabs open = one upstream call.
//
// The ticker is lazy — it only starts when the first subscriber registers
// for a workspace and pauses when the last unsubscribes. Avoids burning
// GA4 quota on workspaces nobody is watching.

import { getWorkspaceById, listWorkspaces } from "./db";
import { resolveWorkspaceWithTokens } from "./workspace";
import { runRealtime, runReport } from "./ga4";
import { publish } from "./pubsub";

const POLL_INTERVAL_MS = 30_000;

// Subscribers per workspace_id — count of SSE clients listening.
const watcherCount = new Map<number, number>();
// One interval handle per workspace.
const tickerHandles = new Map<number, ReturnType<typeof setInterval>>();

async function pollOnce(workspaceId: number): Promise<void> {
  const ws = getWorkspaceById(workspaceId);
  if (!ws) return stopTicker(workspaceId);
  try {
    const wt = await resolveWorkspaceWithTokens(ws);
    if (wt.properties.length === 0) return;
    const p = wt.properties[0];
    // Active right now
    const realtime = await runRealtime(p.accessToken, p.property.ga4_property_id, {
      dimensions: [],
      metrics: ["activeUsers"],
      limit: 1,
    });
    const active_users = Number(realtime.rows[0]?.metrics.activeUsers || 0);
    // Hourly avg for context
    let hourly_avg = 0;
    try {
      const hourly = await runReport(p.accessToken, p.property.ga4_property_id, {
        dimensions: ["dateHour"],
        metrics: ["activeUsers"],
        startDate: "1daysAgo",
        endDate: "today",
        limit: 48,
      });
      const vals = hourly.rows.map((r) => Number(r.metrics.activeUsers || 0));
      hourly_avg = vals.length > 0 ? Math.round(vals.reduce((s, v) => s + v, 0) / vals.length) : 0;
    } catch {
      hourly_avg = 0;
    }
    publish(ws.user_id, {
      kind: "realtime.update",
      workspace_id: ws.id,
      active_users,
      hourly_avg,
    });
  } catch (err) {
    console.warn(`[realtime-ticker] ws=${workspaceId} failed:`, (err as Error).message);
  }
}

function startTicker(workspaceId: number) {
  if (tickerHandles.has(workspaceId)) return;
  // Run once immediately so the first subscriber sees a value within ~1s.
  pollOnce(workspaceId).catch(() => {});
  const handle = setInterval(() => {
    pollOnce(workspaceId).catch(() => {});
  }, POLL_INTERVAL_MS);
  tickerHandles.set(workspaceId, handle);
}

function stopTicker(workspaceId: number) {
  const handle = tickerHandles.get(workspaceId);
  if (handle) {
    clearInterval(handle);
    tickerHandles.delete(workspaceId);
  }
}

/** Call when a tab starts watching a workspace's realtime. */
export function addWatcher(workspaceId: number) {
  const n = (watcherCount.get(workspaceId) ?? 0) + 1;
  watcherCount.set(workspaceId, n);
  if (n === 1) startTicker(workspaceId);
}

/** Call when a tab stops watching (SSE drop or workspace change). */
export function removeWatcher(workspaceId: number) {
  const n = (watcherCount.get(workspaceId) ?? 0) - 1;
  if (n <= 0) {
    watcherCount.delete(workspaceId);
    stopTicker(workspaceId);
  } else {
    watcherCount.set(workspaceId, n);
  }
}

/** For diagnostics. */
export function tickerStatus(): {
  active_workspaces: number[];
  watcher_counts: Record<number, number>;
} {
  return {
    active_workspaces: [...tickerHandles.keys()],
    watcher_counts: Object.fromEntries(watcherCount.entries()),
  };
}

// Reference unused import so the linter doesn't drop the helper.
void listWorkspaces;

import { runScan } from "@/lib/scan";

/**
 * Onboard (or refresh) a workspace in the right order:
 *   1) build brand context (site profile, competitors, RAG), THEN
 *   2) run the scan.
 *
 * The scan reads `getWorkspaceContextSummary`, so running it AFTER context is
 * built grounds its findings in the brand + competitor context — personalized,
 * "real" recommendations instead of generic ones. If context is already built,
 * it scans immediately.
 *
 * Fire-and-forget: kicks off background work and resolves quickly; never throws
 * into the caller. The context build is concurrency-guarded in the orchestrator.
 */
export async function onboardWorkspace(workspaceId: number): Promise<void> {
  const scan = () =>
    runScan({ workspace_id: workspaceId }).catch((err) =>
      console.error(`[onboard] scan failed for ws ${workspaceId}:`, (err as Error).message)
    );

  let needsBuild = true;
  try {
    const { getContextStatus } = await import("@/lib/context/db-helpers");
    const status = getContextStatus(workspaceId);
    // Rebuild unless context is genuinely complete. A "crawling"/"embedding"
    // status can be STALE — a prior build was killed mid-flight by a deploy or
    // container restart — and would otherwise block rebuilds forever, leaving
    // the progress stuck (e.g. "Website 1/9 8%") with no catalog. The
    // in-memory guard in buildWorkspaceContext still prevents a genuinely
    // running build from being duplicated.
    needsBuild = !(status?.status === "ready" || status?.status === "partial");
  } catch (err) {
    console.warn(`[onboard] context status check failed:`, (err as Error).message);
  }

  if (!needsBuild) {
    // Context already present — scan now; it reads the existing context.
    scan();
    return;
  }

  try {
    const { buildWorkspaceContext } = await import("@/lib/context/orchestrator");
    // Build first; scan once context settles (success OR failure) so findings
    // are grounded in brand/competitor context rather than racing ahead of it.
    buildWorkspaceContext(workspaceId)
      .catch((err) => console.warn(`[onboard] context build failed:`, (err as Error).message))
      .finally(scan);
  } catch (err) {
    console.warn(`[onboard] could not start context build:`, (err as Error).message);
    // If the build couldn't even start, still scan so findings aren't blocked.
    scan();
  }
}

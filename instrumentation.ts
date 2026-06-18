export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    // Self-heal any context build interrupted by the last restart, so it never
    // shows a stuck "building 8%" and stays rebuildable.
    try {
      const { recoverStaleContextBuilds } = await import(
        "./lib/context/db-helpers"
      );
      const n = recoverStaleContextBuilds();
      if (n > 0) console.log(`[boot] recovered ${n} interrupted context build(s)`);
    } catch (err) {
      console.warn("[boot] context recovery failed:", (err as Error).message);
    }

    const { startScheduler } = await import("./lib/scheduler");
    startScheduler();
  }
}

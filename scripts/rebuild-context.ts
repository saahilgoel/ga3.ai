// One-off: rebuild a workspace's context end-to-end with the orchestrator
// in-process, so we can watch the logs live without going through the API.
// Usage: npx tsx scripts/rebuild-context.ts <workspace_id>

import fs from "node:fs";
import path from "node:path";

// Hand-roll a tiny .env.local loader (dotenv isn't always installed).
function loadEnv() {
  const file = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.+)\s*$/);
    if (m && !process.env[m[1]]) {
      process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, "");
    }
  }
}
loadEnv();

async function main() {
  const wsId = parseInt(process.argv[2] || "0", 10);
  if (!wsId) {
    console.error("usage: tsx scripts/rebuild-context.ts <workspace_id>");
    process.exit(1);
  }
  console.log(`[rebuild] starting build for workspace_id=${wsId}…`);
  const { buildWorkspaceContext } = await import("@/lib/context/orchestrator");
  const t0 = Date.now();
  try {
    await buildWorkspaceContext(wsId);
    console.log(`[rebuild] DONE in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  } catch (err) {
    console.error(`[rebuild] FAILED:`, err);
    process.exit(1);
  }
}

main();

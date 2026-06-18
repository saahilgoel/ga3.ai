import fs from "node:fs";
const envPath = `${process.cwd()}/.env.local`;
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/);
    if (m && !process.env[m[1]]) {
      process.env[m[1]] = m[2].replace(/^"(.*)"$/, "$1");
    }
  }
}

import { getWorkspaceById } from "../lib/db";
import { resolveWorkspaceWithTokens } from "../lib/workspace";
import { runReport } from "../lib/ga4";
import { classifyChannel, isPaidChannel } from "../lib/channel-grouping";

const wsId = Number(process.argv[2] || 40);

async function main() {
  const ws = getWorkspaceById(wsId);
  if (!ws) throw new Error("workspace not found");
  const wt = await resolveWorkspaceWithTokens(ws);
  const first = wt.properties[0];
  console.log(`workspace ${ws.id} "${ws.name}" → ${first.property.ga4_property_id}`);
  console.log("");
  const range = { start: "7daysAgo", end: "yesterday" };
  let raw;
  try {
    raw = await runReport(first.accessToken, first.property.ga4_property_id, {
      dimensions: ["sessionSource", "sessionMedium", "sessionCampaignName"],
      metrics: ["sessions", "keyEvents", "engagementRate", "bounceRate"],
      startDate: range.start,
      endDate: range.end,
      limit: 500,
    });
  } catch (e) {
    console.log("keyEvents failed, fallback to conversions:", (e as Error).message);
    raw = await runReport(first.accessToken, first.property.ga4_property_id, {
      dimensions: ["sessionSource", "sessionMedium", "sessionCampaignName"],
      metrics: ["sessions", "conversions", "engagementRate", "bounceRate"],
      startDate: range.start,
      endDate: range.end,
      limit: 500,
    });
  }
  console.log(`rows: ${raw.rows.length}`);

  const buckets = new Map<string, { sessions: number; conv: number; paid: boolean }>();
  for (const r of raw.rows) {
    const group = classifyChannel({
      source: r.dimensions.sessionSource,
      medium: r.dimensions.sessionMedium,
      campaign: r.dimensions.sessionCampaignName,
    });
    const b = buckets.get(group) ?? { sessions: 0, conv: 0, paid: isPaidChannel(group) };
    b.sessions += Number(r.metrics.sessions || 0);
    b.conv += Number(r.metrics.keyEvents || r.metrics.conversions || 0);
    buckets.set(group, b);
  }
  console.log("\nChannel buckets:");
  const sorted = [...buckets.entries()].sort((a, b) => b[1].sessions - a[1].sessions);
  for (const [k, v] of sorted) {
    console.log(`  ${k.padEnd(22)} sessions=${v.sessions.toLocaleString("en-IN").padStart(12)} keyEvents=${v.conv.toLocaleString("en-IN").padStart(10)}  paid=${v.paid}`);
  }
  const paidCount = sorted.filter(([_, v]) => v.paid).length;
  console.log(`\n${paidCount} paid channel groups identified.`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });

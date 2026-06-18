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
import {
  buildDashboard,
  computeComparison,
  resolvePreset,
} from "../lib/dashboard";

const wsId = Number(process.argv[2] || 40);

async function main() {
  const ws = getWorkspaceById(wsId);
  if (!ws) {
    console.error(`workspace ${wsId} not found`);
    process.exit(1);
  }
  const wt = await resolveWorkspaceWithTokens(ws);
  console.log(`workspace ${ws.id} "${ws.name}" → ${wt.properties[0].property.ga4_property_id}`);
  const range = resolvePreset("last_7_days");
  const compareRange = computeComparison(range, "previous_period");
  console.log(`range: ${range.start} → ${range.end}`);
  console.log(`compare: ${compareRange?.start} → ${compareRange?.end}`);
  console.log("");
  const t0 = Date.now();
  const data = await buildDashboard({
    active: wt.properties,
    range,
    compareRange,
    rangePresetLabel: "last_7_days",
  });
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`built in ${elapsed}s`);
  console.log("");
  console.log("realtime:", data.realtime);
  console.log("kpi.sessions:", {
    current: data.kpi.sessions.current,
    prior: data.kpi.sessions.prior,
    delta_pct: data.kpi.sessions.delta_pct,
    sparkline_len: data.kpi.sessions.sparkline.length,
  });
  console.log("kpi.users:", {
    current: data.kpi.users.current,
    delta_pct: data.kpi.users.delta_pct,
  });
  console.log("kpi.engagement:", {
    current: data.kpi.engagement_rate.current,
    delta_pct: data.kpi.engagement_rate.delta_pct,
  });
  console.log("kpi.conversions:", {
    current: data.kpi.conversions.current,
    delta_pct: data.kpi.conversions.delta_pct,
  });
  console.log("traffic_over_time:", {
    granularity: data.traffic_over_time.granularity,
    points: data.traffic_over_time.series.length,
    first: data.traffic_over_time.series[0],
    last: data.traffic_over_time.series.at(-1),
  });
  console.log("top_channels (first 3):", data.top_channels.slice(0, 3));
  console.log("top_landing_pages (first 3):", data.top_landing_pages.slice(0, 3));
  console.log("top_geography:", {
    granularity: data.top_geography.granularity,
    rows: data.top_geography.rows.slice(0, 3),
  });
  console.log("device_mix:", data.device_mix);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("FAIL:", err);
    process.exit(1);
  });

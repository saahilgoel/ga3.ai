// Smoke-tests the GA4 data pulls behind each new brief against a real workspace.
// Skips the LLM-interpretation step; verifies dims/metrics resolve and rows come back.
// Run: npx tsx scripts/verify-briefs.ts <workspace_id>

import fs from "node:fs";
// Load .env.local manually (no dotenv dep in this project).
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
import { runReport, runFunnelReport } from "../lib/ga4";

const wsId = Number(process.argv[2] || 40);

async function main() {
  const ws = getWorkspaceById(wsId);
  if (!ws) {
    console.error(`workspace ${wsId} not found`);
    process.exit(1);
  }
  const wt = await resolveWorkspaceWithTokens(ws);
  if (wt.properties.length === 0) {
    console.error("no properties on workspace");
    process.exit(1);
  }
  const first = wt.properties[0];
  console.log(`workspace ${ws.id} "${ws.name}" → ${first.property.ga4_property_id}`);
  console.log("");

  const range = { startDate: "7daysAgo", endDate: "today" };

  await check("channel_mix_health: source/medium/campaign × sessions+keyEvents", async () => {
    const r = await runReport(first.accessToken, first.property.ga4_property_id, {
      dimensions: ["sessionSource", "sessionMedium", "sessionCampaignName"],
      metrics: ["sessions", "keyEvents"],
      ...range,
      limit: 50,
    });
    return { rows: r.rows.length, sample: r.rows[0] };
  });

  await check("funnel_health: eventName probe", async () => {
    const r = await runReport(first.accessToken, first.property.ga4_property_id, {
      dimensions: ["eventName"],
      metrics: ["eventCount"],
      ...range,
      limit: 50,
    });
    return {
      rows: r.rows.length,
      events: r.rows.slice(0, 6).map((x) => x.dimensions.eventName),
    };
  });

  await check("funnel_health: runFunnelReport (page_view → session_start)", async () => {
    const r = await runFunnelReport(first.accessToken, first.property.ga4_property_id, {
      steps: [
        { name: "Session start", eventName: "session_start" },
        { name: "Page view", eventName: "page_view" },
      ],
      ...range,
    });
    return { steps: r.steps };
  });

  await check("attribution_comparison: firstUserDefaultChannelGroup × sessions+keyEvents", async () => {
    const r = await runReport(first.accessToken, first.property.ga4_property_id, {
      dimensions: ["firstUserDefaultChannelGroup"],
      metrics: ["sessions", "keyEvents", "totalRevenue"],
      ...range,
      limit: 25,
    });
    return { rows: r.rows.length, sample: r.rows[0] };
  });

  await check("attribution_comparison: sessionDefaultChannelGroup × sessions+keyEvents", async () => {
    const r = await runReport(first.accessToken, first.property.ga4_property_id, {
      dimensions: ["sessionDefaultChannelGroup"],
      metrics: ["sessions", "keyEvents", "totalRevenue"],
      ...range,
      limit: 25,
    });
    return { rows: r.rows.length, sample: r.rows[0] };
  });

  await check("landing_page_health: landingPagePlusQueryString × keyEvents", async () => {
    const r = await runReport(first.accessToken, first.property.ga4_property_id, {
      dimensions: ["landingPagePlusQueryString"],
      metrics: ["sessions", "engagementRate", "bounceRate", "keyEvents"],
      ...range,
      limit: 25,
    });
    return { rows: r.rows.length, sample: r.rows[0] };
  });

  await check("cohort_retention: 4 weekly cohorts × cohortNthWeek × cohortActiveUsers", async () => {
    const today = new Date();
    function fmt(d: Date) {
      return d.toISOString().slice(0, 10);
    }
    const cohorts = [];
    for (let i = 3; i >= 0; i--) {
      const start = new Date(today);
      start.setDate(start.getDate() - (i + 1) * 7);
      const end = new Date(start);
      end.setDate(end.getDate() + 6);
      cohorts.push({
        name: `wk${3 - i}`,
        dimension: "firstSessionDate",
        dateRange: { startDate: fmt(start), endDate: fmt(end) },
      });
    }
    const body = {
      cohortSpec: {
        cohorts,
        cohortsRange: { granularity: "WEEKLY", startOffset: 0, endOffset: 3 },
      },
      dimensions: [{ name: "cohort" }, { name: "cohortNthWeek" }],
      metrics: [{ name: "cohortActiveUsers" }],
    };
    const res = await fetch(
      `https://analyticsdata.googleapis.com/v1beta/${first.property.ga4_property_id}:runReport`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${first.accessToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify(body),
      }
    );
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
    }
    const data = (await res.json()) as { rows?: unknown[] };
    return { rows: data.rows?.length ?? 0 };
  });
}

async function check(label: string, fn: () => Promise<unknown>) {
  process.stdout.write(`  ${label} ... `);
  try {
    const out = await fn();
    console.log("OK");
    console.log("    ", JSON.stringify(out, null, 2).split("\n").join("\n     "));
  } catch (err) {
    console.log("FAIL");
    console.log("    ", (err as Error).message);
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });

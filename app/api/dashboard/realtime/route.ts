import { NextResponse } from "next/server";
import { getSession, readUserIds } from "@/lib/session";
import { resolveActiveWorkspace, resolveWorkspaceWithTokens } from "@/lib/workspace";
import { runRealtime, runReport } from "@/lib/ga4";

export async function GET() {
  const session = await getSession();
  const userIds = readUserIds(session);
  if (userIds.length === 0) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }
  const ws = resolveActiveWorkspace(session);
  if (!ws) {
    return NextResponse.json({ error: "no_active_workspace" }, { status: 400 });
  }
  const wt = await resolveWorkspaceWithTokens(ws);
  if (wt.properties.length === 0) {
    return NextResponse.json({ error: "no_properties" }, { status: 400 });
  }
  const p = wt.properties[0];
  try {
    const safe = async <T>(fn: () => Promise<T>, fallback: T): Promise<T> => {
      try {
        return await fn();
      } catch {
        return fallback;
      }
    };

    const [total, cities, pages, devices, countries, hourly] = await Promise.all([
      runRealtime(p.accessToken, p.property.ga4_property_id, {
        dimensions: [],
        metrics: ["activeUsers"],
        limit: 1,
      }),
      safe(
        () =>
          runRealtime(p.accessToken, p.property.ga4_property_id, {
            dimensions: ["city", "country"],
            metrics: ["activeUsers"],
            limit: 30,
          }),
        {
          rows: [],
          dimensionHeaders: [],
          metricHeaders: [],
          rowCount: 0,
        } as Awaited<ReturnType<typeof runRealtime>>
      ),
      safe(
        () =>
          runRealtime(p.accessToken, p.property.ga4_property_id, {
            dimensions: ["unifiedScreenName"],
            metrics: ["screenPageViews"],
            limit: 12,
          }),
        {
          rows: [],
          dimensionHeaders: [],
          metricHeaders: [],
          rowCount: 0,
        } as Awaited<ReturnType<typeof runRealtime>>
      ),
      safe(
        () =>
          runRealtime(p.accessToken, p.property.ga4_property_id, {
            dimensions: ["deviceCategory"],
            metrics: ["activeUsers"],
            limit: 8,
          }),
        {
          rows: [],
          dimensionHeaders: [],
          metricHeaders: [],
          rowCount: 0,
        } as Awaited<ReturnType<typeof runRealtime>>
      ),
      safe(
        () =>
          runRealtime(p.accessToken, p.property.ga4_property_id, {
            dimensions: ["country"],
            metrics: ["activeUsers"],
            limit: 12,
          }),
        {
          rows: [],
          dimensionHeaders: [],
          metricHeaders: [],
          rowCount: 0,
        } as Awaited<ReturnType<typeof runRealtime>>
      ),
      safe(
        () =>
          runReport(p.accessToken, p.property.ga4_property_id, {
            dimensions: ["dateHour"],
            metrics: ["activeUsers"],
            startDate: "1daysAgo",
            endDate: "today",
            limit: 48,
          }),
        {
          rows: [],
          dimensionHeaders: [],
          metricHeaders: [],
          rowCount: 0,
        } as Awaited<ReturnType<typeof runRealtime>>
      ),
    ]);

    const active_users = Number(total.rows[0]?.metrics.activeUsers || 0);
    const vals = hourly.rows.map((r) => Number(r.metrics.activeUsers || 0));
    const hourly_avg =
      vals.length > 0 ? Math.round(vals.reduce((s, v) => s + v, 0) / vals.length) : 0;

    return NextResponse.json(
      {
        active_users,
        hourly_avg,
        top_cities: cities.rows
          .map((r) => ({
            city: r.dimensions.city || "(unknown)",
            country: r.dimensions.country || "",
            users: Number(r.metrics.activeUsers || 0),
          }))
          .filter((c) => c.city !== "(not set)" && c.users > 0)
          .slice(0, 20),
        top_countries: countries.rows
          .map((r) => ({
            country: r.dimensions.country || "(unknown)",
            users: Number(r.metrics.activeUsers || 0),
          }))
          .filter((c) => c.country && c.country !== "(not set)" && c.users > 0)
          .slice(0, 10),
        top_pages: pages.rows
          .map((r) => ({
            path: r.dimensions.unifiedScreenName || "(unknown)",
            views: Number(r.metrics.screenPageViews || 0),
          }))
          .filter((pg) => pg.views > 0)
          .slice(0, 10),
        device_mix: devices.rows
          .map((r) => ({
            device: r.dimensions.deviceCategory || "unknown",
            users: Number(r.metrics.activeUsers || 0),
          }))
          .filter((d) => d.users > 0),
        hourly_series: vals,
      },
      {
        headers: {
          "Cache-Control": "private, max-age=10, stale-while-revalidate=30",
        },
      }
    );
  } catch (err) {
    return NextResponse.json(
      { error: "realtime_failed", detail: (err as Error).message },
      { status: 500 }
    );
  }
}

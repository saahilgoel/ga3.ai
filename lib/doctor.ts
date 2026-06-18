import { runReport } from "./ga4";

export type DoctorHost = {
  host: string;
  events: number;
  pct: number;
};

export type DoctorSource = {
  source_medium: string;
  sessions: number;
  pct: number;
};

export type DoctorReport = {
  // canonical numbers
  total_events_28d: number;
  total_users_28d: number;
  total_sessions_28d: number;
  // identity
  declared_host: string | null;       // host extracted from properties.website_url
  dominant_host: string | null;       // top host by event count
  dominant_host_pct: number;          // 0..100
  // distribution
  top_hosts: DoctorHost[];
  top_sources: DoctorSource[];
  // verdicts
  activity_score: number;             // 0..100 (log scale of events)
  is_active: boolean;                 // events_28d > 0
  host_mismatch: boolean;             // dominant_host domain != declared_host domain
  warnings: string[];
  generated_at: number;               // unix seconds
  ga4_property_id: string;
  error?: string;                     // populated if the run failed
};

const RANGE = { startDate: "28daysAgo", endDate: "yesterday" };

export async function runPropertyDoctor(args: {
  ga4_property_id: string;
  access_token: string;
  declared_website_url: string | null;
}): Promise<DoctorReport> {
  const declared_host = normalizeHost(args.declared_website_url);
  const now = Math.floor(Date.now() / 1000);

  try {
    const [totalsRes, hostsRes, sourcesRes] = await Promise.all([
      runReport(args.access_token, args.ga4_property_id, {
        dimensions: [],
        metrics: ["eventCount", "activeUsers", "sessions"],
        startDate: RANGE.startDate,
        endDate: RANGE.endDate,
        limit: 1,
      }),
      runReport(args.access_token, args.ga4_property_id, {
        dimensions: ["hostName"],
        metrics: ["eventCount"],
        startDate: RANGE.startDate,
        endDate: RANGE.endDate,
        limit: 10,
        orderBy: { metric: "eventCount", desc: true },
      }),
      runReport(args.access_token, args.ga4_property_id, {
        dimensions: ["sessionSource", "sessionMedium"],
        metrics: ["sessions"],
        startDate: RANGE.startDate,
        endDate: RANGE.endDate,
        limit: 10,
        orderBy: { metric: "sessions", desc: true },
      }),
    ]);

    const totalsRow = totalsRes.rows[0];
    const total_events_28d = Number(totalsRow?.metrics.eventCount ?? 0);
    const total_users_28d = Number(totalsRow?.metrics.activeUsers ?? 0);
    const total_sessions_28d = Number(totalsRow?.metrics.sessions ?? 0);

    const top_hosts: DoctorHost[] = hostsRes.rows.map((r) => ({
      host: (r.dimensions.hostName || "(not set)").toLowerCase(),
      events: Number(r.metrics.eventCount ?? 0),
      pct: 0,
    }));
    const hostTotal = top_hosts.reduce((sum, h) => sum + h.events, 0) || 1;
    top_hosts.forEach((h) => {
      h.pct = Math.round((h.events / hostTotal) * 1000) / 10;
    });

    const top_sources: DoctorSource[] = sourcesRes.rows.map((r) => {
      const src = r.dimensions.sessionSource || "(none)";
      const med = r.dimensions.sessionMedium || "(none)";
      return {
        source_medium: `${src} / ${med}`,
        sessions: Number(r.metrics.sessions ?? 0),
        pct: 0,
      };
    });
    const srcTotal = top_sources.reduce((sum, s) => sum + s.sessions, 0) || 1;
    top_sources.forEach((s) => {
      s.pct = Math.round((s.sessions / srcTotal) * 1000) / 10;
    });

    const dominant_host = top_hosts[0]?.host ?? null;
    const dominant_host_pct = top_hosts[0]?.pct ?? 0;

    const host_mismatch =
      !!declared_host &&
      !!dominant_host &&
      !hostsMatch(declared_host, dominant_host) &&
      dominant_host_pct >= 50;

    const warnings: string[] = [];
    if (host_mismatch) {
      warnings.push(
        `${dominant_host_pct}% of events come from ${dominant_host}, but property is declared for ${declared_host}.`
      );
    }
    if (top_hosts.length > 1) {
      const declaredShare = declared_host
        ? top_hosts
            .filter((h) => hostsMatch(declared_host, h.host))
            .reduce((sum, h) => sum + h.pct, 0)
        : 0;
      if (declared_host && declaredShare > 0 && declaredShare < 50) {
        warnings.push(
          `Only ${declaredShare.toFixed(1)}% of events are from ${declared_host}; the rest spread across ${top_hosts.length - 1} other hosts.`
        );
      }
    }
    if (total_events_28d === 0) {
      warnings.push("No events recorded in the last 28 days. Property may be inactive or misconfigured.");
    }

    return {
      total_events_28d,
      total_users_28d,
      total_sessions_28d,
      declared_host,
      dominant_host,
      dominant_host_pct,
      top_hosts,
      top_sources,
      activity_score: scoreActivity(total_events_28d),
      is_active: total_events_28d > 0,
      host_mismatch,
      warnings,
      generated_at: now,
      ga4_property_id: args.ga4_property_id,
    };
  } catch (err) {
    return {
      total_events_28d: 0,
      total_users_28d: 0,
      total_sessions_28d: 0,
      declared_host,
      dominant_host: null,
      dominant_host_pct: 0,
      top_hosts: [],
      top_sources: [],
      activity_score: 0,
      is_active: false,
      host_mismatch: false,
      warnings: [`Doctor failed: ${(err as Error).message}`],
      generated_at: now,
      ga4_property_id: args.ga4_property_id,
      error: (err as Error).message,
    };
  }
}

export function normalizeHost(input: string | null | undefined): string | null {
  if (!input) return null;
  try {
    const u = input.startsWith("http") ? new URL(input) : new URL(`https://${input}`);
    return u.host.toLowerCase().replace(/^www\./, "");
  } catch {
    return input.toLowerCase().replace(/^www\./, "").replace(/\/.*$/, "");
  }
}

export function hostsMatch(a: string, b: string): boolean {
  const na = a.toLowerCase().replace(/^www\./, "");
  const nb = b.toLowerCase().replace(/^www\./, "");
  if (na === nb) return true;
  // allow subdomain match (e.g. app.example.com vs example.com)
  const baseA = na.split(".").slice(-2).join(".");
  const baseB = nb.split(".").slice(-2).join(".");
  return baseA === baseB;
}

// 0 events → 0, 100 → ~30, 1k → ~50, 10k → ~70, 100k → ~85, 1M+ → 100
function scoreActivity(events: number): number {
  if (events <= 0) return 0;
  const score = Math.min(100, Math.round(Math.log10(events + 1) * 16.7));
  return score;
}

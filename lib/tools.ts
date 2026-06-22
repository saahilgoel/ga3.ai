import { tool } from "ai";
import { z } from "zod";
import {
  runReport,
  runRealtime,
  getMetadata,
  runFunnelReport,
  type RunReportArgs,
} from "./ga4";
import type { PropertyWithToken } from "./properties";
import { vizSchema } from "./viz";
import { queryContext } from "./context/query";
import { listCompetitors } from "./context/competitors-db";
import { listCompetitorAds } from "./context/ad-library";
import { getContextStatus } from "./context/db-helpers";

const SOURCE_TYPES = [
  "website",
  "serp",
  "news",
  "review_trustpilot",
  "review_google_maps",
  "review_indeed",
  "linkedin_company",
  "linkedin_post",
  "twitter_post",
  "ai_overview",
  "ai_mode",
  "ai_chatgpt",
  "trends_summary",
  "user_upload",
  "catalog_shopify",
] as const;

const COMPETITOR_SOURCE_TYPES = [
  "competitor_website",
  "competitor_serp",
  "competitor_news",
] as const;

// Added to SOURCE_TYPES below — catalog_shopify is workspace-scoped not
// competitor-scoped (competitor catalogs are filtered via competitor_id).

const INDUSTRY_SOURCE_TYPES = ["industry_news", "industry_reddit"] as const;

// Below this prior-period base (count of sessions/users/events), a percentage
// change is statistical noise (e.g. 4 -> 34 = "+750%"). compare_periods flags
// it so the scan reports absolute counts + low confidence instead of drama.
const MIN_BASE = Number(process.env.SCAN_MIN_BASE || 50);

export function makeGa4Tools(active: PropertyWithToken[], workspaceId?: number) {
  if (active.length === 0) {
    throw new Error("makeGa4Tools requires at least one active property");
  }
  const first = active[0];
  const isUnion = active.length > 1;

  return {
    run_report: tool({
      description: isUnion
        ? `Run a GA4 report and SUM metrics across ${active.length} active properties (union mode). Use this for anything about sessions, users, page views, events, conversions, traffic sources, devices, countries, landing pages, etc. Each property is queried in parallel with the same args and the results are merged by dimension key. If you need a per-property breakdown, call run_per_property_report instead.`
        : "Run a GA4 report. Use this for anything about sessions, users, page views, events, conversions, traffic sources, devices, countries, landing pages, etc. Combine multiple dimensions and metrics in one call when relevant.",
      inputSchema: runReportShape().describe("GA4 report query"),
      execute: async (args) => {
        try {
          if (!isUnion) {
            return await runReport(first.accessToken, first.property.ga4_property_id, args);
          }
          const results = await Promise.all(
            active.map((a) =>
              runReport(a.accessToken, a.property.ga4_property_id, args).catch((err) => ({
                __error: errMsg(err),
                __property: a.property.display_name,
                rows: [] as Array<{ dimensions: Record<string, string>; metrics: Record<string, string> }>,
              }))
            )
          );
          return mergeReports(results, args);
        } catch (err) {
          return { error: errMsg(err) };
        }
      },
    }),

    compare_periods: tool({
      description:
        "Compare a metric between two time windows in ONE call. ALWAYS use this for week-over-week / period-over-period analysis instead of two run_report calls — it returns each value pre-labelled as `current` vs `previous` with the change and percent computed for you, so the direction is never ambiguous. Defaults compare the last 7 days vs the prior 7 days. Optionally break down by dimensions (e.g. sessionDefaultChannelGroup, deviceCategory).",
      inputSchema: z.object({
        metrics: z
          .array(z.string())
          .describe('GA4 metric API names, e.g. ["sessions","conversions","totalRevenue"]'),
        dimensions: z
          .array(z.string())
          .optional()
          .default([])
          .describe('Optional breakdown, e.g. ["sessionDefaultChannelGroup"]. Empty = totals only.'),
        currentStartDate: z.string().optional().default("7daysAgo"),
        currentEndDate: z.string().optional().default("today"),
        previousStartDate: z.string().optional().default("14daysAgo"),
        previousEndDate: z.string().optional().default("7daysAgo"),
        limit: z.number().int().positive().max(200).optional().default(25),
        orderBy: z
          .object({ metric: z.string(), desc: z.boolean() })
          .optional()
          .describe("Sort rows by a metric's CURRENT value."),
      }),
      execute: async (input) => {
        try {
          const curArgs: RunReportArgs = {
            dimensions: input.dimensions,
            metrics: input.metrics,
            startDate: input.currentStartDate,
            endDate: input.currentEndDate,
            limit: 500,
            orderBy: input.orderBy,
          };
          const prevArgs: RunReportArgs = {
            ...curArgs,
            startDate: input.previousStartDate,
            endDate: input.previousEndDate,
          };
          const run = (a: PropertyWithToken, q: RunReportArgs) =>
            runReport(a.accessToken, a.property.ga4_property_id, q).catch((err) => ({
              __error: errMsg(err),
              __property: a.property.display_name,
              rows: [] as ShapedReport["rows"],
            }));
          const [curResults, prevResults] = await Promise.all([
            Promise.all(active.map((a) => run(a, curArgs))),
            Promise.all(active.map((a) => run(a, prevArgs))),
          ]);
          const cur = mergeReports(curResults, curArgs);
          const prev = mergeReports(prevResults, prevArgs);

          const keyOf = (row: { dimensions: Record<string, string> }) =>
            input.dimensions.map((d) => row.dimensions[d] ?? "").join("|");
          const num = (v: string | undefined) => {
            const n = parseFloat(v ?? "0");
            return Number.isFinite(n) ? n : 0;
          };
          const compMetrics = (
            c: Record<string, string>,
            p: Record<string, string> | undefined
          ) => {
            const out: Record<
              string,
              {
                current: number;
                previous: number;
                change: number;
                pct: number | null;
                low_base: boolean;
              }
            > = {};
            for (const m of input.metrics) {
              const current = num(c[m]);
              const previous = num(p?.[m]);
              const change = current - previous;
              // A % is only meaningful when both windows have enough volume. Below
              // the floor we return pct: null so the model literally cannot
              // headline a noise figure like "+1,000%" off a base of 3.
              const low_base = Math.min(current, previous) < MIN_BASE;
              out[m] = {
                current,
                previous,
                change,
                pct:
                  !low_base && previous !== 0
                    ? Math.round((change / previous) * 1000) / 10
                    : null,
                low_base,
              };
            }
            return out;
          };

          const prevByKey = new Map(prev.rows.map((r) => [keyOf(r), r]));
          const seen = new Set<string>();
          type CompRow = {
            dimensions: Record<string, string>;
            metrics: ReturnType<typeof compMetrics>;
          };
          const rows: CompRow[] = [];
          for (const r of cur.rows) {
            const k = keyOf(r);
            seen.add(k);
            rows.push({ dimensions: r.dimensions, metrics: compMetrics(r.metrics, prevByKey.get(k)?.metrics) });
          }
          for (const r of prev.rows) {
            const k = keyOf(r);
            if (seen.has(k)) continue;
            rows.push({ dimensions: r.dimensions, metrics: compMetrics({}, r.metrics) });
          }

          // Totals across all rows (the headline week-over-week delta), computed
          // in code so the model never has to do the arithmetic.
          const totals: ReturnType<typeof compMetrics> = {};
          for (const m of input.metrics) {
            const current = rows.reduce((s, r) => s + r.metrics[m].current, 0);
            const previous = rows.reduce((s, r) => s + r.metrics[m].previous, 0);
            const change = current - previous;
            const low_base = Math.min(current, previous) < MIN_BASE;
            totals[m] = {
              current,
              previous,
              change,
              pct:
                !low_base && previous !== 0
                  ? Math.round((change / previous) * 1000) / 10
                  : null,
              low_base,
            };
          }

          const sortMetric = input.orderBy?.metric ?? input.metrics[0];
          rows.sort((a, b) => (b.metrics[sortMetric]?.current ?? 0) - (a.metrics[sortMetric]?.current ?? 0));

          return {
            current_range: { startDate: input.currentStartDate, endDate: input.currentEndDate },
            previous_range: { startDate: input.previousStartDate, endDate: input.previousEndDate },
            metrics: input.metrics,
            dimensions: input.dimensions,
            totals,
            rows: rows.slice(0, input.limit),
            note: `Each value is pre-computed: current vs previous, change = current - previous, pct = percent change. Report these directly; do not recompute or re-derive the period. When "low_base" is true the window is below ${MIN_BASE} and pct is deliberately null — the percentage would be noise. Report ONLY the absolute counts (e.g. "33 sessions, up from 3"); never compute or state a percentage for a low_base metric.`,
          };
        } catch (err) {
          return { error: errMsg(err) };
        }
      },
    }),

    run_per_property_report: tool({
      description:
        "Same as run_report but returns one row group per property with a synthetic `_property` dimension. Use this when the user wants to compare properties side-by-side, or when union sums would hide scale differences.",
      inputSchema: runReportShape(),
      execute: async (args) => {
        try {
          const results = await Promise.all(
            active.map(async (a) => {
              try {
                const r = await runReport(a.accessToken, a.property.ga4_property_id, args);
                return { property: a.property.display_name, report: r };
              } catch (err) {
                return {
                  property: a.property.display_name,
                  error: errMsg(err),
                };
              }
            })
          );
          // Flatten to a single shaped report with _property as first dimension.
          const rows: Array<{ dimensions: Record<string, string>; metrics: Record<string, string> }> = [];
          const dimensionHeaders: string[] = ["_property", ...args.dimensions];
          let metricHeaders: Array<{ name?: string | null; type?: string | null }> = [];
          for (const r of results) {
            if (!("report" in r) || !r.report) continue;
            metricHeaders = r.report.metricHeaders;
            for (const row of r.report.rows) {
              rows.push({
                dimensions: { _property: r.property, ...row.dimensions },
                metrics: row.metrics,
              });
            }
          }
          return {
            dimensionHeaders,
            metricHeaders,
            rows,
            rowCount: rows.length,
            per_property_errors: results
              .filter((r) => "error" in r)
              .map((r) => ({ property: r.property, error: (r as { error: string }).error })),
          };
        } catch (err) {
          return { error: errMsg(err) };
        }
      },
    }),

    get_metadata: tool({
      description:
        "Get the full list of available dimension and metric names with descriptions. Call this if a previous report failed with an invalid dimension/metric, or if the user asks about something you're not sure how to query.",
      inputSchema: z.object({}),
      execute: async () => {
        try {
          return await getMetadata(first.accessToken, first.property.ga4_property_id);
        } catch (err) {
          return { error: errMsg(err) };
        }
      },
    }),

    run_realtime: tool({
      description:
        "Get active users in the last 30 minutes. Use only for explicitly real-time questions ('who's on the site right now'). When in union mode this still queries only the first active property.",
      inputSchema: z.object({
        dimensions: z.array(z.string()),
        metrics: z.array(z.string()),
        limit: z.number().int().positive().max(500).optional().default(25),
      }),
      execute: async (args) => {
        try {
          return await runRealtime(first.accessToken, first.property.ga4_property_id, args);
        } catch (err) {
          return { error: errMsg(err) };
        }
      },
    }),

    run_funnel_report: tool({
      description: `Run a GA4 funnel report. Use this when the user asks about a multi-step conversion flow ("view → add to cart → checkout → purchase", "signup → activation", "lead → MQL → SQL"). Each step is an event name; the API returns the active-user count per step and the next-step rate (= step N+1 users / step N users).

For ecommerce default to: view_item → add_to_cart → begin_checkout → purchase
For B2B / lead-gen default to: page_view → form_start → form_submit → generate_lead
For content / app: session_start → page_view → engaged_session

If you don't know which events fire, call get_metadata or get_product_usage first.`,
      inputSchema: z.object({
        steps: z
          .array(
            z.object({
              name: z.string().describe("Display label for the step"),
              eventName: z.string().describe("GA4 event name that defines this step"),
            })
          )
          .min(2)
          .max(10)
          .describe("Funnel steps in order. 2-10 steps."),
        startDate: z.string().describe("e.g. '28daysAgo'"),
        endDate: z.string().describe("e.g. 'yesterday' or 'today'"),
        breakdownDimension: z
          .string()
          .optional()
          .describe(
            "Optional dimension to break the funnel down by (e.g. 'deviceCategory', 'sessionDefaultChannelGroup')."
          ),
      }),
      execute: async (args) => {
        try {
          if (!isUnion) {
            return await runFunnelReport(first.accessToken, first.property.ga4_property_id, args);
          }
          // Union: sum activeUsers per step across properties; ignore breakdown.
          const all = await Promise.all(
            active.map((a) =>
              runFunnelReport(a.accessToken, a.property.ga4_property_id, {
                steps: args.steps,
                startDate: args.startDate,
                endDate: args.endDate,
              }).catch((err) => ({
                __error: errMsg(err),
                steps: [] as Array<{ name: string; active_users: number; next_step_rate: number }>,
                rows: [],
              }))
            )
          );
          const merged = new Map<
            string,
            { name: string; active_users: number; next_step_rate_weighted: number; weight: number }
          >();
          for (const r of all) {
            for (const s of r.steps) {
              const cur =
                merged.get(s.name) ?? {
                  name: s.name,
                  active_users: 0,
                  next_step_rate_weighted: 0,
                  weight: 0,
                };
              cur.active_users += s.active_users;
              cur.next_step_rate_weighted += (s.next_step_rate || 0) * s.active_users;
              cur.weight += s.active_users;
              merged.set(s.name, cur);
            }
          }
          const stepOrder = args.steps.map((s) => s.name);
          const steps = stepOrder
            .map((n) => merged.get(n))
            .filter((x): x is NonNullable<typeof x> => !!x)
            .map((m) => ({
              name: m.name,
              active_users: m.active_users,
              next_step_rate: m.weight > 0 ? m.next_step_rate_weighted / m.weight : 0,
            }));
          return { steps, rows: [] };
        } catch (err) {
          return { error: errMsg(err) };
        }
      },
    }),

    query_context: tool({
      description: `Query the workspace's customer intelligence — a RAG of crawled brand content including the company's own website, news mentions, brand SERP results, customer reviews (Trustpilot / Google Maps / Indeed), LinkedIn company posts, Twitter brand mentions, Google AI Overview, and any user-uploaded markdown/PDF context.

Use this whenever a GA4 finding needs business context to interpret — to form a hypothesis about WHY a number moved, to know what the brand sells, who it competes with, how it's perceived, or whether there's a recent event that correlates with a traffic shift.

DO NOT use this for pure GA4 number lookups (that's run_report).

When you cite context findings in your response, attribute them by source ("Trustpilot reviewer on May 8 mentioned...", "Their LinkedIn post on May 6 announced..."). Don't manufacture context — if results are empty or irrelevant, say so.

Returns: top-k most relevant chunks with source attribution.`,
      inputSchema: z.object({
        query: z
          .string()
          .describe("Natural-language search — what business context are you looking for?"),
        k: z
          .number()
          .int()
          .min(1)
          .max(15)
          .optional()
          .default(5)
          .describe("How many chunks to retrieve (3-10 is the sweet spot)."),
        source_filter: z
          .array(z.enum(SOURCE_TYPES))
          .optional()
          .describe(
            "Restrict to specific source types. Useful: ['review_trustpilot','twitter_post'] for complaints, ['news','linkedin_post'] for recent announcements, ['user_upload'] for the user's own docs."
          ),
      }),
      execute: async (args) => {
        if (!workspaceId) {
          return {
            error:
              "No workspace_id supplied to tools — context unavailable for this conversation.",
            results: [],
          };
        }
        try {
          const hits = await queryContext({
            workspace_id: workspaceId,
            query: args.query,
            k: args.k ?? 5,
            source_filter: args.source_filter,
            own_brand_only: true,
          });
          return {
            query: args.query,
            count: hits.length,
            results: hits.map((h) => ({
              source_type: h.source_type,
              source_url: h.source_url,
              title: h.title,
              content: h.content,
              fetched_at: h.fetched_at,
              metadata: h.metadata,
              relevance: Math.round(h.relevance * 100) / 100,
            })),
          };
        } catch (err) {
          return { error: errMsg(err), results: [] };
        }
      },
    }),

    list_competitors: tool({
      description: `List the competitor brands this workspace has detected and ingested. Returns each competitor's brand name, website, ingest status, and a numeric id you can pass to query_competitors. If empty, no competitors have been detected yet for this workspace.`,
      inputSchema: z.object({}),
      execute: async () => {
        if (!workspaceId) {
          return { competitors: [], error: "no_workspace" };
        }
        const rows = listCompetitors(workspaceId);
        return {
          competitors: rows.map((r) => ({
            id: r.id,
            brand_name: r.brand_name,
            website_url: r.website_url,
            status: r.status,
            reasoning: r.reasoning,
            document_count: r.document_count,
            ingested_at: r.ingested_at,
          })),
        };
      },
    }),

    query_competitors: tool({
      description: `Query the RAG for COMPETITOR brand intelligence — homepages, pricing pages, brand SERP snapshots, and recent news for 2-3 auto-detected competitors of this workspace's brand.

Use this to:
- Compare the user's brand to direct competitors ("how does our pricing stack up?", "what positioning are competitors using?")
- Explain GA4 traffic shifts in competitive context ("competitor X just launched campaign Y — could that be why our paid CPCs jumped?")
- Find market gaps ("what are competitors talking about in news that we aren't?")

Always attribute results: name the competitor and the source. If results are thin, say so — don't manufacture comparisons.

Returns: top-k chunks. Each chunk includes a 'competitor_id' so you can identify which competitor it came from. Call list_competitors first if you want to know the available competitors.`,
      inputSchema: z.object({
        query: z
          .string()
          .describe("Natural-language question — what competitive intel are you looking for?"),
        k: z.number().int().min(1).max(15).optional().default(6),
        competitor_ids: z
          .array(z.number().int())
          .optional()
          .describe(
            "Restrict to specific competitor ids (from list_competitors). Omit to search all competitors."
          ),
        source_filter: z
          .array(z.enum(COMPETITOR_SOURCE_TYPES))
          .optional()
          .describe(
            "Restrict to specific competitor source types. 'competitor_website' = their site pages, 'competitor_serp' = how they show up in Google, 'competitor_news' = recent news mentions."
          ),
      }),
      execute: async (args) => {
        if (!workspaceId) {
          return { error: "no_workspace", results: [] };
        }
        try {
          let ids = args.competitor_ids;
          if (!ids || ids.length === 0) {
            ids = listCompetitors(workspaceId).map((c) => c.id);
          }
          if (ids.length === 0) {
            return {
              query: args.query,
              count: 0,
              results: [],
              note: "No competitors have been detected for this workspace yet. The system may still be analysing.",
            };
          }
          const hits = await queryContext({
            workspace_id: workspaceId,
            query: args.query,
            k: args.k ?? 6,
            source_filter: args.source_filter as string[] | undefined,
            competitor_ids: ids,
          });
          return {
            query: args.query,
            count: hits.length,
            results: hits.map((h) => ({
              competitor_id: h.competitor_id,
              source_type: h.source_type,
              source_url: h.source_url,
              title: h.title,
              content: h.content,
              fetched_at: h.fetched_at,
              relevance: Math.round(h.relevance * 100) / 100,
            })),
          };
        } catch (err) {
          return { error: errMsg(err), results: [] };
        }
      },
    }),

    query_industry: tool({
      description: `Query the workspace's industry / category signal feed — recent news + Reddit discussions about the broader market the merchant operates in (not their own brand). Auto-refreshed daily.

Use this for:
- Macro context for a GA4 shift ("why are conversions softening? is the whole category soft?")
- Regulatory / category-wide events ("new BIS rule on hair oil labels", "Diwali bump postponed")
- Funding / M&A in the space the merchant competes in
- Search-trend or sentiment movement across the category

Attribute sources inline ("Mint reported on May 12...", "r/IndianBeauty discussion"). Don't manufacture trends — if the feed has nothing relevant say so.`,
      inputSchema: z.object({
        query: z.string().describe("What category-level signal are you looking for?"),
        k: z.number().int().min(1).max(15).optional().default(6),
        source_filter: z
          .array(z.enum(INDUSTRY_SOURCE_TYPES))
          .optional()
          .describe(
            "Restrict to news headlines vs Reddit threads. Default: both."
          ),
      }),
      execute: async (args) => {
        if (!workspaceId) {
          return { error: "no_workspace", results: [] };
        }
        try {
          const status = getContextStatus(workspaceId);
          const hits = await queryContext({
            workspace_id: workspaceId,
            query: args.query,
            k: args.k ?? 6,
            source_filter: (args.source_filter as string[] | undefined) ?? [
              ...INDUSTRY_SOURCE_TYPES,
            ],
          });
          return {
            query: args.query,
            category: status?.industry_category ?? null,
            last_refresh_at: status?.last_industry_refresh_at ?? null,
            count: hits.length,
            results: hits.map((h) => ({
              source_type: h.source_type,
              source_url: h.source_url,
              title: h.title,
              content: h.content,
              fetched_at: h.fetched_at,
              metadata: h.metadata,
              relevance: Math.round(h.relevance * 100) / 100,
            })),
          };
        } catch (err) {
          return { error: errMsg(err), results: [] };
        }
      },
    }),

    list_competitor_ads: tool({
      description: `List recent ads we've captured for the workspace's competitors from Meta Ad Library and Google Ads Transparency Report. Each row includes headline, body, CTA, image URL, landing URL, format (image/video/carousel), and which network it came from.

Use this when the merchant asks about competitor positioning, creative angle, or specific ad campaigns. Cite competitor name + network when referring to an ad. If there are no ads, the competitors may currently be dark on paid channels.`,
      inputSchema: z.object({
        competitor_id: z
          .number()
          .int()
          .optional()
          .describe("Filter to a specific competitor id (from list_competitors). Omit for all."),
        limit: z.number().int().min(1).max(50).optional().default(20),
      }),
      execute: async (args) => {
        if (!workspaceId) {
          return { error: "no_workspace", ads: [] };
        }
        try {
          const ads = listCompetitorAds({
            workspace_id: workspaceId,
            competitor_id: args.competitor_id,
            limit: args.limit ?? 20,
          });
          return { count: ads.length, ads };
        } catch (err) {
          return { error: errMsg(err), ads: [] };
        }
      },
    }),

    serp_gap: tool({
      description: `Check Google SERP ranks for the workspace's domain on specific keywords, and surface competitors ranking above it.

Use this when the merchant asks:
- "What should we rank for that we don't?"
- "Why is our organic traffic down for X?"
- "Who's outranking us on Y?"
- "What's the SERP for our top landing page's keywords?"

Pass an array of keywords (3-8 works best). The tool runs each as a Google search (India by default), finds where the merchant's domain sits in the top 100, and lists every external domain that ranks above it. Free-form keywords are fine.

Returns: per-keyword own_rank + competitors_above + top10 snapshot. Use this to suggest which competitor page structure is winning.`,
      inputSchema: z.object({
        keywords: z
          .array(z.string().min(2))
          .min(1)
          .max(8)
          .describe("3-8 keywords to check. Pick high-intent ones."),
        country: z
          .string()
          .length(2)
          .optional()
          .default("in")
          .describe("ISO country code (2-letter)."),
      }),
      execute: async (args) => {
        const ownHost = (() => {
          const url = active[0].property.website_url;
          if (!url) return null;
          try {
            return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
          } catch {
            return null;
          }
        })();
        if (!ownHost) {
          return {
            error:
              "Can't determine own domain from the workspace properties. Set the website URL in property settings.",
            results: [],
          };
        }
        const sd = await import("./context/scrapingdog");
        const results = await Promise.all(
          args.keywords.map(async (kw) => {
            try {
              const sr = await sd.googleSearch(kw, {
                country: args.country ?? "in",
                results: 50,
              });
              const top = sr.results.map((r) => {
                let host = "";
                try {
                  host = new URL(r.url).hostname.replace(/^www\./, "").toLowerCase();
                } catch {
                  /* skip */
                }
                return { rank: r.position, title: r.title, url: r.url, domain: host };
              });
              const ownEntry = top.find((r) => r.domain === ownHost || r.domain.endsWith(`.${ownHost}`));
              const own_rank = ownEntry?.rank ?? null;
              const competitorsAbove = top.filter((r) => {
                if (r.domain === ownHost || r.domain.endsWith(`.${ownHost}`)) return false;
                // Skip noise — listicles, aggregators, social
                if (/wikipedia|youtube|reddit|quora|facebook|twitter|x\.com|linkedin|pinterest|medium|amazon\.|flipkart\.|myntra\./.test(r.domain)) return false;
                return ownEntry ? r.rank < ownEntry.rank : true;
              });
              return {
                keyword: kw,
                own_rank,
                competitors_above: competitorsAbove.slice(0, 8),
                top10: top.slice(0, 10),
              };
            } catch (err) {
              return { keyword: kw, error: errMsg(err) };
            }
          })
        );
        return { own_domain: ownHost, results };
      },
    }),

    render_visualization: tool({
      description:
        "Render an inline visualization in the chat. Call this after run_report when you want to show data visually instead of as a markdown table. Pick the kind that fits the data: kpi/bar/line/pie/funnel/table. The chart appears in the chat above your next prose. Always follow up with 2-4 sentences of interpretation under the chart.",
      inputSchema: vizSchema,
      execute: async (args) => {
        // Pure pass-through — the chat UI renders from this output.
        return args;
      },
    }),

    get_demographics_breakdown: tool({
      description:
        'Get a sorted breakdown of a metric by a demographic dimension. Use this for any "who are these people" question — Kabir should default to this. Handles GA4 dimension name mapping for you.',
      inputSchema: z.object({
        metric: z
          .string()
          .describe('GA4 metric API name. Examples: "sessions", "totalUsers", "screenPageViews", "engagementRate". For a true conversion RATE use "sessionConversionRate" — NOT conversions/sessions ("conversions"/"keyEvents" counts key-event occurrences, i.e. key events, not converting sessions).'),
        dimension: z
          .enum(["age", "gender", "country", "region", "city", "device", "language"])
          .describe("Which demographic facet to break down by."),
        startDate: z.string().default("7daysAgo"),
        endDate: z.string().default("today"),
        limit: z.number().int().positive().max(50).optional().default(15),
      }),
      execute: async ({ metric, dimension, startDate, endDate, limit }) => {
        const dim = DEMOGRAPHIC_DIM_MAP[dimension];
        try {
          if (active.length === 1) {
            return await runReport(first.accessToken, first.property.ga4_property_id, {
              dimensions: [dim],
              metrics: [metric],
              startDate,
              endDate,
              limit,
              orderBy: { metric, desc: true },
            });
          }
          // Union: fan out + merge
          const results = await Promise.all(
            active.map((a) =>
              runReport(a.accessToken, a.property.ga4_property_id, {
                dimensions: [dim],
                metrics: [metric],
                startDate,
                endDate,
                limit: 500,
                orderBy: { metric, desc: true },
              }).catch((err) => ({
                __error: errMsg(err),
                __property: a.property.display_name,
                rows: [],
              }))
            )
          );
          return mergeReports(results, {
            dimensions: [dim],
            metrics: [metric],
            startDate,
            endDate,
            limit,
            orderBy: { metric, desc: true },
          });
        } catch (err) {
          return { error: errMsg(err) };
        }
      },
    }),

    get_property_overview: tool({
      description:
        "Get a one-shot snapshot to orient yourself: sessions, users, conversions, conversion rate, top channel, and top page — for last 7 days vs the prior 7 days, with delta percentages. ALWAYS call this first when the user asks an open-ended question (\"how are we doing\", \"what's up\") so you have context before deciding what to dig into.",
      inputSchema: z.object({}),
      execute: async () => {
        try {
          const runQuery = async (a: {
            dimensions: string[];
            metrics: string[];
            startDate: string;
            endDate: string;
            limit?: number;
            orderBy?: { metric: string; desc: boolean };
          }) => {
            if (active.length === 1) {
              return runReport(first.accessToken, first.property.ga4_property_id, {
                ...a,
                limit: a.limit ?? 25,
              });
            }
            const results = await Promise.all(
              active.map((p) =>
                runReport(p.accessToken, p.property.ga4_property_id, {
                  ...a,
                  limit: 500,
                }).catch((err) => ({
                  __error: errMsg(err),
                  __property: p.property.display_name,
                  rows: [],
                }))
              )
            );
            return mergeReports(results, { ...a, limit: a.limit ?? 25 });
          };

          const [thisWeek, priorWeek, topChannel, topPage] = await Promise.all([
            runQuery({
              dimensions: [],
              metrics: ["sessions", "totalUsers", "conversions", "screenPageViews"],
              startDate: "7daysAgo",
              endDate: "today",
              limit: 1,
            }),
            runQuery({
              dimensions: [],
              metrics: ["sessions", "totalUsers", "conversions", "screenPageViews"],
              startDate: "14daysAgo",
              endDate: "7daysAgo",
              limit: 1,
            }),
            runQuery({
              dimensions: ["sessionDefaultChannelGroup"],
              metrics: ["sessions"],
              startDate: "7daysAgo",
              endDate: "today",
              limit: 1,
              orderBy: { metric: "sessions", desc: true },
            }),
            runQuery({
              dimensions: ["pagePath"],
              metrics: ["screenPageViews"],
              startDate: "7daysAgo",
              endDate: "today",
              limit: 1,
              orderBy: { metric: "screenPageViews", desc: true },
            }),
          ]);

          const cur = thisWeek.rows[0]?.metrics ?? {};
          const prv = priorWeek.rows[0]?.metrics ?? {};
          const num = (m: Record<string, string>, k: string) =>
            parseFloat(m[k] ?? "0") || 0;
          const delta = (a: number, b: number) =>
            b === 0 ? null : ((a - b) / b) * 100;

          const sessionsNow = num(cur, "sessions");
          const sessionsPrior = num(prv, "sessions");
          const usersNow = num(cur, "totalUsers");
          const usersPrior = num(prv, "totalUsers");
          const convNow = num(cur, "conversions");
          const convPrior = num(prv, "conversions");
          const viewsNow = num(cur, "screenPageViews");
          const viewsPrior = num(prv, "screenPageViews");
          const crNow = sessionsNow > 0 ? (convNow / sessionsNow) * 100 : 0;
          const crPrior = sessionsPrior > 0 ? (convPrior / sessionsPrior) * 100 : 0;

          return {
            date_ranges: {
              current: { start: "7daysAgo", end: "today" },
              prior: { start: "14daysAgo", end: "7daysAgo" },
            },
            totals: {
              current: {
                sessions: sessionsNow,
                totalUsers: usersNow,
                conversions: convNow,
                screenPageViews: viewsNow,
                conversionRate: crNow,
              },
              prior: {
                sessions: sessionsPrior,
                totalUsers: usersPrior,
                conversions: convPrior,
                screenPageViews: viewsPrior,
                conversionRate: crPrior,
              },
              delta_pct: {
                sessions: delta(sessionsNow, sessionsPrior),
                totalUsers: delta(usersNow, usersPrior),
                conversions: delta(convNow, convPrior),
                screenPageViews: delta(viewsNow, viewsPrior),
                conversionRate: delta(crNow, crPrior),
              },
            },
            top_channel: topChannel.rows[0]
              ? {
                  name: topChannel.rows[0].dimensions["sessionDefaultChannelGroup"],
                  sessions: num(topChannel.rows[0].metrics, "sessions"),
                }
              : null,
            top_page: topPage.rows[0]
              ? {
                  path: topPage.rows[0].dimensions["pagePath"],
                  views: num(topPage.rows[0].metrics, "screenPageViews"),
                }
              : null,
          };
        } catch (err) {
          return { error: errMsg(err) };
        }
      },
    }),

    get_product_usage: tool({
      description:
        "Get a snapshot of how users actually use the product over a time range. Returns top events, top page paths with engagement time, and a best-effort conversion funnel detected from standard event names. Use this whenever you need to understand product behavior at a glance.",
      inputSchema: z.object({
        startDate: z.string().default("7daysAgo"),
        endDate: z.string().default("today"),
        eventNameContains: z.string().optional().describe("Optional case-insensitive substring filter on event names."),
      }),
      execute: async ({ startDate, endDate, eventNameContains }) => {
        try {
          const runUnion = async (args: {
            dimensions: string[];
            metrics: string[];
            limit: number;
            orderBy?: { metric: string; desc: boolean };
          }) => {
            if (active.length === 1) {
              return runReport(first.accessToken, first.property.ga4_property_id, {
                ...args,
                startDate,
                endDate,
              });
            }
            const results = await Promise.all(
              active.map((a) =>
                runReport(a.accessToken, a.property.ga4_property_id, {
                  ...args,
                  startDate,
                  endDate,
                  limit: 500,
                }).catch((err) => ({
                  __error: errMsg(err),
                  __property: a.property.display_name,
                  rows: [],
                }))
              )
            );
            return mergeReports(results, {
              ...args,
              startDate,
              endDate,
            });
          };

          const [eventsRes, pagesRes] = await Promise.all([
            runUnion({
              dimensions: ["eventName"],
              metrics: ["eventCount"],
              limit: 30,
              orderBy: { metric: "eventCount", desc: true },
            }),
            runUnion({
              dimensions: ["pagePath"],
              metrics: ["screenPageViews", "userEngagementDuration"],
              limit: 20,
              orderBy: { metric: "screenPageViews", desc: true },
            }),
          ]);

          const allEvents = (eventsRes.rows || []).map((r) => ({
            name: r.dimensions["eventName"],
            count: parseInt(r.metrics["eventCount"] || "0", 10),
          }));

          let topEvents = allEvents;
          if (eventNameContains) {
            const needle = eventNameContains.toLowerCase();
            topEvents = topEvents.filter((e) => e.name.toLowerCase().includes(needle));
          }
          topEvents = topEvents.slice(0, 20);

          const topPages = (pagesRes.rows || []).slice(0, 20).map((r) => ({
            path: r.dimensions["pagePath"],
            views: parseInt(r.metrics["screenPageViews"] || "0", 10),
            avg_engagement_seconds:
              parseInt(r.metrics["screenPageViews"] || "0", 10) > 0
                ? Math.round(
                    parseFloat(r.metrics["userEngagementDuration"] || "0") /
                      parseInt(r.metrics["screenPageViews"] || "1", 10)
                  )
                : 0,
          }));

          // Best-effort funnel: pick the first matching pattern that has 2+ steps with data.
          const eventCounts = new Map<string, number>();
          for (const e of allEvents) eventCounts.set(e.name, e.count);

          const candidatePatterns = [
            ["session_start", "view_item", "add_to_cart", "begin_checkout", "purchase"],
            ["page_view", "view_item_list", "view_item", "add_to_cart", "purchase"],
            ["session_start", "view_search_results", "select_item", "purchase"],
            ["session_start", "sign_up_started", "sign_up", "login", "first_visit"],
            ["page_view", "form_start", "form_submit", "generate_lead"],
          ];

          let funnel: Array<{ label: string; count: number }> = [];
          for (const pattern of candidatePatterns) {
            const present = pattern
              .map((e) => ({ label: e, count: eventCounts.get(e) ?? 0 }))
              .filter((s) => s.count > 0);
            if (present.length >= 2 && present.length > funnel.length) {
              funnel = present;
            }
          }

          return {
            date_range: { startDate, endDate },
            top_events: topEvents,
            top_pages: topPages,
            funnel,
            funnel_note:
              funnel.length === 0
                ? "No standard funnel events detected. Use run_report with eventName dimension if you want a custom funnel."
                : `Funnel built from detected event names (counts are over the full range).`,
          };
        } catch (err) {
          return { error: errMsg(err) };
        }
      },
    }),
  };
}

const DEMOGRAPHIC_DIM_MAP: Record<string, string> = {
  age: "userAgeBracket",
  gender: "userGender",
  country: "country",
  region: "region",
  city: "city",
  device: "deviceCategory",
  language: "language",
};

function runReportShape() {
  return z.object({
    dimensions: z
      .array(z.string())
      .describe('GA4 dimension API names, e.g. ["sessionSource", "sessionMedium"], ["country"], ["pagePath"]'),
    metrics: z
      .array(z.string())
      .describe('GA4 metric API names, e.g. ["sessions", "totalUsers", "conversions", "screenPageViews"]'),
    startDate: z.string().describe('"7daysAgo", "30daysAgo", "yesterday", or YYYY-MM-DD'),
    endDate: z.string().describe('Same format. Default "today".').default("today"),
    limit: z.number().int().positive().max(500).optional().default(25),
    orderBy: z
      .object({ metric: z.string(), desc: z.boolean() })
      .optional()
      .describe("Sort rows by a metric."),
  });
}

type ShapedReport = {
  dimensionHeaders: (string | null | undefined)[];
  metricHeaders: Array<{ name?: string | null; type?: string | null }>;
  rows: Array<{ dimensions: Record<string, string>; metrics: Record<string, string> }>;
  rowCount: number;
};

function mergeReports(
  results: Array<ShapedReport | { __error: string; __property: string; rows: ShapedReport["rows"] }>,
  args: RunReportArgs
): ShapedReport & { merged_from: number; per_property_errors?: Array<{ property: string; error: string }> } {
  const merged: Record<string, { dims: Record<string, string>; mets: Record<string, number> }> = {};
  let metricHeaders: Array<{ name?: string | null; type?: string | null }> = [];
  const errs: Array<{ property: string; error: string }> = [];
  let counted = 0;

  for (const r of results) {
    if ("__error" in r) {
      errs.push({ property: r.__property, error: r.__error });
      continue;
    }
    counted++;
    metricHeaders = r.metricHeaders;
    for (const row of r.rows) {
      const key = args.dimensions.map((d) => row.dimensions[d] ?? "").join("|");
      if (!merged[key]) {
        merged[key] = { dims: { ...row.dimensions }, mets: {} };
      }
      for (const m of args.metrics) {
        const v = parseFloat(row.metrics[m] ?? "0");
        merged[key].mets[m] = (merged[key].mets[m] ?? 0) + (Number.isFinite(v) ? v : 0);
      }
    }
  }

  const rows = Object.values(merged).map((g) => ({
    dimensions: g.dims,
    metrics: Object.fromEntries(Object.entries(g.mets).map(([k, v]) => [k, String(v)])),
  }));

  // Sort if requested
  if (args.orderBy) {
    const m = args.orderBy.metric;
    rows.sort((a, b) => {
      const av = parseFloat(a.metrics[m] ?? "0");
      const bv = parseFloat(b.metrics[m] ?? "0");
      return args.orderBy!.desc ? bv - av : av - bv;
    });
  }

  const limited = rows.slice(0, args.limit ?? 25);

  return {
    dimensionHeaders: args.dimensions,
    metricHeaders,
    rows: limited,
    rowCount: limited.length,
    merged_from: counted,
    ...(errs.length ? { per_property_errors: errs } : {}),
  };
}

function errMsg(err: unknown): string {
  if (err && typeof err === "object" && "message" in err) {
    return String((err as { message: unknown }).message);
  }
  return String(err);
}

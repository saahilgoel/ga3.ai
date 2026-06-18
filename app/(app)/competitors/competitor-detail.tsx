"use client";

import { useCallback, useEffect, useState } from "react";
import type {
  CompetitorRow,
  CompetitorDocSummary,
} from "@/lib/context/competitors-db";

type Props = {
  competitor: CompetitorRow;
  onClose: () => void;
  onDelete: () => void;
};

type DetailData = {
  competitor: CompetitorRow;
  grouped: Record<string, CompetitorDocSummary[]>;
};

type AdMeta = {
  network?: string;
  image_url?: string;
  landing_url?: string;
  cta?: string;
  format?: string;
  platforms?: string[];
  active_since?: string;
  no_ads?: boolean;
};

const TABS: Array<{
  id: string;
  label: string;
  source_types: string[];
}> = [
  { id: "overview", label: "Overview", source_types: ["competitor_website"] },
  { id: "catalog", label: "Catalog", source_types: ["catalog_shopify"] },
  { id: "serp", label: "Search", source_types: ["competitor_serp"] },
  { id: "news", label: "News", source_types: ["competitor_news"] },
  { id: "hiring", label: "Hiring", source_types: ["competitor_jobs"] },
  { id: "meta-ads", label: "Meta ads", source_types: ["competitor_ad_meta"] },
  {
    id: "google-ads",
    label: "Google ads",
    source_types: ["competitor_ad_google"],
  },
  {
    id: "angle",
    label: "Creative angle",
    source_types: ["competitor_ad_creative_angle"],
  },
];

export function CompetitorDetail({ competitor, onClose, onDelete }: Props) {
  const [data, setData] = useState<DetailData | null>(null);
  const [tab, setTab] = useState("overview");
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/context/competitors/${competitor.id}`, {
        cache: "no-store",
      });
      if (res.ok) {
        const j = (await res.json()) as DetailData;
        setData(j);
      }
    } finally {
      setLoading(false);
    }
  }, [competitor.id]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return (
    <div
      className="fixed inset-0 z-30 flex justify-end"
      onClick={onClose}
    >
      <div aria-hidden className="absolute inset-0 bg-black/55 backdrop-blur-sm" />
      <aside
        className="relative w-full max-w-[760px] h-full overflow-y-auto bg-[color:var(--bg)] border-l border-[color:var(--border)] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="sticky top-0 z-10 bg-[color:var(--bg)]/85 backdrop-blur-md border-b border-[color:var(--border)] px-6 py-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-[color:var(--text-tertiary)] mb-1">
                Competitor
              </div>
              <h2 className="font-mono text-[24px] font-medium tracking-[-0.02em] truncate">
                {competitor.brand_name}
              </h2>
              {competitor.website_url && (
                <a
                  href={competitor.website_url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[12px] font-mono text-[#7c6bff] hover:underline truncate inline-block max-w-full"
                  style={{ textShadow: "0 0 4px rgba(124,107,255,0.45)" }}
                >
                  ↗{" "}
                  {(() => {
                    try {
                      return new URL(competitor.website_url).hostname.replace(
                        /^www\./,
                        ""
                      );
                    } catch {
                      return competitor.website_url;
                    }
                  })()}
                </a>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={onDelete}
                className="h-8 px-2 rounded-md text-[11px] text-[color:var(--text-tertiary)] hover:text-[color:var(--severity-high)] hover:bg-[color:var(--surface)]"
              >
                Remove
              </button>
              <button
                onClick={onClose}
                aria-label="Close"
                className="size-8 rounded-md flex items-center justify-center text-[color:var(--text-tertiary)] hover:text-[color:var(--text-primary)] hover:bg-[color:var(--surface)]"
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
          </div>

          {competitor.reasoning && (
            <p className="text-[12px] text-[color:var(--text-secondary)] mt-2 max-w-2xl">
              {competitor.reasoning}
            </p>
          )}

          <div className="mt-4 flex items-center gap-3 text-[10px] font-mono text-[color:var(--text-tertiary)]">
            <span>{competitor.document_count} docs</span>
            <span>·</span>
            <span>{competitor.chunk_count} chunks</span>
            <span>·</span>
            <span>{competitor.credits_used} cr</span>
          </div>

          <nav className="mt-4 flex items-center gap-1 overflow-x-auto -mb-4 pb-4">
            {TABS.map((t) => {
              const count = data
                ? t.source_types.reduce(
                    (s, st) => s + (data.grouped[st]?.length ?? 0),
                    0
                  )
                : null;
              const active = tab === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={`shrink-0 h-8 px-3 rounded-md text-[12px] transition-colors ${
                    active
                      ? "bg-[color:var(--accent)] text-[color:var(--accent-foreground)]"
                      : "text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)] hover:bg-[color:var(--surface-hover)]"
                  }`}
                >
                  {t.label}
                  {count != null && (
                    <span
                      className={`ml-1.5 text-[10px] font-mono tabular-nums ${
                        active ? "opacity-70" : "text-[color:var(--text-tertiary)]"
                      }`}
                    >
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </header>

        <div className="px-6 py-6">
          {loading && !data && (
            <div className="space-y-2 animate-pulse">
              {Array.from({ length: 4 }).map((_, i) => (
                <div
                  key={i}
                  className="h-24 rounded-lg bg-[color:var(--surface)]"
                  style={{ opacity: 1 - i * 0.15 }}
                />
              ))}
            </div>
          )}
          {data && (
            <TabContent tab={tab} data={data} onRefreshed={fetchData} />
          )}
        </div>
      </aside>
    </div>
  );
}

function TabContent({
  tab,
  data,
  onRefreshed,
}: {
  tab: string;
  data: DetailData;
  onRefreshed: () => void;
}) {
  const def = TABS.find((t) => t.id === tab);
  if (!def) return null;
  const docs = def.source_types
    .flatMap((st) => data.grouped[st] ?? [])
    .sort((a, b) => b.fetched_at - a.fetched_at);

  if (docs.length === 0) {
    return (
      <div className="text-center py-12 text-[12px] text-[color:var(--text-tertiary)]">
        Nothing captured for this tab yet.
        {tab === "meta-ads" && (
          <div className="mt-2 text-[11px]">
            Meta Ad Library only shows live ads — the competitor may currently
            be dark on Meta.
          </div>
        )}
      </div>
    );
  }

  if (tab === "meta-ads" || tab === "google-ads") {
    return (
      <AdGrid
        docs={docs}
        competitorId={data.competitor.id}
        onRefreshed={onRefreshed}
      />
    );
  }
  if (tab === "catalog") {
    return <CatalogGrid docs={docs} />;
  }
  if (tab === "hiring") {
    return <JobsList docs={docs} />;
  }
  if (tab === "serp") {
    return <SerpList docs={docs} />;
  }
  if (tab === "news") {
    return <NewsList docs={docs} />;
  }
  if (tab === "angle") {
    return <AngleList docs={docs} />;
  }
  return <DefaultDocList docs={docs} />;
}

function AdGrid({
  docs,
  competitorId,
  onRefreshed,
}: {
  docs: CompetitorDocSummary[];
  competitorId?: number;
  onRefreshed?: () => void;
}) {
  const [refreshing, setRefreshing] = useState(false);
  async function refresh() {
    if (!competitorId) return;
    setRefreshing(true);
    await fetch("/api/context/competitors/refresh", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ competitor_id: competitorId, ads_only: true }),
    });
    setTimeout(() => {
      setRefreshing(false);
      onRefreshed?.();
    }, 1_500);
  }
  return (
    <div>
      {competitorId && (
        <div className="flex items-center justify-end mb-3">
          <button
            onClick={refresh}
            disabled={refreshing}
            className="h-8 px-3 rounded-md border border-[color:var(--border)] text-[11px] text-[color:var(--text-secondary)] hover:border-[color:var(--accent)]/60 hover:text-[color:var(--text-primary)] tx-hover disabled:opacity-60"
          >
            {refreshing ? "Refreshing…" : "Refresh ads"}
          </button>
        </div>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      {docs.map((d) => {
        const meta = (d.metadata ?? {}) as AdMeta;
        // Skip the placeholder "no ads" docs in the grid
        if (meta?.no_ads) {
          return (
            <div
              key={d.id}
              className="md:col-span-2 rounded-lg border border-[color:var(--border)] bg-[color:var(--surface)] p-4 text-center text-[12px] text-[color:var(--text-tertiary)]"
            >
              {d.content}
            </div>
          );
        }
        const headline = (d.title || "").replace(/^.*?—\s*/, "");
        return (
          <div
            key={d.id}
            className="rounded-lg border border-[color:var(--border)] bg-[color:var(--surface)] overflow-hidden hover:border-[color:var(--accent)]/40 tx-hover"
          >
            {meta?.image_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={meta.image_url}
                alt={headline}
                className="w-full aspect-[1.2] object-cover bg-[color:var(--surface-elevated)]"
                referrerPolicy="no-referrer"
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).style.display = "none";
                }}
              />
            ) : (
              <div className="w-full aspect-[1.2] bg-[color:var(--surface-elevated)] flex items-center justify-center text-[10px] font-mono text-[color:var(--text-tertiary)]">
                no image
              </div>
            )}
            <div className="p-3">
              <div className="font-medium text-[13px] line-clamp-2 mb-1">
                {headline}
              </div>
              <div className="text-[11px] text-[color:var(--text-secondary)] line-clamp-3 mb-2 whitespace-pre-wrap">
                {d.content.replace(/^Headline: .*\n/m, "").slice(0, 220)}
              </div>
              <div className="flex items-center gap-2 flex-wrap text-[10px] font-mono text-[color:var(--text-tertiary)]">
                {meta?.cta && (
                  <span className="px-1.5 py-0.5 rounded bg-[color:var(--surface-elevated)] text-[color:var(--text-secondary)]">
                    {meta.cta}
                  </span>
                )}
                {meta?.format && <span>· {meta.format}</span>}
                {meta?.active_since && <span>· since {meta.active_since}</span>}
                {meta?.landing_url && (
                  <a
                    href={meta.landing_url}
                    target="_blank"
                    rel="noreferrer"
                    className="ml-auto text-[#7c6bff] hover:underline"
                  >
                    ↗ landing
                  </a>
                )}
              </div>
            </div>
          </div>
        );
      })}
      </div>
    </div>
  );
}

type CatalogMeta = {
  image?: string;
  vendor?: string;
  product_type?: string;
  tags?: string[];
  price_min?: number | null;
  price_max?: number | null;
  variant_count?: number;
  published_at?: string;
};

function CatalogGrid({ docs }: { docs: CompetitorDocSummary[] }) {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const filtered = q
    ? docs.filter(
        (d) =>
          (d.title || "").toLowerCase().includes(q) ||
          d.content.toLowerCase().includes(q)
      )
    : docs;
  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <div className="relative flex-1">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={`Search ${docs.length} products…`}
            className="w-full h-9 px-3 rounded-md bg-[color:var(--surface)] border border-[color:var(--border)] focus:border-[color:var(--accent)] focus:outline-none text-[12px]"
          />
        </div>
        <span className="text-[10px] font-mono text-[color:var(--text-tertiary)] shrink-0">
          {filtered.length} / {docs.length}
        </span>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
        {filtered.slice(0, 120).map((d) => {
          const meta = (d.metadata ?? {}) as CatalogMeta;
          const price =
            meta.price_min == null
              ? null
              : meta.price_min === meta.price_max
              ? `₹${meta.price_min}`
              : `₹${meta.price_min}–${meta.price_max}`;
          return (
            <a
              key={d.id}
              href={d.source_url || "#"}
              target="_blank"
              rel="noreferrer"
              className="block rounded-lg border border-[color:var(--border)] bg-[color:var(--surface)] overflow-hidden hover:border-[color:var(--accent)]/40 tx-hover"
            >
              {meta.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={meta.image}
                  alt={d.title || "product"}
                  className="w-full aspect-square object-cover bg-[color:var(--surface-elevated)]"
                  referrerPolicy="no-referrer"
                  onError={(e) => {
                    (e.currentTarget as HTMLImageElement).style.display = "none";
                  }}
                />
              ) : (
                <div className="w-full aspect-square bg-[color:var(--surface-elevated)] flex items-center justify-center text-[10px] font-mono text-[color:var(--text-tertiary)]">
                  no image
                </div>
              )}
              <div className="p-2">
                <div className="text-[12px] font-medium line-clamp-2 leading-tight">
                  {d.title || "(untitled)"}
                </div>
                <div className="mt-1 flex items-center gap-2 text-[10px] font-mono text-[color:var(--text-tertiary)]">
                  {price && (
                    <span className="text-[#7c6bff]" style={{ textShadow: "0 0 3px rgba(124,107,255,0.45)" }}>
                      {price}
                    </span>
                  )}
                  {meta.product_type && (
                    <span className="truncate">· {meta.product_type}</span>
                  )}
                </div>
              </div>
            </a>
          );
        })}
      </div>
      {filtered.length > 120 && (
        <div className="mt-3 text-center text-[11px] font-mono text-[color:var(--text-tertiary)]">
          Showing first 120 of {filtered.length}. Refine the search to narrow.
        </div>
      )}
    </div>
  );
}

type JobMeta = {
  jobs?: Array<{
    title: string;
    url: string;
    company: string;
    location: string;
    posted_at: string;
  }>;
  total?: number;
};

function JobsList({ docs }: { docs: CompetitorDocSummary[] }) {
  const allJobs = docs.flatMap((d) => {
    const m = (d.metadata ?? {}) as JobMeta;
    return m.jobs ?? [];
  });
  if (allJobs.length === 0) {
    return (
      <div className="text-center py-12 text-[12px] text-[color:var(--text-tertiary)]">
        No public LinkedIn roles found for this brand.
      </div>
    );
  }
  // Bucket by job family for the "what are they hiring?" signal
  const family = (title: string): string => {
    const t = title.toLowerCase();
    if (/growth|marketing|brand|performance|seo|content/.test(t)) return "Growth";
    if (/engineer|developer|sde|software|backend|frontend|fullstack|devops/.test(t)) return "Engineering";
    if (/product manager|\bpm\b|product owner/.test(t)) return "Product";
    if (/design|ux|ui|creative/.test(t)) return "Design";
    if (/sales|account|business development|\bbd\b/.test(t)) return "Sales";
    if (/ops|operations|supply|logistics|warehouse|fulfillment/.test(t)) return "Ops";
    if (/data|analyst|analytics|scientist/.test(t)) return "Data";
    if (/finance|accountant|\bcfo\b|controller/.test(t)) return "Finance";
    if (/hr|people|recruiter/.test(t)) return "People";
    return "Other";
  };
  const buckets = new Map<string, typeof allJobs>();
  for (const j of allJobs) {
    const k = family(j.title);
    if (!buckets.has(k)) buckets.set(k, []);
    buckets.get(k)!.push(j);
  }
  const ordered = [...buckets.entries()].sort((a, b) => b[1].length - a[1].length);
  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-[color:var(--border)] bg-[color:var(--surface)] p-4">
        <div className="text-[10px] font-mono uppercase tracking-[0.14em] text-[color:var(--text-tertiary)] mb-2">
          Hiring mix · {allJobs.length} open roles
        </div>
        <div className="flex flex-wrap gap-1.5">
          {ordered.map(([k, v]) => (
            <span
              key={k}
              className="text-[11px] font-mono px-2 py-0.5 rounded-full border"
              style={{
                color: "#a78bfa",
                borderColor: "rgba(167,139,250,0.35)",
                background: "rgba(167,139,250,0.06)",
              }}
            >
              {k} · {v.length}
            </span>
          ))}
        </div>
      </div>
      <div className="space-y-2">
        {allJobs.map((j, i) => (
          <a
            key={`${j.url}-${i}`}
            href={j.url}
            target="_blank"
            rel="noreferrer"
            className="block rounded-lg border border-[color:var(--border)] bg-[color:var(--surface)] px-4 py-3 hover:border-[color:var(--accent)]/40 tx-hover"
          >
            <div className="text-[13px] font-medium truncate text-[#7c6bff]">
              {j.title}
            </div>
            <div className="text-[11px] text-[color:var(--text-secondary)] mt-0.5 flex items-center gap-2 flex-wrap">
              <span>{j.location}</span>
              {j.posted_at && (
                <>
                  <span>·</span>
                  <span className="font-mono text-[10px] text-[color:var(--text-tertiary)]">
                    posted {j.posted_at}
                  </span>
                </>
              )}
            </div>
          </a>
        ))}
      </div>
    </div>
  );
}

function SerpList({ docs }: { docs: CompetitorDocSummary[] }) {
  // Each SERP doc is a numbered list of "N. title\nsnippet\nurl" — render as rows.
  const items = docs.flatMap((d) =>
    d.content
      .split(/\n\n+/)
      .map((block) => {
        const lines = block.split("\n");
        const titleMatch = lines[0]?.match(/^(\d+)\.\s*(.+)$/);
        if (!titleMatch) return null;
        return {
          rank: parseInt(titleMatch[1], 10),
          title: titleMatch[2].trim(),
          snippet: (lines[1] || "").trim(),
          url: (lines[2] || "").trim(),
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null)
  );
  return (
    <div className="space-y-2">
      {items.slice(0, 20).map((it, i) => (
        <a
          key={i}
          href={it.url}
          target="_blank"
          rel="noreferrer"
          className="block rounded-lg border border-[color:var(--border)] bg-[color:var(--surface)] px-4 py-3 hover:border-[color:var(--accent)]/40 tx-hover"
        >
          <div className="flex items-baseline gap-3">
            <span className="text-[10px] font-mono text-[color:var(--text-tertiary)] tabular-nums w-6 text-right">
              #{it.rank}
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-[13px] font-medium truncate text-[#7c6bff]">
                {it.title}
              </div>
              <div className="text-[11px] text-[color:var(--text-secondary)] line-clamp-2 mt-0.5">
                {it.snippet}
              </div>
              <div className="text-[10px] font-mono text-[color:var(--text-tertiary)] truncate mt-0.5">
                {it.url}
              </div>
            </div>
          </div>
        </a>
      ))}
    </div>
  );
}

function NewsList({ docs }: { docs: CompetitorDocSummary[] }) {
  // News docs hold a compiled list of "• title\nsnippet\nsource · date\nurl"
  const items = docs.flatMap((d) =>
    d.content
      .split(/\n\n+/)
      .map((block) => {
        const lines = block.split("\n").map((l) => l.replace(/^\s*•\s*/, "").trim());
        if (lines.length < 2) return null;
        return {
          title: lines[0],
          snippet: lines[1] || "",
          meta: (lines[2] || "").replace(/^source:\s*/i, ""),
          url: (lines[3] || "").trim(),
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null && !!x.title)
  );
  return (
    <div className="space-y-2">
      {items.slice(0, 30).map((it, i) => (
        <a
          key={i}
          href={it.url}
          target="_blank"
          rel="noreferrer"
          className="block rounded-lg border border-[color:var(--border)] bg-[color:var(--surface)] px-4 py-3 hover:border-[color:var(--accent)]/40 tx-hover"
        >
          <div className="text-[10px] font-mono text-[color:var(--text-tertiary)] mb-1">
            {it.meta || "news"}
          </div>
          <div className="text-[13px] font-medium leading-snug mb-1">
            {it.title}
          </div>
          <div className="text-[11px] text-[color:var(--text-secondary)] line-clamp-2">
            {it.snippet}
          </div>
        </a>
      ))}
    </div>
  );
}

function AngleList({ docs }: { docs: CompetitorDocSummary[] }) {
  return (
    <div className="space-y-3">
      {docs.map((d) => (
        <div
          key={d.id}
          className="rounded-lg border border-[color:var(--accent)]/30 bg-[color:var(--surface)] p-4"
          style={{
            boxShadow: "0 0 0 1px rgba(244,114,182,0.15), 0 0 18px -4px rgba(244,114,182,0.25)",
          }}
        >
          <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-[#cfcfcf] mb-2">
            Creative angle · {((d.metadata as AdMeta | null)?.network ?? "?").toString()}
          </div>
          <div className="text-[13px] text-[color:var(--text-primary)] leading-relaxed whitespace-pre-wrap">
            {d.content}
          </div>
        </div>
      ))}
    </div>
  );
}

function DefaultDocList({ docs }: { docs: CompetitorDocSummary[] }) {
  return (
    <div className="space-y-2">
      {docs.map((d) => (
        <details
          key={d.id}
          className="rounded-lg border border-[color:var(--border)] bg-[color:var(--surface)] open:bg-[color:var(--surface-hover)]"
        >
          <summary className="cursor-pointer px-4 py-3 list-none">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="text-[13px] font-medium truncate">
                  {d.title || d.source_url || d.source_type}
                </div>
                {d.source_url && (
                  <div className="text-[10px] font-mono text-[color:var(--text-tertiary)] truncate">
                    {d.source_url}
                  </div>
                )}
              </div>
              <span className="text-[10px] font-mono text-[color:var(--text-tertiary)] shrink-0">
                {(d.content.length / 4).toFixed(0)} toks
              </span>
            </div>
          </summary>
          <div className="px-4 pb-3 text-[12px] text-[color:var(--text-secondary)] leading-relaxed whitespace-pre-wrap max-h-[420px] overflow-y-auto border-t border-[color:var(--border)]">
            {d.content}
          </div>
        </details>
      ))}
    </div>
  );
}

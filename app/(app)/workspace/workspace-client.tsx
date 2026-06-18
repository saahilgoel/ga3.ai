"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  BrainCircuit,
  Newspaper,
  MessagesSquare,
  Sparkles,
  ExternalLink,
  Layers,
  Settings2,
  Power,
  CheckCircle2,
  Circle,
  AlertCircle,
  Clock,
  Star,
  X,
  RefreshCw,
  AlertTriangle,
} from "lucide-react";
import { ConnectedSources } from "@/components/workspace/connected-sources";

type Workspace = {
  id: number;
  name: string;
  kind: "single" | "union";
  last_used_at: number;
  last_scan_at: number | null;
  primary_property_id: number | null;
};

type Property = {
  id: number;
  display_name: string;
  ga4_property_id: string;
  website_url: string | null;
  is_primary: boolean;
};

type ContextState = {
  status: string;
  brand_name: string | null;
  progress_pct: number;
  current_step: string | null;
  error_text: string | null;
  document_count: number;
  chunk_count: number;
  total_credits_used: number;
  last_full_refresh_at: number | null;
  failed_sources: string | null;
  source_count: number;
  user_upload_count: number;
};

type Stats = {
  findings_count: number;
  unread_count: number;
  high_severity_count: number;
  conversations_count: number;
  briefs_count: number;
  last_finding_at: number | null;
  last_conv_at: number | null;
  last_brief_at: number | null;
};

type DoctorHost = { host: string; events: number; pct: number };
type DoctorSource = { source_medium: string; sessions: number; pct: number };
type DoctorReport = {
  total_events_28d: number;
  total_users_28d: number;
  total_sessions_28d: number;
  declared_host: string | null;
  dominant_host: string | null;
  dominant_host_pct: number;
  top_hosts: DoctorHost[];
  top_sources: DoctorSource[];
  activity_score: number;
  is_active: boolean;
  host_mismatch: boolean;
  warnings: string[];
  generated_at: number;
  ga4_property_id: string;
};

type DoctorEntry = {
  property_id: number;
  display_name: string;
  ga4_property_id: string;
  website_url: string | null;
  is_primary: boolean;
  report: DoctorReport | null;
  cached: boolean;
  error?: string;
};

export function WorkspaceOverviewClient({
  workspace,
  properties,
  context,
  stats,
  googleAds,
}: {
  workspace: Workspace;
  properties: Property[];
  context: ContextState;
  stats: Stats;
  googleAds?: {
    attachedCustomerIds: string[];
    accountEmail: string;
  };
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [doctor, setDoctor] = useState<DoctorEntry[]>([]);
  const [doctorLoading, setDoctorLoading] = useState(true);
  const [availableProps, setAvailableProps] = useState<
    Array<{ id: number; display_name: string; website_url: string | null }>
  >([]);
  const [showAttach, setShowAttach] = useState(false);

  useEffect(() => {
    loadDoctor(false);
  }, [workspace.id]);

  async function loadDoctor(refresh: boolean) {
    setDoctorLoading(true);
    try {
      const res = await fetch(
        `/api/workspaces/doctor?workspace_id=${workspace.id}${refresh ? "&refresh=1" : ""}`
      );
      if (res.ok) {
        const data = (await res.json()) as { properties: DoctorEntry[] };
        setDoctor(data.properties);
      }
    } finally {
      setDoctorLoading(false);
    }
  }

  async function loadAvailableProperties() {
    try {
      const res = await fetch("/api/properties");
      if (!res.ok) return;
      const data = (await res.json()) as {
        properties: Array<{ db_id?: number; display_name: string; website_url?: string | null }>;
      };
      const attachedIds = new Set(properties.map((p) => p.id));
      const list = data.properties
        .filter((p) => p.db_id && !attachedIds.has(p.db_id))
        .map((p) => ({
          id: p.db_id as number,
          display_name: p.display_name,
          website_url: p.website_url ?? null,
        }));
      setAvailableProps(list);
    } catch {
      // soft-fail
    }
  }

  async function rescan() {
    setBusy("scan");
    try {
      await fetch("/api/scan", { method: "POST" });
      router.push("/feed");
    } finally {
      setBusy(null);
    }
  }

  async function buildContext() {
    setBusy("context");
    try {
      await fetch("/api/context/build", { method: "POST" });
      router.push("/workspaces/context");
    } finally {
      setBusy(null);
    }
  }

  async function setPrimary(propertyId: number) {
    await fetch(`/api/workspaces/${workspace.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ primary_property_id: propertyId }),
    });
    router.refresh();
  }

  async function detach(propertyId: number) {
    if (properties.length === 1) {
      alert("Workspace needs at least one property.");
      return;
    }
    if (
      !confirm(
        "Detach this property from the workspace? It stays in your account; you can re-attach later."
      )
    )
      return;
    await fetch(`/api/workspaces/${workspace.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ detach_property_id: propertyId }),
    });
    router.refresh();
  }

  async function attach(propertyId: number) {
    await fetch(`/api/workspaces/${workspace.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ attach_property_id: propertyId }),
    });
    setShowAttach(false);
    router.refresh();
  }

  const ctxBadge = contextBadge(context.status);
  const ragRunning =
    context.status === "crawling" || context.status === "embedding";

  const primary = properties.find((p) => p.is_primary) ?? properties[0];
  const attached = properties.filter((p) => !p.is_primary);
  const doctorByPropId = new Map(doctor.map((d) => [d.property_id, d]));

  return (
    <>
      <header className="flex items-baseline justify-between mb-6 flex-wrap gap-3">
        <div>
          <div className="text-[11px] uppercase tracking-[0.08em] text-[color:var(--text-tertiary)] font-mono">
            Workspace
          </div>
          <h1 className="font-serif text-[32px] font-medium tracking-[-0.02em] leading-[1.1] mt-1 flex items-center gap-2.5">
            {properties.length > 1 && (
              <Layers
                strokeWidth={1.5}
                className="size-5 text-[color:var(--text-secondary)]"
              />
            )}
            {workspace.name}
          </h1>
          <div className="text-[12px] font-mono text-[color:var(--text-tertiary)] tabular-nums mt-1.5">
            {properties.length} {properties.length === 1 ? "property" : "properties"}
            {workspace.last_scan_at && (
              <> · last scan {timeAgo(workspace.last_scan_at)}</>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/properties"
            className="h-8 px-3 rounded-md border border-[color:var(--border)] hover:bg-[color:var(--surface-hover)] tx-hover text-[12px] inline-flex items-center gap-1.5"
          >
            <Settings2 strokeWidth={1.5} className="size-3.5" />
            Switch property
          </Link>
          <button
            onClick={rescan}
            disabled={busy === "scan"}
            className="h-8 px-3 rounded-md bg-[color:var(--text-primary)] text-[color:var(--bg)] hover:bg-white tx-hover text-[12px] font-medium inline-flex items-center gap-1.5 disabled:opacity-50"
          >
            <Power strokeWidth={1.5} className="size-3.5" />
            {busy === "scan" ? "Scanning…" : "Re-scan"}
          </button>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 mb-8">
        <StatCard
          href="/feed"
          icon={Newspaper}
          label="Newsroom"
          primary={stats.findings_count}
          primaryLabel="findings"
          accent={
            stats.unread_count > 0
              ? `${stats.unread_count} unread · ${stats.high_severity_count} high`
              : "all read"
          }
          subtitle={
            stats.last_finding_at
              ? `last ${timeAgo(stats.last_finding_at)}`
              : "no findings yet"
          }
        />
        <StatCard
          href="/chats"
          icon={MessagesSquare}
          label="Conversations"
          primary={stats.conversations_count}
          primaryLabel={stats.conversations_count === 1 ? "chat" : "chats"}
          accent={null}
          subtitle={
            stats.last_conv_at
              ? `last activity ${timeAgo(stats.last_conv_at)}`
              : "no chats yet"
          }
        />
        <StatCard
          href="/briefs"
          icon={Sparkles}
          label="Briefs"
          primary={stats.briefs_count}
          primaryLabel={stats.briefs_count === 1 ? "brief" : "briefs"}
          accent={null}
          subtitle={
            stats.last_brief_at
              ? `last run ${timeAgo(stats.last_brief_at)}`
              : "no briefs yet"
          }
        />
      </div>

      <section className="rounded-lg border border-[color:var(--border)] bg-[color:var(--surface)] overflow-hidden mb-8">
        <header className="px-5 py-3 border-b border-[color:var(--border)] flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <BrainCircuit
              strokeWidth={1.5}
              className="size-4 text-[color:var(--text-secondary)]"
            />
            <span className="font-serif text-[15px] font-medium">
              Customer Intelligence (RAG)
            </span>
            <span
              className="inline-flex items-center gap-1.5 text-[11px] font-mono uppercase tracking-[0.06em] px-1.5 py-0.5 rounded-full"
              style={{ background: ctxBadge.bg, color: ctxBadge.color }}
            >
              <ctxBadge.icon strokeWidth={2} className="size-3" />
              {ctxBadge.label}
            </span>
          </div>
          <Link
            href="/workspaces/context"
            className="text-[12px] text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)] tx-hover inline-flex items-center gap-1"
          >
            Manage
            <ExternalLink strokeWidth={1.5} className="size-3" />
          </Link>
        </header>
        <div className="px-5 py-4">
          {context.status === "pending" || context.status === "declined" ? (
            <div className="space-y-3">
              <p className="text-[13px] text-[color:var(--text-secondary)] leading-relaxed max-w-[640px]">
                No business context built yet. Agents only see GA4 numbers — they
                can&apos;t explain <em>why</em> a metric moved. Build context (about 2
                minutes, 12 credits) and they&apos;ll pull from customer reviews, news,
                LinkedIn posts, and the brand&apos;s own site.
              </p>
              <button
                onClick={buildContext}
                disabled={busy === "context"}
                className="h-8 px-3 rounded-md bg-[color:var(--text-primary)] text-[color:var(--bg)] hover:bg-white tx-hover text-[12px] font-medium disabled:opacity-50"
              >
                {busy === "context" ? "Starting…" : "Build context"}
              </button>
            </div>
          ) : context.status === "failed" ? (
            <div className="space-y-3">
              <div className="text-[13px] text-[color:var(--severity-high)] leading-relaxed">
                Build failed: {context.error_text ?? "unknown error"}
              </div>
              <button
                onClick={buildContext}
                disabled={busy === "context"}
                className="h-8 px-3 rounded-md border border-[color:var(--border-strong)] bg-[color:var(--surface-elevated)] hover:bg-[color:var(--surface-hover)] tx-hover text-[12px] font-medium disabled:opacity-50"
              >
                {busy === "context" ? "Starting…" : "Retry"}
              </button>
            </div>
          ) : ragRunning ? (
            <div className="space-y-3">
              <div className="text-[13px]">
                <span className="font-medium">{context.current_step ?? "Working…"}</span>
                <span className="text-[color:var(--text-tertiary)] ml-2 font-mono tabular-nums">
                  {context.progress_pct}%
                </span>
              </div>
              <div className="h-1 rounded-full bg-[color:var(--border)] overflow-hidden max-w-[480px]">
                <div
                  className="h-full bg-[color:var(--text-primary)] transition-all"
                  style={{ width: `${context.progress_pct}%` }}
                />
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <Stat label="Brand" value={context.brand_name ?? "—"} mono={false} />
              <Stat label="Sources" value={context.source_count} mono />
              <Stat label="Chunks" value={context.chunk_count} mono />
              <Stat label="Credits used" value={context.total_credits_used} mono />
              <Stat
                label="Your uploads"
                value={context.user_upload_count}
                mono
              />
              <Stat
                label="Last refresh"
                value={
                  context.last_full_refresh_at
                    ? timeAgo(context.last_full_refresh_at)
                    : "—"
                }
                mono
              />
            </div>
          )}

          {context.failed_sources &&
            (context.status === "ready" || context.status === "partial") && (
              <div className="mt-3 text-[12px] text-[color:var(--severity-medium)]">
                Some sources failed:{" "}
                <code className="font-mono text-[11px]">{context.failed_sources}</code>
              </div>
            )}
        </div>
      </section>

      <ConnectedSources
        workspaceId={workspace.id}
        attachedAdsCustomerIds={googleAds?.attachedCustomerIds ?? []}
        accountEmail={googleAds?.accountEmail ?? ""}
      />

      <section className="rounded-lg border border-[color:var(--border)] bg-[color:var(--surface)] overflow-hidden mb-8">
        <header className="px-5 py-3 border-b border-[color:var(--border)] flex items-center justify-between gap-3">
          <div className="font-serif text-[15px] font-medium">
            {properties.length === 1 ? "Property" : "Properties"} · GA4 doctor
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                loadAvailableProperties();
                setShowAttach((v) => !v);
              }}
              className="h-7 px-2.5 rounded-md border border-[color:var(--border)] hover:bg-[color:var(--surface-hover)] tx-hover text-[11px] inline-flex items-center gap-1.5"
            >
              Attach property
            </button>
            <button
              onClick={() => loadDoctor(true)}
              disabled={doctorLoading}
              className="h-7 px-2.5 rounded-md border border-[color:var(--border)] hover:bg-[color:var(--surface-hover)] tx-hover text-[11px] inline-flex items-center gap-1.5 disabled:opacity-50"
            >
              <RefreshCw
                strokeWidth={1.5}
                className={`size-3 ${doctorLoading ? "animate-spin" : ""}`}
              />
              Refresh
            </button>
          </div>
        </header>

        {showAttach && (
          <div className="px-5 py-3 border-b border-[color:var(--border)] bg-[color:var(--surface-elevated)]">
            <div className="flex items-center justify-between mb-2">
              <div className="text-[12px] text-[color:var(--text-secondary)]">
                Pick another GA4 property to attach as additional context:
              </div>
              <button
                onClick={() => setShowAttach(false)}
                className="size-5 rounded-md hover:bg-[color:var(--surface-hover)] flex items-center justify-center text-[color:var(--text-tertiary)]"
              >
                <X strokeWidth={1.5} className="size-3" />
              </button>
            </div>
            {availableProps.length === 0 ? (
              <div className="text-[12px] text-[color:var(--text-tertiary)]">
                No more properties available in your Google account.
              </div>
            ) : (
              <div className="space-y-1 max-h-[200px] overflow-y-auto">
                {availableProps.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => attach(p.id)}
                    className="w-full text-left px-2 py-1.5 rounded-md hover:bg-[color:var(--surface-hover)] tx-hover text-[12px] flex items-center justify-between"
                  >
                    <span className="truncate">{p.display_name}</span>
                    <span className="text-[color:var(--text-tertiary)] font-mono text-[10px] tabular-nums ml-3 shrink-0">
                      {p.website_url || "no site"}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="divide-y divide-[color:var(--border)]">
          {primary && (
            <PropertyDoctorRow
              property={primary}
              report={doctorByPropId.get(primary.id) ?? null}
              loading={doctorLoading && !doctorByPropId.has(primary.id)}
              canDetach={properties.length > 1}
              canPromote={false}
              onSetPrimary={() => setPrimary(primary.id)}
              onDetach={() => detach(primary.id)}
            />
          )}
          {attached.map((p) => (
            <PropertyDoctorRow
              key={p.id}
              property={p}
              report={doctorByPropId.get(p.id) ?? null}
              loading={doctorLoading && !doctorByPropId.has(p.id)}
              canDetach={true}
              canPromote={true}
              onSetPrimary={() => setPrimary(p.id)}
              onDetach={() => detach(p.id)}
            />
          ))}
        </div>
      </section>
    </>
  );
}

function PropertyDoctorRow({
  property,
  report,
  loading,
  canDetach,
  canPromote,
  onSetPrimary,
  onDetach,
}: {
  property: Property;
  report: DoctorEntry | null;
  loading: boolean;
  canDetach: boolean;
  canPromote: boolean;
  onSetPrimary: () => void;
  onDetach: () => void;
}) {
  const r = report?.report ?? null;
  return (
    <div className="px-5 py-4">
      <div className="flex items-center justify-between gap-4 mb-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            {property.is_primary && (
              <span
                className="inline-flex items-center gap-1 text-[10px] font-mono uppercase tracking-[0.06em] px-1.5 py-0.5 rounded-full"
                style={{
                  background: "rgba(255,255,255,0.08)",
                  color: "var(--text-primary)",
                }}
              >
                <Star strokeWidth={2} className="size-2.5" />
                Primary
              </span>
            )}
            <span className="text-[14px] font-medium truncate">
              {property.display_name}
            </span>
            {r?.is_active && (
              <span
                aria-hidden
                className="size-1.5 rounded-full shrink-0"
                style={{ background: "var(--severity-low)" }}
                title="Active"
              />
            )}
            {r?.host_mismatch && (
              <AlertTriangle
                strokeWidth={1.5}
                className="size-3.5"
                style={{ color: "var(--severity-medium)" }}
              />
            )}
          </div>
          <div className="text-[11px] font-mono text-[color:var(--text-tertiary)] tabular-nums truncate mt-0.5">
            {property.ga4_property_id}
            {property.website_url ? ` · ${property.website_url}` : ""}
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {canPromote && (
            <button
              onClick={onSetPrimary}
              className="h-7 px-2 rounded-md border border-[color:var(--border)] hover:bg-[color:var(--surface-hover)] tx-hover text-[11px]"
            >
              Set primary
            </button>
          )}
          {canDetach && (
            <button
              onClick={onDetach}
              className="h-7 px-2 rounded-md hover:bg-[color:var(--surface-hover)] tx-hover text-[11px] text-[color:var(--text-tertiary)] hover:text-[color:var(--severity-high)]"
            >
              Detach
            </button>
          )}
          {property.website_url && (
            <a
              href={property.website_url}
              target="_blank"
              rel="noopener noreferrer"
              className="size-7 rounded-md hover:bg-[color:var(--surface-hover)] flex items-center justify-center text-[color:var(--text-tertiary)] hover:text-[color:var(--text-primary)]"
              title={`Open ${property.website_url}`}
            >
              <ExternalLink strokeWidth={1.5} className="size-3.5" />
            </a>
          )}
        </div>
      </div>

      {loading ? (
        <div className="text-[12px] text-[color:var(--text-tertiary)] font-mono">
          Checking last 28d…
        </div>
      ) : !r ? (
        <div className="text-[12px] text-[color:var(--severity-high)]">
          Doctor failed: {report?.error ?? "no data"}
        </div>
      ) : (
        <div className="space-y-3">
          {r.warnings.length > 0 && (
            <div
              className="rounded-md px-3 py-2 text-[12px] leading-relaxed"
              style={{
                background: "rgba(212, 165, 92, 0.08)",
                color: "var(--severity-medium)",
                border: "1px solid rgba(212, 165, 92, 0.2)",
              }}
            >
              <div className="flex items-start gap-1.5">
                <AlertTriangle
                  strokeWidth={1.5}
                  className="size-3.5 mt-0.5 shrink-0"
                />
                <ul className="space-y-1">
                  {r.warnings.map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Stat label="Events 28d" value={formatNum(r.total_events_28d)} mono />
            <Stat label="Users 28d" value={formatNum(r.total_users_28d)} mono />
            <Stat label="Sessions 28d" value={formatNum(r.total_sessions_28d)} mono />
            <Stat
              label="Activity"
              value={r.is_active ? `${r.activity_score}/100` : "idle"}
              mono
            />
          </div>

          {r.top_hosts.length > 0 && (
            <DistRow label="Top hosts" items={r.top_hosts.map((h) => ({
              key: h.host,
              value: h.pct,
              count: h.events,
              label: h.host,
            }))} declared={r.declared_host} />
          )}
          {r.top_sources.length > 0 && (
            <DistRow label="Top source / medium" items={r.top_sources.map((s) => ({
              key: s.source_medium,
              value: s.pct,
              count: s.sessions,
              label: s.source_medium,
            }))} declared={null} />
          )}
        </div>
      )}
    </div>
  );
}

function DistRow({
  label,
  items,
  declared,
}: {
  label: string;
  items: Array<{ key: string; value: number; count: number; label: string }>;
  declared: string | null;
}) {
  const top = items.slice(0, 5);
  return (
    <div>
      <div className="text-[10px] uppercase tracking-[0.08em] text-[color:var(--text-tertiary)] font-mono mb-1.5">
        {label}
      </div>
      <div className="space-y-1.5">
        {top.map((it) => {
          const isDeclared =
            declared &&
            it.label.toLowerCase().replace(/^www\./, "") ===
              declared.toLowerCase().replace(/^www\./, "");
          return (
            <div key={it.key} className="flex items-center gap-2 text-[12px]">
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-2">
                  <span
                    className={`truncate ${isDeclared ? "text-[color:var(--text-primary)] font-medium" : "text-[color:var(--text-secondary)]"}`}
                  >
                    {it.label}
                    {isDeclared && (
                      <span className="ml-1.5 text-[10px] font-mono uppercase tracking-[0.06em] text-[color:var(--text-tertiary)]">
                        (declared)
                      </span>
                    )}
                  </span>
                  <span className="font-mono tabular-nums text-[11px] text-[color:var(--text-tertiary)] ml-auto shrink-0">
                    {it.value.toFixed(1)}% · {formatNum(it.count)}
                  </span>
                </div>
                <div className="h-1 rounded-full bg-[color:var(--border)] overflow-hidden mt-1">
                  <div
                    className="h-full"
                    style={{
                      width: `${Math.min(100, it.value)}%`,
                      background: isDeclared
                        ? "var(--severity-low)"
                        : "var(--text-secondary)",
                    }}
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function StatCard({
  href,
  icon: Icon,
  label,
  primary,
  primaryLabel,
  accent,
  subtitle,
}: {
  href: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  label: string;
  primary: number;
  primaryLabel: string;
  accent: string | null;
  subtitle: string;
}) {
  return (
    <Link
      href={href}
      className="rounded-lg border border-[color:var(--border)] bg-[color:var(--surface)] p-4 hover:bg-[color:var(--surface-hover)] hover:border-[color:var(--border-strong)] tx-hover"
    >
      <div className="flex items-center gap-2 mb-2 text-[12px] text-[color:var(--text-secondary)]">
        <Icon strokeWidth={1.5} className="size-3.5" />
        {label}
      </div>
      <div className="flex items-baseline gap-1.5">
        <span className="font-mono text-[28px] font-medium tabular-nums leading-none">
          {primary}
        </span>
        <span className="text-[12px] text-[color:var(--text-tertiary)]">{primaryLabel}</span>
      </div>
      {accent && (
        <div className="text-[11px] font-mono tabular-nums text-[color:var(--text-secondary)] mt-1.5">
          {accent}
        </div>
      )}
      <div className="text-[11px] font-mono tabular-nums text-[color:var(--text-tertiary)] mt-0.5">
        {subtitle}
      </div>
    </Link>
  );
}

function Stat({
  label,
  value,
  mono,
}: {
  label: string;
  value: string | number;
  mono?: boolean;
}) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-[0.08em] text-[color:var(--text-tertiary)] font-mono">
        {label}
      </div>
      <div
        className={`mt-1 text-[15px] ${mono ? "font-mono tabular-nums" : "font-serif"} text-[color:var(--text-primary)] truncate`}
      >
        {value}
      </div>
    </div>
  );
}

function contextBadge(status: string): {
  label: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  color: string;
  bg: string;
} {
  switch (status) {
    case "ready":
      return {
        label: "ready",
        icon: CheckCircle2,
        color: "var(--severity-low)",
        bg: "rgba(126, 170, 138, 0.12)",
      };
    case "partial":
      return {
        label: "partial",
        icon: AlertCircle,
        color: "var(--severity-medium)",
        bg: "rgba(212, 165, 92, 0.12)",
      };
    case "crawling":
    case "embedding":
      return {
        label: status,
        icon: Clock,
        color: "var(--text-primary)",
        bg: "var(--surface-elevated)",
      };
    case "failed":
      return {
        label: "failed",
        icon: AlertCircle,
        color: "var(--severity-high)",
        bg: "rgba(208, 72, 72, 0.12)",
      };
    default:
      return {
        label: "not built",
        icon: Circle,
        color: "var(--text-tertiary)",
        bg: "var(--surface-elevated)",
      };
  }
}

function timeAgo(unix: number): string {
  const diff = Math.floor(Date.now() / 1000) - unix;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function formatNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString("en-IN");
}

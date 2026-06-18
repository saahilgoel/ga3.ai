"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { MessageCircleQuestion, Pin, ArrowUpRight, Layers } from "lucide-react";
import { MobileNavSheet } from "@/components/mobile-nav-sheet";
import { Monogram } from "@/components/monogram";
import { AGENT_MAP, AGENTS } from "@/lib/agents";
import { AGENT_HEX, type Visualization } from "@/lib/viz";
import { VisualizationRenderer } from "@/components/viz";
import { MarkdownMessage } from "@/components/markdown-message";
import { pickTagline } from "@/lib/polish";
import { BriefTileGrid } from "@/components/brief-tile-grid";
import { OnboardingToast } from "@/components/onboarding-toast";

type Finding = {
  id: number;
  agent_id: string;
  title: string;
  body: string;
  severity: "high" | "medium" | "low";
  question: string | null;
  status: string;
  created_at: number;
  visualization: Visualization | null;
  source_property_ids: number[] | null;
};

export function FeedClient({
  workspace,
  activePropertyNames,
}: {
  workspace: {
    id: number;
    name: string;
    kind: "single" | "union";
    property_count: number;
  };
  activePropertyNames: string[];
}) {
  const router = useRouter();
  const [findings, setFindings] = useState<Finding[] | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<number | null>(null);
  const [lastScanAt, setLastScanAt] = useState<number | null>(null);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [emptyTagline] = useState(() => pickTagline());

  const isUnion = workspace.kind === "union";

  async function scanNow() {
    if (scanning) return;
    setScanError(null);
    setScanning(true);
    try {
      const res = await fetch("/api/scan", { method: "POST" });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      setLastScanAt(Math.floor(Date.now() / 1000));
      await load();
    } catch (err: unknown) {
      setScanError(err instanceof Error ? err.message : String(err));
    } finally {
      setScanning(false);
    }
  }

  async function load() {
    const res = await fetch("/api/findings");
    if (!res.ok) return;
    const data = (await res.json()) as { findings: Finding[]; unread_count: number };
    setFindings(data.findings);
    setUnreadCount(data.unread_count);
    if (data.findings.length > 0) {
      setLastScanAt(Math.max(...data.findings.map((f) => f.created_at)));
    }
  }

  useEffect(() => {
    load();
    const t = setInterval(() => {
      if (document.visibilityState === "visible") load();
    }, 60_000);
    return () => clearInterval(t);
  }, []);

  // Mark first batch as viewed after a small delay
  useEffect(() => {
    if (!findings || findings.length === 0) return;
    if (unreadCount === 0) return;
    const newOnes = findings.filter((f) => f.status === "new").slice(0, 5);
    if (newOnes.length === 0) return;
    const timer = setTimeout(() => {
      Promise.all(
        newOnes.map((f) =>
          fetch(`/api/findings/${f.id}/status`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ status: "viewed" }),
          }).catch(() => null)
        )
      );
    }, 3000);
    return () => clearTimeout(timer);
  }, [findings, unreadCount]);

  async function pin(f: Finding) {
    setBusyAction(f.id);
    await fetch("/api/pinned", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: f.title,
        body: f.body,
        agent: f.agent_id,
        data: { finding_id: f.id },
      }),
    }).catch(() => {});
    await fetch(`/api/findings/${f.id}/status`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: "pinned" }),
    }).catch(() => {});
    setBusyAction(null);
    load();
  }

  async function dismiss(f: Finding) {
    setBusyAction(f.id);
    await fetch(`/api/findings/${f.id}/status`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: "dismissed" }),
    }).catch(() => {});
    setFindings((curr) => (curr ? curr.filter((x) => x.id !== f.id) : curr));
    setBusyAction(null);
  }

  async function investigate(f: Finding) {
    setBusyAction(f.id);
    try {
      const res = await fetch(`/api/findings/${f.id}/investigate`, { method: "POST" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { redirect_url: string };
      window.location.href = data.redirect_url;
    } catch (err) {
      setScanError(err instanceof Error ? err.message : String(err));
      setBusyAction(null);
    }
  }

  const grouped = useMemo(() => groupByDay(findings ?? []), [findings]);
  void router;

  return (
    <div className="flex-1 flex flex-col min-w-0 relative overflow-hidden">
      <MobileNavSheet
        open={mobileNavOpen}
        onClose={() => setMobileNavOpen(false)}
        activeAgentId={null}
      />
      <OnboardingToast />

        <AnimatePresence>
          {scanning && (
            <motion.div
              key="scan-strip"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
              className="absolute left-0 right-0 z-20 h-[2px] overflow-hidden"
              style={{ top: 48 }}
            >
              <div
                className="h-full"
                style={{
                  background:
                    "linear-gradient(90deg, transparent, var(--text-primary), transparent)",
                  opacity: 0.4,
                  width: "40%",
                  animation: "scanStripe 1.5s linear infinite",
                }}
              />
            </motion.div>
          )}
        </AnimatePresence>

        <div className="flex-1 overflow-y-auto">
          <div className="mx-auto w-full px-4 sm:px-6 lg:px-8 max-w-full lg:max-w-[760px] py-6 lg:py-8">
            <header className="flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-2 mb-6">
              <div>
                <h1 className="font-mono text-[28px] font-medium tracking-[-0.015em] leading-[1.1]">
                  Newsroom
                </h1>
                <div className="text-[12px] text-[color:var(--text-tertiary)] mt-1.5 font-mono tabular-nums flex items-center gap-2 flex-wrap">
                  {findings === null
                    ? "loading…"
                    : findings.length === 0
                    ? "no findings yet"
                    : `${findings.length} findings · ${unreadCount} unread`}
                  {isUnion && (
                    <span className="inline-flex items-center gap-1">
                      <span className="text-[color:var(--text-tertiary)]">·</span>
                      <Layers strokeWidth={1.5} className="size-3" />
                      <span>{workspace.property_count} properties</span>
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-3 text-[12px] text-[color:var(--text-tertiary)]">
                {lastScanAt && (
                  <span className="font-mono tabular-nums">
                    last scan: {timeAgo(lastScanAt)}
                  </span>
                )}
                <button
                  onClick={scanNow}
                  disabled={scanning}
                  className="h-8 px-2.5 rounded-md border border-[color:var(--border)] hover:bg-[color:var(--surface-hover)] hover:text-[color:var(--text-primary)] disabled:opacity-50 tx-hover"
                >
                  {scanning ? "scanning…" : "re-scan"}
                </button>
              </div>
            </header>

            {scanError && (
              <div className="text-[12px] text-[color:var(--severity-high)] mb-4 rounded-md border border-[color:var(--border)] px-3 py-2">
                {scanError}
              </div>
            )}

            {findings === null && <FeedSkeleton />}

            {findings && findings.length === 0 && !scanning && (
              <EmptyFeed onScan={scanNow} tagline={emptyTagline} />
            )}

            {findings && findings.length === 0 && (
              <section className="mt-10">
                <div className="font-mono text-[18px] font-medium tracking-tight mb-1">
                  Start with a Brief.
                </div>
                <p className="text-[13px] text-[color:var(--text-secondary)] mb-4">
                  One click gets you a shareable report — no chat required.
                </p>
                <BriefTileGrid highlight="monday_morning" />
              </section>
            )}

            {findings && findings.length > 0 && (
              <div className="space-y-8">
                <AnimatePresence>
                  {grouped.map((group) => (
                    <motion.section
                      key={group.label}
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.18, ease: [0.2, 0, 0, 1] }}
                    >
                      <div className="flex items-center justify-between mb-1.5 pb-2 border-b border-[color:var(--border)]">
                        <h2 className="text-[11px] font-semibold tracking-[0.08em] uppercase text-[color:var(--text-secondary)]">
                          {group.label}
                        </h2>
                        <span className="text-[11px] font-mono tabular-nums text-[color:var(--text-tertiary)]">
                          {group.items.length} {group.items.length === 1 ? "finding" : "findings"}
                        </span>
                      </div>
                      <div>
                        <AnimatePresence>
                          {group.items.map((f) => (
                            <FindingRow
                              key={f.id}
                              finding={f}
                              isUnion={isUnion}
                              busy={busyAction === f.id}
                              onInvestigate={() => investigate(f)}
                              onPin={() => pin(f)}
                              onDismiss={() => dismiss(f)}
                            />
                          ))}
                        </AnimatePresence>
                      </div>
                    </motion.section>
                  ))}
                </AnimatePresence>
              </div>
            )}
          </div>
      </div>
    </div>
  );
}

function FindingRow({
  finding,
  isUnion,
  busy,
  onInvestigate,
  onPin,
  onDismiss,
}: {
  finding: Finding;
  isUnion: boolean;
  busy: boolean;
  onInvestigate: () => void;
  onPin: () => void;
  onDismiss: () => void;
}) {
  const agent = AGENT_MAP[finding.agent_id];
  const accent = agent ? AGENT_HEX[agent.color] : AGENT_HEX.default;
  const investigateLabel = finding.question ? "Yes, investigate" : "Investigate";
  void isUnion;

  return (
    <motion.article
      layout
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, height: 0, marginTop: 0, marginBottom: 0 }}
      transition={{ duration: 0.2, ease: [0.2, 0, 0, 1] }}
      className="border-b border-[color:var(--border)] py-4 group"
    >
      <header className="flex items-center gap-2 text-[12px] flex-wrap">
        {agent && <Monogram agent={agent} size={20} />}
        {agent && (
          <span className="font-mono text-[14px] font-medium text-[color:var(--text-primary)]">
            {agent.name}
          </span>
        )}
        <Dot />
        <span className="font-mono tabular-nums text-[color:var(--text-tertiary)]">
          {timeAgo(finding.created_at)}
        </span>
        <Dot />
        <SeverityLabel severity={finding.severity} />
      </header>

      <h3 className="font-mono text-[18px] font-medium leading-[1.3] mt-2 text-[color:var(--text-primary)]">
        {finding.title}
      </h3>
      <div className="flex flex-col lg:flex-row gap-4 items-start mt-1">
        <div className="flex-1 min-w-0 max-w-full lg:max-w-[460px] text-[color:var(--text-secondary)]">
          <MarkdownMessage content={finding.body} />
        </div>
        {finding.visualization && (
          <div className="shrink-0 w-full lg:w-[280px]">
            <VisualizationRenderer
              viz={finding.visualization}
              agentId={finding.agent_id}
              compact
            />
          </div>
        )}
      </div>

      {finding.question && (
        <div className="flex items-start gap-2 mt-3 text-[13px] text-[color:var(--text-primary)]">
          <MessageCircleQuestion
            strokeWidth={1.5}
            className="size-4 mt-0.5 shrink-0"
            style={{ color: accent }}
          />
          <span className="italic text-[color:var(--text-secondary)]">{finding.question}</span>
        </div>
      )}

      <div className="flex items-center gap-1.5 mt-3 flex-wrap">
        <button
          onClick={onInvestigate}
          disabled={busy}
          className="h-7 px-2.5 rounded-md border border-[color:var(--border-strong)] bg-[color:var(--surface-elevated)] hover:bg-[color:var(--surface-hover)] disabled:opacity-50 tx-hover text-[12px] font-medium text-[color:var(--text-primary)] inline-flex items-center gap-1.5"
        >
          {busy ? "Working…" : investigateLabel}
          <ArrowUpRight strokeWidth={1.5} className="size-3.5 opacity-60" />
        </button>
        <button
          onClick={onPin}
          disabled={busy}
          className="h-7 px-2.5 rounded-md border border-[color:var(--border)] hover:bg-[color:var(--surface-hover)] disabled:opacity-50 tx-hover text-[12px] text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)] inline-flex items-center gap-1.5"
        >
          <Pin strokeWidth={1.5} className="size-3.5" />
          Pin
        </button>
        <button
          onClick={onDismiss}
          disabled={busy}
          className="h-7 px-2.5 rounded-md text-[color:var(--text-tertiary)] hover:text-[color:var(--text-primary)] hover:bg-[color:var(--surface-hover)] disabled:opacity-50 tx-hover text-[12px] ml-auto"
        >
          Dismiss
        </button>
      </div>
    </motion.article>
  );
}

function SeverityLabel({ severity }: { severity: "high" | "medium" | "low" }) {
  const color =
    severity === "high"
      ? "var(--severity-high)"
      : severity === "medium"
      ? "var(--severity-medium)"
      : "var(--severity-low)";
  const label = severity === "medium" ? "MED" : severity.toUpperCase();
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        aria-hidden
        className="size-1.5 rounded-full"
        style={{ background: color }}
      />
      <span
        className="font-mono text-[11px] tracking-[0.06em] font-medium"
        style={{ color }}
      >
        {label}
      </span>
    </span>
  );
}

function Dot() {
  return <span className="text-[color:var(--text-tertiary)] text-[10px]">·</span>;
}

function FeedSkeleton() {
  return (
    <div className="space-y-4">
      {[0, 1, 2].map((i) => (
        <div key={i} className="py-4 border-b border-[color:var(--border)] space-y-2.5">
          <div className="flex gap-2">
            <div className="skeleton h-3 w-24 rounded" />
            <div className="skeleton h-3 w-16 rounded" />
          </div>
          <div className="skeleton h-4 w-2/3 rounded" />
          <div className="skeleton h-3 w-full rounded" />
          <div className="skeleton h-3 w-4/5 rounded" />
        </div>
      ))}
    </div>
  );
}

function EmptyFeed({ onScan, tagline }: { onScan: () => void; tagline: string }) {
  return (
    <div className="max-w-[520px] py-10 lg:py-16">
      <div className="text-[11px] uppercase tracking-[0.08em] text-[color:var(--text-tertiary)] font-mono mb-3">
        {tagline}
      </div>
      <h2 className="font-mono text-[24px] font-medium tracking-[-0.015em] mb-2">
        Awaiting first scan.
      </h2>
      <p className="text-[14px] text-[color:var(--text-secondary)] leading-[1.65] mb-6">
        Five agents are waking up. Findings will appear here every four hours, or whenever you
        tap re-scan.
      </p>
      <div className="flex items-center gap-2 mb-6">
        {AGENTS.map((a, i) => (
          <span
            key={a.id}
            className="size-6 rounded-full inline-flex items-center justify-center bg-[color:var(--surface-elevated)]"
            style={{
              border: `1px solid ${AGENT_HEX[a.color]}`,
              animation: `monogramBreathe ${2.4 + i * 0.1}s ease-in-out infinite`,
            }}
          >
            <span className="font-mono font-medium text-[10px] text-[color:var(--text-secondary)]">
              {a.monogram}
            </span>
          </span>
        ))}
      </div>
      <button
        onClick={onScan}
        className="h-9 px-4 rounded-md bg-[color:var(--text-primary)] hover:bg-white text-[color:var(--bg)] tx-hover text-[13px] font-medium inline-flex items-center gap-1.5"
      >
        Run first scan
      </button>
    </div>
  );
}

function groupByDay(findings: Finding[]): Array<{ label: string; items: Finding[] }> {
  const now = new Date();
  const today = startOfDay(now).getTime() / 1000;
  const yesterday = today - 86400;

  const buckets: Record<string, Finding[]> = {};
  const order: string[] = [];

  for (const f of findings) {
    let label: string;
    if (f.created_at >= today) label = "Today";
    else if (f.created_at >= yesterday) label = "Yesterday";
    else {
      const d = new Date(f.created_at * 1000);
      label = d.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: d.getFullYear() === now.getFullYear() ? undefined : "numeric",
      });
    }
    if (!buckets[label]) {
      buckets[label] = [];
      order.push(label);
    }
    buckets[label].push(f);
  }

  return order.map((label) => ({ label, items: buckets[label] }));
}

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function timeAgo(unix: number): string {
  const diff = Math.floor(Date.now() / 1000) - unix;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) {
    const h = Math.floor(diff / 3600);
    return `${h}h ago`;
  }
  return `${Math.floor(diff / 86400)}d ago`;
}

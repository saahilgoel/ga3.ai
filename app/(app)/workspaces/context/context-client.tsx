"use client";

import { useEffect, useRef, useState } from "react";
import { LiveBuildFeed } from "@/components/context/live-build-feed";
import {
  Upload,
  Trash2,
  RefreshCcw,
  FileText,
  ChevronRight,
  ExternalLink,
  X,
} from "lucide-react";

type Status = {
  status?: string;
  current_step?: string | null;
  progress_pct?: number;
  brand_name?: string | null;
  document_count?: number;
  chunk_count?: number;
  total_credits_used?: number;
  last_full_refresh_at?: number | null;
  failed_sources?: string | null;
  error_text?: string | null;
};

type SourceSummary = {
  source_type: string;
  count: number;
  chunk_count: number;
  fetched_at: number | null;
};

type UploadRow = {
  id: number;
  filename: string | null;
  title: string | null;
  fetched_at: number;
  chunk_count: number;
};

const SOURCE_LABELS: Record<string, string> = {
  website: "Website pages",
  serp: "Brand search results",
  news: "News mentions",
  review_trustpilot: "Trustpilot reviews",
  review_google_maps: "Google Maps reviews",
  review_indeed: "Indeed reviews",
  linkedin_company: "LinkedIn company",
  linkedin_post: "LinkedIn posts",
  twitter_post: "X / Twitter mentions",
  ai_overview: "Google AI Overview",
  trends_summary: "Search trends",
};

export function ContextClient({
  workspaceName,
  initialStatus,
  initialSources,
  initialUploads,
}: {
  workspaceName: string;
  initialStatus: Status | null;
  initialSources: SourceSummary[];
  initialUploads: UploadRow[];
}) {
  const [status, setStatus] = useState<Status | null>(initialStatus);
  const [sources, setSources] = useState<SourceSummary[]>(initialSources);
  const [uploads, setUploads] = useState<UploadRow[]>(initialUploads);
  const [busy, setBusy] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [docsBySource, setDocsBySource] = useState<Record<string, DocRow[]>>({});
  const [viewDoc, setViewDoc] = useState<DocDetail | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function loadDocs(source_type: string) {
    const res = await fetch(
      `/api/context/documents?source_type=${encodeURIComponent(source_type)}`
    );
    if (!res.ok) return;
    const data = (await res.json()) as { documents: DocRow[] };
    setDocsBySource((curr) => ({ ...curr, [source_type]: data.documents }));
  }

  async function toggleSource(source_type: string) {
    if (expanded === source_type) {
      setExpanded(null);
    } else {
      setExpanded(source_type);
      if (!docsBySource[source_type]) await loadDocs(source_type);
    }
  }

  async function openDoc(id: number) {
    const res = await fetch(`/api/context/documents/${id}`);
    if (!res.ok) return;
    const data = (await res.json()) as DocDetail;
    setViewDoc(data);
  }

  async function reload() {
    const res = await fetch("/api/context/status");
    if (!res.ok) return;
    const data = (await res.json()) as {
      status: Status | null;
      sources: SourceSummary[];
      uploads: UploadRow[];
    };
    setStatus(data.status);
    setSources(data.sources);
    setUploads(data.uploads);
  }

  useEffect(() => {
    const running = status?.status === "crawling" || status?.status === "embedding";
    if (!running) return;
    const t = setInterval(() => {
      if (document.visibilityState === "visible") {
        reload();
        if (expanded) loadDocs(expanded);
      }
    }, 4000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status?.status, expanded]);

  async function buildAll() {
    setBusy("build");
    await fetch("/api/context/build", { method: "POST" });
    setBusy(null);
    reload();
  }

  async function refreshSource(source_type: string) {
    setBusy(`refresh-${source_type}`);
    await fetch("/api/context/refresh", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ source_type }),
    });
    setBusy(null);
    setTimeout(reload, 1000);
  }

  async function clearAll() {
    if (
      !confirm(
        "Delete all crawled and uploaded context for this workspace? Agents will lose business context until you rebuild."
      )
    )
      return;
    setBusy("clear");
    await fetch("/api/context/clear", { method: "POST" });
    setBusy(null);
    reload();
  }

  async function deleteUpload(id: number) {
    if (!confirm("Delete this uploaded document?")) return;
    setBusy(`del-${id}`);
    await fetch(`/api/context/upload/${id}`, { method: "DELETE" });
    setBusy(null);
    reload();
  }

  async function uploadFile(file: File) {
    setBusy("upload");
    const form = new FormData();
    form.append("file", file);
    const res = await fetch("/api/context/upload", { method: "POST", body: form });
    setBusy(null);
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      alert(body.error ?? `Upload failed (HTTP ${res.status})`);
      return;
    }
    reload();
  }

  const totalChunks =
    sources.reduce((a, s) => a + s.chunk_count, 0) +
    uploads.reduce((a, u) => a + u.chunk_count, 0);
  const isReady = status?.status === "ready" || status?.status === "partial";
  const isRunning =
    status?.status === "crawling" || status?.status === "embedding";
  const isFailed = status?.status === "failed";
  const isEmpty =
    !status || status.status === "pending" || status.status === "declined";

  return (
    <>
      <header className="flex items-baseline justify-between mb-6 flex-wrap gap-2">
        <div>
          <div className="text-[11px] uppercase tracking-[0.08em] text-[color:var(--text-tertiary)] font-mono">
            Customer Intelligence
          </div>
          <h1 className="font-serif text-[28px] font-medium tracking-[-0.015em] leading-[1.1] mt-1">
            {status?.brand_name || workspaceName}
          </h1>
          <p className="text-[12px] font-mono tabular-nums text-[color:var(--text-tertiary)] mt-1.5">
            {totalChunks} chunks · {status?.total_credits_used ?? 0} credits used
            {status?.last_full_refresh_at && (
              <> · last refresh {timeAgo(status.last_full_refresh_at)}</>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {(isEmpty || isFailed) && (
            <button
              onClick={buildAll}
              disabled={busy === "build"}
              className="h-8 px-3 rounded-md bg-[color:var(--text-primary)] text-[color:var(--bg)] text-[12px] font-medium hover:bg-white tx-hover disabled:opacity-50"
            >
              {busy === "build"
                ? "Starting…"
                : isFailed
                ? "Retry build"
                : "Build context"}
            </button>
          )}
          {isReady && (
            <button
              onClick={buildAll}
              disabled={busy === "build"}
              className="h-8 px-3 rounded-md border border-[color:var(--border)] text-[12px] hover:bg-[color:var(--surface-hover)] tx-hover disabled:opacity-50"
            >
              Refresh all
            </button>
          )}
          {(isReady || isRunning || isFailed) && (
            <button
              onClick={clearAll}
              disabled={busy === "clear"}
              className="h-8 px-3 rounded-md border border-[color:var(--border)] text-[12px] text-[color:var(--severity-high)] hover:bg-[color:var(--surface-hover)] tx-hover disabled:opacity-50"
            >
              {busy === "clear" ? "Deleting…" : "Delete all"}
            </button>
          )}
        </div>
      </header>

      {isFailed && status?.error_text && (
        <div className="mb-6 rounded-md border border-[color:var(--severity-high)]/30 bg-[color:var(--severity-high)]/8 px-4 py-3">
          <div className="text-[11px] uppercase tracking-[0.08em] text-[color:var(--severity-high)] font-mono font-medium mb-1">
            Build failed
          </div>
          <div className="text-[13px] text-[color:var(--text-primary)] leading-relaxed">
            {status.error_text}
          </div>
          <div className="text-[12px] text-[color:var(--text-tertiary)] mt-2">
            Click <span className="text-[color:var(--text-primary)]">Retry build</span>{" "}
            above. We&apos;ll attempt to fetch the website URL from GA4 directly this
            time. If that still fails, the property may not have a Web Data Stream — open
            GA4 Admin and confirm one exists with a default URL.
          </div>
        </div>
      )}

      {isRunning && (
        <div className="mb-6 rounded-md border border-[color:var(--border)] bg-[color:var(--surface-elevated)] px-3 py-2.5">
          <div className="flex items-center gap-2 text-[13px]">
            <span className="inline-block size-1.5 rounded-full bg-[color:var(--text-primary)] animate-pulse" />
            <span className="font-medium">{status?.current_step ?? "Working…"}</span>
            <span className="text-[color:var(--text-tertiary)] font-mono tabular-nums ml-auto">
              {status?.progress_pct ?? 0}%
            </span>
          </div>
          <div className="h-1 mt-2 rounded-full bg-[color:var(--border)] overflow-hidden">
            <div
              className="h-full bg-[color:var(--text-primary)] transition-all"
              style={{ width: `${status?.progress_pct ?? 0}%` }}
            />
          </div>
        </div>
      )}

      {isRunning && (
        <LiveBuildFeed
          site={workspaceName}
          name={status?.brand_name || workspaceName}
        />
      )}

      {status?.failed_sources && (
        <div className="mb-6 rounded-md border border-[color:var(--border)] bg-[color:var(--surface)] px-3 py-2 text-[12px] text-[color:var(--severity-medium)]">
          Some sources failed:{" "}
          <code className="font-mono text-[11px]">{status.failed_sources}</code>
        </div>
      )}

      <section className="mb-10">
        <h2 className="text-[11px] uppercase tracking-[0.08em] text-[color:var(--text-secondary)] font-medium mb-2 pb-2 border-b border-[color:var(--border)]">
          Auto-generated
        </h2>
        {sources.length === 0 ? (
          <div className="text-[13px] text-[color:var(--text-tertiary)] py-6">
            {isEmpty
              ? "No context built yet. Click Build context to start."
              : "Crawl in progress — chunks will appear as sources finish."}
          </div>
        ) : (
          <div className="rounded-md border border-[color:var(--border)] overflow-hidden">
            <div className="text-[13px]">
              <div className="flex bg-[color:var(--surface-elevated)] border-b border-[color:var(--border)] text-[color:var(--text-secondary)] font-medium">
                <div className="flex-1 px-3 py-2">Source</div>
                <div className="w-[80px] px-3 py-2">Docs</div>
                <div className="w-[80px] px-3 py-2">Chunks</div>
                <div className="w-[120px] px-3 py-2">Fetched</div>
                <div className="w-[60px]" />
              </div>
              {sources.map((s) => {
                const isOpen = expanded === s.source_type;
                const docs = docsBySource[s.source_type];
                return (
                  <div
                    key={s.source_type}
                    className="border-b border-[color:var(--border)] last:border-b-0"
                  >
                    <button
                      onClick={() => toggleSource(s.source_type)}
                      className="w-full flex items-center hover:bg-[color:var(--surface-hover)] text-left tx-hover"
                    >
                      <div className="flex-1 px-3 py-2 flex items-center gap-2">
                        <ChevronRight
                          strokeWidth={1.5}
                          className={`size-3.5 text-[color:var(--text-tertiary)] transition-transform ${isOpen ? "rotate-90" : ""}`}
                        />
                        {SOURCE_LABELS[s.source_type] || s.source_type}
                      </div>
                      <div className="w-[80px] px-3 py-2 font-mono tabular-nums text-[color:var(--text-tertiary)]">
                        {s.count}
                      </div>
                      <div className="w-[80px] px-3 py-2 font-mono tabular-nums text-[color:var(--text-tertiary)]">
                        {s.chunk_count}
                      </div>
                      <div className="w-[120px] px-3 py-2 font-mono tabular-nums text-[color:var(--text-tertiary)]">
                        {s.fetched_at ? timeAgo(s.fetched_at) : "—"}
                      </div>
                      <div className="w-[60px] px-3 py-2 text-right">
                        <span
                          role="button"
                          tabIndex={0}
                          onClick={(e) => {
                            e.stopPropagation();
                            refreshSource(s.source_type);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.stopPropagation();
                              refreshSource(s.source_type);
                            }
                          }}
                          title="Refresh this source"
                          className="size-7 rounded-md hover:bg-[color:var(--surface-elevated)] inline-flex items-center justify-center text-[color:var(--text-tertiary)] hover:text-[color:var(--text-primary)]"
                        >
                          <RefreshCcw
                            strokeWidth={1.5}
                            className={`size-3.5 ${busy === `refresh-${s.source_type}` ? "animate-spin" : ""}`}
                          />
                        </span>
                      </div>
                    </button>
                    {isOpen && (
                      <div className="bg-[color:var(--bg)] border-t border-[color:var(--border)] py-1">
                        {!docs && (
                          <div className="px-6 py-2 text-[12px] text-[color:var(--text-tertiary)]">
                            Loading documents…
                          </div>
                        )}
                        {docs && docs.length === 0 && (
                          <div className="px-6 py-2 text-[12px] text-[color:var(--text-tertiary)]">
                            No documents yet.
                          </div>
                        )}
                        {docs &&
                          docs.map((d) => (
                            <button
                              key={d.id}
                              onClick={() => openDoc(d.id)}
                              className="w-full text-left px-6 py-2 hover:bg-[color:var(--surface-hover)] tx-hover flex items-start gap-3 group"
                            >
                              <div className="flex-1 min-w-0">
                                <div className="text-[12.5px] text-[color:var(--text-primary)] truncate">
                                  {d.title || d.filename || d.source_url || `doc #${d.id}`}
                                </div>
                                {d.source_url && (
                                  <div className="text-[11px] font-mono text-[color:var(--text-tertiary)] truncate">
                                    {d.source_url}
                                  </div>
                                )}
                                {d.preview && (
                                  <div className="text-[11.5px] text-[color:var(--text-secondary)] line-clamp-2 mt-0.5 leading-snug">
                                    {d.preview}
                                  </div>
                                )}
                              </div>
                              <div className="text-[10px] font-mono tabular-nums text-[color:var(--text-tertiary)] shrink-0 text-right">
                                <div>{d.chunk_count} chunks</div>
                                <div>{timeAgo(d.fetched_at)}</div>
                              </div>
                            </button>
                          ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </section>

      <section>
        <div className="flex items-baseline justify-between mb-2 pb-2 border-b border-[color:var(--border)]">
          <h2 className="text-[11px] uppercase tracking-[0.08em] text-[color:var(--text-secondary)] font-medium">
            Your knowledge
          </h2>
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={busy === "upload"}
            className="h-7 px-2.5 rounded-md border border-[color:var(--border)] text-[12px] hover:bg-[color:var(--surface-hover)] tx-hover inline-flex items-center gap-1.5 disabled:opacity-50"
          >
            <Upload strokeWidth={1.5} className="size-3.5" />
            {busy === "upload" ? "Uploading…" : "Upload file"}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".md,.txt,.pdf"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) uploadFile(f);
              e.target.value = "";
            }}
          />
        </div>
        {uploads.length === 0 ? (
          <div className="text-[13px] text-[color:var(--text-tertiary)] py-6">
            Upload markdown, txt, or PDF files (brand voice guidelines, ICPs, strategy
            docs) and the agents will cite them directly.
          </div>
        ) : (
          <div className="space-y-1">
            {uploads.map((u) => (
              <div
                key={u.id}
                className="flex items-center gap-3 py-2 border-b border-[color:var(--border)] last:border-b-0"
              >
                <FileText
                  strokeWidth={1.5}
                  className="size-4 text-[color:var(--text-tertiary)] shrink-0"
                />
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] truncate">{u.title || u.filename}</div>
                  <div className="text-[11px] font-mono tabular-nums text-[color:var(--text-tertiary)]">
                    {u.chunk_count} chunks · uploaded {timeAgo(u.fetched_at)}
                  </div>
                </div>
                <button
                  onClick={() => deleteUpload(u.id)}
                  disabled={busy === `del-${u.id}`}
                  className="size-7 rounded-md hover:bg-[color:var(--surface-hover)] inline-flex items-center justify-center text-[color:var(--text-tertiary)] hover:text-[color:var(--severity-high)] disabled:opacity-50"
                  aria-label="Delete"
                >
                  <Trash2 strokeWidth={1.5} className="size-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {viewDoc && <DocDetailModal data={viewDoc} onClose={() => setViewDoc(null)} />}
    </>
  );
}

type DocRow = {
  id: number;
  source_type: string;
  source_url: string | null;
  title: string | null;
  fetched_at: number;
  user_uploaded: boolean;
  filename: string | null;
  metadata: unknown;
  preview: string;
  chunk_count: number;
};

type DocDetail = {
  document: {
    id: number;
    source_type: string;
    source_url: string | null;
    title: string | null;
    content: string;
    metadata: unknown;
    fetched_at: number;
    user_uploaded: boolean;
    filename: string | null;
  };
  chunks: Array<{ id: number; chunk_index: number; content: string; token_count: number }>;
};

function DocDetailModal({ data, onClose }: { data: DocDetail; onClose: () => void }) {
  const { document: d, chunks } = data;
  return (
    <>
      <div
        onClick={onClose}
        className="fixed inset-0 z-50 bg-black/60"
      />
      <div
        className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-[min(720px,94vw)] max-h-[88vh] rounded-xl bg-[color:var(--surface)] border border-[color:var(--border)] flex flex-col"
        style={{ boxShadow: "0 8px 40px rgba(0,0,0,0.55)" }}
      >
        <header className="flex items-center justify-between px-5 py-3 border-b border-[color:var(--border)]">
          <div className="min-w-0 flex-1">
            <div className="text-[10px] uppercase tracking-[0.08em] text-[color:var(--text-tertiary)] font-mono">
              {SOURCE_LABELS[d.source_type] || d.source_type} · #{d.id}
            </div>
            <div className="font-serif text-[16px] font-medium tracking-tight truncate mt-0.5">
              {d.title || d.filename || `Document ${d.id}`}
            </div>
          </div>
          <button
            onClick={onClose}
            className="size-8 rounded-md hover:bg-[color:var(--surface-hover)] flex items-center justify-center text-[color:var(--text-tertiary)] shrink-0"
          >
            <X strokeWidth={1.5} className="size-4" />
          </button>
        </header>
        <div className="px-5 py-3 border-b border-[color:var(--border)] flex items-center gap-3 text-[11px] font-mono tabular-nums text-[color:var(--text-tertiary)] flex-wrap">
          <span>{chunks.length} chunks</span>
          <span>·</span>
          <span>fetched {timeAgo(d.fetched_at)}</span>
          {d.source_url && (
            <>
              <span>·</span>
              <a
                href={d.source_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)] truncate max-w-[420px]"
              >
                <ExternalLink strokeWidth={1.5} className="size-3 shrink-0" />
                <span className="truncate">{d.source_url}</span>
              </a>
            </>
          )}
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {!!d.metadata && Object.keys(d.metadata as Record<string, unknown>).length > 0 && (
            <details className="rounded-md bg-[color:var(--surface-elevated)] border border-[color:var(--border)] px-3 py-2">
              <summary className="text-[11px] uppercase tracking-[0.08em] text-[color:var(--text-tertiary)] font-mono cursor-pointer">
                Metadata
              </summary>
              <pre className="text-[11px] font-mono mt-2 whitespace-pre-wrap text-[color:var(--text-secondary)]">
                {JSON.stringify(d.metadata, null, 2)}
              </pre>
            </details>
          )}
          {chunks.length > 0 ? (
            chunks.map((c) => (
              <div key={c.id} className="space-y-1.5">
                <div className="flex items-center gap-2 text-[10px] font-mono tabular-nums text-[color:var(--text-tertiary)]">
                  <span>chunk {c.chunk_index + 1}/{chunks.length}</span>
                  <span>·</span>
                  <span>{c.token_count} tokens</span>
                </div>
                <div className="rounded-md border border-[color:var(--border)] bg-[color:var(--surface-elevated)] px-3 py-2 text-[13px] leading-[1.6] text-[color:var(--text-primary)] whitespace-pre-wrap">
                  {c.content}
                </div>
              </div>
            ))
          ) : (
            <div className="rounded-md border border-[color:var(--border)] bg-[color:var(--surface-elevated)] px-3 py-2 text-[13px] leading-[1.6] whitespace-pre-wrap">
              {d.content}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function timeAgo(unix: number): string {
  const diff = Math.floor(Date.now() / 1000) - unix;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

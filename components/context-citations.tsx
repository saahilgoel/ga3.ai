"use client";

import { useState } from "react";
import { BookOpen, ChevronRight, ExternalLink } from "lucide-react";

type Hit = {
  source_type: string;
  source_url: string | null;
  title: string | null;
  content: string;
  fetched_at: number;
  metadata: unknown;
  relevance: number;
};

type ToolPart = {
  type: string;
  state?: string;
  input?: { query?: string; source_filter?: string[]; k?: number };
  output?: { query?: string; count?: number; results?: Hit[]; error?: string };
};

const SOURCE_BADGE: Record<string, { label: string; color: string }> = {
  website: { label: "Site", color: "var(--text-secondary)" },
  serp: { label: "SERP", color: "var(--text-secondary)" },
  news: { label: "News", color: "#b58e51" },
  review_trustpilot: { label: "Trustpilot", color: "#cb7a82" },
  review_google_maps: { label: "Maps", color: "#7fa6bc" },
  review_indeed: { label: "Indeed", color: "#7eaa8a" },
  linkedin_company: { label: "LinkedIn", color: "#7fa6bc" },
  linkedin_post: { label: "LinkedIn", color: "#7fa6bc" },
  twitter_post: { label: "X", color: "var(--text-secondary)" },
  ai_overview: { label: "AI overview", color: "#a78bda" },
  trends_summary: { label: "Trends", color: "var(--text-secondary)" },
  user_upload: { label: "Your doc", color: "var(--text-primary)" },
};

export function ContextCitations({ part }: { part: ToolPart }) {
  const [open, setOpen] = useState(true);
  const running = part.state === "input-streaming" || part.state === "input-available";
  const query = part.output?.query ?? part.input?.query ?? "";
  const results = part.output?.results ?? [];
  const filter = part.input?.source_filter ?? [];

  if (running) {
    return (
      <div className="rounded-md bg-[color:var(--surface-elevated)] border border-[color:var(--border)] px-3 py-2 flex items-center gap-2 text-[12px] text-[color:var(--text-tertiary)]">
        <BookOpen
          strokeWidth={1.5}
          className="size-3.5 text-[color:var(--text-secondary)] shrink-0"
        />
        <span>Searching customer context{query ? ` for "${query}"` : "…"}</span>
        <span className="inline-block size-1 rounded-full bg-[color:var(--text-secondary)] animate-pulse ml-1" />
      </div>
    );
  }

  if (part.output?.error) {
    return (
      <div className="rounded-md bg-[color:var(--surface-elevated)] border border-[color:var(--border)] px-3 py-2 text-[12px] text-[color:var(--severity-medium)]">
        <BookOpen strokeWidth={1.5} className="size-3.5 inline mr-1.5 align-text-bottom" />
        Context search failed: {part.output.error}
      </div>
    );
  }

  if (results.length === 0) {
    return (
      <div className="rounded-md bg-[color:var(--surface-elevated)] border border-[color:var(--border)] px-3 py-2 text-[12px] text-[color:var(--text-tertiary)]">
        <BookOpen strokeWidth={1.5} className="size-3.5 inline mr-1.5 align-text-bottom" />
        No customer-context matches for &ldquo;{query}&rdquo;.
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-[color:var(--border)] bg-[color:var(--surface-elevated)] overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full px-3 py-2 flex items-center gap-2 hover:bg-[color:var(--surface-hover)] tx-hover text-left"
      >
        <ChevronRight
          strokeWidth={1.5}
          className={`size-3.5 text-[color:var(--text-tertiary)] transition-transform ${open ? "rotate-90" : ""}`}
        />
        <BookOpen
          strokeWidth={1.5}
          className="size-3.5 text-[color:var(--text-secondary)] shrink-0"
        />
        <span className="text-[12px] text-[color:var(--text-secondary)] flex-1 truncate">
          <span className="text-[color:var(--text-primary)] font-medium">
            Grounded in {results.length} {results.length === 1 ? "citation" : "citations"}
          </span>
          {query && (
            <span className="text-[color:var(--text-tertiary)] font-mono">
              {" · "}&ldquo;{query.length > 50 ? query.slice(0, 50) + "…" : query}&rdquo;
            </span>
          )}
          {filter.length > 0 && (
            <span className="text-[color:var(--text-tertiary)] font-mono">
              {" · "}{filter.join(",")}
            </span>
          )}
        </span>
      </button>
      {open && (
        <div className="border-t border-[color:var(--border)] px-3 py-2 space-y-2">
          {results.map((r, i) => (
            <Citation key={i} hit={r} />
          ))}
        </div>
      )}
    </div>
  );
}

function Citation({ hit }: { hit: Hit }) {
  const [showFull, setShowFull] = useState(false);
  const badge = SOURCE_BADGE[hit.source_type] ?? {
    label: hit.source_type,
    color: "var(--text-secondary)",
  };
  const preview = hit.content.length > 220 ? hit.content.slice(0, 220) + "…" : hit.content;
  return (
    <div className="border-l-2 border-[color:var(--border-strong)] pl-2.5 py-1">
      <div className="flex items-center gap-2 text-[11px] mb-1 flex-wrap">
        <span
          className="font-mono uppercase tracking-[0.06em] font-medium"
          style={{ color: badge.color }}
        >
          {badge.label}
        </span>
        {hit.title && (
          <>
            <span className="text-[color:var(--text-tertiary)]">·</span>
            <span className="text-[color:var(--text-primary)] truncate">{hit.title}</span>
          </>
        )}
        {hit.fetched_at && (
          <>
            <span className="text-[color:var(--text-tertiary)]">·</span>
            <span className="font-mono text-[color:var(--text-tertiary)] tabular-nums">
              {timeAgo(hit.fetched_at)}
            </span>
          </>
        )}
        {hit.source_url && (
          <a
            href={hit.source_url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[color:var(--text-tertiary)] hover:text-[color:var(--text-primary)] tx-hover inline-flex items-center"
            title={hit.source_url}
          >
            <ExternalLink strokeWidth={1.5} className="size-3" />
          </a>
        )}
        <span className="ml-auto font-mono text-[10px] tabular-nums text-[color:var(--text-tertiary)]">
          {(hit.relevance * 100).toFixed(0)}%
        </span>
      </div>
      <button
        onClick={() => setShowFull((v) => !v)}
        className="text-[12.5px] text-[color:var(--text-secondary)] leading-snug text-left w-full hover:text-[color:var(--text-primary)] tx-hover"
      >
        {showFull ? hit.content : preview}
      </button>
    </div>
  );
}

function timeAgo(unix: number): string {
  const diff = Math.floor(Date.now() / 1000) - unix;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

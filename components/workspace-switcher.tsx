"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  BrainCircuit,
  Check,
  ChevronDown,
  Circle,
  Plus,
  Search,
} from "lucide-react";
import { cachedJSON, invalidatePrefix } from "@/lib/client-cache";
import { SiteFavicon } from "@/components/site-favicon";

export type WorkspaceSummary = {
  id: number;
  name: string;
  kind: "single" | "union";
  property_count: number;
  last_scan_at: number | null;
  archived: boolean;
  activity_score?: number;
  is_active?: boolean;
  host_mismatch?: boolean;
  doctor_checked?: boolean;
  website_url?: string | null;
};

export function WorkspaceSwitcher() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [workspaces, setWorkspaces] = useState<WorkspaceSummary[]>([]);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    if (open) {
      setQuery("");
      setActiveIndex(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  async function load(force = false) {
    try {
      const data = await cachedJSON<{
        workspaces: WorkspaceSummary[];
        active_workspace_id: number | null;
      }>("/api/workspaces", { force });
      setWorkspaces(data.workspaces);
      setActiveId(data.active_workspace_id);
    } catch {
      // soft-fail
    }
  }

  useEffect(() => {
    function handle(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    }
    if (open) {
      document.addEventListener("mousedown", handle);
      return () => document.removeEventListener("mousedown", handle);
    }
  }, [open]);

  const active = workspaces.find((w) => w.id === activeId);
  const visible = workspaces.filter((w) => !w.archived);

  const q = query.trim().toLowerCase();
  const filtered = useMemo(() => {
    if (!q) return visible;
    return visible.filter((w) => w.name.toLowerCase().includes(q));
  }, [visible, q]);

  // Prioritized flat ordering:
  // 1. Active workspaces (events > 0 last 28d) by activity_score desc
  // 2. Doctor-checked but inactive
  // 3. Not yet doctor-checked
  // Within each tier: most-recent last_used_at first.
  const ordered = useMemo(() => {
    return [...filtered].sort((a, b) => {
      const tierA = a.is_active ? 0 : a.doctor_checked ? 1 : 2;
      const tierB = b.is_active ? 0 : b.doctor_checked ? 1 : 2;
      if (tierA !== tierB) return tierA - tierB;
      if (tierA === 0) return (b.activity_score ?? 0) - (a.activity_score ?? 0);
      return 0;
    });
  }, [filtered]);

  useEffect(() => {
    if (activeIndex >= ordered.length) setActiveIndex(0);
  }, [ordered.length, activeIndex]);

  async function activate(ws: WorkspaceSummary) {
    setOpen(false);
    const res = await fetch("/api/workspaces/activate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ workspace_id: ws.id }),
    });
    if (res.ok) {
      setActiveId(ws.id);
      // Ping the user (a toast in the app shell catches this), then bust ALL
      // cached API data so every surface reloads for the new property.
      window.dispatchEvent(
        new CustomEvent("ga-chat:workspace-switched", { detail: { name: ws.name } })
      );
      invalidatePrefix("/api/");
      router.push("/dashboard");
      router.refresh();
    }
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="h-8 px-2.5 rounded-md border border-[color:var(--border)] bg-[color:var(--surface-elevated)] hover:bg-[color:var(--surface-hover)] tx-hover inline-flex items-center gap-1.5 text-[12px] text-[color:var(--text-primary)] max-w-[260px]"
      >
        {active && (
          <SiteFavicon url={active.website_url || active.name} size={16} className="-ml-0.5" />
        )}
        {active?.is_active && (
          <span
            aria-hidden
            className="size-1.5 rounded-full shrink-0"
            style={{ background: "var(--severity-low)" }}
          />
        )}
        {active?.host_mismatch && (
          <AlertTriangle
            strokeWidth={1.5}
            className="size-3.5 shrink-0"
            style={{ color: "var(--severity-medium)" }}
          />
        )}
        <span className="font-medium truncate">
          {active ? active.name : "Pick property"}
        </span>
        <ChevronDown
          strokeWidth={1.5}
          className="size-3.5 shrink-0 text-[color:var(--text-tertiary)]"
        />
      </button>

      {open && (
        <div
          className="absolute right-0 mt-1.5 z-30 w-[340px] rounded-lg border border-[color:var(--border)] bg-[color:var(--surface)] overflow-hidden flex flex-col"
          style={{ boxShadow: "0 8px 32px rgba(0,0,0,0.5)", maxHeight: "72vh" }}
        >
          <div className="px-2.5 pt-2 pb-2 border-b border-[color:var(--border)]">
            <div className="relative">
              <Search
                strokeWidth={1.5}
                className="size-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-[color:var(--text-tertiary)] pointer-events-none"
              />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setActiveIndex(0);
                }}
                onKeyDown={(e) => {
                  if (e.key === "ArrowDown") {
                    e.preventDefault();
                    setActiveIndex((i) =>
                      Math.min(i + 1, Math.max(ordered.length - 1, 0))
                    );
                  } else if (e.key === "ArrowUp") {
                    e.preventDefault();
                    setActiveIndex((i) => Math.max(i - 1, 0));
                  } else if (e.key === "Enter") {
                    e.preventDefault();
                    const ws = ordered[activeIndex];
                    if (ws) activate(ws);
                  } else if (e.key === "Escape") {
                    e.preventDefault();
                    if (query) {
                      setQuery("");
                    } else {
                      setOpen(false);
                    }
                  }
                }}
                placeholder="Search properties…"
                className="w-full h-8 pl-7 pr-2 rounded-md bg-[color:var(--surface-elevated)] border border-[color:var(--border)] text-[12px] text-[color:var(--text-primary)] placeholder:text-[color:var(--text-tertiary)] focus:outline-none focus:border-[color:var(--border-strong)]"
              />
            </div>
          </div>
          <div ref={listRef} className="flex-1 overflow-y-auto py-1">
            {ordered.length === 0 && (
              <div className="px-3 py-3 text-[12px] text-[color:var(--text-tertiary)]">
                {q
                  ? `No properties match "${query.trim()}".`
                  : "No properties yet. Connect one to get started."}
              </div>
            )}
            {(() => {
              const sections: Array<{ label: string; items: WorkspaceSummary[] }> = [];
              const active = ordered.filter((w) => w.is_active);
              const idle = ordered.filter((w) => !w.is_active && w.doctor_checked);
              const unchecked = ordered.filter((w) => !w.doctor_checked);
              if (active.length > 0) sections.push({ label: "Active", items: active });
              if (idle.length > 0) sections.push({ label: "Idle (no events 28d)", items: idle });
              if (unchecked.length > 0) sections.push({ label: "Not yet checked", items: unchecked });
              let runningIdx = 0;
              return sections.map((sec, si) => (
                <div key={sec.label} className="px-1">
                  {si > 0 && <div className="h-px bg-[color:var(--border)] my-1.5 mx-3" />}
                  <div className="px-2.5 pt-1 pb-1 text-[10px] uppercase tracking-[0.08em] text-[color:var(--text-tertiary)] font-medium">
                    {sec.label}
                  </div>
                  {sec.items.map((w) => {
                    const idx = runningIdx++;
                    return (
                      <WorkspaceRow
                        key={w.id}
                        workspace={w}
                        active={w.id === activeId}
                        highlighted={idx === activeIndex}
                        query={q}
                        onClick={() => activate(w)}
                        onHover={() => setActiveIndex(idx)}
                      />
                    );
                  })}
                </div>
              ));
            })()}
          </div>
          <div className="border-t border-[color:var(--border)] p-1">
            <Link
              href="/properties"
              onClick={() => setOpen(false)}
              className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md hover:bg-[color:var(--surface-hover)] tx-hover text-[12px] text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)]"
            >
              <Plus strokeWidth={1.5} className="size-3.5" />
              Connect another property
            </Link>
            <Link
              href="/workspaces/context"
              onClick={() => setOpen(false)}
              className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md hover:bg-[color:var(--surface-hover)] tx-hover text-[12px] text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)]"
            >
              <BrainCircuit strokeWidth={1.5} className="size-3.5" />
              Manage knowledge (RAG)
            </Link>
          </div>
        </div>
      )}

    </div>
  );
}

function WorkspaceRow({
  workspace,
  active,
  highlighted,
  query,
  onClick,
  onHover,
}: {
  workspace: WorkspaceSummary;
  active: boolean;
  highlighted?: boolean;
  query?: string;
  onClick: () => void;
  onHover?: () => void;
}) {
  const bits: string[] = [];
  if (workspace.last_scan_at) bits.push(`scan ${timeAgo(workspace.last_scan_at)}`);
  if (workspace.is_active && workspace.activity_score != null) {
    bits.push(`activity ${workspace.activity_score}`);
  }
  const sub = bits.join(" · ");
  return (
    <button
      onClick={onClick}
      onMouseEnter={onHover}
      className={`w-full text-left flex items-center gap-2.5 px-2.5 py-2 rounded-md tx-hover ${
        active
          ? "bg-[color:var(--surface-elevated)]"
          : highlighted
          ? "bg-[color:var(--surface-hover)]"
          : "hover:bg-[color:var(--surface-hover)]"
      }`}
    >
      <span className="size-4 flex items-center justify-center shrink-0">
        {active ? (
          <Check strokeWidth={2} className="size-3.5 text-[color:var(--text-primary)]" />
        ) : workspace.is_active ? (
          <span
            aria-hidden
            className="size-1.5 rounded-full"
            style={{ background: "var(--severity-low)" }}
          />
        ) : workspace.doctor_checked ? (
          <Circle
            strokeWidth={1.5}
            className="size-2 text-[color:var(--text-tertiary)]"
          />
        ) : null}
      </span>
      <div className="flex-1 min-w-0">
        <div className="text-[13px] text-[color:var(--text-primary)] truncate flex items-center gap-1.5">
          <span className="truncate">{highlightMatch(workspace.name, query)}</span>
          {workspace.host_mismatch && (
            <AlertTriangle
              strokeWidth={1.5}
              className="size-3 shrink-0"
              style={{ color: "var(--severity-medium)" }}
            />
          )}
        </div>
        {sub && (
          <div className="text-[11px] font-mono text-[color:var(--text-tertiary)] tabular-nums truncate">
            {sub}
          </div>
        )}
      </div>
    </button>
  );
}

function highlightMatch(text: string, query?: string) {
  if (!query) return text;
  const lower = text.toLowerCase();
  const idx = lower.indexOf(query);
  if (idx < 0) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark
        className="bg-transparent text-[color:var(--text-primary)]"
        style={{ background: "rgba(255,255,255,0.12)" }}
      >
        {text.slice(idx, idx + query.length)}
      </mark>
      {text.slice(idx + query.length)}
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

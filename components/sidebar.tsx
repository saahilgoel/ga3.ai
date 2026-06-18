"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  Inbox,
  Plus,
  Search,
  Newspaper,
  Sparkles,
  Pin,
  MoreHorizontal,
  Pencil,
  Archive,
  Trash2,
  Flame,
  Trophy,
  LayoutDashboard,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  LogOut,
  BarChart3,
  Plug,
  Library,
  BrainCircuit,
  Target,
  Eye,
} from "lucide-react";
import { AGENTS, AGENT_MAP } from "@/lib/agents";
import { AGENT_HEX } from "@/lib/viz";
import { Monogram } from "@/components/monogram";
import { loadStalkerScore } from "@/lib/polish";
import { SearchOverlay } from "@/components/search-overlay";
import { cachedJSON, invalidate } from "@/lib/client-cache";
import { useEventStream, type StreamEvent } from "@/lib/use-event-stream";

type Conversation = {
  id: number;
  title: string | null;
  primary_agent_id: string | null;
  pinned: boolean;
  archived: boolean;
  last_message_at: number | null;
  participants: string[];
};

export function Sidebar({
  activeAgentId,
  activeConversationId,
  onMobileClose,
  isMobile = false,
}: {
  activeAgentId?: string | null;
  activeConversationId?: number | null;
  onMobileClose?: () => void;
  isMobile?: boolean;
}) {
  const pathname = usePathname();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [stalker, setStalker] = useState(0);
  const [unreadTotal, setUnreadTotal] = useState(0);
  const [searchOpen, setSearchOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [hydratedCollapsed, setHydratedCollapsed] = useState(false);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Restore collapsed state from localStorage on mount (avoids SSR flash).
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem("ga-chat:sidebar-collapsed");
      if (stored === "1") setCollapsed(true);
    } catch {
      /* ignore */
    }
    setHydratedCollapsed(true);
  }, []);

  function toggleCollapsed() {
    setCollapsed((cur) => {
      const next = !cur;
      try {
        window.localStorage.setItem("ga-chat:sidebar-collapsed", next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  }

  useEffect(() => {
    setStalker(loadStalkerScore());
    let cancelled = false;
    async function loadConvs(force = false) {
      try {
        const data = await cachedJSON<{ conversations: Conversation[] }>(
          "/api/conversations?limit=20",
          { force }
        );
        if (!cancelled) setConversations(data.conversations);
      } catch {
        // soft-fail
      }
    }
    async function loadFindings(force = false) {
      try {
        const data = await cachedJSON<{ unread_count?: number }>(
          "/api/findings",
          { force }
        );
        if (!cancelled) setUnreadTotal(data.unread_count ?? 0);
      } catch {
        // soft-fail
      }
    }
    loadConvs();
    loadFindings();
    // Background poll as a safety net only — SSE is the primary delivery
    // channel. Refresh every 5 min in case the stream missed an event.
    const t = setInterval(() => {
      if (document.visibilityState === "visible") {
        loadConvs(true);
        loadFindings(true);
      }
    }, 300_000);
    function onVisible() {
      if (document.visibilityState === "visible") {
        loadConvs();
        loadFindings();
      }
    }
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      clearInterval(t);
      document.removeEventListener("visibilitychange", onVisible);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // SSE: react to events the server pushes (new findings, new conversations,
  // brief completed) and re-fetch the relevant slice.
  useEventStream((ev: StreamEvent) => {
    if (ev.kind === "finding.new" || ev.kind === "findings.changed" || ev.kind === "scan.completed") {
      invalidate("/api/findings");
      cachedJSON<{ unread_count?: number }>("/api/findings", { force: true })
        .then((d) => setUnreadTotal(d.unread_count ?? 0))
        .catch(() => {});
    }
    if (ev.kind === "conversation.changed" || ev.kind === "brief.completed") {
      invalidate("/api/conversations?limit=20");
      cachedJSON<{ conversations: Conversation[] }>(
        "/api/conversations?limit=20",
        { force: true }
      )
        .then((d) => setConversations(d.conversations))
        .catch(() => {});
    }
  });

  // Cmd/Ctrl+K opens search
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen(true);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // hoverTimer kept for back-compat; no longer scheduled. Cleared on unmount.
  useEffect(() => {
    return () => {
      if (hoverTimer.current) clearTimeout(hoverTimer.current);
    };
  }, []);

  // Sidebar default state: expanded on desktop. User toggles explicitly.
  const expanded = isMobile || !collapsed;
  const width = expanded ? 260 : 56;

  const pinned = conversations.filter((c) => c.pinned).slice(0, 10);
  const recent = conversations.filter((c) => !c.pinned).slice(0, 10);

  const StalkerIcon = stalker >= 200 ? Trophy : stalker >= 50 ? Flame : null;

  return (
    <aside
      style={{
        width,
        transition: isMobile || !hydratedCollapsed ? undefined : "width 160ms cubic-bezier(0.2, 0, 0, 1)",
      }}
      className="shrink-0 h-screen border-r border-[color:var(--border)] bg-[color:var(--surface)] flex flex-col overflow-hidden"
    >
      <div className="h-12 flex items-center px-3 border-b border-[color:var(--border)] shrink-0 gap-2">
        <Link
          href="/dashboard"
          onClick={onMobileClose}
          className="flex items-center gap-2 min-w-0 flex-1"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/mark-dark.svg" alt="GA3" width={28} height={28} className="shrink-0 rounded-md" />
          {expanded && (
            <span className="text-[15px] font-semibold tracking-tight truncate">
              GA3<span className="text-[color:var(--text-tertiary)]">.ai</span>
            </span>
          )}
        </Link>
        {!isMobile && (
          <button
            onClick={toggleCollapsed}
            title={expanded ? "Collapse sidebar" : "Expand sidebar"}
            aria-label={expanded ? "Collapse sidebar" : "Expand sidebar"}
            className="size-7 rounded-md hover:bg-[color:var(--surface-hover)] tx-hover flex items-center justify-center text-[color:var(--text-tertiary)] hover:text-[color:var(--text-primary)] shrink-0"
          >
            {expanded ? (
              <PanelLeftClose strokeWidth={1.5} className="size-4" />
            ) : (
              <PanelLeftOpen strokeWidth={1.5} className="size-4" />
            )}
          </button>
        )}
      </div>

      <div className="px-2 pt-2 pb-1 space-y-1">
        <Link
          href="/chat/new"
          onClick={onMobileClose}
          className="flex items-center gap-2.5 rounded-md px-2 h-8 bg-[color:var(--surface-elevated)] border border-[color:var(--border)] hover:bg-[color:var(--surface-hover)] tx-hover"
          title="Start a new chat"
        >
          <Plus strokeWidth={1.5} className="size-4 shrink-0" />
          {expanded && <span className="text-[12px] font-medium">New chat</span>}
        </Link>
        <button
          onClick={() => setSearchOpen(true)}
          className="w-full flex items-center gap-2.5 rounded-md px-2 h-8 hover:bg-[color:var(--surface-hover)] tx-hover text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)]"
          title="Search (⌘K)"
        >
          <Search strokeWidth={1.5} className="size-4 shrink-0" />
          {expanded && (
            <>
              <span className="text-[12px] flex-1 text-left">Search</span>
              <kbd className="text-[10px] font-mono tabular-nums text-[color:var(--text-tertiary)] hidden lg:inline">
                ⌘K
              </kbd>
            </>
          )}
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto py-1">
        <div className="px-2 space-y-0.5">
          <NavRow
            href="/dashboard"
            icon={LayoutDashboard}
            label="Dashboard"
            active={pathname === "/dashboard"}
            expanded={expanded}
            onClose={onMobileClose}
          />
          <NavRow
            href="/reports"
            icon={BarChart3}
            label="Reports"
            active={pathname === "/reports" || pathname.startsWith("/reports/")}
            expanded={expanded}
            onClose={onMobileClose}
          />
          <NavRow
            href="/feed"
            icon={Newspaper}
            label="Newsroom"
            active={pathname === "/feed"}
            expanded={expanded}
            badge={unreadTotal > 0 ? unreadTotal : undefined}
            onClose={onMobileClose}
          />
          <NavRow
            href="/library"
            icon={Library}
            label="Library"
            active={pathname === "/library" || pathname.startsWith("/library/")}
            expanded={expanded}
            onClose={onMobileClose}
          />
          <NavRow
            href="/workspaces/context"
            icon={BrainCircuit}
            label="Knowledge"
            active={
              pathname === "/workspaces/context" ||
              pathname.startsWith("/workspaces/context")
            }
            expanded={expanded}
            onClose={onMobileClose}
          />
          <NavRow
            href="/competitors"
            icon={Target}
            label="Competitors"
            active={
              pathname === "/competitors" || pathname.startsWith("/competitors/")
            }
            expanded={expanded}
            onClose={onMobileClose}
          />
          <NavRow
            href="/ai-visibility"
            icon={Eye}
            label="AI Visibility"
            active={
              pathname === "/ai-visibility" ||
              pathname.startsWith("/ai-visibility/")
            }
            expanded={expanded}
            onClose={onMobileClose}
          />
          <NavRow
            href="/pinned"
            icon={Pin}
            label="Pinned"
            active={pathname === "/pinned"}
            expanded={expanded}
            disabled
          />
          <NavRow
            href="/connectors"
            icon={Plug}
            label="Connectors"
            active={pathname === "/connectors"}
            expanded={expanded}
            onClose={onMobileClose}
          />
        </div>

        <div className="mx-3 my-2 h-px bg-[color:var(--border)]" />

        {pinned.length > 0 && (
          <Section title="Pinned" expanded={expanded}>
            {pinned.map((c) => (
              <ConvRow
                key={c.id}
                conversation={c}
                active={activeConversationId === c.id}
                expanded={expanded}
                onClose={onMobileClose}
                onChanged={(updated) =>
                  setConversations((curr) =>
                    updated.deleted
                      ? curr.filter((x) => x.id !== c.id)
                      : curr.map((x) => (x.id === c.id ? { ...x, ...updated } : x))
                  )
                }
              />
            ))}
          </Section>
        )}

        <Section title="Recent" expanded={expanded}>
          {recent.length === 0 && expanded && (
            <div className="px-2 py-1.5 text-[11px] text-[color:var(--text-tertiary)]">
              No chats yet. Start one above.
            </div>
          )}
          {recent.map((c) => (
            <ConvRow
              key={c.id}
              conversation={c}
              active={activeConversationId === c.id}
              expanded={expanded}
              onClose={onMobileClose}
              onChanged={(updated) =>
                setConversations((curr) =>
                  updated.deleted
                    ? curr.filter((x) => x.id !== c.id)
                    : curr.map((x) => (x.id === c.id ? { ...x, ...updated } : x))
                )
              }
            />
          ))}
          {recent.length > 0 && expanded && (
            <Link
              href="/chats"
              className="block px-2 py-1.5 text-[11px] text-[color:var(--text-tertiary)] hover:text-[color:var(--text-primary)] tx-hover"
            >
              Show all →
            </Link>
          )}
        </Section>

        <Section title="Agents" expanded={expanded}>
          {AGENTS.map((a) => (
            <Link
              key={a.id}
              href={`/chat/new?agent=${a.id}`}
              onClick={onMobileClose}
              prefetch
              className={`relative flex items-center gap-2.5 rounded-md px-2 h-8 tx-hover ${
                activeAgentId === a.id
                  ? "bg-[color:var(--surface-elevated)] text-[color:var(--text-primary)]"
                  : "text-[color:var(--text-secondary)] hover:bg-[color:var(--surface-hover)] hover:text-[color:var(--text-primary)]"
              } group`}
            >
              <Monogram agent={a} size={20} />
              {expanded && (
                <>
                  <span className="text-[12px] truncate flex-1">{a.name}</span>
                  <Plus
                    strokeWidth={1.5}
                    className="size-3 opacity-0 group-hover:opacity-60 transition-opacity"
                  />
                </>
              )}
            </Link>
          ))}
        </Section>

      </nav>

      <UserFooter
        expanded={expanded}
        stalker={stalker}
        StalkerIcon={StalkerIcon}
      />

      <SearchOverlay open={searchOpen} onClose={() => setSearchOpen(false)} />
    </aside>
  );
}

function UserFooter({
  expanded,
  stalker,
  StalkerIcon,
}: {
  expanded: boolean;
  stalker: number;
  StalkerIcon: typeof Inbox | null;
}) {
  const [user, setUser] = useState<{ email: string; initial: string } | null>(null);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const d = await cachedJSON<{ email?: string }>("/api/me");
        if (d.email && !cancelled) {
          setUser({
            email: d.email,
            initial: (d.email[0] || "?").toUpperCase(),
          });
        }
      } catch {
        /* soft-fail */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    function handle(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    }
    if (open) {
      document.addEventListener("mousedown", handle);
      return () => document.removeEventListener("mousedown", handle);
    }
  }, [open]);

  return (
    <div className="border-t border-[color:var(--border)] shrink-0 relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full h-12 px-3 flex items-center gap-2.5 hover:bg-[color:var(--surface-hover)] tx-hover"
      >
        <span
          className="size-7 rounded-full bg-[color:var(--surface-elevated)] border border-[color:var(--border-strong)] flex items-center justify-center font-mono text-[12px] font-semibold shrink-0"
        >
          {user?.initial ?? "·"}
        </span>
        {expanded && (
          <>
            <span className="text-[12px] truncate flex-1 text-left text-[color:var(--text-secondary)]">
              {user?.email ?? "Loading…"}
            </span>
            <span
              className="text-[10px] font-mono tabular-nums text-[color:var(--text-tertiary)] flex items-center gap-1 shrink-0"
              title={`Exploration score: ${stalker}`}
            >
              {StalkerIcon && <StalkerIcon strokeWidth={1.5} className="size-3" />}
              {stalker}
            </span>
          </>
        )}
      </button>
      {open && expanded && (
        <div
          className="absolute bottom-12 left-2 right-2 z-30 rounded-md border border-[color:var(--border)] bg-[color:var(--surface)] p-1"
          style={{ boxShadow: "0 8px 32px rgba(0,0,0,0.45)" }}
        >
          <Link
            href="/properties"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-[color:var(--surface-hover)] tx-hover text-[12px] text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)]"
          >
            <Settings strokeWidth={1.5} className="size-3.5" />
            Settings
          </Link>
          <a
            href="/api/auth/logout"
            className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-[color:var(--surface-hover)] tx-hover text-[12px] text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)]"
          >
            <LogOut strokeWidth={1.5} className="size-3.5" />
            Sign out
          </a>
        </div>
      )}
    </div>
  );
}

function Section({
  title,
  expanded,
  children,
}: {
  title: string;
  expanded: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="px-2 mb-1.5">
      {expanded && (
        <div className="px-2 pt-2 pb-1 text-[10px] font-medium uppercase tracking-[0.08em] text-[color:var(--text-tertiary)]">
          {title}
        </div>
      )}
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

function ConvRow({
  conversation,
  active,
  expanded,
  onClose,
  onChanged,
}: {
  conversation: Conversation;
  active: boolean;
  expanded: boolean;
  onClose?: () => void;
  onChanged: (
    updated: Partial<Conversation> & { deleted?: boolean }
  ) => void;
}) {
  const title = conversation.title ?? "Untitled chat";
  const participants =
    conversation.participants.length > 0
      ? conversation.participants
      : conversation.primary_agent_id
      ? [conversation.primary_agent_id]
      : [];
  return (
    <Link
      href={`/chat/${conversation.id}`}
      onClick={onClose}
      className={`relative flex items-center gap-2 rounded-md px-2 h-8 tx-hover group ${
        active
          ? "bg-[color:var(--surface-elevated)]"
          : "hover:bg-[color:var(--surface-hover)]"
      }`}
    >
      {active && (
        <span
          aria-hidden
          className="absolute left-0 top-1.5 bottom-1.5 w-[2px] rounded-r"
          style={{ background: "var(--text-primary)" }}
        />
      )}
      <div className="flex -space-x-1.5 shrink-0">
        {participants.length === 0 ? (
          <span className="size-4 rounded-full bg-[color:var(--surface-elevated)] border border-[color:var(--border-strong)]" />
        ) : (
          participants.slice(0, 3).map((agentId) => {
            const a = AGENT_MAP[agentId];
            if (!a) return null;
            return (
              <span
                key={agentId}
                className="size-4 rounded-full bg-[color:var(--surface-elevated)] flex items-center justify-center text-[8px] font-mono font-semibold"
                style={{ border: `1px solid ${AGENT_HEX[a.color]}` }}
              >
                {a.monogram}
              </span>
            );
          })
        )}
      </div>
      {expanded && (
        <>
          <span
            className={`flex-1 truncate text-[12px] ${
              active
                ? "text-[color:var(--text-primary)] font-medium"
                : "text-[color:var(--text-secondary)]"
            }`}
          >
            {title}
          </span>
          <span className="font-mono text-[10px] text-[color:var(--text-tertiary)] tabular-nums opacity-60 group-hover:hidden">
            {timeAgoShort(conversation.last_message_at ?? 0)}
          </span>
          <ConvRowMenu
            id={conversation.id}
            pinned={conversation.pinned}
            archived={conversation.archived}
            onChanged={onChanged}
          />
        </>
      )}
    </Link>
  );
}

function ConvRowMenu({
  id,
  pinned,
  archived,
  onChanged,
}: {
  id: number;
  pinned: boolean;
  archived: boolean;
  onChanged: (u: Partial<Conversation> & { deleted?: boolean }) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function handle(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    }
    if (open) {
      document.addEventListener("mousedown", handle);
      return () => document.removeEventListener("mousedown", handle);
    }
  }, [open]);

  async function patch(body: { pinned?: boolean; archived?: boolean; title?: string }) {
    await fetch(`/api/conversations/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    onChanged(body);
  }
  async function del() {
    if (!confirm("Permanently delete this conversation? This cannot be undone.")) return;
    await fetch(`/api/conversations/${id}`, { method: "DELETE" });
    onChanged({ deleted: true });
  }
  async function rename() {
    const name = prompt("New title", "");
    if (!name) return;
    patch({ title: name.trim() });
  }

  return (
    <div
      ref={ref}
      className="relative hidden group-hover:inline-block"
      onClick={(e) => e.stopPropagation()}
    >
      <button
        onClick={(e) => {
          e.preventDefault();
          setOpen((v) => !v);
        }}
        className="size-5 rounded-md hover:bg-[color:var(--surface-hover)] flex items-center justify-center text-[color:var(--text-tertiary)] hover:text-[color:var(--text-primary)]"
        aria-label="More"
      >
        <MoreHorizontal strokeWidth={1.5} className="size-3" />
      </button>
      {open && (
        <div
          className="absolute right-0 top-6 z-30 w-[160px] rounded-md border border-[color:var(--border)] bg-[color:var(--surface)] p-1"
          style={{ boxShadow: "0 8px 32px rgba(0,0,0,0.45)" }}
        >
          <MenuItem
            icon={Pencil}
            label="Rename"
            onClick={() => {
              setOpen(false);
              rename();
            }}
          />
          <MenuItem
            icon={Pin}
            label={pinned ? "Unpin" : "Pin"}
            onClick={() => {
              setOpen(false);
              patch({ pinned: !pinned });
            }}
          />
          <MenuItem
            icon={Archive}
            label={archived ? "Restore" : "Archive"}
            onClick={() => {
              setOpen(false);
              patch({ archived: !archived });
            }}
          />
          <MenuItem
            icon={Trash2}
            label="Delete"
            danger
            onClick={() => {
              setOpen(false);
              del();
            }}
          />
        </div>
      )}
    </div>
  );
}

function MenuItem({
  icon: Icon,
  label,
  onClick,
  danger,
}: {
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-left flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-[color:var(--surface-hover)] text-[12px] ${
        danger
          ? "text-[color:var(--severity-high)]"
          : "text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)]"
      }`}
    >
      <Icon strokeWidth={1.5} className="size-3.5" />
      {label}
    </button>
  );
}

function NavRow({
  href,
  icon: Icon,
  label,
  active,
  expanded,
  badge,
  disabled,
  onClose,
}: {
  href: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  label: string;
  active: boolean;
  expanded: boolean;
  badge?: number;
  disabled?: boolean;
  onClose?: () => void;
}) {
  const content = (
    <div
      className={`relative flex items-center gap-2.5 rounded-md px-2 h-8 tx-hover ${
        active
          ? "bg-[color:var(--surface-elevated)] text-[color:var(--text-primary)]"
          : disabled
          ? "text-[color:var(--text-tertiary)] opacity-50"
          : "text-[color:var(--text-secondary)] hover:bg-[color:var(--surface-hover)] hover:text-[color:var(--text-primary)]"
      }`}
    >
      {active && (
        <span
          aria-hidden
          className="absolute left-0 top-1.5 bottom-1.5 w-[2px] rounded-r"
          style={{ background: "var(--text-primary)" }}
        />
      )}
      <Icon strokeWidth={1.5} className="size-4 shrink-0" />
      {expanded && (
        <>
          <span className="text-[12px] font-mono tracking-[0.01em] flex-1 truncate">{label}</span>
          {badge != null && badge > 0 && (
            <span className="text-[10px] font-mono tabular-nums px-1.5 py-0.5 rounded-full bg-rose-500/20 text-rose-300">
              {badge > 99 ? "99+" : badge}
            </span>
          )}
        </>
      )}
    </div>
  );
  if (disabled) {
    return <div title={`${label} (coming soon)`}>{content}</div>;
  }
  return (
    <Link href={href} onClick={onClose} prefetch>
      {content}
    </Link>
  );
}

function timeAgoShort(unix: number): string {
  if (!unix) return "";
  const diff = Math.floor(Date.now() / 1000) - unix;
  if (diff < 60) return "now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return `${Math.floor(diff / 86400)}d`;
}

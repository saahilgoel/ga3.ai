"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AGENTS, AGENT_COLORS } from "@/lib/agents";

export function AgentSidebar({
  activeAgentId,
  onSelect,
  basePath,
}: {
  activeAgentId: string | null;
  onSelect?: (id: string | null) => void;
  /** When set, avatars become navigation links to `${basePath}/${agent.id}`. */
  basePath?: string;
}) {
  const isNav = !!basePath;
  const [unread, setUnread] = useState<Record<string, number>>({});

  useEffect(() => {
    if (!isNav) return;
    async function load() {
      try {
        const res = await fetch("/api/findings");
        if (!res.ok) return;
        const data = (await res.json()) as { unread_by_agent: Record<string, number> };
        setUnread(data.unread_by_agent ?? {});
      } catch {
        // soft-fail
      }
    }
    load();
    const t = setInterval(() => {
      if (document.visibilityState === "visible") load();
    }, 60_000);
    return () => clearInterval(t);
  }, [isNav]);

  return (
    <div className="w-[60px] shrink-0 border-r border-[color:var(--border)] bg-[color:var(--background)] flex flex-col items-center py-4 gap-3">
      <div className="text-[10px] uppercase tracking-widest text-[color:var(--muted-foreground)] mb-1">
        agents
      </div>
      {AGENTS.map((a) => {
        const active = activeAgentId === a.id;
        const colors = AGENT_COLORS[a.color];
        const unreadCount = unread[a.id] ?? 0;
        const className = `size-10 rounded-full flex items-center justify-center text-xl transition-all relative ${
          active
            ? `${colors.bgSolid} ring-2 ring-offset-2 ring-offset-[color:var(--background)] ${colors.ring} scale-110`
            : `${colors.bgSoft} hover:scale-105`
        }`;
        const title = `${a.name} — ${a.title}\n${a.tagline}${unreadCount > 0 ? `\n${unreadCount} new finding${unreadCount === 1 ? "" : "s"}` : ""}`;
        const badge = unreadCount > 0 && isNav ? (
          <span
            className={`absolute -top-1 -right-1 size-4 rounded-full text-[10px] font-bold flex items-center justify-center bg-rose-500 text-white ring-2 ring-[color:var(--background)]`}
          >
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        ) : null;
        if (isNav) {
          return (
            <Link key={a.id} href={`${basePath}/${a.id}`} title={title} className={className}>
              <span>{a.emoji}</span>
              {badge}
            </Link>
          );
        }
        return (
          <button
            key={a.id}
            onClick={() => onSelect?.(active ? null : a.id)}
            title={title}
            className={className}
          >
            <span>{a.emoji}</span>
            {badge}
          </button>
        );
      })}
      {isNav && (
        <Link
          href={`${basePath}/all`}
          title="All Agents (router mode)"
          className={`size-10 rounded-full flex items-center justify-center text-lg transition-all ${
            activeAgentId === "all"
              ? "bg-[color:var(--accent)] ring-2 ring-offset-2 ring-offset-[color:var(--background)] ring-[color:var(--accent)] scale-110"
              : "bg-[color:var(--muted)] hover:scale-105"
          }`}
        >
          💬
        </Link>
      )}
      {isNav && (
        <Link
          href="/feed"
          title="Newsroom"
          className="size-10 rounded-full flex items-center justify-center text-lg transition-all bg-[color:var(--muted)] hover:scale-105 mt-auto"
        >
          📰
        </Link>
      )}
    </div>
  );
}

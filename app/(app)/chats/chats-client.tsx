"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Plus, MoreHorizontal, Pin, Archive, Trash2, Pencil } from "lucide-react";
import { AGENT_MAP } from "@/lib/agents";
import { AGENT_HEX } from "@/lib/viz";

type Conv = {
  id: number;
  title: string;
  primary_agent_id: string | null;
  pinned: boolean;
  archived: boolean;
  last_message_at: number | null;
  created_at: number;
  participants: string[];
};

export function ChatsClient({ conversations }: { conversations: Conv[] }) {
  const [items, setItems] = useState(conversations);
  const [showArchived, setShowArchived] = useState(false);

  const active = items.filter((c) => !c.archived);
  const archived = items.filter((c) => c.archived);

  const grouped = useMemo(() => groupConversations(active), [active]);

  function updateItem(id: number, patch: Partial<Conv> & { deleted?: boolean }) {
    setItems((curr) => {
      if (patch.deleted) return curr.filter((c) => c.id !== id);
      return curr.map((c) => (c.id === id ? { ...c, ...patch } : c));
    });
  }

  return (
    <>
      <header className="flex items-baseline justify-between mb-6">
        <div>
          <h1 className="font-mono text-[28px] font-medium tracking-[-0.015em] leading-[1.1]">
            Chats
          </h1>
          <p className="text-[12px] font-mono text-[color:var(--text-tertiary)] tabular-nums mt-1.5">
            {active.length} active · {archived.length} archived
          </p>
        </div>
        <Link
          href="/chat/new"
          className="h-8 px-3 rounded-md border border-[color:var(--border-strong)] bg-[color:var(--surface-elevated)] hover:bg-[color:var(--surface-hover)] tx-hover text-[12px] font-medium inline-flex items-center gap-1.5"
        >
          <Plus strokeWidth={1.5} className="size-3.5" />
          New chat
        </Link>
      </header>

      {grouped.pinned.length > 0 && (
        <Section title={`Pinned (${grouped.pinned.length})`}>
          {grouped.pinned.map((c) => (
            <Row key={c.id} conv={c} onChange={updateItem} />
          ))}
        </Section>
      )}

      {(["today", "yesterday", "this_week", "earlier"] as const).map((bucket) => {
        const rows = grouped[bucket];
        if (rows.length === 0) return null;
        const labels: Record<typeof bucket, string> = {
          today: "Today",
          yesterday: "Yesterday",
          this_week: "This week",
          earlier: "Earlier",
        };
        return (
          <Section key={bucket} title={labels[bucket]}>
            {rows.map((c) => (
              <Row key={c.id} conv={c} onChange={updateItem} />
            ))}
          </Section>
        );
      })}

      {archived.length > 0 && (
        <div className="mt-8">
          <button
            onClick={() => setShowArchived((v) => !v)}
            className="text-[11px] uppercase tracking-[0.08em] text-[color:var(--text-tertiary)] hover:text-[color:var(--text-primary)] tx-hover font-medium"
          >
            Archived ({archived.length}) {showArchived ? "▾" : "▸"}
          </button>
          {showArchived && (
            <div className="mt-2 border-t border-[color:var(--border)] pt-2">
              {archived.map((c) => (
                <Row key={c.id} conv={c} onChange={updateItem} />
              ))}
            </div>
          )}
        </div>
      )}

      {items.length === 0 && (
        <div className="text-[13px] text-[color:var(--text-tertiary)] py-12 text-center">
          No conversations yet.
        </div>
      )}
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-8">
      <h2 className="text-[11px] uppercase tracking-[0.08em] text-[color:var(--text-secondary)] font-medium mb-2 pb-2 border-b border-[color:var(--border)]">
        {title}
      </h2>
      <div>{children}</div>
    </section>
  );
}

function Row({
  conv,
  onChange,
}: {
  conv: Conv;
  onChange: (id: number, patch: Partial<Conv> & { deleted?: boolean }) => void;
}) {
  return (
    <Link
      href={`/chat/${conv.id}`}
      className="group flex items-center gap-3 py-2.5 border-b border-[color:var(--border)] hover:bg-[color:var(--surface-hover)]/40 tx-hover px-2 -mx-2 rounded-md"
    >
      <div className="flex -space-x-1.5 shrink-0">
        {conv.participants.slice(0, 3).map((agentId) => {
          const a = AGENT_MAP[agentId];
          if (!a) return null;
          return (
            <span
              key={agentId}
              className="size-5 rounded-full bg-[color:var(--surface-elevated)] flex items-center justify-center text-[9px] font-mono font-semibold"
              style={{ border: `1px solid ${AGENT_HEX[a.color]}` }}
            >
              {a.monogram}
            </span>
          );
        })}
        {conv.participants.length === 0 && (
          <span className="size-5 rounded-full bg-[color:var(--surface-elevated)] border border-[color:var(--border-strong)]" />
        )}
      </div>
      <div className="flex-1 min-w-0 text-[13px] text-[color:var(--text-primary)] truncate">
        {conv.title}
      </div>
      <span className="text-[11px] font-mono tabular-nums text-[color:var(--text-tertiary)] shrink-0">
        {timeAgo(conv.last_message_at ?? conv.created_at)}
      </span>
      <RowMenu conv={conv} onChange={onChange} />
    </Link>
  );
}

function RowMenu({
  conv,
  onChange,
}: {
  conv: Conv;
  onChange: (id: number, patch: Partial<Conv> & { deleted?: boolean }) => void;
}) {
  const [open, setOpen] = useState(false);

  async function patch(body: { pinned?: boolean; archived?: boolean; title?: string }) {
    await fetch(`/api/conversations/${conv.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    onChange(conv.id, body);
  }
  async function del() {
    if (!confirm("Permanently delete this conversation? This cannot be undone.")) return;
    await fetch(`/api/conversations/${conv.id}`, { method: "DELETE" });
    onChange(conv.id, { deleted: true });
  }
  async function rename() {
    const name = prompt("New title", conv.title);
    if (!name?.trim()) return;
    patch({ title: name.trim() });
  }

  return (
    <div
      className="relative shrink-0"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
    >
      <button
        onClick={() => setOpen((v) => !v)}
        className="size-6 rounded-md hover:bg-[color:var(--surface-hover)] flex items-center justify-center text-[color:var(--text-tertiary)] opacity-0 group-hover:opacity-100"
      >
        <MoreHorizontal strokeWidth={1.5} className="size-3.5" />
      </button>
      {open && (
        <div
          className="absolute right-0 mt-1 w-[160px] rounded-md border border-[color:var(--border)] bg-[color:var(--surface)] p-1 z-30"
          style={{ boxShadow: "0 8px 32px rgba(0,0,0,0.45)" }}
          onMouseLeave={() => setOpen(false)}
        >
          {!conv.archived && (
            <button
              onClick={() => {
                setOpen(false);
                rename();
              }}
              className="w-full text-left flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-[color:var(--surface-hover)] text-[12px]"
            >
              <Pencil strokeWidth={1.5} className="size-3.5" /> Rename
            </button>
          )}
          <button
            onClick={() => {
              setOpen(false);
              patch({ pinned: !conv.pinned });
            }}
            className="w-full text-left flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-[color:var(--surface-hover)] text-[12px]"
          >
            <Pin strokeWidth={1.5} className="size-3.5" /> {conv.pinned ? "Unpin" : "Pin"}
          </button>
          <button
            onClick={() => {
              setOpen(false);
              patch({ archived: !conv.archived });
            }}
            className="w-full text-left flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-[color:var(--surface-hover)] text-[12px]"
          >
            <Archive strokeWidth={1.5} className="size-3.5" />{" "}
            {conv.archived ? "Restore" : "Archive"}
          </button>
          <button
            onClick={() => {
              setOpen(false);
              del();
            }}
            className="w-full text-left flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-[color:var(--surface-hover)] text-[12px] text-[color:var(--severity-high)]"
          >
            <Trash2 strokeWidth={1.5} className="size-3.5" /> Delete
          </button>
        </div>
      )}
    </div>
  );
}

function groupConversations(items: Conv[]) {
  const now = new Date();
  const today = startOfDay(now).getTime() / 1000;
  const yesterday = today - 86400;
  const weekAgo = today - 7 * 86400;

  const buckets = {
    pinned: [] as Conv[],
    today: [] as Conv[],
    yesterday: [] as Conv[],
    this_week: [] as Conv[],
    earlier: [] as Conv[],
  };
  for (const c of items) {
    if (c.pinned) {
      buckets.pinned.push(c);
      continue;
    }
    const ts = c.last_message_at ?? c.created_at;
    if (ts >= today) buckets.today.push(c);
    else if (ts >= yesterday) buckets.yesterday.push(c);
    else if (ts >= weekAgo) buckets.this_week.push(c);
    else buckets.earlier.push(c);
  }
  return buckets;
}

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function timeAgo(unix: number): string {
  if (!unix) return "—";
  const diff = Math.floor(Date.now() / 1000) - unix;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

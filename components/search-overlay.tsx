"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Search, X } from "lucide-react";

type SearchResult = {
  conversations: Array<{
    id: number;
    title: string;
    snippet: string;
    last_message_at: number | null;
  }>;
  findings: Array<{ id: number; title: string; snippet: string; created_at: number }>;
  briefs: Array<{ id: number; title: string; snippet: string; created_at: number }>;
};

export function SearchOverlay({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<SearchResult>({
    conversations: [],
    findings: [],
    briefs: [],
  });
  const [loading, setLoading] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setQ("");
    setResults({ conversations: [], findings: [], briefs: [] });
    setActiveIdx(0);
    setTimeout(() => inputRef.current?.focus(), 30);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    if (!q.trim()) {
      setResults({ conversations: [], findings: [], briefs: [] });
      return;
    }
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
        if (res.ok) {
          const data = (await res.json()) as SearchResult;
          setResults(data);
          setActiveIdx(0);
        }
      } finally {
        setLoading(false);
      }
    }, 180);
    return () => clearTimeout(t);
  }, [q, open]);

  const flat = [
    ...results.conversations.map((c) => ({
      type: "conversation" as const,
      id: c.id,
      title: c.title,
      snippet: c.snippet,
    })),
    ...results.findings.map((f) => ({
      type: "finding" as const,
      id: f.id,
      title: f.title,
      snippet: f.snippet,
    })),
    ...results.briefs.map((b) => ({
      type: "brief" as const,
      id: b.id,
      title: b.title,
      snippet: b.snippet,
    })),
  ];

  function openResult(idx: number) {
    const r = flat[idx];
    if (!r) return;
    onClose();
    if (r.type === "conversation") router.push(`/chat/${r.id}`);
    if (r.type === "finding") router.push(`/feed`);
    if (r.type === "brief") router.push(`/briefs/${r.id}`);
  }

  function onKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") onClose();
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx((i) => Math.min(flat.length - 1, i + 1));
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((i) => Math.max(0, i - 1));
    }
    if (e.key === "Enter") {
      e.preventDefault();
      openResult(activeIdx);
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.1 }}
            onClick={onClose}
            className="fixed inset-0 z-50 bg-black/55"
          />
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            transition={{ duration: 0.14, ease: [0.2, 0, 0, 1] }}
            className="fixed left-1/2 top-[15vh] -translate-x-1/2 z-50 w-[min(640px,92vw)] rounded-xl bg-[color:var(--surface)] border border-[color:var(--border)] overflow-hidden flex flex-col"
            style={{ boxShadow: "0 16px 48px rgba(0,0,0,0.55)", maxHeight: "70vh" }}
          >
            <div className="px-4 py-3 border-b border-[color:var(--border)] flex items-center gap-3">
              <Search
                strokeWidth={1.5}
                className="size-4 text-[color:var(--text-tertiary)] shrink-0"
              />
              <input
                ref={inputRef}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={onKey}
                placeholder="Search chats and findings..."
                className="flex-1 bg-transparent text-[14px] placeholder:text-[color:var(--text-tertiary)] focus:outline-none"
              />
              <kbd className="text-[10px] font-mono text-[color:var(--text-tertiary)] border border-[color:var(--border)] rounded px-1.5 py-0.5">
                Esc
              </kbd>
              <button
                onClick={onClose}
                className="size-7 rounded-md hover:bg-[color:var(--surface-hover)] flex items-center justify-center text-[color:var(--text-tertiary)]"
              >
                <X strokeWidth={1.5} className="size-3.5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto py-2">
              {!q.trim() && (
                <div className="px-4 py-6 text-[12px] text-[color:var(--text-tertiary)]">
                  Type to search across conversations, findings, and briefs. Arrow keys to
                  move, Enter to open.
                </div>
              )}
              {q.trim() && loading && flat.length === 0 && (
                <div className="px-4 py-3 text-[12px] text-[color:var(--text-tertiary)]">
                  Searching…
                </div>
              )}
              {q.trim() && !loading && flat.length === 0 && (
                <div className="px-4 py-6 text-[12px] text-[color:var(--text-tertiary)]">
                  No matches for &ldquo;{q}&rdquo;.
                </div>
              )}
              {results.conversations.length > 0 && (
                <Group label="Conversations">
                  {results.conversations.map((c, i) => (
                    <ResultRow
                      key={`c${c.id}`}
                      title={c.title}
                      snippet={c.snippet}
                      active={activeIdx === i}
                      onClick={() => openResult(i)}
                    />
                  ))}
                </Group>
              )}
              {results.findings.length > 0 && (
                <Group label="Findings">
                  {results.findings.map((f, i) => (
                    <ResultRow
                      key={`f${f.id}`}
                      title={f.title}
                      snippet={f.snippet}
                      active={activeIdx === results.conversations.length + i}
                      onClick={() =>
                        openResult(results.conversations.length + i)
                      }
                    />
                  ))}
                </Group>
              )}
              {results.briefs.length > 0 && (
                <Group label="Briefs">
                  {results.briefs.map((b, i) => (
                    <ResultRow
                      key={`b${b.id}`}
                      title={b.title}
                      snippet={b.snippet}
                      active={
                        activeIdx ===
                        results.conversations.length + results.findings.length + i
                      }
                      onClick={() =>
                        openResult(
                          results.conversations.length + results.findings.length + i
                        )
                      }
                    />
                  ))}
                </Group>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

function Group({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-2">
      <div className="px-4 py-1.5 text-[10px] uppercase tracking-[0.08em] text-[color:var(--text-tertiary)] font-medium">
        {label}
      </div>
      <div>{children}</div>
    </div>
  );
}

function ResultRow({
  title,
  snippet,
  active,
  onClick,
}: {
  title: string;
  snippet: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-4 py-2 ${
        active
          ? "bg-[color:var(--surface-elevated)]"
          : "hover:bg-[color:var(--surface-hover)]"
      }`}
    >
      <div className="text-[13px] text-[color:var(--text-primary)] truncate">{title}</div>
      {snippet && (
        <div className="text-[11px] text-[color:var(--text-tertiary)] truncate mt-0.5">
          matches: {snippet}
        </div>
      )}
    </button>
  );
}

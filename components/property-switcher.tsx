"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Activity, Star, Search } from "lucide-react";

type Option = {
  id: number;
  display_name: string;
  user_id: number;
};

const FAV_KEY = "ga-chat:favorite-properties";

function loadFavorites(): Set<number> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(FAV_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw) as number[];
    return new Set(arr.filter((n) => Number.isFinite(n)));
  } catch {
    return new Set();
  }
}

function saveFavorites(favs: Set<number>) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(FAV_KEY, JSON.stringify(Array.from(favs)));
  } catch {
    // soft-fail
  }
}

export function PropertySwitcher({
  options,
  activeIds,
  label,
  isUnion,
  onChange,
}: {
  options: Option[];
  activeIds: number[];
  label: string;
  isUnion: boolean;
  onChange: (ids: number[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set(activeIds));
  const [favorites, setFavorites] = useState<Set<number>>(new Set());
  const [query, setQuery] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setSelected(new Set(activeIds));
  }, [activeIds]);

  useEffect(() => {
    setFavorites(loadFavorites());
  }, []);

  useEffect(() => {
    function handle(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    }
    if (open) {
      document.addEventListener("mousedown", handle);
      // Focus search on open
      setTimeout(() => searchRef.current?.focus(), 30);
      return () => document.removeEventListener("mousedown", handle);
    }
  }, [open]);

  function toggle(id: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleFavorite(id: number, e: React.MouseEvent) {
    e.stopPropagation();
    setFavorites((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      saveFavorites(next);
      return next;
    });
  }

  function apply() {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    onChange(ids);
    setOpen(false);
  }

  const { favorited, rest } = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = q
      ? options.filter((o) => o.display_name.toLowerCase().includes(q))
      : options;
    return {
      favorited: filtered.filter((o) => favorites.has(o.id)),
      rest: filtered.filter((o) => !favorites.has(o.id)),
    };
  }, [options, favorites, query]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="h-8 px-2.5 rounded-md border border-[color:var(--border)] bg-[color:var(--surface-elevated)] hover:bg-[color:var(--surface-hover)] tx-hover inline-flex items-center gap-1.5 text-[12px] text-[color:var(--text-primary)] max-w-[260px]"
      >
        {isUnion && (
          <Activity
            strokeWidth={1.5}
            className="size-3.5 shrink-0 text-[color:var(--text-secondary)]"
          />
        )}
        <span className="font-medium truncate">{label}</span>
        <ChevronDown
          strokeWidth={1.5}
          className="size-3.5 shrink-0 text-[color:var(--text-tertiary)]"
        />
      </button>
      {open && (
        <div
          className="absolute right-0 mt-1.5 z-30 w-[320px] rounded-lg border border-[color:var(--border)] bg-[color:var(--surface)] overflow-hidden flex flex-col"
          style={{ boxShadow: "0 8px 32px rgba(0,0,0,0.5)", maxHeight: "70vh" }}
        >
          <div className="p-2 border-b border-[color:var(--border)]">
            <div className="relative">
              <Search
                strokeWidth={1.5}
                className="size-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-[color:var(--text-tertiary)] pointer-events-none"
              />
              <input
                ref={searchRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search properties…"
                className="w-full h-8 pl-8 pr-2.5 rounded-md bg-[color:var(--surface-elevated)] border border-[color:var(--border)] text-[12px] placeholder:text-[color:var(--text-tertiary)] focus:outline-none focus:border-[color:var(--border-focus)]"
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto py-1">
            {options.length === 0 && (
              <div className="px-3 py-3 text-[12px] text-[color:var(--text-tertiary)]">
                No properties available.
              </div>
            )}
            {options.length > 0 && favorited.length === 0 && rest.length === 0 && (
              <div className="px-3 py-3 text-[12px] text-[color:var(--text-tertiary)]">
                No matches for &ldquo;{query}&rdquo;.
              </div>
            )}

            {favorited.length > 0 && (
              <Section title="Favorites">
                {favorited.map((o) => (
                  <Row
                    key={o.id}
                    option={o}
                    checked={selected.has(o.id)}
                    favorited
                    onToggle={() => toggle(o.id)}
                    onToggleFavorite={(e) => toggleFavorite(o.id, e)}
                  />
                ))}
              </Section>
            )}

            {rest.length > 0 && (
              <Section title={favorited.length > 0 ? "All properties" : undefined}>
                {rest.map((o) => (
                  <Row
                    key={o.id}
                    option={o}
                    checked={selected.has(o.id)}
                    favorited={false}
                    onToggle={() => toggle(o.id)}
                    onToggleFavorite={(e) => toggleFavorite(o.id, e)}
                  />
                ))}
              </Section>
            )}
          </div>

          <div className="flex items-center justify-between gap-2 px-2.5 py-2 border-t border-[color:var(--border)]">
            <div className="text-[11px] text-[color:var(--text-tertiary)] font-mono tabular-nums">
              {selected.size <= 1 ? "single mode" : `union · ${selected.size}`}
            </div>
            <button
              onClick={apply}
              disabled={selected.size === 0}
              className="text-[11px] font-medium px-2.5 h-7 rounded-md bg-[color:var(--text-primary)] text-[color:var(--bg)] hover:bg-white disabled:opacity-50 tx-hover"
            >
              Apply
            </button>
          </div>
          <a
            href="/api/auth/login?add=1"
            className="block px-2.5 py-2 text-[11px] text-[color:var(--text-tertiary)] hover:text-[color:var(--text-primary)] hover:bg-[color:var(--surface-hover)] tx-hover border-t border-[color:var(--border)]"
          >
            + Add another Google account
          </a>
        </div>
      )}
    </div>
  );
}

function Section({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <div className="px-1 py-1">
      {title && (
        <div className="px-2 py-1 text-[10px] uppercase tracking-[0.08em] text-[color:var(--text-tertiary)] font-medium">
          {title}
        </div>
      )}
      {children}
    </div>
  );
}

function Row({
  option,
  checked,
  favorited,
  onToggle,
  onToggleFavorite,
}: {
  option: Option;
  checked: boolean;
  favorited: boolean;
  onToggle: () => void;
  onToggleFavorite: (e: React.MouseEvent) => void;
}) {
  return (
    <button
      onClick={onToggle}
      className={`group w-full text-left flex items-center gap-2.5 px-2 py-1.5 rounded-md tx-hover ${
        checked ? "bg-[color:var(--surface-elevated)]" : "hover:bg-[color:var(--surface-hover)]"
      }`}
    >
      <span
        className={`size-4 rounded border flex items-center justify-center shrink-0 ${
          checked
            ? "border-[color:var(--text-primary)] bg-[color:var(--text-primary)]"
            : "border-[color:var(--border-strong)]"
        }`}
      >
        {checked && (
          <svg
            width="10"
            height="10"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#0a0a0a"
            strokeWidth="3"
          >
            <polyline points="20 6 9 17 4 12" />
          </svg>
        )}
      </span>
      <span className="text-[12px] truncate flex-1 text-[color:var(--text-primary)]">
        {option.display_name}
      </span>
      <span
        role="button"
        onClick={onToggleFavorite}
        title={favorited ? "Remove from favorites" : "Add to favorites"}
        className={`size-6 inline-flex items-center justify-center rounded-md shrink-0 ${
          favorited
            ? "text-[color:var(--text-primary)]"
            : "text-[color:var(--text-tertiary)] opacity-0 group-hover:opacity-100 hover:text-[color:var(--text-primary)]"
        } tx-hover`}
      >
        <Star
          strokeWidth={1.5}
          className="size-3.5"
          fill={favorited ? "currentColor" : "none"}
        />
      </span>
    </button>
  );
}

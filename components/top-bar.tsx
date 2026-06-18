"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Power, Sparkles, Menu, Bell, LogOut, Settings, Plug } from "lucide-react";
import { WorkspaceSwitcher } from "@/components/workspace-switcher";
import { cachedJSON, invalidate } from "@/lib/client-cache";
import { useEventStream, type StreamEvent } from "@/lib/use-event-stream";
import { BriefingModal, type Insight } from "@/components/briefing-modal";

// Self-contained chrome: no props from pages. Lives in app/(app)/layout.tsx.
// Scan + briefing trigger their own internal flows. Pages that want page-
// specific actions render them inline in their own content area.
export function TopBar({ onMenu }: { onMenu?: () => void } = {}) {
  const [unread, setUnread] = useState(0);
  const [user, setUser] = useState<{ email: string; initial: string } | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [briefingOpen, setBriefingOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  async function scanNow() {
    setScanning(true);
    try {
      await fetch("/api/scan", { method: "POST" });
    } finally {
      setScanning(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    async function loadUnread(force = false) {
      try {
        const d = await cachedJSON<{ unread_count?: number }>(
          "/api/findings",
          { force }
        );
        if (!cancelled) setUnread(d.unread_count ?? 0);
      } catch {
        /* soft-fail */
      }
    }
    async function loadUser() {
      try {
        const d = await cachedJSON<{ email?: string }>("/api/me");
        if (d.email && !cancelled) {
          setUser({ email: d.email, initial: (d.email[0] || "?").toUpperCase() });
        }
      } catch {
        /* soft-fail */
      }
    }
    loadUnread();
    loadUser();
    // Safety-net poll every 5 min; SSE is the primary path.
    const id = setInterval(() => {
      if (document.visibilityState === "visible") loadUnread(true);
    }, 300_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  useEventStream((ev: StreamEvent) => {
    if (ev.kind === "finding.new" || ev.kind === "findings.changed" || ev.kind === "scan.completed") {
      invalidate("/api/findings");
      cachedJSON<{ unread_count?: number }>("/api/findings", { force: true })
        .then((d) => setUnread(d.unread_count ?? 0))
        .catch(() => {});
    }
  });

  useEffect(() => {
    function handle(e: MouseEvent) {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    }
    if (menuOpen) {
      document.addEventListener("mousedown", handle);
      return () => document.removeEventListener("mousedown", handle);
    }
  }, [menuOpen]);

  return (
    <header
      className="sticky top-0 z-30 h-12 bg-[color:var(--surface)]/85 border-b border-[color:var(--border)] flex items-center px-3 lg:px-4 gap-2 shrink-0"
      style={{ backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)" }}
    >
      <button
        onClick={onMenu}
        type="button"
        className="lg:hidden size-10 rounded-md hover:bg-[color:var(--surface-hover)] tx-hover flex items-center justify-center"
        aria-label="Open menu"
      >
        <Menu strokeWidth={1.5} className="size-5" />
      </button>

      <Link href="/dashboard" className="flex items-center gap-2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/mark.svg" alt="GA3" width={24} height={24} className="rounded-md" />
        <span className="text-[16px] font-semibold tracking-tight">
          GA3<span className="text-[color:var(--text-tertiary)]">.ai</span>
        </span>
      </Link>

      <div className="flex-1" />

      <div className="flex items-center gap-1.5">
        <WorkspaceSwitcher />
        <button
          onClick={scanNow}
          disabled={scanning}
          title={scanning ? "Scanning" : "Re-scan now"}
          className="size-8 rounded-md hover:bg-[color:var(--surface-hover)] disabled:opacity-50 tx-hover flex items-center justify-center text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)]"
        >
          <Power
            strokeWidth={1.5}
            className={`size-4 ${scanning ? "animate-pulse" : ""}`}
          />
        </button>
        <button
          onClick={() => setBriefingOpen(true)}
          title="Generate Daily Briefing"
          className="size-8 rounded-md hover:bg-[color:var(--surface-hover)] tx-hover flex items-center justify-center text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)]"
        >
          <Sparkles strokeWidth={1.5} className="size-4" />
        </button>
        <Link
          href="/feed"
          title={unread > 0 ? `${unread} unread findings` : "Newsroom"}
          className="size-8 rounded-md hover:bg-[color:var(--surface-hover)] tx-hover flex items-center justify-center text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)] relative"
        >
          <Bell strokeWidth={1.5} className="size-4" />
          {unread > 0 && (
            <span
              aria-hidden
              className="absolute top-1.5 right-1.5 size-1.5 rounded-full"
              style={{ background: "var(--severity-high, #C77B7B)" }}
            />
          )}
        </Link>

        <div ref={menuRef} className="relative">
          <button
            onClick={() => setMenuOpen((v) => !v)}
            title={user?.email ?? "Account"}
            className="size-8 rounded-full bg-[color:var(--surface-elevated)] border border-[color:var(--border-strong)] hover:bg-[color:var(--surface-hover)] tx-hover flex items-center justify-center font-mono text-[12px] font-semibold"
          >
            {user?.initial ?? "·"}
          </button>
          {menuOpen && (
            <div
              className="absolute right-0 top-10 z-30 w-[200px] rounded-md border border-[color:var(--border)] bg-[color:var(--surface)] p-1"
              style={{ boxShadow: "0 8px 32px rgba(0,0,0,0.45)" }}
            >
              {user?.email && (
                <div className="px-2 py-1.5 text-[11px] font-mono text-[color:var(--text-tertiary)] truncate border-b border-[color:var(--border)] mb-1">
                  {user.email}
                </div>
              )}
              <Link
                href="/connectors"
                onClick={() => setMenuOpen(false)}
                className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-[color:var(--surface-hover)] tx-hover text-[12px] text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)]"
              >
                <Plug strokeWidth={1.5} className="size-3.5" />
                Connectors
              </Link>
              <Link
                href="/properties"
                onClick={() => setMenuOpen(false)}
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
      </div>
      <BriefingModal
        open={briefingOpen}
        onClose={() => setBriefingOpen(false)}
        initialInsights={null as Insight[] | null}
        generatedAt={null}
      />
    </header>
  );
}

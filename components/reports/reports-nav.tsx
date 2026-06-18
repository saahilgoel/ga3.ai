"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import {
  REPORTS_BY_SECTION,
  REPORTS,
} from "@/lib/reports/registry";
import {
  SECTION_DEFAULT_EXPANDED,
  SECTION_LABELS,
  type ReportSection,
} from "@/lib/reports/types";

const ORDER: ReportSection[] = [
  "realtime",
  "audience",
  "acquisition",
  "behavior",
  "conversions",
  "performance",
  "google_ads",
];

export function ReportsNav({ onSelect }: { onSelect?: () => void }) {
  const pathname = usePathname();
  const [expanded, setExpanded] = useState<Record<ReportSection, boolean>>(
    () => ({ ...SECTION_DEFAULT_EXPANDED })
  );
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem("ga-chat:reports-nav-expanded");
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<Record<ReportSection, boolean>>;
        setExpanded((cur) => ({ ...cur, ...parsed }));
      }
    } catch {
      /* ignore */
    }
    setHydrated(true);
  }, []);

  function toggle(section: ReportSection) {
    setExpanded((cur) => {
      const next = { ...cur, [section]: !cur[section] };
      try {
        window.localStorage.setItem(
          "ga-chat:reports-nav-expanded",
          JSON.stringify(next)
        );
      } catch {
        /* ignore */
      }
      return next;
    });
  }

  // Auto-expand the section containing the current report.
  useEffect(() => {
    if (!hydrated) return;
    const match = REPORTS.find((r) => pathname === `/reports/${r.section}/${r.slug}`);
    if (match && !expanded[match.section]) {
      setExpanded((cur) => ({ ...cur, [match.section]: true }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, hydrated]);

  return (
    <aside className="w-[220px] shrink-0 h-full border-r border-[color:var(--border)] bg-[color:var(--surface)] overflow-y-auto py-2">
      {ORDER.map((section) => {
        const reports = REPORTS_BY_SECTION[section] ?? [];
        const isOpen = expanded[section];
        return (
          <div key={section} className="mb-1">
            <button
              onClick={() => toggle(section)}
              className="w-full flex items-center gap-1.5 px-3 py-2 text-[10px] font-medium uppercase tracking-[0.08em] text-[color:var(--text-tertiary)] hover:text-[color:var(--text-primary)] tx-hover"
            >
              {isOpen ? (
                <ChevronDown strokeWidth={1.5} className="size-3" />
              ) : (
                <ChevronRight strokeWidth={1.5} className="size-3" />
              )}
              <span>{SECTION_LABELS[section]}</span>
            </button>
            {isOpen && (
              <ul className="space-y-0.5 mb-1">
                {reports.map((r) => {
                  const href = `/reports/${r.section}/${r.slug}`;
                  const active = pathname === href;
                  return (
                    <li key={r.slug}>
                      <Link
                        href={href}
                        onClick={onSelect}
                        className={`relative flex items-center pl-4 pr-3 py-1.5 text-[13px] tx-hover ${
                          active
                            ? "bg-[color:var(--surface-elevated)] text-[color:var(--text-primary)]"
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
                        <span className="truncate">{r.navLabel}</span>
                        {r.comingSoon && (
                          <span className="ml-auto text-[9px] font-mono text-[color:var(--text-tertiary)]">
                            soon
                          </span>
                        )}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        );
      })}
    </aside>
  );
}

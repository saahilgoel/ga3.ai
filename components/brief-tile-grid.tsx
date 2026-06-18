"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  Calendar,
  Wallet,
  FileText,
  Users,
  TrendingDown,
  History,
  Eye,
  AlertTriangle,
  Skull,
  ListChecks,
  Network,
  GitBranch,
  Scale,
  LineChart,
  Layout,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { BRIEF_TEMPLATES, BRIEF_ORDER } from "@/lib/briefs/templates";
import { TimeTravelModal } from "@/components/time-travel-modal";
import { PaywallModal } from "@/components/paywall-modal";

const ICONS: Record<string, LucideIcon> = {
  Calendar,
  Wallet,
  FileText,
  Users,
  TrendingDown,
  History,
  Eye,
  AlertTriangle,
  Skull,
  ListChecks,
  Network,
  GitBranch,
  Scale,
  LineChart,
  Layout,
};

const FREE_BRIEFS_KEY = "ga-chat:free-briefs-used";
const PRO_TRIAL_KEY = "ga-chat:pro-trial";
const FREE_BRIEFS_LIMIT = 1;

function readFreeUsed(): number {
  if (typeof window === "undefined") return 0;
  try {
    return parseInt(window.localStorage.getItem(FREE_BRIEFS_KEY) || "0", 10) || 0;
  } catch {
    return 0;
  }
}

function writeFreeUsed(n: number) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(FREE_BRIEFS_KEY, String(n));
  } catch {
    // soft-fail
  }
}

function hasProTrial(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(PRO_TRIAL_KEY) === "1";
  } catch {
    return false;
  }
}

function activateProTrial() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(PRO_TRIAL_KEY, "1");
  } catch {
    // soft-fail
  }
}

export function BriefTileGrid({
  highlight,
  compact = false,
}: {
  highlight?: string;
  compact?: boolean;
}) {
  const router = useRouter();
  const [running, setRunning] = useState<string | null>(null);
  const [timeTravelOpen, setTimeTravelOpen] = useState(false);
  const [paywallOpen, setPaywallOpen] = useState(false);
  const [pendingTemplate, setPendingTemplate] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pro, setPro] = useState(false);

  useEffect(() => {
    setPro(hasProTrial());
  }, []);

  async function run(templateId: string, params?: Record<string, unknown>) {
    setError(null);
    setRunning(templateId);
    try {
      const res = await fetch("/api/briefs/run", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ template_id: templateId, params, ...(params ?? {}) }),
      });
      const data = (await res.json()) as { brief_id?: number; error?: string };
      if (data.brief_id) {
        router.push(`/briefs/${data.brief_id}`);
      } else {
        setError(data.error || "Could not start the brief.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRunning(null);
    }
  }

  function dispatch(templateId: string) {
    // The Time Travel brief needs a date-range modal first.
    if (templateId === "time_travel") {
      setTimeTravelOpen(true);
      return;
    }
    run(templateId);
  }

  function start(templateId: string) {
    if (pro) {
      // Unlimited under Pro trial
      dispatch(templateId);
      return;
    }
    const used = readFreeUsed();
    if (used >= FREE_BRIEFS_LIMIT) {
      // Out of free briefs — paywall the second click and remember the intent.
      setPendingTemplate(templateId);
      setPaywallOpen(true);
      return;
    }
    writeFreeUsed(used + 1);
    dispatch(templateId);
  }

  return (
    <>
      {error && (
        <div className="mb-4 text-[12px] text-[color:var(--severity-high)] rounded-md border border-[color:var(--border)] px-3 py-2">
          {error}
        </div>
      )}
      <div
        className={`grid gap-3 ${
          compact
            ? "grid-cols-2 lg:grid-cols-4"
            : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3"
        }`}
      >
        {BRIEF_ORDER.map((id, i) => {
          const t = BRIEF_TEMPLATES[id];
          const Icon = ICONS[t.icon] ?? Calendar;
          const isHighlighted = highlight === id;
          const isRunning = running === id;
          return (
            <motion.button
              key={id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05 + i * 0.03, duration: 0.2 }}
              onClick={() => start(id)}
              disabled={!!running}
              className={`text-left rounded-lg border bg-[color:var(--surface)] p-4 tx-hover relative overflow-hidden ${
                isHighlighted
                  ? "border-[color:var(--border-strong)] ring-1 ring-[color:var(--border-strong)]"
                  : "border-[color:var(--border)] hover:border-[color:var(--border-strong)] hover:bg-[color:var(--surface-hover)]"
              } ${running && !isRunning ? "opacity-50" : ""}`}
              style={compact ? { minHeight: 110 } : { minHeight: 140 }}
            >
              <div className="flex items-start justify-between mb-2.5">
                <Icon
                  strokeWidth={1.5}
                  className="size-4 text-[color:var(--text-secondary)]"
                />
                {isHighlighted && (
                  <span className="text-[9px] uppercase tracking-[0.08em] font-mono text-[color:var(--text-tertiary)]">
                    Start here
                  </span>
                )}
              </div>
              <div className="font-serif text-[16px] font-medium tracking-tight text-[color:var(--text-primary)] leading-snug">
                {t.title}
              </div>
              <div className="text-[12px] text-[color:var(--text-tertiary)] mt-0.5">
                {t.subtitle}
              </div>
              {!compact && (
                <div className="text-[13px] text-[color:var(--text-secondary)] leading-relaxed mt-2.5 line-clamp-3">
                  {t.description}
                </div>
              )}
              {isRunning && (
                <div className="absolute inset-x-0 bottom-0 h-[2px] overflow-hidden">
                  <div
                    className="h-full"
                    style={{
                      background:
                        "linear-gradient(90deg, transparent, var(--text-primary), transparent)",
                      width: "40%",
                      animation: "scanStripe 1.5s linear infinite",
                    }}
                  />
                </div>
              )}
            </motion.button>
          );
        })}
      </div>
      <TimeTravelModal
        open={timeTravelOpen}
        onClose={() => setTimeTravelOpen(false)}
        onRun={(params) => {
          setTimeTravelOpen(false);
          run("time_travel", params);
        }}
      />
      <PaywallModal
        open={paywallOpen}
        onClose={() => setPaywallOpen(false)}
        onActivatePro={() => {
          activateProTrial();
          setPro(true);
          const pending = pendingTemplate;
          setPendingTemplate(null);
          if (pending) {
            // Pro unlocked — reset the free counter and run the brief they tried.
            writeFreeUsed(0);
            dispatch(pending);
          }
        }}
      />
    </>
  );
}

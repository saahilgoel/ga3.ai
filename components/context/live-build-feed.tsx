"use client";

import { useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useEventStream, type StreamEvent } from "@/lib/use-event-stream";
import { SiteFavicon } from "@/components/site-favicon";

// A live, animated feed of what the system is discovering about THIS property
// while context builds — homepage, catalog, competitors, news, reviews. Driven
// by the same SSE events the top-bar strip uses, but rich and personal: the
// user watches their own site, products, and competitors stream in.

type Item = {
  id: string;
  color: string;
  title: string;
  detail?: string;
  pct: number;
  done: boolean;
  ts: number;
};

const C = {
  context: "#7c6bff", // cyan — own site / context
  competitor: "#cfcfcf", // pink — competitors
  industry: "#facc15", // yellow — market / news
  scan: "#a78bfa", // purple — analytics scan
};

export function LiveBuildFeed({
  site,
  name,
}: {
  site: string; // domain/url for the favicon
  name: string; // brand or domain label
}) {
  const [items, setItems] = useState<Record<string, Item>>({});
  const [chunks, setChunks] = useState(0);
  const [docs, setDocs] = useState(0);
  // Monotonic counter for stable ordering across fast event bursts.
  const seqRef = useRef(0);

  useEventStream((ev: StreamEvent) => {
    const bump = (id: string, patch: Omit<Item, "id" | "ts">) => {
      const ts = (seqRef.current += 1);
      setItems((prev) => {
        const existed = prev[id];
        return {
          ...prev,
          [id]: {
            id,
            ts: existed?.ts ?? ts, // keep first-seen order; pct updates in place
            ...patch,
            pct: Math.max(existed?.pct ?? 0, patch.pct),
          },
        };
      });
    };

    if (ev.kind === "context.progress") {
      if (typeof ev.doc_count === "number") setDocs((d) => Math.max(d, ev.doc_count!));
      if (typeof ev.chunk_count === "number")
        setChunks((c) => Math.max(c, ev.chunk_count!));
      bump(`ctx:${ev.step}`, {
        color: C.context,
        title: ev.step,
        pct: ev.pct,
        done: ev.status === "ready" || ev.status === "partial" || ev.pct >= 100,
      });
    } else if (ev.kind === "competitor.progress") {
      bump(`comp:${ev.competitor_id}`, {
        color: C.competitor,
        title: `Studying ${ev.brand_name}`,
        detail: ev.step,
        pct: ev.pct,
        done: ev.status === "ready" || ev.status === "failed" || ev.pct >= 100,
      });
    } else if (ev.kind === "industry.progress") {
      bump("industry", {
        color: C.industry,
        title: "Reading the market",
        detail: ev.step,
        pct: ev.pct,
        done: ev.status === "ready" || ev.status === "idle" || ev.pct >= 100,
      });
    } else if (ev.kind === "scan.progress") {
      bump("scan", {
        color: C.scan,
        title: "Scanning your analytics",
        detail: ev.phase,
        pct: ev.pct,
        done: false,
      });
    } else if (ev.kind === "scan.completed") {
      bump("scan", {
        color: C.scan,
        title: "Scanning your analytics",
        detail:
          ev.new_findings > 0
            ? `${ev.new_findings} new finding${ev.new_findings === 1 ? "" : "s"}`
            : "no new findings",
        pct: 100,
        done: true,
      });
    }
  });

  const list = Object.values(items).sort((a, b) => b.ts - a.ts).slice(0, 14);

  return (
    <div className="mb-6 rounded-lg border border-[color:var(--border)] bg-black/40 overflow-hidden">
      {/* Header — the user's own brand, front and centre */}
      <div className="flex items-center gap-2.5 px-4 py-3 border-b border-[color:var(--border)]">
        <SiteFavicon url={site} size={20} />
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-medium truncate">
            Getting to know {name}
          </div>
        </div>
        <div className="flex items-center gap-3 font-mono text-[11px] tabular-nums text-[color:var(--text-tertiary)] shrink-0">
          {docs > 0 && (
            <span>
              <span className="text-[color:var(--text-secondary)]">{docs.toLocaleString("en-IN")}</span> docs
            </span>
          )}
          {chunks > 0 && (
            <span>
              <span className="text-[color:var(--text-secondary)]">{chunks.toLocaleString("en-IN")}</span> chunks
            </span>
          )}
          <span
            className="inline-block size-1.5 rounded-full neon-pulse"
            style={{ background: "#7c6bff", boxShadow: "0 0 8px #7c6bff" }}
          />
        </div>
      </div>

      {/* Feed */}
      <div className="px-2 py-1.5">
        {list.length === 0 ? (
          <div className="px-2 py-4 text-[12px] text-[color:var(--text-tertiary)]">
            Warming up — discoveries will stream in here.
          </div>
        ) : (
          <AnimatePresence initial={false}>
            {list.map((it) => (
              <motion.div
                key={it.id}
                layout
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.22, ease: [0.2, 0, 0, 1] }}
                className="relative flex items-center gap-2.5 px-2 py-1.5 rounded-md"
              >
                <span
                  aria-hidden
                  className={`inline-block rounded-full shrink-0 ${it.done ? "" : "neon-pulse"}`}
                  style={{
                    width: 7,
                    height: 7,
                    background: it.color,
                    boxShadow: it.done
                      ? `0 0 4px ${it.color}80`
                      : `0 0 6px ${it.color}, 0 0 14px ${it.color}99`,
                    opacity: it.done ? 0.7 : 1,
                  }}
                />
                <span
                  className="text-[12px] font-medium shrink-0"
                  style={{ color: it.color }}
                >
                  {it.title}
                </span>
                {it.detail && (
                  <span className="text-[12px] text-[color:var(--text-secondary)] truncate min-w-0 flex-1">
                    {it.detail}
                  </span>
                )}
                {it.done ? (
                  <svg
                    className="ml-auto shrink-0"
                    width="13"
                    height="13"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke={it.color}
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                ) : (
                  <span
                    className="ml-auto shrink-0 text-[10px] font-mono tabular-nums"
                    style={{ color: it.color }}
                  >
                    {Math.min(99, Math.max(0, Math.round(it.pct)))}%
                  </span>
                )}
              </motion.div>
            ))}
          </AnimatePresence>
        )}
      </div>
    </div>
  );
}

"use client";

import { motion } from "framer-motion";
import { useState } from "react";
import { Copy, Mail, Pin, RotateCw, ArrowLeft, Check } from "lucide-react";
import Link from "next/link";
import { AGENT_MAP } from "@/lib/agents";
import { AGENT_HEX } from "@/lib/viz";
import { Monogram } from "@/components/monogram";
import { VisualizationRenderer } from "@/components/viz";
import { MarkdownMessage } from "@/components/markdown-message";
import type { BriefOutput, BriefSection } from "@/lib/briefs/types";

export function BriefArtifact({
  briefId,
  output,
}: {
  briefId: number;
  output: BriefOutput;
}) {
  const [pinned, setPinned] = useState(false);
  const [copiedSlack, setCopiedSlack] = useState(false);
  const [copiedEmail, setCopiedEmail] = useState(false);

  async function pin() {
    setPinned(true);
    await fetch(`/api/briefs/${briefId}/pin`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ pinned: !pinned }),
    }).catch(() => {});
  }

  function copySlack() {
    const text = formatSlack(output);
    navigator.clipboard.writeText(text);
    setCopiedSlack(true);
    setTimeout(() => setCopiedSlack(false), 1600);
  }
  function copyEmail() {
    const text = formatEmail(output);
    navigator.clipboard.writeText(text);
    setCopiedEmail(true);
    setTimeout(() => setCopiedEmail(false), 1600);
  }

  return (
    <main className="min-h-screen bg-[color:var(--bg)] text-[color:var(--text-primary)]">
      <div className="sticky top-0 z-20 bg-[color:var(--bg)]/85 border-b border-[color:var(--border)]" style={{ backdropFilter: "blur(8px)" }}>
        <div className="mx-auto max-w-[760px] px-5 py-3 flex items-center justify-between gap-3">
          <Link
            href="/briefs"
            className="text-[12px] text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)] tx-hover inline-flex items-center gap-1.5"
          >
            <ArrowLeft strokeWidth={1.5} className="size-3.5" /> Briefs
          </Link>
          <div className="flex items-center gap-1">
            <button
              onClick={copySlack}
              className="h-8 px-2.5 rounded-md hover:bg-[color:var(--surface-hover)] tx-hover text-[12px] text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)] inline-flex items-center gap-1.5"
            >
              {copiedSlack ? (
                <Check strokeWidth={1.5} className="size-3.5" />
              ) : (
                <Copy strokeWidth={1.5} className="size-3.5" />
              )}
              {copiedSlack ? "Copied" : "Copy as Slack"}
            </button>
            <button
              onClick={copyEmail}
              className="h-8 px-2.5 rounded-md hover:bg-[color:var(--surface-hover)] tx-hover text-[12px] text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)] inline-flex items-center gap-1.5"
            >
              {copiedEmail ? (
                <Check strokeWidth={1.5} className="size-3.5" />
              ) : (
                <Mail strokeWidth={1.5} className="size-3.5" />
              )}
              {copiedEmail ? "Copied" : "Copy as Email"}
            </button>
            <button
              onClick={pin}
              className={`h-8 px-2.5 rounded-md tx-hover text-[12px] inline-flex items-center gap-1.5 ${
                pinned
                  ? "text-[color:var(--text-primary)] bg-[color:var(--surface-elevated)]"
                  : "text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)] hover:bg-[color:var(--surface-hover)]"
              }`}
            >
              <Pin strokeWidth={1.5} className="size-3.5" fill={pinned ? "currentColor" : "none"} />
              {pinned ? "Pinned" : "Pin"}
            </button>
            <Link
              href={`/briefs?rerun=${output.template_id}`}
              className="h-8 px-2.5 rounded-md hover:bg-[color:var(--surface-hover)] tx-hover text-[12px] text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)] inline-flex items-center gap-1.5"
            >
              <RotateCw strokeWidth={1.5} className="size-3.5" />
              Re-run
            </Link>
          </div>
        </div>
      </div>

      <article className="mx-auto max-w-[720px] px-5 py-10 lg:py-14">
        <motion.header
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25, ease: [0.2, 0, 0, 1] }}
          className="mb-10"
        >
          <h1 className="font-mono text-[32px] font-medium tracking-[-0.02em] leading-[1.15]">
            {output.title}
          </h1>
          {output.subtitle && (
            <p className="font-mono text-[16px] text-[color:var(--text-tertiary)] mt-1.5">
              {output.subtitle}
            </p>
          )}
          {output.range_label && (
            <p className="font-mono text-[12px] text-[color:var(--text-tertiary)] tabular-nums mt-3">
              {output.range_label}
            </p>
          )}
        </motion.header>

        <div className="space-y-10">
          {output.sections.map((section, i) => (
            <SectionView key={i} section={section} index={i} />
          ))}
        </div>

        {output.footer && (
          <footer className="mt-12 pt-4 border-t border-[color:var(--border)] text-[11px] font-mono text-[color:var(--text-tertiary)] tabular-nums">
            generated in {output.footer.duration_s ?? "?"}s
            {output.footer.agent_calls != null && ` · ${output.footer.agent_calls} agent calls`}
            {output.footer.ga4_calls != null && ` · ${output.footer.ga4_calls} GA4 queries`}
          </footer>
        )}
      </article>
    </main>
  );
}

function SectionView({ section, index }: { section: BriefSection; index: number }) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay: 0.06 + index * 0.04, ease: [0.2, 0, 0, 1] }}
      className="space-y-3"
    >
      <h2 className="font-mono text-[18px] font-medium tracking-[-0.01em] inline-block pb-1 border-b border-[color:var(--border)]">
        {section.heading}
      </h2>

      {section.body && (
        <div className="text-[15px] leading-[1.65]">
          <MarkdownMessage content={section.body} />
        </div>
      )}

      {section.kpis && section.kpis.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {section.kpis.map((kpi, i) => (
            <KpiTile key={i} kpi={kpi} />
          ))}
        </div>
      )}

      {section.bullets && section.bullets.length > 0 && (
        <ul className="space-y-2.5">
          {section.bullets.map((b, i) => (
            <li key={i} className="flex items-start gap-2.5 text-[15px] leading-[1.65]">
              <span className="text-[color:var(--text-tertiary)] mt-1.5 shrink-0 select-none">
                •
              </span>
              <div className="flex-1">
                <span className="text-[color:var(--text-primary)]">
                  <MarkdownMessage content={b.text} />
                </span>
                {b.agent && AGENT_MAP[b.agent] && (
                  <span className="text-[12px] text-[color:var(--text-tertiary)] italic ml-1.5">
                    ({AGENT_MAP[b.agent].name})
                  </span>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {section.table && (
        <TableView
          columns={section.table.columns}
          rows={section.table.rows}
          highlight={section.table.highlight_rows}
        />
      )}

      {section.funnel && <FunnelView steps={section.funnel.steps} />}

      {section.visualization && (
        <div className="rounded-lg overflow-hidden">
          <VisualizationRenderer viz={section.visualization} />
        </div>
      )}
    </motion.section>
  );
}

function KpiTile({
  kpi,
}: {
  kpi: {
    label: string;
    value: string;
    change_pct?: number;
    change_direction?: "up" | "down" | "flat";
  };
}) {
  const dir = kpi.change_direction;
  const changeColor =
    dir === "up"
      ? "var(--severity-low)"
      : dir === "down"
      ? "var(--severity-high)"
      : "var(--text-tertiary)";
  const arrow = dir === "up" ? "↑" : dir === "down" ? "↓" : "→";
  return (
    <div className="rounded-md border border-[color:var(--border)] bg-[color:var(--surface)] p-3">
      <div className="text-[10px] uppercase tracking-[0.08em] text-[color:var(--text-tertiary)]">
        {kpi.label}
      </div>
      <div className="font-mono text-[22px] font-medium tabular-nums leading-none mt-1.5">
        {kpi.value}
      </div>
      {typeof kpi.change_pct === "number" && (
        <div className="text-[11px] font-mono tabular-nums mt-1.5" style={{ color: changeColor }}>
          <span>{arrow}</span> {kpi.change_pct > 0 ? "+" : ""}
          {kpi.change_pct.toFixed(1)}%
        </div>
      )}
    </div>
  );
}

function TableView({
  columns,
  rows,
  highlight = [],
}: {
  columns: string[];
  rows: string[][];
  highlight?: number[];
}) {
  const highlightSet = new Set(highlight);
  return (
    <div className="rounded-md border border-[color:var(--border)] overflow-x-auto">
      <table className="w-full text-[13px]">
        <thead>
          <tr>
            {columns.map((c, i) => (
              <th
                key={i}
                className="px-3 py-2 text-left font-medium text-[color:var(--text-secondary)] bg-[color:var(--surface-elevated)] border-b border-[color:var(--border)]"
              >
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr
              key={i}
              className={`border-b border-[color:var(--border)] last:border-b-0 ${
                highlightSet.has(i) ? "bg-[color:var(--severity-high)]/10" : ""
              }`}
            >
              {r.map((cell, j) => (
                <td key={j} className="px-3 py-2 align-top tabular-nums">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function FunnelView({
  steps,
}: {
  steps: Array<{ label: string; count: number }>;
}) {
  if (steps.length === 0) return null;
  const max = Math.max(...steps.map((s) => s.count));
  return (
    <div className="space-y-1.5">
      {steps.map((s, i) => {
        const widthPct = max > 0 ? Math.max(10, (s.count / max) * 100) : 10;
        const prev = i > 0 ? steps[i - 1].count : null;
        const dropPct = prev != null && prev > 0 ? ((prev - s.count) / prev) * 100 : null;
        return (
          <div key={i}>
            <div className="flex items-center justify-between text-[12px] mb-1">
              <span className="font-medium text-[color:var(--text-primary)]">{s.label}</span>
              <span className="font-mono tabular-nums text-[color:var(--text-tertiary)]">
                {s.count.toLocaleString("en-IN")}
              </span>
            </div>
            <div className="h-7 rounded-md bg-[color:var(--surface-elevated)] overflow-hidden border border-[color:var(--border)]">
              <div
                className="h-full"
                style={{
                  width: `${widthPct}%`,
                  background: "var(--text-primary)",
                  opacity: 0.85,
                }}
              />
            </div>
            {dropPct != null && (
              <div className="text-[11px] font-mono text-[color:var(--severity-high)] mt-0.5 pl-1 tabular-nums">
                ↓ {dropPct.toFixed(1)}% drop
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function formatSlack(output: BriefOutput): string {
  const lines: string[] = [];
  lines.push(`*${output.title}${output.subtitle ? ` — ${output.subtitle}` : ""}*`);
  if (output.range_label) lines.push(`_${output.range_label}_`);
  lines.push("");
  for (const s of output.sections) {
    lines.push(`*${s.heading}*`);
    if (s.body) lines.push(s.body);
    if (s.bullets) {
      for (const b of s.bullets) {
        const agent = b.agent && AGENT_MAP[b.agent] ? ` _(${AGENT_MAP[b.agent].name})_` : "";
        lines.push(`• ${b.text.replace(/\*\*/g, "*")}${agent}`);
      }
    }
    if (s.kpis) {
      for (const k of s.kpis) {
        const delta =
          typeof k.change_pct === "number"
            ? ` (${k.change_pct > 0 ? "+" : ""}${k.change_pct.toFixed(1)}%)`
            : "";
        lines.push(`• ${k.label}: \`${k.value}\`${delta}`);
      }
    }
    if (s.table) {
      lines.push("```");
      lines.push(s.table.columns.join(" | "));
      for (const r of s.table.rows) lines.push(r.join(" | "));
      lines.push("```");
    }
    if (s.funnel) {
      for (const step of s.funnel.steps) {
        lines.push(`• ${step.label}: ${step.count.toLocaleString("en-IN")}`);
      }
    }
    lines.push("");
  }
  lines.push("— generated by ga-chat");
  return lines.join("\n");
}

function formatEmail(output: BriefOutput): string {
  const lines: string[] = [];
  lines.push(`${output.title}`);
  if (output.subtitle) lines.push(output.subtitle);
  if (output.range_label) lines.push(output.range_label);
  lines.push("\n");
  for (const s of output.sections) {
    lines.push(`## ${s.heading}\n`);
    if (s.body) lines.push(`${s.body}\n`);
    if (s.bullets) {
      for (const b of s.bullets) {
        const agent = b.agent && AGENT_MAP[b.agent] ? ` (${AGENT_MAP[b.agent].name})` : "";
        lines.push(`- ${b.text.replace(/\*\*/g, "")}${agent}`);
      }
      lines.push("");
    }
    if (s.table) {
      lines.push(s.table.columns.join("\t"));
      for (const r of s.table.rows) lines.push(r.join("\t"));
      lines.push("");
    }
  }
  lines.push("\n— generated by ga-chat");
  return lines.join("\n");
}

void AGENT_HEX;
void Monogram;

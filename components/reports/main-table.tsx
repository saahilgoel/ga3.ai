"use client";

import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Search } from "lucide-react";
import type { TableColumn, TableSpec } from "@/lib/reports/types";
import type { ReportRow } from "@/lib/reports/runner";

export function MainTable({
  spec,
  rows,
  onInvestigateRow,
}: {
  spec: TableSpec;
  rows: ReportRow[];
  onInvestigateRow?: (row: ReportRow) => void;
}) {
  const [sortIdx, setSortIdx] = useState(spec.defaultSort?.col ?? 0);
  const [sortDesc, setSortDesc] = useState(spec.defaultSort?.desc ?? true);
  const [filter, setFilter] = useState("");
  const [page, setPage] = useState(0);
  const pageSize = spec.pageSize ?? 25;

  const filtered = useMemo(() => {
    if (!filter || spec.filterDimIndex == null) return rows;
    const col = spec.columns[spec.filterDimIndex];
    if (!col || col.source !== "dim") return rows;
    const q = filter.toLowerCase();
    return rows.filter((r) =>
      (r.dimensions[col.key] || "").toLowerCase().includes(q)
    );
  }, [rows, filter, spec.filterDimIndex, spec.columns]);

  const sorted = useMemo(() => {
    const col = spec.columns[sortIdx];
    if (!col) return filtered;
    const copy = [...filtered];
    copy.sort((a, b) => {
      const av = col.source === "dim" ? a.dimensions[col.key] ?? "" : a.metrics[col.key] ?? "";
      const bv = col.source === "dim" ? b.dimensions[col.key] ?? "" : b.metrics[col.key] ?? "";
      if (col.source === "met") {
        const an = Number(av);
        const bn = Number(bv);
        return sortDesc ? bn - an : an - bn;
      }
      return sortDesc ? bv.localeCompare(av) : av.localeCompare(bv);
    });
    return copy;
  }, [filtered, sortIdx, sortDesc, spec.columns]);

  const pages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const start = page * pageSize;
  const visible = sorted.slice(start, start + pageSize);

  // Find the column with bar: true (only one supported visually for max contrast)
  const barCol = spec.columns.findIndex((c) => c.bar);
  const barMax = useMemo(() => {
    if (barCol < 0) return 0;
    const col = spec.columns[barCol];
    if (!col || col.source !== "met") return 0;
    return Math.max(0, ...sorted.map((r) => Number(r.metrics[col.key] || 0)));
  }, [sorted, barCol, spec.columns]);

  function handleSort(i: number) {
    if (i === sortIdx) {
      setSortDesc((d) => !d);
    } else {
      setSortIdx(i);
      setSortDesc(true);
    }
    setPage(0);
  }

  return (
    <div className="rounded-lg border border-[color:var(--border)] bg-[color:var(--surface)] overflow-hidden">
      {spec.filterDimIndex != null && (
        <div className="px-3 py-2 border-b border-[color:var(--border)] flex items-center gap-2 bg-[color:var(--surface-elevated)]">
          <Search strokeWidth={1.5} className="size-3.5 text-[color:var(--text-tertiary)]" />
          <input
            value={filter}
            onChange={(e) => {
              setFilter(e.target.value);
              setPage(0);
            }}
            placeholder={`Filter by ${spec.columns[spec.filterDimIndex].label.toLowerCase()}…`}
            className="flex-1 bg-transparent text-[12px] outline-none placeholder:text-[color:var(--text-tertiary)]"
          />
          <span className="text-[11px] font-mono tabular-nums text-[color:var(--text-tertiary)]">
            {sorted.length} rows
          </span>
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-[12px]">
          <thead className="sticky top-0 bg-[color:var(--surface)]">
            <tr>
              {spec.columns.map((c, i) => (
                <th
                  key={i}
                  onClick={() => handleSort(i)}
                  className="text-left px-3 py-2 text-[10px] font-mono uppercase tracking-[0.06em] text-[color:var(--text-tertiary)] cursor-pointer hover:text-[color:var(--text-primary)] select-none border-b border-[color:var(--border)] whitespace-nowrap"
                >
                  <span className="inline-flex items-center gap-1">
                    {c.label}
                    {sortIdx === i &&
                      (sortDesc ? (
                        <ArrowDown strokeWidth={1.5} className="size-3" />
                      ) : (
                        <ArrowUp strokeWidth={1.5} className="size-3" />
                      ))}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 && (
              <tr>
                <td
                  colSpan={spec.columns.length}
                  className="px-3 py-6 text-center text-[12px] text-[color:var(--text-tertiary)]"
                >
                  No data
                </td>
              </tr>
            )}
            {visible.map((row, ri) => (
              <tr
                key={ri}
                onClick={() => onInvestigateRow?.(row)}
                className={`border-b border-[color:var(--border)] last:border-b-0 ${
                  onInvestigateRow ? "cursor-pointer hover:bg-[color:var(--surface-hover)]" : ""
                }`}
              >
                {spec.columns.map((c, i) => (
                  <Td
                    key={i}
                    col={c}
                    row={row}
                    bar={i === barCol ? { max: barMax } : null}
                  />
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {pages > 1 && (
        <div className="px-3 py-2 border-t border-[color:var(--border)] flex items-center justify-between text-[11px] font-mono tabular-nums text-[color:var(--text-tertiary)]">
          <span>
            {start + 1}–{Math.min(start + pageSize, sorted.length)} of {sorted.length}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              className="px-2 py-0.5 rounded hover:bg-[color:var(--surface-hover)] tx-hover disabled:opacity-30"
            >
              Prev
            </button>
            <span>
              {page + 1} / {pages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(pages - 1, p + 1))}
              disabled={page >= pages - 1}
              className="px-2 py-0.5 rounded hover:bg-[color:var(--surface-hover)] tx-hover disabled:opacity-30"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Td({
  col,
  row,
  bar,
}: {
  col: TableColumn;
  row: ReportRow;
  bar: { max: number } | null;
}) {
  const raw =
    col.source === "dim" ? row.dimensions[col.key] ?? "" : row.metrics[col.key] ?? "";
  const text = format(raw, col.format ?? "string");
  const showBar = bar && Number(raw) > 0 && bar.max > 0;
  const pct = showBar ? Math.min(100, (Number(raw) / bar!.max) * 100) : 0;
  return (
    <td className="relative px-3 py-2 align-middle whitespace-nowrap">
      {showBar && (
        <span
          aria-hidden
          className="absolute inset-y-1 left-2 right-2 rounded"
          style={{
            width: `calc(${pct}% - 1rem)`,
            background: "var(--accent, var(--text-primary))",
            opacity: 0.15,
          }}
        />
      )}
      <span
        className={`relative ${
          col.source === "met" ? "font-mono tabular-nums text-[color:var(--text-primary)]" : "text-[color:var(--text-secondary)]"
        }`}
      >
        {text}
      </span>
    </td>
  );
}

function format(raw: string, fmt: NonNullable<TableColumn["format"]>): string {
  if (fmt === "string") return raw || "—";
  const n = Number(raw);
  if (!Number.isFinite(n)) return raw || "—";
  switch (fmt) {
    case "int":
      return Math.round(n).toLocaleString("en-IN");
    case "compact":
      return compact(n);
    case "percent":
      // GA4 returns 0..1 for rate metrics
      return `${(n * 100).toFixed(1)}%`;
    case "duration_s":
      return formatDuration(n);
    default:
      return raw;
  }
}

function compact(n: number): string {
  if (!Number.isFinite(n)) return "0";
  if (Math.abs(n) >= 1_00_00_000) return `${(n / 1_00_00_000).toFixed(2)} cr`;
  if (Math.abs(n) >= 1_00_000) return `${(n / 1_00_000).toFixed(2)} L`;
  if (Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return Math.round(n).toLocaleString("en-IN");
}

function formatDuration(s: number): string {
  if (s < 60) return `${Math.round(s)}s`;
  const m = Math.floor(s / 60);
  const sec = Math.round(s % 60);
  return `${m}m ${sec}s`;
}

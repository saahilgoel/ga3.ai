"use client";

import { useState } from "react";

export function DataTable({
  columns,
  rows,
}: {
  columns: string[];
  rows: string[][];
}) {
  const [sortIdx, setSortIdx] = useState<number | null>(null);
  const [sortDesc, setSortDesc] = useState(true);

  function sort(idx: number) {
    if (sortIdx === idx) setSortDesc((v) => !v);
    else {
      setSortIdx(idx);
      setSortDesc(true);
    }
  }

  const sortedRows =
    sortIdx === null
      ? rows
      : [...rows].sort((a, b) => {
          const av = a[sortIdx] ?? "";
          const bv = b[sortIdx] ?? "";
          const an = parseFloat(av.replace(/,/g, ""));
          const bn = parseFloat(bv.replace(/,/g, ""));
          if (!isNaN(an) && !isNaN(bn)) return sortDesc ? bn - an : an - bn;
          return sortDesc ? bv.localeCompare(av) : av.localeCompare(bv);
        });

  const display = sortedRows.slice(0, 25);

  return (
    <div className="max-h-[360px] overflow-auto rounded-md border border-[color:var(--border)]">
      <table className="w-full text-xs">
        <thead className="bg-[color:var(--muted)] sticky top-0">
          <tr>
            {columns.map((c, i) => (
              <th
                key={i}
                onClick={() => sort(i)}
                className="text-left px-3 py-2 font-medium cursor-pointer select-none hover:text-[color:var(--accent)]"
              >
                {c}
                {sortIdx === i && <span className="ml-1 opacity-60">{sortDesc ? "▼" : "▲"}</span>}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {display.map((r, i) => (
            <tr key={i} className="border-t border-[color:var(--border)]">
              {r.map((c, j) => (
                <td key={j} className="px-3 py-1.5 tabular-nums">
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length > 25 && (
        <div className="px-3 py-2 text-[10px] text-[color:var(--muted-foreground)] border-t border-[color:var(--border)]">
          Showing 25 of {rows.length} rows
        </div>
      )}
    </div>
  );
}

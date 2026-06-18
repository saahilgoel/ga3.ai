"use client";

import { useState } from "react";
import { ChevronRight, Code } from "lucide-react";

type ToolPart = {
  type: string;
  toolCallId?: string;
  state?: string;
  input?: unknown;
  output?: unknown;
  errorText?: string;
};

export function InlineToolCall({
  part,
  id,
  onOpen,
  active,
}: {
  part: ToolPart;
  id?: string;
  onOpen?: (id: string) => void;
  active?: boolean;
}) {
  const toolName = part.type.replace(/^tool-/, "");
  const running = part.state === "input-streaming" || part.state === "input-available";
  const [open, setOpen] = useState(false);

  const inputSummary = summarizeInput(part.input);

  return (
    <div
      className={`rounded-md bg-[color:var(--surface-elevated)] border text-[12px] overflow-hidden ${
        active ? "border-[color:var(--neon)]" : "border-[color:var(--border)]"
      }`}
    >
      <button
        type="button"
        onClick={() => {
          setOpen((v) => !v);
          if (id && onOpen) onOpen(id);
        }}
        className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-[color:var(--surface-hover)] tx-hover text-left"
      >
        <ChevronRight
          strokeWidth={1.5}
          className={`size-3 text-[color:var(--text-tertiary)] transition-transform duration-150 ${open ? "rotate-90" : ""}`}
        />
        <Code strokeWidth={1.5} className="size-3 text-[color:var(--text-tertiary)] shrink-0" />
        <span className="font-mono text-[12px] text-[color:var(--text-tertiary)] truncate">
          {running ? "Calling" : "Called"} {toolName}
        </span>
        {!running && inputSummary && (
          <span className="font-mono text-[11px] text-[color:var(--text-muted)] truncate ml-1">
            · {inputSummary}
          </span>
        )}
      </button>
      {open && (
        <div className="px-3 pb-2 pt-1 font-mono text-[11px] space-y-2 border-t border-[color:var(--border)] text-[color:var(--text-tertiary)] md:hidden">
          {part.input != null && (
            <div>
              <div className="text-[10px] uppercase tracking-[0.06em] opacity-50 mb-1">input</div>
              <pre className="whitespace-pre-wrap break-words leading-relaxed">
                {JSON.stringify(part.input, null, 2)}
              </pre>
            </div>
          )}
          {part.output != null && (
            <div>
              <div className="text-[10px] uppercase tracking-[0.06em] opacity-50 mb-1">output</div>
              <pre className="whitespace-pre-wrap break-words max-h-56 overflow-auto leading-relaxed">
                {JSON.stringify(part.output, null, 2)}
              </pre>
            </div>
          )}
          {part.errorText && (
            <div className="text-[color:var(--severity-high)]">error: {part.errorText}</div>
          )}
        </div>
      )}
    </div>
  );
}

function summarizeInput(input: unknown): string {
  if (input == null || typeof input !== "object") return "";
  try {
    const obj = input as Record<string, unknown>;
    const parts: string[] = [];
    if (typeof obj.query === "string") parts.push(`"${obj.query.slice(0, 60)}"`);
    if (Array.isArray(obj.dimensions) && obj.dimensions.length)
      parts.push(`dims: ${(obj.dimensions as string[]).join(", ")}`);
    if (Array.isArray(obj.metrics) && obj.metrics.length)
      parts.push(`metrics: ${(obj.metrics as string[]).slice(0, 3).join(", ")}${obj.metrics.length > 3 ? "…" : ""}`);
    if (typeof obj.startDate === "string" && typeof obj.endDate === "string") {
      parts.push(`${obj.startDate} → ${obj.endDate}`);
    }
    if (typeof obj.dimension === "string") parts.push(`dim: ${obj.dimension}`);
    if (typeof obj.metric === "string") parts.push(`metric: ${obj.metric}`);
    if (typeof obj.kind === "string") parts.push(`viz: ${obj.kind}`);
    if (Array.isArray(obj.source_filter) && obj.source_filter.length)
      parts.push(`sources: ${(obj.source_filter as string[]).join(",")}`);
    return parts.join(" · ");
  } catch {
    return "";
  }
}

"use client";

import { useMemo, useState } from "react";
import type { UIMessage } from "ai";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type ToolUse = {
  toolName: string;
  input: unknown;
  state?: string;
  index: number;
};

export function AgentContextRail({ messages }: { messages: UIMessage[] }) {
  const [open, setOpen] = useState(true);
  const tools = useMemo(() => collectToolUses(messages), [messages]);
  const recent = tools.slice(-5).reverse();

  return (
    <Card>
      <CardHeader className="cursor-pointer select-none" onClick={() => setOpen((v) => !v)}>
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm">Agent context</CardTitle>
          <span className="text-xs text-[color:var(--muted-foreground)]">
            {open ? "▾" : "▸"}
          </span>
        </div>
        <div className="text-xs text-[color:var(--muted-foreground)] mt-1">
          {tools.length === 0
            ? "No tool calls yet in this thread."
            : `Last ${recent.length} of ${tools.length} GA4 call${tools.length === 1 ? "" : "s"}`}
        </div>
      </CardHeader>
      {open && recent.length > 0 && (
        <CardContent className="space-y-2">
          {recent.map((t) => (
            <div
              key={t.index}
              className="rounded-md border border-[color:var(--border)] bg-[color:var(--background)] px-2.5 py-2"
            >
              <div className="text-[11px] font-mono opacity-80">{t.toolName}</div>
              <div className="text-[11px] mt-1 text-[color:var(--muted-foreground)] line-clamp-2">
                {summarizeInput(t.input)}
              </div>
            </div>
          ))}
        </CardContent>
      )}
    </Card>
  );
}

function collectToolUses(messages: UIMessage[]): ToolUse[] {
  const out: ToolUse[] = [];
  let i = 0;
  for (const m of messages) {
    if (m.role !== "assistant") continue;
    for (const part of m.parts || []) {
      const pt = part as { type?: string; toolCallId?: string; state?: string; input?: unknown };
      if (typeof pt.type === "string" && pt.type.startsWith("tool-")) {
        out.push({
          toolName: pt.type.replace(/^tool-/, ""),
          input: pt.input,
          state: pt.state,
          index: i++,
        });
      }
    }
  }
  return out;
}

function summarizeInput(input: unknown): string {
  if (input == null) return "(no input)";
  if (typeof input !== "object") return String(input);
  try {
    const obj = input as Record<string, unknown>;
    const parts: string[] = [];
    if (Array.isArray(obj.dimensions)) parts.push(`dims: ${(obj.dimensions as string[]).join(", ")}`);
    if (Array.isArray(obj.metrics)) parts.push(`metrics: ${(obj.metrics as string[]).join(", ")}`);
    if (typeof obj.startDate === "string" && typeof obj.endDate === "string") {
      parts.push(`${obj.startDate}→${obj.endDate}`);
    }
    if (typeof obj.dimension === "string") parts.push(`dim: ${obj.dimension}`);
    if (typeof obj.metric === "string") parts.push(`metric: ${obj.metric}`);
    if (typeof obj.kind === "string") parts.push(`viz: ${obj.kind}`);
    if (parts.length > 0) return parts.join(" · ");
    return JSON.stringify(input).slice(0, 120);
  } catch {
    return "(unparseable)";
  }
}

"use client";

import type { UIMessage } from "ai";
import { AGENT_MAP } from "@/lib/agents";
import { AGENT_HEX } from "@/lib/viz";
import { Monogram } from "@/components/monogram";
import { VisualizationRenderer } from "@/components/viz";
import type { Visualization } from "@/lib/viz";
import { MarkdownMessage } from "@/components/markdown-message";
import { InlineToolCall } from "@/components/inline-tool-call";
import { ContextCitations } from "@/components/context-citations";

export function ChatMessage({
  message,
  agentId,
  onToolOpen,
  readOnly,
}: {
  message: UIMessage;
  agentId?: string | null;
  onToolOpen?: (id: string) => void;
  // Share page / PDF: no agent-computer panel, so tool calls expand inline.
  readOnly?: boolean;
}) {
  const isUser = message.role === "user";
  const agent = agentId ? AGENT_MAP[agentId] : null;
  const accent = agent ? AGENT_HEX[agent.color] : null;

  if (isUser) {
    return (
      <div className="flex justify-end">
        <div
          className="max-w-[80%] rounded-lg px-3.5 py-2.5 text-[14px] leading-[1.6] whitespace-pre-wrap border"
          style={{
            background: "var(--surface-elevated)",
            color: "var(--text-primary)",
            borderColor: "var(--border)",
          }}
        >
          {message.parts?.map((part, i) => {
            if (part.type !== "text") return null;
            return <span key={i}>{part.text}</span>;
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-3">
      <div className="shrink-0 pt-1">
        {agent ? (
          <Monogram agent={agent} size={24} />
        ) : (
          <span
            className="size-6 rounded-full inline-flex items-center justify-center bg-[color:var(--surface-elevated)]"
            style={{ border: "1px solid var(--border-strong)" }}
          >
            <span className="font-mono text-[11px] text-[color:var(--text-secondary)]">·</span>
          </span>
        )}
      </div>
      <div className="flex-1 min-w-0 space-y-2.5">
        <div
          className="flex items-center gap-2 text-[12px]"
          style={
            agent
              ? { paddingLeft: 0, position: "relative" }
              : undefined
          }
        >
          {agent && (
            <span
              aria-hidden
              className="block h-3 w-[2px] rounded-full"
              style={{ background: accent ?? "transparent" }}
            />
          )}
          <span className="font-mono text-[14px] font-medium text-[color:var(--text-primary)]">
            {agent ? agent.name : "Moderator"}
          </span>
          {agent && (
            <span className="text-[color:var(--text-tertiary)] text-[12px]">
              · {agent.title}
            </span>
          )}
        </div>
        {message.parts?.map((part, i) => {
          if (part.type === "text") {
            return (
              <div key={i} className="text-[color:var(--text-primary)]">
                <MarkdownMessage content={part.text} />
              </div>
            );
          }
          if (part.type === "tool-render_visualization") {
            const tp = part as ToolPart;
            const viz = (tp.output ?? tp.input) as Visualization | undefined;
            if (!viz || !viz.kind)
              return (
                <InlineToolCall
                  key={i}
                  part={tp}
                  id={`${message.id}::${i}`}
                  onOpen={onToolOpen}
                  forceInline={readOnly}
                />
              );
            return (
              <div key={i} className="w-full max-w-[640px]">
                <VisualizationRenderer viz={viz} agentId={agentId} />
              </div>
            );
          }
          if (part.type === "tool-query_context") {
            return (
              <ContextCitations
                key={i}
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                part={part as any}
              />
            );
          }
          if (part.type?.startsWith("tool-")) {
            return (
              <InlineToolCall
                key={i}
                part={part as ToolPart}
                id={`${message.id}::${i}`}
                onOpen={onToolOpen}
                forceInline={readOnly}
              />
            );
          }
          return null;
        })}
      </div>
    </div>
  );
}

type ToolPart = {
  type: string;
  toolCallId?: string;
  state?: string;
  input?: unknown;
  output?: unknown;
  errorText?: string;
};

"use client";

import { AGENT_HEX } from "@/lib/viz";
import type { Agent } from "@/lib/agents";
import { PixelFace, FACES } from "@/components/landing/pixel-face";

type StatusLevel = "high" | "medium" | null | undefined;

export function Monogram({
  agent,
  size = 24,
  status,
  className = "",
}: {
  agent: Agent;
  size?: number;
  status?: StatusLevel;
  className?: string;
}) {
  const accent = AGENT_HEX[agent.color] ?? AGENT_HEX.default;
  const fontSize = size <= 24 ? 12 : 13;
  const dotSize = Math.max(4, Math.round(size * 0.18));
  const face = FACES[agent.id];

  return (
    <span
      className={`relative inline-flex items-center justify-center overflow-hidden ${
        face ? "rounded-md" : "rounded-full"
      } bg-[color:var(--bg)] ${className}`}
      style={{
        width: size,
        height: size,
        border: `1px solid ${face ? "var(--border-strong)" : accent}`,
      }}
    >
      {face ? (
        <PixelFace rows={face} size={Math.round(size * 0.82)} />
      ) : (
        <span
          className="font-mono font-semibold text-[color:var(--text-primary)] leading-none select-none"
          style={{ fontSize }}
        >
          {agent.monogram}
        </span>
      )}
      {status && (
        <span
          aria-hidden
          className="absolute"
          style={{
            width: dotSize,
            height: dotSize,
            right: -1,
            bottom: -1,
            borderRadius: 1,
            backgroundColor:
              status === "high"
                ? "var(--severity-high)"
                : "var(--severity-medium)",
            boxShadow: "0 0 0 1.5px var(--bg)",
          }}
        />
      )}
    </span>
  );
}

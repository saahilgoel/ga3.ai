"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { AGENTS } from "@/lib/agents";
import { AGENT_HEX } from "@/lib/viz";

export function BriefRunningPlaceholder({
  briefId,
  title,
}: {
  briefId: number;
  title: string;
}) {
  const router = useRouter();
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    const poll = setInterval(async () => {
      const res = await fetch(`/api/briefs/${briefId}`);
      if (!res.ok) return;
      const data = (await res.json()) as { status: string };
      if (data.status !== "running") router.refresh();
    }, 4000);
    return () => clearInterval(poll);
  }, [briefId, router]);

  return (
    <main className="min-h-screen flex items-center justify-center px-6">
      <div className="max-w-[480px] w-full space-y-5">
        <div className="font-mono text-[11px] uppercase tracking-[0.08em] text-[color:var(--text-tertiary)]">
          Running brief
        </div>
        <h1 className="font-serif text-[28px] font-medium tracking-[-0.015em] leading-tight">
          {title}
        </h1>
        <p className="text-[13px] text-[color:var(--text-secondary)] leading-relaxed">
          Five agents are pulling the data and synthesizing the report. This usually takes
          60–90 seconds.
        </p>
        <div className="flex items-center gap-2 pt-2">
          {AGENTS.map((a, i) => (
            <motion.span
              key={a.id}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.08 }}
              className="size-7 rounded-full inline-flex items-center justify-center bg-[color:var(--surface-elevated)]"
              style={{
                border: `1px solid ${AGENT_HEX[a.color]}`,
                animation: `monogramBreathe ${1.8 + i * 0.1}s ease-in-out infinite`,
              }}
            >
              <span className="font-mono font-medium text-[11px]">{a.monogram}</span>
            </motion.span>
          ))}
        </div>
        <div className="text-[11px] font-mono text-[color:var(--text-tertiary)] tabular-nums">
          {elapsed}s elapsed
        </div>
        <div className="h-[2px] w-full rounded overflow-hidden bg-[color:var(--surface-elevated)]">
          <div
            className="h-full"
            style={{
              background: "linear-gradient(90deg, transparent, var(--text-primary), transparent)",
              opacity: 0.4,
              width: "40%",
              animation: "scanStripe 1.5s linear infinite",
            }}
          />
        </div>
      </div>
    </main>
  );
}

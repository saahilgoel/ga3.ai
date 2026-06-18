"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { PixelFace, FACES } from "@/components/landing/pixel-face";

type AgentMini = {
  id: string;
  name: string;
  title: string;
  tagline: string;
  greeting: string;
  signatureMoves: string[];
};

type Finding = {
  id: number;
  agent_id: string;
  title: string;
  severity: string;
  status: string;
  created_at: number;
};

export function AgentsClient({ roster }: { roster: AgentMini[] }) {
  const router = useRouter();
  const [selected, setSelected] = useState(roster[0]?.id ?? "");
  const [findings, setFindings] = useState<Finding[]>([]);
  const [unread, setUnread] = useState<Record<string, number>>({});
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/findings", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (cancelled) return;
        setFindings(j.findings ?? []);
        setUnread(j.unread_by_agent ?? {});
        setLoaded(true);
      })
      .catch(() => !cancelled && setLoaded(true));
    return () => {
      cancelled = true;
    };
  }, []);

  const agent = roster.find((a) => a.id === selected) ?? roster[0];
  const agentFindings = useMemo(
    () => findings.filter((f) => f.agent_id === selected).slice(0, 8),
    [findings, selected]
  );

  function chat(agentId: string, q?: string) {
    const params = new URLSearchParams({ agent: agentId });
    if (q) params.set("ask", q);
    router.push(`/chat/new?${params.toString()}`);
  }

  if (!agent) return null;
  const face = FACES[agent.id];

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-[1200px] px-4 sm:px-6 lg:px-8 py-6 lg:py-8">
        <header className="mb-6">
          <div className="font-mono text-[11px] uppercase tracking-[0.12em] text-[color:var(--text-tertiary)]">
            Agents
          </div>
          <h1 className="font-mono text-[26px] font-semibold tracking-[-0.02em] mt-1">Your analyst crew</h1>
          <p className="text-[13px] text-[color:var(--text-secondary)] mt-1 max-w-xl">
            Six specialists watching your analytics around the clock. Pick one to see what it&rsquo;s tracking and what it&rsquo;s flagged.
          </p>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-5">
          {/* Roster */}
          <div className="grid grid-cols-2 lg:grid-cols-1 gap-2 content-start">
            {roster.map((a) => {
              const isSel = a.id === selected;
              const n = unread[a.id] ?? 0;
              const f = FACES[a.id];
              return (
                <button
                  key={a.id}
                  onClick={() => setSelected(a.id)}
                  className={`flex items-center gap-3 border p-2.5 text-left tx-hover ${
                    isSel
                      ? "border-[color:var(--neon)] bg-[color:var(--surface)]"
                      : "border-[color:var(--border)] hover:border-[color:var(--border-strong)]"
                  }`}
                >
                  <span className="shrink-0 grid place-items-center h-10 w-10 border border-[color:var(--border-strong)] bg-[color:var(--bg)]">
                    {f && <PixelFace rows={f} size={32} />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-mono text-[13px] truncate">{a.name}</span>
                    <span className="block font-mono text-[10px] uppercase tracking-[0.06em] text-[color:var(--text-tertiary)] truncate">
                      {a.title}
                    </span>
                  </span>
                  {n > 0 && (
                    <span
                      className="shrink-0 font-mono text-[10px] px-1.5 py-0.5 rounded-full tabular-nums"
                      style={{ background: "var(--neon)", color: "#fff" }}
                    >
                      {n}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Agent computer */}
          <div className="border border-[color:var(--border-strong)] bg-[color:var(--surface)]">
            <div className="flex items-center gap-3 px-4 h-10 border-b border-[color:var(--border)] font-mono text-[11px] text-[color:var(--text-tertiary)]">
              <div className="flex gap-1.5" aria-hidden>
                <span className="h-2 w-2 bg-[color:var(--border-strong)]" />
                <span className="h-2 w-2 bg-[color:var(--border-strong)]" />
                <span className="h-2 w-2 bg-[color:var(--border-strong)]" />
              </div>
              <span className="text-[color:var(--text-secondary)]">agent ▸ {agent.id}</span>
              <span className="ml-auto flex items-center gap-1.5">
                <span
                  className="h-1.5 w-1.5 rounded-full"
                  style={{ background: "var(--neon)", boxShadow: "0 0 6px var(--neon)" }}
                />
                watching
              </span>
            </div>

            <div className="p-5">
              <div className="flex items-center gap-4">
                <span className="shrink-0 grid place-items-center h-16 w-16 border border-[color:var(--border-strong)] bg-[color:var(--bg)]">
                  {face && <PixelFace rows={face} size={54} />}
                </span>
                <div className="min-w-0">
                  <div className="font-mono text-[20px] font-semibold tracking-[-0.01em]">{agent.name}</div>
                  <div className="font-mono text-[11px] uppercase tracking-[0.08em] text-[color:var(--text-tertiary)]">
                    {agent.title}
                  </div>
                  <div className="text-[13px] text-[color:var(--text-secondary)] mt-1 max-w-md">{agent.tagline}</div>
                </div>
              </div>

              <div className="mt-5 border-l-2 border-[color:var(--neon)] pl-3 font-mono text-[12.5px] text-[color:var(--text-secondary)] leading-relaxed max-w-2xl">
                {agent.greeting}
              </div>

              <div className="mt-6">
                <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-[color:var(--text-tertiary)] mb-2">
                  Monitoring
                </div>
                <div className="space-y-1.5">
                  {agent.signatureMoves.map((m) => (
                    <button
                      key={m}
                      onClick={() => chat(agent.id, m)}
                      className="flex w-full items-start gap-2 text-left font-mono text-[12.5px] text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)] tx-hover"
                    >
                      <span className="shrink-0 text-[color:var(--neon)]">&rsaquo;</span>
                      <span>{m}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="mt-6">
                <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-[color:var(--text-tertiary)] mb-2">
                  Recent activity
                </div>
                {!loaded ? (
                  <div className="space-y-2">
                    {[0, 1, 2].map((i) => (
                      <div key={i} className="h-10 skeleton rounded" />
                    ))}
                  </div>
                ) : agentFindings.length === 0 ? (
                  <div className="text-[12.5px] text-[color:var(--text-tertiary)] max-w-md">
                    Nothing flagged yet — {agent.name} is scanning your data. New findings show up here and in the Newsroom.
                  </div>
                ) : (
                  <div className="divide-y divide-[color:var(--border)] border-y border-[color:var(--border)]">
                    {agentFindings.map((f) => (
                      <button
                        key={f.id}
                        onClick={() => router.push("/feed")}
                        className="flex w-full items-center gap-3 px-1 py-2.5 text-left tx-hover hover:bg-[color:var(--surface-hover)]"
                      >
                        <span
                          className="h-1.5 w-1.5 rounded-full shrink-0"
                          style={{ background: sevColor(f.severity) }}
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block text-[13px] truncate">{f.title}</span>
                          <span className="block font-mono text-[10px] text-[color:var(--text-tertiary)]">
                            {timeAgo(f.created_at)}
                            {f.status === "new" ? " · new" : ""}
                          </span>
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="mt-6">
                <button
                  onClick={() => chat(agent.id)}
                  className="inline-flex items-center gap-2 h-11 px-5 bg-[color:var(--neon)] text-white neon-glow font-mono text-[13px] uppercase tracking-[0.06em] hover:bg-[color:var(--neon-bright)] active:scale-[0.98] transition"
                >
                  Chat with {agent.name} <span aria-hidden>&rarr;</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function sevColor(s: string): string {
  return s === "high"
    ? "var(--severity-high)"
    : s === "medium"
    ? "var(--severity-medium)"
    : "var(--text-tertiary)";
}

function timeAgo(ts: number): string {
  const s = Math.floor(Date.now() / 1000) - ts;
  if (s < 3600) return `${Math.max(1, Math.floor(s / 60))}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

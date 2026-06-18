import Link from "next/link";
import { AGENT_MAP } from "@/lib/agents";
import { AGENT_HEX } from "@/lib/viz";

export default function NotFound() {
  const raavi = AGENT_MAP.raavi;
  return (
    <main className="min-h-screen flex items-center justify-start px-12 bg-[color:var(--bg)]">
      <div className="max-w-[520px] space-y-3">
        <div className="text-[11px] uppercase tracking-[0.08em] text-[color:var(--text-tertiary)] font-mono">
          Five analysts in a trenchcoat
        </div>
        <h1 className="text-[28px] font-semibold tracking-[-0.02em] leading-[1.2]">
          This route doesn&apos;t exist.
        </h1>
        <div className="flex items-start gap-2.5 pt-1">
          <span
            className="size-6 rounded-full inline-flex items-center justify-center shrink-0 bg-[color:var(--surface-elevated)]"
            style={{ border: `1px solid ${AGENT_HEX[raavi.color]}` }}
          >
            <span className="font-mono font-semibold text-[12px]">{raavi.monogram}</span>
          </span>
          <p className="text-[13px] text-[color:var(--text-secondary)] leading-[1.6]">
            Raavi: <span className="text-[color:var(--text-primary)]">&quot;Of course this page doesn&apos;t exist. You expected it to?&quot;</span>
            <br />
            Either you typed something wrong, the link rotted, or someone shipped on a Friday after 5pm.
          </p>
        </div>
        <div className="flex gap-2 pt-3">
          <Link
            href="/feed"
            className="h-8 px-3 rounded-md border border-[color:var(--border-strong)] bg-[color:var(--surface-elevated)] hover:bg-[color:var(--surface-hover)] tx-hover text-[12px] font-medium inline-flex items-center"
          >
            ← Newsroom
          </Link>
          <Link
            href="/threads/all"
            className="h-8 px-3 rounded-md border border-[color:var(--border)] hover:bg-[color:var(--surface-hover)] tx-hover text-[12px] text-[color:var(--text-secondary)] inline-flex items-center"
          >
            All Agents
          </Link>
        </div>
      </div>
    </main>
  );
}

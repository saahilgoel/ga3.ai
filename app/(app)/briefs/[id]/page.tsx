import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getSession, readUserIds } from "@/lib/session";
import { getBriefById } from "@/lib/db";
import { BriefArtifact } from "@/components/brief-artifact";
import type { BriefOutput } from "@/lib/briefs/types";
import { BriefRunningPlaceholder } from "./running-placeholder";

export default async function BriefPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: idStr } = await params;
  const id = parseInt(idStr, 10);
  if (!id) notFound();
  const session = await getSession();
  const userIds = readUserIds(session);
  if (userIds.length === 0) redirect("/");
  const brief = getBriefById(id);
  if (!brief) notFound();
  if (!userIds.includes(brief.user_id)) notFound();

  if (brief.status === "running") {
    return <BriefRunningPlaceholder briefId={brief.id} title={brief.title} />;
  }
  if (brief.status === "failed" || !brief.output_json) {
    return (
      <main className="min-h-screen flex items-center justify-center px-6">
        <div className="max-w-[460px] text-center space-y-3">
          <div className="font-mono text-[11px] uppercase tracking-[0.08em] text-[color:var(--severity-high)]">
            Brief failed
          </div>
          <h1 className="font-serif text-[24px] font-medium tracking-tight">
            {brief.title}
          </h1>
          <p className="text-[13px] text-[color:var(--text-secondary)]">
            {brief.error_text || "Something went wrong while running this brief."}
          </p>
          <Link
            href="/briefs"
            className="inline-flex h-8 px-3 rounded-md border border-[color:var(--border)] hover:bg-[color:var(--surface-hover)] text-[12px] items-center"
          >
            ← Back to Briefs
          </Link>
        </div>
      </main>
    );
  }

  const output = JSON.parse(brief.output_json) as BriefOutput;
  return <BriefArtifact briefId={brief.id} output={output} />;
}

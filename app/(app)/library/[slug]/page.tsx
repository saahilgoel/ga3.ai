import { notFound, redirect } from "next/navigation";
import { getSession, readUserIds } from "@/lib/session";
import { ensureLibrarySeeded } from "@/lib/library/loader";
import { getBriefTemplate } from "@/lib/library/db";
import { listBriefsForTemplate } from "@/lib/db";
import { resolveActiveWorkspace } from "@/lib/workspace";
import { BriefDetailClient } from "./brief-detail-client";

export default async function BriefDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const session = await getSession();
  if (readUserIds(session).length === 0) redirect("/");
  try {
    ensureLibrarySeeded(false);
  } catch {
    // ignore
  }
  const { slug } = await params;
  const brief = getBriefTemplate(slug);
  if (!brief) notFound();

  const ws = resolveActiveWorkspace(session);
  const pastRuns = ws
    ? listBriefsForTemplate({
        workspace_id: ws.id,
        template_id: brief.id,
        limit: 20,
      }).map((r) => ({
        id: r.id,
        title: r.title,
        status: r.status,
        pinned: r.pinned === 1,
        created_at: r.created_at,
        completed_at: r.completed_at,
      }))
    : [];

  return (
    <div className="flex-1 overflow-y-auto">
      <BriefDetailClient brief={brief} pastRuns={pastRuns} />
    </div>
  );
}

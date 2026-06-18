import { notFound, redirect } from "next/navigation";
import { getSession, readUserIds } from "@/lib/session";
import { resolveActiveWorkspace } from "@/lib/workspace";
import { REPORTS_BY_PATH } from "@/lib/reports/registry";
import { ReportsNav } from "@/components/reports/reports-nav";
import { ReportRenderer } from "@/components/reports/report-renderer";

export default async function ReportPage({
  params,
}: {
  params: Promise<{ section: string; report: string }>;
}) {
  const session = await getSession();
  const userIds = readUserIds(session);
  if (userIds.length === 0) redirect("/");
  const ws = resolveActiveWorkspace(session);
  if (!ws) redirect("/properties");
  const { section, report } = await params;
  const def = REPORTS_BY_PATH[`${section}/${report}`];
  if (!def) notFound();
  // Pass only the path across the RSC boundary — the def contains functions
  // (investigatePrompt) which aren't serialisable. The client component
  // re-resolves the def from the registry.
  return (
    <div className="flex-1 flex overflow-hidden">
          <div className="hidden md:block">
            <ReportsNav />
          </div>
          <ReportRenderer section={section} slug={report} />
        </div>
        );
}

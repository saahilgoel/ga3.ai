import { redirect } from "next/navigation";
import { getSession, readUserIds } from "@/lib/session";
import { resolveActiveWorkspace, workspaceProperties } from "@/lib/workspace";
import { maybeAutoScan } from "@/lib/scan";
import { DashboardClient } from "./dashboard-client";

type SP = {
  range?: string;
  compare?: string;
  start?: string;
  end?: string;
};

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  const session = await getSession();
  const userIds = readUserIds(session);
  if (userIds.length === 0) redirect("/");
  const ws = resolveActiveWorkspace(session);
  if (!ws) redirect("/properties");
  // Lazy daily refresh of the newsroom (self-gated: only if context ready + >24h).
  maybeAutoScan(ws.id);
  const props = workspaceProperties(ws);
  const sp = await searchParams;
  return (
    <DashboardClient
      workspace={{
        id: ws.id,
        name: ws.name,
        property_count: props.length,
        websiteUrl: props.find((p) => p.website_url)?.website_url ?? null,
      }}
      initialRange={sp.range ?? "last_7_days"}
      initialCompare={sp.compare ?? "previous_period"}
      initialCustom={
        sp.start && sp.end ? { start: sp.start, end: sp.end } : null
      }
    />
  );
}

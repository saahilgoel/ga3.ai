import { redirect } from "next/navigation";
import { getSession, readUserIds } from "@/lib/session";
import { resolveActiveWorkspace, parseConnectedSources } from "@/lib/workspace";
import { MoEngageWizard } from "./wizard";

export default async function ConnectMoEngagePage({
  searchParams,
}: {
  searchParams: Promise<{ back?: string }>;
}) {
  const session = await getSession();
  const userIds = readUserIds(session);
  if (userIds.length === 0) redirect("/");
  const ws = resolveActiveWorkspace(session);
  if (!ws) redirect("/properties");
  const sp = await searchParams;
  const back = sp.back || "/dashboard";
  const attachedMoEngageIds = parseConnectedSources(ws)
    .filter((s) => s.type === "moengage")
    .map((s) => s.source_id);
  return (
    <div className="flex-1 overflow-y-auto">
          <div className="mx-auto w-full px-4 sm:px-6 lg:px-8 max-w-[760px] py-10">
            <MoEngageWizard
              workspaceId={ws.id}
              workspaceName={ws.name}
              attachedAppIds={attachedMoEngageIds}
              backUrl={back}
            />
          </div>
        </div>
        );
}

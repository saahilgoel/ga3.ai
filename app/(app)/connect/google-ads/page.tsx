import { redirect } from "next/navigation";
import { getSession, readUserIds } from "@/lib/session";
import { resolveActiveWorkspace, parseConnectedSources } from "@/lib/workspace";
import { ConnectAdsWizard } from "./wizard";

export default async function ConnectGoogleAdsPage({
  searchParams,
}: {
  searchParams: Promise<{ ads_grant?: string; back?: string }>;
}) {
  const session = await getSession();
  const userIds = readUserIds(session);
  if (userIds.length === 0) redirect("/");
  const ws = resolveActiveWorkspace(session);
  if (!ws) redirect("/properties");
  const sp = await searchParams;
  const back = sp.back || "/dashboard";
  const attachedAdsIds = parseConnectedSources(ws)
    .filter((s) => s.type === "google_ads")
    .map((s) => s.source_id);

  return (
    <div className="flex-1 overflow-y-auto">
          <div className="mx-auto w-full px-4 sm:px-6 lg:px-8 max-w-[720px] py-10">
            <ConnectAdsWizard
              workspaceId={ws.id}
              workspaceName={ws.name}
              attachedAdsCustomerIds={attachedAdsIds}
              backUrl={back}
              landingFromGrant={sp.ads_grant === "1"}
            />
          </div>
        </div>
        );
}

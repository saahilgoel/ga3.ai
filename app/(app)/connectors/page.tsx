import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import {
  resolveActiveWorkspace,
  parseConnectedSources,
} from "@/lib/workspace";
import { ConnectorsGrid } from "./connectors-grid";
import { isGoogleAdsConfigured } from "@/lib/sources/google_ads/api";
import { isMoEngageConfigured } from "@/lib/sources/moengage/api";

export default async function ConnectorsPage() {
  const session = await getSession();
  const ws = resolveActiveWorkspace(session);
  if (!ws) redirect("/properties");

  const sources = parseConnectedSources(ws);
  const ga4Count = sources.filter((s) => s.type === "ga4").length;
  const adsCount = sources.filter((s) => s.type === "google_ads").length;
  const moeCount = sources.filter((s) => s.type === "moengage").length;
  const adsConfigured = isGoogleAdsConfigured(ws.user_id);
  const moeConfigured = isMoEngageConfigured(ws.user_id);

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto w-full px-4 sm:px-6 lg:px-8 max-w-[1080px] py-6 lg:py-8">
        <ConnectorsGrid
          ga4Count={ga4Count}
          adsCount={adsCount}
          adsConfigured={adsConfigured}
          moeCount={moeCount}
          moeConfigured={moeConfigured}
        />
      </div>
    </div>
  );
}

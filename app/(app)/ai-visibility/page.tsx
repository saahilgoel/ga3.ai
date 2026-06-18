import { redirect } from "next/navigation";
import { getSession, readUserIds } from "@/lib/session";
import { resolveActiveWorkspace } from "@/lib/workspace";
import {
  listLatestRuns,
  latestRecommendations,
} from "@/lib/context/ai-visibility";
import { getContextStatus } from "@/lib/context/db-helpers";
import { listCompetitors } from "@/lib/context/competitors-db";
import { AiVisibilityClient } from "./ai-visibility-client";

export default async function AiVisibilityPage() {
  const session = await getSession();
  if (readUserIds(session).length === 0) redirect("/");
  const ws = resolveActiveWorkspace(session);
  if (!ws) redirect("/properties");
  const runs = listLatestRuns(ws.id);
  const ctx = getContextStatus(ws.id);
  const competitors = listCompetitors(ws.id);
  const recommendations = latestRecommendations(ws.id);
  return (
    <AiVisibilityClient
      initialRuns={runs}
      initialRecommendations={recommendations}
      ownBrand={ctx?.brand_name ?? ws.name}
      category={ctx?.industry_category ?? null}
      competitorNames={competitors.map((c) => c.brand_name)}
    />
  );
}

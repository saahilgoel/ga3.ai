import { redirect } from "next/navigation";
import { getSession, readUserIds } from "@/lib/session";
import { resolveActiveWorkspace } from "@/lib/workspace";
import { listCompetitors } from "@/lib/context/competitors-db";
import { CompetitorsClient } from "./competitors-client";

export default async function CompetitorsPage() {
  const session = await getSession();
  if (readUserIds(session).length === 0) redirect("/");
  const ws = resolveActiveWorkspace(session);
  if (!ws) redirect("/properties");
  const initial = listCompetitors(ws.id);
  return (
    <CompetitorsClient
      initial={initial}
      workspaceName={ws.name}
    />
  );
}

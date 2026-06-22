import { redirect } from "next/navigation";
import { getSession, readUserIds } from "@/lib/session";
import { resolveActiveWorkspace, workspaceProperties } from "@/lib/workspace";
import { maybeAutoScan } from "@/lib/scan";
import { FeedClient } from "./feed-client";

export default async function FeedPage() {
  const session = await getSession();
  const userIds = readUserIds(session);
  if (userIds.length === 0) redirect("/");

  const ws = resolveActiveWorkspace(session);
  if (!ws) redirect("/properties");

  // Lazy daily refresh: opening the newsroom fires a fresh scan only if context
  // is ready and the last scan is >24h old. Fire-and-forget; streams via SSE.
  maybeAutoScan(ws.id);

  const props = workspaceProperties(ws);
  return (
    <FeedClient
      workspace={{
        id: ws.id,
        name: ws.name,
        kind: ws.kind as "single" | "union",
        property_count: props.length,
      }}
      activePropertyNames={props.map((p) => p.display_name)}
    />
  );
}

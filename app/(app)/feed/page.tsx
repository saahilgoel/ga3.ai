import { redirect } from "next/navigation";
import { getSession, readUserIds } from "@/lib/session";
import { resolveActiveWorkspace, workspaceProperties } from "@/lib/workspace";
import { FeedClient } from "./feed-client";

export default async function FeedPage() {
  const session = await getSession();
  const userIds = readUserIds(session);
  if (userIds.length === 0) redirect("/");

  const ws = resolveActiveWorkspace(session);
  if (!ws) redirect("/properties");

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

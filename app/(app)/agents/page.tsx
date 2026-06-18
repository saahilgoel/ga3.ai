import { redirect } from "next/navigation";
import { getSession, readUserIds } from "@/lib/session";
import { AGENTS } from "@/lib/agents";
import { AgentsClient } from "./agents-client";

export default async function AgentsPage() {
  const session = await getSession();
  if (readUserIds(session).length === 0) redirect("/");
  // Trim to a serializable roster (no system prompts shipped to the client).
  const roster = AGENTS.map((a) => ({
    id: a.id,
    name: a.name,
    title: a.title,
    tagline: a.tagline,
    greeting: a.greeting,
    signatureMoves: a.signatureMoves,
  }));
  return <AgentsClient roster={roster} />;
}

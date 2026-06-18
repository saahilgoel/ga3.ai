import { redirect } from "next/navigation";

export default async function LegacyThreadRedirect({
  params,
  searchParams,
}: {
  params: Promise<{ agent_id: string }>;
  searchParams?: Promise<{ ask?: string }>;
}) {
  const { agent_id } = await params;
  const sp = await searchParams;
  const q = sp?.ask ? `&ask=${encodeURIComponent(sp.ask)}` : "";
  redirect(`/chat/new?agent=${encodeURIComponent(agent_id)}${q}`);
}

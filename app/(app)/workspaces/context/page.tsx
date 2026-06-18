import { redirect } from "next/navigation";
import { getSession, readUserIds } from "@/lib/session";
import { resolveActiveWorkspace } from "@/lib/workspace";
import {
  getContextStatus,
  listUserUploads,
  summarizeContextBySource,
} from "@/lib/context/db-helpers";
import { ContextClient } from "./context-client";

export default async function ContextSettingsPage() {
  const session = await getSession();
  const userIds = readUserIds(session);
  if (userIds.length === 0) redirect("/");
  const ws = resolveActiveWorkspace(session);
  if (!ws) redirect("/properties");

  const status = getContextStatus(ws.id);
  const sources = summarizeContextBySource(ws.id);
  const uploads = listUserUploads(ws.id);

  return (
    <div className="flex-1 overflow-y-auto">
          <div className="mx-auto w-full px-4 sm:px-6 lg:px-8 max-w-full lg:max-w-[900px] py-6 lg:py-8">
            <ContextClient
              workspaceName={ws.name}
              initialStatus={status ?? null}
              initialSources={sources}
              initialUploads={uploads}
            />
          </div>
        </div>
        );
}

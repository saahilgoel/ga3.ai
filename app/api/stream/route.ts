// Server-Sent Events endpoint. One persistent connection per browser tab.
// We push state-change events (new findings, realtime updates, etc.) so
// clients don't poll.
//
// Notes:
//   - Heartbeat every 15s keeps proxies from closing the connection.
//   - Client (EventSource) auto-reconnects on drop.
//   - We send an initial `ping` so the client knows the stream is live.

import { NextRequest } from "next/server";
import { getSession, readPrimaryUserId, readUserIds } from "@/lib/session";
import { publish, subscribe, type StreamEvent } from "@/lib/pubsub";
import { resolveActiveWorkspace } from "@/lib/workspace";
import { addWatcher, removeWatcher } from "@/lib/realtime-ticker";

export const runtime = "nodejs";
// Force per-request execution — Next mustn't try to cache an SSE response.
export const dynamic = "force-dynamic";

const HEARTBEAT_MS = 15_000;

export async function GET(req: NextRequest) {
  const session = await getSession();
  const userId = readPrimaryUserId(session);
  if (!userId || readUserIds(session).length === 0) {
    return new Response("not_authenticated", { status: 401 });
  }
  // Realtime ticker — if a workspace is active, ref-count its ticker so
  // we only poll GA4 when at least one tab is watching.
  const activeWs = resolveActiveWorkspace(session);
  const watchedWorkspaceId = activeWs?.id ?? null;

  const encoder = new TextEncoder();
  let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  let unsubscribe: (() => void) | null = null;
  let closed = false;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      function send(ev: StreamEvent | { kind: "ready" }) {
        if (closed) return;
        try {
          controller.enqueue(
            encoder.encode(`event: ${ev.kind}\ndata: ${JSON.stringify(ev)}\n\n`)
          );
        } catch {
          // controller closed underfoot
          cleanup();
        }
      }

      function cleanup() {
        if (closed) return;
        closed = true;
        if (heartbeatTimer) clearInterval(heartbeatTimer);
        if (unsubscribe) unsubscribe();
        if (watchedWorkspaceId != null) removeWatcher(watchedWorkspaceId);
        try {
          controller.close();
        } catch {
          // already closed
        }
      }

      // Hello — tells the client the stream is established.
      send({ kind: "ready" } as { kind: "ready" });

      // Wire pubsub events to this connection.
      unsubscribe = subscribe(userId!, (ev) => send(ev));

      // Start the realtime ticker for the workspace (idempotent ref count).
      if (watchedWorkspaceId != null) addWatcher(watchedWorkspaceId);

      // Heartbeat so intermediaries don't drop us.
      heartbeatTimer = setInterval(() => {
        if (closed) return;
        try {
          // SSE comment line — invisible to listeners but resets idle timers.
          controller.enqueue(encoder.encode(`: ping ${Date.now()}\n\n`));
        } catch {
          cleanup();
        }
      }, HEARTBEAT_MS);

      // The browser closing the tab triggers this.
      req.signal.addEventListener("abort", cleanup);
    },
    cancel() {
      if (heartbeatTimer) clearInterval(heartbeatTimer);
      if (unsubscribe) unsubscribe();
      if (watchedWorkspaceId != null) removeWatcher(watchedWorkspaceId);
      closed = true;
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no", // disables nginx buffering if behind one
    },
  });
}

// Reuse `publish` so unused-export warnings don't fire if the route file is
// imported elsewhere.
void publish;

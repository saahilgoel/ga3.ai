// In-process pub/sub for the Node server. Powers SSE so multiple tabs share
// one upstream — when scan/brief/mutation work completes we publish once,
// every connected client gets a delta within a render frame.
//
// Channels are keyed by user_id; events also carry a kind so consumers can
// filter. The dev process is single-instance so a module-level EventEmitter
// is all we need.

import { EventEmitter } from "node:events";

export type StreamEvent =
  | { kind: "finding.new"; workspace_id: number; finding_id: number; agent_id: string }
  | { kind: "findings.changed"; workspace_id: number; unread_delta: number }
  | { kind: "conversation.changed"; conversation_id: number; workspace_id: number }
  | { kind: "brief.completed"; brief_id: number; workspace_id: number }
  | { kind: "scan.completed"; workspace_id: number; new_findings: number }
  | {
      kind: "scan.progress";
      workspace_id: number;
      phase: string;
      pct: number;
      agent_id?: string;
    }
  | {
      kind: "context.progress";
      workspace_id: number;
      step: string;
      pct: number;
      status: string;
      doc_count?: number;
      chunk_count?: number;
    }
  | {
      kind: "competitor.progress";
      workspace_id: number;
      competitor_id: number;
      brand_name: string;
      step: string;
      pct: number;
      status: string;
    }
  | {
      kind: "industry.progress";
      workspace_id: number;
      step: string;
      pct: number;
      status: string;
    }
  | {
      kind: "realtime.update";
      workspace_id: number;
      active_users: number;
      hourly_avg: number;
    }
  | { kind: "ping"; t: number };

// One emitter for everyone; subscribers filter by user_id themselves.
// EventEmitter is fine for our scale (hundreds of concurrent SSE clients);
// if we ever hit thousands, swap for a more efficient bus.
const bus = new EventEmitter();
// Generous cap — each SSE connection adds 1 listener.
bus.setMaxListeners(500);

const EVENT = "stream";

/** Publish an event for one user. Returns the number of listeners reached. */
export function publish(userId: number, ev: StreamEvent): number {
  bus.emit(EVENT, userId, ev);
  return bus.listenerCount(EVENT);
}

/** Publish an event for many users (e.g. a scan that affects multiple owners). */
export function publishMany(userIds: number[], ev: StreamEvent): void {
  for (const u of userIds) publish(u, ev);
}

/** Subscribe; returns an unsubscribe function. */
export function subscribe(
  userId: number,
  handler: (ev: StreamEvent) => void
): () => void {
  const listener = (uid: number, ev: StreamEvent) => {
    if (uid === userId) handler(ev);
  };
  bus.on(EVENT, listener);
  return () => bus.off(EVENT, listener);
}

/** For diagnostics / tests. */
export function activeSubscribers(): number {
  return bus.listenerCount(EVENT);
}

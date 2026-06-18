// One EventSource per tab, multicast to subscribers.
// Multiple components on the same page get the same stream — no duplicate
// connections. Auto-reconnects on drop with backoff.

"use client";

import { useEffect } from "react";

export type StreamEvent =
  | { kind: "ready" }
  | { kind: "ping"; t: number }
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
    };

type Listener = (ev: StreamEvent) => void;

const listeners = new Set<Listener>();
let es: EventSource | null = null;
let connectAttempt = 0;
let lastConnectMs = 0;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

const KINDS = [
  "ready",
  "ping",
  "finding.new",
  "findings.changed",
  "conversation.changed",
  "brief.completed",
  "scan.completed",
  "scan.progress",
  "context.progress",
  "competitor.progress",
  "industry.progress",
  "realtime.update",
] as const;

function dispatch(ev: StreamEvent) {
  for (const l of listeners) {
    try {
      l(ev);
    } catch (err) {
      console.warn("[stream] listener threw:", (err as Error).message);
    }
  }
}

function connect() {
  if (typeof window === "undefined") return;
  if (es) return;
  lastConnectMs = Date.now();
  connectAttempt += 1;
  try {
    es = new EventSource("/api/stream");
  } catch (err) {
    console.warn("[stream] could not open EventSource:", (err as Error).message);
    scheduleReconnect();
    return;
  }
  for (const kind of KINDS) {
    es.addEventListener(kind, (e) => {
      try {
        const data = JSON.parse((e as MessageEvent).data) as StreamEvent;
        dispatch(data);
      } catch {
        // ignore malformed
      }
    });
  }
  es.onerror = () => {
    // Browser will retry automatically on transient drops, but Next dev
    // sometimes leaves zombie connections. Close + manual reconnect with
    // a small backoff to be safe.
    es?.close();
    es = null;
    scheduleReconnect();
  };
  es.onopen = () => {
    connectAttempt = 0;
  };
}

function scheduleReconnect() {
  if (reconnectTimer || listeners.size === 0) return;
  // Backoff: 0.5s, 1s, 2s, 4s, max 10s
  const delay = Math.min(10_000, 500 * Math.pow(2, Math.min(connectAttempt, 5)));
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    if (listeners.size > 0) connect();
  }, delay);
}

function teardown() {
  if (es) {
    es.close();
    es = null;
  }
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
}

/** Hook: subscribe to the shared event stream while mounted. */
export function useEventStream(handler: Listener): void {
  useEffect(() => {
    listeners.add(handler);
    if (!es) connect();
    return () => {
      listeners.delete(handler);
      // Last subscriber out the door — close the connection. We let the
      // browser fully reopen when a new component mounts; cheaper than
      // keeping a zombie EventSource around between routes that don't
      // need real-time.
      if (listeners.size === 0) teardown();
    };
  }, [handler]);
}

/** Imperative dispatch helper — useful in tests or for forced re-sync. */
export function pokeStream(ev: StreamEvent): void {
  dispatch(ev);
}

// Voiding lastConnectMs reference for linter friendliness.
void lastConnectMs;

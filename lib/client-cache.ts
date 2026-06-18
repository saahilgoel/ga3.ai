// Tiny client-side fetch memoizer.
//
// Two reasons it exists:
//   1) The Sidebar and TopBar re-mount on every navigation in the App
//      Router. Without this, /api/me, /api/workspaces, /api/findings, and
//      /api/conversations fire on every page change — 4 round-trips per nav.
//   2) Multiple components on the same page may want the same data.
//
// Usage:
//   const data = await cachedJSON<MeResponse>("/api/me");
//   // → first call: fetches; subsequent calls within TTL: served from memory.
//
// Inflight requests are deduped so a burst of mounts only fires one network call.

type Entry<T> = {
  at: number;
  data: T;
};

const TTL_MS = 15_000; // matches Cache-Control max-age on the server.
const MAX_ENTRIES = 32;

const cache = new Map<string, Entry<unknown>>();
const inflight = new Map<string, Promise<unknown>>();

function isFresh<T>(e: Entry<T> | undefined): boolean {
  return !!e && Date.now() - e.at < TTL_MS;
}

function evictIfFull() {
  if (cache.size <= MAX_ENTRIES) return;
  const firstKey = cache.keys().next().value;
  if (firstKey !== undefined) cache.delete(firstKey);
}

export async function cachedJSON<T>(
  url: string,
  opts: { ttlMs?: number; force?: boolean } = {}
): Promise<T> {
  const ttl = opts.ttlMs ?? TTL_MS;
  const existing = cache.get(url) as Entry<T> | undefined;
  if (!opts.force && existing && Date.now() - existing.at < ttl) {
    return existing.data;
  }
  const ongoing = inflight.get(url) as Promise<T> | undefined;
  if (ongoing && !opts.force) return ongoing;

  const p = (async () => {
    try {
      const res = await fetch(url, { credentials: "same-origin" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as T;
      cache.delete(url); // refresh insertion order
      cache.set(url, { at: Date.now(), data });
      evictIfFull();
      return data;
    } finally {
      inflight.delete(url);
    }
  })();

  inflight.set(url, p);
  return p;
}

// Imperatively invalidate (call after a mutation that affects this URL).
export function invalidate(url: string) {
  cache.delete(url);
}

export function invalidatePrefix(prefix: string) {
  for (const k of [...cache.keys()]) {
    if (k.startsWith(prefix)) cache.delete(k);
  }
}

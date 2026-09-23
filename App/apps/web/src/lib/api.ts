export const API_URL =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") ?? "";

export type SessionInfo = {
  sessionId: string;
  actor: {
    actorId: string;
    actorType: string;
    displayName: string;
    capacity: string;
  };
};

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly invariantId?: string,
    readonly intervention?: string,
  ) {
    super(message);
  }
}

export async function api<T>(
  path: string,
  opts: RequestInit & { sessionId?: string } = {},
): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(opts.headers as Record<string, string>),
  };
  if (opts.sessionId) headers["x-session-id"] = opts.sessionId;
  const res = await fetch(`${API_URL}${path}`, { ...opts, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const head = data.invariantId ? `[${data.invariantId}${data.intervention ? ` · ${data.intervention}` : ""}] ` : "";
    const parts = [data.error ?? res.statusText, data.hint].filter(Boolean).map(String);
    throw new ApiError(head + parts.join(" — "), res.status, data.invariantId, data.intervention);
  }
  return data as T;
}

const CACHE_PREFIX = "ankuaru_cache:";
const MAX_CACHE_ENTRY = 750_000;

/** Cache is per actor so switching roles never shows another actor's data. */
function cacheScope(sessionId?: string): string {
  if (!sessionId) return "anon";
  try {
    const s = JSON.parse(localStorage.getItem("ankuaru_session") ?? "null") as SessionInfo | null;
    if (s?.sessionId === sessionId) return s.actor.actorId;
  } catch {
    /* fall through */
  }
  return sessionId;
}

export function readCache<T>(path: string, sessionId?: string): T | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    const raw = localStorage.getItem(`${CACHE_PREFIX}${cacheScope(sessionId)}:${path}`);
    return raw ? (JSON.parse(raw) as T) : undefined;
  } catch {
    return undefined;
  }
}

function writeCache(path: string, sessionId: string | undefined, text: string) {
  if (text.length > MAX_CACHE_ENTRY) return;
  const key = `${CACHE_PREFIX}${cacheScope(sessionId)}:${path}`;
  try {
    localStorage.setItem(key, text);
  } catch {
    // Quota exceeded: drop all cached reads (never the offline queue) and retry once
    for (const k of Object.keys(localStorage)) if (k.startsWith(CACHE_PREFIX)) localStorage.removeItem(k);
    try {
      localStorage.setItem(key, text);
    } catch {
      /* give up silently; cache is an optimisation */
    }
  }
}

let inflight = 0;
function setSyncing(delta: number) {
  inflight = Math.max(0, inflight + delta);
  window.dispatchEvent(new CustomEvent("ankuaru-syncing", { detail: inflight }));
}

/**
 * Stale-while-revalidate GET: calls `onData` immediately with the cached copy (if any),
 * then again with the server copy only when it differs. Resolves with the fresh data.
 * If the request fails but a cached copy was shown, the error is swallowed so the
 * page keeps working from cache.
 */
export async function cachedApi<T>(
  path: string,
  sessionId: string | undefined,
  onData: (data: T, fromCache: boolean) => void,
): Promise<T | undefined> {
  const cached = readCache<T>(path, sessionId);
  const cachedText = cached === undefined ? undefined : JSON.stringify(cached);
  if (cached !== undefined) onData(cached, true);
  setSyncing(1);
  try {
    const fresh = await api<T>(path, { sessionId });
    const text = JSON.stringify(fresh);
    if (text !== cachedText) {
      writeCache(path, sessionId, text);
      onData(fresh, false);
    }
    return fresh;
  } catch (e) {
    if (cached !== undefined) return cached;
    throw e;
  } finally {
    setSyncing(-1);
  }
}

export type QueuedCommand = {
  clientEventId: string;
  path: string;
  body: unknown;
  sessionId: string;
  eventTimeActual: string;
  assistedFor?: string;
  label: string;
};

const QUEUE_KEY = "ankuaru_offline_queue";

export function readQueue(): QueuedCommand[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(QUEUE_KEY) ?? "[]") as QueuedCommand[];
  } catch {
    return [];
  }
}

function writeQueue(q: QueuedCommand[]) {
  localStorage.setItem(QUEUE_KEY, JSON.stringify(q));
  window.dispatchEvent(new Event("ankuaru-queue"));
}

/**
 * Module 13: every command carries a client event id so a retry or offline replay
 * is idempotent. When the network is down the command is queued with the capture
 * time and replayed later as mobile_offline_sync.
 */
export async function command<T = unknown>(
  path: string,
  body: unknown,
  opts: { sessionId: string; assistedFor?: string; label?: string },
): Promise<{ queued: boolean; result?: T }> {
  const clientEventId = crypto.randomUUID();
  const eventTimeActual = new Date().toISOString();
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    writeQueue([
      ...readQueue(),
      { clientEventId, path, body, sessionId: opts.sessionId, eventTimeActual, assistedFor: opts.assistedFor, label: opts.label ?? path },
    ]);
    return { queued: true };
  }
  const headers: Record<string, string> = { "x-client-event-id": clientEventId };
  if (opts.assistedFor) headers["x-assisted-for-actor"] = opts.assistedFor;
  try {
    const r = await api<{ result?: T }>(path, {
      method: "POST",
      sessionId: opts.sessionId,
      body: JSON.stringify(body),
      headers,
    });
    return { queued: false, result: r.result };
  } catch (e) {
    if (e instanceof TypeError) {
      writeQueue([
        ...readQueue(),
        { clientEventId, path, body, sessionId: opts.sessionId, eventTimeActual, assistedFor: opts.assistedFor, label: opts.label ?? path },
      ]);
      return { queued: true };
    }
    throw e;
  }
}

/** Replays queued commands in capture order; rejected items stay visible with their error. */
export async function flushQueue(): Promise<{ synced: number; failed: Array<{ item: QueuedCommand; error: string }> }> {
  const q = readQueue();
  const remaining: QueuedCommand[] = [];
  const failed: Array<{ item: QueuedCommand; error: string }> = [];
  let synced = 0;
  for (const item of q) {
    const headers: Record<string, string> = {
      "x-client-event-id": item.clientEventId,
      "x-event-time-actual": item.eventTimeActual,
      "x-source-channel": "mobile_offline_sync",
    };
    if (item.assistedFor) headers["x-assisted-for-actor"] = item.assistedFor;
    try {
      await api(item.path, { method: "POST", sessionId: item.sessionId, body: JSON.stringify(item.body), headers });
      synced++;
    } catch (e) {
      if (e instanceof TypeError) {
        remaining.push(item);
      } else {
        failed.push({ item, error: e instanceof Error ? e.message : String(e) });
      }
    }
  }
  writeQueue(remaining);
  return { synced, failed };
}

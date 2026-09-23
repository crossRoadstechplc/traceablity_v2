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
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error ?? data.invariantId ?? res.statusText);
  }
  return data as T;
}

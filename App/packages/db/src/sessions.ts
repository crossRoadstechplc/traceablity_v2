/**
 * Persist / load simulator sessions so bind survives cold starts.
 */
import type { CapacityCode } from "@ankuaru/schema";
import type { Session } from "@ankuaru/engine";
import { prisma } from "./client.js";
import { isDatabaseConfigured } from "./flush.js";

export type StoredSession = Session & { displayName?: string; sessionId: string };

export async function upsertSimulatorSession(
  sessionId: string,
  session: Session & { displayName?: string },
): Promise<void> {
  if (!isDatabaseConfigured()) return;
  try {
    await prisma.simulatorSession.upsert({
      where: { sessionId },
      create: {
        sessionId,
        userId: session.userId,
        actorId: session.actorId,
        capacity: session.capacity,
        displayName: session.displayName ?? null,
      },
      update: {
        userId: session.userId,
        actorId: session.actorId,
        capacity: session.capacity,
        displayName: session.displayName ?? null,
      },
    });
  } catch (e) {
    console.warn("[db] upsertSimulatorSession failed:", (e as Error).message);
  }
}

export async function getSimulatorSession(
  sessionId: string,
): Promise<(Session & { displayName?: string }) | null> {
  if (!isDatabaseConfigured() || !sessionId) return null;
  try {
    const row = await prisma.simulatorSession.findUnique({ where: { sessionId } });
    if (!row) return null;
    return {
      userId: row.userId,
      actorId: row.actorId,
      capacity: row.capacity as CapacityCode,
      sourceChannel: "web",
      displayName: row.displayName ?? undefined,
    };
  } catch {
    return null;
  }
}

export async function loadAllSimulatorSessions(): Promise<
  Map<string, Session & { displayName?: string }>
> {
  const map = new Map<string, Session & { displayName?: string }>();
  if (!isDatabaseConfigured()) return map;
  try {
    const rows = await prisma.simulatorSession.findMany();
    for (const row of rows) {
      map.set(row.sessionId, {
        userId: row.userId,
        actorId: row.actorId,
        capacity: row.capacity as CapacityCode,
        sourceChannel: "web",
        displayName: row.displayName ?? undefined,
      });
    }
  } catch {
    /* ignore */
  }
  return map;
}

export async function clearSimulatorSessions(): Promise<void> {
  if (!isDatabaseConfigured()) return;
  try {
    await prisma.simulatorSession.deleteMany();
  } catch {
    /* ignore */
  }
}

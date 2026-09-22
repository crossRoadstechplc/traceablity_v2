/**
 * Persist engine events + integrity checkpoints to Prisma/Supabase.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export type PersistableEvent = {
  eventId: string;
  eventType: string;
  schemaVersion: string;
  actorId?: string;
  actingCapacity?: string;
  userId?: string;
  deviceId?: string;
  affectedObjectIds: string[];
  eventTimeActual: string;
  eventTimeRecorded: string;
  serverCommitTime: string;
  sourceChannel: string;
  retrospectiveFlag: boolean;
  payload: Record<string, unknown>;
  integrityHash: string;
  correctsEventId?: string;
  sequence: number;
};

export async function persistEvents(events: PersistableEvent[]): Promise<number> {
  let written = 0;
  for (const e of events) {
    try {
      await prisma.event.create({
        data: {
          eventId: e.eventId,
          eventType: e.eventType,
          schemaVersion: e.schemaVersion,
          actorId: e.actorId,
          actingCapacity: e.actingCapacity,
          userId: e.userId,
          deviceId: e.deviceId,
          affectedObjectIds: e.affectedObjectIds,
          eventTimeActual: new Date(e.eventTimeActual),
          eventTimeRecorded: new Date(e.eventTimeRecorded),
          serverCommitTime: new Date(e.serverCommitTime),
          sourceChannel: e.sourceChannel as
            | "web"
            | "api"
            | "mobile_online"
            | "mobile_offline_sync"
            | "retrospective",
          retrospectiveFlag: e.retrospectiveFlag,
          payload: e.payload,
          integrityHash: e.integrityHash,
          correctsEventId: e.correctsEventId,
        },
      });
      await prisma.checkpoint.create({
        data: {
          sequence: BigInt(e.sequence),
          eventId: e.eventId,
          chainHash: e.integrityHash,
        },
      });
      written++;
    } catch {
      // idempotent skip
    }
  }
  return written;
}

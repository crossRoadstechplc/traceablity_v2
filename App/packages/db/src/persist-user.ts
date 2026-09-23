/**
 * Light persistence for bind (avoid full-world flush).
 */
import type { UserRecord } from "@ankuaru/engine";
import { prisma } from "./client.js";
import { isDatabaseConfigured } from "./flush.js";
import { ensurePrismaEnginePath } from "./engine-path.js";

export async function upsertUserWithMembership(user: UserRecord): Promise<void> {
  if (!isDatabaseConfigured()) return;
  ensurePrismaEnginePath();
  try {
    await prisma.user.upsert({
      where: { id: user.userId },
      create: {
        id: user.userId,
        displayName: user.displayName,
        email: user.email ?? null,
        status: user.status,
      },
      update: {
        displayName: user.displayName,
        email: user.email ?? null,
        status: user.status,
      },
    });
    for (const actorId of user.actorIds) {
      await prisma.actorMembership.upsert({
        where: {
          userId_actorId: { userId: user.userId, actorId },
        },
        create: {
          userId: user.userId,
          actorId,
          isPrimary: true,
        },
        update: {},
      });
    }
  } catch (e) {
    console.warn("[db] upsertUserWithMembership failed:", (e as Error).message);
  }
}

/**
 * Offline mobile channel stub (Module 13).
 * Full Expo app is deferred; this documents the client contract:
 * - Generate event_id client-side (UUID)
 * - Persist locally before network
 * - Set event_time_actual at capture; server_commit_time at sync
 * - source_channel: mobile_offline_sync
 * - Assisted entry: user_id (enterer) ≠ actor_id (on whose behalf)
 */
export type OfflineQueuedEvent = {
  event_id: string;
  event_type: string;
  event_time_actual: string;
  event_time_recorded: string;
  source_channel: "mobile_offline_sync";
  actor_id: string;
  user_id: string;
  acting_capacity: string;
  payload: Record<string, unknown>;
};

export function assertDualAttribution(entererUserId: string, actingActorId: string): void {
  if (!entererUserId || !actingActorId) {
    throw new Error("Assisted entry requires both enterer user and acting actor");
  }
}

import { createAfcJoinDropState, type AfcJoinDropFxEntry } from "../client-afc-join-drop/client-afc-join-drop-state.js";

/**
 * Cosmetic "a Module lands on your AFC" delivery animation state — see
 * client-afc-module-delivery/client-afc-module-delivery-detect.ts and
 * docs/manifest-afc-module-delivery-animation-plan.md. Extracted out of
 * client-state.ts (already over the file-line cap) so new fields don't grow
 * that file.
 *
 * afcModuleDeliveryFxQueue is drained by the true-3D renderer's
 * syncAfcModuleDeliveryFxQueue. afcModuleDeliveryLandedAt (tile key ->
 * performance.now() of the landing) is read by the 2D renderer's AFC pulse,
 * which can't share the queue because the 3D drain empties it. Entries are
 * pruned on every write (client-afc-module-delivery-detect.ts), so the map
 * never holds more than the AFCs that received a delivery in the last pulse
 * window.
 */
export const createInitialAfcDeliveryState = () => ({
  afcModuleDeliveryFxQueue: [] as Array<{ x: number; y: number; techId: string; queuedAt: number }>,
  afcModuleDeliveryLandedAt: new Map<string, number>(),
  // Join-time whole-AFC drop (client-afc-join-drop/). The FX queue holds at
  // most the one drop start, drained by the 3D renderer; the 2D renderer
  // reads afcJoinDrop directly, so both stay in step with one timeline.
  afcJoinDrop: createAfcJoinDropState(),
  afcJoinDropFxQueue: [] as AfcJoinDropFxEntry[]
});

import type { LockRecord } from "../runtime-types.js";

// Distance threshold beyond which ADVANCE/MARCH search slows to a reduced cadence.
export const ADVANCE_THROTTLE_DIST = 15;
// How long to wait before re-searching when the front is far away (ms).
export const ADVANCE_FAR_COOLDOWN_MS = 3_000;
// How long to wait before re-searching when nothing attackable was found at all (ms).
export const ADVANCE_EMPTY_COOLDOWN_MS = 10_000;

export type MusterAdvanceCooldowns = Map<string, number>; // musterTileKey -> nextSearchAt (ms)

/**
 * Returns the active lock currently funded from `musterTileKey` (attacks
 * record the flag that paid for them on LockRecord.musterSourceKey), or
 * undefined when the flag has no attack in flight. Every lock in the map is
 * scanned rather than a single lookup because a lock is stored under its
 * origin and target tile keys — the muster flag tile isn't necessarily either.
 */
export const lockSourcedFromMusterTile = (
  locksByTile: ReadonlyMap<string, LockRecord>,
  musterTileKey: string
): LockRecord | undefined => {
  for (const lock of locksByTile.values()) {
    if (lock.musterSourceKey === musterTileKey) return lock;
  }
  return undefined;
};

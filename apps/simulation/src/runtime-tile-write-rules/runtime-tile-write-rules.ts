// Per-write tile bookkeeping applied by Runtime.replaceTileState, split out
// of runtime.ts (over the 500-line cap) so each rule is unit-testable.
import type { DomainTileState } from "@border-empires/game-domain";
import { isCaptureHoldActive } from "@border-empires/shared";

/**
 * Drops a capture hold (shared capture-hold.ts) that no longer applies, so
 * the field never lingers on a tile forever: once it has expired, once the
 * tile is no longer FRONTIER (garrisoned, neutralised), or when the tile
 * changed owner without a fresh hold being stamped (e.g. a `{...tile, ownerId}`
 * reach auto-claim inheriting the previous owner's window). A fresh capture
 * always writes a new deadline, so it is kept.
 */
export const withoutStaleCaptureHold = (
  previous: DomainTileState | undefined,
  next: DomainTileState,
  nowMs: number
): DomainTileState => {
  if (next.captureHoldUntil === undefined) return next;
  const inheritedByNewOwner = previous?.ownerId !== next.ownerId && previous?.captureHoldUntil === next.captureHoldUntil;
  if (isCaptureHoldActive(next, nowMs) && !inheritedByNewOwner) return next;
  const { captureHoldUntil: _dropped, ...rest } = next;
  return rest;
};

/**
 * Maintains the settledAt stamp resource-slot dormancy and reach anchors read:
 *   - newly SETTLED (previously not, or new owner) → stamp `now`
 *   - leaves SETTLED → clear
 *   - stays SETTLED for the same owner → preserve existing stamp
 * Returns whether the tile was already SETTLED for the same owner.
 */
export const updateTileSettledAt = (
  settledAtByKey: Map<string, number>,
  tileKey: string,
  previous: DomainTileState | undefined,
  next: DomainTileState,
  nowMs: number
): boolean => {
  const sameOwner = Boolean(previous?.ownerId && previous.ownerId === next.ownerId);
  const wasSettledForSameOwner = sameOwner && previous?.ownershipState === "SETTLED" && next.ownershipState === "SETTLED";
  if (next.ownershipState === "SETTLED" && next.ownerId) {
    if (!wasSettledForSameOwner) settledAtByKey.set(tileKey, nowMs);
  } else {
    settledAtByKey.delete(tileKey);
  }
  return wasSettledForSameOwner;
};

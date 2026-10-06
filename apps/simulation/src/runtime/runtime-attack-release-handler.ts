import type { CombatLockIndex } from "../combat-lock-index/combat-lock-index.js";
import { releaseDevelopmentHold, type AttackDevelopmentHoldContext } from "../attack-development-hold/attack-development-hold.js";

/**
 * Thaws development on a tile as soon as no ATTACK targets it any more (however
 * the lock went away), then lets the tile owner's dev queue drain: entries on
 * that tile were held back while it was under attack.
 */
export const installAttackReleaseHandler = (
  locksByTile: CombatLockIndex,
  holdContext: () => AttackDevelopmentHoldContext,
  drainDevQueueFor: (ownerId: string) => void
): void => {
  locksByTile.onAttackTargetReleased((lock) => {
    const ctx = holdContext();
    releaseDevelopmentHold(ctx, lock.targetKey, lock.commandId);
    const ownerId = ctx.tiles.get(lock.targetKey)?.ownerId;
    if (ownerId) drainDevQueueFor(ownerId);
  });
};

import { enqueueDiscoveryTip } from "../client-discovery-tips/client-discovery-tips.js";
import type { DiscoveryTipId } from "../client-discovery-tips/client-discovery-tips.js";
import { isMusterUnlocked, markMusterUnlocked } from "./client-muster-unlock-storage.js";

/**
 * Unlocks mustering the first time a newly-seen tile turns out to belong to
 * a rival empire (not the player, not a barbarian) and queues the "First
 * Contact" tip -- see client-muster-tile-actions.ts for where the unlock
 * flag is read to gate the muster tile actions. No-ops once already
 * unlocked; this only ever flips one way.
 */
export const unlockMusterOnEnemyContact = (
  seenTile: { ownerId?: string } | undefined,
  me: string | undefined,
  authEmail: string | null | undefined,
  discoveryTipQueue: DiscoveryTipId[] | undefined
): void => {
  if (!seenTile?.ownerId || seenTile.ownerId === me || seenTile.ownerId.startsWith("barbarian")) return;
  if (isMusterUnlocked(authEmail)) return;
  markMusterUnlocked(authEmail);
  if (discoveryTipQueue) enqueueDiscoveryTip(discoveryTipQueue, "ENEMY_EMPIRE", authEmail);
};

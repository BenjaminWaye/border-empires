import { enqueueDiscoveryTip } from "../client-discovery-tips/client-discovery-tips.js";
import type { DiscoveryTipId } from "../client-discovery-tips/client-discovery-tips.js";
import { isMusterUnlocked, markMusterUnlocked } from "./client-muster-unlock-storage.js";

/**
 * Unlocks mustering (for the current season -- see client-muster-unlock-storage.ts)
 * the first time a newly-seen tile turns out to belong to anyone but the
 * player -- a rival empire or barbarians, either is something worth
 * mustering against -- and queues the "First Contact" tip. See
 * client-muster-tile-actions.ts for where the unlock flag is read to gate
 * the muster tile actions. No-ops once already unlocked this season, or if
 * the season id isn't known yet.
 */
export const unlockMusterOnEnemyContact = (
  seenTile: { ownerId?: string } | undefined,
  me: string | undefined,
  authEmail: string | null | undefined,
  discoveryTipQueue: DiscoveryTipId[] | undefined,
  seasonId: string | undefined
): void => {
  if (!seenTile?.ownerId || seenTile.ownerId === me || !seasonId) return;
  if (isMusterUnlocked(authEmail, seasonId)) return;
  markMusterUnlocked(authEmail, seasonId);
  if (discoveryTipQueue) enqueueDiscoveryTip(discoveryTipQueue, "ENEMY_EMPIRE", authEmail);
};

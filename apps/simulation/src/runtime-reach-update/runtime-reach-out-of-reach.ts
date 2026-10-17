/**
 * "Is this claim beyond its owner's reach?" -- the one reach question capture
 * resolution still asks now that out-of-reach frontier no longer decays.
 *
 * Land claimed or captured outside reach used to carry a fixed decay timer
 * (OUT_OF_REACH frontierDecayKind). That was removed: players couldn't see the
 * clock, a whole chain of tiles vanished at once when its oldest link ran out,
 * and encirclement already makes over-extended frontier fragile in a way the
 * client can draw (supply lines). Out-of-reach FRONTIER now simply stays
 * FRONTIER: it can't be settled (SETTLE stays reach-gated) and is lost
 * instantly if it is cut off from supply (see encirclement.ts).
 *
 * What still depends on the answer is the captured town/dock auto-settle (see
 * runtime-out-of-reach-auto-settle.ts): an anchor captured beyond reach can't
 * be settled by hand, so it settles itself at capture time instead.
 *
 * `clearLegacyOutOfReachDecayStamps` strips timers persisted before the
 * removal so nothing carries a dead countdown after deploy.
 */

import type { DomainTileState } from "@border-empires/game-domain";
import { reachOwnerCountAt, type LandConnectivityQuery, type ReachAnchor } from "@border-empires/shared";

export type BeyondReachContext = {
  /** True when the tile is inside this player's persistent ownership border. */
  isPlayerTileInReach: (playerId: string, x: number, y: number) => boolean;
  /** Every anchor currently live in the world. */
  gatherReachAnchors: () => ReachAnchor[];
  /** Land-gates the contested-zone check the same way the real reach border is gated (see reach.ts's landGatedTileKeysInDisk). */
  isLandTile?: LandConnectivityQuery;
};

/**
 * True when a tile `playerId` just took at (x, y) sits in genuine
 * no-man's-land for them. Two exemptions, unchanged from the decay era:
 * - The tile is already inside the player's own reach — ordinary expansion.
 * - The tile sits in an actively contested reach zone (2+ players' live
 *   anchors overlap it), which is the intended way to take ground off someone.
 * O(anchors) for one tile.
 */
export const isTileBeyondReach = (context: BeyondReachContext, playerId: string, x: number, y: number): boolean => {
  if (context.isPlayerTileInReach(playerId, x, y)) return false;
  return reachOwnerCountAt(x, y, context.gatherReachAnchors(), context.isLandTile) < 2;
};

/**
 * Boot-time cleanup: clears every OUT_OF_REACH decay timer a snapshot from
 * before the removal still carries, and reports the cleared tiles so the
 * caller can tell their owners. O(tiles) once at hydration, in line with the
 * other boot-time index rebuilds -- never call this per tick.
 */
export const clearLegacyOutOfReachDecayStamps = (
  tiles: ReadonlyMap<string, DomainTileState>,
  replaceTileState: (tileKey: string, tile: DomainTileState) => void
): DomainTileState[] => {
  // Collect first, then write: replaceTileState may update indices keyed off
  // the same map, so don't mutate it mid-iteration.
  const stampedKeys: string[] = [];
  for (const [tileKey, tile] of tiles) if (tile.frontierDecayKind === "OUT_OF_REACH") stampedKeys.push(tileKey);
  const cleared: DomainTileState[] = [];
  for (const tileKey of stampedKeys) {
    const updated: DomainTileState = { ...tiles.get(tileKey)!, frontierDecayAt: undefined, frontierDecayKind: undefined };
    replaceTileState(tileKey, updated);
    cleared.push(updated);
  }
  return cleared;
};

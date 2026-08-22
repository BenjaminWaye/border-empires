import { tileHasTownIdentity } from "../client-town-identity.js";
import {
  OUTPOST_STRUCTURE_TYPES,
  tileKeysAroundAnchor,
  type LocalAnchor,
  type ReachOverlayTileMap
} from "../client-reach-overlay/client-reach-overlay.js";

// Multi-owner generalization of client-reach-overlay.ts's
// computeLocalReachSet, used ONLY to render other players' (including AI)
// border pylons in the 3D map — client-reach-overlay.ts's single-owner
// version stays as the authoritative "my reach" computation used for
// EXPAND/SETTLE legality previews and the waypoint planner.
//
// Same MOCK-DATA SEAM caveat as the single-owner version: the server has
// never pushed an authoritative reach payload over the gateway socket (see
// client-reach-overlay.ts's doc comment for the guessed REACH_UPDATE wire
// shape this would eventually replace), so this reconstructs each owner's
// reach purely from anchor tiles (towns/outposts/docks) already visible in
// `tiles` — it can't see contested-tile clipping against a rival's anchors,
// only what a plain union-of-disks would look like. That's an acceptable
// approximation for a border a player is just glancing at, not acting on;
// the tiles that matter for legality (EXPAND/SETTLE onto YOUR OWN territory)
// still go through the single-owner, authoritative-shaped path.
//
// "barbarian-" owners are excluded — barbarian territory is environment,
// not a bordered empire, and never contributes reach anchors server-side
// either (see packages/shared/src/reach/reach.ts's design notes).

/**
 * Every distinct owner's reach set, computed by unioning that owner's
 * town/outpost/dock anchor disks — same math as computeLocalReachSet, just
 * scanning every owner present in `tiles` instead of one hardcoded id.
 * Skips the caller's own id when `excludeOwnerId` is passed, since the 3D
 * renderer already has a separate, already-computed "my reach" set and
 * doesn't need a duplicate copy of it here.
 */
export const computeReachSetsByOwner = (
  tiles: ReachOverlayTileMap,
  excludeOwnerId?: string
): Map<string, Set<string>> => {
  const anchorsByOwner = new Map<string, LocalAnchor[]>();
  for (const tile of tiles.values()) {
    const ownerId = tile.ownerId;
    if (!ownerId || ownerId === excludeOwnerId || ownerId.startsWith("barbarian-")) continue;
    const isSettled = tile.ownershipState === "SETTLED";
    let anchors = anchorsByOwner.get(ownerId);
    const pushAnchor = (kind: LocalAnchor["kind"]): void => {
      if (!anchors) {
        anchors = [];
        anchorsByOwner.set(ownerId, anchors);
      }
      anchors.push({ x: tile.x, y: tile.y, kind });
    };
    // Same detail-payload-vs-lightweight-reference gates as
    // computeLocalReachSet — see that function's doc comments for why
    // tileHasTownIdentity/dockId (not tile.town/tile.dock) are correct here.
    if (isSettled && tileHasTownIdentity(tile)) pushAnchor("TOWN");
    if (tile.dockId) pushAnchor("DOCK");
    const outpostType = tile.economicStructure?.type;
    const isActiveOutpostEconomic =
      isSettled &&
      tile.economicStructure?.ownerId === ownerId &&
      tile.economicStructure?.status === "active" &&
      outpostType !== undefined &&
      OUTPOST_STRUCTURE_TYPES.has(outpostType);
    const isActiveSiegeOutpost = isSettled && tile.siegeOutpost?.ownerId === ownerId && tile.siegeOutpost?.status === "active";
    if (isActiveOutpostEconomic || isActiveSiegeOutpost) pushAnchor("OUTPOST");
  }
  const reachByOwner = new Map<string, Set<string>>();
  for (const [ownerId, anchors] of anchorsByOwner) {
    const reach = new Set<string>();
    for (const anchor of anchors) {
      for (const key of tileKeysAroundAnchor(anchor)) reach.add(key);
    }
    reachByOwner.set(ownerId, reach);
  }
  return reachByOwner;
};

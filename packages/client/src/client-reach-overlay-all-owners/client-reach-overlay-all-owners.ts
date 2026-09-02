import type { ReachOverlayTileMap } from "../client-reach-overlay/client-reach-overlay.js";

// Multi-owner reach, used ONLY to render other players' (including AI)
// border pylons in the 3D map — client-reach-overlay.ts's single-owner
// version stays as the authoritative "my reach" computation used for
// EXPAND/SETTLE legality previews and the waypoint planner.
//
// Used to be an anchor-radius-disk guess (unioning town/outpost/dock disks,
// same math as client-reach-overlay.ts's computeLocalReachSet) because the
// server had no per-tile reach field to read. That guess could never see
// contested-tile clipping against a rival's anchors, so two owners' boundary
// loops rarely landed on the exact shared line the clash-seam detector
// (client-reach-overlay-border-contact.ts) needs -- they either didn't touch
// (no seam) or visibly crossed. Replaced by reading tile.reachOwnerId
// directly (see SimulationTileWireDelta.reachOwnerId's doc comment) now that
// the wire carries the server's already contest-resolved border per tile.
//
// "barbarian-" owners are excluded — barbarian territory is environment,
// not a bordered empire, and never contributes reach anchors server-side
// either (see packages/shared/src/reach/reach.ts's design notes).

/**
 * Every distinct owner's reach set, read directly off each visible tile's
 * `reachOwnerId`. Skips the caller's own id when `excludeOwnerId` is passed,
 * since the 3D renderer already has a separate, already-computed "my reach"
 * set and doesn't need a duplicate copy of it here.
 *
 * Bounded by the same tiles the caller already has cached -- a tile the
 * client hasn't loaded yet simply isn't in `tiles` and contributes nothing.
 */
export const computeReachSetsByOwnerFromWire = (
  tiles: ReachOverlayTileMap,
  excludeOwnerId?: string
): Map<string, Set<string>> => {
  const reachByOwner = new Map<string, Set<string>>();
  for (const [tileKey, tile] of tiles) {
    const ownerId = tile.reachOwnerId;
    if (!ownerId || ownerId === excludeOwnerId || ownerId.startsWith("barbarian-")) continue;
    let reach = reachByOwner.get(ownerId);
    if (!reach) {
      reach = new Set<string>();
      reachByOwner.set(ownerId, reach);
    }
    reach.add(tileKey);
  }
  return reachByOwner;
};

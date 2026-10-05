import { REACH_VISION_RADIUS } from "@border-empires/shared";
import type { VisibilityCoverageTracker, VisibilityTransitionCallbacks } from "./visibility-coverage-cache.js";

type ReachVisionDeps = {
  readonly coverage: VisibilityCoverageTracker;
  readonly viewersForOwner: (ownerId: string) => readonly string[];
  readonly callbacks?: VisibilityTransitionCallbacks;
};

/**
 * Applies the radius-one fog contribution made by every authoritative reach
 * tile. The source itself reveals all of reach; the outermost sources also
 * reveal exactly one tile beyond the reach edge.
 */
export const syncReachVision = (
  oldBorder: ReadonlyMap<string, string>,
  newBorder: ReadonlyMap<string, string>,
  changedKeys: Iterable<string>,
  deps: ReachVisionDeps
): void => {
  for (const key of changedKeys) {
    const oldOwnerId = oldBorder.get(key);
    const newOwnerId = newBorder.get(key);
    if (oldOwnerId === newOwnerId) continue;
    const [x, y] = key.split(",").map(Number);
    for (const [ownerId, adding] of [[oldOwnerId, false], [newOwnerId, true]] as const) {
      if (!ownerId || ownerId.startsWith("barbarian-")) continue;
      for (const viewerId of deps.viewersForOwner(ownerId)) {
        const reason = viewerId === ownerId ? "reach:self" : `reach:ally:${ownerId}`;
        if (adding) deps.coverage.addTileVisionBonus(viewerId, x!, y!, REACH_VISION_RADIUS, deps.callbacks, reason);
        else deps.coverage.removeTileVisionBonus(viewerId, x!, y!, REACH_VISION_RADIUS, deps.callbacks, reason);
      }
    }
  }
};

export const syncReachVisionAlliance = (
  border: ReadonlyMap<string, string>,
  actorId: string,
  targetId: string,
  allied: boolean,
  coverage: VisibilityCoverageTracker,
  callbacks?: VisibilityTransitionCallbacks
): void => {
  for (const [sourceId, viewerId] of [[actorId, targetId], [targetId, actorId]] as const) {
    for (const [key, ownerId] of border) {
      if (ownerId !== sourceId) continue;
      const [x, y] = key.split(",").map(Number);
      const reason = `reach:ally:${sourceId}`;
      if (allied) coverage.addTileVisionBonus(viewerId, x!, y!, REACH_VISION_RADIUS, callbacks, reason);
      else coverage.removeTileVisionBonus(viewerId, x!, y!, REACH_VISION_RADIUS, callbacks, reason);
    }
  }
};

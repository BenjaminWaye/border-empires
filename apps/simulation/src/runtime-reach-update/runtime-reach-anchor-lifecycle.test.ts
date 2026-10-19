import type { DomainTileState } from "@border-empires/game-domain";
import type { ReachAnchor } from "@border-empires/shared";
import { describe, expect, it, vi } from "vitest";

import { applyReachAnchorDeactivationEffects, type ReachAnchorLifecycleDeps } from "./runtime-reach-anchor-lifecycle.js";
import { createReachBorderApplyContext } from "./runtime-reach-border-apply.js";
import { createReachChangedTilesDirtyState } from "./runtime-reach-contested-tiles.js";
import { createReachUpdateState } from "./runtime-reach-update.js";

// Exercises applyReachAnchorDeactivationEffects exactly the way runtime.ts
// calls it, with a REAL applyReachAnchorDeactivationToBorder pass computing
// the next border.
describe("applyReachAnchorDeactivationEffects", () => {
  it("vacates the border and keeps the now-uncovered FRONTIER tile with no decay timer", () => {
    // Regression: losing an anchor used to stamp an OUT_OF_REACH decay timer
    // on every FRONTIER tile it alone covered. Out-of-reach frontier no
    // longer decays -- the tile just stays the player's FRONTIER.
    const tileKey = "10,10";
    const anchor: ReachAnchor = { x: 10, y: 10, ownerId: "p1", activatedAt: 1, kind: "TOWN" };
    const frontierTile = { x: 10, y: 10, ownerId: "p1", ownershipState: "FRONTIER" } as DomainTileState;
    const tiles = new Map<string, DomainTileState>([[tileKey, frontierTile]]);
    const syncReachVision = vi.fn();

    const deps: ReachAnchorLifecycleDeps = {
      reachBorder: new Map<string, string>([[tileKey, "p1"]]),
      reachUpdateState: createReachUpdateState(),
      reachBorderApplyContext: createReachBorderApplyContext({
        gatherReachAnchors: () => [], // the anchor is already gone -- nothing live covers this tile any more
        playerSummaryIds: () => ["p1"],
        getTile: (key) => tiles.get(key),
        autoClaimFrontier: () => [],
        contestedDirtyState: createReachChangedTilesDirtyState()
      }),
      syncReachVision
    };

    const nextBorder = applyReachAnchorDeactivationEffects(deps, anchor, "test-deactivation");

    expect(nextBorder.get(tileKey)).not.toBe("p1");
    expect(tiles.get(tileKey)).toBe(frontierTile);
    expect(tiles.get(tileKey)?.frontierDecayKind).toBeUndefined();
    expect(syncReachVision).toHaveBeenCalledTimes(1);
  });
});

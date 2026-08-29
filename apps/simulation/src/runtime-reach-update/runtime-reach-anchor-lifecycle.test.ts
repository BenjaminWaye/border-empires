import type { DomainTileState } from "@border-empires/game-domain";
import type { SimulationEvent } from "@border-empires/sim-protocol";
import { OUT_OF_REACH_DECAY_MS, TOWN_REACH_RADIUS, type ReachAnchor } from "@border-empires/shared";
import { describe, expect, it, vi } from "vitest";

import type { SimulationTileWireDelta } from "../runtime-types.js";
import { applyReachAnchorDeactivationEffects, type ReachAnchorLifecycleDeps } from "./runtime-reach-anchor-lifecycle.js";
import { createReachBorderApplyContext } from "./runtime-reach-border-apply.js";
import { createReachUpdateState } from "./runtime-reach-update.js";

const NOW = 10_000;

// Regression test for the real end-to-end wiring, not just the pure
// stampOutOfReachDecayInAnchorDisk function in isolation: this exercises
// applyReachAnchorDeactivationEffects exactly the way runtime.ts calls it,
// with a REAL applyReachAnchorDeactivationToBorder pass computing the next
// border. A prior version of this wiring built the stamp pass's
// isPlayerTileInReach from the pre-deactivation `deps.reachBorder` (still
// showing the tile as granted to its owner), which silently no-op'd the
// entire fix for the exact scenario it exists to catch: a tile solely
// covered by the deactivating anchor.
describe("applyReachAnchorDeactivationEffects", () => {
  it("stamps a FRONTIER tile whose sole covering anchor just deactivated, using the POST-deactivation border", () => {
    const tileKey = "10,10";
    const anchor: ReachAnchor = { x: 10, y: 10, ownerId: "p1", activatedAt: 1, kind: "TOWN" };
    const tiles = new Map<string, DomainTileState>([
      [tileKey, { x: 10, y: 10, ownerId: "p1", ownershipState: "FRONTIER" } as DomainTileState]
    ]);
    // Stale border: the deactivated anchor's grant is still sitting here,
    // exactly as it would be the instant before `this.reachBorder` is
    // reassigned in runtime.ts's `applyReachAnchorDeactivation`.
    const staleBorder = new Map<string, string>([[tileKey, "p1"]]);
    const events: SimulationEvent[] = [];
    const registerOutOfReachDecay = vi.fn();

    const deps: ReachAnchorLifecycleDeps = {
      reachBorder: staleBorder,
      reachUpdateState: createReachUpdateState(),
      reachBorderApplyContext: createReachBorderApplyContext({
        gatherReachAnchors: () => [], // the anchor is already gone -- nothing live covers this tile any more
        playerSummaryIds: () => ["p1"],
        getTile: (key) => tiles.get(key)
      }),
      tiles,
      replaceTileState: (key, tile) => {
        tiles.set(key, tile);
      },
      tileDeltaFromState: (tile) => ({ x: tile.x, y: tile.y }) as SimulationTileWireDelta,
      emitEvent: (event) => {
        events.push(event);
      },
      now: () => NOW,
      gatherReachAnchors: () => [],
      registerOutOfReachDecay
    };

    const nextBorder = applyReachAnchorDeactivationEffects(deps, anchor, "test-deactivation");

    // The border computation itself vacated the tile...
    expect(nextBorder.get(tileKey)).not.toBe("p1");
    // ...and the stamp pass saw that, not the stale `deps.reachBorder`.
    const tile = tiles.get(tileKey);
    expect(tile?.frontierDecayKind).toBe("OUT_OF_REACH");
    expect(tile?.frontierDecayAt).toBe(NOW + OUT_OF_REACH_DECAY_MS);
    expect(registerOutOfReachDecay).toHaveBeenCalledWith(tileKey, NOW + OUT_OF_REACH_DECAY_MS);
    expect(events).toHaveLength(1);
  });

  it("does not stamp when the tile is still an actively contested reach zone after deactivation", () => {
    const tileKey = "10,10";
    const anchor: ReachAnchor = { x: 10, y: 10, ownerId: "p1", activatedAt: 1, kind: "TOWN" };
    // Two OTHER live anchors still overlap this tile even after p1's anchor
    // deactivates -- a 2+-owner contest, exempt per outOfReachDecayDeadline's
    // rule (fought-over ground isn't genuine no-man's-land).
    const rivalAnchors: ReachAnchor[] = [
      { x: 10, y: 10, ownerId: "p2", activatedAt: 1, kind: "TOWN" },
      { x: 10 + TOWN_REACH_RADIUS, y: 10, ownerId: "p3", activatedAt: 1, kind: "TOWN" }
    ];
    const tiles = new Map<string, DomainTileState>([
      [tileKey, { x: 10, y: 10, ownerId: "p1", ownershipState: "FRONTIER" } as DomainTileState]
    ]);
    const staleBorder = new Map<string, string>([[tileKey, "p1"]]);

    const deps: ReachAnchorLifecycleDeps = {
      reachBorder: staleBorder,
      reachUpdateState: createReachUpdateState(),
      reachBorderApplyContext: createReachBorderApplyContext({
        gatherReachAnchors: () => rivalAnchors,
        playerSummaryIds: () => ["p1", "p2", "p3"],
        getTile: (key) => tiles.get(key)
      }),
      tiles,
      replaceTileState: (key, tile) => {
        tiles.set(key, tile);
      },
      tileDeltaFromState: (tile) => ({ x: tile.x, y: tile.y }) as SimulationTileWireDelta,
      emitEvent: () => {},
      now: () => NOW,
      gatherReachAnchors: () => rivalAnchors,
      registerOutOfReachDecay: vi.fn()
    };

    applyReachAnchorDeactivationEffects(deps, anchor, "test-deactivation");

    expect(tiles.get(tileKey)?.frontierDecayKind).toBeUndefined();
  });
});

// Sanity check that the disk walk in the test above is exercising a real
// radius, not an accidental zero-size disk.
describe("TOWN_REACH_RADIUS sanity", () => {
  it("is a positive radius", () => {
    expect(TOWN_REACH_RADIUS).toBeGreaterThan(0);
  });
});

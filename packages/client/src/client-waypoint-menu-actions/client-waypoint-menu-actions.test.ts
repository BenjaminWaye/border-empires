import { describe, expect, it } from "vitest";

import { injectWaypointActions } from "./client-waypoint-menu-actions.js";
import type { ClientState } from "../client-state/client-state.js";
import type { Tile, TileMenuView } from "../client-types.js";

const keyFor = (x: number, y: number): string => `${x},${y}`;

const tile = (x: number, y: number, overrides: Partial<Tile> = {}): Tile => ({
  x,
  y,
  terrain: "LAND",
  ...overrides
});

const view = (overrides: Partial<TileMenuView> = {}): TileMenuView => ({
  title: "",
  subtitle: "",
  tabs: ["overview"],
  overviewLines: [],
  actions: [],
  buildings: [],
  crystal: [],
  ...overrides
});

type StateShape = Pick<ClientState, "me" | "tiles" | "dockPairs" | "allies" | "activeTruces" | "waypoint">;

const stateWith = (tiles: Tile[], overrides: Partial<StateShape> = {}): StateShape => ({
  me: "me",
  tiles: new Map(tiles.map((t) => [keyFor(t.x, t.y), t])),
  dockPairs: [],
  allies: [],
  activeTruces: [],
  waypoint: [],
  ...overrides
});

const noAdjacentOrigin = () => undefined;

// An owned, settled tile with an active RELAY_BEACON (OUTPOST_REACH_RADIUS =
// 5) -- gives the intermediate EXPAND legs of a waypoint chain real reach
// coverage. Every EXPAND step (including ones leading up to an ATTACK) now
// requires this; only the final ATTACK step itself is reach-exempt.
const beaconAnchor = (x: number, y: number): Tile =>
  tile(x, y, {
    ownerId: "me",
    ownershipState: "SETTLED",
    economicStructure: { ownerId: "me", type: "RELAY_BEACON", status: "active" }
  });

describe("injectWaypointActions", () => {
  // Intermediate explored neutral tiles so A* has a path to traverse.
  const explored = (xs: number[], y: number): Tile[] => xs.map((x) => tile(x, y));

  // Neutral (unowned) targets are now fully handled by Settle Land itself
  // (client-tile-action-logic.ts walks a non-adjacent-but-in-reach neutral
  // target there via the exact same planWaypoint machinery this module
  // uses internally) -- offering "Add Waypoint" for that same case would
  // be a duplicate button. This module now only ever offers it for an
  // ENEMY-owned attack target, which Settle Land never applies to.
  describe("enemy attack targets", () => {
    it("prepends Expand Here when the tile is a reachable distant enemy target", () => {
      const tiles = [
        beaconAnchor(3, 3),
        ...explored([4, 5, 6, 7], 3),
        tile(8, 3, { ownerId: "enemy" })
      ];
      const state = stateWith(tiles);
      const v = view();
      injectWaypointActions(v, tile(8, 3, { ownerId: "enemy" }), state, {
        keyFor,
        pickOriginForTarget: noAdjacentOrigin
      });
      expect(v.actions[0]?.id).toBe("expand_here");
      expect(v.actions[0]?.detail).toMatch(/expand/);
      expect(v.tabs[0]).toBe("actions");
    });

    it("is not reach-gated -- an enemy target itself may sit outside reach, as long as the EXPAND legs leading up to it don't", () => {
      // beaconAnchor(3,3) covers up to x=8 (OUTPOST_REACH_RADIUS=5) -- the
      // intermediate EXPAND hops at x=4..7 are all in reach, but the enemy
      // target at x=9 sits one tile past the reach edge. The final ATTACK
      // step is deliberately exempt from the reach check, so the plan must
      // still succeed even though its destination itself is unreachable by
      // EXPAND.
      const tiles = [beaconAnchor(3, 3), ...explored([4, 5, 6, 7, 8], 3), tile(9, 3, { ownerId: "enemy" })];
      const state = stateWith(tiles);
      const v = view();
      injectWaypointActions(v, tile(9, 3, { ownerId: "enemy" }), state, {
        keyFor,
        pickOriginForTarget: noAdjacentOrigin
      });
      expect(v.actions[0]?.id).toBe("expand_here");
    });

    it("does not inject Expand Here when an adjacent origin exists", () => {
      const tiles = [beaconAnchor(3, 3), ...explored([4, 5, 6, 7], 3), tile(8, 3, { ownerId: "enemy" })];
      const state = stateWith(tiles);
      const v = view();
      injectWaypointActions(v, tile(8, 3, { ownerId: "enemy" }), state, {
        keyFor,
        pickOriginForTarget: () => tiles[0] // pretend (3,3) is adjacent
      });
      expect(v.actions).toHaveLength(0);
    });

    it("still injects Expand Here on a distant fogged enemy tile with confirmed LAND terrain", () => {
      // Fog only means "not currently visible", not "terrain unknown" -- a
      // previously-confirmed LAND tile that's now fogged should still be a
      // valid waypoint target, the same as a visible one.
      const tiles = [beaconAnchor(3, 3), ...explored([4, 5, 6, 7], 3), tile(8, 3, { ownerId: "enemy", fogged: true })];
      const state = stateWith(tiles);
      const v = view();
      injectWaypointActions(v, tile(8, 3, { ownerId: "enemy", fogged: true }), state, {
        keyFor,
        pickOriginForTarget: noAdjacentOrigin
      });
      expect(v.actions).toHaveLength(1);
      expect(v.actions[0]?.id).toBe("expand_here");
    });

    it("does not inject Expand Here when no path exists to the tile", () => {
      // (3,3) owned, (8,3) target, but (4,3)..(7,3) all mountain (no diagonals help)
      const tiles = [
        tile(3, 3, { ownerId: "me" }),
        tile(4, 3, { terrain: "MOUNTAIN" }),
        tile(4, 4, { terrain: "MOUNTAIN" }),
        tile(4, 2, { terrain: "MOUNTAIN" }),
        tile(3, 2, { terrain: "MOUNTAIN" }),
        tile(3, 4, { terrain: "MOUNTAIN" }),
        tile(2, 2, { terrain: "MOUNTAIN" }),
        tile(2, 3, { terrain: "MOUNTAIN" }),
        tile(2, 4, { terrain: "MOUNTAIN" }),
        tile(8, 3, { ownerId: "enemy" })
      ];
      const state = stateWith(tiles);
      const v = view();
      injectWaypointActions(v, tile(8, 3, { ownerId: "enemy" }), state, {
        keyFor,
        pickOriginForTarget: noAdjacentOrigin
      });
      expect(v.actions).toHaveLength(0);
    });

    it("prepends Add Waypoint on a different enemy tile when a waypoint is already queued", () => {
      // (9,3) is a beacon anchor (radius 5) rather than a plain explored
      // tile, so the second target (12,3, distance 3 from the anchor) has
      // real reach coverage along its approach.
      const tiles = [beaconAnchor(3, 3), ...explored([4, 5, 6, 7, 10, 11], 3), beaconAnchor(9, 3), tile(8, 3, { ownerId: "enemy" }), tile(12, 3, { ownerId: "enemy" })];
      const state = stateWith(tiles, {
        waypoint: [{
          target: { x: 8, y: 3 },
          plan: {
            target: { x: 8, y: 3 },
            steps: [],
            totalGold: 5,
            totalManpower: 0,
            totalDurationMs: 5000,
            expandCount: 5,
            attackCount: 0,
            reachable: true
          }
        }]
      });
      const v = view();
      // Open menu on a different distant tile with a waypoint already
      // queued — should offer to append another waypoint to the queue.
      injectWaypointActions(v, tile(12, 3, { ownerId: "enemy" }), state, {
        keyFor,
        pickOriginForTarget: noAdjacentOrigin
      });
      expect(v.actions[0]?.id).toBe("expand_here");
      expect(v.actions[0]?.label).toBe("Add Waypoint");
      expect(v.tabs[0]).toBe("actions");
    });
  });

  it("does not inject Expand Here on a neutral (unowned) target -- Settle Land handles that case itself", () => {
    const tiles = [tile(3, 3, { ownerId: "me" }), ...explored([4, 5, 6, 7], 3), tile(8, 3)];
    const state = stateWith(tiles);
    const v = view();
    injectWaypointActions(v, tile(8, 3), state, {
      keyFor,
      pickOriginForTarget: noAdjacentOrigin
    });
    expect(v.actions).toHaveLength(0);
  });

  it("does not inject Expand Here on tiles owned by the player", () => {
    const tiles = [tile(3, 3, { ownerId: "me" }), tile(8, 3, { ownerId: "me" })];
    const state = stateWith(tiles);
    const v = view();
    injectWaypointActions(v, tile(8, 3, { ownerId: "me" }), state, {
      keyFor,
      pickOriginForTarget: noAdjacentOrigin
    });
    expect(v.actions).toHaveLength(0);
  });

  it("prepends Cancel Waypoint and forces the actions tab when tile is the current waypoint target", () => {
    const tiles = [tile(3, 3, { ownerId: "me" }), tile(8, 3)];
    const state = stateWith(tiles, {
      waypoint: [{
        target: { x: 8, y: 3 },
        plan: {
          target: { x: 8, y: 3 },
          steps: [],
          totalGold: 5,
          totalManpower: 0,
          totalDurationMs: 5000,
          expandCount: 5,
          attackCount: 0,
          reachable: true
        }
      }]
    });
    const v = view();
    injectWaypointActions(v, tile(8, 3), state, {
      keyFor,
      pickOriginForTarget: noAdjacentOrigin
    });
    expect(v.actions[0]?.id).toBe("cancel_waypoint");
    expect(v.actions[0]?.detail).toMatch(/5 gold/);
    expect(v.tabs[0]).toBe("actions");
  });
});

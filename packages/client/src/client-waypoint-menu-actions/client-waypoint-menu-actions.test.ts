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
  waypoint: undefined,
  ...overrides
});

const noAdjacentOrigin = () => undefined;

describe("injectWaypointActions", () => {
  // Intermediate explored neutral tiles so A* has a path to traverse.
  const explored = (xs: number[], y: number): Tile[] => xs.map((x) => tile(x, y));

  it("prepends Expand Here when the tile is a reachable distant LAND target", () => {
    const tiles = [
      tile(3, 3, { ownerId: "me" }),
      ...explored([4, 5, 6, 7], 3),
      tile(8, 3)
    ];
    const state = stateWith(tiles);
    const v = view();
    injectWaypointActions(v, tile(8, 3), state, {
      keyFor,
      pickOriginForTarget: noAdjacentOrigin
    });
    expect(v.actions[0]?.id).toBe("expand_here");
    expect(v.actions[0]?.detail).toMatch(/expand/);
    expect(v.tabs[0]).toBe("actions");
  });

  it("does not inject Expand Here when an adjacent origin exists", () => {
    const tiles = [tile(3, 3, { ownerId: "me" }), ...explored([4, 5, 6, 7], 3), tile(8, 3)];
    const state = stateWith(tiles);
    const v = view();
    injectWaypointActions(v, tile(8, 3), state, {
      keyFor,
      pickOriginForTarget: () => tiles[0] // pretend (3,3) is adjacent
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

  it("does not inject Expand Here on fogged tiles", () => {
    const tiles = [tile(3, 3, { ownerId: "me" }), ...explored([4, 5, 6, 7], 3), tile(8, 3, { fogged: true })];
    const state = stateWith(tiles);
    const v = view();
    injectWaypointActions(v, tile(8, 3, { fogged: true }), state, {
      keyFor,
      pickOriginForTarget: noAdjacentOrigin
    });
    expect(v.actions).toHaveLength(0);
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
      tile(8, 3)
    ];
    const state = stateWith(tiles);
    const v = view();
    injectWaypointActions(v, tile(8, 3), state, {
      keyFor,
      pickOriginForTarget: noAdjacentOrigin
    });
    expect(v.actions).toHaveLength(0);
  });

  it("prepends Cancel Waypoint and forces the actions tab when tile is the current waypoint target", () => {
    const tiles = [tile(3, 3, { ownerId: "me" }), tile(8, 3)];
    const state = stateWith(tiles, {
      waypoint: {
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
      }
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

  it("prepends Clear Waypoint and Expand Here on a different tile when a waypoint is already active", () => {
    const tiles = [tile(3, 3, { ownerId: "me" }), ...explored([4, 5, 6, 7, 9, 10, 11], 3), tile(8, 3), tile(12, 3)];
    const state = stateWith(tiles, {
      waypoint: {
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
      }
    });
    const v = view();
    // Open menu on a different distant tile with an active waypoint —
    // should offer to clear the existing waypoint and expand here instead.
    injectWaypointActions(v, tile(12, 3), state, {
      keyFor,
      pickOriginForTarget: noAdjacentOrigin
    });
    expect(v.actions[0]?.id).toBe("clear_waypoint_and_expand_here");
    expect(v.actions[0]?.label).toBe("Clear Waypoint and Expand Here");
    expect(v.tabs[0]).toBe("actions");
  });
});

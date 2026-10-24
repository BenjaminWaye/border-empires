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

type StateShape = Pick<ClientState, "me" | "tiles" | "dockPairs" | "allies" | "activeTruces" | "waypoint" | "serverReach" | "serverReachRevision">;

const stateWith = (tiles: Tile[], overrides: Partial<StateShape> = {}): StateShape => ({
  me: "me",
  tiles: new Map(tiles.map((t) => [keyFor(t.x, t.y), t])),
  dockPairs: [],
  allies: [],
  activeTruces: [],
  waypoint: [],
  // undefined serverReach = no REACH_UPDATE yet, so resolveMyReach falls back
  // to the local anchor-derived approximation these fixtures already set up.
  serverReach: undefined,
  serverReachRevision: 0,
  ...overrides
});

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

  // Regression: a distant enemy tile used to get an "Expand To & Attack"
  // waypoint chain here. That's now a march from a muster flag (March Attack
  // rows, client-march-attack-actions.ts), so nothing is offered even when
  // the planner could reach the tile.
  it("does not offer Expand To & Attack on a reachable distant enemy target", () => {
    const tiles = [beaconAnchor(3, 3), ...explored([4, 5, 6, 7], 3), tile(8, 3, { ownerId: "enemy" })];
    const state = stateWith(tiles);
    const v = view();
    injectWaypointActions(v, tile(8, 3, { ownerId: "enemy" }), state);
    expect(v.actions).toHaveLength(0);
  });

  it("does not inject Expand Here on a neutral (unowned) target -- Settle Land handles that case itself", () => {
    const tiles = [tile(3, 3, { ownerId: "me" }), ...explored([4, 5, 6, 7], 3), tile(8, 3)];
    const state = stateWith(tiles);
    const v = view();
    injectWaypointActions(v, tile(8, 3), state);
    expect(v.actions).toHaveLength(0);
  });

  it("does not inject Expand Here on tiles owned by the player", () => {
    const tiles = [tile(3, 3, { ownerId: "me" }), tile(8, 3, { ownerId: "me" })];
    const state = stateWith(tiles);
    const v = view();
    injectWaypointActions(v, tile(8, 3, { ownerId: "me" }), state);
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
    injectWaypointActions(v, tile(8, 3), state);
    expect(v.actions[0]?.id).toBe("cancel_waypoint");
    expect(v.actions[0]?.detail).toMatch(/5 coin/);
    expect(v.tabs[0]).toBe("actions");
  });

  // Regression: a waypoint's target tile can be off-screen or never
  // explored (e.g. queued by a misclick just before signing in), so the
  // only way to cancel it can't be gated on selecting that exact tile.
  describe("Cancel All Waypoints", () => {
    const queuedWaypoint = {
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
    };

    it("is appended on a tile with no other waypoint-related action when the queue is non-empty", () => {
      const tiles = [tile(3, 3, { ownerId: "me" }), tile(99, 99, { ownerId: "me" })];
      const state = stateWith(tiles, { waypoint: [queuedWaypoint] });
      const v = view();
      injectWaypointActions(v, tile(99, 99, { ownerId: "me" }), state);
      expect(v.actions).toHaveLength(1);
      expect(v.actions[0]?.id).toBe("cancel_all_waypoints");
      expect(v.actions[0]?.label).toContain("1");
    });

    it("is appended after Cancel Waypoint on the waypoint's own target tile too", () => {
      const tiles = [tile(3, 3, { ownerId: "me" }), tile(8, 3)];
      const state = stateWith(tiles, { waypoint: [queuedWaypoint] });
      const v = view();
      injectWaypointActions(v, tile(8, 3), state);
      expect(v.actions.map((a) => a.id)).toEqual(["cancel_waypoint", "cancel_all_waypoints"]);
    });

    it("is not appended when the queue is empty", () => {
      const tiles = [tile(3, 3, { ownerId: "me" }), tile(99, 99, { ownerId: "me" })];
      const state = stateWith(tiles, { waypoint: [] });
      const v = view();
      injectWaypointActions(v, tile(99, 99, { ownerId: "me" }), state);
      expect(v.actions).toHaveLength(0);
    });
  });
});

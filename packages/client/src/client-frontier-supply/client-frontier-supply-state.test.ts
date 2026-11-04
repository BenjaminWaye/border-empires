import { describe, expect, it } from "vitest";

import type { Tile } from "../client-types.js";
import { frontierSupplyModelForState, type FrontierSupplyState } from "./client-frontier-supply-state.js";

const tile = (x: number, y: number, ownerId: string, ownershipState: "SETTLED" | "FRONTIER"): Tile => ({ x, y, terrain: "LAND", ownerId, ownershipState });

const stateWith = (tiles: Tile[]): FrontierSupplyState & { tiles: Map<string, Tile> } => ({
  me: "me",
  tiles: new Map(tiles.map((t) => [`${t.x},${t.y}`, t])),
  serverReach: new Set(["10,10", "11,10"]),
  serverReachRevision: 1,
  tilesRevision: 1,
  myReach: undefined,
  myReachRevisionAtCompute: "",
  activeAetherBridges: [],
  dockPairs: []
});

describe("frontierSupplyModelForState", () => {
  it("redraws the route when an enemy takes a tile on it, as soon as the tile change lands", () => {
    // Two routes from (11,10) out to (14,10): over (12,9)/(13,9) and under (12,11)/(13,11).
    const state = stateWith([
      tile(10, 10, "me", "SETTLED"),
      tile(11, 10, "me", "FRONTIER"),
      tile(12, 9, "me", "FRONTIER"), tile(13, 9, "me", "FRONTIER"),
      tile(12, 11, "me", "FRONTIER"), tile(13, 11, "me", "FRONTIER"),
      tile(14, 10, "me", "FRONTIER")
    ]);
    const before = frontierSupplyModelForState(state, 1_000);
    const feeder = before.links.find((link) => link.to.x === 14)!.from;

    // A TILE_DELTA from the gateway: ownership flips and tilesRevision bumps (client-gateway-sync.ts).
    state.tiles.set(`${feeder.x},${feeder.y}`, tile(feeder.x, feeder.y, "rival", "FRONTIER"));
    state.tilesRevision += 1;

    const after = frontierSupplyModelForState(state, 2_000);
    expect(after).not.toBe(before);
    const rerouted = after.links.find((link) => link.to.x === 14)!.from;
    expect(rerouted).not.toEqual(feeder);
    expect(rerouted.y).toBe(feeder.y === 9 ? 11 : 9);
  });

  it("reuses the cached model while nothing has changed", () => {
    const state = stateWith([tile(10, 10, "me", "SETTLED"), tile(11, 10, "me", "FRONTIER"), tile(12, 10, "me", "FRONTIER")]);
    expect(frontierSupplyModelForState(state, 1_000)).toBe(frontierSupplyModelForState(state, 5_000));
  });
});

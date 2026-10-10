import { describe, expect, it } from "vitest";

import { structureRemovalDurationMs } from "@border-empires/shared";
import { createClientOptimisticStateController } from "./client-optimistic-state.js";
import type { Tile } from "../client-types.js";

const baseTile = (overrides: Partial<Tile> = {}): Tile => ({
  x: 12,
  y: 18,
  terrain: "LAND",
  fogged: false,
  ...overrides
});

describe("optimistic Relay Beacon build time", () => {
  const stateWithBeacons = (ownedBeacons: number) => {
    const tiles = new Map<string, Tile>([["12,18", baseTile({ ownerId: "me", ownershipState: "SETTLED" })]]);
    for (let i = 0; i < ownedBeacons; i++) {
      tiles.set(`${i},0`, baseTile({
        x: i, y: 0, ownerId: "me", ownershipState: "SETTLED",
        economicStructure: { ownerId: "me", type: "RELAY_BEACON", status: "active" }
      }));
    }
    return {
      me: "me",
      selected: undefined,
      techIds: [],
      tiles,
      tilesRevision: 0,
      tilesRevisionChangedKeys: new Set<string>(),
      tilesRevisionOverflowed: false,
      discoveredTiles: new Set<string>(),
      settleProgressByTile: new Map<string, unknown>(),
      optimisticTileSnapshots: new Map<string, Tile | undefined>(),
      frontierLateAckUntilByTarget: new Map<string, number>()
    } as any;
  };
  const completesAtFor = (ownedBeacons: number): { completesAt: number; now: number } => {
    const state = stateWithBeacons(ownedBeacons);
    const { applyOptimisticStructureBuild } = createClientOptimisticStateController({
      state,
      keyFor: (x, y) => `${x},${y}`,
      terrainAt: () => "LAND",
      tileVisibilityStateAt: () => "visible",
      optimisticEnabled: true
    });
    const now = Date.now();
    applyOptimisticStructureBuild(12, 18, "RELAY_BEACON");
    return { completesAt: state.tiles.get("12,18").economicStructure.completesAt as number, now };
  };

  it("completes at once for a player's first 5 beacons", () => {
    const { completesAt, now } = completesAtFor(4);
    expect(completesAt - now).toBeLessThan(1_000);
  });

  it("shows the full 100 MP build time for the 6th beacon", () => {
    const { completesAt, now } = completesAtFor(5);
    expect(completesAt - now).toBeGreaterThanOrEqual(100_000);
  });
});

describe("optimistic structure removal window", () => {
  it("predicts the server's 0.5s-per-manpower removal window, starting now", () => {
    const tiles = new Map<string, Tile>([["12,18", baseTile({
      ownerId: "me", ownershipState: "SETTLED",
      economicStructure: { ownerId: "me", type: "MINTWORKS", status: "active" }
    })]]);
    const state = {
      me: "me", selected: undefined, techIds: [], tiles, tilesRevision: 0,
      tilesRevisionChangedKeys: new Set<string>(), tilesRevisionOverflowed: false, discoveredTiles: new Set<string>(),
      settleProgressByTile: new Map<string, unknown>(), optimisticTileSnapshots: new Map<string, Tile | undefined>(),
      frontierLateAckUntilByTarget: new Map<string, number>()
    } as any;
    const { applyOptimisticStructureRemoval } = createClientOptimisticStateController({
      state, keyFor: (x, y) => `${x},${y}`, terrainAt: () => "LAND", tileVisibilityStateAt: () => "visible", optimisticEnabled: true
    });
    applyOptimisticStructureRemoval(12, 18);
    const removing = state.tiles.get("12,18").economicStructure;
    expect(removing.status).toBe("removing");
    expect(removing.completesAt - removing.startedAt).toBe(structureRemovalDurationMs("MINTWORKS"));
  });
});

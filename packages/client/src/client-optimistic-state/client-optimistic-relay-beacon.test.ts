import { describe, expect, it } from "vitest";

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

  it("shows the full hour for the 6th beacon", () => {
    const { completesAt, now } = completesAtFor(5);
    expect(completesAt - now).toBeGreaterThanOrEqual(3_600_000);
  });
});

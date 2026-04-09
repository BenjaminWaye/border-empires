import { describe, expect, it } from "vitest";

import { createClientOptimisticStateController } from "./client-optimistic-state.js";
import type { Tile } from "./client-types.js";

const baseTile = (overrides: Partial<Tile> = {}): Tile => ({
  x: 12,
  y: 18,
  terrain: "LAND",
  fogged: false,
  ...overrides
});

describe("client optimistic state", () => {
  it("keeps authoritative settled ownership when a settlement timer is still active locally", () => {
    const state = {
      me: "me",
      selected: undefined,
      tiles: new Map<string, Tile>([["12,18", baseTile({ ownerId: "me", ownershipState: "FRONTIER", optimisticPending: "settle" })]]),
      settleProgressByTile: new Map([
        [
          "12,18",
          {
            startAt: Date.now() - 1_000,
            resolvesAt: Date.now() + 10_000,
            target: { x: 12, y: 18 },
            awaitingServerConfirm: false
          }
        ]
      ]),
      optimisticTileSnapshots: new Map<string, Tile | undefined>()
    } as any;

    const { mergeServerTileWithOptimisticState } = createClientOptimisticStateController({
      state,
      keyFor: (x, y) => `${x},${y}`,
      terrainAt: () => "LAND",
      tileVisibilityStateAt: () => "visible"
    });

    const merged = mergeServerTileWithOptimisticState(baseTile({ ownerId: "me", ownershipState: "SETTLED" }));

    expect(merged.ownerId).toBe("me");
    expect(merged.ownershipState).toBe("SETTLED");
    expect(merged.optimisticPending).toBeUndefined();
  });

  it("stops preserving optimistic frontier ownership after the action is no longer in flight", () => {
    const state = {
      me: "me",
      selected: undefined,
      actionInFlight: false,
      actionTargetKey: "",
      tiles: new Map<string, Tile>([["12,18", baseTile({ ownerId: "me", ownershipState: "FRONTIER", optimisticPending: "expand" })]]),
      settleProgressByTile: new Map<string, unknown>(),
      optimisticTileSnapshots: new Map<string, Tile | undefined>()
    } as any;

    const { mergeServerTileWithOptimisticState } = createClientOptimisticStateController({
      state,
      keyFor: (x, y) => `${x},${y}`,
      terrainAt: () => "LAND",
      tileVisibilityStateAt: () => "visible"
    });

    const incoming = { ...baseTile() } as Tile & { ownerId?: string; ownershipState?: Tile["ownershipState"] };
    delete incoming.ownerId;
    delete incoming.ownershipState;
    const merged = mergeServerTileWithOptimisticState(incoming);

    expect(merged.ownerId).toBeUndefined();
    expect(merged.ownershipState).toBeUndefined();
    expect(merged.optimisticPending).toBeUndefined();
  });
});

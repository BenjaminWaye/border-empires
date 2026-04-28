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
      optimisticTileSnapshots: new Map<string, Tile | undefined>(),
      frontierLateAckUntilByTarget: new Map<string, number>()
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
      optimisticTileSnapshots: new Map<string, Tile | undefined>(),
      frontierLateAckUntilByTarget: new Map<string, number>()
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

  it("keeps server-authoritative ownership state when a same-owner frontier downgrade arrives", () => {
    const existing = baseTile({
      ownerId: "me",
      ownershipState: "SETTLED",
      detailLevel: "full",
      town: {
        type: "MARKET",
        baseGoldPerMinute: 1,
        supportCurrent: 0,
        supportMax: 2,
        goldPerMinute: 1,
        cap: 20,
        isFed: true,
        population: 10,
        maxPopulation: 20,
        populationTier: "SETTLEMENT",
        connectedTownCount: 0,
        connectedTownBonus: 0,
        hasMarket: false,
        marketActive: false,
        hasGranary: false,
        granaryActive: false,
        hasBank: false,
        bankActive: false
      }
    });
    const state = {
      me: "me",
      selected: undefined,
      tiles: new Map<string, Tile>([["12,18", existing]]),
      settleProgressByTile: new Map<string, unknown>(),
      optimisticTileSnapshots: new Map<string, Tile | undefined>(),
      frontierLateAckUntilByTarget: new Map<string, number>()
    } as any;

    const { mergeServerTileWithOptimisticState } = createClientOptimisticStateController({
      state,
      keyFor: (x, y) => `${x},${y}`,
      terrainAt: () => "LAND",
      tileVisibilityStateAt: () => "visible"
    });

    const merged = mergeServerTileWithOptimisticState(
      baseTile({
        ownerId: "me",
        ownershipState: "FRONTIER"
      })
    );

    expect(merged).not.toBe(existing);
    expect(merged.ownershipState).toBe("FRONTIER");
  });

  it("preserves tile upkeep entries when a summary delta arrives after full detail", () => {
    const existing = baseTile({
      ownerId: "me",
      ownershipState: "SETTLED",
      detailLevel: "full",
      upkeepEntries: [
        { label: "Settled land", perMinute: { GOLD: 0.04 } },
        { label: "Fort", perMinute: { GOLD: 1, IRON: 0.025 } }
      ]
    });
    const state = {
      me: "me",
      selected: undefined,
      tiles: new Map<string, Tile>([["12,18", existing]]),
      settleProgressByTile: new Map<string, unknown>(),
      optimisticTileSnapshots: new Map<string, Tile | undefined>(),
      frontierLateAckUntilByTarget: new Map<string, number>()
    } as any;

    const { mergeIncomingTileDetail } = createClientOptimisticStateController({
      state,
      keyFor: (x, y) => `${x},${y}`,
      terrainAt: () => "LAND",
      tileVisibilityStateAt: () => "visible"
    });

    const merged = mergeIncomingTileDetail(existing, baseTile({ ownerId: "me", ownershipState: "SETTLED", detailLevel: "summary" }));

    expect(merged.detailLevel).toBe("full");
    expect(merged.upkeepEntries).toEqual(existing.upkeepEntries);
  });

  it("preserves shard sites when a summary chunk omits shard detail after ownership changes", () => {
    const existing = baseTile({
      ownerId: "me",
      ownershipState: "FRONTIER",
      detailLevel: "summary",
      shardSite: { kind: "CACHE", amount: 2 }
    });
    const state = {
      me: "me",
      selected: undefined,
      tiles: new Map<string, Tile>([["12,18", existing]]),
      settleProgressByTile: new Map<string, unknown>(),
      optimisticTileSnapshots: new Map<string, Tile | undefined>(),
      frontierLateAckUntilByTarget: new Map<string, number>()
    } as any;

    const { mergeIncomingTileDetail } = createClientOptimisticStateController({
      state,
      keyFor: (x, y) => `${x},${y}`,
      terrainAt: () => "LAND",
      tileVisibilityStateAt: () => "visible"
    });

    const merged = mergeIncomingTileDetail(
      existing,
      baseTile({ ownerId: "me", ownershipState: "FRONTIER", detailLevel: "summary" })
    );

    expect(merged.detailLevel).toBe("summary");
    expect(merged.shardSite).toEqual(existing.shardSite);
  });

  it("does not preserve optimistic frontier ownership during late-ack wait windows", () => {
    const state = {
      me: "me",
      selected: undefined,
      actionInFlight: false,
      actionTargetKey: "",
      actionCurrent: undefined,
      tiles: new Map<string, Tile>([["12,18", baseTile({ ownerId: "me", ownershipState: "FRONTIER", optimisticPending: "expand" })]]),
      settleProgressByTile: new Map<string, unknown>(),
      optimisticTileSnapshots: new Map<string, Tile | undefined>(),
      frontierLateAckUntilByTarget: new Map<string, number>([["12,18", Date.now() + 10_000]])
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

  it("does not preserve a neutral in-flight frontier target before the server accepts it", () => {
    const state = {
      me: "me",
      selected: undefined,
      actionInFlight: true,
      actionTargetKey: "12,18",
      actionCurrent: { x: 12, y: 18 },
      tiles: new Map<string, Tile>([["12,18", baseTile()]]),
      settleProgressByTile: new Map<string, unknown>(),
      optimisticTileSnapshots: new Map<string, Tile | undefined>(),
      frontierLateAckUntilByTarget: new Map<string, number>()
    } as any;

    const { shouldPreserveOptimisticExpandByKey } = createClientOptimisticStateController({
      state,
      keyFor: (x, y) => `${x},${y}`,
      terrainAt: () => "LAND",
      tileVisibilityStateAt: () => "visible"
    });

    expect(shouldPreserveOptimisticExpandByKey("12,18")).toBe(false);
  });
});

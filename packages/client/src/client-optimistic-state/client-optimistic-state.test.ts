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
        hasMintworks: false,
        mintworksActive: false,
        hasGranary: false,
        granaryActive: false,
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
        { label: "Fort", perMinute: { GOLD: 1, TITANIUM: 0.025 } }
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

  it("clears ownership (does not resurrect it) when a delta omits the deleted ownerId/ownershipState keys", () => {
    // Regression: a barbarian vacating a tile sends ownerId/ownershipState as
    // null; the delta caller resolves that by DELETING both keys from the tile
    // it hands to mergeIncomingTileDetail. The base { ...existing, ...incoming }
    // spread must not resurrect the previous barbarian owner.
    const existing = baseTile({
      x: 195,
      y: 296,
      ownerId: "barbarian-1",
      ownershipState: "SETTLED",
      detailLevel: "summary"
    });
    const state = {
      me: "me",
      selected: undefined,
      tiles: new Map<string, Tile>([["195,296", existing]]),
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

    const incoming = baseTile({ x: 195, y: 296, detailLevel: "summary" }) as Tile & {
      ownerId?: string;
      ownershipState?: Tile["ownershipState"];
    };
    delete incoming.ownerId;
    delete incoming.ownershipState;

    const merged = mergeIncomingTileDetail(existing, incoming);

    expect(merged.ownerId).toBeUndefined();
    expect(merged.ownershipState).toBeUndefined();
    expect("ownerId" in merged).toBe(false);
    expect("ownershipState" in merged).toBe(false);
  });

  it("clears reachOwnerId (does not resurrect it) when a delta omits the deleted key, same as ownerId", () => {
    // reachOwnerId is emitted by the sim as an always-present key exactly like
    // ownerId, so it needs the same clear-reassertion the test above covers.
    const existing = baseTile({ x: 195, y: 296, reachOwnerId: "rival-1", detailLevel: "summary" });
    const state = { me: "me", selected: undefined, tiles: new Map<string, Tile>([["195,296", existing]]), settleProgressByTile: new Map<string, unknown>(), optimisticTileSnapshots: new Map<string, Tile | undefined>(), frontierLateAckUntilByTarget: new Map<string, number>() } as any;
    const { mergeIncomingTileDetail } = createClientOptimisticStateController({ state, keyFor: (x, y) => `${x},${y}`, terrainAt: () => "LAND", tileVisibilityStateAt: () => "visible" });
    const incoming = baseTile({ x: 195, y: 296, detailLevel: "summary" }) as Tile & { reachOwnerId?: string };
    delete incoming.reachOwnerId;

    const merged = mergeIncomingTileDetail(existing, incoming);

    expect(merged.reachOwnerId).toBeUndefined();
    expect("reachOwnerId" in merged).toBe(false);
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

  it("discards optimistic ownership when server clears a tile during an active expand action (encirclement)", () => {
    const state = {
      me: "me",
      selected: undefined,
      actionInFlight: true,
      actionTargetKey: "12,18",
      tiles: new Map<string, Tile>([["12,18", baseTile({ ownerId: "me", ownershipState: "FRONTIER", optimisticPending: "expand" })]]),
      settleProgressByTile: new Map<string, unknown>(),
      optimisticTileSnapshots: new Map<string, Tile | undefined>(),
      frontierLateAckUntilByTarget: new Map<string, number>()
    } as any;

    const { mergeServerTileWithOptimisticState } = createClientOptimisticStateController({
      state,
      keyFor: (x, y) => `${x},${y}`,
      terrainAt: () => "LAND",
      tileVisibilityStateAt: () => "visible",
      optimisticEnabled: true
    });

    const incoming = { ...baseTile() } as Tile & { ownerId?: string; ownershipState?: Tile["ownershipState"] };
    delete incoming.ownerId;
    delete incoming.ownershipState;
    const merged = mergeServerTileWithOptimisticState(incoming);

    expect(merged.ownerId).toBeUndefined();
    expect(merged.ownershipState).toBeUndefined();
    expect(merged.optimisticPending).toBeUndefined();
  });

  it("discards optimistic ownership when server clears a tile during a late-ack window (encirclement)", () => {
    const state = {
      me: "me",
      selected: undefined,
      actionInFlight: false,
      actionTargetKey: "",
      tiles: new Map<string, Tile>([["12,18", baseTile({ ownerId: "me", ownershipState: "FRONTIER", optimisticPending: "expand" })]]),
      settleProgressByTile: new Map<string, unknown>(),
      optimisticTileSnapshots: new Map<string, Tile | undefined>(),
      frontierLateAckUntilByTarget: new Map<string, number>([["12,18", Date.now() + 10_000]])
    } as any;

    const { mergeServerTileWithOptimisticState } = createClientOptimisticStateController({
      state,
      keyFor: (x, y) => `${x},${y}`,
      terrainAt: () => "LAND",
      tileVisibilityStateAt: () => "visible",
      optimisticEnabled: true
    });

    const incoming = { ...baseTile() } as Tile & { ownerId?: string; ownershipState?: Tile["ownershipState"] };
    delete incoming.ownerId;
    delete incoming.ownershipState;
    const merged = mergeServerTileWithOptimisticState(incoming);

    expect(merged.ownerId).toBeUndefined();
    expect(merged.ownershipState).toBeUndefined();
    expect(merged.optimisticPending).toBeUndefined();
  });

  it("bumps tilesRevision when optimistic state changes ownershipState", () => {
    const state = {
      me: "me",
      selected: undefined,
      tilesRevision: 0,
      tilesRevisionChangedKeys: new Set<string>(),
      tilesRevisionOverflowed: false,
      tiles: new Map<string, Tile>([["12,18", baseTile({ ownerId: "me", ownershipState: "FRONTIER", optimisticPending: "settle" })]]),
      settledTiles: new Set<string>(),
      discoveredTiles: new Set<string>(),
      settleProgressByTile: new Map<string, unknown>(),
      optimisticTileSnapshots: new Map<string, Tile | undefined>(),
      frontierLateAckUntilByTarget: new Map<string, number>()
    } as any;

    const { applyOptimisticTileState } = createClientOptimisticStateController({
      state,
      keyFor: (x, y) => `${x},${y}`,
      terrainAt: () => "LAND",
      tileVisibilityStateAt: () => "visible",
      optimisticEnabled: true
    });

    const revisionBefore = state.tilesRevision;
    applyOptimisticTileState(12, 18, (tile) => {
      tile.ownershipState = "SETTLED";
    });

    expect(state.tilesRevision).toBeGreaterThan(revisionBefore);
    expect(state.tiles.get("12,18")?.ownershipState).toBe("SETTLED");
  });

  it("bumps tilesRevision when optimistic state changes ownerId", () => {
    const state = {
      me: "me",
      selected: undefined,
      tilesRevision: 0,
      tilesRevisionChangedKeys: new Set<string>(),
      tilesRevisionOverflowed: false,
      tiles: new Map<string, Tile>([["12,18", baseTile()]]),
      settledTiles: new Set<string>(),
      discoveredTiles: new Set<string>(),
      settleProgressByTile: new Map<string, unknown>(),
      optimisticTileSnapshots: new Map<string, Tile | undefined>(),
      frontierLateAckUntilByTarget: new Map<string, number>()
    } as any;

    const { applyOptimisticTileState } = createClientOptimisticStateController({
      state,
      keyFor: (x, y) => `${x},${y}`,
      terrainAt: () => "LAND",
      tileVisibilityStateAt: () => "visible",
      optimisticEnabled: true
    });

    const revisionBefore = state.tilesRevision;
    applyOptimisticTileState(12, 18, (tile) => {
      tile.ownerId = "me";
      tile.ownershipState = "FRONTIER";
    });

    expect(state.tilesRevision).toBeGreaterThan(revisionBefore);
  });

  it("bumps tilesRevision when settle starts on an already-owned frontier tile (optimisticPending set, owner/state unchanged)", () => {
    // Regression: pressing settle on a frontier tile you already own doesn't
    // change ownerId or ownershipState (both stay "me"/"FRONTIER" until the
    // server confirms) -- only optimisticPending flips to "settle". The 3D
    // map's terrain rebuild is gated on tilesRevision, so without this bump
    // the settle overlay animation never renders until something else (like
    // panning the camera) happens to bump tilesRevision.
    const state = {
      me: "me",
      selected: undefined,
      tilesRevision: 0,
      tilesRevisionChangedKeys: new Set<string>(),
      tilesRevisionOverflowed: false,
      tiles: new Map<string, Tile>([["12,18", baseTile({ ownerId: "me", ownershipState: "FRONTIER" })]]),
      settledTiles: new Set<string>(),
      discoveredTiles: new Set<string>(),
      settleProgressByTile: new Map<string, unknown>(),
      optimisticTileSnapshots: new Map<string, Tile | undefined>(),
      frontierLateAckUntilByTarget: new Map<string, number>()
    } as any;

    const { applyOptimisticTileState } = createClientOptimisticStateController({
      state,
      keyFor: (x, y) => `${x},${y}`,
      terrainAt: () => "LAND",
      tileVisibilityStateAt: () => "visible",
      optimisticEnabled: true
    });

    const revisionBefore = state.tilesRevision;
    applyOptimisticTileState(12, 18, (tile) => {
      tile.ownerId = "me";
      tile.ownershipState = "FRONTIER";
      tile.fogged = false;
      tile.optimisticPending = "settle";
    });

    expect(state.tilesRevision).toBeGreaterThan(revisionBefore);
    expect(state.tiles.get("12,18")?.optimisticPending).toBe("settle");
  });

  it("does not bump tilesRevision when optimistic state changes only non-ownership fields", () => {
    const state = {
      me: "me",
      selected: undefined,
      tilesRevision: 0,
      tilesRevisionChangedKeys: new Set<string>(),
      tilesRevisionOverflowed: false,
      tiles: new Map<string, Tile>([["12,18", baseTile({ ownerId: "me", ownershipState: "SETTLED" })]]),
      settledTiles: new Set<string>(),
      discoveredTiles: new Set<string>(),
      settleProgressByTile: new Map<string, unknown>(),
      optimisticTileSnapshots: new Map<string, Tile | undefined>(),
      frontierLateAckUntilByTarget: new Map<string, number>()
    } as any;

    const { applyOptimisticTileState } = createClientOptimisticStateController({
      state,
      keyFor: (x, y) => `${x},${y}`,
      terrainAt: () => "LAND",
      tileVisibilityStateAt: () => "visible",
      optimisticEnabled: true
    });

    const revisionBefore = state.tilesRevision;
    applyOptimisticTileState(12, 18, (tile) => {
      tile.fogged = true;
    });

    expect(state.tilesRevision).toBe(revisionBefore);
  });
});

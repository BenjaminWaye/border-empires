import { describe, expect, it } from "vitest";
import type { DomainTileState } from "@border-empires/game-domain";
import {
  AUTO_SETTLE_ELIGIBLE_FRONTIER_CAP_PER_PLAYER,
  drainEligibleFrontierQueue,
  eligibleFrontierCountForOwner,
  evaluateAndAttemptSettle,
  evaluateTileEligibility,
  hasGrownTownSupportRing,
  insertEligibleFrontierTile,
  isFrontierTileQueued,
  orderedEligibleFrontierTiles,
  popNextEligibleFrontierTile,
  reconcileEligibleFrontierQueueForOwner,
  removeEligibleFrontierTile,
  seedEligibleFrontierQueueForOwner,
  seedGrownTownSupportRingForTownTile,
  syncTownSupportRingForTileChange,
  type EligibleFrontierByOwner,
  type EvaluateTileEligibilityDeps,
  type GrownTownSupportRingByOwner,
  type SettleAttemptContext
} from "./runtime-auto-settle-eligibility.js";

const tile = (overrides: Partial<DomainTileState> & { x: number; y: number }): DomainTileState => ({
  terrain: "LAND",
  ...overrides
});

describe("eligibleFrontierByOwner: bounded insertion-ordered queue", () => {
  it("caps insertion at AUTO_SETTLE_ELIGIBLE_FRONTIER_CAP_PER_PLAYER, dropping the rest silently", () => {
    const map: EligibleFrontierByOwner = new Map();
    for (let i = 0; i < AUTO_SETTLE_ELIGIBLE_FRONTIER_CAP_PER_PLAYER + 5; i += 1) {
      insertEligibleFrontierTile(map, "p1", `${i},0`);
    }
    expect(eligibleFrontierCountForOwner(map, "p1")).toBe(AUTO_SETTLE_ELIGIBLE_FRONTIER_CAP_PER_PLAYER);
    expect(isFrontierTileQueued(map, "p1", "0,0")).toBe(true);
    expect(isFrontierTileQueued(map, "p1", `${AUTO_SETTLE_ELIGIBLE_FRONTIER_CAP_PER_PLAYER + 4},0`)).toBe(false);
  });

  it("preserves insertion order and pops the earliest-inserted entry first", () => {
    const map: EligibleFrontierByOwner = new Map();
    insertEligibleFrontierTile(map, "p1", "1,1");
    insertEligibleFrontierTile(map, "p1", "2,2");
    insertEligibleFrontierTile(map, "p1", "3,3");
    expect(orderedEligibleFrontierTiles(map, "p1")).toEqual([{ x: 1, y: 1 }, { x: 2, y: 2 }, { x: 3, y: 3 }]);
    expect(popNextEligibleFrontierTile(map, "p1")).toBe("1,1");
    expect(orderedEligibleFrontierTiles(map, "p1")).toEqual([{ x: 2, y: 2 }, { x: 3, y: 3 }]);
  });

  it("removeEligibleFrontierTile is a no-op for an owner/tile not present", () => {
    const map: EligibleFrontierByOwner = new Map();
    expect(() => removeEligibleFrontierTile(map, "nobody", "1,1")).not.toThrow();
  });
});

describe("grownTownSupportRingByOwner: refcounted ring index", () => {
  it("two overlapping town rings both keep a shared tile covered until BOTH are removed", () => {
    const tiles = new Map<string, DomainTileState>();
    tiles.set("10,10", tile({ x: 10, y: 10, ownerId: "p1", ownershipState: "SETTLED", town: { populationTier: "TOWN" } as never }));
    tiles.set("11,10", tile({ x: 11, y: 10, ownerId: "p1", ownershipState: "SETTLED", town: { populationTier: "TOWN" } as never }));
    tiles.set("11,11", tile({ x: 11, y: 11 })); // shared support tile, radius 1 of both towns

    const map: GrownTownSupportRingByOwner = new Map();
    seedGrownTownSupportRingForTownTile(map, tiles.get("10,10")!, tiles);
    seedGrownTownSupportRingForTownTile(map, tiles.get("11,10")!, tiles);
    expect(hasGrownTownSupportRing(map, "p1", "11,11")).toBe(true);

    // Losing town at (10,10) (demolished/captured away) must not evict the
    // still-covered tile -- (11,10)'s ring still reaches it.
    const deltasAfterRemoveOne = syncTownSupportRingForTileChange({
      tileKey: "10,10",
      previous: tiles.get("10,10"),
      next: tile({ x: 10, y: 10, ownerId: "p1", ownershipState: "FRONTIER" }),
      tiles,
      grownTownSupportRingByOwner: map
    });
    expect(deltasAfterRemoveOne).toEqual([]);
    expect(hasGrownTownSupportRing(map, "p1", "11,11")).toBe(true);

    syncTownSupportRingForTileChange({
      tileKey: "11,10",
      previous: tiles.get("11,10"),
      next: tile({ x: 11, y: 10, ownerId: "p1", ownershipState: "FRONTIER" }),
      tiles,
      grownTownSupportRingByOwner: map
    });
    expect(hasGrownTownSupportRing(map, "p1", "11,11")).toBe(false);
  });

  it("regression: town capture removes the old owner's ring immediately, then grants the new owner's ring once the captured anchor auto-settles", () => {
    // Mirrors the two real production write sites this crosses: (1) capture
    // itself -- runtime-lock-resolution.ts's replaceTileState call, which
    // lands the tile FRONTIER-owned-by-new-owner (so no ring yet, but the
    // OLD owner's ring must drop immediately); (2) the captured anchor's
    // later auto-settle completion -- resolvePendingSettlement's own
    // replaceTileState call, which is what actually grants the NEW owner's
    // ring once the tile reaches SETTLED.
    const tiles = new Map<string, DomainTileState>();
    for (let dx = -1; dx <= 1; dx += 1) {
      for (let dy = -1; dy <= 1; dy += 1) {
        if (dx === 0 && dy === 0) continue;
        tiles.set(`${30 + dx},${30 + dy}`, tile({ x: 30 + dx, y: 30 + dy }));
      }
    }
    const ownedByDefender = tile({ x: 30, y: 30, ownerId: "defender", ownershipState: "SETTLED", town: { populationTier: "TOWN" } as never });
    tiles.set("30,30", ownedByDefender);
    const map: GrownTownSupportRingByOwner = new Map();
    seedGrownTownSupportRingForTownTile(map, ownedByDefender, tiles);
    expect(hasGrownTownSupportRing(map, "defender", "31,30")).toBe(true);

    // (1) Capture: replaceTileState lands it FRONTIER-owned-by-attacker.
    const capturedFrontier = tile({ x: 30, y: 30, ownerId: "attacker", ownershipState: "FRONTIER", town: { populationTier: "TOWN" } as never });
    tiles.set("30,30", capturedFrontier);
    const captureDeltas = syncTownSupportRingForTileChange({
      tileKey: "30,30",
      previous: ownedByDefender,
      next: capturedFrontier,
      tiles,
      grownTownSupportRingByOwner: map
    });
    expect(captureDeltas).toEqual([]); // not SETTLED yet -- no new ring granted
    expect(hasGrownTownSupportRing(map, "defender", "31,30")).toBe(false); // stale eligibility removed
    expect(hasGrownTownSupportRing(map, "attacker", "31,30")).toBe(false); // not granted yet

    // (2) Auto-settle completion: resolvePendingSettlement's replaceTileState flips it to SETTLED.
    const settled = tile({ x: 30, y: 30, ownerId: "attacker", ownershipState: "SETTLED", town: { populationTier: "TOWN" } as never });
    tiles.set("30,30", settled);
    const settleDeltas = syncTownSupportRingForTileChange({
      tileKey: "30,30",
      previous: capturedFrontier,
      next: settled,
      tiles,
      grownTownSupportRingByOwner: map
    });
    expect(settleDeltas).toHaveLength(1);
    expect(settleDeltas[0]).toEqual({ ownerId: "attacker", newlyCoveredTileKeys: expect.arrayContaining(["31,30"]) });
    expect(hasGrownTownSupportRing(map, "attacker", "31,30")).toBe(true);
  });

  it("a tier upgrade that widens the ring (TOWN -> GREAT_CITY) reports the newly-covered tile keys", () => {
    const tiles = new Map<string, DomainTileState>();
    for (let dx = -2; dx <= 2; dx += 1) {
      for (let dy = -2; dy <= 2; dy += 1) {
        if (dx === 0 && dy === 0) continue;
        tiles.set(`${20 + dx},${20 + dy}`, tile({ x: 20 + dx, y: 20 + dy }));
      }
    }
    const before = tile({ x: 20, y: 20, ownerId: "p1", ownershipState: "SETTLED", town: { populationTier: "TOWN" } as never });
    const after = tile({ x: 20, y: 20, ownerId: "p1", ownershipState: "SETTLED", town: { populationTier: "GREAT_CITY" } as never });
    tiles.set("20,20", before);

    const map: GrownTownSupportRingByOwner = new Map();
    seedGrownTownSupportRingForTownTile(map, before, tiles);
    expect(hasGrownTownSupportRing(map, "p1", "22,20")).toBe(false); // radius-2 not covered yet

    tiles.set("20,20", after);
    const deltas = syncTownSupportRingForTileChange({ tileKey: "20,20", previous: before, next: after, tiles, grownTownSupportRingByOwner: map });
    expect(deltas).toHaveLength(1);
    expect(deltas[0]!.ownerId).toBe("p1");
    expect(deltas[0]!.newlyCoveredTileKeys).toContain("22,20");
    expect(hasGrownTownSupportRing(map, "p1", "22,20")).toBe(true);
  });
});

const alwaysEligibleDeps = (): EvaluateTileEligibilityDeps => ({
  getTile: () => tile({ x: 1, y: 1, ownerId: "p1", ownershipState: "FRONTIER", dockId: "dock-1" }),
  isBlocked: () => false,
  isInReach: () => true,
  isRevealedToPlayer: () => true,
  hasTownSupport: () => true
});

describe("evaluateTileEligibility", () => {
  it("returns false when isBlocked, without even reading the tile", () => {
    let getTileCalls = 0;
    const deps: EvaluateTileEligibilityDeps = {
      ...alwaysEligibleDeps(),
      isBlocked: () => true,
      getTile: () => { getTileCalls += 1; return undefined; }
    };
    expect(evaluateTileEligibility("1,1", "p1", deps)).toBe(false);
    expect(getTileCalls).toBe(0);
  });

  it("a town/dock tile is eligible even when out of reach (reach gate exemption)", () => {
    const deps: EvaluateTileEligibilityDeps = { ...alwaysEligibleDeps(), isInReach: () => false };
    expect(evaluateTileEligibility("1,1", "p1", deps)).toBe(true);
  });
});

const buildSettleCtx = (overrides: Partial<SettleAttemptContext> = {}): SettleAttemptContext & { started: string[] } => {
  const started: string[] = [];
  const ctx: SettleAttemptContext = {
    getTile: () => tile({ x: 5, y: 5, ownerId: "p1", ownershipState: "FRONTIER" }),
    isBlocked: () => false,
    isInReach: () => true,
    settleRejectionForActor: () => false,
    hasAvailableDevelopmentSlot: () => true,
    startSettlementProcess: (input) => { started.push(input.targetKey); },
    nextCommandId: (playerId, tileKey) => `cmd:${playerId}:${tileKey}`,
    now: () => 1_000,
    ...overrides
  };
  return Object.assign(ctx, { started });
};

describe("evaluateAndAttemptSettle / attemptImmediateSettle", () => {
  it("starts settlement immediately when a dev slot is free, without queuing", () => {
    const map: EligibleFrontierByOwner = new Map();
    const ctx = buildSettleCtx();
    evaluateAndAttemptSettle(map, "p1", "5,5", alwaysEligibleDeps(), ctx);
    expect(ctx.started).toEqual(["5,5"]);
    expect(eligibleFrontierCountForOwner(map, "p1")).toBe(0);
  });

  it("queues instead of settling when no dev slot is free", () => {
    const map: EligibleFrontierByOwner = new Map();
    const ctx = buildSettleCtx({ hasAvailableDevelopmentSlot: () => false });
    evaluateAndAttemptSettle(map, "p1", "5,5", alwaysEligibleDeps(), ctx);
    expect(ctx.started).toEqual([]);
    expect(isFrontierTileQueued(map, "p1", "5,5")).toBe(true);
  });

  it("does nothing (no start, no queue) when the tile is no longer eligible", () => {
    const map: EligibleFrontierByOwner = new Map();
    const ctx = buildSettleCtx();
    evaluateAndAttemptSettle(map, "p1", "5,5", { ...alwaysEligibleDeps(), isBlocked: () => true }, ctx);
    expect(ctx.started).toEqual([]);
    expect(eligibleFrontierCountForOwner(map, "p1")).toBe(0);
  });
});

describe("drainEligibleFrontierQueue", () => {
  it("drains queued tiles while a dev slot stays free, stopping once slots run out", () => {
    const map: EligibleFrontierByOwner = new Map();
    insertEligibleFrontierTile(map, "p1", "5,5");
    insertEligibleFrontierTile(map, "p1", "6,6");
    let slotsLeft = 1;
    const ctx = buildSettleCtx({
      getTile: (tileKey) => {
        const [x, y] = tileKey.split(",").map(Number);
        return tile({ x, y, ownerId: "p1", ownershipState: "FRONTIER" });
      },
      hasAvailableDevelopmentSlot: () => slotsLeft > 0,
      startSettlementProcess: (input) => { ctx.started.push(input.targetKey); slotsLeft -= 1; }
    });
    const settledCount = drainEligibleFrontierQueue(map, "p1", ctx);
    expect(settledCount).toBe(1);
    expect(ctx.started).toEqual(["5,5"]);
    // The un-drained tile stays queued for the next drain/tick.
    expect(isFrontierTileQueued(map, "p1", "6,6")).toBe(true);
  });
});

describe("reconcileEligibleFrontierQueueForOwner", () => {
  it("is a no-op when the queue already has entries", () => {
    const map: EligibleFrontierByOwner = new Map();
    insertEligibleFrontierTile(map, "p1", "1,1");
    const inserted = reconcileEligibleFrontierQueueForOwner(map, "p1", ["2,2"], alwaysEligibleDeps());
    expect(inserted).toBe(0);
    expect(isFrontierTileQueued(map, "p1", "2,2")).toBe(false);
  });

  it("scans and inserts newly-eligible frontier tiles when the queue is empty (missed-hook safety net)", () => {
    const map: EligibleFrontierByOwner = new Map();
    const inserted = reconcileEligibleFrontierQueueForOwner(map, "p1", ["1,1", "2,2"], alwaysEligibleDeps());
    expect(inserted).toBe(2);
    expect(isFrontierTileQueued(map, "p1", "1,1")).toBe(true);
    expect(isFrontierTileQueued(map, "p1", "2,2")).toBe(true);
  });

  it("caps the scan at scanBudget, never touching the whole frontier", () => {
    const map: EligibleFrontierByOwner = new Map();
    const frontierKeys = Array.from({ length: 500 }, (_, i) => `${i},0`);
    let scanned = 0;
    const deps: EvaluateTileEligibilityDeps = {
      ...alwaysEligibleDeps(),
      isBlocked: (tileKey) => { scanned += 1; return false; }
    };
    reconcileEligibleFrontierQueueForOwner(map, "p1", frontierKeys, deps, 10);
    expect(scanned).toBe(10);
  });
});

describe("seedEligibleFrontierQueueForOwner (boot-time cold rebuild)", () => {
  it("stops inserting once the cap is reached, even with more eligible frontier tiles", () => {
    const map: EligibleFrontierByOwner = new Map();
    const frontierKeys = Array.from({ length: AUTO_SETTLE_ELIGIBLE_FRONTIER_CAP_PER_PLAYER + 10 }, (_, i) => `${i},0`);
    seedEligibleFrontierQueueForOwner(map, "p1", frontierKeys, alwaysEligibleDeps());
    expect(eligibleFrontierCountForOwner(map, "p1")).toBe(AUTO_SETTLE_ELIGIBLE_FRONTIER_CAP_PER_PLAYER);
  });
});

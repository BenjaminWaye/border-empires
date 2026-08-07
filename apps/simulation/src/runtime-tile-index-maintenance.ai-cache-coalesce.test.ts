import { describe, expect, it } from "vitest";
import type { DomainTileState } from "@border-empires/game-domain";

import { refreshEconomyCachesForTileChange } from "./runtime-tile-index-maintenance.js";
import type { RuntimePlayer } from "./runtime-types.js";

/**
 * 2026-07-29 login-stall investigation: AI players settle/expand continuously
 * with no live subscriber, so deleting economySnapshotCacheByPlayer /
 * defensibilityMetricsCacheByPlayer on every single tile mutation forced a
 * fresh O(settled-tiles) rebuild on nearly every command. This pins the fix's
 * two load-bearing invariants:
 *   - AI-owned mutations mark the player dirty and keep serving the existing
 *     cache entry (no delete) so cachedEconomySnapshot/cachedDefensibilityMetrics
 *     can coalesce the rebuild.
 *   - Human-owned mutations are completely untouched: the cache entry is still
 *     deleted immediately, so a human always sees their own action reflected
 *     without delay.
 */

const player = (id: string, isAi: boolean): RuntimePlayer => ({
  id,
  isAi,
  points: 0,
  manpower: 0,
  techIds: new Set<string>(),
  domainIds: new Set<string>(),
  mods: { attack: 1, defense: 1, income: 1, vision: 1 },
  techRootId: "rewrite-local",
  allies: new Set<string>()
});

const settledTile = (ownerId: string): DomainTileState => ({
  x: 5, y: 5, terrain: "LAND", ownerId, ownershipState: "SETTLED"
});

const buildInput = (players: RuntimePlayer[]) => ({
  players: new Map(players.map((p) => [p.id, p] as const)),
  economySnapshotCacheByPlayer: new Map<string, { incomePerMinute: number }>(),
  tileYieldContextCacheByPlayer: new Map(),
  townNetworkCacheByPlayer: new Map(),
  townConnectivityStateByPlayer: new Map(),
  defensibilityMetricsCacheByPlayer: new Map<string, { T: number; E: number; Ts: number; Es: number }>(),
  upkeepAccrualCacheByPlayer: new Map(),
  economySnapshotDirtyPlayerIds: new Set<string>(),
  defensibilityMetricsDirtyPlayerIds: new Set<string>(),
  resourceSlotSupplyCacheByPlayer: new Map<string, { FOOD: number }>(),
  resourceSlotDemandCacheByPlayer: new Map<string, { FOOD: number }>(),
  resourceSlotDormancyCacheByPlayer: new Map<string, { FOOD: Set<string> }>(),
  resourceSlotSupplyDirtyPlayerIds: new Set<string>(),
  resourceSlotDemandDirtyPlayerIds: new Set<string>(),
  resourceSlotDormancyDirtyPlayerIds: new Set<string>()
});

describe("refreshEconomyCachesForTileChange — AI cache coalescing", () => {
  it("marks an AI player dirty instead of deleting the cache entry", () => {
    const input = buildInput([player("ai-1", true)]);
    input.economySnapshotCacheByPlayer.set("ai-1", { incomePerMinute: 42 } as never);
    input.defensibilityMetricsCacheByPlayer.set("ai-1", { T: 1, E: 1, Ts: 1, Es: 1 });

    refreshEconomyCachesForTileChange({
      ...input,
      tileKey: "5,5",
      previous: undefined,
      next: settledTile("ai-1")
    });

    // Still present (not deleted) — the value is served as-is until the
    // coalesce window elapses at the Runtime layer.
    expect(input.economySnapshotCacheByPlayer.get("ai-1")).toEqual({ incomePerMinute: 42 });
    expect(input.defensibilityMetricsCacheByPlayer.get("ai-1")).toEqual({ T: 1, E: 1, Ts: 1, Es: 1 });
    // But flagged dirty so the next read knows a rebuild is owed eventually.
    expect(input.economySnapshotDirtyPlayerIds.has("ai-1")).toBe(true);
    expect(input.defensibilityMetricsDirtyPlayerIds.has("ai-1")).toBe(true);
  });

  it("still deletes a human player's cache entry immediately (unchanged behavior)", () => {
    const input = buildInput([player("human-1", false)]);
    input.economySnapshotCacheByPlayer.set("human-1", { incomePerMinute: 42 } as never);
    input.defensibilityMetricsCacheByPlayer.set("human-1", { T: 1, E: 1, Ts: 1, Es: 1 });

    refreshEconomyCachesForTileChange({
      ...input,
      tileKey: "5,5",
      previous: undefined,
      next: settledTile("human-1")
    });

    expect(input.economySnapshotCacheByPlayer.has("human-1")).toBe(false);
    expect(input.defensibilityMetricsCacheByPlayer.has("human-1")).toBe(false);
    // Dirty-set marking is an AI-only mechanism — humans never use it.
    expect(input.economySnapshotDirtyPlayerIds.has("human-1")).toBe(false);
    expect(input.defensibilityMetricsDirtyPlayerIds.has("human-1")).toBe(false);
  });

  it("extends the same dirty-marking to the three resource-slot caches for an AI player", () => {
    const input = buildInput([player("ai-3", true)]);
    input.resourceSlotSupplyCacheByPlayer.set("ai-3", { FOOD: 3 } as never);
    input.resourceSlotDemandCacheByPlayer.set("ai-3", { FOOD: 2 } as never);
    input.resourceSlotDormancyCacheByPlayer.set("ai-3", { FOOD: new Set() } as never);

    refreshEconomyCachesForTileChange({
      ...input,
      tileKey: "5,5",
      previous: undefined,
      next: settledTile("ai-3")
    });

    // Still present (not deleted) — same "serve stale, mark dirty" shape as
    // the economy/defensibility caches above, not the old immediate-delete.
    expect(input.resourceSlotSupplyCacheByPlayer.get("ai-3")).toEqual({ FOOD: 3 });
    expect(input.resourceSlotDemandCacheByPlayer.get("ai-3")).toEqual({ FOOD: 2 });
    expect(input.resourceSlotDormancyCacheByPlayer.has("ai-3")).toBe(true);
    expect(input.resourceSlotSupplyDirtyPlayerIds.has("ai-3")).toBe(true);
    expect(input.resourceSlotDemandDirtyPlayerIds.has("ai-3")).toBe(true);
    expect(input.resourceSlotDormancyDirtyPlayerIds.has("ai-3")).toBe(true);
  });

  it("still deletes a human player's resource-slot cache entries immediately", () => {
    const input = buildInput([player("human-2", false)]);
    input.resourceSlotSupplyCacheByPlayer.set("human-2", { FOOD: 3 } as never);
    input.resourceSlotDemandCacheByPlayer.set("human-2", { FOOD: 2 } as never);
    input.resourceSlotDormancyCacheByPlayer.set("human-2", { FOOD: new Set() } as never);

    refreshEconomyCachesForTileChange({
      ...input,
      tileKey: "5,5",
      previous: undefined,
      next: settledTile("human-2")
    });

    expect(input.resourceSlotSupplyCacheByPlayer.has("human-2")).toBe(false);
    expect(input.resourceSlotDemandCacheByPlayer.has("human-2")).toBe(false);
    expect(input.resourceSlotDormancyCacheByPlayer.has("human-2")).toBe(false);
    expect(input.resourceSlotSupplyDirtyPlayerIds.has("human-2")).toBe(false);
    expect(input.resourceSlotDemandDirtyPlayerIds.has("human-2")).toBe(false);
    expect(input.resourceSlotDormancyDirtyPlayerIds.has("human-2")).toBe(false);
  });

  it("repeated AI mutations only ever mark dirty, never re-deleting an already-absent entry", () => {
    const input = buildInput([player("ai-2", true)]);
    input.economySnapshotCacheByPlayer.set("ai-2", { incomePerMinute: 7 } as never);

    for (let i = 0; i < 5; i++) {
      refreshEconomyCachesForTileChange({
        ...input,
        tileKey: `${i},0`,
        previous: undefined,
        next: settledTile("ai-2")
      });
    }

    // Five rapid settles for the same AI player still leave the last-known
    // value intact and simply dirty — this is exactly the pattern that used
    // to force five full O(settled-tiles) rebuilds back to back.
    expect(input.economySnapshotCacheByPlayer.get("ai-2")).toEqual({ incomePerMinute: 7 });
    expect(input.economySnapshotDirtyPlayerIds.has("ai-2")).toBe(true);
  });
});

import { describe, expect, it } from "vitest";
import type { DomainTileState } from "@border-empires/game-domain";
import { economyRelevantTileFieldsChanged, refreshEconomyCachesForTileChange } from "./runtime-economy-cache-invalidation.js";
import type { RuntimePlayer } from "./runtime-types.js";

// Regression for the 2026-09-17 prod CPU-throttle incident: every tile
// write dropped the owner's economy / defensibility / resource-slot /
// manpower caches, including writes that only touched fields none of those
// caches read (muster flags on SET_MUSTER and every muster auto-fire tick,
// frontier-decay / heal / breach-shock stamps, shard sites). The next
// emitPlayerStateUpdate then rebuilt all of them for a 14k-tile empire with
// no change in any input (7% of sim-worker CPU in the prod profile).
const player = (id: string): RuntimePlayer => ({
  id,
  isAi: false,
  points: 0,
  manpower: 0,
  techIds: new Set<string>(),
  domainIds: new Set<string>(),
  mods: { attack: 1, defense: 1, income: 1, vision: 1 },
  techRootId: "rewrite-local",
  allies: new Set<string>()
});

const settledTile = (ownerId: string): DomainTileState => ({ x: 5, y: 5, terrain: "LAND", ownerId, ownershipState: "SETTLED" });

const buildInput = (players: RuntimePlayer[]) => ({
  players: new Map(players.map((p) => [p.id, p] as const)),
  economySnapshotCacheByPlayer: new Map<string, { incomePerMinute: number }>(),
  tileYieldContextCacheByPlayer: new Map(),
  townNetworkCacheByPlayer: new Map(),
  townConnectivityStateByPlayer: new Map(),
  defensibilityMetricsCacheByPlayer: new Map<string, { T: number; E: number; Ts: number; Es: number }>(),
  upkeepAccrualCacheByPlayer: new Map(),
  manpowerStructureBonusCacheByPlayer: new Map(),
  economySnapshotDirtyPlayerIds: new Set<string>(),
  defensibilityMetricsDirtyPlayerIds: new Set<string>(),
  resourceSlotSupplyCacheByPlayer: new Map<string, { FOOD: number }>(),
  resourceSlotDemandCacheByPlayer: new Map<string, { FOOD: number }>(),
  resourceSlotDormancyCacheByPlayer: new Map<string, { FOOD: Set<string> }>(),
  resourceSlotSupplyDirtyPlayerIds: new Set<string>(),
  resourceSlotDemandDirtyPlayerIds: new Set<string>(),
  resourceSlotDormancyDirtyPlayerIds: new Set<string>()
});

const warmAll = (input: ReturnType<typeof buildInput>, id: string): void => {
  input.economySnapshotCacheByPlayer.set(id, { incomePerMinute: 42 } as never);
  input.defensibilityMetricsCacheByPlayer.set(id, { T: 1, E: 1, Ts: 1, Es: 1 });
  input.resourceSlotSupplyCacheByPlayer.set(id, { FOOD: 4 } as never);
  input.resourceSlotDemandCacheByPlayer.set(id, { FOOD: 2 } as never);
  input.manpowerStructureBonusCacheByPlayer.set(id, {} as never);
  input.townNetworkCacheByPlayer.set(id, new Map());
  input.tileYieldContextCacheByPlayer.set(id, {} as never);
};

describe("refreshEconomyCachesForTileChange — field-aware invalidation", () => {
  it("leaves every cache warm when only a non-economy field (muster) changed", () => {
    const input = buildInput([player("p1")]);
    warmAll(input, "p1");
    const previous = settledTile("p1");
    const next: DomainTileState = { ...previous, muster: { ownerId: "p1", flags: 3 } as never };

    refreshEconomyCachesForTileChange({ ...input, tileKey: "5,5", previous, next });

    expect(input.economySnapshotCacheByPlayer.has("p1")).toBe(true);
    expect(input.defensibilityMetricsCacheByPlayer.has("p1")).toBe(true);
    expect(input.resourceSlotSupplyCacheByPlayer.has("p1")).toBe(true);
    expect(input.resourceSlotDemandCacheByPlayer.has("p1")).toBe(true);
    expect(input.manpowerStructureBonusCacheByPlayer.has("p1")).toBe(true);
    expect(input.townNetworkCacheByPlayer.has("p1")).toBe(true);
    expect(input.tileYieldContextCacheByPlayer.has("p1")).toBe(true);
  });

  it("still drops the caches when an economy-relevant field changed", () => {
    for (const mutate of [
      (t: DomainTileState): DomainTileState => ({ ...t, ownershipState: "FRONTIER" }),
      (t: DomainTileState): DomainTileState => ({ ...t, economicStructure: { ownerId: "p1", type: "FARMSTEAD", status: "active" } }),
      (t: DomainTileState): DomainTileState => ({ ...t, town: { type: "MARKET", populationTier: "TOWN" } })
    ]) {
      const input = buildInput([player("p1")]);
      warmAll(input, "p1");
      const previous = settledTile("p1");
      refreshEconomyCachesForTileChange({ ...input, tileKey: "5,5", previous, next: mutate(previous) });
      expect(input.economySnapshotCacheByPlayer.has("p1")).toBe(false);
      expect(input.defensibilityMetricsCacheByPlayer.has("p1")).toBe(false);
      expect(input.townNetworkCacheByPlayer.has("p1")).toBe(false);
    }
  });

  it("economyRelevantTileFieldsChanged is false for stamp-only writes and true for sub-object replacement", () => {
    const base = settledTile("p1");
    expect(economyRelevantTileFieldsChanged(base, { ...base, frontierDecayAt: 123, breachShockUntil: 456, healAt: 789 })).toBe(false);
    expect(economyRelevantTileFieldsChanged(base, { ...base, shardSite: { kind: "CACHE", amount: 1 } })).toBe(false);
    const withTown: DomainTileState = { ...base, town: { type: "MARKET", populationTier: "TOWN" } };
    expect(economyRelevantTileFieldsChanged(withTown, { ...withTown })).toBe(false);
    expect(economyRelevantTileFieldsChanged(withTown, { ...withTown, town: { ...withTown.town! } })).toBe(true);
  });
});

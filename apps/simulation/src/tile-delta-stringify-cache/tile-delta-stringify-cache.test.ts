/**
 * Behavior tests for TileDeltaStringifyCache.
 *
 * Verifies:
 * - Byte-identical output to inline JSON.stringify for all substructure combos
 * - Cache hit on same ref (JSON.stringify not called again)
 * - invalidate forces recompute
 * - Partial mutation only recomputes that substructure
 */
import { describe, expect, it, vi } from "vitest";
import { TileDeltaStringifyCache } from "./tile-delta-stringify-cache.js";
import type { DomainTileState } from "@border-empires/game-domain";

const makeBaseTile = (): DomainTileState => ({
  x: 1,
  y: 1,
  terrain: "LAND"
});

const makeFort = () => ({ ownerId: "p1", status: "active" as const });
const makeTown = () => ({ populationTier: "TOWN" as const, type: "FARMING" as const, name: "TestTown" });
const makeObservatory = () => ({ ownerId: "p1", status: "active" as const });
const makeSiegeOutpost = () => ({ ownerId: "p1", status: "active" as const });
const makeEconomicStructure = () => ({ ownerId: "p1", status: "active" as const, type: "MINTWORKS" as const });
const makeSabotage = () => ({ ownerId: "p2", status: "active" as const });
const makeShardSite = () => ({ kind: "FALL" as const, expiresAt: 9999 });

describe("TileDeltaStringifyCache", () => {
  it("returns undefined for absent substructures", () => {
    const cache = new TileDeltaStringifyCache();
    const tile = makeBaseTile();
    const result = cache.getOrComputeAll("1,1", tile);
    expect(result.townJson).toBeUndefined();
    expect(result.fortJson).toBeUndefined();
    expect(result.observatoryJson).toBeUndefined();
    expect(result.siegeOutpostJson).toBeUndefined();
    expect(result.economicStructureJson).toBeUndefined();
    expect(result.sabotageJson).toBeUndefined();
    expect(result.shardSiteJson).toBeUndefined();
  });

  it("returns byte-identical JSON strings as inline JSON.stringify", () => {
    const cache = new TileDeltaStringifyCache();
    const fort = makeFort();
    const town = makeTown();
    const tile: DomainTileState = { ...makeBaseTile(), fort, town };
    const result = cache.getOrComputeAll("1,1", tile);
    expect(result.fortJson).toBe(JSON.stringify(fort));
    expect(result.townJson).toBe(JSON.stringify(town));
  });

  it("returns undefined for all 7 fields when all absent (0 bitmask)", () => {
    const cache = new TileDeltaStringifyCache();
    const result = cache.getOrComputeAll("1,1", makeBaseTile());
    const fields: (keyof typeof result)[] = [
      "townJson", "fortJson", "observatoryJson", "siegeOutpostJson",
      "economicStructureJson", "sabotageJson", "shardSiteJson"
    ];
    for (const field of fields) {
      expect(result[field], `${field} should be undefined`).toBeUndefined();
    }
  });

  it("cache hit: same ref does not call JSON.stringify again", () => {
    const cache = new TileDeltaStringifyCache();
    const fort = makeFort();
    const tile: DomainTileState = { ...makeBaseTile(), fort };
    const jsonSpy = vi.spyOn(JSON, "stringify");
    // First call: computes
    cache.getOrComputeAll("1,1", tile);
    const callsAfterFirst = jsonSpy.mock.calls.length;
    // Second call with same tile: should not call JSON.stringify again
    cache.getOrComputeAll("1,1", tile);
    expect(jsonSpy.mock.calls.length).toBe(callsAfterFirst);
    jsonSpy.mockRestore();
  });

  it("invalidate forces recompute on next call", () => {
    const cache = new TileDeltaStringifyCache();
    const fort = makeFort();
    const tile: DomainTileState = { ...makeBaseTile(), fort };
    cache.getOrComputeAll("1,1", tile);
    cache.invalidate("1,1");
    const jsonSpy = vi.spyOn(JSON, "stringify");
    cache.getOrComputeAll("1,1", tile);
    expect(jsonSpy).toHaveBeenCalled();
    jsonSpy.mockRestore();
  });

  it("partial mutation: only changed substructure is recomputed", () => {
    const cache = new TileDeltaStringifyCache();
    const fort1 = makeFort();
    const town1 = makeTown();
    const tile1: DomainTileState = { ...makeBaseTile(), fort: fort1, town: town1 };
    cache.getOrComputeAll("1,1", tile1);

    // Change only fort reference
    const fort2 = { ...fort1, status: "active" as const };
    const tile2: DomainTileState = { ...tile1, fort: fort2 };

    const jsonSpy = vi.spyOn(JSON, "stringify");
    const result2 = cache.getOrComputeAll("1,1", tile2);

    // fort changed, town stayed same ref
    const fortStringifyCalls = jsonSpy.mock.calls.filter(([arg]) => arg === fort2);
    expect(fortStringifyCalls.length).toBeGreaterThan(0);

    // town ref is same, should NOT be stringified again
    const townStringifyCalls = jsonSpy.mock.calls.filter(([arg]) => arg === town1);
    expect(townStringifyCalls.length).toBe(0);

    expect(result2.townJson).toBe(JSON.stringify(town1));
    jsonSpy.mockRestore();
  });

  it("a new economicStructure ref carrying converterMode (mode flip) is re-stringified", () => {
    const cache = new TileDeltaStringifyCache();
    const eco1 = makeEconomicStructure();
    const tile1: DomainTileState = { ...makeBaseTile(), economicStructure: eco1 };
    cache.getOrComputeAll("1,1", tile1);

    // The flip handler writes { ...structure, converterMode, modeLockedUntil },
    // which is a NEW object ref — the cache must recompute economicStructureJson.
    const eco2 = { ...eco1, converterMode: "EXCHANGE" as const, modeLockedUntil: 12345 };
    const tile2: DomainTileState = { ...tile1, economicStructure: eco2 };

    const jsonSpy = vi.spyOn(JSON, "stringify");
    const result2 = cache.getOrComputeAll("1,1", tile2);
    const ecoStringifyCalls = jsonSpy.mock.calls.filter(([arg]) => arg === eco2);
    expect(ecoStringifyCalls.length).toBeGreaterThan(0);
    expect(result2.economicStructureJson).toBe(JSON.stringify(eco2));
    expect(result2.economicStructureJson).toContain("\"converterMode\":\"EXCHANGE\"");
    jsonSpy.mockRestore();
  });

  it("invalidateMany clears all specified keys", () => {
    const cache = new TileDeltaStringifyCache();
    const fort = makeFort();
    const tile: DomainTileState = { ...makeBaseTile(), fort };
    cache.getOrComputeAll("1,1", tile);
    cache.getOrComputeAll("2,2", { ...tile, x: 2, y: 2 });
    expect(cache.size()).toBe(2);
    cache.invalidateMany(["1,1", "2,2"]);
    expect(cache.size()).toBe(0);
  });

  it("clear empties all entries", () => {
    const cache = new TileDeltaStringifyCache();
    for (let i = 0; i < 5; i++) {
      cache.getOrComputeAll(`${i},${i}`, { ...makeBaseTile(), x: i, y: i });
    }
    expect(cache.size()).toBe(5);
    cache.clear();
    expect(cache.size()).toBe(0);
  });

  it("32 substructure presence combos all produce byte-identical output", () => {
    const cache = new TileDeltaStringifyCache();
    const allSubstructures = {
      town: makeTown(),
      fort: makeFort(),
      observatory: makeObservatory(),
      siegeOutpost: makeSiegeOutpost(),
      economicStructure: makeEconomicStructure(),
    } as const;

    // Test all 32 combinations (2^5)
    for (let mask = 0; mask < 32; mask++) {
      const tileKey = `combo,${mask}`;
      const tile: DomainTileState = {
        ...makeBaseTile(),
        x: mask,
        y: 0,
        ...(mask & 1 ? { town: allSubstructures.town } : {}),
        ...(mask & 2 ? { fort: allSubstructures.fort } : {}),
        ...(mask & 4 ? { observatory: allSubstructures.observatory } : {}),
        ...(mask & 8 ? { siegeOutpost: allSubstructures.siegeOutpost } : {}),
        ...(mask & 16 ? { economicStructure: allSubstructures.economicStructure } : {}),
      };
      const result = cache.getOrComputeAll(tileKey, tile);
      expect(result.townJson).toBe(tile.town ? JSON.stringify(tile.town) : undefined);
      expect(result.fortJson).toBe(tile.fort ? JSON.stringify(tile.fort) : undefined);
      expect(result.observatoryJson).toBe(tile.observatory ? JSON.stringify(tile.observatory) : undefined);
      expect(result.siegeOutpostJson).toBe(tile.siegeOutpost ? JSON.stringify(tile.siegeOutpost) : undefined);
      expect(result.economicStructureJson).toBe(tile.economicStructure ? JSON.stringify(tile.economicStructure) : undefined);
    }
  });

  it("all 7 fields present: all are populated correctly", () => {
    const cache = new TileDeltaStringifyCache();
    const fort = makeFort();
    const town = makeTown();
    const obs = makeObservatory();
    const siege = makeSiegeOutpost();
    const econ = makeEconomicStructure();
    const sab = makeSabotage();
    const shard = makeShardSite();
    const tile: DomainTileState = {
      ...makeBaseTile(),
      fort,
      town,
      observatory: obs,
      siegeOutpost: siege,
      economicStructure: econ,
      sabotage: sab,
      shardSite: shard
    };
    const result = cache.getOrComputeAll("all,7", tile);
    expect(result.fortJson).toBe(JSON.stringify(fort));
    expect(result.townJson).toBe(JSON.stringify(town));
    expect(result.observatoryJson).toBe(JSON.stringify(obs));
    expect(result.siegeOutpostJson).toBe(JSON.stringify(siege));
    expect(result.economicStructureJson).toBe(JSON.stringify(econ));
    expect(result.sabotageJson).toBe(JSON.stringify(sab));
    expect(result.shardSiteJson).toBe(JSON.stringify(shard));
  });

  it("buildSparseDelta always includes ownerId/ownershipState/dockId, even when unchanged from the last emission", () => {
    // Downstream consumers of a sparse delta (the gateway's per-player
    // snapshot cache, tile-detail responses, a fresh client subscriber) may
    // be seeing this tile for the first time even though the sim's cache
    // has "already emitted" it to someone else. Omitting these fields
    // because they "didn't change" leaves any such consumer with no owner
    // (or no dock) at all, and nothing ever re-sends them since they never
    // change again. Regression for the bug behind #774/#777 -- confirmed
    // live on a dock tile whose tile-detail response was missing ownerId,
    // ownershipState, AND dockId simultaneously.
    const cache = new TileDeltaStringifyCache();
    const tile: DomainTileState = {
      ...makeBaseTile(),
      ownerId: "p1",
      ownershipState: "SETTLED",
      dockId: "dock-1"
    };
    const cached = cache.getOrComputeAll("1,1", tile);
    const fullDelta = { x: tile.x, y: tile.y, ownerId: tile.ownerId, ownershipState: tile.ownershipState, dockId: tile.dockId };

    // First call: no prior emission, sparse diff falls back to the full delta.
    const first = cache.sparseEmit("1,1", tile, cached, fullDelta, undefined);
    expect(first.ownerId).toBe("p1");
    expect(first.ownershipState).toBe("SETTLED");
    expect(first.dockId).toBe("dock-1");

    // Second call on the *same, unchanged* tile: a naive sparse diff would
    // consider ownerId/ownershipState/dockId unchanged and omit them entirely.
    const unrelatedFieldChange = { ...tile, terrain: "LAND" as const };
    const second = cache.buildSparseDelta("1,1", unrelatedFieldChange, cached, {
      x: tile.x, y: tile.y, terrain: "LAND", ownerId: tile.ownerId, ownershipState: tile.ownershipState, dockId: tile.dockId
    }, undefined);
    expect(second.ownerId).toBe("p1");
    expect(second.ownershipState).toBe("SETTLED");
    expect(second.dockId).toBe("dock-1");
  });

  it("first-ever emission of a now-unowned tile still includes an explicit ownerId key", () => {
    // Regression for the barbarian phantom-trail bug: a tile that a
    // barbarian just vacated (ownerId now undefined) is emitted for the
    // FIRST TIME to the stringify cache (e.g. right after a sim restart,
    // when the in-memory cache is empty for every tile on the map, even
    // ones already seen by connected players before the restart).
    //
    // buildSparseDelta's `if (!last) return fullDelta` bypass means the
    // guarantee tested above ("ownerId always included, even unchanged")
    // does NOT apply on this first-emission path -- it returns whatever
    // fullDelta the caller built. Runtime.tileDeltaFromState conditionally
    // spreads ownerId only `...(tile.ownerId ? { ownerId: tile.ownerId } : {})`,
    // which OMITS the key entirely for an unowned tile. This exact shape
    // (fullDelta built the same way tileDeltaFromState builds it) is
    // reproduced here rather than importing the private runtime method.
    //
    // Downstream, tile-delta-visibility-filter.ts's ownership-clear
    // passthrough for non-visible tiles checks `"ownerId" in delta` to
    // decide whether a delta is a genuine ownership-clear worth forwarding
    // even to a player who can't currently see the tile. If the key is
    // missing, that check fails silently and the clear is dropped --
    // the client never learns the barbarian left, and keeps rendering
    // stale ownership indefinitely (until a manual REQUEST_TILE_DETAIL
    // forces a fresh, unfiltered read).
    const cache = new TileDeltaStringifyCache();
    const vacatedTile: DomainTileState = { ...makeBaseTile() }; // no ownerId: barbarian walked off
    const cached = cache.getOrComputeAll("1,1", vacatedTile);
    const fullDeltaAsRuntimeBuildsIt = {
      x: vacatedTile.x,
      y: vacatedTile.y,
      ...(vacatedTile.terrain ? { terrain: vacatedTile.terrain } : {}),
      ...(vacatedTile.ownerId ? { ownerId: vacatedTile.ownerId } : {}),
      ...(vacatedTile.ownershipState ? { ownershipState: vacatedTile.ownershipState } : {})
    };

    const first = cache.sparseEmit("1,1", vacatedTile, cached, fullDeltaAsRuntimeBuildsIt, undefined);

    expect("ownerId" in first).toBe(true);
    expect(first.ownerId).toBeUndefined();
    expect("ownershipState" in first).toBe(true);
    expect(first.ownershipState).toBeUndefined();
  });

  it("buildSparseDelta always includes frontierDecayAt/frontierDecayKind, even when unchanged from the last emission", () => {
    // Regression for a live bug: a frontier tile decaying from being out of
    // reach keeps getting frontierDecayAt refreshed on every reach recheck
    // while frontierDecayKind stays "OUT_OF_REACH" the whole time. Once this
    // cache's GLOBAL last-emitted baseline already had frontierDecayKind set
    // (from an earlier tick sent to some other consumer), a subsequent
    // consumer seeing the tile for the first time via ongoing per-tick
    // deltas only received frontierDecayAt-only deltas and never got the
    // paired frontierDecayKind -- so tileMenuHeaderStatusForTile
    // (client-tile-menu-status.ts) could never resolve a decay countdown,
    // and the tile menu fell back to a plain "Inside Enemy Reach" line with no
    // timer at all, even though the tile really was decaying.
    const cache = new TileDeltaStringifyCache();
    const tile: DomainTileState = {
      ...makeBaseTile(),
      ownerId: "p1",
      ownershipState: "FRONTIER",
      frontierDecayAt: 1000,
      frontierDecayKind: "OUT_OF_REACH"
    };
    const cached = cache.getOrComputeAll("1,1", tile);
    const fullDelta = {
      x: tile.x, y: tile.y, ownerId: tile.ownerId, ownershipState: tile.ownershipState,
      frontierDecayAt: tile.frontierDecayAt, frontierDecayKind: tile.frontierDecayKind
    };

    // First call: no prior emission, sparse diff falls back to the full delta.
    const first = cache.sparseEmit("1,1", tile, cached, fullDelta, undefined);
    expect(first.frontierDecayAt).toBe(1000);
    expect(first.frontierDecayKind).toBe("OUT_OF_REACH");

    // Second tick: only frontierDecayAt actually changed (a reach recheck
    // pushed the deadline out); frontierDecayKind is identical to the last
    // emission. A naive sparse diff would omit it as "unchanged" -- it must
    // still be present for any consumer that missed the first emission.
    const refreshedTile: DomainTileState = { ...tile, frontierDecayAt: 2000 };
    const second = cache.buildSparseDelta("1,1", refreshedTile, cached, {
      x: tile.x, y: tile.y, frontierDecayAt: 2000, frontierDecayKind: tile.frontierDecayKind
    }, undefined);
    expect(second.frontierDecayAt).toBe(2000);
    expect(second.frontierDecayKind).toBe("OUT_OF_REACH");
  });

  it("buildSparseDelta treats reachOwnerId like ownerId: always included, diffed against the passed-in value not a tile field", () => {
    // reachOwnerId isn't stored on DomainTileState (it comes from
    // Runtime.reachBorder), so callers pass it in explicitly on every call —
    // this is the cache-level coverage for that always-included contract.
    const cache = new TileDeltaStringifyCache();
    const tile: DomainTileState = { ...makeBaseTile(), ownerId: "p1", ownershipState: "SETTLED" };
    const cached = cache.getOrComputeAll("1,1", tile);
    const fullDelta = { x: tile.x, y: tile.y, ownerId: tile.ownerId, ownershipState: tile.ownershipState };

    const first = cache.sparseEmit("1,1", tile, cached, fullDelta, "player-1");
    expect(first.reachOwnerId).toBe("player-1");

    // Nothing about the DomainTileState changed, but the reach owner did —
    // a naive diff keyed only off `tile` fields would miss this entirely.
    const second = cache.buildSparseDelta("1,1", tile, cached, fullDelta, "player-2");
    expect(second.reachOwnerId).toBe("player-2");
  });
});

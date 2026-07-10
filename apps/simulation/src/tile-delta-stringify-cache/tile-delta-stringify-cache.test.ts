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
const makeEconomicStructure = () => ({ ownerId: "p1", status: "active" as const, type: "MARKET" as const });
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
    const first = cache.sparseEmit("1,1", tile, cached, fullDelta);
    expect(first.ownerId).toBe("p1");
    expect(first.ownershipState).toBe("SETTLED");
    expect(first.dockId).toBe("dock-1");

    // Second call on the *same, unchanged* tile: a naive sparse diff would
    // consider ownerId/ownershipState/dockId unchanged and omit them entirely.
    const unrelatedFieldChange = { ...tile, terrain: "LAND" as const };
    const second = cache.buildSparseDelta("1,1", unrelatedFieldChange, cached, {
      x: tile.x, y: tile.y, terrain: "LAND", ownerId: tile.ownerId, ownershipState: tile.ownershipState, dockId: tile.dockId
    });
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

    const first = cache.sparseEmit("1,1", vacatedTile, cached, fullDeltaAsRuntimeBuildsIt);

    expect("ownerId" in first).toBe(true);
    expect(first.ownerId).toBeUndefined();
    expect("ownershipState" in first).toBe(true);
    expect(first.ownershipState).toBeUndefined();
  });
});

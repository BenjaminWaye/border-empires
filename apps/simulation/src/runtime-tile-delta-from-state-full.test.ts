import { describe, expect, it } from "vitest";
import type { DomainTileState } from "@border-empires/game-domain";
import { tileDeltaFromState, type TileDeltaFromStateDeps } from "./runtime-tile-delta-from-state.js";
import { TileDeltaStringifyCache } from "./tile-delta-stringify-cache/tile-delta-stringify-cache.js";

const makeDeps = (): TileDeltaFromStateDeps => ({
  players: new Map(),
  tileDeltaStringifyCache: new TileDeltaStringifyCache(),
  now: () => 0,
  tileYieldCollectedAt: () => undefined,
  tileYieldEconomyContextForPlayer: () => {
    throw new Error("not needed for these unowned-tile fixtures");
  },
  enrichTileWithTownContext: (tile) => tile,
  yieldViewEconomyContext: () => undefined
});

const makeTile = (): DomainTileState => ({
  x: 10,
  y: 10,
  terrain: "LAND",
  ownerId: "player-1",
  ownershipState: "SETTLED",
  town: { type: "MARKET", populationTier: "TOWN", population: 1000, maxPopulation: 25_000 }
});

// Regression: a "give me the full current tile detail" request (the tile
// detail RPC used by the debug-download tool and the tile-detail push) used
// to reuse the exact same sparse-diff path as the regular incremental
// broadcast stream, sharing its per-tile "last emitted" tracking. If
// nothing else had touched the tile since the last broadcast, the sparse
// path silently omitted townJson — and the requester's merge kept whatever
// stale value it already had cached, even though the tile's town data had
// genuinely changed server-side since that requester last saw it. `full:
// true` bypasses that diffing so a full-detail fetch always gets the
// complete, current object.
describe("tileDeltaFromState — full option bypasses sparse diffing", () => {
  it("always includes townJson when full:true, even on a second call with no changes", () => {
    const deps = makeDeps();
    const tile = makeTile();

    const first = tileDeltaFromState(deps, tile, undefined, { full: true });
    expect(first.townJson).toBeDefined();

    // Second full fetch of the exact same (unchanged) tile reference.
    const second = tileDeltaFromState(deps, tile, undefined, { full: true });
    expect(second.townJson).toBeDefined();
    expect(second.townJson).toBe(first.townJson);
  });

  it("without full:true, a sparse call omits townJson when something else on the tile changed but the town object itself did not", () => {
    const deps = makeDeps();
    const tile = makeTile();

    const first = tileDeltaFromState(deps, tile);
    expect(first.townJson).toBeDefined();

    // Something unrelated changes (a new resource type here) so this isn't
    // a no-op emission, but tile.town is the exact same object reference as
    // before -- this is the real-world shape of the bug: some other tile
    // mutation triggers a broadcast/fetch, but the town wasn't touched by
    // it, so the sparse diff (correctly, for a broadcast) omits townJson.
    // Bypassing that via full:true is what a full-detail fetch needs.
    const changedElsewhere: DomainTileState = { ...tile, resource: "TITANIUM" };
    const second = tileDeltaFromState(deps, changedElsewhere);
    expect(second.resource).toBe("TITANIUM");
    expect(second.townJson).toBeUndefined();
  });
});

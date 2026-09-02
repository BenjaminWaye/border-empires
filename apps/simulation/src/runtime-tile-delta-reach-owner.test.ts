import { describe, expect, it } from "vitest";
import type { DomainTileState } from "@border-empires/game-domain";
import { tileDeltaFromState, type TileDeltaFromStateDeps } from "./runtime-tile-delta-from-state.js";
import { tileDeltaRevealOnly } from "./tile-delta-reveal-only.js";
import { TileDeltaStringifyCache } from "./tile-delta-stringify-cache/tile-delta-stringify-cache.js";

const makeDeps = (reachOwnerId: string | undefined): TileDeltaFromStateDeps => ({
  players: new Map(),
  tileDeltaStringifyCache: new TileDeltaStringifyCache(),
  now: () => 0,
  tileYieldCollectedAt: () => undefined,
  tileYieldEconomyContextForPlayer: () => {
    throw new Error("not needed for these unowned-tile fixtures");
  },
  enrichTileWithTownContext: (tile) => tile,
  yieldViewEconomyContext: () => undefined,
  reachBorderOwnerAt: () => reachOwnerId
});

const makeTile = (): DomainTileState => ({ x: 5, y: 5, terrain: "LAND" });

// reachOwnerId is derived from Runtime.reachBorder, not stored on
// DomainTileState -- these tests are the field's dedicated coverage (see
// runtime-types.ts's SimulationTileWireDelta.reachOwnerId doc comment).
describe("tileDeltaFromState — reachOwnerId", () => {
  it("includes reachOwnerId when the tile is currently reach-covered", () => {
    const deps = makeDeps("player-1");
    const delta = tileDeltaFromState(deps, makeTile());
    expect(delta.reachOwnerId).toBe("player-1");
  });

  it("is always present as a key (never conditionally omitted), same as ownerId — required so a clear is distinguishable from untouched-since-last-delta", () => {
    const covered = tileDeltaFromState(makeDeps("player-1"), makeTile());
    expect("reachOwnerId" in covered).toBe(true);

    const uncovered = tileDeltaFromState(makeDeps(undefined), makeTile());
    expect("reachOwnerId" in uncovered).toBe(true);
    expect(uncovered.reachOwnerId).toBeUndefined();
  });

  it("reflects a reach-owner change on a tile whose other fields are unchanged, even under sparse diffing", () => {
    const cache = new TileDeltaStringifyCache();
    const deps: TileDeltaFromStateDeps = {
      players: new Map(),
      tileDeltaStringifyCache: cache,
      now: () => 0,
      tileYieldCollectedAt: () => undefined,
      tileYieldEconomyContextForPlayer: () => {
        throw new Error("not needed");
      },
      enrichTileWithTownContext: (tile) => tile,
      yieldViewEconomyContext: () => undefined,
      reachBorderOwnerAt: () => "player-1"
    };
    const tile = makeTile();

    const first = tileDeltaFromState(deps, tile);
    expect(first.reachOwnerId).toBe("player-1");

    // Reach flips to a rival; nothing else about the tile changed.
    deps.reachBorderOwnerAt = () => "player-2";
    const second = tileDeltaFromState(deps, tile);
    expect(second.reachOwnerId).toBe("player-2");
  });
});

describe("tileDeltaRevealOnly — reachOwnerId", () => {
  it("includes the current reach owner on first exposure (fog-of-war reveal)", () => {
    const cache = new TileDeltaStringifyCache();
    const delta = tileDeltaRevealOnly(makeTile(), cache, undefined, () => "player-1");
    expect(delta.reachOwnerId).toBe("player-1");
  });

  it("explicitly clears reachOwnerId to undefined when nobody currently holds reach there", () => {
    const cache = new TileDeltaStringifyCache();
    const delta = tileDeltaRevealOnly(makeTile(), cache, undefined, () => undefined);
    expect("reachOwnerId" in delta).toBe(true);
    expect(delta.reachOwnerId).toBeUndefined();
  });
});

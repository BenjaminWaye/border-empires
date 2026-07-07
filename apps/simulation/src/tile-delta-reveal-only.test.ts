import { describe, expect, it } from "vitest";
import type { DomainTileState } from "@border-empires/game-domain";
import { tileDeltaRevealOnly } from "./tile-delta-reveal-only.js";
import { TileDeltaStringifyCache } from "./tile-delta-stringify-cache/tile-delta-stringify-cache.js";

const makeTile = (overrides: Partial<DomainTileState> = {}): DomainTileState => ({
  x: 3,
  y: 4,
  terrain: "LAND",
  ownerId: "p1",
  ownershipState: "SETTLED",
  ...overrides
});

describe("tileDeltaRevealOnly", () => {
  it("always includes ownerId/ownershipState, even on repeat reveals of an unchanged tile", () => {
    // A capture-reveal radius sweep re-broadcasts unchanged neighboring tiles
    // so newly-visible subscribers learn about them. Regardless of how many
    // times this fires for the same unchanged tile, every subscriber may be
    // seeing it for the first time, so it must never come back sparse.
    const cache = new TileDeltaStringifyCache();
    const tile = makeTile();

    const first = tileDeltaRevealOnly(tile, cache);
    expect(first.ownerId).toBe("p1");
    expect(first.ownershipState).toBe("SETTLED");

    const second = tileDeltaRevealOnly(tile, cache);
    expect(second.ownerId).toBe("p1");
    expect(second.ownershipState).toBe("SETTLED");

    const third = tileDeltaRevealOnly(tile, cache);
    expect(third.ownerId).toBe("p1");
    expect(third.ownershipState).toBe("SETTLED");
  });

  it("still updates the shared cache baseline so later incremental diffs stay correct", () => {
    const cache = new TileDeltaStringifyCache();
    const tile = makeTile();
    tileDeltaRevealOnly(tile, cache);
    expect(cache.getLastEmitted("3,4")?.ownerId).toBe("p1");
  });
});

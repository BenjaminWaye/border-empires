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

  // Regression coverage for a real bug: this is the fog-of-war "first
  // exposure" delta path (fired when a tile enters a subscriber's vision for
  // the first time, e.g. via EXPAND/SETTLE or a capture-reveal radius sweep).
  // It used to include tile.resource completely unmasked, bypassing the
  // resource-reveal gating already applied on the streaming
  // (tile-delta-visibility-filter.ts) and login (runtime-visible-state.ts)
  // paths -- so settling next to a hidden resource revealed it immediately
  // regardless of tech.
  it("masks resource for a viewer with no reveal tech, reveals it once the viewer has the tech", () => {
    const cache = new TileDeltaStringifyCache();
    const tile = makeTile({ resource: "TITANIUM" });

    const hidden = tileDeltaRevealOnly(tile, cache, { techIds: new Set() });
    expect(hidden.resource).toBeUndefined();

    const revealed = tileDeltaRevealOnly(tile, cache, { techIds: new Set(["masonry"]) });
    expect(revealed.resource).toBe("TITANIUM");
  });

  it("masks resource when no viewer is passed at all", () => {
    const cache = new TileDeltaStringifyCache();
    const tile = makeTile({ resource: "GEMS" });
    const delta = tileDeltaRevealOnly(tile, cache);
    expect(delta.resource).toBeUndefined();
  });
});

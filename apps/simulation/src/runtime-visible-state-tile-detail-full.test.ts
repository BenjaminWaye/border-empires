import { describe, expect, it } from "vitest";
import type { DomainTileState } from "@border-empires/game-domain";
import { exportTilesInAreaForPlayer } from "./runtime-visible-state.js";

// Regression: exportTilesInAreaForPlayer backs the tile-detail RPC (the
// debug-download tool and the live tile-detail push) -- a "give me the
// current full detail" request, not an incremental broadcast. It used to
// call tileDeltaFromState the same way the regular broadcast stream does,
// which can omit rarely-changing fields (like a town's gold/growth
// multiplier fields) if nothing else touched the tile since the last
// broadcast. It must always request the full, undiffed delta.
describe("exportTilesInAreaForPlayer — requests full (non-sparse) tile deltas", () => {
  it("calls tileDeltaFromState with { full: true } for every tile in range", () => {
    const tile: DomainTileState = {
      x: 10,
      y: 10,
      terrain: "LAND",
      ownerId: "player-1",
      ownershipState: "SETTLED"
    };
    const calls: Array<{ full?: boolean } | undefined> = [];

    exportTilesInAreaForPlayer({
      playerId: "player-1",
      centerX: 10,
      centerY: 10,
      radius: 0,
      fullVisibility: true,
      tiles: new Map([["10,10", tile]]),
      players: new Map(),
      tileDeltaFromState: (t, _context, options) => {
        calls.push(options);
        return { x: t.x, y: t.y };
      },
      tileYieldEconomyContextForPlayer: () => {
        throw new Error("no owner in this fixture, should not be called");
      },
      filterTileDeltasForPlayer: (deltas) => deltas
    });

    expect(calls).toHaveLength(1);
    expect(calls[0]).toEqual({ full: true });
  });
});

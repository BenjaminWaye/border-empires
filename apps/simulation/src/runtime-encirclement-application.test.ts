import type { DomainTileState } from "@border-empires/game-domain";
import type { SimulationEvent } from "@border-empires/sim-protocol";
import { describe, expect, it } from "vitest";

import { applyEncirclement, type RuntimeEncirclementApplicationContext } from "./runtime-encirclement-application.js";
import type { SimulationTileWireDelta } from "./runtime-types.js";

const harness = (tiles: Map<string, DomainTileState>) => {
  const events: SimulationEvent[] = [];
  const context: RuntimeEncirclementApplicationContext = {
    tiles,
    now: () => 1_000,
    activeAetherBridgesForPlayer: () => [],
    replaceTileState: (tileKey, tile) => {
      tiles.set(tileKey, tile);
    },
    tileDeltaFromState: (tile) => ({ x: tile.x, y: tile.y }) as SimulationTileWireDelta,
    emitEvent: (event) => {
      events.push(event);
    },
    runtimeLogInfo: () => {}
  };
  return { context, events };
};

describe("applyEncirclement — cut-off clearing", () => {
  it("clears ownership on a cut-off frontier tile but preserves its naturalWonder", () => {
    const wonder = { type: "CARTOGRAPHERS_LENS" } as DomainTileState["naturalWonder"];
    const tiles = new Map<string, DomainTileState>([
      [
        "12,10",
        {
          x: 12,
          y: 10,
          terrain: "LAND",
          ownerId: "player-1",
          ownershipState: "FRONTIER",
          naturalWonder: wonder
        } as DomainTileState
      ]
      // no settled tile for player-1 anywhere -- "12,10" is cut off
    ]);
    const { context } = harness(tiles);

    applyEncirclement(context, ["12,10"], "player-1", "cmd-1");

    const tile = tiles.get("12,10");
    expect(tile?.ownerId).toBeUndefined();
    expect(tile?.ownershipState).toBeUndefined();
    expect(tile?.naturalWonder).toBe(wonder); // world-gen feature, not owner-scoped -- survives being cut off
  });
});

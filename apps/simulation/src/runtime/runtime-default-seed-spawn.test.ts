import { describe, expect, it } from "vitest";
import { isAfcSiteClear, tileBlocksAfcSite } from "@border-empires/game-domain";

import { SimulationRuntime } from "./runtime.js";

describe("default seed player spawn", () => {
  it("keeps a feature-free AFC footprint for a joining player", () => {
    const runtime = new SimulationRuntime({ now: () => 1_000 });

    expect(runtime.ensurePlayerHasSpawnTerritory("joining-player")).toBe(true);

    const tiles = runtime.exportState().tiles;
    const afc = tiles.find((tile) => tile.ownerId === "joining-player" && tile.afcJson);
    expect(afc).toBeDefined();
    expect(isAfcSiteClear(
      (x, y) => tileBlocksAfcSite(tiles.find((tile) => tile.x === x && tile.y === y)),
      afc!.x,
      afc!.y
    )).toBe(true);
  });
});

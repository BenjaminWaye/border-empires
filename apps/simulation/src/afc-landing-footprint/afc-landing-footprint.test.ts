import { afterEach, describe, expect, it } from "vitest";
import type { DomainTileState } from "@border-empires/game-domain";
import { WORLD_HEIGHT, WORLD_WIDTH, isForestTileAt, resetForestClearings, setWorldSeed } from "@border-empires/shared";

import { prepareAfcLandingFootprint } from "./afc-landing-footprint.js";
import { simulationTileKey } from "../seed-state/seed-state.js";

// First tile whose whole 3x3 footprint is procedural forest, so the test
// exercises real worldgen forest rather than a stub.
const findForestFootprintCenter = (): { x: number; y: number } => {
  for (let y = 20; y < WORLD_HEIGHT - 20; y += 1) {
    for (let x = 1; x < WORLD_WIDTH - 1; x += 1) {
      let allForest = true;
      for (let dy = -1; dy <= 1 && allForest; dy += 1) {
        for (let dx = -1; dx <= 1 && allForest; dx += 1) allForest = isForestTileAt(x + dx, y + dy);
      }
      if (allForest) return { x, y };
    }
  }
  throw new Error("no all-forest 3x3 footprint in this world");
};

describe("prepareAfcLandingFootprint", () => {
  afterEach(() => resetForestClearings());

  it("flattens mountains in the 3x3 footprint, leaves other tiles alone, and bumps the terrain epoch", () => {
    setWorldSeed(1234, "continents", 1);
    const tiles = new Map<string, DomainTileState>();
    for (let y = 9; y <= 11; y += 1) {
      for (let x = 9; x <= 11; x += 1) tiles.set(simulationTileKey(x, y), { x, y, terrain: "LAND" });
    }
    tiles.set(simulationTileKey(9, 9), { x: 9, y: 9, terrain: "MOUNTAIN" });
    tiles.set(simulationTileKey(11, 10), { x: 11, y: 10, terrain: "MOUNTAIN", resource: "GEMS" });
    tiles.set(simulationTileKey(12, 10), { x: 12, y: 10, terrain: "MOUNTAIN" }); // outside the footprint
    const replaced: Array<{ tileKey: string; commandId: string | undefined }> = [];
    let epochBumps = 0;
    const flattened = prepareAfcLandingFootprint(
      {
        tiles,
        replaceTileState: (tileKey, tile, commandId) => {
          tiles.set(tileKey, tile);
          replaced.push({ tileKey, commandId });
        },
        bumpTerrainEpoch: () => {
          epochBumps += 1;
        }
      },
      10,
      10,
      "cmd-1"
    );
    expect(flattened.map((tile) => simulationTileKey(tile.x, tile.y)).sort()).toEqual(["11,10", "9,9"]);
    expect(tiles.get("9,9")?.terrain).toBe("LAND");
    expect(tiles.get("11,10")).toMatchObject({ terrain: "LAND", resource: "GEMS" });
    expect(tiles.get("12,10")?.terrain).toBe("MOUNTAIN");
    expect(replaced.every((entry) => entry.commandId === "cmd-1")).toBe(true);
    expect(epochBumps).toBe(1);
  });

  it("clears forest from the landing tile and all 8 neighbours", () => {
    setWorldSeed(1234, "continents", 1);
    const center = findForestFootprintCenter();
    let epochBumps = 0;
    prepareAfcLandingFootprint(
      { tiles: new Map(), replaceTileState: () => undefined, bumpTerrainEpoch: () => { epochBumps += 1; } },
      center.x,
      center.y,
      "cmd-2"
    );
    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) expect(isForestTileAt(center.x + dx, center.y + dy)).toBe(false);
    }
    // No mountain was flattened, so the terrain epoch is untouched.
    expect(epochBumps).toBe(0);
  });
});

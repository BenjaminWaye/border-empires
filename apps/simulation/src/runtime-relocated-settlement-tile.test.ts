import { afterEach, describe, expect, it } from "vitest";
import { WORLD_HEIGHT, WORLD_WIDTH, isForestTileAt, resetForestClearings, setWorldSeed } from "@border-empires/shared";
import { buildRelocatedSettlementTile } from "./runtime-relocated-settlement-tile.js";

describe("buildRelocatedSettlementTile", () => {
  afterEach(() => resetForestClearings());

  it("clears the forest under the relocated settlement", () => {
    setWorldSeed(77, "continents", 1);
    let forest: { x: number; y: number } | undefined;
    for (let y = 20; y < WORLD_HEIGHT - 20 && !forest; y += 1) {
      for (let x = 1; x < WORLD_WIDTH - 1; x += 1) if (isForestTileAt(x, y)) { forest = { x, y }; break; }
    }
    expect(forest).toBeDefined();
    const tile = buildRelocatedSettlementTile({ ...forest!, terrain: "LAND", ownerId: "p1", ownershipState: "FRONTIER" }, "Refuge", 12);
    expect(tile.town).toMatchObject({ name: `Refuge ${forest!.x},${forest!.y}`, populationTier: "SETTLEMENT", population: 12 });
    expect(tile.ownershipState).toBe("SETTLED");
    expect(isForestTileAt(forest!.x, forest!.y)).toBe(false);
  });
});

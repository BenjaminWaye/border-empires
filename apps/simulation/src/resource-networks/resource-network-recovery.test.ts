import { describe, expect, it } from "vitest";
import { WORLD_HEIGHT, WORLD_WIDTH, setWorldSeed } from "@border-empires/shared";
import type { DomainTileState } from "@border-empires/game-domain";
import { createTilesFromInitialState } from "../runtime-hydration.js";

describe("resource layout recovery", () => {
  it("does not populate a recovered campaign with the old scattered resin-tree pattern", () => {
    setWorldSeed(1037, "islands", 11);
    const legacy = new Map<string, DomainTileState>();
    for (let y = 0; y < WORLD_HEIGHT; y += 1) for (let x = 0; x < WORLD_WIDTH; x += 1)
      legacy.set(`${x},${y}`, { x, y, terrain: "LAND" });
    const hydrated = createTilesFromInitialState(undefined, legacy, false);
    expect([...hydrated.values()].some(tile => tile.resource === "NEURAL_RESIN")).toBe(false);
  }, 60_000);
  it("preserves a developed deposit and ownership through an ordinary snapshot recovery", () => {
    const tiles: DomainTileState[] = [{ x: 2, y: 3, terrain: "LAND", resource: "NEURAL_RESIN", ownerId: "p", ownershipState: "SETTLED",
      economicStructure: { ownerId: "p", type: "RESIN_EXTRACTOR", status: "active" } }];
    const restored = createTilesFromInitialState({ tiles, activeLocks: [] }, new Map(), false);
    expect(restored.get("2,3")).toMatchObject(tiles[0]!);
  });
});

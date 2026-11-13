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
    expect([...hydrated.values()].some(tile => (tile.resource as string | undefined) === "NEURAL_RESIN")).toBe(false);
  }, 60_000);
  it("preserves a developed deposit and ownership through an ordinary snapshot recovery", () => {
    const tiles: DomainTileState[] = [{ x: 2, y: 3, terrain: "LAND", resource: "LUXURY_BIOTA", ownerId: "p", ownershipState: "SETTLED",
      economicStructure: { ownerId: "p", type: "CULTIVATION_ESTATE", status: "active" } }];
    const restored = createTilesFromInitialState({ tiles, activeLocks: [] }, new Map(), false);
    expect(restored.get("2,3")).toMatchObject(tiles[0]!);
  });
  it("drops cut resin, conductive and catalyst deposits and installations from an old save", () => {
    // Saves from before the cut hold resources and buildings the rules no longer know.
    const tiles = [
      { x: 2, y: 3, terrain: "LAND", resource: "NEURAL_RESIN", ownerId: "p", ownershipState: "SETTLED", economicStructure: { ownerId: "p", type: "RESIN_EXTRACTOR", status: "active" } },
      { x: 4, y: 3, terrain: "LAND", resource: "CONDUCTIVE_MINERALS", ownerId: "p", ownershipState: "SETTLED", economicStructure: { ownerId: "p", type: "IMPLANT_FOUNDRY", status: "active" } },
      { x: 6, y: 3, terrain: "LAND", resource: "CATALYTIC_DEPOSIT" },
      { x: 8, y: 3, terrain: "LAND", resource: "LUXURY_BIOTA", ownerId: "p", ownershipState: "SETTLED", economicStructure: { ownerId: "p", type: "CULTIVATION_ESTATE", status: "active" } }
    ] as unknown as DomainTileState[];
    const restored = createTilesFromInitialState({ tiles, activeLocks: [] }, new Map(), false);
    for (const key of ["2,3", "4,3", "6,3"]) {
      expect(restored.get(key)?.resource).toBeUndefined();
      expect(restored.get(key)?.economicStructure).toBeUndefined();
    }
    expect(restored.get("2,3")).toMatchObject({ ownerId: "p", ownershipState: "SETTLED" });
    expect(restored.get("8,3")).toMatchObject(tiles[3]!);
  });
  it("drops saved Mines, Umbrite Rigs and Ore Refineries but keeps the bare deposits (Phase 2)", () => {
    const tiles = [
      { x: 2, y: 5, terrain: "LAND", resource: "TITANIUM", ownerId: "p", ownershipState: "SETTLED", economicStructure: { ownerId: "p", type: "MINE", status: "active" } },
      { x: 4, y: 5, terrain: "LAND", resource: "UMBRITE", ownerId: "p", ownershipState: "SETTLED", economicStructure: { ownerId: "p", type: "UMBRITE_RIG", status: "under_construction" } },
      { x: 6, y: 5, terrain: "LAND", ownerId: "p", ownershipState: "SETTLED", economicStructure: { ownerId: "p", type: "ORE_REFINERY", status: "active" } },
      { x: 8, y: 5, terrain: "LAND", ownerId: "p", ownershipState: "SETTLED",
        economicStructure: { ownerId: "p", type: "TITANIUM_REFINERY", status: "active", refineryField: { x: 2, y: 5, assignedAt: 7 } } }
    ] as unknown as DomainTileState[];
    const restored = createTilesFromInitialState({ tiles, activeLocks: [] }, new Map(), false);
    for (const key of ["2,5", "4,5", "6,5"]) expect(restored.get(key)?.economicStructure).toBeUndefined();
    expect(restored.get("2,5")).toMatchObject({ resource: "TITANIUM", ownerId: "p", ownershipState: "SETTLED" });
    expect(restored.get("4,5")?.resource).toBe("UMBRITE");
    expect(restored.get("8,5")).toMatchObject(tiles[3]!);
  });
});

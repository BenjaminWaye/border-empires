import { describe, expect, it } from "vitest";
import type { GameInitState, GameTile } from "./game-types.js";
import { buildTileIndex } from "./viewport.js";
import { buildStructureSites } from "./structures.js";

const PLAYER = "me";

const stateWithTiles = (tiles: GameTile[]): GameInitState => ({
  playerId: PLAYER,
  playerName: "",
  gold: 0,
  manpower: 0,
  manpowerCap: 0,
  manpowerRegenPerMinute: 0,
  tiles,
  eventLog: [],
  autoSettlementQueue: [],
  techIds: [],
  domains: { domainIds: [], openChoiceIds: [], catalog: [], strategicResources: {} },
  resourceSlots: { supply: { FOOD: 0, TITANIUM: 0, CRYSTAL: 0, UMBRITE: 0 }, demand: { FOOD: 0, TITANIUM: 0, CRYSTAL: 0, UMBRITE: 0 } }
});

// FARMSTEAD has no slot requirement at all; MINE needs a free FOOD slot (not
// TITANIUM) -- verified against packages/shared/src/structure-slots/
// structure-slots.ts's STRUCTURE_SLOT_REQUIREMENTS, not the retired
// stockpile-cost fields in structure-costs.ts.
const AMPLE_RESOURCE_SLOTS = {
  supply: { FOOD: 99, TITANIUM: 99, CRYSTAL: 99, UMBRITE: 99 },
  demand: { FOOD: 0, TITANIUM: 0, CRYSTAL: 0, UMBRITE: 0 }
};
const NO_FREE_FOOD_SLOTS = {
  supply: { FOOD: 0, TITANIUM: 99, CRYSTAL: 99, UMBRITE: 99 },
  demand: { FOOD: 0, TITANIUM: 0, CRYSTAL: 0, UMBRITE: 0 }
};

describe("buildStructureSites", () => {
  it("offers FARMSTEAD (alongside WOODEN_FORT) on a settled FARM tile once agriculture is researched", () => {
    const tiles: GameTile[] = [{ x: 0, y: 0, ownerId: PLAYER, ownershipState: "SETTLED", resource: "FARM" }];
    const index = buildTileIndex(stateWithTiles(tiles));
    const sites = buildStructureSites(index, { x: 0, y: 0 }, PLAYER, ["agriculture"], AMPLE_RESOURCE_SLOTS);
    expect(sites.map((site) => site.structureType).sort()).toEqual(["FARMSTEAD", "WOODEN_FORT"]);
  });

  it("excludes FARMSTEAD on a FARM tile when agriculture hasn't been researched yet (WOODEN_FORT still offered)", () => {
    const tiles: GameTile[] = [{ x: 0, y: 0, ownerId: PLAYER, ownershipState: "SETTLED", resource: "FARM" }];
    const index = buildTileIndex(stateWithTiles(tiles));
    const sites = buildStructureSites(index, { x: 0, y: 0 }, PLAYER, [], AMPLE_RESOURCE_SLOTS);
    expect(sites.map((site) => site.structureType)).toEqual(["WOODEN_FORT"]);
  });

  it("still offers FARMSTEAD with zero free FOOD slots -- it has no slot requirement of its own", () => {
    const tiles: GameTile[] = [{ x: 0, y: 0, ownerId: PLAYER, ownershipState: "SETTLED", resource: "FARM" }];
    const index = buildTileIndex(stateWithTiles(tiles));
    const sites = buildStructureSites(index, { x: 0, y: 0 }, PLAYER, ["agriculture"], NO_FREE_FOOD_SLOTS);
    expect(sites).toEqual([{ x: 0, y: 0, structureType: "FARMSTEAD", manpowerCost: 80 }]);
  });

  it("offers MINE (alongside WOODEN_FORT) on a settled TITANIUM tile once mining is researched and a FOOD slot is free", () => {
    const tiles: GameTile[] = [{ x: 0, y: 0, ownerId: PLAYER, ownershipState: "SETTLED", resource: "TITANIUM" }];
    const index = buildTileIndex(stateWithTiles(tiles));
    const sites = buildStructureSites(index, { x: 0, y: 0 }, PLAYER, ["mining"], AMPLE_RESOURCE_SLOTS);
    expect(sites.map((site) => site.structureType).sort()).toEqual(["MINE", "WOODEN_FORT"]);
  });

  it("excludes MINE when there is no free FOOD slot (MINE's real slot requirement, not TITANIUM)", () => {
    const tiles: GameTile[] = [{ x: 0, y: 0, ownerId: PLAYER, ownershipState: "SETTLED", resource: "TITANIUM" }];
    const index = buildTileIndex(stateWithTiles(tiles));
    const sites = buildStructureSites(index, { x: 0, y: 0 }, PLAYER, ["mining"], NO_FREE_FOOD_SLOTS);
    expect(sites).toHaveLength(0);
  });

  it("does not offer FARMSTEAD on a TITANIUM tile (resource type mismatch)", () => {
    const tiles: GameTile[] = [{ x: 0, y: 0, ownerId: PLAYER, ownershipState: "SETTLED", resource: "TITANIUM" }];
    const index = buildTileIndex(stateWithTiles(tiles));
    const sites = buildStructureSites(index, { x: 0, y: 0 }, PLAYER, ["agriculture", "mining"], AMPLE_RESOURCE_SLOTS);
    expect(sites.find((site) => site.structureType === "FARMSTEAD")).toBeUndefined();
  });

  it("excludes a tile that already has an economic structure", () => {
    const tiles: GameTile[] = [
      { x: 0, y: 0, ownerId: PLAYER, ownershipState: "SETTLED", resource: "FARM", economicStructureJson: "{}" }
    ];
    const index = buildTileIndex(stateWithTiles(tiles));
    const sites = buildStructureSites(index, { x: 0, y: 0 }, PLAYER, ["agriculture"], AMPLE_RESOURCE_SLOTS);
    expect(sites).toHaveLength(0);
  });

  it("excludes FARMSTEAD/MINE on a plain tile with no resource at all, even with both techs researched", () => {
    const tiles: GameTile[] = [{ x: 0, y: 0, ownerId: PLAYER, ownershipState: "SETTLED" }];
    const index = buildTileIndex(stateWithTiles(tiles));
    const sites = buildStructureSites(index, { x: 0, y: 0 }, PLAYER, ["agriculture", "mining"], AMPLE_RESOURCE_SLOTS);
    expect(sites.map((site) => site.structureType)).not.toContain("FARMSTEAD");
    expect(sites.map((site) => site.structureType)).not.toContain("MINE");
  });

  // WOODEN_FORT has no resourceTypes gate (structure-placement-metadata.json)
  // and no tech requirement (absent from TECH_REQUIREMENTS_BY_STRUCTURE) --
  // eligible on any settled tile of the player's from turn 1, unlike
  // FARMSTEAD/MINE.
  it("offers WOODEN_FORT on a plain settled tile with no resource and no tech researched", () => {
    const tiles: GameTile[] = [{ x: 0, y: 0, ownerId: PLAYER, ownershipState: "SETTLED" }];
    const index = buildTileIndex(stateWithTiles(tiles));
    const sites = buildStructureSites(index, { x: 0, y: 0 }, PLAYER, [], AMPLE_RESOURCE_SLOTS);
    expect(sites).toEqual([{ x: 0, y: 0, structureType: "WOODEN_FORT", manpowerCost: 30 }]);
  });

  it("also offers WOODEN_FORT alongside FARMSTEAD on a settled FARM tile", () => {
    const tiles: GameTile[] = [{ x: 0, y: 0, ownerId: PLAYER, ownershipState: "SETTLED", resource: "FARM" }];
    const index = buildTileIndex(stateWithTiles(tiles));
    const sites = buildStructureSites(index, { x: 0, y: 0 }, PLAYER, ["agriculture"], AMPLE_RESOURCE_SLOTS);
    expect(sites.map((site) => site.structureType).sort()).toEqual(["FARMSTEAD", "WOODEN_FORT"]);
  });

  it("excludes WOODEN_FORT when there is no free FOOD slot", () => {
    const tiles: GameTile[] = [{ x: 0, y: 0, ownerId: PLAYER, ownershipState: "SETTLED" }];
    const index = buildTileIndex(stateWithTiles(tiles));
    const sites = buildStructureSites(index, { x: 0, y: 0 }, PLAYER, [], NO_FREE_FOOD_SLOTS);
    expect(sites).toHaveLength(0);
  });

  it("excludes a FARM tile that is only FRONTIER, not SETTLED", () => {
    const tiles: GameTile[] = [{ x: 0, y: 0, ownerId: PLAYER, ownershipState: "FRONTIER", resource: "FARM" }];
    const index = buildTileIndex(stateWithTiles(tiles));
    const sites = buildStructureSites(index, { x: 0, y: 0 }, PLAYER, ["agriculture"], AMPLE_RESOURCE_SLOTS);
    expect(sites).toHaveLength(0);
  });

  describe("WOODEN_FORT placement", () => {
    // 3x3 block of our own settled tiles: only the centre has no outside neighbour.
    const block: GameTile[] = [];
    for (let x = -1; x <= 1; x += 1)
      for (let y = -1; y <= 1; y += 1) block.push({ x, y, ownerId: PLAYER, ownershipState: "SETTLED" });

    it("is not offered on an interior tile, which no enemy can attack from an adjacent tile", () => {
      const sites = buildStructureSites(buildTileIndex(stateWithTiles(block)), { x: 0, y: 0 }, PLAYER, [], AMPLE_RESOURCE_SLOTS);
      expect(sites.some((site) => site.x === 0 && site.y === 0)).toBe(false);
    });

    it("is offered on every border tile of the block (8 of 9)", () => {
      const sites = buildStructureSites(buildTileIndex(stateWithTiles(block)), { x: 0, y: 0 }, PLAYER, [], AMPLE_RESOURCE_SLOTS);
      expect(sites.filter((site) => site.structureType === "WOODEN_FORT")).toHaveLength(8);
    });

    it("still offers an economic structure on an interior resource tile", () => {
      const tiles = block.map((tile) => (tile.x === 0 && tile.y === 0 ? { ...tile, resource: "FARM" } : tile));
      const sites = buildStructureSites(buildTileIndex(stateWithTiles(tiles)), { x: 0, y: 0 }, PLAYER, ["agriculture"], AMPLE_RESOURCE_SLOTS);
      expect(sites.filter((site) => site.x === 0 && site.y === 0).map((site) => site.structureType)).toEqual(["FARMSTEAD"]);
    });
  });
});

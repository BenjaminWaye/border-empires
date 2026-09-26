import { describe, expect, it } from "vitest";
import type { GameInitState, GameTile } from "./game-socket.js";
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
  it("offers FARMSTEAD on a settled FARM tile once agriculture is researched", () => {
    const tiles: GameTile[] = [{ x: 0, y: 0, ownerId: PLAYER, ownershipState: "SETTLED", resource: "FARM" }];
    const index = buildTileIndex(stateWithTiles(tiles));
    const sites = buildStructureSites(index, { x: 0, y: 0 }, PLAYER, ["agriculture"], AMPLE_RESOURCE_SLOTS);
    expect(sites).toEqual([{ x: 0, y: 0, structureType: "FARMSTEAD", manpowerCost: 80 }]);
  });

  it("excludes a FARM tile when agriculture hasn't been researched yet", () => {
    const tiles: GameTile[] = [{ x: 0, y: 0, ownerId: PLAYER, ownershipState: "SETTLED", resource: "FARM" }];
    const index = buildTileIndex(stateWithTiles(tiles));
    const sites = buildStructureSites(index, { x: 0, y: 0 }, PLAYER, [], AMPLE_RESOURCE_SLOTS);
    expect(sites).toHaveLength(0);
  });

  it("still offers FARMSTEAD with zero free FOOD slots -- it has no slot requirement of its own", () => {
    const tiles: GameTile[] = [{ x: 0, y: 0, ownerId: PLAYER, ownershipState: "SETTLED", resource: "FARM" }];
    const index = buildTileIndex(stateWithTiles(tiles));
    const sites = buildStructureSites(index, { x: 0, y: 0 }, PLAYER, ["agriculture"], NO_FREE_FOOD_SLOTS);
    expect(sites).toEqual([{ x: 0, y: 0, structureType: "FARMSTEAD", manpowerCost: 80 }]);
  });

  it("offers MINE on a settled TITANIUM tile once mining is researched and a FOOD slot is free", () => {
    const tiles: GameTile[] = [{ x: 0, y: 0, ownerId: PLAYER, ownershipState: "SETTLED", resource: "TITANIUM" }];
    const index = buildTileIndex(stateWithTiles(tiles));
    const sites = buildStructureSites(index, { x: 0, y: 0 }, PLAYER, ["mining"], AMPLE_RESOURCE_SLOTS);
    expect(sites).toEqual([{ x: 0, y: 0, structureType: "MINE", manpowerCost: 80 }]);
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

  it("excludes a plain tile with no resource at all", () => {
    const tiles: GameTile[] = [{ x: 0, y: 0, ownerId: PLAYER, ownershipState: "SETTLED" }];
    const index = buildTileIndex(stateWithTiles(tiles));
    const sites = buildStructureSites(index, { x: 0, y: 0 }, PLAYER, ["agriculture", "mining"], AMPLE_RESOURCE_SLOTS);
    expect(sites).toHaveLength(0);
  });

  it("excludes a FARM tile that is only FRONTIER, not SETTLED", () => {
    const tiles: GameTile[] = [{ x: 0, y: 0, ownerId: PLAYER, ownershipState: "FRONTIER", resource: "FARM" }];
    const index = buildTileIndex(stateWithTiles(tiles));
    const sites = buildStructureSites(index, { x: 0, y: 0 }, PLAYER, ["agriculture"], AMPLE_RESOURCE_SLOTS);
    expect(sites).toHaveLength(0);
  });
});

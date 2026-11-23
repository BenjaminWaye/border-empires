import { describe, expect, it } from "vitest";
import type { DomainTileState } from "@border-empires/game-domain";
import { WORLD_WIDTH } from "@border-empires/shared";
import { guideTownLeadFor } from "./guide-town-lead.js";

const town = (x: number, y: number, ownerId?: string): DomainTileState =>
  ({ x, y, terrain: "LAND", ...(ownerId ? { ownerId } : {}), town: { name: `T${x}`, populationTier: "TOWN" } }) as unknown as DomainTileState;

const tilesOf = (...list: DomainTileState[]) => new Map(list.map((t) => [`${t.x},${t.y}`, t]));

// Playtest Run 4: a newcomer flew the drone five times over three mornings and never found a town.
describe("guideTownLeadFor", () => {
  it("names the nearest unowned town to the player's AFC, across the map's wrap", () => {
    const tiles = tilesOf(town(40, 10), town(WORLD_WIDTH - 3, 10), town(12, 10, "rival"));
    expect(guideTownLeadFor({ tiles, neutralTileKeys: tiles.keys(), ownedTownTierByTile: new Map(), ownedAfcTileKeys: ["5,10"] })).toEqual({ x: WORLD_WIDTH - 3, y: 10 });
  });

  it("still leads a player whose only town is their landing settlement", () => {
    const tiles = tilesOf(town(20, 10));
    expect(guideTownLeadFor({ tiles, neutralTileKeys: tiles.keys(), ownedTownTierByTile: new Map([["5,11", "SETTLEMENT"]]), ownedAfcTileKeys: ["5,10"] })).toEqual({ x: 20, y: 10 });
  });

  it("gives no lead once the player holds a town, has no AFC, or no unowned town is left", () => {
    const tiles = tilesOf(town(20, 10));
    expect(guideTownLeadFor({ tiles, neutralTileKeys: tiles.keys(), ownedTownTierByTile: new Map([["7,7", "TOWN"]]), ownedAfcTileKeys: ["5,10"] })).toBeUndefined();
    expect(guideTownLeadFor({ tiles, neutralTileKeys: tiles.keys(), ownedTownTierByTile: new Map(), ownedAfcTileKeys: [] })).toBeUndefined();
    const owned = tilesOf(town(20, 10, "rival"));
    expect(guideTownLeadFor({ tiles: owned, neutralTileKeys: owned.keys(), ownedTownTierByTile: new Map(), ownedAfcTileKeys: ["5,10"] })).toBeUndefined();
  });
});

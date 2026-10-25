import { describe, expect, it } from "vitest";
import { WORLD_WIDTH, WORLD_HEIGHT } from "@border-empires/shared";
import { buildDistrictNetwork } from "./district-network.js";
import { districtFixture } from "./district-fixtures.js";
import type { Tile } from "../client-types.js";

const network = (tiles: ReadonlyMap<string, Tile>, candidates: Iterable<Tile> = tiles.values()) =>
  buildDistrictNetwork({ tiles, visibilityAt: (_x, _y, tile) => tile?.fogged ? "fogged" : tile ? "visible" : "unexplored" }, candidates);

describe("town district connections", () => {
  it("connects on login before the town's detailed economy summary is loaded", () => {
    const { tiles, town } = districtFixture();
    town.townType = town.town!.type;
    town.townPopulationTier = town.town!.populationTier;
    delete town.town;
    expect(network(tiles).length).toBeGreaterThan(0);
    town.townPopulationTier = "SETTLEMENT";
    expect(network(tiles)).toEqual([]);
  });
  it("connects all 24 occupied plots and prunes removed branches without moving survivors", () => {
    const { tiles } = districtFixture();
    const buildings: Tile[] = [];
    for (let dy = -2; dy <= 2; dy += 1) for (let dx = -2; dx <= 2; dx += 1) {
      if (!dx && !dy) continue;
      const building = districtFixture("MANUFACTORY", dx, dy).building;
      tiles.set(`${building.x},${building.y}`, building); buildings.push(building);
    }
    const full = network(tiles);
    expect(full.length).toBeGreaterThan(24);
    expect(full.every(edge => !edge.buried)).toBe(true);
    const survivor = buildings[0]!;
    const retained = network(tiles, [survivor]);
    expect(retained.every(edge => full.some(previous => previous.id === edge.id))).toBe(true);
    for (const building of buildings) if (building !== survivor) delete building.economicStructure;
    expect(network(tiles)).toEqual(retained);
    delete survivor.economicStructure;
    expect(network(tiles)).toEqual([]);
  });
  it.each([[1, 0], [1, 1], [2, 0], [2, 2], [-2, 1]])("connects assigned support at %i,%i without changing its tile", (dx, dy) => {
    const { tiles, building } = districtFixture("MANUFACTORY", dx, dy);
    const edges = network(tiles);
    expect(edges.length).toBeGreaterThan(0);
    expect(edges.every(edge => !edge.buried && edge.traceable)).toBe(true);
    expect(building.economicStructure?.supportAnchor).toEqual({ x: 100, y: 100 });
  });
  it("does not guess an assignment when a wire anchor is absent", () => {
    const { tiles, building } = districtFixture();
    delete building.economicStructure?.supportAnchor;
    expect(network(tiles)).toEqual([]);
  });
  it("withdraws links when the anchor is captured or downgraded", () => {
    const { tiles, town } = districtFixture("ANCILLARY_DEPOT", 2, 0);
    town.ownerId = "p2";
    expect(network(tiles)).toEqual([]);
    town.ownerId = "p1";
    if (town.town) town.town.populationTier = "CITY";
    expect(network(tiles)).toEqual([]);
  });
  it("does not reveal a hidden anchor or hidden building", () => {
    const { tiles, town, building } = districtFixture();
    town.fogged = true;
    expect(network(tiles)).toEqual([]);
    town.fogged = false; building.fogged = true;
    expect(network(tiles)).toEqual([]);
  });
  it("uses a buried relationship for a blocked second-ring route", () => {
    const { tiles, building } = districtFixture("AETHER_CONDENSER", 2, 0);
    for (const tile of tiles.values()) if (tile !== building && !tile.town) tile.terrain = "MOUNTAIN";
    expect(network(tiles)).toEqual([expect.objectContaining({ buried: true, townKey: "100,100" })]);
  });
  it("deduplicates shared segments and is independent of arrival order", () => {
    const { tiles, building } = districtFixture("MANUFACTORY", 2, 0);
    const other = { ...building, x: 102, y: 101 };
    tiles.set("102,101", other);
    const a = network(tiles, [building, other]);
    expect(a).toEqual(network(tiles, [other, building]));
    expect(new Set(a.map(edge => edge.id)).size).toBe(a.length);
  });
  it("dims rather than removes a dormant or unfinished service", () => {
    const { tiles, building } = districtFixture();
    if (building.economicStructure) building.economicStructure.status = "under_construction";
    expect(network(tiles).every(edge => !edge.active)).toBe(true);
    expect(network(tiles).length).toBeGreaterThan(0);
    if (building.economicStructure) building.economicStructure.status = "active";
    const dormant = buildDistrictNetwork({ tiles, visibilityAt: () => "visible", isDormant: () => true }, [building]);
    expect(dormant.every(edge => !edge.active)).toBe(true);
  });
  it.each([[0, 100, -1, 0], [100, 0, 0, -1], [WORLD_WIDTH - 1, WORLD_HEIGHT - 1, 1, 1]])("wraps both seams at %i,%i", (x, y, dx, dy) => {
    const { tiles } = districtFixture("MANUFACTORY", dx, dy, x, y);
    const edges = network(tiles);
    expect(edges.length).toBeGreaterThan(0);
    expect(edges.every(edge => edge.from.x >= 0 && edge.from.x < WORLD_WIDTH && edge.from.y >= 0 && edge.from.y < WORLD_HEIGHT)).toBe(true);
  });
});

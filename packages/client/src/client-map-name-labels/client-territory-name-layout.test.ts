import { describe, expect, it } from "vitest";
import type { OwnershipState } from "@border-empires/shared";
import { createInitialState } from "../client-state/client-state.js";
import type { Tile } from "../client-types.js";
import { computeNamePlacements } from "./client-map-name-placements.js";
import { computeTerritoryNameLabels } from "./client-territory-name-layout.js";

const block = (ownerId: string, x0: number, y0: number, w: number, h: number, state: OwnershipState = "SETTLED"): Tile[] => {
  const tiles: Tile[] = [];
  for (let y = y0; y < y0 + h; y += 1) for (let x = x0; x < x0 + w; x += 1) tiles.push({ x, y, terrain: "LAND", ownerId, ownershipState: state });
  return tiles;
};

const options = { width: 64, height: 32 };

describe("computeTerritoryNameLabels", () => {
  it("needs a fully owned 3x3 square before a name appears", () => {
    expect(computeTerritoryNameLabels(block("p1", 5, 5, 8, 2), options)).toEqual([]);
    const [label] = computeTerritoryNameLabels(block("p1", 5, 5, 3, 3), options);
    expect(label).toMatchObject({ ownerId: "p1", tileCount: 9 });
    expect(label!.points[0]!.x).toBeCloseTo(5.5, 5);
    expect(label!.points[1]!.x).toBeCloseTo(6.5, 5);
  });

  it("labels a territory made entirely of frontier land", () => {
    const labels = computeTerritoryNameLabels(block("p1", 5, 5, 3, 3, "FRONTIER"), options);
    expect(labels).toHaveLength(1);
    expect(labels[0]).toMatchObject({ ownerId: "p1", tileCount: 9 });
  });

  it("spreads the name along a longer territory and thickens it with depth", () => {
    const [small] = computeTerritoryNameLabels(block("p1", 0, 0, 3, 3), options);
    const [long] = computeTerritoryNameLabels(block("p1", 10, 10, 20, 3), options);
    const [thick] = computeTerritoryNameLabels(block("p1", 10, 10, 20, 7), options);
    expect(long!.spanTiles).toBeGreaterThan(small!.spanTiles + 10);
    expect(Math.abs(long!.points[long!.points.length - 1]!.y - long!.points[0]!.y)).toBeLessThan(0.01);
    expect(thick!.heightTiles).toBeGreaterThan(long!.heightTiles);
  });

  it("follows a bend in the territory", () => {
    // An L: a long east-west arm and a long north-south arm.
    const tiles = [...block("p1", 0, 0, 16, 3), ...block("p1", 13, 3, 3, 13)];
    const [label] = computeTerritoryNameLabels(tiles, options);
    const ys = label!.points.map((p) => p.y);
    expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThan(2);
  });

  it("labels each player's separate territories and skips excluded owners", () => {
    const tiles = [...block("p1", 0, 0, 3, 3), ...block("p1", 20, 20, 4, 4), ...block("barbarian-1", 40, 5, 5, 5)];
    const labels = computeTerritoryNameLabels(tiles, { ...options, skipOwner: (id) => id.startsWith("barbarian") });
    expect(labels.map((label) => label.ownerId)).toEqual(["p1", "p1"]);
    expect(labels[0]!.tileCount).toBeLessThan(labels[1]!.tileCount);
  });

  it("keeps a territory across the world's edge in one piece", () => {
    const tiles = [...block("p1", 62, 4, 2, 3), ...block("p1", 0, 4, 2, 3)];
    const labels = computeTerritoryNameLabels(tiles, options);
    expect(labels).toHaveLength(1);
    expect(labels[0]!.tileCount).toBe(12);
  });
});

const placePlayerNames = (land: readonly Tile[], isExploredAt: (x: number, y: number) => boolean) => {
  const state = createInitialState();
  state.me = "p1";
  state.meName = "Brass";
  for (const tile of land) state.tiles.set(`${tile.x},${tile.y}`, tile);
  return computeNamePlacements({
    state,
    isExploredAt,
    wrapX: (x) => x,
    wrapY: (y) => y
  }, 1).players;
};

it("fits one player name across connected garrisoned and explored frontier land", () => {
  const land = [...block("p1", 5, 5, 6, 5), ...block("p1", 11, 5, 14, 5, "FRONTIER")];
  const players = placePlayerNames(land, (x) => x < 21);
  expect(players).toHaveLength(1);
  const { path } = players[0]!;
  expect(path.text).toBe("Brass");
  const xs = path.points.map(({ x }) => Math.round(x));
  expect(Math.min(...xs)).toBeLessThan(11);
  expect(Math.max(...xs)).toBe(19);
});

it("keeps one readable name when a thin frontier connects two parallel strips", () => {
  const land = [
    ...block("p1", 10, 10, 40, 5),
    ...block("p1", 10, 15, 1, 9, "FRONTIER"),
    ...block("p1", 10, 24, 40, 5, "FRONTIER")
  ];
  const players = placePlayerNames(land, () => true);
  expect(players).toHaveLength(1);
  const { path } = players[0]!;
  expect(path.spanTiles).toBeGreaterThan(35);
  expect(path.points.every(({ y }) => y <= 14 || y >= 24)).toBe(true);
});

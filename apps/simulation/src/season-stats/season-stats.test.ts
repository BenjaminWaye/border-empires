import { describe, expect, it } from "vitest";
import type { RuntimeExportState } from "../runtime-state-export.js";
import { computeLongestRoad, findMostDeadlyTile } from "./season-stats.js";

type ExportTile = RuntimeExportState["tiles"][number];

const settledTile = (x: number, y: number, ownerId: string, overrides: Partial<ExportTile> = {}): ExportTile => ({
  x,
  y,
  terrain: "LAND",
  ownerId,
  ownershipState: "SETTLED",
  ...overrides
});

const town = (x: number, y: number, ownerId: string, tier: ExportTile["townPopulationTier"] = "TOWN"): ExportTile =>
  settledTile(x, y, ownerId, { townPopulationTier: tier });

describe("findMostDeadlyTile", () => {
  it("returns undefined when no losses were recorded", () => {
    expect(findMostDeadlyTile(new Map())).toBeUndefined();
  });

  it("returns the tile with the highest recorded manpower loss", () => {
    const losses = new Map<string, number>([
      ["3,4", 12],
      ["7,1", 40],
      ["0,0", 39.6]
    ]);
    expect(findMostDeadlyTile(losses)).toEqual({ x: 7, y: 1, manpowerLost: 40 });
  });
});

describe("computeLongestRoad", () => {
  it("returns undefined when there are fewer than two towns", () => {
    const tiles = [town(0, 0, "p1")];
    expect(computeLongestRoad(tiles)).toBeUndefined();
  });

  it("returns undefined when towns of the same owner are not connected by settled land", () => {
    const tiles = [town(0, 0, "p1"), town(50, 50, "p1")];
    expect(computeLongestRoad(tiles)).toBeUndefined();
  });

  it("counts a straight settled chain between two towns", () => {
    const tiles: ExportTile[] = [
      town(0, 0, "p1"),
      settledTile(1, 0, "p1"),
      settledTile(2, 0, "p1"),
      town(3, 0, "p1")
    ];
    expect(computeLongestRoad(tiles)).toEqual({ tileCount: 4 });
  });

  it("picks the longest path across three towns on one road", () => {
    const tiles: ExportTile[] = [
      town(0, 0, "p1"),
      settledTile(1, 0, "p1"),
      town(2, 0, "p1"),
      settledTile(3, 0, "p1"),
      settledTile(4, 0, "p1"),
      town(5, 0, "p1")
    ];
    expect(computeLongestRoad(tiles)).toEqual({ tileCount: 6 });
  });

  it("ignores settled tiles belonging to a different owner", () => {
    const tiles: ExportTile[] = [
      town(0, 0, "p1"),
      settledTile(1, 0, "p2"),
      town(2, 0, "p1")
    ];
    expect(computeLongestRoad(tiles)).toBeUndefined();
  });

  it("ignores unsettled or non-land tiles when connecting towns", () => {
    const tiles: ExportTile[] = [
      town(0, 0, "p1"),
      settledTile(1, 0, "p1", { ownershipState: "FRONTIER" }),
      town(2, 0, "p1")
    ];
    expect(computeLongestRoad(tiles)).toBeUndefined();
  });
});

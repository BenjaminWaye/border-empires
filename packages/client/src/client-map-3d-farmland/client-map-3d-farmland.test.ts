import { describe, expect, it } from "vitest";
import { buildingReplacesFarmlandPlot, farmlandYawAt, type FarmlandPlotTile } from "./client-map-3d-farmland.js";

describe("buildingReplacesFarmlandPlot", () => {
  const structure = (type: NonNullable<FarmlandPlotTile["economicStructure"]>["type"]): FarmlandPlotTile =>
    ({ economicStructure: { ownerId: "p", type, status: "active" } });

  it("drops the plot under any economic structure, not just the hydroponic dome", () => {
    // HYDROWORKS / ORE_REFINERY are district buildings on a low plinth that
    // the plot's crop beds used to bury.
    for (const type of ["HYDROGARDEN", "HYDROWORKS", "ORE_REFINERY", "MINISTRY_HALL"] as const) {
      expect(buildingReplacesFarmlandPlot(structure(type))).toBe(true);
    }
  });

  it("drops the plot under a fort, siege battery or observatory", () => {
    expect(buildingReplacesFarmlandPlot({ fort: { ownerId: "p", status: "active" } })).toBe(true);
    expect(buildingReplacesFarmlandPlot({ siegeBattery: { ownerId: "p", status: "active" } })).toBe(true);
    expect(buildingReplacesFarmlandPlot({ observatory: { ownerId: "p", status: "active" } })).toBe(true);
  });

  it("keeps the plot on a bare farm tile", () => {
    expect(buildingReplacesFarmlandPlot({})).toBe(false);
    expect(buildingReplacesFarmlandPlot(undefined)).toBe(false);
  });
});

describe("farmlandYawAt", () => {
  const yaws = (): number[] => {
    const out: number[] = [];
    for (let x = 0; x < 40; x += 1) for (let y = 0; y < 40; y += 1) out.push(farmlandYawAt(x, y));
    return out;
  };

  it("only ever turns a plot by a multiple of 90 degrees", () => {
    for (const yaw of yaws()) expect(yaw / (Math.PI / 2)).toBeCloseTo(Math.round(yaw / (Math.PI / 2)), 10);
  });

  it("uses all four orientations so neighbouring plots don't all match", () => {
    expect(new Set(yaws().map((yaw) => Math.round(yaw / (Math.PI / 2)))).size).toBe(4);
  });

  it("does not turn most adjacent tiles the same way", () => {
    let same = 0;
    for (let x = 0; x < 39; x += 1) for (let y = 0; y < 40; y += 1) if (farmlandYawAt(x, y) === farmlandYawAt(x + 1, y)) same += 1;
    expect(same / (39 * 40)).toBeLessThan(0.4);
  });

  it("is stable for a given tile", () => {
    expect(farmlandYawAt(123, 456)).toBe(farmlandYawAt(123, 456));
  });
});

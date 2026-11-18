import { describe, expect, it } from "vitest";
import type { ClientState } from "../client-state/client-state.js";
import { slotSourceLabel } from "../client-economy-html/client-economy-slot-sources.js";
import { requiredTechForTileAction, structureTypeForTileAction } from "../client-tile-action-support/client-tile-action-support.js";
import type { Tile } from "../client-types.js";
import { farmPlotTileActions, type FarmPlotActionDeps } from "./farm-plot-tile-actions.js";

const state = (techIds: string[] = []): ClientState =>
  ({ me: "me", techIds, techCatalog: [{ id: "agriculture", name: "Hyperfeed Seedstock Consignment" }], domainIds: [], domainCatalog: [] }) as unknown as ClientState;

const town: Tile = { x: 0, y: 0, ownerId: "me", ownershipState: "SETTLED", town: { populationTier: "TOWN" } } as unknown as Tile;
const plain: Tile = { x: 0, y: 1, ownerId: "me", ownershipState: "SETTLED" } as unknown as Tile;

const deps = (overrides: Partial<FarmPlotActionDeps> = {}): FarmPlotActionDeps => ({
  structureCostText: (type) => `${type} cost`,
  availability: (_type, eligible, reason, cost) => [eligible, reason, cost],
  buildDetailTextForAction: () => "detail",
  townBuildSource: town,
  ...overrides
});

describe("farmPlotTileActions", () => {
  it("offers Build Farm Plot on a plain support tile with no tech, priced with its FOOD", () => {
    const [row] = farmPlotTileActions(state(), plain, deps());
    expect(row).toMatchObject({ id: "build_farm_plot", label: "Build Farm Plot", disabled: false });
    expect(row?.cost).toContain("FARM_PLOT cost");
    expect(row?.cost).toContain("+1 FOOD slot");
  });

  it("offers it on the town tile too (the server places it on an open plot)", () => {
    expect(farmPlotTileActions(state(), town, deps()).map((row) => row.id)).toEqual(["build_farm_plot"]);
  });

  it("hides it on resource tiles and off every town's ring", () => {
    expect(farmPlotTileActions(state(), { ...plain, resource: "FARM" } as Tile, deps())).toEqual([]);
    expect(farmPlotTileActions(state(), plain, deps({ townBuildSource: undefined }))).toEqual([]);
  });

  it("greys it out with the support-placement reason", () => {
    const [row] = farmPlotTileActions(state(), plain, deps({ supportPlacementBlockedReason: "Tile already has structure" }));
    expect(row).toMatchObject({ disabled: true, disabledReason: "Tile already has structure" });
  });

  it("offers the Hydrogarden Plot upgrade on your Farm Plot, locked until Hyperfeed Seedstock", () => {
    const withPlot = { ...plain, economicStructure: { ownerId: "me", type: "FARM_PLOT", status: "active" } } as Tile;
    const [locked] = farmPlotTileActions(state(), withPlot, deps());
    expect(locked).toMatchObject({ id: "build_hydrogarden_plot", label: "Upgrade to Hydrogarden Plot", disabled: true, disabledReason: "Requires Hyperfeed Seedstock Consignment" });
    const [ready] = farmPlotTileActions(state(["agriculture"]), withPlot, deps());
    expect(ready).toMatchObject({ id: "build_hydrogarden_plot", disabled: false });
    expect(ready?.cost).toContain("+3 FOOD slots");
  });

  it("offers nothing on a Hydrogarden Plot or a plot still under construction", () => {
    const upgraded = { ...plain, economicStructure: { ownerId: "me", type: "HYDROGARDEN_PLOT", status: "active" } } as Tile;
    const building = { ...plain, economicStructure: { ownerId: "me", type: "FARM_PLOT", status: "under_construction" } } as Tile;
    expect(farmPlotTileActions(state(["agriculture"]), upgraded, deps({ supportPlacementBlockedReason: "Tile already has structure" }))).toEqual([]);
    expect(farmPlotTileActions(state(["agriculture"]), building, deps())).toEqual([]);
  });
});

describe("Farm Plot action routing", () => {
  it("maps both rows to the structure the server builds, and the upgrade to Hyperfeed Seedstock", () => {
    expect(structureTypeForTileAction("build_farm_plot")).toBe("FARM_PLOT");
    expect(structureTypeForTileAction("build_hydrogarden_plot")).toBe("HYDROGARDEN_PLOT");
    expect(requiredTechForTileAction("build_farm_plot")).toBeUndefined();
    expect(requiredTechForTileAction("build_hydrogarden_plot")).toBe("agriculture");
  });

  it("labels the plots' FOOD in the Economy panel", () => {
    expect(slotSourceLabel({ kind: "STRUCTURE", id: "FARM_PLOT", slots: 2, count: 2 })).toBe("Farm Plot");
    expect(slotSourceLabel({ kind: "STRUCTURE", id: "HYDROGARDEN_PLOT", slots: 3, count: 1 })).toBe("Hydrogarden Plot");
  });
});

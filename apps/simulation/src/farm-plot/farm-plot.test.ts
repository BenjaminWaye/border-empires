import { describe, expect, it } from "vitest";
import { createResourceSlotSourceCollector } from "@border-empires/shared";
import type { DomainTileState } from "@border-empires/game-domain";
import { resourceSlotDormantContributorsForPlayer, resourceSlotSupplyForPlayer } from "../resource-slot-view/resource-slot-view.js";
import { farmPlotAfterCancelledUpgrade, farmPlotFoodSupply } from "./farm-plot.js";

const PLAYER = "p1";
type Structure = NonNullable<DomainTileState["economicStructure"]>;
const plot = (type: Structure["type"], status: Structure["status"] = "active", extra: Partial<Structure> = {}): Structure =>
  ({ ownerId: PLAYER, type, status, ...extra });
const tile = (x: number, y: number, economicStructure?: Structure, resource?: DomainTileState["resource"]) =>
  ({ x, y, ...(resource ? { resource } : {}), ...(economicStructure ? { economicStructure } : {}) });

describe("farmPlotFoodSupply", () => {
  it("gives 1 for an active Farm Plot and 3 for an active Hydrogarden Plot", () => {
    expect(farmPlotFoodSupply(plot("FARM_PLOT"))).toEqual({ type: "FARM_PLOT", slots: 1 });
    expect(farmPlotFoodSupply(plot("HYDROGARDEN_PLOT"))).toEqual({ type: "HYDROGARDEN_PLOT", slots: 3 });
  });

  it("gives nothing while a Farm Plot is being built, switched off or removed", () => {
    expect(farmPlotFoodSupply(plot("FARM_PLOT", "under_construction"))).toBeUndefined();
    expect(farmPlotFoodSupply(plot("FARM_PLOT", "inactive", { inactiveReason: "manual" }))).toBeUndefined();
    expect(farmPlotFoodSupply(plot("FARM_PLOT", "removing"))).toBeUndefined();
  });

  it("keeps the standing Farm Plot's 1 FOOD while its Hydrogarden Plot upgrade builds", () => {
    expect(farmPlotFoodSupply(plot("HYDROGARDEN_PLOT", "under_construction"))).toEqual({ type: "FARM_PLOT", slots: 1 });
  });

  it("ignores every other structure", () => {
    expect(farmPlotFoodSupply(plot("MANUFACTORY"))).toBeUndefined();
    expect(farmPlotFoodSupply(plot("HYDROGARDEN"))).toBeUndefined();
  });
});

describe("Farm Plot slot supply", () => {
  it("adds plot FOOD under its own Economy-panel label without touching tile resources", () => {
    const { sink, rows } = createResourceSlotSourceCollector();
    const totals = resourceSlotSupplyForPlayer(
      [tile(1, 1, plot("FARM_PLOT")), tile(2, 1, plot("FARM_PLOT")), tile(3, 1, plot("HYDROGARDEN_PLOT")), tile(4, 1, undefined, "FARM")],
      new Set(), undefined, undefined, 0, sink
    );
    expect(totals.FOOD).toBe(1 + 1 + 3 + 1);
    expect(rows().FOOD).toEqual(expect.arrayContaining([
      { kind: "STRUCTURE", id: "FARM_PLOT", slots: 2, count: 2 },
      { kind: "STRUCTURE", id: "HYDROGARDEN_PLOT", slots: 3, count: 1 }
    ]));
  });

  it("lets Hydroworks in range boost a Hydrogarden Plot like a Hydrogarden, but not a plain Farm Plot", () => {
    const hydroworks = new Set(["5,5"]);
    expect(resourceSlotSupplyForPlayer([tile(5, 6, plot("HYDROGARDEN_PLOT"))], hydroworks).FOOD).toBe(3 + 2);
    expect(resourceSlotSupplyForPlayer([tile(5, 6, plot("FARM_PLOT"))], hydroworks).FOOD).toBe(1);
    expect(resourceSlotSupplyForPlayer([tile(40, 40, plot("HYDROGARDEN_PLOT"))], hydroworks).FOOD).toBe(3);
  });
});

describe("Farm Plot dormancy", () => {
  const town = { x: 0, y: 0, ownerId: PLAYER, ownershipState: "SETTLED" as const, town: { type: "FARMING" as const, populationTier: "TOWN" as const } };
  const owned = (structure: Structure) => ({ x: 0, y: 1, ownerId: PLAYER, ownershipState: "SETTLED" as const, economicStructure: structure });

  it("one plot does not feed a bare Town (4 FOOD), so the town stays dormant", () => {
    const tiles = [town, owned(plot("FARM_PLOT"))];
    const supply = resourceSlotSupplyForPlayer([tile(0, 1, plot("FARM_PLOT"))]);
    const dormancy = resourceSlotDormantContributorsForPlayer(tiles as never, PLAYER, supply);
    expect(dormancy.FOOD.has("0,0:town")).toBe(true);
  });

  it("a plot never goes dormant itself: it draws no FOOD", () => {
    const tiles = [town, owned(plot("HYDROGARDEN_PLOT"))];
    const dormancy = resourceSlotDormantContributorsForPlayer(tiles as never, PLAYER, resourceSlotSupplyForPlayer([]));
    expect(dormancy.FOOD.has("0,1:economicStructure")).toBe(false);
  });

  it("two upgraded plots (6 FOOD) feed a Town and its Manufactory (5 FOOD)", () => {
    const manufactory = { x: 1, y: 0, ownerId: PLAYER, ownershipState: "SETTLED" as const, economicStructure: plot("MANUFACTORY") };
    const tiles = [town, owned(plot("HYDROGARDEN_PLOT")), { ...owned(plot("HYDROGARDEN_PLOT")), x: 1, y: 1 }, manufactory];
    const supply = resourceSlotSupplyForPlayer([tile(0, 1, plot("HYDROGARDEN_PLOT")), tile(1, 1, plot("HYDROGARDEN_PLOT"))]);
    expect(supply.FOOD).toBe(6);
    const dormancy = resourceSlotDormantContributorsForPlayer(tiles as never, PLAYER, supply);
    expect(dormancy.FOOD.size).toBe(0);
  });
});

describe("farmPlotAfterCancelledUpgrade", () => {
  it("restores an active Farm Plot with its build timers cleared", () => {
    const restored = farmPlotAfterCancelledUpgrade(plot("HYDROGARDEN_PLOT", "under_construction", { startedAt: 1, completesAt: 2, activatedAt: 7 }));
    expect(restored).toEqual({ ownerId: PLAYER, type: "FARM_PLOT", status: "active", activatedAt: 7 });
  });
});

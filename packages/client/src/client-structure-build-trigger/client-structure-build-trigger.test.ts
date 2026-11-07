import { describe, expect, it, vi } from "vitest";
import type { Tile } from "../client-types.js";
import { dispatchGenericBuild, type BuildDispatchDeps } from "./client-structure-build-trigger.js";

describe("town support build optimism", () => {
  it("leaves auto-placed stacking buildings off the town so another copy can be ordered", () => {
    const applyOptimisticStructureBuild = vi.fn();
    const sendDevelopmentBuild: BuildDispatchDeps["sendDevelopmentBuild"] = vi.fn((_payload, optimistic) => { optimistic(); return true; });
    const deps: BuildDispatchDeps = { sendDevelopmentBuild, applyOptimisticStructureBuild, structureDisplayLabel: () => "Manufactory" };
    const town: Tile = { x: 5, y: 5, terrain: "LAND", town: {
      name: "Hub", type: "FARMING", terrainProfile: "GRASS", coastal: false, populationTier: "TOWN",
      population: 25000, maxPopulation: 100000, populationGrowthPerMinute: 10,
      baseGoldPerMinute: 0, goldPerMinute: 0, cap: 0, supportCurrent: 0, supportMax: 8, isFed: true,
      connectedTownCount: 0, connectedTownBonus: 0, hasManufactory: false, manufactoryActive: false,
      hasIncubationEngine: false, incubationEngineActive: false
    } };
    dispatchGenericBuild("MANUFACTORY", town, deps);
    dispatchGenericBuild("MANUFACTORY", town, deps);
    expect(sendDevelopmentBuild).toHaveBeenCalledTimes(2);
    expect(applyOptimisticStructureBuild).not.toHaveBeenCalled();
    dispatchGenericBuild("MANUFACTORY", { x: 6, y: 5, terrain: "LAND" }, deps);
    expect(applyOptimisticStructureBuild).toHaveBeenCalledWith(6, 5, "MANUFACTORY");
  });
});

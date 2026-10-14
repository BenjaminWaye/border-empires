import { describe, expect, it } from "vitest";
import type { TechInfo, Tile } from "../client-types.js";
import { createManifestFitInput } from "./client-manifest-fit-input.js";
import { manifestFit } from "./client-manifest-fit.js";

const farm: Tile = { x: 5, y: 5, terrain: "LAND", ownerId: "me", ownershipState: "SETTLED", resource: "FARM" };
const tech: TechInfo = { id: "agriculture", name: "Seeds", tier: 1, description: "", mods: {}, effects: { unlockHydrogarden: true }, requirements: { gold: 40, resources: {} } };
const slots = { FOOD: 0, TITANIUM: 0, CRYSTAL: 0, UMBRITE: 0 };
const state = (): Parameters<typeof createManifestFitInput>[0] => ({
  me: "me", manpower: 1000, gold: 100,
  resourceSlots: { supply: slots, demand: slots },
  tiles: new Map([["5,5", farm]]), settleProgressByTile: new Map(),
  activeDevelopmentProcessCount: 0, developmentProcessLimit: 1
});
const clues = { clueNearTerritory: () => false, surveyReportFor: () => undefined };

const reasons = (input: Parameters<typeof createManifestFitInput>[0]) => manifestFit(tech, createManifestFitInput(input, clues)).goodPickReasons;

describe("live Manifest fit input", () => {
  it("uses owned Farm eligibility rather than the presence of any nearby Farm", () => {
    expect(reasons(state())).toContain("You can build a Hydrogarden right away");
    expect(reasons({ ...state(), tiles: new Map([["5,5", { ...farm, ownerId: "other" }]]) })).toEqual([]);
  });
  it("does not promise immediate construction when the server reports full development capacity", () => {
    expect(reasons({ ...state(), activeDevelopmentProcessCount: 1 })).toEqual([]);
  });
  it("counts known construction before the server development count catches up", () => {
    const busyTile: Tile = { ...farm, x: 6, observatory: { ownerId: "me", status: "under_construction" } };
    expect(reasons({ ...state(), tiles: new Map([["5,5", farm], ["6,5", busyTile]]) })).toEqual([]);
  });
  it("requires enough coin to unlock the Manifest", () => {
    expect(reasons({ ...state(), gold: 20 })).toEqual([]);
  });
  it("does not recommend the fish bonus from an ungarrisoned or rival Fish tile", () => {
    const fish: Tile = { ...farm, resource: "FISH", ownershipState: "FRONTIER" };
    expect(reasons({ ...state(), tiles: new Map([["5,5", fish]]) })).toEqual([]);
    expect(reasons({ ...state(), tiles: new Map([["5,5", { ...fish, ownershipState: "SETTLED", ownerId: "other" }]]) })).toEqual([]);
  });
});

import { describe, expect, it } from "vitest";
import type { TechInfo, Tile } from "../client-types.js";
import { CLUE_NEARBY_RADIUS, manifestFit, prospectCluesNearTerritory, type ManifestFitInput } from "./client-manifest-fit.js";

const slots = (values: Partial<Record<"FOOD" | "TITANIUM" | "CRYSTAL" | "UMBRITE", number>> = {}) => ({ FOOD: 0, TITANIUM: 0, CRYSTAL: 0, UMBRITE: 0, ...values });

const input = (overrides: Partial<ManifestFitInput> = {}): ManifestFitInput => ({
  me: "me",
  manpower: 0,
  resourceSlots: { supply: slots(), demand: slots() },
  tiles: [],
  surveyReportFor: () => undefined,
  ...overrides
});

const tech = (effects: Record<string, unknown>): TechInfo => ({
  id: "t",
  tier: 1,
  name: "T",
  description: "",
  mods: {},
  effects,
  requirements: { gold: 0, resources: {} }
});

const owned = (x: number, y: number): Tile => ({ x, y, terrain: "LAND", ownerId: "me" });
const clue = (x: number, y: number): Tile => ({ x, y, terrain: "LAND", prospectSignature: "FERROUS_DUST" });

describe("prospectCluesNearTerritory", () => {
  it("counts clue tiles within the radius of your land and gives a direction", () => {
    const result = prospectCluesNearTerritory([owned(50, 50), clue(50, 50 - CLUE_NEARBY_RADIUS), clue(50, 50 - CLUE_NEARBY_RADIUS - 3)], "me", "FERROUS_DUST");
    expect(result).toEqual({ count: 1, direction: "north" });
  });

  it("ignores clues of another resource and returns nothing without land", () => {
    expect(prospectCluesNearTerritory([owned(5, 5), { ...clue(6, 5), prospectSignature: "BLACKWOOD_CANOPY" }], "me", "FERROUS_DUST")).toEqual({ count: 0 });
    expect(prospectCluesNearTerritory([clue(6, 5)], "me", "FERROUS_DUST")).toEqual({ count: 0 });
  });
});

describe("manifestFit", () => {
  it("prefers a survey report over clue tiles for the resource lead", () => {
    const fit = manifestFit(tech({ revealResource: "titanium" }), input({
      tiles: [owned(5, 5), clue(6, 5)],
      surveyReportFor: (resource) =>
        resource === "TITANIUM"
          ? { id: "s", resource, signature: "FERROUS_DUST", x: 1, y: 1, bearing: "North", distanceBand: "NEAR", confidence: "HIGH", text: "" }
          : undefined
    }));
    expect(fit.goodPickReasons).toEqual(["Titanium likely north of a town you took (occupation survey)"]);
  });

  it("says you can build right away when slots and manpower allow", () => {
    const fit = manifestFit(tech({ unlockMine: true }), input({ manpower: 10_000, resourceSlots: { supply: slots({ FOOD: 2 }), demand: slots({ FOOD: 1 }) } }));
    expect(fit.goodPickReasons).toEqual(["You can build a Mine right away"]);
  });

  it("does not claim build-right-away when every slot of that resource is in use", () => {
    const fit = manifestFit(tech({ unlockMine: true }), input({ manpower: 10_000, resourceSlots: { supply: slots({ FOOD: 2 }), demand: slots({ FOOD: 2 }) } }));
    expect(fit.goodPickReasons).toEqual([]);
    expect(fit.notUsefulYet).toBeUndefined();
  });

  it("flags 'not useful yet' when every structure needs a resource you hold none of", () => {
    const fit = manifestFit(tech({ unlockForts: true }), input({ manpower: 10_000 }));
    expect(fit.goodPickReasons).toEqual([]);
    expect(fit.notUsefulYet).toBe("Fort needs Titanium slots, and you hold no Titanium yet");
  });

  it("does not flag 'not useful yet' once you hold that resource", () => {
    const fit = manifestFit(tech({ unlockForts: true }), input({ manpower: 10_000, resourceSlots: { supply: slots({ TITANIUM: 2 }), demand: slots() } }));
    expect(fit.notUsefulYet).toBeUndefined();
    expect(fit.goodPickReasons).toEqual(["You can build a Fort right away"]);
  });

  // Regression: Titanium Works was flagged "needs Titanium slots, and you
  // hold no Titanium yet" -- but in its default mode it supplies Titanium.
  it("makes no slot claim about synthesizers, whose slot use depends on mode", () => {
    const fit = manifestFit(tech({ unlockTitaniumWorks: true }), input({ manpower: 10_000 }));
    expect(fit.goodPickReasons).toEqual([]);
    expect(fit.notUsefulYet).toBeUndefined();
  });
});

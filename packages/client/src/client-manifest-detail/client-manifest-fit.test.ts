import { describe, expect, it } from "vitest";
import type { TechInfo, Tile } from "../client-types.js";
import { CLUE_NEARBY_RADIUS, hasProspectClueNearTerritory, manifestFit, type ManifestFitInput } from "./client-manifest-fit.js";

const slots = (values: Partial<Record<"FOOD" | "TITANIUM" | "CRYSTAL" | "UMBRITE", number>> = {}) => ({ FOOD: 0, TITANIUM: 0, CRYSTAL: 0, UMBRITE: 0, ...values });

const input = (overrides: Partial<ManifestFitInput> = {}): ManifestFitInput => ({
  manpower: 0,
  resourceSlots: { supply: slots(), demand: slots() },
  clueNearTerritory: () => false,
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

describe("hasProspectClueNearTerritory", () => {
  it("finds a clue within the radius of your land, and only within it", () => {
    expect(hasProspectClueNearTerritory([owned(50, 50), clue(50, 50 - CLUE_NEARBY_RADIUS)], "me", "FERROUS_DUST")).toBe(true);
    expect(hasProspectClueNearTerritory([owned(50, 50), clue(50, 50 - CLUE_NEARBY_RADIUS - 1)], "me", "FERROUS_DUST")).toBe(false);
  });

  it("ignores clues of another resource and returns false without land", () => {
    expect(hasProspectClueNearTerritory([owned(5, 5), { ...clue(6, 5), prospectSignature: "BLACKWOOD_CANOPY" }], "me", "FERROUS_DUST")).toBe(false);
    expect(hasProspectClueNearTerritory([clue(6, 5)], "me", "FERROUS_DUST")).toBe(false);
  });
});

describe("manifestFit", () => {
  it("prefers a survey report over clue tiles for the resource lead", () => {
    const fit = manifestFit(tech({ revealResource: "titanium" }), input({
      clueNearTerritory: () => true,
      surveyReportFor: (resource) =>
        resource === "TITANIUM"
          ? { id: "s", resource, signature: "FERROUS_DUST", x: 1, y: 1, bearing: "North", distanceBand: "NEAR", confidence: "HIGH", text: "" }
          : undefined
    }));
    expect(fit.goodPickReasons).toEqual(["A town you garrisoned turned up signs of Titanium nearby"]);
  });

  it("says you can build right away when slots and manpower allow", () => {
    const fit = manifestFit(tech({ unlockMine: true }), input({ manpower: 10_000, resourceSlots: { supply: slots({ FOOD: 2 }), demand: slots({ FOOD: 1 }) } }));
    expect(fit.goodPickReasons).toEqual(["You can build a Mine right away"]);
  });

  // Regression: the reason always said "a", giving "a Ambaric Transformer".
  it("uses 'an' before a building name that starts with a vowel", () => {
    const plenty = slots({ FOOD: 9, TITANIUM: 9, CRYSTAL: 9, UMBRITE: 9 });
    const fit = manifestFit(tech({ unlockAetherTower: true }), input({ manpower: 100_000, resourceSlots: { supply: plenty, demand: slots() } }));
    expect(fit.goodPickReasons).toEqual(["You can build an Ambaric Transformer right away"]);
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

  // Regression: Aether Resonance Core reveals Crystal and unlocks Crystal-slot
  // Aether Towers; "needs Crystal, you hold none" was backwards for the very
  // Manifest that lets you find Crystal.
  it("never calls the revealed resource missing", () => {
    const fit = manifestFit(tech({ revealResource: "crystal", unlockObservatory: true }), input({ manpower: 10_000 }));
    expect(fit.notUsefulYet).toBeUndefined();
  });
});

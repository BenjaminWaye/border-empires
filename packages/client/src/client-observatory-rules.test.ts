import { describe, expect, it } from "vitest";
import { ownObservatoryCastRadius, ownObservatoryProtectionRadius } from "./client-observatory-rules.js";
import type { DomainInfo, TechInfo } from "./client-types.js";

describe("observatory client rules", () => {
  it("adds owned tech and domain observatory bonuses onto the base radii", () => {
    const state = {
      techIds: ["beacon-towers"],
      techCatalog: [
        {
          id: "beacon-towers",
          name: "Aether Amplifiers",
          tier: 4,
          description: "",
          mods: {},
          effects: {
            observatoryCastRadiusBonus: 10,
            observatoryProtectionRadiusBonus: 10
          },
          requirements: { gold: 0, resources: {}, canResearch: true, checklist: [] }
        }
      ] satisfies TechInfo[],
      domainIds: ["sky-mandate"],
      domainCatalog: [
        {
          id: "sky-mandate",
          tier: 3,
          name: "Sky Mandate",
          description: "",
          requiresTechId: "beacon-towers",
          mods: {},
          effects: {
            observatoryCastRadiusBonus: 6,
            observatoryProtectionRadiusBonus: 6
          },
          requirements: { gold: 0, resources: {}, canResearch: true, checklist: [] }
        }
      ] satisfies DomainInfo[]
    };

    expect(ownObservatoryCastRadius(state)).toBe(46);
    expect(ownObservatoryProtectionRadius(state)).toBe(26);
  });
});

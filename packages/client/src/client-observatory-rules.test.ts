import { describe, expect, it } from "vitest";
import { ownObservatoryRange } from "./client-observatory-rules.js";
import type { DomainInfo, TechInfo } from "./client-types.js";

describe("observatory client rules", () => {
  it("returns base OBSERVATORY_RANGE (20) when no tech/domain bonuses are present", () => {
    const state = {
      techIds: [],
      techCatalog: [] satisfies TechInfo[],
      domainIds: [],
      domainCatalog: [] satisfies DomainInfo[]
    };

    expect(ownObservatoryRange(state)).toBe(20);
  });

  it("adds observatoryRangeBonus from owned techs and domains onto the base", () => {
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
            observatoryRangeBonus: 10
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
            observatoryRangeBonus: 6
          },
          requirements: { gold: 0, resources: {}, canResearch: true, checklist: [] }
        }
      ] satisfies DomainInfo[]
    };

    // base 20 + tech 10 + domain 6 = 36
    expect(ownObservatoryRange(state)).toBe(36);
  });

  it("guard: the dead keys observatoryCastRadiusBonus / observatoryProtectionRadiusBonus do NOT affect the result", () => {
    const stateWithDeadKeys = {
      techIds: ["old-tech"],
      techCatalog: [
        {
          id: "old-tech",
          name: "Old Tech",
          tier: 1,
          description: "",
          mods: {},
          effects: {
            // These keys were once supported but are now dead — no catalog entry sets them.
            // They must not move the range number.
            observatoryCastRadiusBonus: 999,
            observatoryProtectionRadiusBonus: 999
          } as Record<string, unknown>,
          requirements: { gold: 0, resources: {}, canResearch: true, checklist: [] }
        }
      ] satisfies TechInfo[],
      domainIds: [],
      domainCatalog: [] satisfies DomainInfo[]
    };

    // Only observatoryRangeBonus moves the number; dead keys must be ignored.
    expect(ownObservatoryRange(stateWithDeadKeys)).toBe(20);
  });
});

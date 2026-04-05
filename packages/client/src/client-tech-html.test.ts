import { describe, expect, it } from "vitest";
import { formatDomainBenefitSummary, formatTechBenefitSummary } from "./client-tech-html.js";
import type { DomainInfo, TechInfo } from "./client-types.js";

describe("tech benefit summaries", () => {
  it("uses the Aether Bridge label for the navigation unlock effect", () => {
    const tech: TechInfo = {
      id: "navigation",
      tier: 4,
      name: "Aether Bridge",
      description: "Unlocks Aether Bridge.",
      mods: {},
      effects: {
        unlockNavalInfiltration: true
      },
      requirements: {
        gold: 9000,
        resources: {
          CRYSTAL: 100,
          SUPPLY: 120
        },
        canResearch: true,
        checklist: []
      }
    };

    expect(formatTechBenefitSummary(tech)).toBe("Unlocks Aether Bridge");
  });

  it("formats shared mod summaries consistently for domains", () => {
    const domain: DomainInfo = {
      id: "watchers",
      tier: 2,
      name: "Watchers",
      description: "Vision-focused domain.",
      requiresTechId: "cartography",
      mods: {
        attack: 1.1,
        vision: 1.2
      },
      effects: {},
      requirements: {
        gold: 1200,
        resources: {
          CRYSTAL: 20
        }
      }
    };

    expect(formatDomainBenefitSummary(domain)).toBe("Attack +10% | Vision +20%");
  });
});

import { describe, expect, it } from "vitest";
import { formatTechBenefitSummary } from "./client-tech-html.js";
import type { TechInfo } from "./client-types.js";

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
});

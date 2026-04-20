import { describe, expect, it } from "vitest";
import { formatTechBenefitSummary, renderTechDetailCardHtml } from "./client-tech-html.js";
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

  it("falls back to gold and resource requirements when checklist labels are missing", () => {
    const tech: TechInfo = {
      id: "surveying",
      tier: 2,
      name: "Surveying",
      description: "Reveal empire stats.",
      mods: {},
      effects: {
        unlockRevealEmpireStats: true,
        visionRadiusBonus: 1
      },
      requirements: {
        gold: 7000,
        resources: {
          CRYSTAL: 60,
          SUPPLY: 60
        },
        canResearch: false,
        checklist: []
      }
    };

    const html = renderTechDetailCardHtml({
      tech,
      statusText: undefined,
      buttonLabel: "Locked",
      buttonDisabled: true,
      prereqs: ["cartography", "toolmaking"],
      prereqText: "Cartography, Toolmaking",
      unlocks: [],
      relatedStructuresHtml: "",
      relatedCrystalAbilitiesHtml: ""
    });

    expect(html).toContain("Gold 7,000");
    expect(html).toContain("CRYSTAL 60");
    expect(html).toContain("SUPPLY 60");
    expect(html).not.toContain("<li>None</li>");
  });
});

import { describe, expect, it } from "vitest";
import { formatTechBenefitSummary, techCurrentModsHtml } from "./client-tech-html.js";
import type { TechInfo } from "../client-types.js";

describe("tech benefit summaries", () => {
  it("shows actual vision radius instead of the generic vision multiplier percentage", () => {
    const cartography: TechInfo = {
      id: "cartography",
      tier: 1,
      name: "Cartography",
      description: "Unlocks observatories.",
      mods: {},
      effects: {
        unlockObservatory: true,
        visionRadiusBonus: 1
      },
      requirements: {
        gold: 2500,
        resources: {
          CRYSTAL: 25
        },
        canResearch: true,
        checklist: []
      }
    };

    const html = techCurrentModsHtml(
      { attack: 1, defense: 1, income: 1, vision: 1 },
      "vision",
      {
        attack: [{ label: "Base", mult: 1 }],
        defense: [{ label: "Base", mult: 1 }],
        income: [{ label: "Base", mult: 1 }],
        vision: [{ label: "Base", mult: 1 }]
      },
      {
        techCatalog: [cartography],
        ownedTechIds: ["cartography"],
        domainCatalog: [],
        domainIds: []
      }
    );

    expect(html).toContain("<span>Vision</span>");
    expect(html).toContain("<strong>5 tiles</strong>");
    expect(html).toContain("<span>Cartography</span>");
    expect(html).toContain("+1 radius");
    expect(html).not.toContain("<span>Income</span>");
    expect(html).not.toContain("<span>Economy</span>");
  });

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

  it("surfaces Aether Lance and Waterworks as visible unlocks", () => {
    const signalFires: TechInfo = {
      id: "signal-fires",
      tier: 2,
      name: "Signal Fires",
      description: "Unlocks Aether Lance.",
      mods: {},
      effects: {
        unlockAetherLance: true,
        visionRadiusBonus: 1
      },
      requirements: {
        gold: 5000,
        resources: {
          CRYSTAL: 60
        },
        canResearch: true,
        checklist: []
      }
    };
    const irrigation: TechInfo = {
      id: "irrigation",
      tier: 2,
      name: "Irrigation",
      description: "Unlocks Waterworks.",
      mods: {},
      effects: {
        unlockWaterworksUpgrade: true,
        townFoodUpkeepMult: 0.95
      },
      requirements: {
        gold: 4500,
        resources: {
          FOOD: 90
        },
        canResearch: true,
        checklist: []
      }
    };

    expect(formatTechBenefitSummary(signalFires)).toContain("Unlocks Aether Purge");
    expect(formatTechBenefitSummary(irrigation)).toContain("Unlocks Waterworks (+100% farmstead food within 10 tiles; raises food cap)");
  });

  it("surfaces Survey Sweep, Siphon, and Lockworks Port as visible unlocks", () => {
    const surveying: TechInfo = {
      id: "surveying",
      tier: 3,
      name: "Surveying",
      description: "Unlocks Survey Sweep.",
      mods: {},
      effects: {
        unlockSurveySweep: true,
        visionRadiusBonus: 1
      },
      requirements: {
        gold: 7000,
        resources: {
          SUPPLY: 60,
          CRYSTAL: 60
        },
        canResearch: true,
        checklist: []
      }
    };
    const logistics: TechInfo = {
      id: "logistics",
      tier: 3,
      name: "Logistics",
      description: "Unlocks Siphon.",
      mods: {},
      effects: {
        unlockSabotage: true,
        settlementSpeedMult: 1.05
      },
      requirements: {
        gold: 7000,
        resources: {
          SUPPLY: 80
        },
        canResearch: true,
        checklist: []
      }
    };
    expect(formatTechBenefitSummary(surveying)).toContain("Unlocks Survey Sweep");
    expect(formatTechBenefitSummary(logistics)).toContain("Unlocks Siphon");
  });

  it("does not render dead tempo text for Organized Supply or Logistics", () => {
    const organizedSupply: TechInfo = {
      id: "organized-supply",
      tier: 4,
      name: "Organized Supply",
      description: "Unlocks Garrison Halls.",
      mods: {},
      effects: {
        unlockGarrisonHall: true,
        outpostSupplyUpkeepMult: 0.8
      },
      requirements: {
        gold: 9500,
        resources: {
          SUPPLY: 140
        },
        canResearch: true,
        checklist: []
      }
    };
    const logistics: TechInfo = {
      id: "logistics",
      tier: 3,
      name: "Logistics",
      description: "Unlocks Siphon.",
      mods: {},
      effects: {
        unlockSabotage: true,
        settlementSpeedMult: 1.05
      },
      requirements: {
        gold: 7000,
        resources: {
          SUPPLY: 80
        },
        canResearch: true,
        checklist: []
      }
    };

    expect(formatTechBenefitSummary(organizedSupply)).toContain("Unlocks garrison halls");
    expect(formatTechBenefitSummary(organizedSupply)).toContain("Outpost supply upkeep -20%");
    expect(formatTechBenefitSummary(organizedSupply)).not.toContain("tempo");
    expect(formatTechBenefitSummary(logistics)).toContain("Unlocks Siphon");
    expect(formatTechBenefitSummary(logistics)).toContain("Settlement speed +5%");
    expect(formatTechBenefitSummary(logistics)).not.toContain("tempo");
  });

  it("surfaces late-game monument and stormfront unlocks without removed strike abilities", () => {
    const resonanceGrid: TechInfo = {
      id: "radar",
      tier: 6,
      name: "Resonance Grid",
      description: "Unlocks resonance grids and Stormfront.",
      mods: {},
      effects: {
        unlockRadarSystem: true,
        unlockStormfront: true,
        visionRadiusBonus: 1
      },
      requirements: { gold: 24000, resources: { CRYSTAL: 280, SHARD: 2 }, checklist: [], canResearch: true }
    };
    const aegisDome: TechInfo = {
      id: "aegis-dome",
      tier: 6,
      name: "Aegis Dome",
      description: "Unlocks the Aegis Dome and Aegis Lock.",
      mods: {},
      effects: {
        unlockAegisDome: true,
        unlockAegisLock: true
      },
      requirements: { gold: 26000, resources: { CRYSTAL: 300, SHARD: 3 }, checklist: [], canResearch: true }
    };

    expect(formatTechBenefitSummary(resonanceGrid)).toContain("Unlocks Stormfront");
    expect(formatTechBenefitSummary(aegisDome)).toContain("Unlocks Aegis Dome");
    expect(formatTechBenefitSummary(aegisDome)).toContain("Unlocks Aegis Lock");
  });
});

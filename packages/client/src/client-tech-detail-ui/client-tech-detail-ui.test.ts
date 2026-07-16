import { describe, expect, it } from "vitest";
import { relatedStructureTypesForTech, renderTechDetailCard, renderTechDetailModal, renderTechDetailPrompt } from "./client-tech-detail-ui.js";
import { structureInfoForKey } from "../client-map-display.js";
import type { TechInfo } from "../client-types.js";

const cryptographyTech: TechInfo = {
  id: "cryptography",
  tier: 5,
  name: "Cipher Bureaus",
  description: "Spies improve dramatically once given clerks and a budget.",
  mods: {},
  effects: {
    unlockAetherEmp: true,
    revealUpkeepMult: 0.8,
    sabotageCooldownMult: 0.85
  },
  requirements: {
    gold: 14500,
    resources: {
      CRYSTAL: 200,
      SHARD: 1
    },
    checklist: [],
    canResearch: true
  }
};

describe("tech detail crystal ability previews", () => {
  it("does not render the tech detail helper placeholder", () => {
    expect(renderTechDetailPrompt()).toBe("");
  });

  it("shows crystal ability preview buttons in the inline tech detail card", () => {
    const html = renderTechDetailCard({
      tech: cryptographyTech,
      techDetailOpen: true,
      techCatalog: [cryptographyTech],
      ownedTechIds: [],
      techPrereqIds: () => [],
      unlockedByTech: () => [],
      isPendingTechUnlock: () => false,
      pendingTechUnlockId: "",
      techNameList: () => "",
      structureInfoButtonHtml: () => "",
      techTier: () => 5
    });

    expect(html).toContain("Abilities & actions:");
    expect(html).toContain('data-crystal-ability-info="aether_emp"');
  });

  it("shows crystal ability preview buttons in the modal tech detail view", () => {
    const html = renderTechDetailModal({
      tech: cryptographyTech,
      techCatalog: [cryptographyTech],
      ownedTechIds: [],
      techPrereqIds: () => [],
      unlockedByTech: () => [],
      isPendingTechUnlock: () => false,
      pendingTechUnlockId: "",
      techNameList: () => "",
      structureInfoButtonHtml: () => "",
      techTier: () => 5,
      formatTechBenefitSummary: () => "Unlocks reveal empire | Unlocks Siphon"
    });

    expect(html).toContain("Abilities & actions");
    expect(html).toContain('data-crystal-ability-info="aether_emp"');
  });

  it("shows owned techs as unlocked instead of locked", () => {
    const html = renderTechDetailCard({
      tech: cryptographyTech,
      techDetailOpen: true,
      techCatalog: [cryptographyTech],
      ownedTechIds: ["cryptography"],
      techPrereqIds: () => [],
      unlockedByTech: () => [],
      isPendingTechUnlock: () => false,
      pendingTechUnlockId: "",
      techNameList: () => "",
      structureInfoButtonHtml: () => "",
      techTier: () => 5
    });

    expect(html).toContain("Already unlocked.");
    expect(html).toContain(">Unlocked<");
    expect(html).not.toContain(">Locked<");
  });

  it("maps irrigation to Waterworks only", () => {
    const irrigationTech: TechInfo = {
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
        checklist: [],
        canResearch: true
      }
    };

    expect(relatedStructureTypesForTech(irrigationTech)).toEqual(["WATERWORKS"]);
  });

  it("maps organized supply and port infrastructure to their real structure unlocks", () => {
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
        checklist: [],
        canResearch: true
      }
    };
    expect(relatedStructureTypesForTech(organizedSupply)).toEqual(["GARRISON_HALL"]);
  });

  it("maps later structure unlocks to their real labels instead of stale legacy structures", () => {
    const globalTradeNetworks: TechInfo = {
      id: "global-trade-networks",
      tier: 5,
      name: "Rail Networks",
      description: "Unlocks Rail Depots.",
      mods: {},
      effects: {
        unlockRailDepot: true
      },
      requirements: { gold: 15000, resources: { SUPPLY: 160, CRYSTAL: 220, SHARD: 1 }, checklist: [], canResearch: true }
    };
    const civilService: TechInfo = {
      id: "civil-service",
      tier: 5,
      name: "Civil Service",
      description: "Unlocks ministry halls.",
      mods: {},
      effects: {
        unlockGovernorsOffice: true,
        townFoodUpkeepMult: 0.9,
        settledGoldUpkeepMult: 0.9
      },
      requirements: { gold: 15000, resources: { FOOD: 180, CRYSTAL: 140, SHARD: 1 }, checklist: [], canResearch: true }
    };
    const crystalLattices: TechInfo = {
      id: "crystal-lattices",
      tier: 3,
      name: "Crystal Lattices",
      description: "Unlocks aether condensers.",
      mods: {},
      effects: {
        unlockCrystalSynthesizer: true
      },
      requirements: { gold: 6500, resources: { IRON: 60 }, checklist: [], canResearch: true }
    };
    const aegisDome: TechInfo = {
      id: "aegis-dome",
      tier: 6,
      name: "Aegis Dome",
      description: "Unlocks the Aegis Dome.",
      mods: {},
      effects: {
        unlockAegisDome: true,
        unlockAegisLock: true
      },
      requirements: { gold: 26000, resources: { CRYSTAL: 300, SHARD: 3 }, checklist: [], canResearch: true }
    };
    const imperialExchange: TechInfo = {
      id: "urban-markets",
      tier: 6,
      name: "Imperial Exchange",
      description: "Unlocks the Imperial Exchange.",
      mods: {},
      effects: {
        unlockImperialExchange: true
      },
      requirements: { gold: 26000, resources: { CRYSTAL: 320, SHARD: 3 }, checklist: [], canResearch: true }
    };
    const worldEngine: TechInfo = {
      id: "world-engine",
      tier: 7,
      name: "Worldbreaker Cannon",
      description: "Unlocks the Worldbreaker Cannon.",
      mods: {},
      effects: {
        unlockWorldEngine: true
      },
      requirements: { gold: 26000, resources: { IRON: 260, CRYSTAL: 280, SHARD: 3 }, checklist: [], canResearch: true }
    };

    expect(relatedStructureTypesForTech(globalTradeNetworks)).toEqual(["RAIL_DEPOT"]);
    expect(relatedStructureTypesForTech(civilService)).toEqual(["GOVERNORS_OFFICE"]);
    expect(relatedStructureTypesForTech(crystalLattices)).toEqual(["CRYSTAL_SYNTHESIZER"]);
    expect(relatedStructureTypesForTech(imperialExchange)).toEqual(["IMPERIAL_EXCHANGE_PART", "IMPERIAL_EXCHANGE"]);
    expect(relatedStructureTypesForTech(worldEngine)).toEqual(["WORLD_ENGINE_PART", "WORLD_ENGINE"]);
    expect(relatedStructureTypesForTech(aegisDome)).toEqual(["AEGIS_DOME_PART", "AEGIS_DOME"]);
  });

  it("renders live structure titles for upgrade-based tech unlocks", () => {
    const deps = {
      formatCooldownShort: () => "10m",
      prettyToken: (value: string) => value
    };

    expect(structureInfoForKey("WATERWORKS", deps).title).toBe("Waterworks");
    expect(structureInfoForKey("RAIL_DEPOT", deps).title).toBe("Rail Depot");
    expect(structureInfoForKey("GOVERNORS_OFFICE", deps).title).toBe("Ministry Hall");
    expect(structureInfoForKey("CRYSTAL_SYNTHESIZER", deps).title).toBe("Aether Condenser");
    expect(structureInfoForKey("IRON_BASTION", deps).title).toBe("Iron Bastion");
    expect(structureInfoForKey("THUNDER_BASTION", deps).title).toBe("Thunder Bastion");
    expect(structureInfoForKey("SIEGE_TOWER", deps).title).toBe("Siege Tower");
    expect(structureInfoForKey("DREAD_TOWER", deps).title).toBe("Dread Tower");
    expect(structureInfoForKey("ASTRAL_DOCK_PART", deps).title).toBe("Astral Dock Part");
    expect(structureInfoForKey("ASTRAL_DOCK", deps).title).toBe("Astral Dock");
  });

  it("renders numeric structure descriptions where the runtime defines real numbers", () => {
    const deps = {
      formatCooldownShort: () => "10m",
      prettyToken: (value: string) => value
    };

    expect(structureInfoForKey("WATERWORKS", deps).detail).toContain("+100%");
    expect(structureInfoForKey("RAIL_DEPOT", deps).detail).toContain("20 tiles");
    expect(structureInfoForKey("AETHER_TOWER", deps).detail).toContain("30-tile");
    expect(structureInfoForKey("IMPERIAL_EXCHANGE", deps).detail).toContain("60 minutes");
    expect(structureInfoForKey("WORLD_ENGINE", deps).title).toBe("Worldbreaker Cannon");
    expect(structureInfoForKey("WORLD_ENGINE", deps).detail).toContain("90 minutes");
    expect(structureInfoForKey("AEGIS_DOME", deps).detail).toContain("15-minute");
    expect(structureInfoForKey("IRON_BASTION", deps).effects.join(" ")).toContain("Raises Fort defense from 2.5x to 4x");
    expect(structureInfoForKey("THUNDER_BASTION", deps).effects.join(" ")).toContain("Raises Fort defense from 4x to 8x");
    expect(structureInfoForKey("SIEGE_TOWER", deps).effects.join(" ")).toContain("Raises Siege Outpost attack from 1.6x to 1.8x");
    expect(structureInfoForKey("DREAD_TOWER", deps).effects.join(" ")).toContain("Raises Siege attack from 1.8x to 2.0x");
    expect(structureInfoForKey("IRON_BASTION", deps).costBits).toEqual(["1,800 gold", "90 iron"]);
    expect(structureInfoForKey("THUNDER_BASTION", deps).costBits).toEqual(["4,200 gold", "180 iron"]);
    expect(structureInfoForKey("SIEGE_TOWER", deps).costBits).toEqual(["1,800 gold", "90 supply", "60 iron"]);
    expect(structureInfoForKey("DREAD_TOWER", deps).costBits).toEqual(["4,200 gold", "140 supply", "120 iron"]);
  });

  it("provides structure art for dedicated economic overlays", () => {
    const deps = {
      formatCooldownShort: () => "10m",
      prettyToken: (value: string) => value
    };

    expect(structureInfoForKey("EXCHANGE_HOUSE", deps).image).toBe("/overlays/exchange-house-overlay.svg");
    expect(structureInfoForKey("CLEARING_HOUSE", deps).image).toBe("/overlays/clearing-house-overlay.svg");
    expect(structureInfoForKey("RAIL_DEPOT", deps).image).toBe("/overlays/rail-depot-overlay.svg");
    expect(structureInfoForKey("AEGIS_DOME", deps).image).toBe("/overlays/aegis-dome-overlay.svg");
    expect(structureInfoForKey("ASTRAL_DOCK", deps).image).toBe("/overlays/astral-dock-overlay.svg");
    expect(structureInfoForKey("IMPERIAL_EXCHANGE", deps).image).toBe("/overlays/imperial-exchange-overlay.svg");
    expect(structureInfoForKey("WORLD_ENGINE", deps).image).toBe("/overlays/world-engine-overlay.svg");
  });
});

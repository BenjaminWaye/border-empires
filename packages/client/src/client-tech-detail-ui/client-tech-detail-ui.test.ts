import { describe, expect, it } from "vitest";
import { relatedStructureTypesForTech, renderStructureInfoOverlay, renderTechDetailCard, renderTechDetailModal, renderTechDetailPrompt } from "./client-tech-detail-ui.js";
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
      techTier: () => 5
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
        outpostUmbriteSlotWaiverCount: 3
      },
      requirements: {
        gold: 9500,
        resources: {
          UMBRITE: 140
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
      requirements: { gold: 15000, resources: { UMBRITE: 160, CRYSTAL: 220, SHARD: 1 }, checklist: [], canResearch: true }
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
      requirements: { gold: 6500, resources: { TITANIUM: 60 }, checklist: [], canResearch: true }
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
      id: "urban-mintworks",
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
      requirements: { gold: 26000, resources: { TITANIUM: 260, CRYSTAL: 280, SHARD: 3 }, checklist: [], canResearch: true }
    };

    expect(relatedStructureTypesForTech(globalTradeNetworks)).toEqual(["RAIL_DEPOT"]);
    expect(relatedStructureTypesForTech(civilService)).toEqual(["GOVERNORS_OFFICE"]);
    expect(relatedStructureTypesForTech(crystalLattices)).toEqual(["CRYSTAL_SYNTHESIZER"]);
    expect(relatedStructureTypesForTech(imperialExchange)).toEqual(["IMPERIAL_EXCHANGE_PART_1", "IMPERIAL_EXCHANGE_PART_2", "IMPERIAL_EXCHANGE_PART_3", "IMPERIAL_EXCHANGE"]);
    expect(relatedStructureTypesForTech(worldEngine)).toEqual(["WORLD_ENGINE_PART_1", "WORLD_ENGINE_PART_2", "WORLD_ENGINE_PART_3", "WORLD_ENGINE"]);
    expect(relatedStructureTypesForTech(aegisDome)).toEqual(["AEGIS_DOME_PART_1", "AEGIS_DOME_PART_2", "AEGIS_DOME_PART_3", "AEGIS_DOME"]);
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
    expect(structureInfoForKey("TITANIUM_BASTION", deps).title).toBe("Titanium Bastion");
    expect(structureInfoForKey("THUNDER_BASTION", deps).title).toBe("Thunder Bastion");
    expect(structureInfoForKey("SIEGE_TOWER", deps).title).toBe("Siege Tower");
    expect(structureInfoForKey("DREAD_TOWER", deps).title).toBe("Dread Tower");
    expect(structureInfoForKey("ASTRAL_DOCK_PART_1", deps).title).toBe("Launch Cradle");
    expect(structureInfoForKey("ASTRAL_DOCK", deps).title).toBe("Astral Dock");
  });

  it("renders numeric structure descriptions where the runtime defines real numbers", () => {
    const deps = {
      formatCooldownShort: () => "10m",
      prettyToken: (value: string) => value
    };

    expect(structureInfoForKey("WATERWORKS", deps).detail).toContain("+2 FOOD slots");
    expect(structureInfoForKey("RAIL_DEPOT", deps).detail).toContain("50 tiles");
    expect(structureInfoForKey("AETHER_TOWER", deps).detail).toContain("30-tile");
    expect(structureInfoForKey("IMPERIAL_EXCHANGE", deps).detail).toContain("24 hours");
    expect(structureInfoForKey("WORLD_ENGINE", deps).title).toBe("Worldbreaker Cannon");
    expect(structureInfoForKey("WORLD_ENGINE", deps).detail).toContain("10 minutes");
    expect(structureInfoForKey("AEGIS_DOME", deps).detail).toContain("15-minute");
    // Fort/siege multiplier numbers now live in `modifiers` (the shared
    // game-domain catalog), not the qualitative `effects` bullets.
    expect(structureInfoForKey("TITANIUM_BASTION", deps).modifiers).toContainEqual({ statLabel: "Defense", valueText: "4x", tone: "positive", isTownWide: false });
    expect(structureInfoForKey("THUNDER_BASTION", deps).modifiers).toContainEqual({ statLabel: "Defense", valueText: "8x", tone: "positive", isTownWide: false });
    expect(structureInfoForKey("SIEGE_TOWER", deps).modifiers).toContainEqual({ statLabel: "Offense", valueText: "+80%", tone: "positive", isTownWide: false });
    expect(structureInfoForKey("DREAD_TOWER", deps).modifiers).toContainEqual({ statLabel: "Offense", valueText: "+100%", tone: "positive", isTownWide: false });
    expect(structureInfoForKey("TITANIUM_BASTION", deps).costBits).toEqual(["1,800 gold", "480 manpower"]);
    expect(structureInfoForKey("THUNDER_BASTION", deps).costBits).toEqual(["4,200 gold", "960 manpower"]);
    expect(structureInfoForKey("SIEGE_TOWER", deps).costBits).toEqual(["1,800 gold", "60 manpower"]);
    expect(structureInfoForKey("DREAD_TOWER", deps).costBits).toEqual(["4,200 gold", "60 manpower"]);
    // Resource slot requirements live in the upkeep box, not the one-time
    // cost box — a slot is a permanent ongoing occupation, not a build cost.
    expect(structureInfoForKey("TITANIUM_BASTION", deps).upkeepBits).toEqual(["2 TITANIUM slots"]);
    expect(structureInfoForKey("THUNDER_BASTION", deps).upkeepBits).toEqual(["4 TITANIUM slots"]);
    expect(structureInfoForKey("SIEGE_TOWER", deps).upkeepBits).toEqual(["2 UMBRITE slots", "1 TITANIUM slot"]);
    expect(structureInfoForKey("DREAD_TOWER", deps).upkeepBits).toEqual(["3 UMBRITE slots", "2 TITANIUM slots"]);
  });

  it("provides structure art for dedicated economic overlays", () => {
    const deps = {
      formatCooldownShort: () => "10m",
      prettyToken: (value: string) => value
    };

    expect(structureInfoForKey("CLEARING_HOUSE", deps).image).toBe("/overlays/clearing-house-overlay.svg");
    expect(structureInfoForKey("RAIL_DEPOT", deps).image).toBe("/overlays/rail-depot-overlay.svg");
    expect(structureInfoForKey("AEGIS_DOME", deps).image).toBe("/overlays/aegis-dome-overlay.svg");
    expect(structureInfoForKey("ASTRAL_DOCK", deps).image).toBe("/overlays/astral-dock-overlay.svg");
    expect(structureInfoForKey("IMPERIAL_EXCHANGE", deps).image).toBe("/overlays/imperial-exchange-overlay.svg");
    expect(structureInfoForKey("WORLD_ENGINE", deps).image).toBe("/overlays/world-engine-overlay.svg");
  });
});

// Regression coverage for real bugs found in the tech detail UI:
// - the yellow "Unlocks X | Unlocks Y" text summary was redundant with the
//   tag chips and is now removed from both the inline card and the modal.
// - a tech whose only highlight is a single structure unlock (e.g. Supply
//   Directorate -> Ancillary Factory) used to render NO tags at all
//   (shouldRenderUnlockHighlights suppressed them), leaving just the yellow
//   text -- now it always shows its tag(s).
describe("tech detail highlight tags replace the yellow unlock-summary text", () => {
  const supplyDirectorate: TechInfo = {
    id: "organized-supply",
    tier: 1,
    name: "Supply Directorate",
    description: "Armies march on paperwork, then complain about the rations.",
    mods: {},
    effects: { unlockGarrisonHall: true },
    requirements: { gold: 10, resources: {}, checklist: [], canResearch: true }
  };

  const commonDeps = {
    techCatalog: [supplyDirectorate],
    ownedTechIds: [],
    techPrereqIds: () => [],
    unlockedByTech: () => [],
    isPendingTechUnlock: () => false,
    pendingTechUnlockId: "",
    techNameList: () => "",
    structureInfoButtonHtml: () => "",
    techTier: () => 1
  };

  it("shows the Ancillary Factory tag on the inline card instead of only yellow text", () => {
    const html = renderTechDetailCard({ tech: supplyDirectorate, techDetailOpen: true, ...commonDeps });
    expect(html).toContain("Ancillary Factory");
    expect(html).toContain("tech-payoff-chip");
    expect(html).not.toContain("tech-detail-effect");
  });

  it("shows the Ancillary Factory tag on the modal instead of only yellow text", () => {
    const html = renderTechDetailModal({ tech: supplyDirectorate, ...commonDeps });
    expect(html).toContain("Ancillary Factory");
    expect(html).toContain("tech-payoff-chip");
    expect(html).not.toContain("tech-detail-effect");
    expect(html).not.toContain("Unlocks garrison halls");
  });

  it("shows every highlight tag on the inline card, not capped at 2", () => {
    const html = renderTechDetailCard({ tech: cryptographyTech, techDetailOpen: true, ...commonDeps, techCatalog: [cryptographyTech] });
    expect(html).toContain("Aether EMP");
  });
});

describe("renderStructureInfoOverlay monument components checklist", () => {
  const structureInfoDeps = { formatCooldownShort: () => "10m", prettyToken: (value: string) => value };
  const boundStructureInfoForKey = (type: Parameters<typeof structureInfoForKey>[0]) => structureInfoForKey(type, structureInfoDeps);

  it("lists all 3 components as Not built and reads not-ready when the player owns none", () => {
    const html = renderStructureInfoOverlay("ASTRAL_DOCK", boundStructureInfoForKey, new Set());
    expect(html).toContain("Monument Components");
    expect(html).toContain("Launch Cradle");
    expect(html).toContain("Orbital Array");
    expect(html).toContain("Aether Sail");
    expect(html).toContain("0/3");
    expect(html).toContain("Monument not ready");
    expect(html).not.toContain("structure-info-component-complete");
  });

  it("marks owned components Complete and reads Monument Ready once all 3 are owned", () => {
    const html = renderStructureInfoOverlay(
      "ASTRAL_DOCK",
      boundStructureInfoForKey,
      new Set(["ASTRAL_DOCK_PART_1", "ASTRAL_DOCK_PART_2", "ASTRAL_DOCK_PART_3"])
    );
    expect(html).toContain("3/3");
    expect(html).toContain("Monument Ready");
    expect(html.match(/structure-info-component-complete/g)?.length).toBe(3);
  });

  it("omits the checklist entirely for a non-monument structure", () => {
    const html = renderStructureInfoOverlay("FORT", boundStructureInfoForKey, new Set());
    expect(html).not.toContain("Monument Components");
  });
});

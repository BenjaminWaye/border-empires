import { describe, expect, it } from "vitest";
import { relatedStructureTypesForTech, renderTechDetailPrompt } from "./client-tech-detail-ui.js";
import { structureInfoForKey } from "../client-map-display.js";
import type { TechInfo } from "../client-types.js";

describe("tech detail structure mapping", () => {
  it("does not render the tech detail helper placeholder", () => {
    expect(renderTechDetailPrompt()).toBe("");
  });

  // Regression: the catalog's key is unlockUmbriteRig, but this mapper only
  // knew the retired unlockCamp, so Rigging Works never listed its rig.
  it("maps the Umbrite Rig unlock key to the Umbrite Rig", () => {
    expect(relatedStructureTypesForTech({ effects: { unlockUmbriteRig: true } })).toEqual(["UMBRITE_RIG"]);
  });

  it("maps irrigation to Hydroworks only", () => {
    const irrigationTech: TechInfo = {
      id: "irrigation",
      tier: 2,
      name: "Irrigation",
      description: "Unlocks Hydroworks.",
      mods: {},
      effects: {
        unlockHydroworksUpgrade: true,
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

    expect(relatedStructureTypesForTech(irrigationTech)).toEqual(["HYDROWORKS"]);
  });

  it("maps organized supply and port infrastructure to their real structure unlocks", () => {
    const organizedSupply: TechInfo = {
      id: "organized-supply",
      tier: 4,
      name: "Organized Supply",
      description: "Unlocks Ancillary Depots.",
      mods: {},
      effects: {
        unlockAncillaryDepot: true,
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
    expect(relatedStructureTypesForTech(organizedSupply)).toEqual(["ANCILLARY_DEPOT"]);
  });

  it("maps later structure unlocks to their real labels instead of stale legacy structures", () => {
    const globalTradeNetworks: TechInfo = {
      id: "global-trade-networks",
      tier: 5,
      name: "Rail Networks",
      description: "Unlocks Neural Works.",
      mods: {},
      effects: {
        unlockNeuralWorks: true
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
        unlockMinistryHall: true,
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
        unlockAetherCondenser: true
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
    const sovereignSiegeEngine: TechInfo = {
      id: "world-engine",
      tier: 7,
      name: "Worldbreaker Cannon",
      description: "Unlocks the Worldbreaker Cannon.",
      mods: {},
      effects: {
        unlockSovereignSiegeEngine: true
      },
      requirements: { gold: 26000, resources: { TITANIUM: 260, CRYSTAL: 280, SHARD: 3 }, checklist: [], canResearch: true }
    };

    expect(relatedStructureTypesForTech(globalTradeNetworks)).toEqual(["NEURAL_WORKS"]);
    expect(relatedStructureTypesForTech(civilService)).toEqual(["MINISTRY_HALL"]);
    expect(relatedStructureTypesForTech(crystalLattices)).toEqual(["AETHER_CONDENSER"]);
    expect(relatedStructureTypesForTech(imperialExchange)).toEqual(["IMPERIAL_EXCHANGE_PART_1", "IMPERIAL_EXCHANGE_PART_2", "IMPERIAL_EXCHANGE_PART_3", "IMPERIAL_EXCHANGE"]);
    expect(relatedStructureTypesForTech(sovereignSiegeEngine)).toEqual(["SOVEREIGN_SIEGE_ENGINE_PART_1", "SOVEREIGN_SIEGE_ENGINE_PART_2", "SOVEREIGN_SIEGE_ENGINE_PART_3", "SOVEREIGN_SIEGE_ENGINE"]);
    expect(relatedStructureTypesForTech(aegisDome)).toEqual(["AEGIS_DOME_PART_1", "AEGIS_DOME_PART_2", "AEGIS_DOME_PART_3", "AEGIS_DOME"]);
  });

  it("renders live structure titles for upgrade-based tech unlocks", () => {
    const deps = {
      formatCooldownShort: () => "10m",
      prettyToken: (value: string) => value
    };

    expect(structureInfoForKey("HYDROWORKS", deps).title).toBe("Hydroworks");
    expect(structureInfoForKey("NEURAL_WORKS", deps).title).toBe("Neural Works");
    expect(structureInfoForKey("MINISTRY_HALL", deps).title).toBe("Ministry Hall");
    expect(structureInfoForKey("AETHER_CONDENSER", deps).title).toBe("Aether Condenser");
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

    expect(structureInfoForKey("HYDROWORKS", deps).detail).toContain("+2 FOOD slots");
    expect(structureInfoForKey("NEURAL_WORKS", deps).detail).toContain("50 tiles");
    expect(structureInfoForKey("AMBARIC_TRANSFORMER", deps).detail).toContain("30-tile");
    expect(structureInfoForKey("IMPERIAL_EXCHANGE", deps).detail).toContain("24 hours");
    expect(structureInfoForKey("SOVEREIGN_SIEGE_ENGINE", deps).title).toBe("Sovereign Siege Engine");
    expect(structureInfoForKey("SOVEREIGN_SIEGE_ENGINE", deps).detail).toContain("10 minutes");
    expect(structureInfoForKey("AEGIS_DOME", deps).detail).toContain("15-minute");
    // Fort/siege multiplier numbers now live in `modifiers` (the shared
    // game-domain catalog), not the qualitative `effects` bullets.
    expect(structureInfoForKey("TITANIUM_BASTION", deps).modifiers).toContainEqual({ statLabel: "Defense", valueText: "4x", tone: "positive", isTownWide: false });
    expect(structureInfoForKey("THUNDER_BASTION", deps).modifiers).toContainEqual({ statLabel: "Defense", valueText: "6.5x", tone: "positive", isTownWide: false });
    expect(structureInfoForKey("SIEGE_TOWER", deps).modifiers).toContainEqual({ statLabel: "Offense", valueText: "+80%", tone: "positive", isTownWide: false });
    expect(structureInfoForKey("DREAD_TOWER", deps).modifiers).toContainEqual({ statLabel: "Offense", valueText: "+100%", tone: "positive", isTownWide: false });
    // docs/replenishment-update-plan.md D17: these now read live from
    // FORT_TIER_LADDER/SIEGE_TIER_LADDER (client-structure-cost-bits.ts)
    // instead of hand-maintained literals -- no gold shown since build gold
    // is zeroed, and D13 scales siege manpower 60/120/240.
    expect(structureInfoForKey("TITANIUM_BASTION", deps).costBits).toEqual(["480 manpower"]);
    expect(structureInfoForKey("THUNDER_BASTION", deps).costBits).toEqual(["960 manpower"]);
    expect(structureInfoForKey("SIEGE_TOWER", deps).costBits).toEqual(["120 manpower"]);
    expect(structureInfoForKey("DREAD_TOWER", deps).costBits).toEqual(["240 manpower"]);
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

    expect(structureInfoForKey("CLEARING_HOUSE", deps).image).toContain("/overlays/town-district/clearing-house.svg?");
    expect(structureInfoForKey("NEURAL_WORKS", deps).image).toContain("/overlays/town-district/neural-works.svg?");
    expect(structureInfoForKey("AEGIS_DOME", deps).image).toBe("/overlays/aegis-dome-overlay.svg");
    expect(structureInfoForKey("ASTRAL_DOCK", deps).image).toBe("/overlays/astral-dock-overlay.svg");
    expect(structureInfoForKey("IMPERIAL_EXCHANGE", deps).image).toBe("/overlays/imperial-exchange-overlay.svg");
    expect(structureInfoForKey("SOVEREIGN_SIEGE_ENGINE", deps).image).toBe("/overlays/sovereign-siege-engine-overlay.svg");
  });
});

// Regression coverage for real bugs found in the tech detail UI:
// - the yellow "Unlocks X | Unlocks Y" text summary was redundant with the
//   tag chips and is now removed from both the inline card and the modal.
// - a tech whose only highlight is a single structure unlock (e.g. Supply
//   Directorate -> Ancillary Depot) used to render NO tags at all
//   (shouldRenderUnlockHighlights suppressed them), leaving just the yellow
//   text -- now it always shows its tag(s).

import { TILE_SLOT_BOOST_STRUCTURES, HYDROWORKS_HYDROGARDEN_FOOD_SLOT_BONUS, AGRICULTURE_FISH_FOOD_SLOT_BONUS } from "@border-empires/shared";
import { economicStructureName } from "../client-map-display.js";

export const effectSummaryLabel = (key: string, value: unknown): string | null => {
  if (key === "unlockHydrogarden" && value === true) return `Unlocks Hydrogardens (+${TILE_SLOT_BOOST_STRUCTURES.HYDROGARDEN} FOOD slot), and adds +${AGRICULTURE_FISH_FOOD_SLOT_BONUS} FOOD slot on every owned fish tile`;
  if (key === "unlockUmbriteRig" && value === true) return "Unlocks umbrite rigs";
  if (key === "unlockMine" && value === true) return "Unlocks mines";
  if (key === "unlockResinExtractor" && value === true) return "Unlocks Resin Extractor";
  if (key === "unlockImplantFoundry" && value === true) return "Unlocks Implant Foundry";
  if (key === "unlockCatalystRefinery" && value === true) return "Unlocks Catalyst Refinery";
  if (key === "unlockCultivationEstate" && value === true) return "Unlocks Cultivation Estate";
  if (key === "unlockReclamationWorks" && value === true) return "Unlocks Reclamation Works";
  if (key === "unlockManufactory" && value === true) return "Unlocks Manufactories";
  if (key === "unlockForts" && value === true) return "Unlocks forts";
  if (key === "unlockObservatory" && value === true) return "Unlocks Aether Towers";
  if (key === "unlockSiegeBatteries" && value === true) return "Unlocks Siege Batteries";
  if (key === "unlockIncubationEngine" && value === true) return `Unlocks the ${economicStructureName("INCUBATION_ENGINE")}`;
  if (key === "unlockCensusHall" && value === true) return "Unlocks census halls";
  if (key === "unlockClearingHouse" && value === true) return "Unlocks clearing houses";
  if (key === "unlockTradeNexus" && value === true) return "Unlocks trade nexuses";
  if (key === "unlockUmbriteWorks" && value === true) return `Unlocks ${economicStructureName("UMBRITE_WORKS")}`;
  if (key === "unlockTitaniumWorks" && value === true) return "Unlocks titanium works";
  if (key === "unlockAetherCondenser" && value === true) return "Unlocks aether condensers";
  if (key === "unlockSynthOverload" && value === true) return "Unlocks synth overload";
  if (key === "unlockAdvancedSynthesizers" && value === true) return "Unlocks grand synthesis upgrades";
  if (key === "unlockOreRefinery" && value === true) return `Unlocks the ${economicStructureName("ORE_REFINERY")}`;
  if (key === "unlockAmbaricTransformer" && value === true) return "Unlocks Aether Towers";
  if (key === "unlockHarborExchange" && value === true) return "Unlocks harbor exchanges";
  if (key === "unlockMinistryHall" && value === true) return "Unlocks ministry halls";
  if (key === "unlockAncillaryDepot" && value === true) return "Unlocks Ancillary Depot";
  if (key === "unlockSkyDock" && value === true) return "Unlocks Sky Docks";
  if (key === "unlockResonanceGrid" && value === true) return "Unlocks resonance grids";
  if (key === "unlockAstralDock" && value === true) return "Unlocks Astral Dock";
  if (key === "unlockImperialExchange" && value === true) return "Unlocks Imperial Exchange";
  if (key === "unlockSovereignSiegeEngine" && value === true) return "Unlocks Sovereign Siege Engine";
  if (key === "unlockAegisDome" && value === true) return "Unlocks Aegis Dome";
  if (key === "unlockRevealEmpire" && value === true) return "Unlocks empire reveal";
  if (key === "unlockRevealEmpireStats" && value === true) return "Unlocks Reveal Empire Stats";
  if (key === "unlockAetherWall" && value === true) return "Unlocks Aether Wall";
  if (key === "unlockAetherLance" && value === true) return "Unlocks Aether Purge";
  if (key === "unlockRetortRecasting" && value === true) return "Unlocks Retort Transmutation";
  if (key === "unlockSurveySweep" && value === true) return "Unlocks Survey Sweep";
  if (key === "unlockAetherEmp" && value === true) return "Unlocks Aether EMP";
  if (key === "unlockCityOverclock" && value === true) return "Unlocks City Overclock";
  if (key === "unlockAstralDockLaunch" && value === true) return "Unlocks Launch Satellite";
  if (key === "unlockDeepStrike" && value === true) return "Unlocks deep strike";
  if (key === "unlockNavalInfiltration" && value === true) return "Unlocks Aether Bridge";
  if (key === "unlockSabotage" && value === true) return "Unlocks Siphon";
  if (key === "unlockImperialExchangeLevy" && value === true) return "Unlocks Exchange Levy";
  if (key === "unlockSovereignSiegeEngineStrike" && value === true) return "Unlocks Worldbreaker Shot";
  if (key === "unlockStormfront" && value === true) return "Unlocks Stormfront";
  if (key === "unlockAegisLock" && value === true) return "Unlocks Aegis Lock";
  if (key === "unlockTitaniumBastion" && value === true) return "Unlocks Titanium Bastion";
  if (key === "unlockSiegeTower" && value === true) return "Unlocks Siege Tower";
  if (key === "unlockThunderBastion" && value === true) return "Unlocks Thunder Bastion";
  if (key === "unlockDreadTower" && value === true) return "Unlocks Dread Tower";
  if (key === "unlockHydroworksUpgrade" && value === true) return `Unlocks Hydroworks (every Hydrogarden within 10 tiles gains +${HYDROWORKS_HYDROGARDEN_FOOD_SLOT_BONUS} FOOD slots)`;
  if (key === "unlockNeuralWorks" && value === true) return "Unlocks Neural Works";
  if (key === "unlockTerrainShaping" && value === true) return "Unlocks terrain works";
  if (key === "unlockAncillaryFactory" && value === true) return "Unlocks Ancillary Factory";
  if (key === "unlockReserveLattice" && value === true) return "Unlocks Reserve Lattice";
  if (key === "unlockCensusDirectorate" && value === true) return "Unlocks Census Directorate";
  // unlockWeaponsWorkshop retired — replaced by the two keys below.
  if (key === "unlockTitaniumWeaponsFactory" && value === true) return "Unlocks Titanium Weapons Factory";
  if (key === "unlockUmbriteWeaponsFactory" && value === true) return "Unlocks Umbrite Weapons Factory";
  if (key === "unlockTitaniumLevy" && value === true) return "Unlocks The Titanium Levy";
  if (key === "musterMaxTilesAdd" && typeof value === "number") return `Muster tile cap +${value}`;
  if (key === "revealResource" && typeof value === "string") return `Reveals ${value.charAt(0).toUpperCase()}${value.slice(1).toLowerCase()}`;
  if (key === "dockGoldOutputMult" && typeof value === "number") return `Dock income +${Math.round((value - 1) * 100)}%`;
  if (key === "dockConnectionBonusPerLink" && typeof value === "number") return `Connected dock income +${Math.round(value * 100)}% per link`;
  if (key === "manufactoryCrystalUpkeepMult" && typeof value === "number") return `Manufactory crystal upkeep -${Math.round((1 - value) * 100)}%`;
  if (key === "dockRoutesVisible" && value === true) return "Shows dock routes";
  if (key === "firstTownsFoodSlotWaiverCount" && typeof value === "number") return `First ${value} towns need 1 fewer FOOD slot`;
  if (key === "resourceOutputMult" && value && typeof value === "object") {
    const ro = value as Record<string, unknown>;
    const entries: Array<[string, string]> = [["farm", "Farm"], ["fish", "Fish"], ["titanium", "Titanium"], ["crystal", "Crystal"], ["umbrite", "Umbrite"], ["shard", "Shard"]];
    const labels = entries.filter(([k]) => typeof ro[k] === "number" && (ro[k] as number) !== 1).map(([k, name]) => `${name} output +${(((ro[k] as number) - 1) * 100).toFixed(0)}%`);
    return labels.length > 0 ? labels.join(" | ") : null;
  }
  if (key === "settlementSpeedMult" && typeof value === "number") return `Garrison speed ${value > 1 ? "+" : ""}${((value - 1) * 100).toFixed(0)}%`;
  if (key === "developmentProcessCapacityAdd" && typeof value === "number") return `Development slots +${value}`;
  if (key === "abilityCooldownMult" && typeof value === "number")
    return `All ability cooldowns ${value < 1 ? "-" : "+"}${Math.abs((1 - value) * 100).toFixed(0)}%`;
  if (key === "sabotageCooldownMult" && typeof value === "number")
    return `Sabotage cooldown ${value < 1 ? "-" : "+"}${Math.abs((1 - value) * 100).toFixed(0)}%`;
  if (key === "newSettlementDefenseMult" && typeof value === "number")
    return `Newly garrisoned tile defense ${value > 1 ? "+" : ""}${((value - 1) * 100).toFixed(0)}%`;
  if (key === "allTownsFoodSlotWaiverPerTown" && typeof value === "number") return `Every town needs ${value} fewer FOOD slot${value === 1 ? "" : "s"}`;
  if (key === "townFoodUpkeepMult" && typeof value === "number") return `Town food upkeep ${value < 1 ? "-" : "+"}${Math.abs((1 - value) * 100).toFixed(0)}%`;
  if (key === "townGoldOutputMult" && typeof value === "number") return `Town coin output ${value > 1 ? "+" : ""}${((value - 1) * 100).toFixed(0)}%`;
  if (key === "firstThreeTownsGoldOutputMult" && typeof value === "number")
    return `First 3 towns coin ${value > 1 ? "+" : ""}${((value - 1) * 100).toFixed(0)}%`;
  if (key === "firstThreeTownsPopulationGrowthMult" && typeof value === "number")
    return `First 3 towns growth ${value > 1 ? "+" : ""}${((value - 1) * 100).toFixed(0)}%`;
  if (key === "manufactoryIncomeBonusAdd" && typeof value === "number") return `Manufactory income +${Math.round(value * 100)} pts`;
  if (key === "manufactoryCapBonusAdd" && typeof value === "number") return `Manufactory coin cap +${Math.round(value * 100)} pts`;
  if (key === "manufactoryBonusMult" && typeof value === "number") return `Manufactory bonus ${value > 1 ? "+" : ""}${((value - 1) * 100).toFixed(0)}%`;
  if (key === "incubationEngineBonusMult" && typeof value === "number") return `Incubation Engine growth ${value > 1 ? "+" : ""}${((value - 1) * 100).toFixed(0)}%`;
  if (key === "incubationEngineCapBonusAddPctPoints" && typeof value === "number") return `Incubation Engine growth +${Math.round(value * 100)} pts`;
  if (key === "populationGrowthMult" && typeof value === "number") return `Population growth ${value > 1 ? "+" : ""}${((value - 1) * 100).toFixed(0)}%`;
  if (key === "populationIncomeMult" && typeof value === "number") return `Town income from population ${value > 1 ? "+" : ""}${((value - 1) * 100).toFixed(0)}%`;
  if (key === "connectedTownStepBonusAdd" && typeof value === "number") {
    const pointsPerLink = Math.round(value * 100);
    const maxBonus = pointsPerLink * 3;
    return `Connected-city income +${pointsPerLink} pts per linked city (max +${maxBonus} pts)`;
  }
  if (key === "growthPauseDurationMult" && typeof value === "number") return `War growth pause ${value < 1 ? "-" : "+"}${Math.abs((1 - value) * 100).toFixed(0)}%`;
  if (key === "buildCapacityAdd" && typeof value === "number") return `Build capacity ${value >= 0 ? "+" : ""}${value}`;
  if (key === "harvestCapMult" && typeof value === "number") return `Harvest cap ${value > 1 ? "+" : ""}${((value - 1) * 100).toFixed(0)}%`;
  if (key === "fortDefenseMult" && typeof value === "number") return `Fort defense ${value > 1 ? "+" : ""}${((value - 1) * 100).toFixed(0)}%`;
  if (key === "fortBuildGoldCostMult" && typeof value === "number") return `Fort cost ${value < 1 ? "-" : "+"}${Math.abs((1 - value) * 100).toFixed(0)}%`;
  if (key === "fortBuildSpeedMult" && typeof value === "number") return `Fort build speed ${value > 1 ? "+" : ""}${((value - 1) * 100).toFixed(0)}%`;
  if (key === "fortBuildManpowerCostMult" && typeof value === "number") return `Fort manpower cost ${value < 1 ? "-" : "+"}${Math.abs((1 - value) * 100).toFixed(0)}%`;
  if (key === "relayBeaconBuildManpowerCostMult" && typeof value === "number") return `Relay Beacon manpower cost ${value < 1 ? "-" : "+"}${Math.abs((1 - value) * 100).toFixed(0)}%`;
  if (key === "structureBuildManpowerCostMult" && typeof value === "number") return `Building manpower cost ${value < 1 ? "-" : "+"}${Math.abs((1 - value) * 100).toFixed(0)}%`;
  if (key === "fortTitaniumSlotWaiverCount" && typeof value === "number") return `First ${value} Forts need no TITANIUM slot`;
  if (key === "settledDefenseNearFortMult" && typeof value === "number")
    return `Garrisoned defense near forts ${value > 1 ? "+" : ""}${((value - 1) * 100).toFixed(0)}%`;
  if (key === "attackVsBarbariansMult" && typeof value === "number") return `Attack vs Planetary Defense ${value > 1 ? "+" : ""}${((value - 1) * 100).toFixed(0)}%`;
  if (key === "outpostAttackMult" && typeof value === "number") return `Outpost attack ${value > 1 ? "+" : ""}${((value - 1) * 100).toFixed(0)}%`;
  if (key === "outpostUmbriteSlotWaiverCount" && typeof value === "number") return `First ${value} Siege Batteries need no UMBRITE slot`;
  if (key === "outpostGoldUpkeepMult" && typeof value === "number") return `Outpost coin upkeep ${value < 1 ? "-" : "+"}${Math.abs((1 - value) * 100).toFixed(0)}%`;
  if (key === "outpostDeploymentSpeedMult" && typeof value === "number") return `Outpost deployment speed ${value > 1 ? "+" : ""}${((value - 1) * 100).toFixed(0)}%`;
  if (key === "chosenResourceSlotGrant" && typeof value === "number" && value > 0) {
    return `Pick one on confirm: +${value} free slot of chosen resource`;
  }
  if (key === "revealCapacityBonus" && typeof value === "number") return `Reveal capacity +${value}`;
  if (key === "visionRadiusBonus" && typeof value === "number") return `Empire vision radius +${value}`;
  if (key === "townVisionRadiusBonus" && typeof value === "number") return `Town vision radius +${value}`;
  if (key === "outpostVisionRadiusBonus" && typeof value === "number") return `Light/Siege Battery vision radius +${value}`;
  if (key === "observatoryRangeBonus" && typeof value === "number") return `Aether Tower range +${value}`;
  if (key === "observatoryProtectionRadiusBonus" && typeof value === "number") return `Aether Tower protection radius +${value}`;
  if (key === "observatoryCastRadiusBonus" && typeof value === "number") return `Aether Tower cast radius +${value}`;
  if (key === "settledDefenseMult" && typeof value === "number") return `Garrisoned defense ${value > 1 ? "+" : ""}${((value - 1) * 100).toFixed(0)}%`;
  if (key === "attackVsSettledMult" && typeof value === "number") return `Attack vs garrisoned ${value > 1 ? "+" : ""}${((value - 1) * 100).toFixed(0)}%`;
  if (key === "attackVsFortsMult" && typeof value === "number") return `Attack vs forts ${value > 1 ? "+" : ""}${((value - 1) * 100).toFixed(0)}%`;
  if (key === "economicStructureBuildSpeedMult" && typeof value === "number") return `Economic build speed ${value > 1 ? "+" : ""}${((value - 1) * 100).toFixed(0)}%`;
  if (key === "populationCapFirst3TownsMult" && typeof value === "number") return `First 3 towns pop cap ${value > 1 ? "+" : ""}${((value - 1) * 100).toFixed(0)}%`;
  if (key === "observatoryVisionBonus" && typeof value === "number") return `Aether Tower vision +${value}`;
  if (key === "observatoryCooldownMult" && typeof value === "number")
    return `Aether Tower ability cooldowns ${value < 1 ? "-" : "+"}${Math.abs((1 - value) * 100).toFixed(0)}%`;
  if (key === "attackResolveSpeedReduceMs" && typeof value === "number") return `Attacks resolve ${Math.round(value / 1000)}s faster`;
  return null;
};


import type { TechInfo } from "./client-types.js";

export type TechHighlightTone = "structure" | "action" | "upgrade" | "resource";

export type TechHighlightTag = {
  label: string;
  tone: TechHighlightTone;
};

const STRUCTURE_UNLOCK_LABELS: Record<string, string> = {
  unlockFarmstead: "Farmstead",
  unlockUmbriteRig: "Umbrite Rig",
  unlockMine: "Mine",
  unlockMintworks: "Mintworks",
  unlockForts: "Fort",
  unlockObservatory: "Observatory",
  unlockSiegeOutposts: "Siege Outpost",
  unlockGranary: "Granary",
  unlockCensusHall: "Census Hall",
  unlockClearingHouse: "Clearing House",
  unlockCaravanary: "Caravanary",
  unlockUmbriteSynthesizer: "Umbrite Synth",
  unlockTitaniumWorks: "Titanium Works",
  unlockCrystalSynthesizer: "Aether Condenser",
  unlockFoundry: "Sky Foundry",
  unlockAetherTower: "Ambaric Tower",
  unlockCustomsHouse: "Harbor Exchange",
  unlockGovernorsOffice: "Ministry Hall",
  unlockGarrisonHall: "Ancillary Factory",
  unlockAirport: "Aetherport",
  unlockRadarSystem: "Resonance Grid",
  unlockAstralDock: "Astral Dock",
  unlockRailDepot: "Rail Depot",
  unlockImperialExchange: "Imperial Exchange",
  unlockWorldEngine: "Worldbreaker Cannon",
  unlockAegisDome: "Aegis Dome",
  unlockQuartermastersOffice: "Quartermaster's Office",
  unlockLogisticsGuild: "Logistics Guild",
  unlockAssemblyWorks: "Assembly Works",
  unlockPopulationBureau: "Population Bureau",
  unlockTitaniumLevy: "The Titanium Levy",
  // unlockWeaponsWorkshop retired — Weapons Workshop is no longer
  // unlockable (structure-registry-economic.ts), replaced by the two
  // labels below.
  unlockTitaniumWeaponsFactory: "Titanium Weapons Factory",
  unlockUmbriteWeaponsFactory: "Umbrite Weapons Factory"
};

const ACTION_UNLOCK_LABELS: Record<string, string> = {
  unlockAetherLance: "Aether Purge",
  unlockSurveySweep: "Survey Sweep",
  unlockRetortRecasting: "Retort Transmutation",
  unlockNavalInfiltration: "Aether Bridge",
  unlockRevealEmpire: "Reveal Empire",
  unlockSabotage: "Siphon",
  unlockAetherWall: "Aether Wall",
  unlockTerrainShaping: "Terrain Works",
  unlockSynthOverload: "Synth Overload",
  unlockStormfront: "Stormfront",
  unlockAetherEmp: "Aether EMP",
  unlockCityOverclock: "City Overclock",
  unlockAstralDockLaunch: "Launch Satellite",
  unlockWorldEngineStrike: "Worldbreaker Shot",
  unlockImperialExchangeLevy: "Exchange Levy",
  unlockAegisLock: "Aegis Lock"
};

// revealResource's value is a lowercase category string (food/titanium/crystal/
// umbrite), not a boolean like every other unlock key -- handled separately
// in techHighlightTags below rather than via the boolean-keyed maps above.
const REVEAL_RESOURCE_LABELS: Record<string, string> = {
  food: "Reveals Food",
  titanium: "Reveals Titanium",
  crystal: "Reveals Crystal",
  umbrite: "Reveals Umbrite"
};

const UPGRADE_UNLOCK_LABELS: Record<string, string> = {
  unlockTitaniumBastion: "Titanium Bastion",
  unlockSiegeTower: "Siege Tower",
  unlockThunderBastion: "Thunder Bastion",
  unlockDreadTower: "Dread Tower",
  unlockSeedGranaryUpgrade: "Seed Granary",
  unlockWaterworksUpgrade: "Waterworks"
};

const addTag = (tags: TechHighlightTag[], label: string, tone: TechHighlightTone): void => {
  if (tags.some((tag) => tag.label === label)) return;
  tags.push({ label, tone });
};

export const isTechHighlightEffectKey = (key: string): boolean =>
  key in STRUCTURE_UNLOCK_LABELS ||
  key in ACTION_UNLOCK_LABELS ||
  key in UPGRADE_UNLOCK_LABELS ||
  key === "unlockAdvancedSynthesizers" ||
  key === "revealResource" ||
  key === "musterMaxTilesAdd";

export const techHighlightTags = (tech: Pick<TechInfo, "effects">): TechHighlightTag[] => {
  const tags: TechHighlightTag[] = [];
  const effects = tech.effects ?? {};

  for (const [key, label] of Object.entries(STRUCTURE_UNLOCK_LABELS)) {
    if (effects[key] === true) addTag(tags, label, "structure");
  }
  for (const [key, label] of Object.entries(ACTION_UNLOCK_LABELS)) {
    if (effects[key] === true) addTag(tags, label, "action");
  }
  for (const [key, label] of Object.entries(UPGRADE_UNLOCK_LABELS)) {
    if (effects[key] === true) addTag(tags, label, "upgrade");
  }
  if (effects.unlockAdvancedSynthesizers === true) addTag(tags, "Advanced Synths", "upgrade");
  if (typeof effects.revealResource === "string") {
    const label = REVEAL_RESOURCE_LABELS[effects.revealResource.toLowerCase()];
    if (label) addTag(tags, label, "resource");
  }
  if (typeof effects.musterMaxTilesAdd === "number" && effects.musterMaxTilesAdd > 0) {
    addTag(tags, `Muster Flag +${effects.musterMaxTilesAdd}`, "upgrade");
  }

  return tags;
};

// Single cap shared by every call site (tech-tree card, tech-tree graph
// node, tech detail modal) so a tech never shows a different set of tags
// depending on which view you're looking at.
export const TECH_HIGHLIGHT_TAG_LIMIT = 6;

export const renderTechHighlightTagsHtml = (tech: Pick<TechInfo, "effects">, maxTags: number = TECH_HIGHLIGHT_TAG_LIMIT): string => {
  const tags = techHighlightTags(tech).slice(0, maxTags);
  if (tags.length === 0) return "";
  return `<div class="tech-payoff-chips">${tags
    .map((tag) => `<span class="tech-payoff-chip tech-payoff-chip-${tag.tone}">${tag.label}</span>`)
    .join("")}</div>`;
};

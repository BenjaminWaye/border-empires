import type { TechInfo } from "./client-types.js";

export type TechHighlightTone = "structure" | "action" | "upgrade";

export type TechHighlightTag = {
  label: string;
  tone: TechHighlightTone;
};

const STRUCTURE_UNLOCK_LABELS: Record<string, string> = {
  unlockFarmstead: "Farmstead",
  unlockCamp: "Camp",
  unlockMine: "Mine",
  unlockMarket: "Market",
  unlockForts: "Fort",
  unlockObservatory: "Observatory",
  unlockSiegeOutposts: "Siege Outpost",
  unlockGranary: "Granary",
  unlockCensusHall: "Census Hall",
  unlockBank: "Bank",
  unlockClearingHouse: "Clearing House",
  unlockCaravanary: "Caravanary",
  unlockFurSynthesizer: "Fur Synth",
  unlockIronworks: "Ironworks",
  unlockCrystalSynthesizer: "Aether Condenser",
  unlockFoundry: "Sky Foundry",
  unlockAetherTower: "Aether Tower",
  unlockExchangeHouse: "Exchange House",
  unlockCustomsHouse: "Harbor Exchange",
  unlockGovernorsOffice: "Ministry Hall",
  unlockGarrisonHall: "Garrison Hall",
  unlockAirport: "Sky Dock",
  unlockRadarSystem: "Resonance Grid",
  unlockAstralDock: "Astral Dock",
  unlockRailDepot: "Rail Depot",
  unlockImperialExchange: "Imperial Exchange",
  unlockWorldEngine: "Worldbreaker Cannon",
  unlockAegisDome: "Aegis Dome"
};

const ACTION_UNLOCK_LABELS: Record<string, string> = {
  unlockAetherLance: "Aether Lance",
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

const UPGRADE_UNLOCK_LABELS: Record<string, string> = {
  unlockIronBastion: "Iron Bastion",
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
  key in STRUCTURE_UNLOCK_LABELS || key in ACTION_UNLOCK_LABELS || key in UPGRADE_UNLOCK_LABELS || key === "unlockAdvancedSynthesizers";

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

  return tags;
};

export const renderTechHighlightTagsHtml = (tech: Pick<TechInfo, "effects">, maxTags = 4): string => {
  const tags = techHighlightTags(tech).slice(0, maxTags);
  if (tags.length === 0) return "";
  return `<div class="tech-payoff-chips">${tags
    .map((tag) => `<span class="tech-payoff-chip tech-payoff-chip-${tag.tone}">${tag.label}</span>`)
    .join("")}</div>`;
};

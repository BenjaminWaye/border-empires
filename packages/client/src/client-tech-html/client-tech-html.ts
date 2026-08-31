import { BASE_COMBAT_POWER, PLAYER_BASE_VISION, TRICKLE_RESOURCE_KEYS, TILE_SLOT_BOOST_STRUCTURES, WATERWORKS_FARMSTEAD_FOOD_SLOT_BONUS, AGRICULTURE_FISH_FOOD_SLOT_BONUS, type ChosenTrickleResource } from "@border-empires/shared";
import type { DomainInfo, TechInfo } from "../client-types.js";
import { isTechHighlightEffectKey } from "../client-tech-payoffs.js"; import { economicStructureName } from "../client-map-display.js";
type ModKey = "attack" | "defense" | "income" | "vision";
type ModBreakdown = Record<ModKey, Array<{ label: string; mult: number }>>;
type ActiveBonusContext = {
  techCatalog: TechInfo[];
  ownedTechIds: string[];
  domainCatalog: DomainInfo[];
  domainIds: string[];
};
type StatChipKey = ModKey;
type ActiveBonusBreakdownEntry =
  | { label: string; kind: "mult"; mult: number }
  | { label: string; kind: "radius"; amount: number };

// Attack/Defense are shown as the absolute effective-power number combat
// actually uses (BASE_COMBAT_POWER x every persistent multiplier), not a %
// delta, so players can read the same number the win-chance formula does.
const formatCombatPower = (value: number): string => {
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? `${rounded}` : rounded.toFixed(1);
};

const formatMultiplierNumber = (mult: number): { text: string; tone: "positive" | "negative" | "neutral" } => {
  const rounded = Math.round(mult * 1000) / 1000;
  if (Math.abs(rounded - 1) < 0.0005) return { text: "×1.00", tone: "neutral" };
  return { text: `×${rounded.toFixed(2)}`, tone: rounded > 1 ? "positive" : "negative" };
};

// Mirrors the server's hasRevealedResourceForPlayer (apps/simulation/src/
// tech-domain-bridge/tech-domain-bridge.ts) so the ribbon/economy detail
// screen don't show a resource category the player hasn't earned yet. FOOD
// is always visible, no tech required; the rest are revealed by whichever
// tech in techCatalog has effects.revealResource matching the category.
export const hasRevealedResourceCategory = (
  category: "FOOD" | "TITANIUM" | "CRYSTAL" | "UMBRITE",
  techIds: readonly string[],
  techCatalog: readonly TechInfo[]
): boolean => {
  if (category === "FOOD") return true;
  const target = category.toLowerCase();
  return techCatalog.some((tech) => tech.effects?.revealResource === target && techIds.includes(tech.id));
};

export const effectSummaryLabel = (key: string, value: unknown): string | null => {
  if (key === "unlockFarmstead" && value === true) return `Unlocks farmsteads (+${TILE_SLOT_BOOST_STRUCTURES.FARMSTEAD} FOOD slot), and adds +${AGRICULTURE_FISH_FOOD_SLOT_BONUS} FOOD slot on every owned fish tile`;
  if (key === "unlockUmbriteRig" && value === true) return "Unlocks umbrite rigs";
  if (key === "unlockMine" && value === true) return "Unlocks mines";
  if (key === "unlockMintworks" && value === true) return "Unlocks mintworks";
  if (key === "unlockForts" && value === true) return "Unlocks forts";
  if (key === "unlockObservatory" && value === true) return "Unlocks aether towers";
  if (key === "unlockSiegeOutposts" && value === true) return "Unlocks siege outposts";
  if (key === "unlockGranary" && value === true) return `Unlocks the ${economicStructureName("GRANARY")}`;
  if (key === "unlockCensusHall" && value === true) return "Unlocks census halls";
  if (key === "unlockClearingHouse" && value === true) return "Unlocks clearing houses";
  if (key === "unlockCaravanary" && value === true) return "Unlocks trade nexuses";
  if (key === "unlockUmbriteSynthesizer" && value === true) return `Unlocks ${economicStructureName("UMBRITE_SYNTHESIZER")}`;
  if (key === "unlockTitaniumWorks" && value === true) return "Unlocks titanium works";
  if (key === "unlockCrystalSynthesizer" && value === true) return "Unlocks aether condensers";
  if (key === "unlockSynthOverload" && value === true) return "Unlocks synth overload";
  if (key === "unlockAdvancedSynthesizers" && value === true) return "Unlocks grand synthesis upgrades";
  if (key === "unlockFoundry" && value === true) return `Unlocks the ${economicStructureName("FOUNDRY")}`;
  if (key === "unlockAetherTower" && value === true) return "Unlocks Aether Towers";
  if (key === "unlockCustomsHouse" && value === true) return "Unlocks harbor exchanges";
  if (key === "unlockGovernorsOffice" && value === true) return "Unlocks ministry halls";
  if (key === "unlockGarrisonHall" && value === true) return "Unlocks garrison halls";
  if (key === "unlockAirport" && value === true) return "Unlocks sky docks";
  if (key === "unlockRadarSystem" && value === true) return "Unlocks resonance grids";
  if (key === "unlockAstralDock" && value === true) return "Unlocks Astral Dock";
  if (key === "unlockImperialExchange" && value === true) return "Unlocks Imperial Exchange";
  if (key === "unlockWorldEngine" && value === true) return "Unlocks Worldbreaker Cannon";
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
  if (key === "unlockWorldEngineStrike" && value === true) return "Unlocks Worldbreaker Shot";
  if (key === "unlockStormfront" && value === true) return "Unlocks Stormfront";
  if (key === "unlockAegisLock" && value === true) return "Unlocks Aegis Lock";
  if (key === "unlockTitaniumBastion" && value === true) return "Unlocks Titanium Bastion";
  if (key === "unlockSiegeTower" && value === true) return "Unlocks Siege Tower";
  if (key === "unlockThunderBastion" && value === true) return "Unlocks Thunder Bastion";
  if (key === "unlockDreadTower" && value === true) return "Unlocks Dread Tower";
  if (key === "unlockSeedGranaryUpgrade" && value === true) return "Upgrades Granary to Seed Granary";
  if (key === "unlockWaterworksUpgrade" && value === true) return `Unlocks Waterworks (every Farmstead within 10 tiles gains +${WATERWORKS_FARMSTEAD_FOOD_SLOT_BONUS} FOOD slots)`;
  if (key === "unlockRailDepot" && value === true) return "Unlocks rail depots";
  if (key === "unlockTerrainShaping" && value === true) return "Unlocks terrain works";
  if (key === "unlockLogisticsGuild" && value === true) return "Unlocks Logistics Guild";
  if (key === "unlockAssemblyWorks" && value === true) return "Unlocks Assembly Works";
  if (key === "unlockPopulationBureau" && value === true) return "Unlocks Population Bureau";
  // unlockWeaponsWorkshop retired — replaced by the two keys below.
  if (key === "unlockTitaniumWeaponsFactory" && value === true) return "Unlocks Titanium Weapons Factory";
  if (key === "unlockUmbriteWeaponsFactory" && value === true) return "Unlocks Umbrite Weapons Factory";
  if (key === "unlockTitaniumLevy" && value === true) return "Unlocks The Titanium Levy";
  if (key === "musterMaxTilesAdd" && typeof value === "number") return `Muster tile cap +${value}`;
  if (key === "revealResource" && typeof value === "string") return `Reveals ${value.charAt(0).toUpperCase()}${value.slice(1).toLowerCase()}`;
  if (key === "dockGoldOutputMult" && typeof value === "number") return `Dock income +${Math.round((value - 1) * 100)}%`;
  if (key === "dockGoldCapMult" && typeof value === "number") return `Dock cap +${Math.round((value - 1) * 100)}%`;
  if (key === "dockConnectionBonusPerLink" && typeof value === "number") return `Connected dock income +${Math.round(value * 100)}% per link`;
  if (key === "mintworksCrystalUpkeepMult" && typeof value === "number") return `Mintworks crystal upkeep -${Math.round((1 - value) * 100)}%`;
  if (key === "dockRoutesVisible" && value === true) return "Shows dock routes";
  if (key === "firstTownsFoodSlotWaiverCount" && typeof value === "number") return `First ${value} towns need 1 fewer FOOD slot`;
  if (key === "resourceOutputMult" && value && typeof value === "object") {
    const ro = value as Record<string, unknown>;
    const entries: Array<[string, string]> = [["farm", "Farm"], ["fish", "Fish"], ["titanium", "Titanium"], ["crystal", "Crystal"], ["umbrite", "Umbrite"], ["shard", "Shard"]];
    const labels = entries.filter(([k]) => typeof ro[k] === "number" && (ro[k] as number) !== 1).map(([k, name]) => `${name} output +${(((ro[k] as number) - 1) * 100).toFixed(0)}%`);
    return labels.length > 0 ? labels.join(" | ") : null;
  }
  if (key === "settlementSpeedMult" && typeof value === "number") return `Settlement speed ${value > 1 ? "+" : ""}${((value - 1) * 100).toFixed(0)}%`;
  if (key === "developmentProcessCapacityAdd" && typeof value === "number") return `Development slots +${value}`;
  if (key === "abilityCooldownMult" && typeof value === "number")
    return `All ability cooldowns ${value < 1 ? "-" : "+"}${Math.abs((1 - value) * 100).toFixed(0)}%`;
  if (key === "sabotageCooldownMult" && typeof value === "number")
    return `Sabotage cooldown ${value < 1 ? "-" : "+"}${Math.abs((1 - value) * 100).toFixed(0)}%`;
  if (key === "newSettlementDefenseMult" && typeof value === "number")
    return `New settlement defense ${value > 1 ? "+" : ""}${((value - 1) * 100).toFixed(0)}%`;
  if (key === "allTownsFoodSlotWaiverPerTown" && typeof value === "number") return `Every town needs ${value} fewer FOOD slot${value === 1 ? "" : "s"}`;
  if (key === "townFoodUpkeepMult" && typeof value === "number") return `Town food upkeep ${value < 1 ? "-" : "+"}${Math.abs((1 - value) * 100).toFixed(0)}%`;
  if (key === "townGoldOutputMult" && typeof value === "number") return `Town gold output ${value > 1 ? "+" : ""}${((value - 1) * 100).toFixed(0)}%`;
  if (key === "firstThreeTownsGoldOutputMult" && typeof value === "number")
    return `First 3 towns gold ${value > 1 ? "+" : ""}${((value - 1) * 100).toFixed(0)}%`;
  if (key === "townGoldCapMult" && typeof value === "number") return `Town gold cap ${value > 1 ? "+" : ""}${((value - 1) * 100).toFixed(0)}%`;
  if (key === "firstThreeTownsPopulationGrowthMult" && typeof value === "number")
    return `First 3 towns growth ${value > 1 ? "+" : ""}${((value - 1) * 100).toFixed(0)}%`;
  if (key === "mintworksIncomeBonusAdd" && typeof value === "number") return `Mintworks income +${Math.round(value * 100)} pts`;
  if (key === "mintworksCapBonusAdd" && typeof value === "number") return `Mintworks gold cap +${Math.round(value * 100)} pts`;
  if (key === "mintworksBonusMult" && typeof value === "number") return `Mintworks bonus ${value > 1 ? "+" : ""}${((value - 1) * 100).toFixed(0)}%`;
  if (key === "granaryBonusMult" && typeof value === "number") return `Granary growth ${value > 1 ? "+" : ""}${((value - 1) * 100).toFixed(0)}%`;
  if (key === "granaryCapBonusAddPctPoints" && typeof value === "number") return `Granary growth +${Math.round(value * 100)} pts`;
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
  if (key === "fortTitaniumSlotWaiverCount" && typeof value === "number") return `First ${value} Forts need no TITANIUM slot`;
  if (key === "settledDefenseNearFortMult" && typeof value === "number")
    return `Settled defense near forts ${value > 1 ? "+" : ""}${((value - 1) * 100).toFixed(0)}%`;
  if (key === "attackVsBarbariansMult" && typeof value === "number") return `Attack vs barbarians ${value > 1 ? "+" : ""}${((value - 1) * 100).toFixed(0)}%`;
  if (key === "outpostAttackMult" && typeof value === "number") return `Outpost attack ${value > 1 ? "+" : ""}${((value - 1) * 100).toFixed(0)}%`;
  if (key === "outpostUmbriteSlotWaiverCount" && typeof value === "number") return `First ${value} Siege Outposts need no UMBRITE slot`;
  if (key === "outpostGoldUpkeepMult" && typeof value === "number") return `Outpost gold upkeep ${value < 1 ? "-" : "+"}${Math.abs((1 - value) * 100).toFixed(0)}%`;
  if (key === "outpostDeploymentSpeedMult" && typeof value === "number") return `Outpost deployment speed ${value > 1 ? "+" : ""}${((value - 1) * 100).toFixed(0)}%`;
  if (key === "chosenResourceSlotGrant" && typeof value === "number" && value > 0) {
    return `Pick one on confirm: +${value} free slot of chosen resource`;
  }
  if (key === "revealCapacityBonus" && typeof value === "number") return `Reveal capacity +${value}`;
  if (key === "visionRadiusBonus" && typeof value === "number") return `Empire vision radius +${value}`;
  if (key === "townVisionRadiusBonus" && typeof value === "number") return `Town vision radius +${value}`;
  if (key === "outpostVisionRadiusBonus" && typeof value === "number") return `Light/Siege Outpost vision radius +${value}`;
  if (key === "observatoryRangeBonus" && typeof value === "number") return `Aether Tower range +${value}`;
  if (key === "observatoryProtectionRadiusBonus" && typeof value === "number") return `Aether Tower protection radius +${value}`;
  if (key === "observatoryCastRadiusBonus" && typeof value === "number") return `Aether Tower cast radius +${value}`;
  if (key === "settledDefenseMult" && typeof value === "number") return `Settled defense ${value > 1 ? "+" : ""}${((value - 1) * 100).toFixed(0)}%`;
  if (key === "attackVsSettledMult" && typeof value === "number") return `Attack vs settled ${value > 1 ? "+" : ""}${((value - 1) * 100).toFixed(0)}%`;
  if (key === "attackVsFortsMult" && typeof value === "number") return `Attack vs forts ${value > 1 ? "+" : ""}${((value - 1) * 100).toFixed(0)}%`;
  if (key === "economicStructureBuildSpeedMult" && typeof value === "number") return `Economic build speed ${value > 1 ? "+" : ""}${((value - 1) * 100).toFixed(0)}%`;
  if (key === "populationCapFirst3TownsMult" && typeof value === "number") return `First 3 towns pop cap ${value > 1 ? "+" : ""}${((value - 1) * 100).toFixed(0)}%`;
  if (key === "observatoryVisionBonus" && typeof value === "number") return `Aether Tower vision +${value}`;
  if (key === "observatoryCooldownMult" && typeof value === "number")
    return `Aether Tower ability cooldowns ${value < 1 ? "-" : "+"}${Math.abs((1 - value) * 100).toFixed(0)}%`;
  if (key === "attackResolveSpeedReduceMs" && typeof value === "number") return `Attacks resolve ${Math.round(value / 1000)}s faster`;
  return null;
};

const observatoryRangeSummaryLabel = (effects: TechInfo["effects"] | DomainInfo["effects"] | undefined): string | null => {
  if (!effects) return null;
  const unified = effects.observatoryRangeBonus;
  if (typeof unified === "number") return `Aether Tower range +${unified}`;
  const protection = effects.observatoryProtectionRadiusBonus;
  const cast = effects.observatoryCastRadiusBonus;
  if (typeof protection === "number" && typeof cast === "number" && protection === cast) {
    return `Aether Tower range +${cast}`;
  }
  return null;
};

const formatEffectSummaryLines = (effects: TechInfo["effects"] | DomainInfo["effects"] | undefined): string[] => {
  if (!effects) return [];
  const lines: string[] = [];
  const combinedObservatoryRange = observatoryRangeSummaryLabel(effects);
  let observatoryRangeInserted = false;
  for (const [key, value] of Object.entries(effects)) {
    if (combinedObservatoryRange && (key === "observatoryRangeBonus" || key === "observatoryProtectionRadiusBonus") && !observatoryRangeInserted) {
      lines.push(combinedObservatoryRange);
      observatoryRangeInserted = true;
      continue;
    }
    if (combinedObservatoryRange && key === "observatoryCastRadiusBonus") continue;
    const label = effectSummaryLabel(key, value);
    if (label) lines.push(label);
  }
  return lines;
};

// Tech-tree redesign: every tech unlocks a real building/ability, never a
// flat stat multiplier — mods (attack/defense/income/vision) are legacy
// pre-redesign data still present on some tech-tree.json rows and must not
// be surfaced to players as if they were the tech's payoff. Only effect
// (unlock) summary lines and powerup grants are shown.
export const formatTechBenefitSummary = (tech: TechInfo): string => {
  const lines = formatEffectSummaryLines(tech.effects);
  if (tech.grantsPowerup) lines.push(`Powerup: ${tech.grantsPowerup.id} +${tech.grantsPowerup.charges}`);
  return lines.length > 0 ? lines.join(" | ") : "Passive unlock";
};

export const formatDomainBenefitSummary = (domain: DomainInfo): string => {
  const lines = formatEffectSummaryLines(domain.effects);
  return lines.length > 0 ? lines.join(" | ") : "Passive unlock";
};

export const techOwnedHtml = (
  techCatalog: TechInfo[],
  ownedTechIds: string[],
  isPendingTechUnlock: (techId: string) => boolean
): string => {
  if (ownedTechIds.length === 0) return `<article class="card"><p>No techs selected yet.</p></article>`;
  const catalogById = new Map(techCatalog.map((tech) => [tech.id, tech]));
  return ownedTechIds
    .map((id) => {
      const tech = catalogById.get(id);
      const pending = isPendingTechUnlock(id) ? `<p class="muted">Unlocking...</p>` : "";
      return `<article class="card"><strong>${tech?.name ?? id}</strong>${pending}<p>${tech?.description ?? id}</p><p>${tech ? formatTechBenefitSummary(tech) : id}</p></article>`;
    })
    .join("");
};

// Returns the set of valid resource keys offered by this domain's
// chosenResourceSlotGrant effect, or null if the effect is absent.
// The TRICKLE_RESOURCE_KEYS list is the shared contract with the sim's
// domainHasResourceSubChoice — any change to the offered resource set
// must flip a single constant in shared.
const domainResourceSlotKeys = (
  domain: DomainInfo | undefined
): ReadonlySet<ChosenTrickleResource> | null => {
  const grant = domain?.effects?.chosenResourceSlotGrant;
  if (typeof grant !== "number" || !Number.isFinite(grant) || grant <= 0) return null;
  return new Set(TRICKLE_RESOURCE_KEYS);
};

export const domainOwnedHtml = (
  domainCatalog: DomainInfo[],
  domainIds: string[],
  chosenTrickleResource?: ChosenTrickleResource
): string => {
  if (domainIds.length === 0) return `<article class="card"><p>No domains selected yet.</p></article>`;
  const catalogById = new Map(domainCatalog.map((domain) => [domain.id, domain]));
  return domainIds
    .map((id) => {
      const domain = catalogById.get(id);
      // Surface the player's locked resource on the owned card ONLY when this
      // specific domain offered that resource. This prevents a future domain
      // with a narrower table (e.g. only TITANIUM) from misleadingly displaying
      // "(UMBRITE slot)" because the player happens to have locked UMBRITE on
      // a different domain.
      const offeredKeys = domainResourceSlotKeys(domain);
      const slotSuffix =
        offeredKeys && chosenTrickleResource && offeredKeys.has(chosenTrickleResource)
          ? ` <em>(${chosenTrickleResource} slot)</em>`
          : "";
      return `<article class="card"><strong>${domain?.name ?? id}${slotSuffix}</strong><p>${domain?.description ?? id}</p><p>${domain ? formatDomainBenefitSummary(domain) : id}</p></article>`;
    })
    .join("");
};

export const techCurrentModsHtml = (
  mods: Record<ModKey, number>,
  expandedModKey: ModKey | null,
  modBreakdown: ModBreakdown,
  activeBonusContext?: ActiveBonusContext
): string => {
  const ownedTechs = activeBonusContext
    ? activeBonusContext.ownedTechIds
        .map((id) => activeBonusContext.techCatalog.find((tech) => tech.id === id))
        .filter((tech): tech is TechInfo => Boolean(tech))
    : [];
  const ownedDomains = activeBonusContext
    ? activeBonusContext.domainIds
        .map((id) => activeBonusContext.domainCatalog.find((domain) => domain.id === id))
        .filter((domain): domain is DomainInfo => Boolean(domain))
    : [];
  const ownedProgression = [...ownedTechs, ...ownedDomains];
  const radiusEntries = ownedProgression
    .map((entry) => {
      const amount = entry.effects?.visionRadiusBonus;
      return typeof amount === "number" && Number.isFinite(amount) && amount !== 0
        ? { label: entry.name, kind: "radius" as const, amount }
        : undefined;
    })
    .filter((entry): entry is Extract<ActiveBonusBreakdownEntry, { kind: "radius" }> => Boolean(entry));
  const visionRadiusBonus = radiusEntries.reduce((sum, entry) => sum + entry.amount, 0);
  const effectiveVisionRadius = Math.max(1, Math.floor(PLAYER_BASE_VISION * (mods.vision ?? 1)) + visionRadiusBonus);

  // The tech tab's Attack/Defense chip is meant to read as the same base
  // power the win-chance formula starts from — BASE_COMBAT_POWER times every
  // persistent multiplier the player has, which is exactly what modBreakdown
  // already lists (tech/domain mods, plus the informational weapons-factory
  // rows appended by appendWeaponsFactoryBreakdownEntries).
  const combinedBreakdownMult = (key: ModKey): number => (modBreakdown[key] ?? []).reduce((acc, entry) => acc * entry.mult, 1);

  const statDefs = [
    {
      key: "attack",
      label: "Attack",
      short: "ATK",
      icon: "△",
      valueLabel: formatCombatPower(BASE_COMBAT_POWER * combinedBreakdownMult("attack")),
      tone: "attack",
      entries: undefined
    },
    {
      key: "defense",
      label: "Defense",
      short: "DEF",
      icon: "⬡",
      valueLabel: formatCombatPower(BASE_COMBAT_POWER * combinedBreakdownMult("defense")),
      tone: "defense",
      entries: undefined
    },
    {
      key: "vision",
      label: "Vision",
      short: "VIS",
      icon: "◉",
      valueLabel: `${effectiveVisionRadius} tiles`,
      tone: "vision",
      entries: [
        ...(mods.vision !== 1
          ? (modBreakdown.vision ?? [])
              .filter((entry) => entry.label.trim().toLowerCase() !== "base")
              .map((entry): ActiveBonusBreakdownEntry => ({ label: `${entry.label}: radius multiplier`, kind: "mult", mult: entry.mult }))
          : []),
        ...radiusEntries
      ]
    }
  ] as const;
  const effectiveExpandedModKey = statDefs.some((entry) => entry.key === expandedModKey) ? expandedModKey : null;
  const chips = statDefs
    .map(({ key, label, short, icon, valueLabel, tone, entries }) => {
      const sources = entries ?? (modBreakdown[key] ?? [])
        .filter((entry) => entry.label.trim().toLowerCase() !== "base")
        .map((entry): ActiveBonusBreakdownEntry => ({ label: entry.label, kind: "mult", mult: entry.mult }));
      const inspectable = sources.length > 0;
      const expanded = effectiveExpandedModKey === key;
      const chipClass = `panel-btn tech-mod-chip tech-mod-chip-${tone}${expanded ? " selected" : ""}${inspectable ? "" : " is-static"}`;
      const chipBody = `<div class="tech-mod-chip-main">
          <span class="tech-mod-chip-label"><span class="tech-mod-chip-icon" aria-hidden="true">${icon}</span><span>${label}</span></span>
          <strong>${valueLabel}</strong>
        </div>
        <div class="tech-mod-chip-meta"><span>${short}</span><span class="tech-mod-chip-expand">${inspectable ? (expanded ? "Hide details" : "Tap to inspect") : "No extra sources"}${inspectable ? " ▾" : ""}</span></div>`;
      if (!inspectable) {
        return `<div class="${chipClass}" aria-disabled="true">${chipBody}</div>`;
      }
      return `<button class="${chipClass}" data-mod-chip="${key}" aria-expanded="${expanded ? "true" : "false"}">
        <div class="tech-mod-chip-main">
          <span class="tech-mod-chip-label"><span class="tech-mod-chip-icon" aria-hidden="true">${icon}</span><span>${label}</span></span>
          <strong>${valueLabel}</strong>
        </div>
        <div class="tech-mod-chip-meta"><span>${short}</span><span class="tech-mod-chip-expand">${expanded ? "Hide details" : "Tap to inspect"} ▾</span></div>
      </button>`;
    })
    .join("");
  const formatTechModDelta = (mult: number): { text: string; tone: "positive" | "negative" | "neutral" } => {
    const delta = (mult - 1) * 100;
    const rounded = Math.round(delta * 10) / 10;
    if (Math.abs(rounded) < 0.05) return { text: "0%", tone: "neutral" };
    const prefix = rounded > 0 ? "+" : "";
    const hasFraction = Math.abs(rounded % 1) > 0.001;
    return {
      text: `${prefix}${hasFraction ? rounded.toFixed(1) : rounded.toFixed(0)}%`,
      tone: rounded > 0 ? "positive" : "negative"
    };
  };
  const formatBreakdownEntry = (entry: ActiveBonusBreakdownEntry): { text: string; tone: "positive" | "negative" | "neutral" } => {
    if (entry.kind === "radius") {
      return {
        text: `${entry.amount >= 0 ? "+" : ""}${entry.amount} radius`,
        tone: entry.amount > 0 ? "positive" : entry.amount < 0 ? "negative" : "neutral"
      };
    }
    return formatTechModDelta(entry.mult);
  };
  const breakdownEntriesForExpandedKey = (key: StatChipKey): ActiveBonusBreakdownEntry[] => {
    const statDef = statDefs.find((entry) => entry.key === key);
    if (statDef?.entries) return [...statDef.entries];
    return (modBreakdown[key] ?? [])
      .filter((entry) => entry.label.trim().toLowerCase() !== "base")
      .map((entry): ActiveBonusBreakdownEntry => ({ label: entry.label, kind: "mult", mult: entry.mult }));
  };
  const isNumericPowerKey = effectiveExpandedModKey === "attack" || effectiveExpandedModKey === "defense";
  const breakdown =
    effectiveExpandedModKey === null
      ? ""
      : `<div class="tech-mod-breakdown">${breakdownEntriesForExpandedKey(effectiveExpandedModKey)
          .map((entry) => {
            const delta = isNumericPowerKey && entry.kind === "mult" ? formatMultiplierNumber(entry.mult) : formatBreakdownEntry(entry);
            return `<div class="tech-mod-breakdown-row"><span>${entry.label}</span><strong class="tech-mod-delta ${delta.tone}">${delta.text}</strong></div>`;
          })
          .join("")}</div>`;
  return `
    <div class="card tech-mod-card">
      <div class="tech-mod-card-head">
        <div class="tech-mod-card-title">Active Bonuses</div>
        <div class="tech-mod-card-hint">${effectiveExpandedModKey === null ? "Tap a bonus to inspect its sources" : "Bonus source breakdown below"}</div>
      </div>
      <div class="tech-mod-strip">${chips}</div>
      ${breakdown}
    </div>
  `;
};

// Tech-tree redesign: a small colored label showing which of the 4
// player-facing branches (war, economy, manpower, aether) a tech belongs
// to. Deliberately a plain text/color tag, not a redesign of the tech card.
const TECH_BRANCH_LABELS: Record<string, string> = {
  war: "War",
  economy: "Economy",
  manpower: "Manpower",
  aether: "Aether"
};
export const techBranchTagHtml = (branch: string | undefined): string => {
  if (!branch) return "";
  const label = TECH_BRANCH_LABELS[branch] ?? branch;
  return ` <span class="tech-branch-tag tech-branch-tag-${branch}">${label}</span>`;
};

const checklistHtml = (items: Array<{ label: string; met: boolean }>, className = "tech-req-list"): string =>
  items.length > 0
    ? `<ul class="${className}">${items
        .map((item) => `<li class="${item.met ? "ok" : "bad"}">${item.met ? "✓" : "✗"} ${item.label}</li>`)
        .join("")}</ul>`
    : `<ul class="${className}"><li>None</li></ul>`;

const compactChecklistHtml = (items: Array<{ label: string; met: boolean }>): string =>
  items.length > 0
    ? `<ul>${items
        .map((item) => `<li style="color:${item.met ? "#84f2b8" : "#ff9f9f"}">${item.met ? "✓" : "✗"} ${item.label}</li>`)
        .join("")}</ul>`
    : `<p class="muted">No requirements listed.</p>`;

const fallbackRequirementChecklist = (requirements: {
  gold?: number;
  resources?: Partial<Record<"FOOD" | "TITANIUM" | "CRYSTAL" | "UMBRITE" | "SHARD", number>>;
}): Array<{ label: string; met: boolean }> => {
  const out: Array<{ label: string; met: boolean }> = [];
  const goldCost = requirements.gold ?? 0;
  if (goldCost > 0) {
    out.push({ label: `Gold ${goldCost.toLocaleString()}`, met: false });
  }
  for (const resourceKey of ["FOOD", "TITANIUM", "CRYSTAL", "UMBRITE", "SHARD"] as const) {
    const amount = requirements.resources?.[resourceKey] ?? 0;
    if (amount > 0) {
      out.push({ label: `${resourceKey} ${amount.toLocaleString()}`, met: false });
    }
  }
  return out;
};

const effectiveRequirementChecklist = (requirements: {
  gold?: number;
  resources?: Partial<Record<"FOOD" | "TITANIUM" | "CRYSTAL" | "UMBRITE" | "SHARD", number>>;
  checklist?: Array<{ label: string; met: boolean }>;
}): Array<{ label: string; met: boolean }> => {
  const checklist = requirements.checklist ?? [];
  return checklist.length > 0 ? checklist : fallbackRequirementChecklist(requirements);
};

export const formatDomainCost = (domain: DomainInfo): string => {
  const checklist = domain.requirements.checklist ?? [];
  const costBits = checklist.filter((item) => /gold|food|titanium|crystal|umbrite|shard/i.test(item.label)).map((item) => item.label);
  if (costBits.length > 0) return costBits.join(" · ");
  const fallbackCostBits: string[] = [];
  if ((domain.requirements.gold ?? 0) > 0) {
    fallbackCostBits.push(`${domain.requirements.gold.toLocaleString()} gold`);
  }
  for (const resourceKey of ["FOOD", "TITANIUM", "CRYSTAL", "UMBRITE", "SHARD"] as const) {
    const amount = domain.requirements.resources?.[resourceKey] ?? 0;
    if (amount > 0) fallbackCostBits.push(`${amount.toLocaleString()} ${resourceKey.toLowerCase()}`);
  }
  return fallbackCostBits.length > 0 ? fallbackCostBits.join(" · ") : "Cost not listed";
};

export const ownedDomainByTier = (domainCatalog: DomainInfo[], domainIds: string[]): Map<number, DomainInfo> => {
  const catalogById = new Map(domainCatalog.map((domain) => [domain.id, domain]));
  const out = new Map<number, DomainInfo>();
  for (const id of domainIds) {
    const domain = catalogById.get(id);
    if (domain) out.set(domain.tier, domain);
  }
  return out;
};

export const currentDomainChoiceTier = (domainCatalog: DomainInfo[], domainChoices: string[]): number | undefined => {
  const byId = new Map(domainCatalog.map((domain) => [domain.id, domain]));
  const first = domainChoices.map((id) => byId.get(id)).find((domain): domain is DomainInfo => Boolean(domain));
  return first?.tier;
};

const domainTierStatus = (
  tier: number,
  ownedByTier: Map<number, DomainInfo>,
  currentTier?: number
): {
  tone: "chosen" | "current" | "locked";
  badge: string;
  detail: string;
} => {
  const owned = ownedByTier.get(tier);
  if (owned) {
    return {
      tone: "chosen",
      badge: "Chosen",
      detail: `Tier ${tier} is already committed to ${owned.name}. You cannot choose another domain at this tier.`
    };
  }
  if (currentTier === tier) {
    return {
      tone: "current",
      badge: "Choose 1",
      detail: `Pick exactly one domain for Tier ${tier}. Once chosen, the other domains in this tier are closed.`
    };
  }
  return {
    tone: "locked",
    badge: "Locked",
    detail: tier < (currentTier ?? 0) ? `This tier is no longer available because your choice is already set.` : `Unlock Tier ${Math.max(1, tier - 1)} first to reach this tier.`
  };
};

const domainCardBlockedReason = (
  domain: DomainInfo,
  ownedByTier: Map<number, DomainInfo>,
  currentTier?: number
): string | undefined => {
  const owned = ownedByTier.get(domain.tier);
  if (owned && owned.id !== domain.id) return `Tier ${domain.tier} already committed to ${owned.name}`;
  if (currentTier !== undefined && domain.tier > currentTier) return `Locked until Tier ${domain.tier - 1} is chosen`;
  if (currentTier !== undefined && domain.tier < currentTier && !owned) return "Tier no longer available";
  const unmet = (domain.requirements.checklist ?? []).find((check) => !check.met);
  return unmet?.label;
};

export const renderTechDetailCardHtml = (args: {
  tech: TechInfo | undefined;
  statusText: string | undefined;
  buttonLabel: string;
  buttonDisabled: boolean;
  prereqs: string[];
  prereqText: string;
  unlocks: Array<{ id: string; name: string; tier: number }>;
  payoffHtml?: string;
  blockedSummary?: { label: string; tone: "missing" | "blocked" } | null;
  relatedStructuresHtml: string;
  relatedCrystalAbilitiesHtml: string;
}): string => {
  const { tech, statusText, buttonLabel, buttonDisabled, prereqs, prereqText, unlocks, payoffHtml = "", blockedSummary, relatedStructuresHtml, relatedCrystalAbilitiesHtml } = args;
  if (!tech) return `<article class="card"><p>Select a technology card to inspect details.</p></article>`;
  const checklist = effectiveRequirementChecklist(tech.requirements);
  return `<article class="card tech-detail-card">
    <div class="tech-detail-head">
      <div>
        <div class="tech-detail-title">${tech.name}${techBranchTagHtml(tech.branch)}</div>
        <p class="muted">${prereqs.length > 0 ? `Requires ${prereqText}` : "Entry tech (no prerequisites)"}</p>
        ${statusText ? `<p class="muted">${statusText}</p>` : ""}
      </div>
    </div>
    <div class="tech-detail-section-stack">
      <p class="tech-detail-flavor">${tech.description}</p>
      ${payoffHtml}
      ${
        blockedSummary
          ? `<section class="tech-block-state tech-block-state-${blockedSummary.tone}">
              <span class="structure-info-section-label">${blockedSummary.tone === "missing" ? "Missing to unlock" : "Locked by"}</span>
              <strong>${blockedSummary.label}</strong>
            </section>`
          : ""
      }
    </div>
    ${relatedStructuresHtml}
    ${relatedCrystalAbilitiesHtml}
    ${unlocks.length > 0 ? `<p class="muted"><strong>Unlocks next:</strong> ${unlocks.map((next) => `<button class="inline-info-link" type="button" data-tech-card="${next.id}">${next.name} (T${next.tier})</button>`).join(", ")}</p>` : ""}
    <p><strong>Requirements:</strong></p>
    ${checklistHtml(checklist)}
    <div class="tech-detail-actions">
      <button class="panel-btn tech-unlock-btn tech-unlock-btn-modal${blockedSummary ? ` tech-unlock-btn-${blockedSummary.tone}` : ""}" data-tech-unlock="${tech.id}" ${buttonDisabled ? "disabled" : ""}>${buttonLabel}</button>
    </div>
  </article>`;
};

export const renderDomainChoiceGridHtml = (args: {
  domainCatalog: DomainInfo[];
  domainIds: string[];
  domainUiSelectedId: string;
  ownedByTier: Map<number, DomainInfo>;
  currentTier: number | undefined;
  requiresTechNames: Record<string, string>;
}): string => {
  const { domainCatalog, domainIds, domainUiSelectedId, ownedByTier, currentTier, requiresTechNames } = args;
  if (domainCatalog.length === 0) return `<article class="card"><p>No domains available right now.</p></article>`;
  const grouped = new Map<number, DomainInfo[]>();
  for (const domain of domainCatalog) {
    const arr = grouped.get(domain.tier) ?? [];
    arr.push(domain);
    grouped.set(domain.tier, arr);
  }
  const tiers = [...grouped.keys()].sort((a, b) => a - b);
  const summary =
    currentTier !== undefined
      ? `<article class="card domain-summary-card">
          <div class="domain-summary-kicker">Domains</div>
          <strong>Choose one domain for Tier ${currentTier}</strong>
          <p>Each tier allows exactly one doctrine. Explore for shard caches and catch shard rain to fund the next machine-doctrine pick.</p>
        </article>`
      : `<article class="card domain-summary-card">
          <div class="domain-summary-kicker">Domains</div>
          <strong>All current domain tiers are committed</strong>
          <p>You can only choose one doctrine per tier. Review the path you locked in below and keep feeding it with shards from exploration and shardfalls.</p>
        </article>`;
  const sections = tiers
    .map((tier) => {
      const status = domainTierStatus(tier, ownedByTier, currentTier);
      const cards = (grouped.get(tier) ?? [])
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((domain) => {
          const selected = domainUiSelectedId === domain.id ? " selected" : "";
          const owned = domainIds.includes(domain.id) ? " owned" : "";
          const blockedReason = domainCardBlockedReason(domain, ownedByTier, currentTier);
          const blocked = blockedReason && !owned ? " blocked" : "";
          const cardBadge = owned ? "Chosen" : currentTier === tier ? "Candidate" : "Unavailable";
          const canUnlock = Boolean(domain.requirements.canResearch) && !domainIds.includes(domain.id);
          const unmetChecklist = owned ? [] : (domain.requirements.checklist ?? []).filter((item) => !item.met);
          const unmetRequirementsHtml = unmetChecklist
            .slice(0, 2)
            .map((item) => `<p class="tech-card-requirement tech-card-requirement-bad">✗ ${item.label}</p>`)
            .join("");
          return `<button type="button" class="tech-card domain-card domain-card-${status.tone}${selected}${owned}${blocked}" data-domain-card="${domain.id}" data-domain-can-unlock="${canUnlock ? "true" : "false"}">
            <div class="tech-card-top">
              <strong>${domain.name}</strong>
              <span class="domain-card-badge">${cardBadge}</span>
            </div>
            <p>${formatDomainBenefitSummary(domain)}</p>
            ${unmetRequirementsHtml}
            <p class="tech-card-cost">${
              owned
                ? "Tier locked in"
                : unmetChecklist.length > 0
                  ? blockedReason || "Requirements not met"
                  : blockedReason || formatDomainCost(domain)
            }</p>
          </button>`;
        })
        .join("");
      return `<section class="tech-tier-block domain-tier-block domain-tier-block-${status.tone}">
        <div class="domain-tier-head">
          <div>
            <h4>Tier ${tier}</h4>
            <p>${status.detail}</p>
          </div>
          <span class="domain-tier-badge domain-tier-badge-${status.tone}">${status.badge}</span>
        </div>
        <div class="tech-card-grid">${cards}</div>
      </section>`;
    })
    .join("");
  return `${summary}${sections}`;
};

export const renderDomainDetailCardHtml = (args: {
  domain: DomainInfo | undefined;
  domainIds: string[];
  chosenInTier: DomainInfo | undefined;
  currentTier: number | undefined;
  requiresTechName: string;
  pendingDomainUnlockId?: string;
  chosenTrickleResource?: ChosenTrickleResource;
  showInlineClose?: boolean;
}): string => {
  const { domain, domainIds, chosenInTier, currentTier, requiresTechName, pendingDomainUnlockId = "", chosenTrickleResource, showInlineClose = true } = args;
  if (!domain) return `<article class="card"><p>Select a domain card to inspect details.</p></article>`;
  const checklist = effectiveRequirementChecklist(domain.requirements);
  const owned = domainIds.includes(domain.id);
  const pendingUnlock = pendingDomainUnlockId === domain.id;
  const blockedByPending = Boolean(pendingDomainUnlockId && pendingDomainUnlockId !== domain.id);
  const canUnlock = domain.requirements.canResearch && !owned && !pendingDomainUnlockId;
  // Surface the locked resource on the detail card only when this specific
  // domain offered it — same gate as the owned-summary card, so a
  // future narrower-table domain doesn't claim credit for a pick made on
  // another domain.
  const detailOfferedKeys = domainResourceSlotKeys(domain);
  const detailSlotGrant =
    owned && chosenTrickleResource && detailOfferedKeys?.has(chosenTrickleResource)
      ? (domain.effects?.chosenResourceSlotGrant as number | undefined)
      : undefined;
  const slotSection =
    detailSlotGrant !== undefined && detailSlotGrant > 0
      ? `<section class="structure-info-section">
        <span class="structure-info-section-label">Your pick</span>
        <strong>${chosenTrickleResource} (+${detailSlotGrant} slot${detailSlotGrant === 1 ? "" : "s"}, locked)</strong>
      </section>`
      : "";
  const tierRuleText =
    chosenInTier && chosenInTier.id !== domain.id
      ? `Tier ${domain.tier} is already filled by ${chosenInTier.name}.`
      : currentTier === domain.tier
        ? `This is one of the current Tier ${domain.tier} choices. You may choose exactly one.`
        : chosenInTier?.id === domain.id
          ? `You already chose this for Tier ${domain.tier}.`
          : `This domain will only become choosable when Tier ${domain.tier} opens.`;
  const buttonLabel = owned ? "Chosen" : pendingUnlock ? `Choosing Tier ${domain.tier}...` : canUnlock ? `Choose Tier ${domain.tier}` : "Locked";
  const statusText = pendingUnlock
    ? "Sending your domain choice to the server..."
    : blockedByPending
      ? "Waiting for the current domain choice to resolve..."
      : "";
  return `<article class="card tech-detail-card tech-detail-card-shell" id="domain-detail-card" data-domain-detail-card>
    <div class="tech-detail-inline-head">
      <div class="tech-detail-inline-copy">
        <div class="tech-detail-kicker">Domain</div>
        <strong>${domain.name}</strong>
        <p class="muted">Tier ${domain.tier} · Requires ${requiresTechName}</p>
      </div>
      ${
        showInlineClose
          ? '<button class="panel-btn tech-detail-close-inline" type="button" aria-label="Close domain details" data-domain-detail-close="button">Close</button>'
          : ""
      }
    </div>
    <div class="tech-detail-inline-scroll">
      <p class="domain-detail-tier-rule">${tierRuleText}</p>
      ${statusText ? `<p class="muted">${statusText}</p>` : ""}
      <p>${domain.description}</p>
      ${slotSection}
      <section class="structure-info-section">
        <span class="structure-info-section-label">Benefits</span>
        <strong>${formatDomainBenefitSummary(domain)}</strong>
      </section>
      <section class="structure-info-section">
        <span class="structure-info-section-label">Cost</span>
        <strong>${formatDomainCost(domain)}</strong>
      </section>
      <section class="structure-info-section">
        <span class="structure-info-section-label">Requirements</span>
        ${checklistHtml(checklist)}
      </section>
    </div>
    <div class="tech-detail-actions">
      <button class="panel-btn tech-unlock-btn tech-unlock-btn-modal domain-unlock-btn" data-domain-unlock="${domain.id}" ${
        canUnlock || pendingUnlock ? "" : "disabled"
      }>${buttonLabel}</button>
    </div>
  </article>`;
};

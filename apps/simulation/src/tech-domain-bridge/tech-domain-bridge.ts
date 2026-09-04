import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { TRICKLE_RESOURCE_KEYS, techGoldCostForResearchedCount, type ChosenTrickleResource } from "@border-empires/shared";
import type { DomainPlayer, DomainTileState } from "@border-empires/game-domain";
import { VISION_RADIUS, type SlotResource } from "@border-empires/shared";
import { estimateIncomePerMinuteFromTiles } from "../player-runtime-summary.js";
import { goldCostForTechResearch } from "../tech-wonder-gold-discount.js";
import { weaponsFactoryCountsForPlayer, appendWeaponsFactoryBreakdownEntries } from "./weapons-factory-mod-breakdown.js";

type StatMods = NonNullable<DomainPlayer["mods"]>;
type ModKey = keyof StatMods;

export type ModBreakdown = Record<ModKey, Array<{ label: string; mult: number }>>;

export type TechCatalogEntry = {
  id: string;
  tier: number;
  name: string;
  description: string;
  researchTimeSeconds?: number;
  rootId?: string;
  // Tech-tree redesign: which of the 4 player-facing branches (war, economy,
  // manpower, aether) this tech belongs to -- surfaced to the client for the
  // branch-tag UI requirement.
  branch?: string;
  requires?: string;
  prereqIds?: string[];
  effects?: Record<string, unknown>;
  mods?: Partial<StatMods>;
  cost?: Partial<Record<"gold" | "food" | "iron" | "crystal" | "supply" | "shard", number>>;
  grantsPowerup?: { id: string; charges: number };
};

export type DomainCatalogEntry = {
  id: string;
  tier: number;
  name: string;
  description: string;
  requiresTechId: string;
  effects?: Record<string, unknown>;
  mods?: Partial<StatMods>;
  cost?: Partial<Record<"gold" | "food" | "iron" | "crystal" | "supply" | "shard", number>>;
};

export type StrategicCounts = Partial<Record<"FOOD" | "TITANIUM" | "CRYSTAL" | "UMBRITE" | "SHARD", number>>;
type TileResource = NonNullable<DomainTileState["resource"]>;
type RawResourceCounts = Partial<Record<TileResource, number>>;

export type AiProgressionPlannerTile = {
  ownerId?: string | undefined;
  ownershipState?: string | undefined;
  resource?: string | undefined;
  town?: unknown;
  dockId?: string | undefined;
};

export type AiProgressionPlayer = {
  id: string;
  points: number;
  techIds: readonly string[];
  domainIds?: readonly string[];
  strategicResources?: StrategicCounts;
  settledTileCount?: number;
};

export type AiProgressionChoice = {
  id: string;
  score: number;
  affordable: boolean;
  goldCost: number;
  resourceCost: StrategicCounts;
};

export const resolveDataPath = (
  relativeCandidates: readonly string[],
  options: {
    from?: string;
    exists?: (path: string) => boolean;
  } = {}
): string => {
  const from = options.from ?? import.meta.url;
  const exists = options.exists ?? existsSync;
  for (const relativePath of relativeCandidates) {
    const resolved = fileURLToPath(new URL(relativePath, from));
    if (exists(resolved)) return resolved;
  }
  return fileURLToPath(new URL(relativeCandidates[0]!, from));
};

export const TECH_TREE_RELATIVE_CANDIDATES = [
  "../../../packages/game-domain/data/tech-tree.json",
  "../../../../packages/game-domain/data/tech-tree.json",
  "../../../../../../packages/game-domain/data/tech-tree.json"
] as const;
export const DOMAIN_TREE_RELATIVE_CANDIDATES = [
  "../../../packages/game-domain/data/domain-tree.json",
  "../../../../packages/game-domain/data/domain-tree.json",
  "../../../../../../packages/game-domain/data/domain-tree.json"
] as const;
export const TECH_TREE_PATH = resolveDataPath(TECH_TREE_RELATIVE_CANDIDATES);
export const DOMAIN_TREE_PATH = resolveDataPath(DOMAIN_TREE_RELATIVE_CANDIDATES);

const techTree = JSON.parse(readFileSync(TECH_TREE_PATH, "utf8")) as { techs: TechCatalogEntry[] };
const domainTree = JSON.parse(readFileSync(DOMAIN_TREE_PATH, "utf8")) as { domains: DomainCatalogEntry[] };

export const toResources = (
  cost?: Partial<Record<"gold" | "food" | "iron" | "crystal" | "supply" | "shard", number>>
): StrategicCounts => ({
  ...(typeof cost?.food === "number" && cost.food > 0 ? { FOOD: cost.food } : {}),
  ...(typeof cost?.iron === "number" && cost.iron > 0 ? { TITANIUM: cost.iron } : {}),
  ...(typeof cost?.crystal === "number" && cost.crystal > 0 ? { CRYSTAL: cost.crystal } : {}),
  ...(typeof cost?.supply === "number" && cost.supply > 0 ? { UMBRITE: cost.supply } : {}),
  ...(typeof cost?.shard === "number" && cost.shard > 0 ? { SHARD: cost.shard } : {})
});

export const rawResourceCountsForPlayer = (playerId: string, tiles: Iterable<AiProgressionPlannerTile>): RawResourceCounts => {
  const counts: RawResourceCounts = {};
  for (const tile of tiles) {
    if (tile.ownerId !== playerId || tile.ownershipState !== "SETTLED" || !tile.resource) continue;
    const resource = tile.resource as TileResource;
    counts[resource] = (counts[resource] ?? 0) + 1;
  }
  return counts;
};

export const reachableTechChoices = (ownedTechIds: string[]): string[] =>
  techTree.techs
    .filter((tech) => {
      if (ownedTechIds.includes(tech.id)) return false;
      const prereqs = tech.prereqIds && tech.prereqIds.length > 0 ? tech.prereqIds : tech.requires ? [tech.requires] : [];
      return prereqs.every((techId) => ownedTechIds.includes(techId));
    })
    .map((tech) => tech.id);

const nextDomainTier = (ownedDomainIds: string[]): number | undefined => {
  const chosenTierMax = domainTree.domains.reduce((maxTier, domain) => (
    ownedDomainIds.includes(domain.id) ? Math.max(maxTier, domain.tier) : maxTier
  ), 0);
  const targetTier = Math.min(5, chosenTierMax + 1);
  const pickedAtTargetTier = domainTree.domains.some((domain) => domain.tier === targetTier && ownedDomainIds.includes(domain.id));
  return pickedAtTargetTier ? undefined : targetTier;
};

const openDomainChoices = (ownedDomainIds: string[]): string[] => {
  const targetTier = nextDomainTier(ownedDomainIds);
  if (targetTier === undefined) return [];
  return domainTree.domains
    .filter((domain) => domain.tier === targetTier && !ownedDomainIds.includes(domain.id))
    .map((domain) => domain.id);
};

export const reachableDomainChoices = (ownedTechIds: string[], ownedDomainIds: string[]): string[] => {
  const targetTier = nextDomainTier(ownedDomainIds);
  if (targetTier === undefined) return [];
  return domainTree.domains
    .filter((domain) => domain.tier === targetTier && !ownedDomainIds.includes(domain.id) && ownedTechIds.includes(domain.requiresTechId))
    .map((domain) => domain.id);
};

export const techDepth = (techId: string): number => {
  const seen = new Set<string>();
  const walk = (id: string): number => {
    if (seen.has(id)) return 0;
    seen.add(id);
    const tech = techEntryById.get(id);
    if (!tech) return 0;
    const prereqs = tech.prereqIds && tech.prereqIds.length > 0 ? tech.prereqIds : tech.requires ? [tech.requires] : [];
    if (prereqs.length === 0) return 0;
    return Math.max(...prereqs.map((nextId) => walk(nextId))) + 1;
  };
  return walk(techId);
};

export const hasResources = (required: StrategicCounts, available: StrategicCounts): boolean =>
  Object.entries(required).every(([resource, amount]) => (available[resource as keyof StrategicCounts] ?? 0) >= (amount ?? 0));

export const playerWorldFlags = (playerId: string, tiles: Iterable<AiProgressionPlannerTile>): Set<string> => {
  const flags = new Set<string>();
  for (const tile of tiles) {
    if (tile.ownerId !== playerId || tile.ownershipState !== "SETTLED") continue;
    if (tile.resource === "TITANIUM") flags.add("active_titanium_site");
    if (tile.resource === "GEMS") flags.add("active_crystal_site");
    if (tile.town) flags.add("active_town");
    if (tile.dockId) flags.add("active_dock");
  }
  return flags;
};

export const techEntryById = new Map(techTree.techs.map((tech) => [tech.id, tech] as const));
export const domainEntryById = new Map(domainTree.domains.map((domain) => [domain.id, domain] as const));

export const recomputeMods = (player: Pick<DomainPlayer, "techIds" | "domainIds">): StatMods => {
  const next: StatMods = { attack: 1, defense: 1, income: 1, vision: 1 };
  for (const techId of player.techIds) {
    const tech = techEntryById.get(techId);
    if (!tech?.mods) continue;
    next.attack *= tech.mods.attack ?? 1;
    next.defense *= tech.mods.defense ?? 1;
    next.income *= tech.mods.income ?? 1;
    next.vision *= tech.mods.vision ?? 1;
  }
  for (const domainId of player.domainIds ?? []) {
    const domain = domainEntryById.get(domainId);
    if (!domain?.mods) continue;
    next.attack *= domain.mods.attack ?? 1;
    next.defense *= domain.mods.defense ?? 1;
    next.income *= domain.mods.income ?? 1;
    next.vision *= domain.mods.vision ?? 1;
  }
  return next;
};

const emptyModBreakdown = (): ModBreakdown => ({
  attack: [{ label: "Base", mult: 1 }],
  defense: [{ label: "Base", mult: 1 }],
  income: [{ label: "Base", mult: 1 }],
  vision: [{ label: "Base", mult: 1 }]
});

const addModBreakdownEntry = (
  breakdown: ModBreakdown,
  label: string,
  mods: Partial<StatMods> | undefined
): void => {
  if (!mods) return;
  for (const key of ["attack", "defense", "income", "vision"] as const) {
    const mult = mods[key];
    if (typeof mult === "number" && Number.isFinite(mult) && mult !== 1) {
      breakdown[key].push({ label, mult });
    }
  }
};

export const buildModBreakdownForPlayer = (
  player: Pick<DomainPlayer, "techIds" | "domainIds">,
  weaponsFactoryCounts?: { titanium: number; umbrite: number }
): ModBreakdown => {
  const breakdown = emptyModBreakdown();
  for (const techId of player.techIds) {
    const tech = techEntryById.get(techId);
    addModBreakdownEntry(breakdown, tech?.name ?? techId, tech?.mods);
  }
  for (const domainId of player.domainIds ?? []) {
    const domain = domainEntryById.get(domainId);
    addModBreakdownEntry(breakdown, domain?.name ?? domainId, domain?.mods);
  }
  if (weaponsFactoryCounts) appendWeaponsFactoryBreakdownEntries(breakdown, weaponsFactoryCounts);
  return breakdown;
};

export const visionRadiusBonusForPlayer = (
  player: Pick<DomainPlayer, "techIds" | "domainIds">
): number => {
  let bonus = 0;
  for (const techId of player.techIds) {
    const techBonus = techEntryById.get(techId)?.effects?.visionRadiusBonus;
    if (typeof techBonus === "number" && Number.isFinite(techBonus)) bonus += techBonus;
  }
  for (const domainId of player.domainIds ?? []) {
    const domainBonus = domainEntryById.get(domainId)?.effects?.visionRadiusBonus;
    if (typeof domainBonus === "number" && Number.isFinite(domainBonus)) bonus += domainBonus;
  }
  return bonus;
};

export const additiveEffectForPlayer = (
  player: Pick<DomainPlayer, "techIds" | "domainIds">,
  effectKey: string
): number => {
  let total = 0;
  for (const techId of player.techIds) {
    const value = techEntryById.get(techId)?.effects?.[effectKey];
    if (typeof value === "number" && Number.isFinite(value)) total += value;
  }
  for (const domainId of player.domainIds ?? []) {
    const value = domainEntryById.get(domainId)?.effects?.[effectKey];
    if (typeof value === "number" && Number.isFinite(value)) total += value;
  }
  return total;
};

// Resource-reveal gating (hasRevealedResourceForPlayer, revealedResourceValueForPlayer,
// revealResourceCategoryForTech, tileResourceMatchesRevealCategory) lives in
// ./tech-resource-reveal.js — re-exported here so existing importers of this
// module don't need to change their import path.
export {
  hasRevealedResourceForPlayer,
  revealedResourceValueForPlayer,
  revealResourceCategoryForTech,
  tileResourceMatchesRevealCategory
} from "./tech-resource-reveal.js";

export const multiplicativeEffectForPlayer = (
  player: Pick<DomainPlayer, "techIds" | "domainIds">,
  effectKey: string
): number => {
  let multiplier = 1;
  for (const techId of player.techIds) {
    const value = techEntryById.get(techId)?.effects?.[effectKey];
    if (typeof value === "number" && Number.isFinite(value) && value > 0) multiplier *= value;
  }
  for (const domainId of player.domainIds ?? []) {
    const value = domainEntryById.get(domainId)?.effects?.[effectKey];
    if (typeof value === "number" && Number.isFinite(value) && value > 0) multiplier *= value;
  }
  return multiplier;
};

/**
 * Extra vision radius for an owned SETTLED town's own +1 reveal ring
 * (runtime-town-vision.ts), on top of the unconditional +1 every town
 * already gets. Cartography's townVisionRadiusBonus is the only source
 * today; unlike visionRadiusBonusForPlayer this doesn't touch the player's
 * base radius, so it has no effect on plain (non-town) tiles.
 */
export const townVisionRadiusBonusForPlayer = (
  player: Pick<DomainPlayer, "techIds" | "domainIds">
): number => additiveEffectForPlayer(player, "townVisionRadiusBonus");

/**
 * Extra vision radius for an owned active Relay Beacon or Siege Outpost
 * (runtime-outpost-vision.ts), stacked on top of Relay Beacon's flat
 * RELAY_BEACON_VISION_BONUS (config.ts) — Siege Outpost otherwise has no
 * vision bonus of its own. Survey Corps's outpostVisionRadiusBonus is the
 * only source today.
 */
export const outpostVisionRadiusBonusForPlayer = (
  player: Pick<DomainPlayer, "techIds" | "domainIds">
): number => additiveEffectForPlayer(player, "outpostVisionRadiusBonus");

export const effectiveVisionRadiusForPlayer = (
  player: Pick<DomainPlayer, "mods" | "techIds" | "domainIds" | "wonderVisionRadiusBonus" | "galacticWonderVisionRadiusBonus">
): number => Math.max(1, Math.floor(VISION_RADIUS * (player.mods?.vision ?? 1)) + visionRadiusBonusForPlayer(player) + (player.wonderVisionRadiusBonus ?? 0) + (player.galacticWonderVisionRadiusBonus ?? 0));

/**
 * Effective crystal-observatory cast radius for a player, mirroring the client's
 * `ownObservatoryRange`: BASE + sum(observatoryRangeBonus) across the player's techs
 * and domains. The client menu and the sim authority must agree on this radius, otherwise
 * actions can show enabled but reject at execution (or vice versa).
 * observatoryCastRadiusBonus is intentionally omitted — no catalog entry sets it.
 */
export const observatoryCastRadiusForPlayer = (
  player: Pick<DomainPlayer, "techIds" | "domainIds">,
  baseRadius: number
): number =>
  baseRadius + additiveEffectForPlayer(player, "observatoryRangeBonus");

// AI progression-choice scoring (chooseAiTechChoiceForPlayer,
// chooseAiDomainChoiceForPlayer) lives in ./ai-progression-choice.js —
// re-exported here so existing importers of this module don't need to
// change their import path. Split out to keep this file (already over the
// repo's 500-line soft cap) from growing further — see
// scripts/check-file-line-limits.mjs.
export { chooseAiTechChoiceForPlayer, chooseAiDomainChoiceForPlayer } from "./ai-progression-choice.js";

const settledTileCount = (playerId: string, tiles: Iterable<DomainTileState>): number => {
  let count = 0;
  for (const tile of tiles) {
    if (tile.ownerId === playerId && tile.ownershipState === "SETTLED") count += 1;
  }
  return count;
};

const spendStrategicResources = (
  player: DomainPlayer,
  required: StrategicCounts
): void => {
  const next = { ...(player.strategicResources ?? {}) };
  for (const [resource, amount] of Object.entries(required) as Array<[keyof StrategicCounts, number]>) {
    if (!amount) continue;
    next[resource] = Math.max(0, (next[resource] ?? 0) - amount);
  }
  player.strategicResources = next;
};

export const chooseTechForPlayer = (
  player: DomainPlayer,
  techId: string,
  _tiles: Iterable<DomainTileState>
): { ok: true } | { ok: false; reason: string } => {
  const tech = techTree.techs.find((entry) => entry.id === techId);
  if (!tech) return { ok: false, reason: "tech not found" };
  const choices = reachableTechChoices([...player.techIds]);
  if (!choices.includes(techId)) return { ok: false, reason: "requirements not met" };
  const available = player.strategicResources ?? {};
  const required = toResources(tech.cost);
  const goldCost = goldCostForTechResearch(player, tech);
  if (player.points < goldCost || !hasResources(required, available)) { return { ok: false, reason: "requirements not met" }; }
  player.points = Math.max(0, player.points - goldCost);
  spendStrategicResources(player, required);
  player.techIds.add(techId);
  player.techRootId = tech.rootId ?? player.techRootId ?? "rewrite-local";
  player.mods = recomputeMods(player);
  return { ok: true };
};

// Re-exported so runtime.ts and other sim modules that already import this
// bridge for chooseDomainForPlayer / domainGrantedResourceSlots don't need a
// second import line. The canonical definition lives in
// @border-empires/shared (trickle-resources.ts) so the client uses the same
// type via its own shared-package import.
export type { ChosenTrickleResource };

export const domainHasResourceSubChoice = (domainId: string): boolean => {
  const domain = domainEntryById.get(domainId);
  return typeof domain?.effects?.chosenResourceSlotGrant === "number" && (domain.effects.chosenResourceSlotGrant as number) > 0;
};

export const domainGrantedResourceSlots = (
  player: Pick<DomainPlayer, "domainIds" | "chosenTrickleResource">
): Partial<Record<SlotResource, number>> | undefined => {
  const chosen = player.chosenTrickleResource;
  if (chosen !== "TITANIUM" && chosen !== "UMBRITE" && chosen !== "CRYSTAL") return undefined;
  for (const domainId of player.domainIds ?? []) {
    const domain = domainEntryById.get(domainId);
    const grant = domain?.effects?.chosenResourceSlotGrant;
    if (typeof grant === "number" && grant > 0) {
      return { [chosen]: grant };
    }
  }
  return undefined;
};

export const chooseDomainForPlayer = (
  player: DomainPlayer,
  domainId: string,
  _tiles: Iterable<DomainTileState>,
  options?: { chosenTrickleResource?: ChosenTrickleResource }
): { ok: true } | { ok: false; reason: string } => {
  const domain = domainTree.domains.find((entry) => entry.id === domainId);
  if (!domain) return { ok: false, reason: "domain not found" };
  const ownedDomainIds = [...(player.domainIds ?? [])];
  const openChoices = openDomainChoices(ownedDomainIds);
  if (!openChoices.includes(domainId) || !player.techIds.has(domain.requiresTechId)) {
    return { ok: false, reason: "requirements not met" };
  }
  const available = player.strategicResources ?? {};
  const required = toResources(domain.cost);
  if (player.points < (domain.cost?.gold ?? 0) || !hasResources(required, available)) {
    return { ok: false, reason: "requirements not met" };
  }
  // Domains that ask the player to pick a resource (Clockwork Stipend) require
  // the sub-choice up front, and the choice must be one of the offered keys.
  const needsSubChoice = domainHasResourceSubChoice(domainId);
  if (needsSubChoice) {
    const picked = options?.chosenTrickleResource;
    if (!picked || !TRICKLE_RESOURCE_KEYS.includes(picked)) {
      return { ok: false, reason: "resource choice required" };
    }
  }
  player.points = Math.max(0, player.points - (domain.cost?.gold ?? 0));
  spendStrategicResources(player, required);
  if (!player.domainIds) player.domainIds = new Set<string>();
  player.domainIds.add(domainId);
  if (needsSubChoice && options?.chosenTrickleResource) {
    // Locked forever: once a resource is chosen, it does not change
    // even if another domain later offers a different option set.
    if (!player.chosenTrickleResource) player.chosenTrickleResource = options.chosenTrickleResource;
  }
  player.mods = recomputeMods(player);
  return { ok: true };
};

export const buildTechUpdatePayload = (
  player: DomainPlayer,
  tilesIterable: Iterable<DomainTileState>,
  options?: { incomePerMinute?: number }
) => {
  // Materialized once: callers pass context.tiles.values(), a one-shot Map
  // iterator, and this function needs to scan it twice (income estimate +
  // weapons factory counts below).
  const tiles = [...tilesIterable];
  const techIds = [...player.techIds];
  const domainIds = [...(player.domainIds ?? [])];
  const techChoices = reachableTechChoices(techIds);
  const domainChoices = openDomainChoices(domainIds);
  const reachableDomainChoiceSet = new Set(reachableDomainChoices(techIds, domainIds));
  const available = player.strategicResources ?? {};
  const goldCost = techGoldCostForResearchedCount(player.techIds.size);
  const strategicResources = {
    FOOD: available.FOOD ?? 0,
    TITANIUM: available.TITANIUM ?? 0,
    CRYSTAL: available.CRYSTAL ?? 0,
    UMBRITE: available.UMBRITE ?? 0,
    SHARD: available.SHARD ?? 0
  };
  return {
    status: "completed" as const,
    techRootId: player.techRootId ?? "rewrite-local",
    currentResearch: undefined,
    techIds,
    nextChoices: techChoices,
    availableTechPicks: techChoices.length > 0 ? 1 : 0,
    mods: player.mods ?? { attack: 1, defense: 1, income: 1, vision: 1 },
    modBreakdown: buildModBreakdownForPlayer(player, weaponsFactoryCountsForPlayer(player.id, tiles)),
    incomePerMinute: options?.incomePerMinute ?? estimateIncomePerMinuteFromTiles(player.id, tiles),
    missions: [],
    gold: player.points,
    strategicResources,
    techCatalog: techTree.techs.map((tech) => ({
      id: tech.id,
      tier: tech.tier,
      name: tech.name,
      description: tech.description,
      ...(typeof tech.researchTimeSeconds === "number" ? { researchTimeSeconds: tech.researchTimeSeconds } : {}),
      ...(tech.rootId ? { rootId: tech.rootId } : {}),
      ...(tech.branch ? { branch: tech.branch } : {}),
      ...(tech.requires ? { requires: tech.requires } : {}),
      ...(tech.prereqIds && tech.prereqIds.length > 0 ? { prereqIds: [...tech.prereqIds] } : {}),
      ...(tech.effects ? { effects: tech.effects } : {}),
      mods: tech.mods ?? {},
      requirements: {
        gold: goldCost,
        resources: toResources(tech.cost),
        canResearch: techChoices.includes(tech.id) && player.points >= goldCost && hasResources(toResources(tech.cost), available)
      },
      ...(tech.grantsPowerup ? { grantsPowerup: tech.grantsPowerup } : {})
    })),
    domainIds,
    domainChoices,
    domainCatalog: domainTree.domains.map((domain) => ({
      id: domain.id,
      tier: domain.tier,
      name: domain.name,
      description: domain.description,
      requiresTechId: domain.requiresTechId,
      ...(domain.effects ? { effects: domain.effects } : {}),
      mods: domain.mods ?? {},
      requirements: {
        gold: domain.cost?.gold ?? 0,
        resources: toResources(domain.cost),
        canResearch: reachableDomainChoiceSet.has(domain.id) && player.points >= (domain.cost?.gold ?? 0) && hasResources(toResources(domain.cost), available)
      }
    })),
    revealCapacity: 0,
    activeRevealTargets: [],
    // Echo the player's locked sub-choice (Clockwork Stipend) so the client
    // can render "Clockwork Stipend (TITANIUM)" after a reconnect and skip the
    // pick modal when the player tries to re-confirm an already-locked
    // domain. Field is omitted when the player has never picked.
    ...(player.chosenTrickleResource ? { chosenTrickleResource: player.chosenTrickleResource } : {})
  };
};

export const buildDomainUpdatePayload = (
  player: DomainPlayer,
  tiles: Iterable<DomainTileState>,
  options?: { incomePerMinute?: number }
) => {
  const techPayload = buildTechUpdatePayload(player, tiles, options);
  return {
    domainIds: techPayload.domainIds,
    domainChoices: techPayload.domainChoices,
    domainCatalog: techPayload.domainCatalog,
    revealCapacity: techPayload.revealCapacity,
    activeRevealTargets: techPayload.activeRevealTargets,
    mods: techPayload.mods,
    modBreakdown: techPayload.modBreakdown,
    incomePerMinute: techPayload.incomePerMinute,
    missions: techPayload.missions,
    gold: techPayload.gold,
    strategicResources: techPayload.strategicResources,
    ...(player.chosenTrickleResource ? { chosenTrickleResource: player.chosenTrickleResource } : {})
  };
};

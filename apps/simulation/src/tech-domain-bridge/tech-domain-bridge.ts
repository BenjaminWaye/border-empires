import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { TRICKLE_RESOURCE_KEYS, type ChosenTrickleResource } from "@border-empires/shared";
import type { DomainPlayer, DomainTileState } from "@border-empires/game-domain";
import { VISION_RADIUS } from "@border-empires/shared";
import { estimateIncomePerMinuteFromTiles } from "../player-runtime-summary.js";

type StatMods = NonNullable<DomainPlayer["mods"]>;
type ModKey = keyof StatMods;

export type ModBreakdown = Record<ModKey, Array<{ label: string; mult: number }>>;

type TechCatalogEntry = {
  id: string;
  tier: number;
  name: string;
  description: string;
  researchTimeSeconds?: number;
  rootId?: string;
  requires?: string;
  prereqIds?: string[];
  effects?: Record<string, unknown>;
  mods?: Partial<StatMods>;
  cost?: Partial<Record<"gold" | "food" | "iron" | "crystal" | "supply" | "shard", number>>;
  grantsPowerup?: { id: string; charges: number };
};

type DomainCatalogEntry = {
  id: string;
  tier: number;
  name: string;
  description: string;
  requiresTechId: string;
  effects?: Record<string, unknown>;
  mods?: Partial<StatMods>;
  cost?: Partial<Record<"gold" | "food" | "iron" | "crystal" | "supply" | "shard", number>>;
};

type StrategicCounts = Partial<Record<"FOOD" | "IRON" | "CRYSTAL" | "SUPPLY" | "SHARD", number>>;
type TileResource = NonNullable<DomainTileState["resource"]>;
type RawResourceCounts = Partial<Record<TileResource, number>>;

type AiProgressionPlannerTile = {
  ownerId?: string | undefined;
  ownershipState?: string | undefined;
  resource?: string | undefined;
  town?: unknown;
  dockId?: string | undefined;
};

type AiProgressionPlayer = {
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

const toResources = (
  cost?: Partial<Record<"gold" | "food" | "iron" | "crystal" | "supply" | "shard", number>>
): StrategicCounts => ({
  ...(typeof cost?.food === "number" && cost.food > 0 ? { FOOD: cost.food } : {}),
  ...(typeof cost?.iron === "number" && cost.iron > 0 ? { IRON: cost.iron } : {}),
  ...(typeof cost?.crystal === "number" && cost.crystal > 0 ? { CRYSTAL: cost.crystal } : {}),
  ...(typeof cost?.supply === "number" && cost.supply > 0 ? { SUPPLY: cost.supply } : {}),
  ...(typeof cost?.shard === "number" && cost.shard > 0 ? { SHARD: cost.shard } : {})
});

const rawResourceCountsForPlayer = (playerId: string, tiles: Iterable<AiProgressionPlannerTile>): RawResourceCounts => {
  const counts: RawResourceCounts = {};
  for (const tile of tiles) {
    if (tile.ownerId !== playerId || tile.ownershipState !== "SETTLED" || !tile.resource) continue;
    const resource = tile.resource as TileResource;
    counts[resource] = (counts[resource] ?? 0) + 1;
  }
  return counts;
};

const reachableTechChoices = (ownedTechIds: string[]): string[] =>
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

const reachableDomainChoices = (ownedTechIds: string[], ownedDomainIds: string[]): string[] => {
  const targetTier = nextDomainTier(ownedDomainIds);
  if (targetTier === undefined) return [];
  return domainTree.domains
    .filter((domain) => domain.tier === targetTier && !ownedDomainIds.includes(domain.id) && ownedTechIds.includes(domain.requiresTechId))
    .map((domain) => domain.id);
};

const techDepth = (techId: string): number => {
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

const hasResources = (required: StrategicCounts, available: StrategicCounts): boolean =>
  Object.entries(required).every(([resource, amount]) => (available[resource as keyof StrategicCounts] ?? 0) >= (amount ?? 0));

const playerWorldFlags = (playerId: string, tiles: Iterable<AiProgressionPlannerTile>): Set<string> => {
  const flags = new Set<string>();
  for (const tile of tiles) {
    if (tile.ownerId !== playerId || tile.ownershipState !== "SETTLED") continue;
    if (tile.resource === "IRON") flags.add("active_iron_site");
    if (tile.resource === "GEMS") flags.add("active_crystal_site");
    if (tile.town) flags.add("active_town");
    if (tile.dockId) flags.add("active_dock");
  }
  return flags;
};

const techEntryById = new Map(techTree.techs.map((tech) => [tech.id, tech] as const));
const domainEntryById = new Map(domainTree.domains.map((domain) => [domain.id, domain] as const));

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
  player: Pick<DomainPlayer, "techIds" | "domainIds">
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

export const effectiveVisionRadiusForPlayer = (
  player: Pick<DomainPlayer, "mods" | "techIds" | "domainIds">
): number => Math.max(1, Math.floor(VISION_RADIUS * (player.mods?.vision ?? 1)) + visionRadiusBonusForPlayer(player));

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
  baseRadius +
  additiveEffectForPlayer(player, "observatoryRangeBonus");

export const chooseAiTechChoiceForPlayer = (
  player: AiProgressionPlayer,
  tiles: Iterable<AiProgressionPlannerTile>
): AiProgressionChoice | undefined => {
  const flags = playerWorldFlags(player.id, tiles);
  const counts = rawResourceCountsForPlayer(player.id, tiles);
  const available = player.strategicResources ?? {};
  return reachableTechChoices([...player.techIds])
    .map((id) => techEntryById.get(id))
    .filter((tech): tech is TechCatalogEntry => Boolean(tech))
    .map((tech) => {
      let score = 0;
      if (tech.id === "toolmaking") score += 80;
      if (tech.id === "agriculture" && (flags.has("active_town") || (counts.FARM ?? 0) > 0 || (counts.FISH ?? 0) > 0)) score += 55;
      if (tech.id === "trade" && flags.has("active_town")) score += 50;
      if (tech.id === "trade" && flags.has("active_dock")) score += 40;
      if (tech.id === "tribal-warfare" && (counts.IRON ?? 0) > 0) score += 40;
      if (tech.id === "tribal-warfare" && (flags.has("active_town") || flags.has("active_dock"))) score += 28;
      if (tech.id === "cartography" && (counts.GEMS ?? 0) > 0) score += 30;
      if (tech.id === "mining" && (flags.has("active_iron_site") || flags.has("active_crystal_site"))) score += 55;
      if (tech.id === "masonry" && flags.has("active_town")) score += 45;
      if (tech.id === "masonry" && flags.has("active_dock")) score += 25;
      if (tech.id === "leatherworking" && ((counts.WOOD ?? 0) > 0 || (counts.FUR ?? 0) > 0)) score += 35;
      if (tech.id === "harborcraft" && flags.has("active_dock")) score += 65;
      if (tech.id === "maritime-trade" && flags.has("active_dock")) score += 55;
      if (tech.id === "port-infrastructure" && flags.has("active_dock")) score += 45;
      if (tech.id === "coinage" && flags.has("active_town")) score += 55;
      if (tech.id === "banking" && flags.has("active_town")) score += 45;
      if (tech.id === "civil-service" && flags.has("active_town")) score += 35;
      score += Math.max(0, 24 - techDepth(tech.id) * 6);
      const resourceCost = toResources(tech.cost);
      return {
        id: tech.id,
        score,
        goldCost: tech.cost?.gold ?? 0,
        resourceCost,
        affordable: player.points >= (tech.cost?.gold ?? 0) && hasResources(resourceCost, available)
      };
    })
    // Affordable techs win over unaffordable ones regardless of score, so a
    // gold-only fallback is preferred over a higher-scored option the player
    // can't actually pay for. Without this, an AI with 74k gold but zero
    // IRON/CRYSTAL/SUPPLY locks at preplan=tech_unaffordable forever because
    // the top-scored tech needs a strategic resource it lacks. When nothing is
    // affordable, score order is preserved so the diagnostic still surfaces
    // the most-wanted-but-blocked tech.
    .sort((left, right) =>
      Number(right.affordable) - Number(left.affordable) ||
      right.score - left.score ||
      left.id.localeCompare(right.id)
    )[0];
};

export const chooseAiDomainChoiceForPlayer = (
  player: AiProgressionPlayer,
  tiles: Iterable<AiProgressionPlannerTile>
): AiProgressionChoice | undefined => {
  const flags = playerWorldFlags(player.id, tiles);
  const counts = rawResourceCountsForPlayer(player.id, tiles);
  const available = player.strategicResources ?? {};
  const settledTileCountForChoice =
    player.settledTileCount ??
    [...tiles].reduce((count, tile) => count + (tile.ownerId === player.id && tile.ownershipState === "SETTLED" ? 1 : 0), 0);
  return reachableDomainChoices([...player.techIds], [...(player.domainIds ?? [])])
    .map((id) => domainEntryById.get(id))
    .filter((domain): domain is DomainCatalogEntry => Boolean(domain))
    .map((domain) => {
      let score = 0;
      if (domain.id === "frontier-doctrine" && !flags.has("active_town")) score += 45;
      if (domain.id === "frontier-doctrine" && settledTileCountForChoice < 20) score += 20;
      if (domain.id === "mercantile-charter" && flags.has("active_town")) score += 65;
      if (domain.id === "mercantile-charter" && flags.has("active_dock")) score += 35;
      if (domain.id === "clockwork-stipend") score += 30;
      if (domain.id === "iron-bastions" && flags.has("active_town")) score += 20;
      if (domain.id === "supply-raiding" && ((counts.WOOD ?? 0) > 0 || (counts.FUR ?? 0) > 0)) score += 18;
      const resourceCost = toResources(domain.cost);
      return {
        id: domain.id,
        score,
        goldCost: domain.cost?.gold ?? 0,
        resourceCost,
        affordable: player.points >= (domain.cost?.gold ?? 0) && hasResources(resourceCost, available)
      };
    })
    // Affordability dominates score so an AI starved of one resource still
    // picks an affordable domain (e.g. clockwork-stipend, which trickles the
    // missing resource) instead of being pinned to an unaffordable top score.
    .sort((left, right) =>
      Number(right.affordable) - Number(left.affordable) ||
      right.score - left.score ||
      left.id.localeCompare(right.id)
    )[0];
};

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
  if (player.points < (tech.cost?.gold ?? 0) || !hasResources(required, available)) {
    return { ok: false, reason: "requirements not met" };
  }
  player.points = Math.max(0, player.points - (tech.cost?.gold ?? 0));
  spendStrategicResources(player, required);
  player.techIds.add(techId);
  player.techRootId = tech.rootId ?? player.techRootId ?? "rewrite-local";
  player.mods = recomputeMods(player);
  return { ok: true };
};

// Re-exported so runtime.ts and other sim modules that already import this
// bridge for chooseDomainForPlayer / chosenTrickleRateForPlayer don't need a
// second import line. The canonical definition lives in
// @border-empires/shared (trickle-resources.ts) so the client uses the same
// type via its own shared-package import.
export type { ChosenTrickleResource };

export const chosenTrickleOptionsForDomain = (
  domainId: string
): Record<ChosenTrickleResource, number> | undefined => {
  const domain = domainEntryById.get(domainId);
  const raw = domain?.effects?.chosenResourceTrickleOptions;
  if (!raw || typeof raw !== "object") return undefined;
  const options: Partial<Record<ChosenTrickleResource, number>> = {};
  for (const key of TRICKLE_RESOURCE_KEYS) {
    const rate = (raw as Record<string, unknown>)[key];
    if (typeof rate === "number" && Number.isFinite(rate) && rate > 0) options[key] = rate;
  }
  return Object.keys(options).length > 0 ? (options as Record<ChosenTrickleResource, number>) : undefined;
};

export const chosenTrickleRateForPlayer = (
  player: Pick<DomainPlayer, "domainIds" | "chosenTrickleResource">
): { resource: ChosenTrickleResource; ratePerMinute: number } | undefined => {
  const chosen = player.chosenTrickleResource;
  if (chosen !== "IRON" && chosen !== "SUPPLY" && chosen !== "CRYSTAL") return undefined;
  for (const domainId of player.domainIds ?? []) {
    const options = chosenTrickleOptionsForDomain(domainId);
    const rate = options?.[chosen];
    if (typeof rate === "number") return { resource: chosen, ratePerMinute: rate };
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
  const trickleOptions = chosenTrickleOptionsForDomain(domainId);
  if (trickleOptions) {
    const picked = options?.chosenTrickleResource;
    if (!picked || !(picked in trickleOptions)) {
      return { ok: false, reason: "trickle resource choice required" };
    }
  }
  player.points = Math.max(0, player.points - (domain.cost?.gold ?? 0));
  spendStrategicResources(player, required);
  if (!player.domainIds) player.domainIds = new Set<string>();
  player.domainIds.add(domainId);
  if (trickleOptions && options?.chosenTrickleResource) {
    // Locked forever: once a trickle resource is chosen, it does not change
    // even if another domain later offers a different option set.
    if (!player.chosenTrickleResource) player.chosenTrickleResource = options.chosenTrickleResource;
  }
  player.mods = recomputeMods(player);
  return { ok: true };
};

export const buildTechUpdatePayload = (
  player: DomainPlayer,
  tiles: Iterable<DomainTileState>,
  options?: { incomePerMinute?: number }
) => {
  const techIds = [...player.techIds];
  const domainIds = [...(player.domainIds ?? [])];
  const techChoices = reachableTechChoices(techIds);
  const domainChoices = openDomainChoices(domainIds);
  const reachableDomainChoiceSet = new Set(reachableDomainChoices(techIds, domainIds));
  const available = player.strategicResources ?? {};
  const strategicResources = {
    FOOD: available.FOOD ?? 0,
    IRON: available.IRON ?? 0,
    CRYSTAL: available.CRYSTAL ?? 0,
    SUPPLY: available.SUPPLY ?? 0,
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
    modBreakdown: buildModBreakdownForPlayer(player),
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
      ...(tech.requires ? { requires: tech.requires } : {}),
      ...(tech.prereqIds && tech.prereqIds.length > 0 ? { prereqIds: [...tech.prereqIds] } : {}),
      ...(tech.effects ? { effects: tech.effects } : {}),
      mods: tech.mods ?? {},
      requirements: {
        gold: tech.cost?.gold ?? 0,
        resources: toResources(tech.cost),
        canResearch: techChoices.includes(tech.id) && player.points >= (tech.cost?.gold ?? 0) && hasResources(toResources(tech.cost), available)
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
    // can render "Clockwork Stipend (IRON)" after a reconnect and skip the
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

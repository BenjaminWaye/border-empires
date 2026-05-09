import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import type { DomainPlayer, DomainTileState } from "@border-empires/game-domain";
import { VISION_RADIUS } from "@border-empires/shared";
import { estimateIncomePerMinuteFromTiles } from "./player-runtime-summary.js";

type StatMods = NonNullable<DomainPlayer["mods"]>;

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

type StrategicCounts = Partial<Record<"FOOD" | "IRON" | "CRYSTAL" | "SUPPLY" | "SHARD" | "OIL", number>>;
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
  "../../../packages/server/data/tech-tree.json",
  "../../../../packages/server/data/tech-tree.json",
  "../../../packages/game-domain/data/tech-tree.json",
  "../../../../packages/game-domain/data/tech-tree.json",
  "../../../../../../packages/server/data/tech-tree.json",
  "../../../../../../packages/game-domain/data/tech-tree.json"
] as const;
export const DOMAIN_TREE_RELATIVE_CANDIDATES = [
  "../../../packages/server/data/domain-tree.json",
  "../../../../packages/server/data/domain-tree.json",
  "../../../packages/game-domain/data/domain-tree.json",
  "../../../../packages/game-domain/data/domain-tree.json",
  "../../../../../../packages/server/data/domain-tree.json",
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

const strategicCountsForPlayer = (playerId: string, tiles: Iterable<AiProgressionPlannerTile>): StrategicCounts => {
  const counts: StrategicCounts = {};
  for (const tile of tiles) {
    if (tile.ownerId !== playerId || tile.ownershipState !== "SETTLED") continue;
    switch (tile.resource) {
      case "FARM":
      case "FISH":
        counts.FOOD = (counts.FOOD ?? 0) + 1;
        break;
      case "IRON":
        counts.IRON = (counts.IRON ?? 0) + 1;
        break;
      case "GEMS":
        counts.CRYSTAL = (counts.CRYSTAL ?? 0) + 1;
        break;
      case "FUR":
        counts.SUPPLY = (counts.SUPPLY ?? 0) + 1;
        break;
      case "OIL":
        counts.OIL = (counts.OIL ?? 0) + 1;
        break;
    }
  }
  return counts;
};

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

const reachableDomainChoices = (ownedTechIds: string[], ownedDomainIds: string[]): string[] => {
  const chosenTierMax = domainTree.domains.reduce((maxTier, domain) => (
    ownedDomainIds.includes(domain.id) ? Math.max(maxTier, domain.tier) : maxTier
  ), 0);
  const targetTier = Math.min(5, chosenTierMax + 1);
  const pickedAtTargetTier = domainTree.domains.some((domain) => domain.tier === targetTier && ownedDomainIds.includes(domain.id));
  if (pickedAtTargetTier) return [];
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

const recomputeMods = (player: DomainPlayer): StatMods => {
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
      if (tech.id === "aeronautics" && (counts.OIL ?? 0) > 0) score += 50;
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
    .sort((left, right) => right.score - left.score || left.id.localeCompare(right.id))[0];
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
      if (domain.id === "farmers-compact" && ((counts.FARM ?? 0) > 0 || (counts.FISH ?? 0) > 0)) score += 50;
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
    .sort((left, right) => right.score - left.score || left.id.localeCompare(right.id))[0];
};

const settledTileCount = (playerId: string, tiles: Iterable<DomainTileState>): number => {
  let count = 0;
  for (const tile of tiles) {
    if (tile.ownerId === playerId && tile.ownershipState === "SETTLED") count += 1;
  }
  return count;
};

export const chooseTechForPlayer = (
  player: DomainPlayer,
  techId: string,
  tiles: Iterable<DomainTileState>
): { ok: true } | { ok: false; reason: string } => {
  const tech = techTree.techs.find((entry) => entry.id === techId);
  if (!tech) return { ok: false, reason: "tech not found" };
  const choices = reachableTechChoices([...player.techIds]);
  if (!choices.includes(techId)) return { ok: false, reason: "requirements not met" };
  const strategic = strategicCountsForPlayer(player.id, tiles);
  const required = toResources(tech.cost);
  if (player.points < (tech.cost?.gold ?? 0) || !hasResources(required, strategic)) {
    return { ok: false, reason: "requirements not met" };
  }
  player.points = Math.max(0, player.points - (tech.cost?.gold ?? 0));
  player.techIds.add(techId);
  player.techRootId = tech.rootId ?? player.techRootId ?? "rewrite-local";
  player.mods = recomputeMods(player);
  return { ok: true };
};

export const chooseDomainForPlayer = (
  player: DomainPlayer,
  domainId: string,
  tiles: Iterable<DomainTileState>
): { ok: true } | { ok: false; reason: string } => {
  const domain = domainTree.domains.find((entry) => entry.id === domainId);
  if (!domain) return { ok: false, reason: "domain not found" };
  const ownedDomainIds = [...(player.domainIds ?? [])];
  const choices = reachableDomainChoices([...player.techIds], ownedDomainIds);
  if (!choices.includes(domainId)) return { ok: false, reason: "requirements not met" };
  const strategic = strategicCountsForPlayer(player.id, tiles);
  const required = toResources(domain.cost);
  if (player.points < (domain.cost?.gold ?? 0) || !hasResources(required, strategic)) {
    return { ok: false, reason: "requirements not met" };
  }
  player.points = Math.max(0, player.points - (domain.cost?.gold ?? 0));
  if (!player.domainIds) player.domainIds = new Set<string>();
  player.domainIds.add(domainId);
  player.mods = recomputeMods(player);
  return { ok: true };
};

export const buildTechUpdatePayload = (player: DomainPlayer, tiles: Iterable<DomainTileState>) => {
  const techIds = [...player.techIds];
  const domainIds = [...(player.domainIds ?? [])];
  const techChoices = reachableTechChoices(techIds);
  const domainChoices = reachableDomainChoices(techIds, domainIds);
  const strategic = strategicCountsForPlayer(player.id, tiles);
  return {
    status: "completed" as const,
    techRootId: player.techRootId ?? "rewrite-local",
    currentResearch: undefined,
    techIds,
    nextChoices: techChoices,
    availableTechPicks: techChoices.length > 0 ? 1 : 0,
    mods: player.mods ?? { attack: 1, defense: 1, income: 1, vision: 1 },
    incomePerMinute: estimateIncomePerMinuteFromTiles(player.id, tiles),
    missions: [],
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
        canResearch: techChoices.includes(tech.id) && player.points >= (tech.cost?.gold ?? 0) && hasResources(toResources(tech.cost), strategic)
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
        canResearch: domainChoices.includes(domain.id) && player.points >= (domain.cost?.gold ?? 0) && hasResources(toResources(domain.cost), strategic)
      }
    })),
    revealCapacity: 0,
    activeRevealTargets: []
  };
};

export const buildDomainUpdatePayload = (player: DomainPlayer, tiles: Iterable<DomainTileState>) => {
  const techPayload = buildTechUpdatePayload(player, tiles);
  return {
    domainIds: techPayload.domainIds,
    domainChoices: techPayload.domainChoices,
    domainCatalog: techPayload.domainCatalog,
    revealCapacity: techPayload.revealCapacity,
    activeRevealTargets: techPayload.activeRevealTargets,
    mods: techPayload.mods,
    incomePerMinute: techPayload.incomePerMinute,
    missions: techPayload.missions
  };
};

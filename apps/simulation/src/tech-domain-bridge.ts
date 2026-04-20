import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import type { DomainPlayer, DomainTileState } from "@border-empires/game-domain";
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

const resolveDataPath = (relativeCandidates: string[]): string => {
  for (const relativePath of relativeCandidates) {
    const resolved = fileURLToPath(new URL(relativePath, import.meta.url));
    if (existsSync(resolved)) return resolved;
  }
  return fileURLToPath(new URL(relativeCandidates[0]!, import.meta.url));
};

const TECH_TREE_PATH = resolveDataPath([
  "../../../packages/game-domain/data/tech-tree.json",
  "../../../../packages/game-domain/data/tech-tree.json",
  "../../../../../../packages/game-domain/data/tech-tree.json"
]);
const DOMAIN_TREE_PATH = resolveDataPath([
  "../../../packages/game-domain/data/domain-tree.json",
  "../../../../packages/game-domain/data/domain-tree.json",
  "../../../../../../packages/game-domain/data/domain-tree.json"
]);

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

const strategicCountsForPlayer = (playerId: string, tiles: Iterable<DomainTileState>): StrategicCounts => {
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

const hasResources = (required: StrategicCounts, available: StrategicCounts): boolean =>
  Object.entries(required).every(([resource, amount]) => (available[resource as keyof StrategicCounts] ?? 0) >= (amount ?? 0));

const recomputeMods = (player: DomainPlayer): StatMods => {
  const next: StatMods = { attack: 1, defense: 1, income: 1, vision: 1 };
  for (const techId of player.techIds) {
    const tech = techTree.techs.find((entry) => entry.id === techId);
    if (!tech?.mods) continue;
    next.attack *= tech.mods.attack ?? 1;
    next.defense *= tech.mods.defense ?? 1;
    next.income *= tech.mods.income ?? 1;
    next.vision *= tech.mods.vision ?? 1;
  }
  for (const domainId of player.domainIds ?? []) {
    const domain = domainTree.domains.find((entry) => entry.id === domainId);
    if (!domain?.mods) continue;
    next.attack *= domain.mods.attack ?? 1;
    next.defense *= domain.mods.defense ?? 1;
    next.income *= domain.mods.income ?? 1;
    next.vision *= domain.mods.vision ?? 1;
  }
  return next;
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

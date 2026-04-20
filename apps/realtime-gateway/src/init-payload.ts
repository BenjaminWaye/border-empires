import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
  MANPOWER_BASE_CAP,
  MANPOWER_BASE_REGEN_PER_MINUTE,
  type SeasonVictoryObjectiveView,
  type SeasonVictoryPathId,
  type ResourceType,
  type Terrain,
  WORLD_HEIGHT,
  WORLD_WIDTH
} from "@border-empires/shared";
import type { PlayerSubscriptionSnapshot } from "@border-empires/sim-protocol";
import {
  SEASON_VICTORY_CONTINENT_FOOTPRINT_SHARE,
  SEASON_VICTORY_ECONOMY_LEAD_MULT,
  SEASON_VICTORY_ECONOMY_MIN_INCOME,
  SEASON_VICTORY_SETTLED_TERRITORY_SHARE,
  SEASON_VICTORY_TOWN_CONTROL_SHARE,
  VICTORY_PRESSURE_DEFS
} from "../../../packages/server/src/server-game-constants.js";

import type { LegacySnapshotBootstrap } from "../../simulation/src/legacy-snapshot-bootstrap.js";
import { createSeedWorld, simulationWorldSeedForProfile, type SimulationSeedProfile } from "../../simulation/src/seed-state.js";

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
  mods?: Partial<Record<"attack" | "defense" | "income" | "vision", number>>;
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
  mods?: Partial<Record<"attack" | "defense" | "income" | "vision", number>>;
  cost?: Partial<Record<"gold" | "food" | "iron" | "crystal" | "supply" | "shard", number>>;
};

type GatewayInitPayload = {
  runtimeIdentity: {
    sourceType: "legacy-snapshot" | "seed-profile";
    seasonId: string;
    worldSeed: number;
    fingerprint: string;
    snapshotLabel?: string;
    seedProfile?: string;
    playerCount: number;
    seededTileCount: number;
  };
  player: {
    id: string;
    name: string;
    gold: number;
    points: number;
    level: number;
    stamina: number;
    manpower: number;
    manpowerCap: number;
    manpowerRegenPerMinute: number;
    incomePerMinute: number;
    strategicResources: Record<"FOOD" | "IRON" | "CRYSTAL" | "SUPPLY" | "SHARD" | "OIL", number>;
    strategicProductionPerMinute: Record<"FOOD" | "IRON" | "CRYSTAL" | "SUPPLY" | "SHARD" | "OIL", number>;
    economyBreakdown?: Record<string, unknown>;
    upkeepPerMinute: { food: number; iron: number; supply: number; crystal: number; oil: number; gold: number };
    upkeepLastTick?: Record<string, unknown>;
    techIds: string[];
    domainIds: string[];
    availableTechPicks: number;
    techRootId: string;
    homeTile?: { x: number; y: number };
    tileColor?: string;
  };
  config: { width: number; height: number; season: { seasonId: string; worldSeed: number } };
  techChoices: string[];
  techCatalog: Array<{
    id: string;
    tier: number;
    name: string;
    description: string;
    researchTimeSeconds?: number;
    rootId?: string;
    requires?: string;
    prereqIds?: string[];
    effects?: Record<string, unknown>;
    mods: Partial<Record<"attack" | "defense" | "income" | "vision", number>>;
    requirements: {
      gold: number;
      resources: Partial<Record<"FOOD" | "IRON" | "CRYSTAL" | "SUPPLY" | "SHARD" | "OIL", number>>;
      canResearch: boolean;
    };
    grantsPowerup?: { id: string; charges: number };
  }>;
  domainChoices: string[];
  domainCatalog: Array<{
    id: string;
    tier: number;
    name: string;
    description: string;
    requiresTechId: string;
    effects?: Record<string, unknown>;
    mods: Partial<Record<"attack" | "defense" | "income" | "vision", number>>;
    requirements: {
      gold: number;
      resources: Partial<Record<"FOOD" | "IRON" | "CRYSTAL" | "SUPPLY" | "SHARD" | "OIL", number>>;
      canResearch: boolean;
    };
  }>;
  leaderboard: {
    overall: Array<{ id: string; name: string; tiles: number; incomePerMinute: number; techs: number; score: number; rank: number }>;
    selfOverall?: { id: string; name: string; tiles: number; incomePerMinute: number; techs: number; score: number; rank: number };
    byTiles: Array<{ id: string; name: string; value: number; rank: number }>;
    selfByTiles?: { id: string; name: string; value: number; rank: number };
    byIncome: Array<{ id: string; name: string; value: number; rank: number }>;
    selfByIncome?: { id: string; name: string; value: number; rank: number };
    byTechs: Array<{ id: string; name: string; value: number; rank: number }>;
    selfByTechs?: { id: string; name: string; value: number; rank: number };
  };
  playerStyles: Array<{ id: string; name: string; tileColor: string }>;
  missions: [];
  domainIds: string[];
  seasonVictory: SeasonVictoryObjectiveView[];
  mapMeta: {
    dockCount: number;
    dockPairCount: number;
    clusterCount: number;
    townCount: number;
    dockPairs: Array<{ ax: number; ay: number; bx: number; by: number }>;
  };
};

type SeedTileState = {
  x: number;
  y: number;
  terrain: Terrain;
};

const resolveDataPath = (relativeCandidates: string[]): string => {
  for (const relativePath of relativeCandidates) {
    const resolved = fileURLToPath(new URL(relativePath, import.meta.url));
    if (existsSync(resolved)) return resolved;
  }
  return fileURLToPath(new URL(relativeCandidates[0]!, import.meta.url));
};

const TECH_TREE_PATH = resolveDataPath([
  "../../../packages/server/data/tech-tree.json",
  "../../../../packages/server/data/tech-tree.json",
  "../../../../../../packages/server/data/tech-tree.json"
]);
const DOMAIN_TREE_PATH = resolveDataPath([
  "../../../packages/server/data/domain-tree.json",
  "../../../../packages/server/data/domain-tree.json",
  "../../../../../../packages/server/data/domain-tree.json"
]);

const techTree = JSON.parse(readFileSync(TECH_TREE_PATH, "utf8")) as { techs: TechCatalogEntry[] };
const domainTree = JSON.parse(readFileSync(DOMAIN_TREE_PATH, "utf8")) as { domains: DomainCatalogEntry[] };

const hexColorForPlayerId = (playerId: string): string => {
  let hash = 0;
  for (let index = 0; index < playerId.length; index += 1) hash = ((hash << 5) - hash + playerId.charCodeAt(index)) | 0;
  const hue = Math.abs(hash) % 360;
  const saturation = 72;
  const lightness = 54;
  const chroma = (1 - Math.abs((2 * lightness) / 100 - 1)) * (saturation / 100);
  const hueSegment = hue / 60;
  const x = chroma * (1 - Math.abs((hueSegment % 2) - 1));
  const [r1, g1, b1] =
    hueSegment < 1 ? [chroma, x, 0] :
    hueSegment < 2 ? [x, chroma, 0] :
    hueSegment < 3 ? [0, chroma, x] :
    hueSegment < 4 ? [0, x, chroma] :
    hueSegment < 5 ? [x, 0, chroma] : [chroma, 0, x];
  const match = lightness / 100 - chroma / 2;
  const toHex = (value: number): string => Math.round((value + match) * 255).toString(16).padStart(2, "0");
  return `#${toHex(r1)}${toHex(g1)}${toHex(b1)}`;
};

const displayNameForSeedPlayer = (playerId: string, fallbackName: string): string => {
  if (playerId === "player-1") return fallbackName;
  if (playerId === "barbarian-1") return "Barbarians";
  if (playerId.startsWith("ai-")) return `AI ${playerId.slice(3)}`;
  return playerId;
};

const firstOwnedTile = (playerId: string, snapshot: PlayerSubscriptionSnapshot): { x: number; y: number } | undefined => {
  const townTile = snapshot.tiles.find((tile) => tile.ownerId === playerId && tile.townType);
  if (townTile) return { x: townTile.x, y: townTile.y };
  const ownedTile = snapshot.tiles.find((tile) => tile.ownerId === playerId);
  return ownedTile ? { x: ownedTile.x, y: ownedTile.y } : undefined;
};

const settledCountsFromSnapshot = (snapshot: { tiles: ReadonlyArray<Record<string, unknown>> } | undefined): Map<string, number> => {
  const counts = new Map<string, number>();
  if (!snapshot) return counts;
  for (const tile of snapshot.tiles) {
    const ownerId = typeof tile.ownerId === "string" ? tile.ownerId : undefined;
    const ownershipState = typeof tile.ownershipState === "string" ? tile.ownershipState : undefined;
    if (!ownerId || ownershipState !== "SETTLED") continue;
    counts.set(ownerId, (counts.get(ownerId) ?? 0) + 1);
  }
  return counts;
};

const toResources = (
  cost?: Partial<Record<"gold" | "food" | "iron" | "crystal" | "supply" | "shard", number>>
): Partial<Record<"FOOD" | "IRON" | "CRYSTAL" | "SUPPLY" | "SHARD" | "OIL", number>> => ({
  ...(typeof cost?.food === "number" && cost.food > 0 ? { FOOD: cost.food } : {}),
  ...(typeof cost?.iron === "number" && cost.iron > 0 ? { IRON: cost.iron } : {}),
  ...(typeof cost?.crystal === "number" && cost.crystal > 0 ? { CRYSTAL: cost.crystal } : {}),
  ...(typeof cost?.supply === "number" && cost.supply > 0 ? { SUPPLY: cost.supply } : {}),
  ...(typeof cost?.shard === "number" && cost.shard > 0 ? { SHARD: cost.shard } : {})
});

const reachableTechChoices = (ownedTechIds: string[]): string[] =>
  techTree.techs
    .filter((tech) => {
      if (ownedTechIds.includes(tech.id)) return false;
      const prereqs = tech.prereqIds && tech.prereqIds.length > 0 ? tech.prereqIds : tech.requires ? [tech.requires] : [];
      return prereqs.every((techId) => ownedTechIds.includes(techId));
    })
    .map((tech) => tech.id);

const reachableDomainChoices = (ownedTechIds: string[], ownedDomainIds: string[]): string[] =>
  domainTree.domains
    .filter((domain) => !ownedDomainIds.includes(domain.id) && ownedTechIds.includes(domain.requiresTechId))
    .map((domain) => domain.id);

const rankMetric = <T extends { id: string; name: string; value: number }>(entries: T[]) =>
  entries
    .slice()
    .sort((left, right) => right.value - left.value || left.name.localeCompare(right.name))
    .map((entry, index) => ({ ...entry, rank: index + 1 }));

const RESOURCE_TYPES: ResourceType[] = ["FARM", "WOOD", "IRON", "GEMS", "FISH", "FUR", "OIL"];

const tileKeyOf = (x: number, y: number): string => `${x},${y}`;

const exportDockPairsFromSnapshot = (
  docks: Array<{ dockId: string; tileKey: string; pairedDockId?: string; connectedDockIds?: string[] }>
): Array<{ ax: number; ay: number; bx: number; by: number }> => {
  const dockById = new Map(docks.map((dock) => [dock.dockId, dock] as const));
  const seen = new Set<string>();
  const pairs: Array<{ ax: number; ay: number; bx: number; by: number }> = [];
  for (const dock of docks) {
    const links =
      dock.connectedDockIds && dock.connectedDockIds.length > 0
        ? dock.connectedDockIds
        : dock.pairedDockId
          ? [dock.pairedDockId]
          : [];
    for (const linkedDockId of links) {
      const linked = dockById.get(linkedDockId);
      if (!linked) continue;
      const edgeKey = dock.dockId < linked.dockId ? `${dock.dockId}|${linked.dockId}` : `${linked.dockId}|${dock.dockId}`;
      if (seen.has(edgeKey)) continue;
      seen.add(edgeKey);
      const [axRaw, ayRaw] = dock.tileKey.split(",");
      const [bxRaw, byRaw] = linked.tileKey.split(",");
      const ax = Number(axRaw);
      const ay = Number(ayRaw);
      const bx = Number(bxRaw);
      const by = Number(byRaw);
      if (![ax, ay, bx, by].every(Number.isFinite)) continue;
      pairs.push({ ax, ay, bx, by });
    }
  }
  return pairs;
};

const buildIslandMap = (seedTiles: Map<string, SeedTileState>): Map<string, number> => {
  const islandByTile = new Map<string, number>();
  let nextIslandId = 1;
  const neighbors = [
    [-1, 0],
    [1, 0],
    [0, -1],
    [0, 1]
  ] as const;
  for (const tile of seedTiles.values()) {
    const key = tileKeyOf(tile.x, tile.y);
    if (tile.terrain !== "LAND" || islandByTile.has(key)) continue;
    const queue: Array<{ x: number; y: number }> = [{ x: tile.x, y: tile.y }];
    islandByTile.set(key, nextIslandId);
    while (queue.length > 0) {
      const current = queue.shift()!;
      for (const [dx, dy] of neighbors) {
        const nx = current.x + dx;
        const ny = current.y + dy;
        const neighborKey = tileKeyOf(nx, ny);
        if (islandByTile.has(neighborKey)) continue;
        const neighbor = seedTiles.get(neighborKey);
        if (!neighbor || neighbor.terrain !== "LAND") continue;
        islandByTile.set(neighborKey, nextIslandId);
        queue.push({ x: nx, y: ny });
      }
    }
    nextIslandId += 1;
  }
  return islandByTile;
};

const objectiveSelfProgressLabel = (
  objectiveId: SeasonVictoryPathId,
  playerId: string,
  metricsByPlayerId: Map<string, { towns: number; settledTiles: number; incomePerMinute: number; name: string }>,
  townTarget: number,
  settledTarget: number,
  totalResourceCounts: Record<ResourceType, number>,
  ownedResourceCountsByPlayerId: Map<string, Record<ResourceType, number>>,
  islandTotals: Map<number, number>,
  settledIslandCountsByPlayerId: Map<string, Map<number, number>>
): string | undefined => {
  const metric = metricsByPlayerId.get(playerId);
  if (!metric) return undefined;
  if (objectiveId === "TOWN_CONTROL") return `${metric.towns}/${townTarget} towns`;
  if (objectiveId === "SETTLED_TERRITORY") return `${metric.settledTiles}/${settledTarget} settled land`;
  if (objectiveId === "ECONOMIC_HEGEMONY") return `${metric.incomePerMinute.toFixed(1)} gold/m`;
  if (objectiveId === "RESOURCE_MONOPOLY") {
    const owned = ownedResourceCountsByPlayerId.get(playerId) ?? { FARM: 0, WOOD: 0, IRON: 0, GEMS: 0, FISH: 0, FUR: 0, OIL: 0 };
    let bestResource: ResourceType | undefined;
    let bestOwned = 0;
    let bestTotal = 0;
    for (const resource of RESOURCE_TYPES) {
      const total = totalResourceCounts[resource] ?? 0;
      if (total <= 0) continue;
      const value = owned[resource] ?? 0;
      if (value > bestOwned) {
        bestOwned = value;
        bestTotal = total;
        bestResource = resource;
      }
    }
    return bestResource ? `${bestOwned}/${bestTotal} ${bestResource}` : "No resource control";
  }
  const settledByIsland = settledIslandCountsByPlayerId.get(playerId) ?? new Map<number, number>();
  const totalIslands = Math.max(1, islandTotals.size);
  let qualifiedCount = 0;
  let weakestQualifiedRatio = 0;
  let weakestQualifiedOwned = 0;
  let weakestQualifiedTotal = 0;
  for (const [islandId, islandTotal] of islandTotals) {
    if (islandTotal <= 0) continue;
    const owned = settledByIsland.get(islandId) ?? 0;
    const ratio = owned / islandTotal;
    if (ratio >= SEASON_VICTORY_CONTINENT_FOOTPRINT_SHARE) {
      qualifiedCount += 1;
      if (weakestQualifiedTotal === 0 || ratio < weakestQualifiedRatio) {
        weakestQualifiedRatio = ratio;
        weakestQualifiedOwned = owned;
        weakestQualifiedTotal = islandTotal;
      }
    }
  }
  return qualifiedCount > 0 && weakestQualifiedTotal > 0
    ? `${qualifiedCount}/${totalIslands} islands at 10%+ settled · weakest island ${Math.round(weakestQualifiedRatio * 100)}% (${weakestQualifiedOwned}/${weakestQualifiedTotal})`
    : `${qualifiedCount}/${totalIslands} islands at 10%+ settled`;
};

const buildSeasonVictoryObjectives = (
  playerId: string,
  snapshotBootstrap: LegacySnapshotBootstrap | undefined,
  initialState: PlayerSubscriptionSnapshot | undefined,
  leaderboardOverall: Array<{ id: string; name: string; tiles: number; incomePerMinute: number; techs: number; score: number; rank: number }>
): SeasonVictoryObjectiveView[] => {
  if (!snapshotBootstrap || !initialState) return [];
  const worldTiles = snapshotBootstrap.initialState.tiles;
  const townCountByPlayerId = new Map<string, number>();
  const settledCountByPlayerId = new Map<string, number>();
  const metricsByPlayerId = new Map<string, { towns: number; settledTiles: number; incomePerMinute: number; name: string }>();
  const totalResourceCounts: Record<ResourceType, number> = { FARM: 0, WOOD: 0, IRON: 0, GEMS: 0, FISH: 0, FUR: 0, OIL: 0 };
  const ownedResourceCountsByPlayerId = new Map<string, Record<ResourceType, number>>();
  const islandByTile = buildIslandMap(snapshotBootstrap.seedTiles);
  const islandTotals = new Map<number, number>();
  const settledIslandCountsByPlayerId = new Map<string, Map<number, number>>();
  for (const [key, islandId] of islandByTile) islandTotals.set(islandId, (islandTotals.get(islandId) ?? 0) + 1);
  for (const tile of worldTiles) {
    const key = tileKeyOf(tile.x, tile.y);
    if (tile.ownerId && tile.town?.type) townCountByPlayerId.set(tile.ownerId, (townCountByPlayerId.get(tile.ownerId) ?? 0) + 1);
    if (tile.ownerId && tile.ownershipState === "SETTLED") {
      settledCountByPlayerId.set(tile.ownerId, (settledCountByPlayerId.get(tile.ownerId) ?? 0) + 1);
      const islandId = islandByTile.get(key);
      if (islandId !== undefined) {
        const settledByIsland = settledIslandCountsByPlayerId.get(tile.ownerId) ?? new Map<number, number>();
        settledByIsland.set(islandId, (settledByIsland.get(islandId) ?? 0) + 1);
        settledIslandCountsByPlayerId.set(tile.ownerId, settledByIsland);
      }
    }
    if (tile.resource) {
      const resource = tile.resource as ResourceType;
      totalResourceCounts[resource] += 1;
      if (tile.ownerId) {
        const owned = ownedResourceCountsByPlayerId.get(tile.ownerId) ?? { FARM: 0, WOOD: 0, IRON: 0, GEMS: 0, FISH: 0, FUR: 0, OIL: 0 };
        owned[resource] = (owned[resource] ?? 0) + 1;
        ownedResourceCountsByPlayerId.set(tile.ownerId, owned);
      }
    }
  }
  for (const entry of leaderboardOverall) {
    metricsByPlayerId.set(entry.id, {
      towns: townCountByPlayerId.get(entry.id) ?? 0,
      settledTiles: settledCountByPlayerId.get(entry.id) ?? 0,
      incomePerMinute: entry.incomePerMinute,
      name: entry.name
    });
  }
  const totalTownCount = Math.max(1, [...snapshotBootstrap.seedTiles.values()].filter((tile) => Boolean(tile.town)).length);
  const townTarget = Math.max(1, Math.ceil(totalTownCount * SEASON_VICTORY_TOWN_CONTROL_SHARE));
  const totalLandTiles = Math.max(1, [...snapshotBootstrap.seedTiles.values()].filter((tile) => tile.terrain === "LAND").length);
  const settledTarget = Math.max(1, Math.ceil(totalLandTiles * SEASON_VICTORY_SETTLED_TERRITORY_SHARE));
  const trackers = new Map(snapshotBootstrap.seasonVictory ?? []);
  return VICTORY_PRESSURE_DEFS.map((def) => {
    let leaderPlayerId: string | undefined;
    let leaderName = "No leader";
    let leaderValue = 0;
    let progressLabel = "";
    let thresholdLabel = "";
    let conditionMet = false;
    if (def.id === "TOWN_CONTROL") {
      const ranked = [...metricsByPlayerId.entries()].sort((a, b) => (b[1].towns - a[1].towns) || a[0].localeCompare(b[0]));
      leaderPlayerId = ranked[0]?.[0];
      leaderValue = ranked[0]?.[1].towns ?? 0;
      leaderName = ranked[0]?.[1].name ?? "No leader";
      progressLabel = `${leaderValue}/${townTarget} towns`;
      thresholdLabel = `Need ${townTarget} towns`;
      conditionMet = Boolean(leaderPlayerId && leaderValue >= townTarget);
    } else if (def.id === "SETTLED_TERRITORY") {
      const ranked = [...metricsByPlayerId.entries()].sort((a, b) => (b[1].settledTiles - a[1].settledTiles) || a[0].localeCompare(b[0]));
      leaderPlayerId = ranked[0]?.[0];
      leaderValue = ranked[0]?.[1].settledTiles ?? 0;
      leaderName = ranked[0]?.[1].name ?? "No leader";
      progressLabel = `${leaderValue}/${settledTarget} settled land`;
      thresholdLabel = `Need ${settledTarget} settled land tiles`;
      conditionMet = Boolean(leaderPlayerId && leaderValue >= settledTarget);
    } else if (def.id === "ECONOMIC_HEGEMONY") {
      const ranked = leaderboardOverall.slice().sort((a, b) => (b.incomePerMinute - a.incomePerMinute) || a.id.localeCompare(b.id));
      const leader = ranked[0];
      const runnerUp = ranked[1];
      leaderPlayerId = leader?.id;
      leaderName = leader?.name ?? "No leader";
      leaderValue = leader?.incomePerMinute ?? 0;
      progressLabel = `${leaderValue.toFixed(1)} gold/m vs ${(runnerUp?.incomePerMinute ?? 0).toFixed(1)}`;
      thresholdLabel = `Need at least ${SEASON_VICTORY_ECONOMY_MIN_INCOME} gold/m and 33% lead`;
      conditionMet = Boolean(
        leaderPlayerId &&
          runnerUp &&
          leaderValue >= SEASON_VICTORY_ECONOMY_MIN_INCOME &&
          runnerUp.incomePerMinute > 0 &&
          leaderValue >= runnerUp.incomePerMinute * SEASON_VICTORY_ECONOMY_LEAD_MULT
      );
    } else if (def.id === "RESOURCE_MONOPOLY") {
      let bestResource: ResourceType | undefined;
      let bestOwned = 0;
      let bestTotal = 0;
      for (const [candidatePlayerId, owned] of ownedResourceCountsByPlayerId) {
    for (const resource of RESOURCE_TYPES) {
      const total = totalResourceCounts[resource] ?? 0;
          if (total <= 0) continue;
          const value = owned[resource] ?? 0;
          if (value > bestOwned) {
            leaderPlayerId = candidatePlayerId;
            bestOwned = value;
            bestTotal = total;
            bestResource = resource;
          }
        }
      }
      leaderValue = bestOwned;
      leaderName = leaderPlayerId ? (metricsByPlayerId.get(leaderPlayerId)?.name ?? leaderPlayerId) : "No leader";
      progressLabel = bestResource ? `${bestOwned}/${bestTotal} ${bestResource}` : "No resource leader";
      thresholdLabel = "Need 100% control of one resource type";
      conditionMet = Boolean(leaderPlayerId && bestResource && bestTotal > 0 && bestOwned >= bestTotal);
    } else {
      const totalIslands = Math.max(1, islandTotals.size);
      let bestQualifiedCount = 0;
      let bestWeakestRatio = -1;
      let bestWeakestOwned = 0;
      let bestWeakestTotal = 0;
      for (const [candidatePlayerId, settledByIsland] of settledIslandCountsByPlayerId) {
        let qualifiedCount = 0;
        let weakestRatio = 0;
        let weakestOwned = 0;
        let weakestTotal = 0;
        for (const [islandId, islandTotal] of islandTotals) {
          if (islandTotal <= 0) continue;
          const owned = settledByIsland.get(islandId) ?? 0;
          const ratio = owned / islandTotal;
          if (ratio >= SEASON_VICTORY_CONTINENT_FOOTPRINT_SHARE) {
            qualifiedCount += 1;
            if (weakestTotal === 0 || ratio < weakestRatio) {
              weakestRatio = ratio;
              weakestOwned = owned;
              weakestTotal = islandTotal;
            }
          }
        }
        if (
          qualifiedCount > bestQualifiedCount ||
          (qualifiedCount === bestQualifiedCount && (weakestRatio > bestWeakestRatio || (weakestRatio === bestWeakestRatio && candidatePlayerId < (leaderPlayerId ?? "~"))))
        ) {
          leaderPlayerId = candidatePlayerId;
          bestQualifiedCount = qualifiedCount;
          bestWeakestRatio = weakestRatio;
          bestWeakestOwned = weakestOwned;
          bestWeakestTotal = weakestTotal;
        }
      }
      leaderValue = bestQualifiedCount;
      leaderName = leaderPlayerId ? (metricsByPlayerId.get(leaderPlayerId)?.name ?? leaderPlayerId) : "No leader";
      progressLabel =
        bestQualifiedCount > 0 && bestWeakestTotal > 0
          ? `${bestQualifiedCount}/${totalIslands} islands at 10%+ settled · weakest island ${Math.round(bestWeakestRatio * 100)}% (${bestWeakestOwned}/${bestWeakestTotal})`
          : `${bestQualifiedCount}/${totalIslands} islands at 10%+ settled`;
      thresholdLabel = "Need 10% settled land on every island";
      conditionMet = Boolean(leaderPlayerId && bestQualifiedCount >= totalIslands && totalIslands > 0);
    }
    const tracker = trackers.get(def.id);
    const holdRemainingSeconds =
      !snapshotBootstrap.seasonWinner &&
      conditionMet &&
      tracker?.leaderPlayerId === leaderPlayerId &&
      typeof tracker?.holdStartedAt === "number"
        ? Math.max(0, Math.ceil((tracker.holdStartedAt + def.holdDurationSeconds * 1000 - Date.now()) / 1000))
        : undefined;
    const statusLabel = snapshotBootstrap.seasonWinner
      ? snapshotBootstrap.seasonWinner.objectiveId === def.id
        ? `Winner crowned: ${snapshotBootstrap.seasonWinner.playerName}`
        : "Season already decided"
      : conditionMet
        ? holdRemainingSeconds !== undefined
          ? `Holding · ${Math.max(0, Math.ceil(holdRemainingSeconds / 3600))}h left`
          : "Threshold met"
        : leaderValue > 0
          ? "Pressure building"
          : "No contender";
    const objective: SeasonVictoryObjectiveView = {
      id: def.id,
      name: def.name,
      description: def.description,
      leaderName,
      progressLabel,
      thresholdLabel,
      holdDurationSeconds: def.holdDurationSeconds,
      statusLabel,
      conditionMet
    };
    if (leaderPlayerId) objective.leaderPlayerId = leaderPlayerId;
    if (holdRemainingSeconds !== undefined) objective.holdRemainingSeconds = holdRemainingSeconds;
    const selfProgressLabel = objectiveSelfProgressLabel(
      def.id,
      playerId,
      metricsByPlayerId,
      townTarget,
      settledTarget,
      totalResourceCounts,
      ownedResourceCountsByPlayerId,
      islandTotals,
      settledIslandCountsByPlayerId
    );
    if (selfProgressLabel && objective.leaderPlayerId !== playerId) objective.selfProgressLabel = selfProgressLabel;
    return objective;
  });
};

export const buildGatewayInitPayload = (
  playerIdentity: { playerId: string; playerName: string },
  initialState: PlayerSubscriptionSnapshot | undefined,
  seedProfile: SimulationSeedProfile,
  snapshotBootstrap?: LegacySnapshotBootstrap
): GatewayInitPayload => {
  const seedWorld = createSeedWorld(seedProfile);
  const bootstrapProfile = snapshotBootstrap?.playerProfiles.get(playerIdentity.playerId);
  const liveSnapshotPlayer = initialState?.player;
  const bootstrapPlayer = snapshotBootstrap?.players.get(playerIdentity.playerId);
  const fallbackPlayer = seedWorld.players.get(playerIdentity.playerId) ?? seedWorld.players.get("player-1");
  const player = bootstrapPlayer ?? fallbackPlayer;
  const techIds = liveSnapshotPlayer?.techIds ?? bootstrapProfile?.techIds ?? (player ? [...player.techIds] : []);
  const domainIds: string[] = liveSnapshotPlayer?.domainIds ?? bootstrapProfile?.domainIds ?? [];
  const techChoices = reachableTechChoices(techIds);
  const domainChoices = reachableDomainChoices(techIds, domainIds);
  const liveWorldStatus = initialState?.worldStatus;
  const tileCounts = new Map<string, number>();
  for (const tile of initialState?.tiles ?? []) {
    if (!tile.ownerId) continue;
    tileCounts.set(tile.ownerId, (tileCounts.get(tile.ownerId) ?? 0) + 1);
  }
  const settledCounts = settledCountsFromSnapshot(snapshotBootstrap?.initialState ?? initialState);

  const profileSource = snapshotBootstrap?.playerProfiles
    ? [...snapshotBootstrap.playerProfiles.keys()]
    : [...seedWorld.players.keys()];
  const playerStyles = profileSource.map((playerId) => ({
    id: playerId,
    name: snapshotBootstrap?.playerProfiles.get(playerId)?.name ?? displayNameForSeedPlayer(playerId, playerIdentity.playerName),
    tileColor: hexColorForPlayerId(playerId)
  }));

  const computedOverall = [...(snapshotBootstrap?.players.values() ?? seedWorld.players.values())]
    .map((currentPlayer) => {
      const tiles = settledCounts.get(currentPlayer.id) ?? tileCounts.get(currentPlayer.id) ?? 0;
      const incomePerMinute = snapshotBootstrap?.playerProfiles.get(currentPlayer.id)?.incomePerMinute ?? Math.round(tiles * 0.6 * 10) / 10;
      const techs = snapshotBootstrap?.playerProfiles.get(currentPlayer.id)?.techIds.length ?? currentPlayer.techIds.size;
      const score =
        snapshotBootstrap?.playerProfiles.get(currentPlayer.id)?.points ??
        (typeof currentPlayer.points === "number" ? currentPlayer.points : tiles * 100);
      return {
        id: currentPlayer.id,
        name:
          snapshotBootstrap?.playerProfiles.get(currentPlayer.id)?.name ??
          displayNameForSeedPlayer(currentPlayer.id, playerIdentity.playerName),
        tiles,
        incomePerMinute,
        techs,
        score
      };
    })
    .sort((left, right) => right.score - left.score || right.tiles - left.tiles || left.name.localeCompare(right.name))
    .map((entry, index) => ({ ...entry, rank: index + 1 }));

  const overall = liveWorldStatus?.leaderboard.overall ?? computedOverall;
  const byTiles = liveWorldStatus?.leaderboard.byTiles ?? rankMetric(overall.map((entry) => ({ id: entry.id, name: entry.name, value: entry.tiles })));
  const byIncome = liveWorldStatus?.leaderboard.byIncome ?? rankMetric(overall.map((entry) => ({ id: entry.id, name: entry.name, value: entry.incomePerMinute })));
  const byTechs = liveWorldStatus?.leaderboard.byTechs ?? rankMetric(overall.map((entry) => ({ id: entry.id, name: entry.name, value: entry.techs })));

  const selfOverall = liveWorldStatus?.leaderboard.selfOverall ?? overall.find((entry) => entry.id === playerIdentity.playerId);
  const selfByTiles = liveWorldStatus?.leaderboard.selfByTiles ?? byTiles.find((entry) => entry.id === playerIdentity.playerId);
  const selfByIncome = liveWorldStatus?.leaderboard.selfByIncome ?? byIncome.find((entry) => entry.id === playerIdentity.playerId);
  const selfByTechs = liveWorldStatus?.leaderboard.selfByTechs ?? byTechs.find((entry) => entry.id === playerIdentity.playerId);
  const seasonVictory = liveWorldStatus?.seasonVictory ?? buildSeasonVictoryObjectives(playerIdentity.playerId, snapshotBootstrap, initialState, overall);
  const dockPairs = snapshotBootstrap ? exportDockPairsFromSnapshot(snapshotBootstrap.docks ?? []) : [];
  const homeTile =
    bootstrapProfile?.capitalTile ??
    bootstrapProfile?.spawnOrigin ??
    (initialState ? firstOwnedTile(playerIdentity.playerId, initialState) : undefined);
  const myTileColor = hexColorForPlayerId(playerIdentity.playerId);
  const seasonId = snapshotBootstrap?.season?.seasonId ?? `rewrite-${seedProfile}`;
  const worldSeed = snapshotBootstrap?.season?.worldSeed ?? simulationWorldSeedForProfile(seedProfile);

  const runtimeIdentity = snapshotBootstrap
    ? snapshotBootstrap.runtimeIdentity
    : {
        sourceType: "seed-profile" as const,
        seasonId,
        worldSeed,
        fingerprint: `seed-${seedProfile}-${worldSeed}`,
        seedProfile,
        playerCount: seedWorld.summary.perPlayer.length,
        seededTileCount: seedWorld.tiles.size
      };

  return {
    runtimeIdentity,
    player: {
      id: playerIdentity.playerId,
      name: playerIdentity.playerName,
      gold: liveSnapshotPlayer?.gold ?? bootstrapProfile?.points ?? player?.points ?? 0,
      points: liveSnapshotPlayer?.gold ?? bootstrapProfile?.points ?? player?.points ?? 0,
      level: 1,
      stamina: 0,
      manpower: liveSnapshotPlayer?.manpower ?? bootstrapProfile?.manpower ?? player?.manpower ?? MANPOWER_BASE_CAP,
      manpowerCap: liveSnapshotPlayer?.manpowerCap ?? Math.max(bootstrapProfile?.manpower ?? player?.manpower ?? MANPOWER_BASE_CAP, MANPOWER_BASE_CAP),
      manpowerRegenPerMinute: MANPOWER_BASE_REGEN_PER_MINUTE,
      incomePerMinute: liveSnapshotPlayer?.incomePerMinute ?? bootstrapProfile?.incomePerMinute ?? selfOverall?.incomePerMinute ?? 0,
      strategicResources:
        liveSnapshotPlayer?.strategicResources ??
        bootstrapProfile?.strategicResources ??
        { FOOD: 0, IRON: 0, CRYSTAL: 0, SUPPLY: 0, SHARD: 0, OIL: 0 },
      strategicProductionPerMinute:
        liveSnapshotPlayer?.strategicProductionPerMinute ??
        bootstrapProfile?.strategicProductionPerMinute ??
        { FOOD: 0, IRON: 0, CRYSTAL: 0, SUPPLY: 0, SHARD: 0, OIL: 0 },
      ...(
        liveSnapshotPlayer?.economyBreakdown
          ? { economyBreakdown: liveSnapshotPlayer.economyBreakdown }
          : bootstrapProfile?.economyBreakdown
            ? { economyBreakdown: bootstrapProfile.economyBreakdown }
            : {}
      ),
      upkeepPerMinute:
        liveSnapshotPlayer?.upkeepPerMinute ??
        bootstrapProfile?.upkeepPerMinute ??
        { food: 0, iron: 0, supply: 0, crystal: 0, oil: 0, gold: 0 },
      ...(
        liveSnapshotPlayer?.upkeepLastTick
          ? { upkeepLastTick: liveSnapshotPlayer.upkeepLastTick }
          : bootstrapProfile?.upkeepLastTick
            ? { upkeepLastTick: bootstrapProfile.upkeepLastTick }
            : {}
      ),
      techIds: liveSnapshotPlayer?.techIds ?? techIds,
      domainIds: liveSnapshotPlayer?.domainIds ?? domainIds,
      availableTechPicks: techChoices.length,
      techRootId: "rewrite-local",
      ...(liveSnapshotPlayer?.developmentProcessLimit ? { developmentProcessLimit: liveSnapshotPlayer.developmentProcessLimit } : {}),
      ...(typeof liveSnapshotPlayer?.activeDevelopmentProcessCount === "number"
        ? { activeDevelopmentProcessCount: liveSnapshotPlayer.activeDevelopmentProcessCount }
        : {}),
      ...(liveSnapshotPlayer?.pendingSettlements ? { pendingSettlements: liveSnapshotPlayer.pendingSettlements } : {}),
      ...(homeTile ? { homeTile } : {}),
      tileColor: myTileColor
    },
    config: {
      width: WORLD_WIDTH,
      height: WORLD_HEIGHT,
      season: {
        seasonId: snapshotBootstrap?.season?.seasonId ?? `rewrite-${seedProfile}`,
        worldSeed: snapshotBootstrap?.season?.worldSeed ?? simulationWorldSeedForProfile(seedProfile)
      }
    },
    techChoices,
    techCatalog: techTree.techs.map((tech) => ({
      id: tech.id,
      tier: tech.tier,
      name: tech.name,
      description: tech.description,
      ...(typeof tech.researchTimeSeconds === "number" ? { researchTimeSeconds: tech.researchTimeSeconds } : {}),
      ...(tech.rootId ? { rootId: tech.rootId } : {}),
      ...(tech.requires ? { requires: tech.requires } : {}),
      ...(tech.prereqIds ? { prereqIds: tech.prereqIds } : {}),
      ...(tech.effects ? { effects: tech.effects } : {}),
      mods: tech.mods ?? {},
      requirements: {
        gold: tech.cost?.gold ?? 0,
        resources: toResources(tech.cost),
        canResearch: techChoices.includes(tech.id)
      },
      ...(tech.grantsPowerup ? { grantsPowerup: tech.grantsPowerup } : {})
    })),
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
        canResearch: domainChoices.includes(domain.id)
      }
    })),
    leaderboard: {
      overall,
      ...(selfOverall ? { selfOverall } : {}),
      byTiles,
      ...(selfByTiles ? { selfByTiles } : {}),
      byIncome,
      ...(selfByIncome ? { selfByIncome } : {}),
      byTechs,
      ...(selfByTechs ? { selfByTechs } : {})
    },
    playerStyles,
    missions: [],
    domainIds,
    seasonVictory,
    mapMeta: {
      dockCount: snapshotBootstrap?.docks?.length ?? 0,
      dockPairCount: dockPairs.length,
      clusterCount: snapshotBootstrap?.clusters?.length ?? 0,
      townCount:
        snapshotBootstrap?.initialState.tiles.filter((tile) => tile.town).length ??
        initialState?.tiles.filter((tile) => tile.townType).length ??
        seedWorld.summary.totalTownTiles,
      dockPairs
    }
  };
};

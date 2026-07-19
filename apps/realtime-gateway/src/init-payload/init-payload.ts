import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
  MANPOWER_BASE_CAP,
  MANPOWER_BASE_REGEN_PER_MINUTE,
  anonymizedEmpireNameForId,
  isChosenTrickleResource,
  isOpaquePlayerId,
  type ChosenTrickleResource,
  type PlayerRespawnNotice,
  type SeasonVictoryObjectiveView,
  type SeasonVictoryPathId,
  type SeasonWinnerView,
  type ResourceType,
  type WorldStyle,
  WORLD_HEIGHT,
  WORLD_WIDTH
} from "@border-empires/shared";
import type { LeaderboardMetricEntry, LeaderboardOverallEntry, ManpowerBreakdown, PlayerSubscriptionSnapshot } from "@border-empires/sim-protocol";
import {
  SEASON_VICTORY_DIPLOMATIC_CONTROL_SHARE,
  SEASON_VICTORY_ECONOMY_LEAD_MULT,
  SEASON_VICTORY_ECONOMY_MIN_INCOME,
  SEASON_VICTORY_MARITIME_DOCK_SHARE,
  SEASON_VICTORY_MARITIME_MIN_DOCKS,
  SEASON_VICTORY_RESOURCE_MONOPOLY_SHARE,
  SEASON_VICTORY_TOWN_CONTROL_SHARE,
  VICTORY_PRESSURE_DEFS,
  VICTORY_RESOURCE_TYPES,
  type VictoryPressureDefinition,
  diplomaticDominanceProgressLabel,
  diplomaticDominanceThresholdLabel,
  maritimeSupremacyProgressLabel,
  maritimeSupremacyThresholdLabel,
  resourceMonopolyConditionMet,
  resourceMonopolyLeader,
  resourceMonopolyProgressLabel,
  resourceMonopolyThresholdLabel
} from "@border-empires/game-domain";

import type { LegacySnapshotBootstrap } from "../../../simulation/src/legacy-snapshot-bootstrap/legacy-snapshot-bootstrap.js";
import { createSeedWorld, simulationWorldSeedForProfile, type SimulationSeedProfile } from "../../../simulation/src/seed-state/seed-state.js";

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

type ModKey = "attack" | "defense" | "income" | "vision";
type StatMods = Record<ModKey, number>;
type ModBreakdown = Record<ModKey, Array<{ label: string; mult: number }>>;

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
    manpowerBreakdown?: ManpowerBreakdown;
    incomePerMinute: number;
    strategicResources: Record<"FOOD" | "IRON" | "CRYSTAL" | "SUPPLY" | "SHARD", number>;
    strategicProductionPerMinute: Record<"FOOD" | "IRON" | "CRYSTAL" | "SUPPLY" | "SHARD", number>;
    economyBreakdown?: Record<string, unknown>;
    upkeepPerMinute: { food: number; iron: number; supply: number; crystal: number; gold: number };
    upkeepLastTick?: Record<string, unknown>;
    techIds: string[];
    domainIds: string[];
    chosenTrickleResource?: ChosenTrickleResource;
    mods: StatMods;
    modBreakdown: ModBreakdown;
    availableTechPicks: number;
    techRootId: string;
    homeTile?: { x: number; y: number };
    tileColor?: string;
    canToggleFog?: boolean;
    respawnNotice?: PlayerRespawnNotice;
  };
  config: { width: number; height: number; season: { seasonId: string; worldSeed: number; mapStyle?: WorldStyle } };
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
      resources: Partial<Record<"FOOD" | "IRON" | "CRYSTAL" | "SUPPLY" | "SHARD", number>>;
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
      resources: Partial<Record<"FOOD" | "IRON" | "CRYSTAL" | "SUPPLY" | "SHARD", number>>;
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
  seasonWinner?: SeasonWinnerView;
  mapMeta: {
    dockCount: number;
    dockPairCount: number;
    clusterCount: number;
    townCount: number;
    dockPairs: Array<{ ax: number; ay: number; bx: number; by: number }>;
  };
  shardRainNotice?: Record<string, unknown>;
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
const techEntryById = new Map(techTree.techs.map((tech) => [tech.id, tech] as const));
const domainEntryById = new Map(domainTree.domains.map((domain) => [domain.id, domain] as const));

const coerceChosenTrickleResource = (raw: unknown): ChosenTrickleResource | undefined =>
  isChosenTrickleResource(raw) ? raw : undefined;

const recomputeMods = (techIds: readonly string[], domainIds: readonly string[]): StatMods => {
  const next: StatMods = { attack: 1, defense: 1, income: 1, vision: 1 };
  for (const techId of techIds) {
    const tech = techEntryById.get(techId);
    if (!tech?.mods) continue;
    next.attack *= tech.mods.attack ?? 1;
    next.defense *= tech.mods.defense ?? 1;
    next.income *= tech.mods.income ?? 1;
    next.vision *= tech.mods.vision ?? 1;
  }
  for (const domainId of domainIds) {
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

const addModBreakdownEntry = (breakdown: ModBreakdown, label: string, mods: Partial<StatMods> | undefined): void => {
  if (!mods) return;
  for (const key of ["attack", "defense", "income", "vision"] as const) {
    const mult = mods[key];
    if (typeof mult === "number" && Number.isFinite(mult) && mult !== 1) breakdown[key].push({ label, mult });
  }
};

const buildModBreakdown = (techIds: readonly string[], domainIds: readonly string[]): ModBreakdown => {
  const breakdown = emptyModBreakdown();
  for (const techId of techIds) {
    const tech = techEntryById.get(techId);
    addModBreakdownEntry(breakdown, tech?.name ?? techId, tech?.mods);
  }
  for (const domainId of domainIds) {
    const domain = domainEntryById.get(domainId);
    addModBreakdownEntry(breakdown, domain?.name ?? domainId, domain?.mods);
  }
  return breakdown;
};

// Matches the client's barbarian fallback color (client-map-facade.ts) so a
// hashed per-player hue never overrides the intended dark grey for barbarians.
const BARBARIAN_TILE_COLOR = "#2f3842";

export const hexColorForPlayerId = (playerId: string): string => {
  if (playerId.startsWith("barbarian")) return BARBARIAN_TILE_COLOR;
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

const liveNameNeedsSnapshotRecovery = (playerId: string, name: string | undefined): boolean => {
  if (!name) return true;
  if (name === playerId) return true;
  return isOpaquePlayerId(playerId) && name === anonymizedEmpireNameForId(playerId);
};

const snapshotDisplayNameForPlayer = (
  playerId: string,
  snapshotBootstrap: LegacySnapshotBootstrap | undefined
): string | undefined => {
  const snapshotName = snapshotBootstrap?.playerProfiles.get(playerId)?.name?.trim();
  return snapshotName && snapshotName.length > 0 ? snapshotName : undefined;
};

// Social state keys AI players by "AI N", so recovered names must match even if the live leaderboard reports a seasonal name.
const recoveredEntryName = <T extends { id: string; name: string }>(
  entry: T,
  snapshotBootstrap: LegacySnapshotBootstrap | undefined
): string => {
  if (entry.id.startsWith("ai-")) return `AI ${entry.id.slice(3)}`;
  if (!liveNameNeedsSnapshotRecovery(entry.id, entry.name)) return entry.name;
  return snapshotDisplayNameForPlayer(entry.id, snapshotBootstrap) ?? entry.name;
};

const recoverEntryNameFromSnapshot = <T extends { id: string; name: string }>(
  entries: T[],
  snapshotBootstrap: LegacySnapshotBootstrap | undefined
): T[] => entries.map((entry) => ({ ...entry, name: recoveredEntryName(entry, snapshotBootstrap) }));

const recoverOptionalEntryNameFromSnapshot = <T extends { id: string; name: string }>(
  entry: T | undefined,
  snapshotBootstrap: LegacySnapshotBootstrap | undefined
): T | undefined => (entry ? { ...entry, name: recoveredEntryName(entry, snapshotBootstrap) } : entry);

const recoverSeasonVictoryNamesFromSnapshot = (
  objectives: SeasonVictoryObjectiveView[],
  snapshotBootstrap: LegacySnapshotBootstrap | undefined
): SeasonVictoryObjectiveView[] =>
  objectives.map((objective) => {
    if (!objective.leaderPlayerId || !liveNameNeedsSnapshotRecovery(objective.leaderPlayerId, objective.leaderName)) {
      return objective;
    }
    const snapshotName = snapshotDisplayNameForPlayer(objective.leaderPlayerId, snapshotBootstrap);
    return snapshotName ? { ...objective, leaderName: snapshotName } : objective;
  });

const firstOwnedTile = (playerId: string, snapshot: PlayerSubscriptionSnapshot): { x: number; y: number } | undefined => {
  const townTile = snapshot.tiles.find((tile: PlayerSubscriptionSnapshot["tiles"][number]) => tile.ownerId === playerId && tile.townType);
  if (townTile) return { x: townTile.x, y: townTile.y };
  const ownedTile = snapshot.tiles.find((tile: PlayerSubscriptionSnapshot["tiles"][number]) => tile.ownerId === playerId);
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
): Partial<Record<"FOOD" | "IRON" | "CRYSTAL" | "SUPPLY" | "SHARD", number>> => ({
  ...(typeof cost?.food === "number" && cost.food > 0 ? { FOOD: cost.food } : {}),
  ...(typeof cost?.iron === "number" && cost.iron > 0 ? { IRON: cost.iron } : {}),
  ...(typeof cost?.crystal === "number" && cost.crystal > 0 ? { CRYSTAL: cost.crystal } : {}),
  ...(typeof cost?.supply === "number" && cost.supply > 0 ? { SUPPLY: cost.supply } : {}),
  ...(typeof cost?.shard === "number" && cost.shard > 0 ? { SHARD: cost.shard } : {})
});

const hasResources = (
  required: Partial<Record<"FOOD" | "IRON" | "CRYSTAL" | "SUPPLY" | "SHARD", number>>,
  available: Partial<Record<"FOOD" | "IRON" | "CRYSTAL" | "SUPPLY" | "SHARD", number>>
): boolean =>
  (Object.entries(required) as Array<[keyof typeof available, number]>).every(
    ([resource, amount]) => (available[resource] ?? 0) >= (amount ?? 0)
  );

const reachableTechChoices = (ownedTechIds: string[]): string[] =>
  techTree.techs
    .filter((tech) => {
      if (ownedTechIds.includes(tech.id)) return false;
      const prereqs = tech.prereqIds && tech.prereqIds.length > 0 ? tech.prereqIds : tech.requires ? [tech.requires] : [];
      return prereqs.every((techId) => ownedTechIds.includes(techId));
    })
    .map((tech) => tech.id);

const nextDomainTier = (ownedDomainIds: readonly string[]): number | undefined => {
  const chosenTierMax = domainTree.domains.reduce(
    (maxTier, domain) => (ownedDomainIds.includes(domain.id) ? Math.max(maxTier, domain.tier) : maxTier),
    0
  );
  const targetTier = Math.min(5, chosenTierMax + 1);
  const pickedAtTargetTier = domainTree.domains.some((domain) => domain.tier === targetTier && ownedDomainIds.includes(domain.id));
  return pickedAtTargetTier ? undefined : targetTier;
};

const openDomainChoices = (ownedDomainIds: readonly string[]): string[] => {
  const targetTier = nextDomainTier(ownedDomainIds);
  if (targetTier === undefined) return [];
  return domainTree.domains
    .filter((domain) => domain.tier === targetTier && !ownedDomainIds.includes(domain.id))
    .map((domain) => domain.id);
};

const reachableDomainChoices = (ownedTechIds: readonly string[], ownedDomainIds: readonly string[]): string[] => {
  const targetTier = nextDomainTier(ownedDomainIds);
  if (targetTier === undefined) return [];
  return domainTree.domains
    .filter((domain) => domain.tier === targetTier && !ownedDomainIds.includes(domain.id) && ownedTechIds.includes(domain.requiresTechId))
    .map((domain) => domain.id);
};

const rankMetric = <T extends { id: string; name: string; value: number }>(entries: T[]) =>
  entries
    .slice()
    .sort((left, right) => right.value - left.value || left.name.localeCompare(right.name))
    .map((entry, index) => ({ ...entry, rank: index + 1 }));

const visibleLeaderboardEntries = (
  leaderboard:
    | {
        overall: Array<{ id: string; name: string }>;
        byTiles: Array<{ id: string; name: string }>;
        byIncome: Array<{ id: string; name: string }>;
        byTechs: Array<{ id: string; name: string }>;
        selfOverall?: { id: string; name: string };
        selfByTiles?: { id: string; name: string };
        selfByIncome?: { id: string; name: string };
        selfByTechs?: { id: string; name: string };
      }
    | undefined
): Array<{ id: string; name: string }> => {
  if (!leaderboard) return [];
  const visible = new Map<string, string>();
  for (const entry of leaderboard.overall) visible.set(entry.id, entry.name);
  for (const entry of leaderboard.byTiles) if (!visible.has(entry.id)) visible.set(entry.id, entry.name);
  for (const entry of leaderboard.byIncome) if (!visible.has(entry.id)) visible.set(entry.id, entry.name);
  for (const entry of leaderboard.byTechs) if (!visible.has(entry.id)) visible.set(entry.id, entry.name);
  if (leaderboard.selfOverall && !visible.has(leaderboard.selfOverall.id)) visible.set(leaderboard.selfOverall.id, leaderboard.selfOverall.name);
  if (leaderboard.selfByTiles && !visible.has(leaderboard.selfByTiles.id)) visible.set(leaderboard.selfByTiles.id, leaderboard.selfByTiles.name);
  if (leaderboard.selfByIncome && !visible.has(leaderboard.selfByIncome.id)) visible.set(leaderboard.selfByIncome.id, leaderboard.selfByIncome.name);
  if (leaderboard.selfByTechs && !visible.has(leaderboard.selfByTechs.id)) visible.set(leaderboard.selfByTechs.id, leaderboard.selfByTechs.name);
  return [...visible.entries()].map(([id, name]) => ({ id, name }));
};

const exportDockPairs = (
  docks: ReadonlyArray<{ dockId: string; tileKey: string; pairedDockId?: string; connectedDockIds?: readonly string[] }>
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

type VictoryMetrics = {
  towns: number;
  settledTiles: number;
  controlledTiles: number;
  dockTiles: number;
  incomePerMinute: number;
  name: string;
};

const allianceBlocForPlayer = (
  playerId: string,
  playerAlliesById: ReadonlyMap<string, ReadonlySet<string>>,
  competitivePlayerIds: ReadonlySet<string>
): Set<string> => {
  const bloc = new Set<string>([playerId]);
  const queue = [playerId];
  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const allyId of playerAlliesById.get(current) ?? []) {
      if (!competitivePlayerIds.has(allyId) || bloc.has(allyId)) continue;
      if (!(playerAlliesById.get(allyId)?.has(current) ?? false)) continue;
      bloc.add(allyId);
      queue.push(allyId);
    }
  }
  return bloc;
};

const diplomaticDominanceLeader = (
  metricsByPlayerId: ReadonlyMap<string, VictoryMetrics>,
  playerAlliesById: ReadonlyMap<string, ReadonlySet<string>>,
  competitivePlayerIds: ReadonlySet<string>
): { leaderPlayerId?: string; blocControlledTiles: number; leaderControlledTiles: number; blocMemberCount: number } => {
  let bestLeaderPlayerId: string | undefined;
  let bestBlocControlledTiles = 0;
  let bestLeaderControlledTiles = 0;
  let bestBlocMemberCount = 0;
  const seenBlocKeys = new Set<string>();
  for (const candidatePlayerId of competitivePlayerIds) {
    const bloc = allianceBlocForPlayer(candidatePlayerId, playerAlliesById, competitivePlayerIds);
    const members = [...bloc];
    const blocKey = members.sort().join("|");
    if (seenBlocKeys.has(blocKey)) continue;
    seenBlocKeys.add(blocKey);
    const blocControlledTiles = members.reduce((sum, memberId) => sum + (metricsByPlayerId.get(memberId)?.controlledTiles ?? 0), 0);
    let leaderPlayerId: string | undefined;
    let leaderControlledTiles = -1;
    let tiedLargest = false;
    for (const memberId of members) {
      const controlledTiles = metricsByPlayerId.get(memberId)?.controlledTiles ?? 0;
      if (controlledTiles > leaderControlledTiles) {
        leaderPlayerId = memberId;
        leaderControlledTiles = controlledTiles;
        tiedLargest = false;
      } else if (controlledTiles === leaderControlledTiles) {
        tiedLargest = true;
      }
    }
    if (!leaderPlayerId || tiedLargest) continue;
    if (
      blocControlledTiles > bestBlocControlledTiles ||
      (
        blocControlledTiles === bestBlocControlledTiles &&
        (leaderControlledTiles > bestLeaderControlledTiles || (leaderControlledTiles === bestLeaderControlledTiles && leaderPlayerId < (bestLeaderPlayerId ?? "~")))
      )
    ) {
      bestLeaderPlayerId = leaderPlayerId;
      bestBlocControlledTiles = blocControlledTiles;
      bestLeaderControlledTiles = leaderControlledTiles;
      bestBlocMemberCount = members.length;
    }
  }
  return {
    ...(bestLeaderPlayerId ? { leaderPlayerId: bestLeaderPlayerId } : {}),
    blocControlledTiles: bestBlocControlledTiles,
    leaderControlledTiles: bestLeaderControlledTiles,
    blocMemberCount: bestBlocMemberCount
  };
};

const objectiveSelfProgressLabel = (
  objectiveId: SeasonVictoryPathId,
  playerId: string,
  metricsByPlayerId: Map<string, VictoryMetrics>,
  townTarget: number,
  maritimeDockTarget: number,
  diplomaticControlTarget: number,
  totalResourceCounts: Record<ResourceType, number>,
  ownedResourceCountsByPlayerId: Map<string, Record<ResourceType, number>>,
  playerAlliesById: ReadonlyMap<string, ReadonlySet<string>>,
  competitivePlayerIds: ReadonlySet<string>
): string | undefined => {
  const metric = metricsByPlayerId.get(playerId);
  if (!metric) return undefined;
  if (objectiveId === "TOWN_CONTROL") return `${metric.towns}/${townTarget} towns`;
  if (objectiveId === "ECONOMIC_HEGEMONY") return `${metric.incomePerMinute.toFixed(1)} gold/m`;
  if (objectiveId === "RESOURCE_MONOPOLY") {
    const owned = ownedResourceCountsByPlayerId.get(playerId) ?? { FARM: 0, WOOD: 0, IRON: 0, GEMS: 0, FISH: 0, FUR: 0 };
    let bestResource: ResourceType | undefined;
    let bestOwned = 0;
    let bestTotal = 0;
    for (const resource of VICTORY_RESOURCE_TYPES) {
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
  if (objectiveId === "MARITIME_SUPREMACY") return `${metric.dockTiles}/${maritimeDockTarget} docks`;
  const bloc = allianceBlocForPlayer(playerId, playerAlliesById, competitivePlayerIds);
  const blocControlledTiles = [...bloc].reduce((sum, memberId) => sum + (metricsByPlayerId.get(memberId)?.controlledTiles ?? 0), 0);
  return `${blocControlledTiles}/${diplomaticControlTarget} alliance-controlled land`;
};

const buildSeasonVictoryObjectives = (
  playerId: string,
  snapshotBootstrap: LegacySnapshotBootstrap | undefined,
  initialState: PlayerSubscriptionSnapshot | undefined,
  leaderboardOverall: Array<{ id: string; name: string; tiles: number; incomePerMinute: number; techs: number; score: number; rank: number }>
): SeasonVictoryObjectiveView[] => {
  if (!snapshotBootstrap || !initialState) return [];
  const worldTiles = snapshotBootstrap.initialState.tiles;
  const competitivePlayerIds = new Set(leaderboardOverall.map((entry) => entry.id));
  const playerAlliesById = new Map<string, ReadonlySet<string>>();
  for (const playerId of competitivePlayerIds) {
    const player = snapshotBootstrap.players.get(playerId);
    playerAlliesById.set(playerId, new Set(player?.allies ?? []));
  }
  const townCountByPlayerId = new Map<string, number>();
  const settledCountByPlayerId = new Map<string, number>();
  const controlledCountByPlayerId = new Map<string, number>();
  const dockCountByPlayerId = new Map<string, number>();
  const metricsByPlayerId = new Map<string, VictoryMetrics>();
  const totalResourceCounts: Record<ResourceType, number> = { FARM: 0, WOOD: 0, IRON: 0, GEMS: 0, FISH: 0, FUR: 0 };
  const ownedResourceCountsByPlayerId = new Map<string, Record<ResourceType, number>>();
  for (const tile of worldTiles) {
    if (tile.ownerId && tile.town?.type && competitivePlayerIds.has(tile.ownerId)) {
      townCountByPlayerId.set(tile.ownerId, (townCountByPlayerId.get(tile.ownerId) ?? 0) + 1);
    }
    if (tile.ownerId && competitivePlayerIds.has(tile.ownerId) && (tile.ownershipState === "SETTLED" || tile.ownershipState === "FRONTIER")) {
      controlledCountByPlayerId.set(tile.ownerId, (controlledCountByPlayerId.get(tile.ownerId) ?? 0) + 1);
    }
    if (tile.ownerId && competitivePlayerIds.has(tile.ownerId) && tile.ownershipState === "SETTLED") {
      settledCountByPlayerId.set(tile.ownerId, (settledCountByPlayerId.get(tile.ownerId) ?? 0) + 1);
      if (tile.dockId) dockCountByPlayerId.set(tile.ownerId, (dockCountByPlayerId.get(tile.ownerId) ?? 0) + 1);
    }
    if (tile.resource) {
      const resource = tile.resource as ResourceType;
      totalResourceCounts[resource] = (totalResourceCounts[resource] ?? 0) + 1;
      if (tile.ownerId && competitivePlayerIds.has(tile.ownerId)) {
        const owned = ownedResourceCountsByPlayerId.get(tile.ownerId) ?? { FARM: 0, WOOD: 0, IRON: 0, GEMS: 0, FISH: 0, FUR: 0 };
        owned[resource] = (owned[resource] ?? 0) + 1;
        ownedResourceCountsByPlayerId.set(tile.ownerId, owned);
      }
    }
  }
  for (const entry of leaderboardOverall) {
    metricsByPlayerId.set(entry.id, {
      towns: townCountByPlayerId.get(entry.id) ?? 0,
      settledTiles: settledCountByPlayerId.get(entry.id) ?? 0,
      controlledTiles: controlledCountByPlayerId.get(entry.id) ?? 0,
      dockTiles: dockCountByPlayerId.get(entry.id) ?? 0,
      incomePerMinute: entry.incomePerMinute,
      name: entry.name
    });
  }
  const totalTownCount = Math.max(1, [...snapshotBootstrap.seedTiles.values()].filter((tile) => Boolean(tile.town)).length);
  const townTarget = Math.max(1, Math.ceil(totalTownCount * SEASON_VICTORY_TOWN_CONTROL_SHARE));
  const totalLandTiles = Math.max(1, [...snapshotBootstrap.seedTiles.values()].filter((tile) => tile.terrain === "LAND").length);
  const totalDocks = Math.max(1, worldTiles.filter((tile) => Boolean(tile.dockId)).length);
  const maritimeDockTarget = Math.max(SEASON_VICTORY_MARITIME_MIN_DOCKS, Math.ceil(totalDocks * SEASON_VICTORY_MARITIME_DOCK_SHARE));
  const diplomaticControlTarget = Math.max(1, Math.ceil(totalLandTiles * SEASON_VICTORY_DIPLOMATIC_CONTROL_SHARE));
  const trackers = new Map(snapshotBootstrap.seasonVictory ?? []);
  return VICTORY_PRESSURE_DEFS.map((def: VictoryPressureDefinition) => {
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
      const monopoly = resourceMonopolyLeader(ownedResourceCountsByPlayerId, totalResourceCounts);
      leaderPlayerId = monopoly.leaderPlayerId;
      leaderValue = monopoly.bestOwned;
      leaderName = leaderPlayerId ? (metricsByPlayerId.get(leaderPlayerId)?.name ?? leaderPlayerId) : "No leader";
      progressLabel = resourceMonopolyProgressLabel(monopoly);
      thresholdLabel = resourceMonopolyThresholdLabel(SEASON_VICTORY_RESOURCE_MONOPOLY_SHARE);
      conditionMet = resourceMonopolyConditionMet(monopoly, SEASON_VICTORY_RESOURCE_MONOPOLY_SHARE);
    } else if (def.id === "MARITIME_SUPREMACY") {
      const ranked = [...metricsByPlayerId.entries()].sort((a, b) => (b[1].dockTiles - a[1].dockTiles) || a[0].localeCompare(b[0]));
      leaderPlayerId = ranked[0]?.[0];
      leaderValue = ranked[0]?.[1].dockTiles ?? 0;
      leaderName = ranked[0]?.[1].name ?? "No leader";
      progressLabel = maritimeSupremacyProgressLabel(leaderValue, maritimeDockTarget);
      thresholdLabel = maritimeSupremacyThresholdLabel(SEASON_VICTORY_MARITIME_DOCK_SHARE, maritimeDockTarget);
      conditionMet = Boolean(leaderPlayerId && leaderValue >= maritimeDockTarget);
    } else {
      const diplomatic = diplomaticDominanceLeader(metricsByPlayerId, playerAlliesById, competitivePlayerIds);
      leaderPlayerId = diplomatic.leaderPlayerId;
      leaderValue = diplomatic.blocControlledTiles;
      leaderName = leaderPlayerId ? (metricsByPlayerId.get(leaderPlayerId)?.name ?? leaderPlayerId) : "No leader";
      progressLabel = diplomaticDominanceProgressLabel({
        blocControlledTiles: diplomatic.blocControlledTiles,
        targetTiles: diplomaticControlTarget,
        leaderControlledTiles: diplomatic.leaderControlledTiles,
        blocMemberCount: diplomatic.blocMemberCount
      });
      thresholdLabel = diplomaticDominanceThresholdLabel(SEASON_VICTORY_DIPLOMATIC_CONTROL_SHARE, diplomaticControlTarget);
      conditionMet = Boolean(leaderPlayerId && diplomatic.blocControlledTiles >= diplomaticControlTarget);
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
      maritimeDockTarget,
      diplomaticControlTarget,
      totalResourceCounts,
      ownedResourceCountsByPlayerId,
      playerAlliesById,
      competitivePlayerIds
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
  const domainChoices = openDomainChoices(domainIds);
  const reachableDomainChoiceSet = new Set(reachableDomainChoices(techIds, domainIds));
  const liveWorldStatus = initialState?.worldStatus;
  const tileCounts = new Map<string, number>();
  for (const tile of initialState?.tiles ?? []) {
    if (!tile.ownerId) continue;
    tileCounts.set(tile.ownerId, (tileCounts.get(tile.ownerId) ?? 0) + 1);
  }
  const settledCounts = settledCountsFromSnapshot(snapshotBootstrap?.initialState ?? initialState);

  const liveVisibleEntries = visibleLeaderboardEntries(liveWorldStatus?.leaderboard);
  const profileSource = new Set<string>(
    snapshotBootstrap?.playerProfiles ? [...snapshotBootstrap.playerProfiles.keys()] : [...seedWorld.players.keys()]
  );
  for (const entry of liveVisibleEntries) profileSource.add(entry.id);
  const liveVisibleNameByPlayerId = new Map(liveVisibleEntries.map((entry) => [entry.id, entry.name] as const));
  const playerStyles = [...profileSource].map((playerId) => ({
    id: playerId,
    name:
      snapshotBootstrap?.playerProfiles.get(playerId)?.name ??
      liveVisibleNameByPlayerId.get(playerId) ??
      (playerId.startsWith("ai-") ? `AI ${playerId.slice(3)}` : displayNameForSeedPlayer(playerId, playerIdentity.playerName)),
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

  const overall: LeaderboardOverallEntry[] = recoverEntryNameFromSnapshot(
    liveWorldStatus?.leaderboard.overall ?? computedOverall,
    snapshotBootstrap
  );
  const byTiles: LeaderboardMetricEntry[] = recoverEntryNameFromSnapshot(
    liveWorldStatus?.leaderboard.byTiles ?? rankMetric(overall.map((entry) => ({ id: entry.id, name: entry.name, value: entry.tiles }))),
    snapshotBootstrap
  );
  const byIncome: LeaderboardMetricEntry[] = recoverEntryNameFromSnapshot(
    liveWorldStatus?.leaderboard.byIncome ?? rankMetric(overall.map((entry) => ({ id: entry.id, name: entry.name, value: entry.incomePerMinute }))),
    snapshotBootstrap
  );
  const byTechs: LeaderboardMetricEntry[] = recoverEntryNameFromSnapshot(
    liveWorldStatus?.leaderboard.byTechs ?? rankMetric(overall.map((entry) => ({ id: entry.id, name: entry.name, value: entry.techs }))),
    snapshotBootstrap
  );

  const selfOverall: LeaderboardOverallEntry | undefined = recoverOptionalEntryNameFromSnapshot(
    liveWorldStatus?.leaderboard.selfOverall ?? overall.find((entry) => entry.id === playerIdentity.playerId),
    snapshotBootstrap
  );
  const selfByTiles: LeaderboardMetricEntry | undefined = recoverOptionalEntryNameFromSnapshot(
    liveWorldStatus?.leaderboard.selfByTiles ?? byTiles.find((entry) => entry.id === playerIdentity.playerId),
    snapshotBootstrap
  );
  const selfByIncome: LeaderboardMetricEntry | undefined = recoverOptionalEntryNameFromSnapshot(
    liveWorldStatus?.leaderboard.selfByIncome ?? byIncome.find((entry) => entry.id === playerIdentity.playerId),
    snapshotBootstrap
  );
  const selfByTechs: LeaderboardMetricEntry | undefined = recoverOptionalEntryNameFromSnapshot(
    liveWorldStatus?.leaderboard.selfByTechs ?? byTechs.find((entry) => entry.id === playerIdentity.playerId),
    snapshotBootstrap
  );
  const seasonVictory = recoverSeasonVictoryNamesFromSnapshot(
    liveWorldStatus?.seasonVictory ?? buildSeasonVictoryObjectives(playerIdentity.playerId, snapshotBootstrap, initialState, overall),
    snapshotBootstrap
  );
  const rewriteDocks = initialState?.docks ?? [];
  const dockPairs = snapshotBootstrap ? exportDockPairs(snapshotBootstrap.docks ?? []) : exportDockPairs(rewriteDocks);
  const dockCount = snapshotBootstrap?.docks?.length ?? rewriteDocks.length;
  const homeTile =
    bootstrapProfile?.capitalTile ??
    bootstrapProfile?.spawnOrigin ??
    (initialState ? firstOwnedTile(playerIdentity.playerId, initialState) : undefined);
  const myTileColor = hexColorForPlayerId(playerIdentity.playerId);
  const rewriteSeason = initialState?.season;
  const seasonId = snapshotBootstrap?.season?.seasonId ?? rewriteSeason?.seasonId ?? `rewrite-${seedProfile}`;
  const worldSeedCandidate = snapshotBootstrap?.season?.worldSeed ?? rewriteSeason?.worldSeed;
  const worldSeed = typeof worldSeedCandidate === "number" && worldSeedCandidate !== 0 ? worldSeedCandidate : simulationWorldSeedForProfile(seedProfile);
  // Client independently calls setWorldSeed(seed, style) to render its local
  // minimap/backdrop terrain — it must match the season's actual generated
  // shape or the client-rendered map desyncs from the real (server-authoritative)
  // island/continent terrain. Legacy snapshots never had a mapStyle field.
  const mapStyle = rewriteSeason?.mapStyle;

  const runtimeIdentity = snapshotBootstrap
    ? snapshotBootstrap.runtimeIdentity
    : {
        sourceType: "seed-profile" as const,
        seasonId,
        worldSeed,
        fingerprint: rewriteSeason ? `${rewriteSeason.rulesetId}-${seasonId}-${worldSeed}` : `seed-${seedProfile}-${worldSeed}`,
        seedProfile,
        playerCount: seedWorld.summary.perPlayer.length,
        seededTileCount: seedWorld.tiles.size
      };

  const availableGold = liveSnapshotPlayer?.gold ?? bootstrapProfile?.points ?? player?.points ?? 0;
  const availableStrategic =
    liveSnapshotPlayer?.strategicResources ??
    bootstrapProfile?.strategicResources ??
    { FOOD: 0, IRON: 0, CRYSTAL: 0, SUPPLY: 0, SHARD: 0 };

  const seasonWinner: SeasonWinnerView | undefined =
    initialState?.season?.winner ?? snapshotBootstrap?.seasonWinner;

  return {
    runtimeIdentity,
    player: {
      id: playerIdentity.playerId,
      name: playerIdentity.playerName,
      gold: availableGold,
      points: availableGold,
      level: 1,
      stamina: 0,
      manpower: liveSnapshotPlayer?.manpower ?? bootstrapProfile?.manpower ?? player?.manpower ?? MANPOWER_BASE_CAP,
      manpowerCap: liveSnapshotPlayer?.manpowerCap ?? Math.max(bootstrapProfile?.manpower ?? player?.manpower ?? MANPOWER_BASE_CAP, MANPOWER_BASE_CAP),
      manpowerRegenPerMinute: liveSnapshotPlayer?.manpowerRegenPerMinute ?? MANPOWER_BASE_REGEN_PER_MINUTE,
      manpowerBreakdown: liveSnapshotPlayer?.manpowerBreakdown ?? {
        cap: [{ label: "Base minimum", amount: MANPOWER_BASE_CAP }],
        regen: [{ label: "Base minimum", amount: MANPOWER_BASE_REGEN_PER_MINUTE }]
      },
      incomePerMinute: liveSnapshotPlayer?.incomePerMinute ?? bootstrapProfile?.incomePerMinute ?? selfOverall?.incomePerMinute ?? 0,
      strategicResources: availableStrategic,
      strategicProductionPerMinute:
        liveSnapshotPlayer?.strategicProductionPerMinute ??
        bootstrapProfile?.strategicProductionPerMinute ??
        { FOOD: 0, IRON: 0, CRYSTAL: 0, SUPPLY: 0, SHARD: 0 },
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
        { food: 0, iron: 0, supply: 0, crystal: 0, gold: 0 },
      ...(
        liveSnapshotPlayer?.upkeepLastTick
          ? { upkeepLastTick: liveSnapshotPlayer.upkeepLastTick }
          : bootstrapProfile?.upkeepLastTick
            ? { upkeepLastTick: bootstrapProfile.upkeepLastTick }
            : {}
      ),
      techIds: liveSnapshotPlayer?.techIds ?? techIds,
      domainIds: liveSnapshotPlayer?.domainIds ?? domainIds,
      ...((): { chosenTrickleResource?: ChosenTrickleResource } => {
        const chosenTrickleResource =
          coerceChosenTrickleResource((liveSnapshotPlayer as { chosenTrickleResource?: unknown } | undefined)?.chosenTrickleResource) ??
          coerceChosenTrickleResource((bootstrapProfile as { chosenTrickleResource?: unknown } | undefined)?.chosenTrickleResource);
        return chosenTrickleResource ? { chosenTrickleResource } : {};
      })(),
      mods: liveSnapshotPlayer?.mods ?? recomputeMods(liveSnapshotPlayer?.techIds ?? techIds, liveSnapshotPlayer?.domainIds ?? domainIds),
      modBreakdown: liveSnapshotPlayer?.modBreakdown ?? buildModBreakdown(liveSnapshotPlayer?.techIds ?? techIds, liveSnapshotPlayer?.domainIds ?? domainIds),
      availableTechPicks: techChoices.length,
      techRootId: "rewrite-local",
      ...(initialState?.respawnNotice ? { respawnNotice: initialState.respawnNotice } : {}),
      ...(liveSnapshotPlayer?.developmentProcessLimit ? { developmentProcessLimit: liveSnapshotPlayer.developmentProcessLimit } : {}),
      ...(typeof liveSnapshotPlayer?.activeDevelopmentProcessCount === "number"
        ? { activeDevelopmentProcessCount: liveSnapshotPlayer.activeDevelopmentProcessCount }
        : {}),
      ...(liveSnapshotPlayer?.pendingSettlements ? { pendingSettlements: liveSnapshotPlayer.pendingSettlements } : {}),
      ...(liveSnapshotPlayer?.autoSettlementQueue ? { autoSettlementQueue: liveSnapshotPlayer.autoSettlementQueue } : {}),
      ...(homeTile ? { homeTile } : {}),
      tileColor: myTileColor
    },
    config: {
      width: WORLD_WIDTH,
      height: WORLD_HEIGHT,
      season: {
        seasonId,
        worldSeed,
        ...(mapStyle ? { mapStyle } : {})
      }
    },
    techChoices,
    techCatalog: techTree.techs.map((tech) => {
      const resources = toResources(tech.cost);
      return {
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
          resources,
          canResearch:
            techChoices.includes(tech.id) &&
            availableGold >= (tech.cost?.gold ?? 0) &&
            hasResources(resources, availableStrategic)
        },
        ...(tech.grantsPowerup ? { grantsPowerup: tech.grantsPowerup } : {})
      };
    }),
    domainChoices,
    domainCatalog: domainTree.domains.map((domain) => {
      const resources = toResources(domain.cost);
      return {
        id: domain.id,
        tier: domain.tier,
        name: domain.name,
        description: domain.description,
        requiresTechId: domain.requiresTechId,
        ...(domain.effects ? { effects: domain.effects } : {}),
        mods: domain.mods ?? {},
        requirements: {
          gold: domain.cost?.gold ?? 0,
          resources,
          canResearch:
            reachableDomainChoiceSet.has(domain.id) &&
            availableGold >= (domain.cost?.gold ?? 0) &&
            hasResources(resources, availableStrategic)
        }
      };
    }),
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
    // Surface the crowned winner on INIT so the season-end screen can show on a
    // fresh post-season login (otherwise it only arrives via GLOBAL_STATUS_UPDATE,
    // which does not fire for a player joining after the season has ended).
    ...(seasonWinner ? { seasonWinner } : {}),
    mapMeta: {
      dockCount,
      dockPairCount: dockPairs.length,
      clusterCount: snapshotBootstrap?.clusters?.length ?? 0,
      townCount:
        snapshotBootstrap?.initialState.tiles.filter((tile: { town?: unknown }) => tile.town).length ??
        initialState?.tiles.filter((tile: PlayerSubscriptionSnapshot["tiles"][number]) => tile.townType).length ??
        seedWorld.summary.totalTownTiles,
      dockPairs
    },
    ...(liveWorldStatus?.shardRainNotice ? { shardRainNotice: liveWorldStatus.shardRainNotice } : {})
  };
};

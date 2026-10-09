import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { exportDockPairs, type DockPairView } from "./dock-pair-export.js";
import { buildSeasonVictoryObjectives } from "./init-payload-season-victory.js";
import { buildInitDomainCatalog, buildInitTechCatalog, type InitDomainCatalogEntry, type InitTechCatalogEntry } from "./init-payload-catalogs.js";
import {
  MANPOWER_BASE_CAP,
  MANPOWER_BASE_REGEN_PER_MINUTE,
  anonymizedEmpireNameForId,
  isChosenTrickleResource,
  isOpaquePlayerId,
  type ChosenTrickleResource,
  type PlayerRespawnNotice,
  type SeasonVictoryObjectiveView,
  type SeasonWinnerView,
  type WorldStyle,
  WORLD_HEIGHT,
  WORLD_WIDTH, PLANETARY_DEFENSE_DISPLAY_NAME
} from "@border-empires/shared";
import { reconnectPassthroughFields, type LeaderboardMetricEntry, type LeaderboardOverallEntry, type ManpowerBreakdown, type PlayerSubscriptionSnapshot, type ReconnectPassthroughFields } from "@border-empires/sim-protocol";
import type { LegacySnapshotBootstrap } from "../../../simulation/src/legacy-snapshot-bootstrap/legacy-snapshot-bootstrap.js";
import { createSeedWorld, simulationWorldSeedForProfile, type SimulationSeedProfile } from "../../../simulation/src/seed-state/seed-state.js";
import type { TechCatalogEntry, DomainCatalogEntry } from "../../../simulation/src/tech-domain-bridge/tech-domain-bridge.js";

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
    strategicResources: Record<"FOOD" | "TITANIUM" | "CRYSTAL" | "UMBRITE" | "SHARD", number>;
    strategicProductionPerMinute: Record<"FOOD" | "TITANIUM" | "CRYSTAL" | "UMBRITE" | "SHARD", number>;
    resourceSlots: {
      supply: Record<"FOOD" | "TITANIUM" | "CRYSTAL" | "UMBRITE", number>;
      demand: Record<"FOOD" | "TITANIUM" | "CRYSTAL" | "UMBRITE", number>;
    };
    dormantStructures: Array<{ key: string; resources: Array<"FOOD" | "TITANIUM" | "CRYSTAL" | "UMBRITE"> }>;
    economyBreakdown?: Record<string, unknown>;
    upkeepPerMinute: { food: number; titanium: number; umbrite: number; crystal: number; gold: number };
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
  } & ReconnectPassthroughFields;
  config: { width: number; height: number; season: { seasonId: string; worldSeed: number; mapStyle?: WorldStyle; worldgenVersion?: number } };
  techChoices: string[];
  techCatalog: InitTechCatalogEntry[];
  domainChoices: string[];
  domainCatalog: InitDomainCatalogEntry[];
  leaderboard: {
    overall: Array<{ id: string; name: string; tiles: number; incomePerMinute: number; techs: number; manpowerCap: number; score: number; rank: number }>;
    selfOverall?: { id: string; name: string; tiles: number; incomePerMinute: number; techs: number; manpowerCap: number; score: number; rank: number };
    byTiles: Array<{ id: string; name: string; value: number; rank: number }>;
    selfByTiles?: { id: string; name: string; value: number; rank: number };
    byIncome: Array<{ id: string; name: string; value: number; rank: number }>;
    selfByIncome?: { id: string; name: string; value: number; rank: number };
    byTechs: Array<{ id: string; name: string; value: number; rank: number }>;
    selfByTechs?: { id: string; name: string; value: number; rank: number };
  };
  playerStyles: Array<{ id: string; name: string; tileColor: string; duke?: boolean }>;
  missions: [];
  domainIds: string[];
  seasonVictory: SeasonVictoryObjectiveView[];
  seasonWinner?: SeasonWinnerView;
  mapMeta: {
    dockCount: number;
    dockPairCount: number;
    clusterCount: number;
    townCount: number;
    dockPairs: DockPairView[];
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
const revealCategoryForTech = (techId: string): string | undefined => {
  const category = techEntryById.get(techId)?.effects?.revealResource;
  return typeof category === "string" ? category : undefined;
};

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
  if (playerId === "barbarian-1") return PLANETARY_DEFENSE_DISPLAY_NAME;
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

const reachableTechChoices = (ownedTechIds: string[]): string[] =>
  techTree.techs
    .filter((tech) => {
      if (ownedTechIds.includes(tech.id)) return false;
      const prereqs = tech.prereqIds ?? [];
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

export const buildGatewayInitPayload = (
  playerIdentity: { playerId: string; playerName: string },
  initialState: PlayerSubscriptionSnapshot | undefined,
  seedProfile: SimulationSeedProfile,
  snapshotBootstrap?: LegacySnapshotBootstrap,
  dukeAuthUids?: ReadonlySet<string> // Duke title: authUids resolved via resolveDukeAuthUids (galaxy-holdings.ts); playerId IS the authUid here.
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
      (playerId.startsWith("ai-") ? `AI ${playerId.slice(3)}` : (liveVisibleNameByPlayerId.get(playerId) ?? displayNameForSeedPlayer(playerId, playerIdentity.playerName))),
    tileColor: hexColorForPlayerId(playerId),
    ...(dukeAuthUids?.has(playerId) ? { duke: true } : {})
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
        techs, manpowerCap: Math.max(currentPlayer.manpowerCapSnapshot ?? 0, MANPOWER_BASE_CAP),
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
    liveWorldStatus?.seasonVictory ?? buildSeasonVictoryObjectives(playerIdentity.playerId, snapshotBootstrap, initialState, overall, revealCategoryForTech),
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
  const mapStyle = rewriteSeason?.mapStyle; const worldgenVersion = rewriteSeason?.worldgenVersion;

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
    { FOOD: 0, TITANIUM: 0, CRYSTAL: 0, UMBRITE: 0, SHARD: 0 };

  const seasonWinner: SeasonWinnerView | undefined =
    initialState?.season?.winner ?? snapshotBootstrap?.seasonWinner;

  // See packages/sim-protocol's reconnect-passthrough-fields.ts (single
  // exhaustive source of truth). economyBreakdown/upkeepLastTick are pulled
  // out separately -- unlike the rest, they also fall back to bootstrapProfile.
  const { economyBreakdown: passthroughEconomyBreakdown, upkeepLastTick: passthroughUpkeepLastTick, ...passthrough } = reconnectPassthroughFields(liveSnapshotPlayer);

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
        { FOOD: 0, TITANIUM: 0, CRYSTAL: 0, UMBRITE: 0, SHARD: 0 },
      // Legacy season-bootstrap profiles predate the slots pillar (§5) and
      // never carry resourceSlots -- only the live snapshot path does.
      resourceSlots:
        liveSnapshotPlayer?.resourceSlots ?? {
          supply: { FOOD: 0, TITANIUM: 0, CRYSTAL: 0, UMBRITE: 0 },
          demand: { FOOD: 0, TITANIUM: 0, CRYSTAL: 0, UMBRITE: 0 }
        },
      // Same legacy-bootstrap caveat as resourceSlots above.
      dormantStructures: liveSnapshotPlayer?.dormantStructures ?? [],
      ...(
        passthroughEconomyBreakdown
          ? { economyBreakdown: passthroughEconomyBreakdown }
          : bootstrapProfile?.economyBreakdown
            ? { economyBreakdown: bootstrapProfile.economyBreakdown }
            : {}
      ),
      upkeepPerMinute:
        liveSnapshotPlayer?.upkeepPerMinute ??
        bootstrapProfile?.upkeepPerMinute ??
        { food: 0, titanium: 0, umbrite: 0, crystal: 0, gold: 0 },
      ...(
        passthroughUpkeepLastTick
          ? { upkeepLastTick: passthroughUpkeepLastTick }
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
      ...passthrough,
      ...(homeTile ? { homeTile } : {}),
      tileColor: myTileColor
    },
    config: {
      width: WORLD_WIDTH,
      height: WORLD_HEIGHT,
      season: {
        seasonId,
        worldSeed,
        ...(mapStyle ? { mapStyle } : {}), ...(typeof worldgenVersion === "number" ? { worldgenVersion } : {})
      }
    },
    techChoices,
    techCatalog: buildInitTechCatalog(techTree.techs, { researchedCount: techIds.length, techChoices, availableGold, availableStrategic }),
    domainChoices,
    domainCatalog: buildInitDomainCatalog(domainTree.domains, { reachableDomainChoiceSet, availableGold, availableStrategic }),
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

import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import websocket from "@fastify/websocket";
import {
  BARBARIAN_ACTION_INTERVAL_MS,
  BARBARIAN_ATTACK_POWER,
  BARBARIAN_CLEAR_GOLD_REWARD,
  BARBARIAN_DEFENSE_POWER,
  BARBARIAN_MULTIPLY_THRESHOLD,
  CHUNK_SIZE,
  CLUSTER_COUNT_MAX,
  CLUSTER_COUNT_MIN,
  ClientMessageSchema,
  COMBAT_LOCK_MS,
  DEVELOPMENT_PROCESS_LIMIT,
  ECONOMIC_STRUCTURE_BUILD_MS,
  FRONTIER_CLAIM_MS,
  DOCK_CROSSING_COOLDOWN_MS,
  DOCK_DEFENSE_MULT,
  DOCK_PAIRS_MAX,
  DOCK_PAIRS_MIN,
  FORT_BUILD_COST,
  FORT_BUILD_MS,
  FORT_DEFENSE_MULT,
  FORT_MAX_PER_PLAYER,
  OBSERVATORY_BUILD_MS,
  SIEGE_OUTPOST_ATTACK_MULT,
  SIEGE_OUTPOST_BUILD_COST,
  SIEGE_OUTPOST_BUILD_MS,
  SIEGE_OUTPOST_MAX_PER_PLAYER,
  PVP_REPEAT_FLOOR,
  PVP_REPEAT_WINDOW_MS,
  SEASON_LENGTH_DAYS,
  SETTLE_COST,
  SETTLE_MS,
  STAMINA_MAX,
  VISION_RADIUS,
  WORLD_HEIGHT,
  WORLD_WIDTH,
  INITIAL_BARBARIAN_COUNT,
  combatWinChance,
  defensivenessMultiplier,
  levelFromPoints,
  landBiomeAt,
  grassShadeAt,
  pvpPointsReward,
  randomFactor,
  ratingFromPointsLevel,
  resourceAt,
  setWorldSeed,
  continentIdAt,
  exposureWeightFromSides,
  terrainAt,
  wrapX,
  wrapY,
  type Player,
  type MissionKind,
  type MissionState,
  type MissionStats,
  type ClusterType,
  type OwnershipState,
  type PopulationTier,
  type ResourceType,
  type Season,
  type SeasonVictoryObjectiveView,
  type SeasonWinnerView,
  type SeasonVictoryPathId,
  type Tile,
  type TileKey,
  type Fort,
  type SiegeOutpost,
  type Dock,
  type BarbarianAgent,
  type EconomicStructure,
  type EconomicStructureType,
  type ClientMessage,
} from "@border-empires/shared";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { z } from "zod";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { loadTechTree, type StatsModKey } from "./tech-tree.js";
import { loadDomainTree } from "./domain-tree.js";
import { planBestGoal, rankSeasonVictoryPaths, goalsForVictoryPath, AI_EMPIRE_ACTIONS, type AiEmpireGoapState, type AiSeasonVictoryPathId } from "./ai/goap.js";

const PORT = Number(process.env.PORT ?? 3001);
const DISABLE_FOG = process.env.DISABLE_FOG === "1";
const AI_PLAYERS = Number(process.env.AI_PLAYERS ?? 40);
const AI_TICK_MS = Number(process.env.AI_TICK_MS ?? 3_000);
const AI_TICK_BATCH_SIZE = Math.max(1, Number(process.env.AI_TICK_BATCH_SIZE ?? 1));
const MAX_SUBSCRIBE_RADIUS = Number(process.env.MAX_SUBSCRIBE_RADIUS ?? 2);
const FOG_ADMIN_EMAIL = "bw199005@gmail.com";
const SNAPSHOT_DIR = path.resolve(process.env.SNAPSHOT_DIR ?? path.join(process.cwd(), "snapshots"));
const SNAPSHOT_FILE = path.join(SNAPSHOT_DIR, "state.json");
const snapshotTempFile = (): string => path.join(SNAPSHOT_DIR, `state.${process.pid}.tmp`);

let appRef: FastifyInstance | undefined;
const logRuntimeError = (message: string, err: unknown): void => {
  if (appRef) {
    appRef.log.error({ err }, message);
    return;
  }
  console.error(message, err);
};

type Ws = import("ws").WebSocket;
const NOOP_WS = { send: () => undefined, readyState: 1, OPEN: 1 } as unknown as Ws;

interface AuthIdentity {
  uid: string;
  playerId: string;
  name: string;
  email?: string | undefined;
}

const FIREBASE_PROJECT_ID = process.env.FIREBASE_PROJECT_ID ?? "border-empires";
const FIREBASE_TOKEN_CACHE_TTL_MS = 55 * 60 * 1000;
const firebaseJwks = createRemoteJWKSet(
  new URL("https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com"),
  {
    timeoutDuration: 15_000,
    cooldownDuration: 60_000,
    cacheMaxAge: 12 * 60 * 60 * 1000
  }
);
const verifiedFirebaseTokenCache = new Map<string, { decoded: { uid: string; email?: string | undefined; name?: string | undefined }; expiresAt: number }>();
const classifyAuthError = (err: unknown): { code: "AUTH_FAIL" | "AUTH_UNAVAILABLE"; message: string } => {
  const text = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
  if (
    text.includes("JWKSTimeout") ||
    text.includes("ERR_JWKS_TIMEOUT") ||
    text.includes("fetch failed") ||
    text.includes("ECONNREFUSED") ||
    text.includes("ECONNRESET") ||
    text.includes("ENOTFOUND") ||
    text.includes("ETIMEDOUT") ||
    text.includes("timed out") ||
    text.includes("network")
  ) {
    return { code: "AUTH_UNAVAILABLE", message: "Authentication service temporarily unavailable." };
  }
  return { code: "AUTH_FAIL", message: "Firebase token verification failed." };
};

const cachedFirebaseIdentityForToken = (token: string): { uid: string; email?: string | undefined; name?: string | undefined } | undefined => {
  const cached = verifiedFirebaseTokenCache.get(token);
  if (!cached) return undefined;
  if (cached.expiresAt <= now()) {
    verifiedFirebaseTokenCache.delete(token);
    return undefined;
  }
  return cached.decoded;
};

const cacheVerifiedFirebaseIdentity = (
  token: string,
  decoded: { uid: string; email?: string | undefined; name?: string | undefined },
  exp?: number
): void => {
  const expiresAt =
    typeof exp === "number" && Number.isFinite(exp)
      ? Math.max(now() + 60_000, exp * 1000)
      : now() + FIREBASE_TOKEN_CACHE_TTL_MS;
  verifiedFirebaseTokenCache.set(token, { decoded, expiresAt });
};

const GLOBAL_STATUS_CACHE_TTL_MS = 1_000;
const GLOBAL_STATUS_BROADCAST_MS = 2_000;

interface AllianceRequest {
  id: string;
  fromPlayerId: string;
  toPlayerId: string;
  createdAt: number;
  expiresAt: number;
  fromName?: string;
  toName?: string;
}

type VictoryPressureTracker = {
  leaderPlayerId?: string;
  holdStartedAt?: number;
};

type LeaderboardOverallEntry = {
  id: string;
  name: string;
  tiles: number;
  incomePerMinute: number;
  techs: number;
  score: number;
};

type LeaderboardMetricEntry = {
  id: string;
  name: string;
  value: number;
};

type LeaderboardSnapshotView = {
  overall: LeaderboardOverallEntry[];
  byTiles: LeaderboardMetricEntry[];
  byIncome: LeaderboardMetricEntry[];
  byTechs: LeaderboardMetricEntry[];
};

type PlayerCompetitionMetrics = {
  playerId: string;
  name: string;
  tiles: number;
  settledTiles: number;
  incomePerMinute: number;
  techs: number;
  controlledTowns: number;
};

type VictoryPressureDefinition = {
  id: SeasonVictoryPathId;
  name: string;
  description: string;
  holdDurationSeconds: number;
};

interface MissionDef {
  id: string;
  kind: MissionKind;
  name: string;
  description: string;
  unlockPoints: number;
  prerequisiteId?: string;
  target: number;
  rewardPoints: number;
  rewardLabel?: string;
}

interface SeasonArchiveEntry {
  seasonId: string;
  endedAt: number;
  mostTerritory: Array<{ playerId: string; name: string; value: number }>;
  mostPoints: Array<{ playerId: string; name: string; value: number }>;
  longestSurvivalMs: Array<{ playerId: string; name: string; value: number }>;
  winner?: SeasonWinnerView;
}

interface SnapshotState {
  world: { width: number; height: number };
  players: Array<
    Omit<Player, "techIds" | "domainIds" | "territoryTiles" | "allies"> & {
      techIds: string[];
      domainIds?: string[];
      territoryTiles: TileKey[];
      allies: string[];
      missions?: MissionState[];
      missionStats?: MissionStats;
    }
  >;
  ownership: [TileKey, string][];
  ownershipState?: [TileKey, OwnershipState][];
  barbarianAgents?: BarbarianAgent[];
  authIdentities?: AuthIdentity[];
  resources: [string, Record<ResourceType, number>][];
  strategicResources?: [string, Record<StrategicResource, number>][];
  strategicResourceBuffer?: [string, Record<StrategicResource, number>][];
  tileYield?: [TileKey, TileYieldBuffer][];
  tileHistory?: [TileKey, TileHistoryState][];
  terrainShapes?: [TileKey, TerrainShapeState][];
  seasonVictory?: [SeasonVictoryPathId, VictoryPressureTracker][];
  frontierSettlements?: [string, number[]][];
  dynamicMissions?: [string, DynamicMissionDef[]][];
  temporaryAttackBuffUntil?: [string, number][];
  temporaryIncomeBuff?: [string, { until: number; resources: [ResourceType, ResourceType] }][];
  forcedReveal?: [string, TileKey[]][];
  revealedEmpireTargets?: [string, string[]][];
  allianceRequests?: AllianceRequest[];
  forts?: Fort[];
  observatories?: Observatory[];
  siegeOutposts?: SiegeOutpost[];
  economicStructures?: EconomicStructure[];
  sabotage?: ActiveSabotage[];
  abilityCooldowns?: [string, [AbilityDefinition["id"], number][]][];
  docks?: Dock[];
  towns?: TownDefinition[];
  firstSpecialSiteCaptureClaimed?: TileKey[];
  clusters?: ClusterDefinition[];
  clusterTiles?: [TileKey, string][];
  pendingSettlements?: Array<{ tileKey: TileKey; ownerId: string; startedAt: number; resolvesAt: number; goldCost: number }>;
  townCaptureShock?: [TileKey, number][];
  townGrowthShock?: [TileKey, number][];
  season?: Season;
  seasonWinner?: SeasonWinnerView;
  seasonArchives?: SeasonArchiveEntry[];
  seasonTechConfig?: Omit<SeasonalTechConfig, "activeNodeIds"> & { activeNodeIds: string[] };
}

interface ClusterDefinition {
  clusterId: string;
  clusterType: ClusterType;
  resourceType?: ResourceType;
  centerX: number;
  centerY: number;
  radius: number;
  controlThreshold: number;
}

interface SeasonalTechConfig {
  configId: string;
  rootNodeIds: string[];
  activeNodeIds: Set<string>;
  balanceConstants: Record<string, number>;
}

interface TownDefinition {
  townId: string;
  tileKey: TileKey;
  type: "MARKET" | "FARMING" | "ANCIENT";
  population: number;
  maxPopulation: number;
  connectedTownCount: number;
  connectedTownBonus: number;
  lastGrowthTickAt: number;
}

type StrategicResource = "FOOD" | "IRON" | "CRYSTAL" | "SUPPLY" | "SHARD";
const STRATEGIC_RESOURCE_KEYS: readonly StrategicResource[] = ["FOOD", "IRON", "CRYSTAL", "SUPPLY", "SHARD"];

interface Observatory {
  observatoryId: string;
  ownerId: string;
  tileKey: TileKey;
  status: "under_construction" | "active" | "inactive";
  completesAt?: number;
}

interface ActiveSabotage {
  targetTileKey: TileKey;
  casterPlayerId: string;
  endsAt: number;
  outputMultiplier: number;
}

interface TileYieldBuffer {
  gold: number;
  strategic: Record<StrategicResource, number>;
}

interface RuntimeTileCore {
  x: number;
  y: number;
  tileKey: TileKey;
  terrain: Tile["terrain"];
  ownerId: string | undefined;
  ownershipState: OwnershipState | undefined;
  resource: ResourceType | undefined;
}

interface PlayerEconomyIndex {
  settledResourceTileKeys: Set<TileKey>;
  settledDockTileKeys: Set<TileKey>;
  settledTownTileKeys: Set<TileKey>;
  ancientTownTileKeys: Set<TileKey>;
}

const emptyPlayerEffects = (): PlayerEffects => ({
  unlockForts: false,
  unlockSiegeOutposts: false,
  unlockGranary: false,
  unlockRevealRegion: false,
  unlockRevealEmpire: false,
  unlockDeepStrike: false,
  unlockMountainPass: false,
  unlockTerrainShaping: false,
  unlockBreachAttack: false,
  settlementSpeedMult: 1,
  operationalTempoMult: 1,
  populationGrowthMult: 1,
  firstThreeTownsPopulationGrowthMult: 1,
  populationCapFirst3TownsMult: 1,
  growthPauseDurationMult: 1,
  townFoodUpkeepMult: 1,
  settledFoodUpkeepMult: 1,
  settledGoldUpkeepMult: 1,
  townGoldOutputMult: 1,
  townGoldCapMult: 1,
  marketIncomeBonusAdd: 0.5,
  marketCapBonusAdd: 0.5,
  granaryCapBonusAdd: 0.5,
  populationIncomeMult: 1,
  connectedTownStepBonusAdd: 0,
  harvestCapMult: 1,
  fortBuildGoldCostMult: 1,
  fortDefenseMult: 1,
  fortIronUpkeepMult: 1,
  fortGoldUpkeepMult: 1,
  outpostAttackMult: 1,
  outpostSupplyUpkeepMult: 1,
  outpostGoldUpkeepMult: 1,
  revealUpkeepMult: 1,
  revealCapacityBonus: 0,
  visionRadiusBonus: 0,
  dockGoldOutputMult: 1,
  dockGoldCapMult: 1,
  dockConnectionBonusPerLink: 0.5,
  dockRoutesVisible: false,
  marketCrystalUpkeepMult: 1,
  settledDefenseMult: 1,
  attackVsSettledMult: 1,
  attackVsFortsMult: 1,
  newSettlementDefenseMult: 1,
  buildCapacityAdd: 0,
  resourceOutputMult: { FARM: 1, FISH: 1, IRON: 1, CRYSTAL: 1, SUPPLY: 1, SHARD: 1 }
});

interface TechRequirementChecklist {
  label: string;
  met: boolean;
}

interface DomainRequirementChecklist {
  label: string;
  met: boolean;
}

interface PlayerEffects {
  unlockForts: boolean;
  unlockSiegeOutposts: boolean;
  unlockGranary: boolean;
  unlockRevealRegion: boolean;
  unlockRevealEmpire: boolean;
  unlockDeepStrike: boolean;
  unlockMountainPass: boolean;
  unlockTerrainShaping: boolean;
  unlockBreachAttack: boolean;
  settlementSpeedMult: number;
  operationalTempoMult: number;
  populationGrowthMult: number;
  firstThreeTownsPopulationGrowthMult: number;
  populationCapFirst3TownsMult: number;
  growthPauseDurationMult: number;
  townFoodUpkeepMult: number;
  settledFoodUpkeepMult: number;
  settledGoldUpkeepMult: number;
  townGoldOutputMult: number;
  townGoldCapMult: number;
  marketIncomeBonusAdd: number;
  marketCapBonusAdd: number;
  granaryCapBonusAdd: number;
  populationIncomeMult: number;
  connectedTownStepBonusAdd: number;
  harvestCapMult: number;
  fortBuildGoldCostMult: number;
  fortDefenseMult: number;
  fortIronUpkeepMult: number;
  fortGoldUpkeepMult: number;
  outpostAttackMult: number;
  outpostSupplyUpkeepMult: number;
  outpostGoldUpkeepMult: number;
  revealUpkeepMult: number;
  revealCapacityBonus: number;
  visionRadiusBonus: number;
  dockGoldOutputMult: number;
  dockGoldCapMult: number;
  dockConnectionBonusPerLink: number;
  dockRoutesVisible: boolean;
  marketCrystalUpkeepMult: number;
  settledDefenseMult: number;
  attackVsSettledMult: number;
  attackVsFortsMult: number;
  newSettlementDefenseMult: number;
  buildCapacityAdd: number;
  resourceOutputMult: { FARM: number; FISH: number; IRON: number; CRYSTAL: number; SUPPLY: number; SHARD: number };
}

interface TelemetryCounters {
  frontierClaims: number;
  settlements: number;
  breakthroughAttacks: number;
  techUnlocks: number;
}

type StatsModBreakdownEntry = { label: string; mult: number };
type StatsModBreakdown = Record<StatsModKey, StatsModBreakdownEntry[]>;

type AiTurnDebugEntry = {
  at: number;
  playerId: string;
  name: string;
  reason: string;
  points: number;
  incomePerMinute?: number;
  controlledTowns?: number;
  settledTiles?: number;
  primaryVictoryPath?: AiSeasonVictoryPathId;
  goapGoalId?: string;
  goapActionKey?: string;
  executed?: boolean;
  details?: Record<string, boolean | number | string | undefined>;
};

interface AbilityDefinition {
  id: "reveal_empire" | "deep_strike" | "naval_infiltration" | "sabotage" | "create_mountain" | "remove_mountain";
  name: string;
  requiredTechIds: string[];
  crystalCost: number;
  cooldownMs: number;
  upkeepCrystalPerMinute?: number;
  durationMs?: number;
}

interface DynamicMissionDef {
  id: string;
  type: "VENDETTA" | "DOCK_HUNT" | "RESOURCE_CHAIN" | "TOWN_SUPREMACY" | "SETTLER_SURGE";
  expiresAt: number;
  targetPlayerId?: string;
  targetDockCount?: number;
  focusResources?: [ResourceType, ResourceType];
  targetSettlements?: number;
  targetTowns?: number;
  completed: boolean;
  rewarded: boolean;
}

const key = (x: number, y: number): TileKey => `${x},${y}`;
const parseKey = (k: TileKey): [number, number] => {
  const [xs, ys] = k.split(",");
  return [Number(xs), Number(ys)];
};
const BARBARIAN_OWNER_ID = "barbarian";

const now = (): number => Date.now();
const ALLIANCE_REQUEST_TTL_MS = 5 * 60_000;
const PASSIVE_INCOME_MULT = 1.0;
const BASE_GOLD_PER_MIN = 1;
const FRONTIER_ACTION_GOLD_COST = 1;
const GOLD_COST_EPSILON = 1e-6;
const canAffordGoldCost = (gold: number, cost: number): boolean => gold + GOLD_COST_EPSILON >= cost;
const HARVEST_GOLD_RATE_MULT = 1;
const HARVEST_RESOURCE_RATE_MULT = 1 / 1440;
const TILE_YIELD_CAP_GOLD = 24;
const TILE_YIELD_CAP_RESOURCE = 6;
const OFFLINE_YIELD_ACCUM_MAX_MS = 12 * 60 * 60 * 1000;
const COLLECT_VISIBLE_COOLDOWN_MS = 20_000;
const IDLE_SNAPSHOT_INTERVAL_MS = 5 * 60_000;
const FIRST_SPECIAL_SITE_CAPTURE_GOLD = 6;
const STARTING_GOLD = 50;
const MIN_ACTIVE_BARBARIAN_AGENTS = 80;
const BARBARIAN_MAINTENANCE_INTERVAL_MS = 10_000;
const BARBARIAN_MAINTENANCE_MAX_SPAWNS_PER_PASS = 6;
const PVP_REWARD_MULT = 0.55;
const TOWN_BASE_GOLD_PER_MIN = 4;
const DOCK_INCOME_PER_MIN = 2;
const BREAKTHROUGH_GOLD_COST = 2;
const BREAKTHROUGH_IRON_COST = 1;
const FORT_BUILD_IRON_COST = 45;
const SIEGE_OUTPOST_BUILD_SUPPLY_COST = 45;
const BREAKTHROUGH_DEF_MULT_FACTOR = 0.6;
const BREAKTHROUGH_REQUIRED_TECH_ID = "breach-doctrine";
const OBSERVATORY_BUILD_COST = 600;
const OBSERVATORY_VISION_BONUS = 5;
const OBSERVATORY_BUILD_CRYSTAL_COST = 45;
const OBSERVATORY_UPKEEP_PER_MIN = 0.025;
const OBSERVATORY_PROTECTION_RADIUS = 10;
const ECONOMIC_STRUCTURE_UPKEEP_INTERVAL_MS = 10 * 60_000;
const FARMSTEAD_BUILD_GOLD_COST = 400;
const FARMSTEAD_BUILD_FOOD_COST = 20;
const FARMSTEAD_GOLD_UPKEEP = 1;
const CAMP_BUILD_GOLD_COST = 500;
const CAMP_BUILD_SUPPLY_COST = 30;
const CAMP_GOLD_UPKEEP = 1.2;
const MINE_BUILD_GOLD_COST = 500;
const MINE_BUILD_RESOURCE_COST = 30;
const MINE_GOLD_UPKEEP = 1.2;
const MARKET_BUILD_GOLD_COST = 600;
const MARKET_BUILD_CRYSTAL_COST = 40;
const MARKET_CRYSTAL_UPKEEP = 0.05;
const GRANARY_BUILD_GOLD_COST = 400;
const GRANARY_BUILD_FOOD_COST = 40;
const GRANARY_GOLD_UPKEEP = 1;
const STRUCTURE_OUTPUT_MULT = 1.5;
const REVEAL_EMPIRE_ACTIVATION_COST = 20;
const REVEAL_EMPIRE_UPKEEP_PER_MIN = 0.015;
const DEEP_STRIKE_CRYSTAL_COST = 25;
const DEEP_STRIKE_COOLDOWN_MS = 20 * 60_000;
const DEEP_STRIKE_ATTACK_MULT = 0.9;
const DEEP_STRIKE_MAX_DISTANCE = 2;
const NAVAL_INFILTRATION_CRYSTAL_COST = 30;
const NAVAL_INFILTRATION_COOLDOWN_MS = 30 * 60_000;
const NAVAL_INFILTRATION_ATTACK_MULT = 0.85;
const NAVAL_INFILTRATION_MAX_RANGE = 4;
const SABOTAGE_CRYSTAL_COST = 20;
const SABOTAGE_COOLDOWN_MS = 15 * 60_000;
const SABOTAGE_DURATION_MS = 45 * 60_000;
const SABOTAGE_OUTPUT_MULT = 0.5;
const TERRAIN_SHAPING_GOLD_COST = 8000;
const TERRAIN_SHAPING_CRYSTAL_COST = 400;
const TERRAIN_SHAPING_COOLDOWN_MS = 20 * 60_000;
const TERRAIN_SHAPING_RANGE = 2;
const PLAYER_MOUNTAIN_DENSITY_RADIUS = 5;
const PLAYER_MOUNTAIN_DENSITY_LIMIT = 3;
const NEW_SETTLEMENT_DEFENSE_MS = 15 * 60_000;
const POPULATION_GROWTH_BASE_RATE = 0.00016;
const POPULATION_MIN = 15_000;
const POPULATION_MAX = 10_000_000;
const POPULATION_START_SPREAD = 10_000;
const POPULATION_GROWTH_TICK_MS = 60_000;
const GROWTH_PAUSE_MS = 60 * 60_000;
const GROWTH_PAUSE_MAX_MS = 6 * 60 * 60_000;
const LARGE_ISLAND_MULTI_DOCK_TILE_THRESHOLD = 250;
const BREACH_SHOCK_MS = 180_000;
const BREACH_SHOCK_DEF_MULT = 0.72;
const DYNAMIC_MISSION_MS = 7 * 24 * 60 * 60 * 1000;
const VENDETTA_ATTACK_BUFF_MULT = 1.15;
const VENDETTA_ATTACK_BUFF_MS = 24 * 60 * 60 * 1000;
const RESOURCE_CHAIN_BUFF_MS = 24 * 60 * 60 * 1000;
const RESOURCE_CHAIN_MULT = 1.4;
const SEASON_VICTORY_HOLD_MS = 24 * 60 * 60_000;
const SEASON_VICTORY_TOWN_CONTROL_SHARE = 0.5;
const SEASON_VICTORY_SETTLED_TERRITORY_SHARE = 0.66;
const SEASON_VICTORY_ECONOMY_MIN_INCOME = 200;
const SEASON_VICTORY_ECONOMY_LEAD_MULT = 1.33;
const SEASON_VICTORY_CONTINENT_FOOTPRINT_SHARE = 0.2;
const VICTORY_PRESSURE_FRONTIER_REACH_WINDOW_MS = 2 * 60 * 60_000;
const VICTORY_PRESSURE_DEFS: VictoryPressureDefinition[] = [
  {
    id: "TOWN_CONTROL",
    name: "Town Control",
    description: "Control 50% of all towns in the world.",
    holdDurationSeconds: SEASON_VICTORY_HOLD_MS / 1000
  },
  {
    id: "SETTLED_TERRITORY",
    name: "Settled Territory",
    description: "Control 66% of all claimable land tiles as settled territory.",
    holdDurationSeconds: SEASON_VICTORY_HOLD_MS / 1000
  },
  {
    id: "ECONOMIC_HEGEMONY",
    name: "Economy",
    description: "Reach at least 200 gold per minute and stay 33% ahead of second place.",
    holdDurationSeconds: SEASON_VICTORY_HOLD_MS / 1000
  },
  {
    id: "RESOURCE_MONOPOLY",
    name: "Resource Monopoly",
    description: "Control all tiles of at least one world resource type.",
    holdDurationSeconds: SEASON_VICTORY_HOLD_MS / 1000
  },
  {
    id: "CONTINENT_FOOTPRINT",
    name: "Continental Footprint",
    description: "Control at least 20% of claimable land on every continent.",
    holdDurationSeconds: SEASON_VICTORY_HOLD_MS / 1000
  }
];
const ABILITY_DEFS: Record<AbilityDefinition["id"], AbilityDefinition> = {
  reveal_empire: {
    id: "reveal_empire",
    name: "Reveal Empire",
    requiredTechIds: ["cryptography"],
    crystalCost: REVEAL_EMPIRE_ACTIVATION_COST,
    cooldownMs: 0,
    upkeepCrystalPerMinute: REVEAL_EMPIRE_UPKEEP_PER_MIN
  },
  deep_strike: {
    id: "deep_strike",
    name: "Deep Strike",
    requiredTechIds: ["deep-operations"],
    crystalCost: DEEP_STRIKE_CRYSTAL_COST,
    cooldownMs: DEEP_STRIKE_COOLDOWN_MS
  },
  naval_infiltration: {
    id: "naval_infiltration",
    name: "Naval Infiltration",
    requiredTechIds: ["navigation"],
    crystalCost: NAVAL_INFILTRATION_CRYSTAL_COST,
    cooldownMs: NAVAL_INFILTRATION_COOLDOWN_MS
  },
  sabotage: {
    id: "sabotage",
    name: "Sabotage",
    requiredTechIds: ["cryptography"],
    crystalCost: SABOTAGE_CRYSTAL_COST,
    cooldownMs: SABOTAGE_COOLDOWN_MS,
    durationMs: SABOTAGE_DURATION_MS
  },
  create_mountain: {
    id: "create_mountain",
    name: "Create Mountain",
    requiredTechIds: ["terrain-engineering"],
    crystalCost: TERRAIN_SHAPING_CRYSTAL_COST,
    cooldownMs: TERRAIN_SHAPING_COOLDOWN_MS
  },
  remove_mountain: {
    id: "remove_mountain",
    name: "Remove Mountain",
    requiredTechIds: ["terrain-engineering"],
    crystalCost: TERRAIN_SHAPING_CRYSTAL_COST,
    cooldownMs: TERRAIN_SHAPING_COOLDOWN_MS
  }
};
const MISSION_DEFS: MissionDef[] = [
  {
    id: "frontier-scout",
    kind: "NEUTRAL_CAPTURES",
    name: "Frontier Scout",
    description: "Capture 6 neutral tiles.",
    unlockPoints: 0,
    target: 6,
    rewardPoints: 0,
    rewardLabel: "Reward: +1 FOOD +1 SUPPLY"
  },
  {
    id: "frontier-commander",
    kind: "NEUTRAL_CAPTURES",
    name: "Frontier Commander",
    description: "Capture 16 neutral tiles.",
    unlockPoints: 50,
    prerequisiteId: "frontier-scout",
    target: 16,
    rewardPoints: 0,
    rewardLabel: "Reward: +1 IRON +1 CRYSTAL"
  },
  {
    id: "regional-footprint",
    kind: "SETTLED_TILES_HELD",
    name: "Regional Footprint",
    description: "Hold 20 settled tiles at once.",
    unlockPoints: 80,
    target: 20,
    rewardPoints: 0,
    rewardLabel: "Reward: +1 SHARD"
  },
  {
    id: "breadbasket-protocol",
    kind: "FARMS_HELD",
    name: "Breadbasket Protocol",
    description: "Control 4 farms at once.",
    unlockPoints: 140,
    target: 4,
    rewardPoints: 150
  },
  {
    id: "first-bloodline",
    kind: "ENEMY_CAPTURES",
    name: "First Bloodline",
    description: "Capture 3 enemy-owned tiles.",
    unlockPoints: 200,
    target: 3,
    rewardPoints: 220
  },
  {
    id: "victory-rhythm",
    kind: "COMBAT_WINS",
    name: "Victory Rhythm",
    description: "Win 10 combats.",
    unlockPoints: 320,
    target: 10,
    rewardPoints: 300
  },
  {
    id: "tech-apprentice",
    kind: "TECH_PICKS",
    name: "Tech Apprentice",
    description: "Select 3 techs.",
    unlockPoints: 250,
    target: 3,
    rewardPoints: 260
  },
  {
    id: "tech-master",
    kind: "TECH_PICKS",
    name: "Tech Master",
    description: "Select 8 techs.",
    unlockPoints: 600,
    prerequisiteId: "tech-apprentice",
    target: 8,
    rewardPoints: 700
  },
  {
    id: "continental-triad",
    kind: "CONTINENTS_HELD",
    name: "Continental Triad",
    description: "Hold land on 3 continents at once.",
    unlockPoints: 450,
    target: 3,
    rewardPoints: 700
  },
  {
    id: "continental-grip",
    kind: "TILES_HELD",
    name: "Continental Grip",
    description: "Hold 50 tiles at once.",
    unlockPoints: 700,
    target: 50,
    rewardPoints: 600
  },
  {
    id: "agri-hegemon",
    kind: "FARMS_HELD",
    name: "Agri Hegemon",
    description: "Control 10 farms at once.",
    unlockPoints: 1100,
    target: 10,
    rewardPoints: 900
  },
  {
    id: "war-ledger",
    kind: "ENEMY_CAPTURES",
    name: "War Ledger",
    description: "Capture 20 enemy-owned tiles.",
    unlockPoints: 1500,
    target: 20,
    rewardPoints: 1200
  }
];
const colorFromId = (id: string): string => {
  let h = 2166136261;
  for (let i = 0; i < id.length; i += 1) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const hue = (h >>> 0) % 360;
  const c = (1 - Math.abs((2 * 0.48) - 1)) * 0.7;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = 0.48 - c / 2;
  let r = 0;
  let g = 0;
  let b = 0;
  if (hue < 60) [r, g, b] = [c, x, 0];
  else if (hue < 120) [r, g, b] = [x, c, 0];
  else if (hue < 180) [r, g, b] = [0, c, x];
  else if (hue < 240) [r, g, b] = [0, x, c];
  else if (hue < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const toHex = (n: number): string => Math.round((n + m) * 255).toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
};

const { techs: TECHS, techById, childrenByTech, roots: TECH_ROOTS } = loadTechTree(process.cwd());
const { domains: DOMAINS, domainById } = loadDomainTree(process.cwd());

const resourceRate: Record<ResourceType, number> = {
  FARM: 0,
  FISH: 0,
  FUR: 0,
  WOOD: 0,
  IRON: 0,
  GEMS: 0
};

const strategicResourceRates: Record<StrategicResource, number> = {
  FOOD: 0,
  IRON: 0,
  CRYSTAL: 0,
  SUPPLY: 0,
  SHARD: 1
};

const strategicDailyFromResource: Partial<Record<ResourceType, number>> = {
  FARM: 72,
  FISH: 48,
  IRON: 60,
  FUR: 60,
  WOOD: 60,
  GEMS: 36
};

const toStrategicResource = (resource: ResourceType | undefined): StrategicResource | undefined => {
  if (!resource) return undefined;
  if (resource === "FARM" || resource === "FISH") return "FOOD";
  if (resource === "IRON") return "IRON";
  if (resource === "GEMS") return "CRYSTAL";
  if (resource === "WOOD" || resource === "FUR") return "SUPPLY";
  return undefined;
};

const baseTileValue = (resource: ResourceType | undefined): number => {
  if (!resource) return 10;
  if (resource === "FARM") return 20;
  if (resource === "FISH") return 22;
  if (resource === "FUR") return 24;
  if (resource === "WOOD") return 30;
  if (resource === "IRON") return 40;
  return 60;
};

const currentIncomePerMinute = (player: Player): number => {
  const counts = getOrInitResourceCounts(player.id);
  let incomePerMinute = 0;
  for (const [r, c] of Object.entries(counts) as [ResourceType, number][]) {
    incomePerMinute += c * (resourceRate[r] ?? 0);
  }
  let ownedDockCount = 0;
  for (const d of docksByTile.values()) {
    const [dx, dy] = parseKey(d.tileKey);
    const t = playerTile(dx, dy);
    if (t.ownerId === player.id && t.ownershipState === "SETTLED") ownedDockCount += dockIncomeForOwner(d, player.id);
  }
  incomePerMinute += ownedDockCount;
  for (const town of townsByTile.values()) {
    incomePerMinute += townIncomeForOwner(town, player.id) * sabotageMultiplierAt(town.tileKey);
  }
  const hasCapital = Boolean(
    player.capitalTileKey &&
      ownership.get(player.capitalTileKey) === player.id &&
      ownershipStateByTile.get(player.capitalTileKey) === "SETTLED"
  );
  return incomePerMinute * player.mods.income * PASSIVE_INCOME_MULT + (hasCapital ? BASE_GOLD_PER_MIN : 0);
};

const strategicProductionPerMinute = (player: Player): Record<StrategicResource, number> => {
  const out: Record<StrategicResource, number> = { FOOD: 0, IRON: 0, CRYSTAL: 0, SUPPLY: 0, SHARD: 0 };
  for (const tk of player.territoryTiles) {
    if (ownershipStateByTile.get(tk) !== "SETTLED") continue;
    const [x, y] = parseKey(tk);
    const t = playerTile(x, y);
    if (t.ownerId !== player.id || t.terrain !== "LAND") continue;
    const sr = toStrategicResource(t.resource);
    if (sr) {
      const mult = t.resource ? activeResourceIncomeMult(player.id, t.resource) : 1;
      const daily = t.resource ? (strategicDailyFromResource[t.resource] ?? 0) : 0;
      out[sr] += (daily / 1440) * mult * sabotageMultiplierAt(tk) * economicStructureOutputMultAt(tk, player.id);
    }
  }
  for (const town of townsByTile.values()) {
    const [x, y] = parseKey(town.tileKey);
    const t = playerTile(x, y);
    if (t.ownerId !== player.id || t.ownershipState !== "SETTLED") continue;
    if (town.type === "ANCIENT") out.SHARD += (strategicResourceRates.SHARD * getPlayerEffectsForPlayer(player.id).resourceOutputMult.SHARD) / 1440;
  }
  return out;
};

const players = new Map<string, Player>();
const authIdentityByUid = new Map<string, AuthIdentity>();
const socketsByPlayer = new Map<string, Ws>();
const aiTurnDebugByPlayer = new Map<string, AiTurnDebugEntry>();

const normalizedPlayerHandle = (name: string): string => {
  const cleaned = name.replace(/\s+/g, " ").trim();
  if (!cleaned) return "Empire";
  return cleaned.slice(0, 24);
};

const playerNameTaken = (candidate: string, excludePlayerId?: string): boolean => {
  for (const player of players.values()) {
    if (excludePlayerId && player.id === excludePlayerId) continue;
    if (player.name === candidate) return true;
  }
  return false;
};

const uniquePlayerName = (uid: string, preferred: string): string => {
  const base = normalizedPlayerHandle(preferred);
  const existingIdentity = authIdentityByUid.get(uid);
  if (existingIdentity) return existingIdentity.name;
  let candidate = base;
  let suffix = 2;
  while (playerNameTaken(candidate)) {
    candidate = `${base.slice(0, Math.max(1, 24 - String(suffix).length - 1))}-${suffix}`;
    suffix += 1;
  }
  return candidate;
};

const claimPlayerName = (playerId: string, preferred: string): string => {
  const base = normalizedPlayerHandle(preferred);
  let candidate = base;
  let suffix = 2;
  while (playerNameTaken(candidate, playerId)) {
    candidate = `${base.slice(0, Math.max(1, 24 - String(suffix).length - 1))}-${suffix}`;
    suffix += 1;
  }
  return candidate;
};

const AI_SINGLE_NAMES = [
  "Conan",
  "Boudica",
  "Ragnar",
  "Nyx",
  "Ivar",
  "Brakka",
  "Skarn",
  "Valka",
  "Torvin",
  "Morrigan",
  "Korga",
  "Thyra"
] as const;

const AI_NAME_PREFIXES = [
  "Bastard",
  "Iron",
  "Wolf",
  "Raven",
  "Blood",
  "Ash",
  "Bone",
  "Storm",
  "Night",
  "Skull",
  "Dread",
  "Black"
] as const;

const AI_NAME_SUFFIXES = [
  "Cleaver",
  "Reaver",
  "Fang",
  "Hammer",
  "Render",
  "Maw",
  "Howl",
  "Breaker",
  "Warden",
  "Rider",
  "Seer",
  "Brand"
] as const;

const randomFrom = <T,>(items: readonly T[]): T => items[Math.floor(Math.random() * items.length)]!;

const generateAiNickname = (): string => {
  for (let i = 0; i < 24; i += 1) {
    const preferred =
      Math.random() < 0.35
        ? randomFrom(AI_SINGLE_NAMES)
        : `${randomFrom(AI_NAME_PREFIXES)}${randomFrom(AI_NAME_SUFFIXES)}`;
    if (!playerNameTaken(preferred)) return preferred;
  }
  return `${randomFrom(AI_NAME_PREFIXES)}${randomFrom(AI_NAME_SUFFIXES)}`;
};

const aiHasPlaceholderName = (name: string): boolean => /^AI Empire \d+$/.test(name);

const playerHasFogAdminAccess = (playerId: string): boolean => {
  for (const identity of authIdentityByUid.values()) {
    if (identity.playerId !== playerId) continue;
    return identity.email?.toLowerCase() === FOG_ADMIN_EMAIL;
  }
  return false;
};

const ensureAiPlayers = (): void => {
  if (AI_PLAYERS <= 0) return;
  const existing = [...players.values()].filter((player) => player.isAi);
  for (const player of existing) {
    if (!aiHasPlaceholderName(player.name)) continue;
    player.name = claimPlayerName(player.id, generateAiNickname());
  }
  for (let i = existing.length; i < AI_PLAYERS; i += 1) {
    const id = crypto.randomUUID();
    const player: Player = {
      id,
      name: claimPlayerName(id, generateAiNickname()),
      isAi: true,
      profileComplete: true,
      points: STARTING_GOLD,
      level: 0,
      techIds: new Set<string>(),
      domainIds: new Set<string>(),
      mods: { attack: 1, defense: 1, income: 1, vision: 1 },
      powerups: {},
      tileColor: colorFromId(id),
      missions: [],
      missionStats: defaultMissionStats(),
      territoryTiles: new Set<TileKey>(),
      T: 0,
      E: 0,
      Ts: 0,
      Es: 0,
      stamina: STAMINA_MAX,
      staminaUpdatedAt: now(),
      allies: new Set<string>(),
      spawnShieldUntil: now() + 120_000,
      isEliminated: false,
      respawnPending: false,
      lastActiveAt: now()
    };
    players.set(id, player);
    playerBaseMods.set(id, { attack: 1, defense: 1, income: 1, vision: 1 });
    strategicResourceStockByPlayer.set(id, emptyStrategicStocks());
    strategicResourceBufferByPlayer.set(id, emptyStrategicStocks());
    economyIndexByPlayer.set(id, emptyPlayerEconomyIndex());
    dynamicMissionsByPlayer.set(id, []);
    forcedRevealTilesByPlayer.set(id, new Set<TileKey>());
    setRevealTargetsForPlayer(id, []);
    playerEffectsByPlayer.set(id, emptyPlayerEffects());
    clusterControlledTilesByPlayer.set(id, new Map());
  }
};
const ownership = new Map<TileKey, string>();
const ownershipStateByTile = new Map<TileKey, OwnershipState>();
const barbarianAgents = new Map<string, BarbarianAgent>();
const barbarianAgentByTileKey = new Map<TileKey, string>();
interface PendingCapture {
  resolvesAt: number;
  origin: TileKey;
  target: TileKey;
  attackerId: string;
  staminaCost: number;
  cancelled: boolean;
  timeout?: NodeJS.Timeout;
}
interface PendingSettlement {
  tileKey: TileKey;
  ownerId: string;
  startedAt: number;
  resolvesAt: number;
  goldCost: number;
  cancelled: boolean;
  timeout?: NodeJS.Timeout;
}
interface UpkeepBreakdown {
  need: number;
  fromYield: number;
  fromStock: number;
  remaining: number;
}
interface UpkeepDiagnostics {
  food: UpkeepBreakdown;
  iron: UpkeepBreakdown;
  supply: UpkeepBreakdown;
  crystal: UpkeepBreakdown;
  gold: UpkeepBreakdown;
  foodCoverage: number;
}
interface TileHistoryState {
  lastOwnerId?: string | null;
  previousOwners: string[];
  captureCount: number;
  lastCapturedAt?: number | null;
  lastStructureType?: "FORT" | "SIEGE_OUTPOST" | "OBSERVATORY" | EconomicStructureType | null;
  structureHistory: Array<"FORT" | "SIEGE_OUTPOST" | "OBSERVATORY" | EconomicStructureType>;
  wasMountainCreatedByPlayer?: boolean;
  wasMountainRemovedByPlayer?: boolean;
}
interface TerrainShapeState {
  terrain: "LAND" | "MOUNTAIN";
  createdByPlayer: boolean;
}
type EmpireVisualStyle = {
  primaryOverlay: string;
  secondaryTint: "IRON" | "SUPPLY" | "FOOD" | "CRYSTAL" | "BALANCED";
  borderStyle: "SHARP" | "HEAVY" | "GLOW" | "DASHED" | "SOFT";
  structureAccent: "IRON" | "SUPPLY" | "FOOD" | "CRYSTAL" | "NEUTRAL";
};
const combatLocks = new Map<TileKey, PendingCapture>();
const pendingSettlementsByTile = new Map<TileKey, PendingSettlement>();
const repeatFights = new Map<string, number[]>();
const resourceCountsByPlayer = new Map<string, Record<ResourceType, number>>();
const strategicResourceStockByPlayer = new Map<string, Record<StrategicResource, number>>();
const strategicResourceBufferByPlayer = new Map<string, Record<StrategicResource, number>>();
const economyIndexByPlayer = new Map<string, PlayerEconomyIndex>();
const foodUpkeepCoverageByPlayer = new Map<string, number>();
const townFeedingStateByPlayer = new Map<string, { foodCoverage: number; fedTownKeys: Set<TileKey> }>();
const tileYieldByTile = new Map<TileKey, TileYieldBuffer>();
const tileHistoryByTile = new Map<TileKey, TileHistoryState>();
const terrainShapesByTile = new Map<TileKey, TerrainShapeState>();
const lastUpkeepByPlayer = new Map<string, UpkeepDiagnostics>();
const dynamicMissionsByPlayer = new Map<string, DynamicMissionDef[]>();
const temporaryAttackBuffUntilByPlayer = new Map<string, number>();
const temporaryIncomeBuffUntilByPlayer = new Map<string, { until: number; resources: [ResourceType, ResourceType] }>();
const growthPausedUntilByPlayer = new Map<string, number>();
const townCaptureShockUntilByTile = new Map<TileKey, number>();
const townGrowthShockUntilByTile = new Map<TileKey, number>();
const vendettaCaptureCountsByPlayer = new Map<string, Map<string, number>>();
const forcedRevealTilesByPlayer = new Map<string, Set<TileKey>>();
const cachedVisibilitySnapshotByPlayer = new Map<string, VisibilitySnapshot>();
const cachedChunkSnapshotByPlayer = new Map<
  string,
  {
    cx: number;
    cy: number;
    radius: number;
    visibility: VisibilitySnapshot;
    payloads: string[];
  }
>();
const allianceRequests = new Map<string, AllianceRequest>();
const chunkSubscriptionByPlayer = new Map<string, { cx: number; cy: number; radius: number }>();
const chunkSnapshotSentAtByPlayer = new Map<string, { cx: number; cy: number; radius: number; sentAt: number }>();
const collectVisibleCooldownByPlayer = new Map<string, number>();
const actionTimestampsByPlayer = new Map<string, number[]>();
const fogDisabledByPlayer = new Map<string, boolean>();
const fortsByTile = new Map<TileKey, Fort>();
const fortBuildTimers = new Map<TileKey, NodeJS.Timeout>();
const observatoriesByTile = new Map<TileKey, Observatory>();
const observatoryBuildTimers = new Map<TileKey, NodeJS.Timeout>();
const observatoryTileKeysByPlayer = new Map<string, Set<TileKey>>();
const siegeOutpostsByTile = new Map<TileKey, SiegeOutpost>();
const siegeOutpostBuildTimers = new Map<TileKey, NodeJS.Timeout>();
const economicStructuresByTile = new Map<TileKey, EconomicStructure>();
const economicStructureBuildTimers = new Map<TileKey, NodeJS.Timeout>();
const economicStructureTileKeysByPlayer = new Map<string, Set<TileKey>>();
const docksByTile = new Map<TileKey, Dock>();
const dockById = new Map<string, Dock>();
const clusterByTile = new Map<TileKey, string>();
const clustersById = new Map<string, ClusterDefinition>();
const clusterControlledTilesByPlayer = new Map<string, Map<string, number>>();
const townsByTile = new Map<TileKey, TownDefinition>();
const firstSpecialSiteCaptureClaimed = new Set<TileKey>();
const revealedEmpireTargetsByPlayer = new Map<string, Set<string>>();
const revealWatchersByTarget = new Map<string, Set<string>>();
const sabotageByTile = new Map<TileKey, ActiveSabotage>();
const abilityCooldownsByPlayer = new Map<string, Map<AbilityDefinition["id"], number>>();
const victoryPressureById = new Map<SeasonVictoryPathId, VictoryPressureTracker>();
const frontierSettlementsByPlayer = new Map<string, number[]>();
const breachShockByTile = new Map<TileKey, { ownerId: string; expiresAt: number }>();
const settlementDefenseByTile = new Map<TileKey, { ownerId: string; expiresAt: number; mult: number }>();
const playerBaseMods = new Map<string, { attack: number; defense: number; income: number; vision: number }>();
const playerEffectsByPlayer = new Map<string, PlayerEffects>();
const seasonArchives: SeasonArchiveEntry[] = [];
let seasonWinner: SeasonWinnerView | undefined;
const telemetryCounters: TelemetryCounters = {
  frontierClaims: 0,
  settlements: 0,
  breakthroughAttacks: 0,
  techUnlocks: 0
};
let activeSeason: Season = {
  seasonId: `s-${Date.now()}`,
  startAt: now(),
  endAt: now() + SEASON_LENGTH_DAYS * 24 * 60 * 60 * 1000,
  worldSeed: Math.floor(Math.random() * 1_000_000_000),
  techTreeConfigId: "seasonal-default",
  status: "active"
};
let activeSeasonTechConfig: SeasonalTechConfig = {
  configId: "seasonal-default",
  rootNodeIds: [],
  activeNodeIds: new Set<string>(),
  balanceConstants: {}
};
const pairKeyFor = (a: string, b: string): string => (a < b ? `${a}:${b}` : `${b}:${a}`);
const ACTION_WINDOW_MS = 5_000;
const ACTION_LIMIT = 12;
const pruneActionTimes = (playerId: string, nowMs: number): number[] => {
  const timestamps = actionTimestampsByPlayer.get(playerId);
  if (!timestamps || timestamps.length === 0) return [];
  let writeIndex = 0;
  for (let readIndex = 0; readIndex < timestamps.length; readIndex += 1) {
    const timestamp = timestamps[readIndex]!;
    if (nowMs - timestamp > ACTION_WINDOW_MS) continue;
    timestamps[writeIndex] = timestamp;
    writeIndex += 1;
  }
  if (writeIndex !== timestamps.length) timestamps.length = writeIndex;
  if (writeIndex === 0) {
    actionTimestampsByPlayer.delete(playerId);
    return [];
  }
  return timestamps;
};
const pruneRepeatFightEntries = (pairKey: string, nowMs: number): number[] => {
  const entries = repeatFights.get(pairKey);
  if (!entries || entries.length === 0) return [];
  let writeIndex = 0;
  for (let readIndex = 0; readIndex < entries.length; readIndex += 1) {
    const timestamp = entries[readIndex]!;
    if (nowMs - timestamp > PVP_REPEAT_WINDOW_MS) continue;
    entries[writeIndex] = timestamp;
    writeIndex += 1;
  }
  if (writeIndex !== entries.length) entries.length = writeIndex;
  if (writeIndex === 0) {
    repeatFights.delete(pairKey);
    return [];
  }
  return entries;
};
const SEASONS_ENABLED = false;

const seeded01 = (x: number, y: number, seed: number): number => {
  const n = Math.sin((x * 12.9898 + y * 78.233 + seed * 43758.5453) % 100000) * 43758.5453123;
  return n - Math.floor(n);
};

const terrainAtRuntime = (x: number, y: number): "LAND" | "SEA" | "MOUNTAIN" => {
  const wx = wrapX(x, WORLD_WIDTH);
  const wy = wrapY(y, WORLD_HEIGHT);
  return terrainShapesByTile.get(key(wx, wy))?.terrain ?? terrainAt(wx, wy);
};

const terrainShapeWithinPlayerDensity = (x: number, y: number): boolean => {
  let count = 0;
  for (let dy = -PLAYER_MOUNTAIN_DENSITY_RADIUS; dy <= PLAYER_MOUNTAIN_DENSITY_RADIUS; dy += 1) {
    for (let dx = -PLAYER_MOUNTAIN_DENSITY_RADIUS; dx <= PLAYER_MOUNTAIN_DENSITY_RADIUS; dx += 1) {
      const tk = key(wrapX(x + dx, WORLD_WIDTH), wrapY(y + dy, WORLD_HEIGHT));
      const shape = terrainShapesByTile.get(tk);
      if (shape?.terrain === "MOUNTAIN" && shape.createdByPlayer) count += 1;
      if (count >= PLAYER_MOUNTAIN_DENSITY_LIMIT) return false;
    }
  }
  return true;
};

const hasOwnedLandWithinRange = (playerId: string, x: number, y: number, range: number): boolean => {
  for (const tk of players.get(playerId)?.territoryTiles ?? []) {
    const [tx, ty] = parseKey(tk);
    if (terrainAtRuntime(tx, ty) !== "LAND") continue;
    if (chebyshevDistance(tx, ty, x, y) <= range) return true;
  }
  return false;
};

const regionTypeAtLocal = (x: number, y: number): "FERTILE_PLAINS" | "BROKEN_HIGHLANDS" | "DEEP_FOREST" | "ANCIENT_HEARTLAND" | "CRYSTAL_WASTES" | undefined => {
  if (terrainAt(x, y) !== "LAND") return undefined;
  const a = seeded01(Math.floor(x / 80), Math.floor(y / 80), activeSeason.worldSeed + 1403);
  const b = seeded01(Math.floor((x + 137) / 64), Math.floor((y + 59) / 64), activeSeason.worldSeed + 1417);
  const c = seeded01(Math.floor((x - 83) / 110), Math.floor((y + 191) / 110), activeSeason.worldSeed + 1429);
  const v = a * 0.5 + b * 0.3 + c * 0.2;
  if (v < 0.2) return "FERTILE_PLAINS";
  if (v < 0.4) return "DEEP_FOREST";
  if (v < 0.6) return "BROKEN_HIGHLANDS";
  if (v < 0.8) return "ANCIENT_HEARTLAND";
  return "CRYSTAL_WASTES";
};

const isAdjacentTile = (ax: number, ay: number, bx: number, by: number): boolean => {
  const dx = Math.min(Math.abs(ax - bx), WORLD_WIDTH - Math.abs(ax - bx));
  const dy = Math.min(Math.abs(ay - by), WORLD_HEIGHT - Math.abs(ay - by));
  return dx <= 1 && dy <= 1 && (dx !== 0 || dy !== 0);
};

const isCoastalLand = (x: number, y: number): boolean => {
  if (terrainAt(x, y) !== "LAND") return false;
  const n = [
    terrainAt(wrapX(x, WORLD_WIDTH), wrapY(y - 1, WORLD_HEIGHT)),
    terrainAt(wrapX(x + 1, WORLD_WIDTH), wrapY(y, WORLD_HEIGHT)),
    terrainAt(wrapX(x, WORLD_WIDTH), wrapY(y + 1, WORLD_HEIGHT)),
    terrainAt(wrapX(x - 1, WORLD_WIDTH), wrapY(y, WORLD_HEIGHT))
  ];
  return n.includes("SEA");
};

const worldIndex = (x: number, y: number): number => y * WORLD_WIDTH + x;
const largestSeaComponentMask = (): Uint8Array => {
  const total = WORLD_WIDTH * WORLD_HEIGHT;
  const visited = new Uint8Array(total);
  const queue = new Int32Array(total);
  let largest: number[] = [];

  for (let y = 0; y < WORLD_HEIGHT; y += 1) {
    for (let x = 0; x < WORLD_WIDTH; x += 1) {
      const startIdx = worldIndex(x, y);
      if (visited[startIdx] || terrainAt(x, y) !== "SEA") continue;

      let head = 0;
      let tail = 0;
      const component: number[] = [];
      visited[startIdx] = 1;
      queue[tail++] = startIdx;

      while (head < tail) {
        const idx = queue[head++]!;
        component.push(idx);
        const cx = idx % WORLD_WIDTH;
        const cy = Math.floor(idx / WORLD_WIDTH);
        const neighbors: Array<[number, number]> = [
          [wrapX(cx, WORLD_WIDTH), wrapY(cy - 1, WORLD_HEIGHT)],
          [wrapX(cx + 1, WORLD_WIDTH), wrapY(cy, WORLD_HEIGHT)],
          [wrapX(cx, WORLD_WIDTH), wrapY(cy + 1, WORLD_HEIGHT)],
          [wrapX(cx - 1, WORLD_WIDTH), wrapY(cy, WORLD_HEIGHT)]
        ];
        for (const [nx, ny] of neighbors) {
          const nIdx = worldIndex(nx, ny);
          if (visited[nIdx] || terrainAt(nx, ny) !== "SEA") continue;
          visited[nIdx] = 1;
          queue[tail++] = nIdx;
        }
      }

      if (component.length > largest.length) largest = component;
    }
  }

  const ocean = new Uint8Array(total);
  for (const idx of largest) ocean[idx] = 1;
  return ocean;
};

const adjacentOceanSea = (x: number, y: number, oceanMask: Uint8Array): { x: number; y: number } | undefined => {
  const neighbors: Array<[number, number]> = [
    [wrapX(x, WORLD_WIDTH), wrapY(y - 1, WORLD_HEIGHT)],
    [wrapX(x + 1, WORLD_WIDTH), wrapY(y, WORLD_HEIGHT)],
    [wrapX(x, WORLD_WIDTH), wrapY(y + 1, WORLD_HEIGHT)],
    [wrapX(x - 1, WORLD_WIDTH), wrapY(y, WORLD_HEIGHT)]
  ];
  for (const [nx, ny] of neighbors) {
    if (terrainAt(nx, ny) !== "SEA") continue;
    if (!oceanMask[worldIndex(nx, ny)]) continue;
    return { x: nx, y: ny };
  }
  return undefined;
};

const clusterTypeDefs: Array<{
  type: ClusterType;
  resourceType: ResourceType;
  threshold: number;
}> = [
  { type: "FERTILE_PLAINS", resourceType: "FARM", threshold: 3 },
  { type: "IRON_HILLS", resourceType: "IRON", threshold: 3 },
  { type: "CRYSTAL_BASIN", resourceType: "GEMS", threshold: 3 },
  { type: "HORSE_STEPPES", resourceType: "FUR", threshold: 3 },
  { type: "COASTAL_SHOALS", resourceType: "FISH", threshold: 3 }
];

const clusterResourceType = (cluster: ClusterDefinition): ResourceType => {
  if (cluster.resourceType) return cluster.resourceType;
  if (cluster.clusterType === "FERTILE_PLAINS") return "FARM";
  if (cluster.clusterType === "IRON_HILLS") return "IRON";
  if (cluster.clusterType === "CRYSTAL_BASIN") return "GEMS";
  if (cluster.clusterType === "HORSE_STEPPES") return "FUR";
  if (cluster.clusterType === "COASTAL_SHOALS") return "FISH";
  return "GEMS";
};

const chooseSeasonalTechConfig = (seed: number): SeasonalTechConfig => {
  const activeNodeIds = new Set<string>();
  for (const tech of TECHS) {
    activeNodeIds.add(tech.id);
  }
  return {
    configId: `tree-${seed}`,
    rootNodeIds: [...TECH_ROOTS],
    activeNodeIds,
    balanceConstants: {}
  };
};

const seasonTechConfigIsCompatible = (config: SeasonalTechConfig): boolean => {
  if (config.rootNodeIds.length !== TECH_ROOTS.length) return false;
  if (config.rootNodeIds.some((id) => !TECH_ROOTS.includes(id))) return false;
  for (const id of config.activeNodeIds) {
    if (!techById.has(id)) return false;
  }
  return true;
};

const recomputeClusterBonusForPlayer = (player: Player): void => {
  void player;
};

const playerModBreakdown = (player: Player): StatsModBreakdown => {
  const breakdown: StatsModBreakdown = {
    attack: [{ label: "Base", mult: 1 }],
    defense: [{ label: "Base", mult: 1 }],
    income: [{ label: "Base", mult: 1 }],
    vision: [{ label: "Base", mult: 1 }]
  };
  for (const techId of player.techIds) {
    const tech = techById.get(techId);
    if (!tech?.mods) continue;
    if (tech.mods.attack && tech.mods.attack !== 1) breakdown.attack.push({ label: `Tech: ${tech.name}`, mult: tech.mods.attack });
    if (tech.mods.defense && tech.mods.defense !== 1) breakdown.defense.push({ label: `Tech: ${tech.name}`, mult: tech.mods.defense });
    if (tech.mods.income && tech.mods.income !== 1) breakdown.income.push({ label: `Tech: ${tech.name}`, mult: tech.mods.income });
    if (tech.mods.vision && tech.mods.vision !== 1) breakdown.vision.push({ label: `Tech: ${tech.name}`, mult: tech.mods.vision });
  }
  for (const domainId of player.domainIds) {
    const domain = domainById.get(domainId);
    if (!domain?.mods) continue;
    if (domain.mods.attack && domain.mods.attack !== 1) breakdown.attack.push({ label: `Domain: ${domain.name}`, mult: domain.mods.attack });
    if (domain.mods.defense && domain.mods.defense !== 1) breakdown.defense.push({ label: `Domain: ${domain.name}`, mult: domain.mods.defense });
    if (domain.mods.income && domain.mods.income !== 1) breakdown.income.push({ label: `Domain: ${domain.name}`, mult: domain.mods.income });
    if (domain.mods.vision && domain.mods.vision !== 1) breakdown.vision.push({ label: `Domain: ${domain.name}`, mult: domain.mods.vision });
  }

  for (const key of ["attack", "defense", "income", "vision"] as const) {
    const computed = breakdown[key].reduce((product, entry) => product * entry.mult, 1);
    const live = player.mods[key];
    if (Math.abs(computed - live) > 0.0001) {
      breakdown[key].push({ label: "Other", mult: live / Math.max(0.0001, computed) });
    }
  }
  return breakdown;
};

const recomputeTechModsFromOwnedTechs = (player: Player): void => {
  const depthMemo = new Map<string, number>();
  const depthOf = (id: string): number => {
    const cached = depthMemo.get(id);
    if (cached !== undefined) return cached;
    const t = techById.get(id);
    if (!t || !t.requires) {
      depthMemo.set(id, 0);
      return 0;
    }
    const d = depthOf(t.requires) + 1;
    depthMemo.set(id, d);
    return d;
  };

  const owned = [...player.techIds].sort((a, b) => depthOf(a) - depthOf(b));
  const rebuilt = { attack: 1, defense: 1, income: 1, vision: 1 };
  for (const id of owned) {
    const tech = techById.get(id);
    if (!tech?.mods) continue;
    if (tech.mods.attack) rebuilt.attack *= tech.mods.attack;
    if (tech.mods.defense) rebuilt.defense *= tech.mods.defense;
    if (tech.mods.income) rebuilt.income *= tech.mods.income;
    if (tech.mods.vision) rebuilt.vision *= tech.mods.vision;
  }
  for (const id of player.domainIds) {
    const domain = domainById.get(id);
    if (!domain?.mods) continue;
    if (domain.mods.attack) rebuilt.attack *= domain.mods.attack;
    if (domain.mods.defense) rebuilt.defense *= domain.mods.defense;
    if (domain.mods.income) rebuilt.income *= domain.mods.income;
    if (domain.mods.vision) rebuilt.vision *= domain.mods.vision;
  }

  player.mods.attack = rebuilt.attack;
  player.mods.defense = rebuilt.defense;
  player.mods.income = rebuilt.income;
  player.mods.vision = rebuilt.vision;
  playerBaseMods.set(player.id, rebuilt);
  recomputePlayerEffectsForPlayer(player);
  recomputeClusterBonusForPlayer(player);
  markVisibilityDirty(player.id);
};

const setClusterControlDelta = (playerId: string, clusterId: string, delta: number): void => {
  let byCluster = clusterControlledTilesByPlayer.get(playerId);
  if (!byCluster) {
    byCluster = new Map<string, number>();
    clusterControlledTilesByPlayer.set(playerId, byCluster);
  }
  byCluster.set(clusterId, (byCluster.get(clusterId) ?? 0) + delta);
  if ((byCluster.get(clusterId) ?? 0) <= 0) byCluster.delete(clusterId);
  const p = players.get(playerId);
  if (p) recomputeClusterBonusForPlayer(p);
};

const isNearMountain = (x: number, y: number, r = 4): boolean => {
  for (let dy = -r; dy <= r; dy += 1) {
    for (let dx = -r; dx <= r; dx += 1) {
      if (Math.abs(dx) + Math.abs(dy) > r) continue;
      const wx = wrapX(x + dx, WORLD_WIDTH);
      const wy = wrapY(y + dy, WORLD_HEIGHT);
      if (terrainAt(wx, wy) === "MOUNTAIN") return true;
    }
  }
  return false;
};

const clusterRuleMatch = (x: number, y: number, resource: ResourceType): boolean => {
  if (terrainAt(x, y) !== "LAND") return false;
  const biome = landBiomeAt(x, y);
  const shade = grassShadeAt(x, y);
  if (resource === "FISH") return biome === "COASTAL_SAND";
  if (resource === "IRON") return biome === "SAND" && isNearMountain(x, y, 4);
  if (resource === "GEMS") return biome === "SAND";
  if (resource === "FARM") return biome === "GRASS" && shade === "LIGHT";
  if (resource === "FUR") return biome === "GRASS" && shade === "LIGHT" && !isCoastalLand(x, y);
  return false;
};

const clusterRuleMatchRelaxed = (x: number, y: number, resource: ResourceType): boolean => {
  if (terrainAt(x, y) !== "LAND") return false;
  const biome = landBiomeAt(x, y);
  if (resource === "FISH") return biome === "COASTAL_SAND";
  if (resource === "IRON") return biome === "SAND";
  if (resource === "GEMS") return biome === "SAND";
  if (resource === "FARM") return biome === "GRASS";
  if (resource === "FUR") return biome === "GRASS";
  return false;
};

const resourcePlacementAllowed = (x: number, y: number, resource: ResourceType, relaxed = false): boolean =>
  relaxed ? clusterRuleMatchRelaxed(x, y, resource) : clusterRuleMatch(x, y, resource);

const nearestLandTiles = (
  originX: number,
  originY: number,
  candidates: Array<{ x: number; y: number }>,
  limit: number,
  predicate?: (tile: { x: number; y: number }) => boolean
): TileKey[] => {
  return candidates
    .filter((tile) => (predicate ? predicate(tile) : true))
    .sort((a, b) => {
      const adx = Math.min(Math.abs(a.x - originX), WORLD_WIDTH - Math.abs(a.x - originX));
      const ady = Math.min(Math.abs(a.y - originY), WORLD_HEIGHT - Math.abs(a.y - originY));
      const bdx = Math.min(Math.abs(b.x - originX), WORLD_WIDTH - Math.abs(b.x - originX));
      const bdy = Math.min(Math.abs(b.y - originY), WORLD_HEIGHT - Math.abs(b.y - originY));
      return adx + ady - (bdx + bdy);
    })
    .slice(0, limit)
    .map((tile) => key(tile.x, tile.y));
};

const collectClusterTiles = (cx: number, cy: number, resource: ResourceType, count: number): TileKey[] => {
  const out: TileKey[] = [];
  const q: Array<{ x: number; y: number; d: number }> = [{ x: cx, y: cy, d: 0 }];
  const seen = new Set<string>([key(cx, cy)]);
  const maxDist = 5;
  while (q.length > 0 && out.length < count) {
    const cur = q.shift()!;
    if (cur.d > maxDist) continue;
    const wx = wrapX(cur.x, WORLD_WIDTH);
    const wy = wrapY(cur.y, WORLD_HEIGHT);
    const tk = key(wx, wy);
    if (!clusterByTile.has(tk) && clusterRuleMatch(wx, wy, resource)) out.push(tk);
    const next = [
      [cur.x, cur.y - 1],
      [cur.x + 1, cur.y],
      [cur.x, cur.y + 1],
      [cur.x - 1, cur.y]
    ] as const;
    for (const [nx, ny] of next) {
      const nwx = wrapX(nx, WORLD_WIDTH);
      const nwy = wrapY(ny, WORLD_HEIGHT);
      const nk = key(nwx, nwy);
      if (seen.has(nk)) continue;
      seen.add(nk);
      q.push({ x: nwx, y: nwy, d: cur.d + 1 });
    }
  }
  return out.length >= count ? out.slice(0, count) : [];
};

const collectClusterTilesRelaxed = (cx: number, cy: number, resource: ResourceType, count: number): TileKey[] => {
  const out: TileKey[] = [];
  const q: Array<{ x: number; y: number; d: number }> = [{ x: cx, y: cy, d: 0 }];
  const seen = new Set<string>([key(cx, cy)]);
  const maxDist = 6;
  while (q.length > 0 && out.length < count) {
    const cur = q.shift()!;
    if (cur.d > maxDist) continue;
    const wx = wrapX(cur.x, WORLD_WIDTH);
    const wy = wrapY(cur.y, WORLD_HEIGHT);
    const tk = key(wx, wy);
    if (!clusterByTile.has(tk) && clusterRuleMatchRelaxed(wx, wy, resource)) out.push(tk);
    const next = [
      [cur.x, cur.y - 1],
      [cur.x + 1, cur.y],
      [cur.x, cur.y + 1],
      [cur.x - 1, cur.y]
    ] as const;
    for (const [nx, ny] of next) {
      const nwx = wrapX(nx, WORLD_WIDTH);
      const nwy = wrapY(ny, WORLD_HEIGHT);
      const nk = key(nwx, nwy);
      if (seen.has(nk)) continue;
      seen.add(nk);
      q.push({ x: nwx, y: nwy, d: cur.d + 1 });
    }
  }
  return out.length >= count ? out.slice(0, count) : [];
};

const generateClusters = (seed: number): void => {
  clusterByTile.clear();
  clustersById.clear();
  const clusterTileCount = 8;
  const clusterPlan: ResourceType[] = [
    ...Array.from({ length: 52 }, () => "FARM" as const),
    ...Array.from({ length: 52 }, () => "FUR" as const),
    ...Array.from({ length: 30 }, () => "GEMS" as const),
    ...Array.from({ length: 52 }, () => "IRON" as const),
    ...Array.from({ length: 52 }, () => "FISH" as const)
  ];

  const defByResource = new Map<ResourceType, (typeof clusterTypeDefs)[number]>();
  for (const def of clusterTypeDefs) defByResource.set(def.resourceType, def);

  const centers: Array<{ x: number; y: number }> = [];
  const minCenterDist = 9;
  let attemptSeed = 0;
  for (let i = 0; i < clusterPlan.length; i += 1) {
    const resource = clusterPlan[i]!;
    const def = defByResource.get(resource);
    if (!def) continue;
    let placed = false;
    for (let tries = 0; tries < 5000; tries += 1) {
      const cx = Math.floor(seeded01((attemptSeed + tries) * 31, (attemptSeed + tries) * 47, seed + 101) * WORLD_WIDTH);
      const cy = Math.floor(seeded01((attemptSeed + tries) * 53, (attemptSeed + tries) * 67, seed + 151) * WORLD_HEIGHT);
      if (!clusterRuleMatch(cx, cy, resource)) continue;
      const tooClose = centers.some((c) => {
        const dx = Math.min(Math.abs(c.x - cx), WORLD_WIDTH - Math.abs(c.x - cx));
        const dy = Math.min(Math.abs(c.y - cy), WORLD_HEIGHT - Math.abs(c.y - cy));
        return dx + dy < minCenterDist;
      });
      if (tooClose) continue;
      const tiles = collectClusterTiles(cx, cy, resource, clusterTileCount);
      if (tiles.length < clusterTileCount) continue;
      const clusterId = `cl-${clustersById.size}`;
      clustersById.set(clusterId, {
        clusterId,
        clusterType: def.type,
        resourceType: def.resourceType,
        centerX: cx,
        centerY: cy,
        radius: 3,
        controlThreshold: def.threshold
      });
      for (const tk of tiles) clusterByTile.set(tk, clusterId);
      centers.push({ x: cx, y: cy });
      placed = true;
      break;
    }
    attemptSeed += 911;
    if (!placed) {
      for (let tries = 0; tries < 3500; tries += 1) {
        const cx = Math.floor(seeded01((attemptSeed + tries) * 17, (attemptSeed + tries) * 29, seed + 701) * WORLD_WIDTH);
        const cy = Math.floor(seeded01((attemptSeed + tries) * 37, (attemptSeed + tries) * 43, seed + 751) * WORLD_HEIGHT);
        if (!clusterRuleMatchRelaxed(cx, cy, resource)) continue;
        const tiles = collectClusterTilesRelaxed(cx, cy, resource, clusterTileCount);
        if (tiles.length < clusterTileCount) continue;
        const clusterId = `cl-${clustersById.size}`;
        clustersById.set(clusterId, {
          clusterId,
          clusterType: def.type,
          resourceType: def.resourceType,
          centerX: cx,
          centerY: cy,
          radius: 3,
          controlThreshold: def.threshold
        });
        for (const tk of tiles) clusterByTile.set(tk, clusterId);
        placed = true;
        break;
      }
    }
  }
};

const applyClusterResources = (x: number, y: number, base: ResourceType | undefined): ResourceType | undefined => {
  const cid = clusterByTile.get(key(x, y));
  if (!cid) return base;
  const c = clustersById.get(cid);
  if (!c) return base;
  const resource = clusterResourceType(c);
  return resourcePlacementAllowed(x, y, resource, false) ? resource : base;
};

type DockCandidate = { x: number; y: number; componentId: number; seaX: number; seaY: number };
type LandComponentMeta = {
  id: number;
  tileCount: number;
  fallbackX: number;
  fallbackY: number;
  oceanCandidates: DockCandidate[];
};

const selectSpacedDockCandidates = (candidates: DockCandidate[], count: number, seed: number): DockCandidate[] => {
  if (count <= 0 || candidates.length === 0) return [];
  const pool = [...candidates];
  const startIdx = Math.floor(seeded01(seed + count, seed + pool.length, seed + 4123) * pool.length);
  const selected: DockCandidate[] = [pool[startIdx]!];
  while (selected.length < count && selected.length < pool.length) {
    let bestCandidate: DockCandidate | undefined;
    let bestDistance = Number.NEGATIVE_INFINITY;
    for (const candidate of pool) {
      if (selected.includes(candidate)) continue;
      let minDistance = Number.POSITIVE_INFINITY;
      for (const existing of selected) {
        const dx = Math.min(Math.abs(candidate.seaX - existing.seaX), WORLD_WIDTH - Math.abs(candidate.seaX - existing.seaX));
        const dy = Math.min(Math.abs(candidate.seaY - existing.seaY), WORLD_HEIGHT - Math.abs(candidate.seaY - existing.seaY));
        minDistance = Math.min(minDistance, dx + dy);
      }
      if (minDistance > bestDistance) {
        bestDistance = minDistance;
        bestCandidate = candidate;
      }
    }
    if (!bestCandidate) break;
    selected.push(bestCandidate);
  }
  return selected;
};
const analyzeLandComponentsForDocks = (
  seed: number,
  oceanMask: Uint8Array
): { components: LandComponentMeta[]; componentByIndex: Int32Array } => {
  const total = WORLD_WIDTH * WORLD_HEIGHT;
  const visited = new Uint8Array(total);
  const componentByIndex = new Int32Array(total);
  componentByIndex.fill(-1);
  const queue = new Int32Array(total);
  const out: LandComponentMeta[] = [];
  let componentId = 0;

  for (let y = 0; y < WORLD_HEIGHT; y += 1) {
    for (let x = 0; x < WORLD_WIDTH; x += 1) {
      const startIdx = worldIndex(x, y);
      if (visited[startIdx] || terrainAt(x, y) !== "LAND") continue;
      visited[startIdx] = 1;
      let head = 0;
      let tail = 0;
      queue[tail++] = startIdx;
      const comp: LandComponentMeta = { id: componentId, tileCount: 0, fallbackX: x, fallbackY: y, oceanCandidates: [] };

      while (head < tail) {
        const idx = queue[head++]!;
        componentByIndex[idx] = componentId;
        comp.tileCount += 1;
        const cx = idx % WORLD_WIDTH;
        const cy = Math.floor(idx / WORLD_WIDTH);
        if (seeded01(cx, cy, seed + 733) > 0.997) {
          comp.fallbackX = cx;
          comp.fallbackY = cy;
        }
        const ocean = adjacentOceanSea(cx, cy, oceanMask);
        if (ocean) {
          comp.oceanCandidates.push({
            x: cx,
            y: cy,
            componentId,
            seaX: ocean.x,
            seaY: ocean.y
          });
        }
        const neighbors: Array<[number, number]> = [
          [wrapX(cx, WORLD_WIDTH), wrapY(cy - 1, WORLD_HEIGHT)],
          [wrapX(cx + 1, WORLD_WIDTH), wrapY(cy, WORLD_HEIGHT)],
          [wrapX(cx, WORLD_WIDTH), wrapY(cy + 1, WORLD_HEIGHT)],
          [wrapX(cx - 1, WORLD_WIDTH), wrapY(cy, WORLD_HEIGHT)]
        ];
        for (const [nx, ny] of neighbors) {
          const nIdx = worldIndex(nx, ny);
          if (visited[nIdx] || terrainAt(nx, ny) !== "LAND") continue;
          visited[nIdx] = 1;
          queue[tail++] = nIdx;
        }
      }

      out.push(comp);
      componentId += 1;
    }
  }
  return { components: out, componentByIndex };
};

const generateDocks = (seed: number): void => {
  docksByTile.clear();
  dockById.clear();
  const oceanMask = largestSeaComponentMask();
  const { components, componentByIndex } = analyzeLandComponentsForDocks(seed, oceanMask);
  const eligibleComponents = components.filter((comp) => comp.tileCount >= 24 && comp.oceanCandidates.length > 0);
  const primaryDockCandidateByComponent = new Map<number, DockCandidate>();
  for (const comp of eligibleComponents) {
    const primary = selectSpacedDockCandidates(comp.oceanCandidates, 1, seed + comp.id * 17)[0];
    if (primary) primaryDockCandidateByComponent.set(comp.id, primary);
  }

  const componentIds = eligibleComponents.map((comp) => comp.id);
  const componentSeaDistance = (aComponentId: number, bComponentId: number): number => {
    const a = primaryDockCandidateByComponent.get(aComponentId);
    const b = primaryDockCandidateByComponent.get(bComponentId);
    if (!a || !b) return Number.POSITIVE_INFINITY;
    const dx = Math.min(Math.abs(a.seaX - b.seaX), WORLD_WIDTH - Math.abs(a.seaX - b.seaX));
    const dy = Math.min(Math.abs(a.seaY - b.seaY), WORLD_HEIGHT - Math.abs(a.seaY - b.seaY));
    return dx + dy;
  };

  const componentEdges: Array<[number, number]> = [];
  const componentEdgeKeys = new Set<string>();
  const addComponentEdge = (aComponentId: number, bComponentId: number): void => {
    if (aComponentId === bComponentId) return;
    const edgeKey = aComponentId < bComponentId ? `${aComponentId}|${bComponentId}` : `${bComponentId}|${aComponentId}`;
    if (componentEdgeKeys.has(edgeKey)) return;
    componentEdgeKeys.add(edgeKey);
    componentEdges.push([aComponentId, bComponentId]);
  };

  if (componentIds.length > 1) {
    const visitedComponents = new Set<number>([componentIds[0]!]);
    while (visitedComponents.size < componentIds.length) {
      let bestFrom = -1;
      let bestTo = -1;
      let bestDist = Number.POSITIVE_INFINITY;
      for (const fromComponentId of visitedComponents) {
        for (const toComponentId of componentIds) {
          if (visitedComponents.has(toComponentId)) continue;
          const dist = componentSeaDistance(fromComponentId, toComponentId);
          if (dist < bestDist) {
            bestDist = dist;
            bestFrom = fromComponentId;
            bestTo = toComponentId;
          }
        }
      }
      if (bestFrom < 0 || bestTo < 0) break;
      addComponentEdge(bestFrom, bestTo);
      visitedComponents.add(bestTo);
    }

    for (const componentId of componentIds) {
      const comp = eligibleComponents.find((candidate) => candidate.id === componentId);
      if (!comp || comp.tileCount >= LARGE_ISLAND_MULTI_DOCK_TILE_THRESHOLD) continue;
      let bestNeighbor = -1;
      let bestDist = Number.POSITIVE_INFINITY;
      for (const otherComponentId of componentIds) {
        if (otherComponentId === componentId) continue;
        const dist = componentSeaDistance(componentId, otherComponentId);
        if (dist < bestDist) {
          bestDist = dist;
          bestNeighbor = otherComponentId;
        }
      }
      if (bestNeighbor >= 0) addComponentEdge(componentId, bestNeighbor);
    }
  }

  const degreeByComponent = new Map<number, number>();
  for (const [aComponentId, bComponentId] of componentEdges) {
    degreeByComponent.set(aComponentId, (degreeByComponent.get(aComponentId) ?? 0) + 1);
    degreeByComponent.set(bComponentId, (degreeByComponent.get(bComponentId) ?? 0) + 1);
  }

  const selectedByComponent = new Map<number, DockCandidate[]>();
  for (const comp of eligibleComponents) {
    const desiredCount =
      comp.tileCount >= LARGE_ISLAND_MULTI_DOCK_TILE_THRESHOLD ? Math.max(2, degreeByComponent.get(comp.id) ?? 1) : 1;
    const picks = selectSpacedDockCandidates(comp.oceanCandidates, Math.min(desiredCount, comp.oceanCandidates.length), seed + comp.id * 97);
    if (picks.length > 0) selectedByComponent.set(comp.id, picks);
  }

  const selected = [...selectedByComponent.values()].flat();
  const docks: Dock[] = selected.map((s, i) => ({
    dockId: `dock-${i}`,
    tileKey: key(s.x, s.y),
    pairedDockId: "",
    connectedDockIds: [],
    cooldownUntil: 0
  }));

  const dockIndexByTileKey = new Map<TileKey, number>();
  const dockIndicesByComponent = new Map<number, number[]>();
  for (let i = 0; i < selected.length; i += 1) {
    dockIndexByTileKey.set(key(selected[i]!.x, selected[i]!.y), i);
    const componentId = selected[i]!.componentId;
    const indices = dockIndicesByComponent.get(componentId) ?? [];
    indices.push(i);
    dockIndicesByComponent.set(componentId, indices);
  }

  const edgeKeys = new Set<string>();
  const addDockConnection = (aIdx: number, bIdx: number): void => {
    if (aIdx === bIdx) return;
    const a = docks[aIdx]!;
    const b = docks[bIdx]!;
    const edgeKey = a.dockId < b.dockId ? `${a.dockId}|${b.dockId}` : `${b.dockId}|${a.dockId}`;
    if (edgeKeys.has(edgeKey)) return;
    edgeKeys.add(edgeKey);
    if (!a.connectedDockIds?.includes(b.dockId)) a.connectedDockIds = [...(a.connectedDockIds ?? []), b.dockId];
    if (!b.connectedDockIds?.includes(a.dockId)) b.connectedDockIds = [...(b.connectedDockIds ?? []), a.dockId];
    if (!a.pairedDockId) a.pairedDockId = b.dockId;
    if (!b.pairedDockId) b.pairedDockId = a.dockId;
  };

  const nextDockOffsetByComponent = new Map<number, number>();
  const dockIndexForEdge = (componentId: number): number | undefined => {
    const indices = dockIndicesByComponent.get(componentId);
    if (!indices || indices.length === 0) return undefined;
    const comp = eligibleComponents.find((candidate) => candidate.id === componentId);
    if (!comp || comp.tileCount < LARGE_ISLAND_MULTI_DOCK_TILE_THRESHOLD) return indices[0];
    const offset = nextDockOffsetByComponent.get(componentId) ?? 0;
    nextDockOffsetByComponent.set(componentId, offset + 1);
    return indices[Math.min(offset, indices.length - 1)];
  };

  for (const [aComponentId, bComponentId] of componentEdges) {
    const aIdx = dockIndexForEdge(aComponentId);
    const bIdx = dockIndexForEdge(bComponentId);
    if (aIdx === undefined || bIdx === undefined) continue;
    addDockConnection(aIdx, bIdx);
  }

  for (const d of docks) {
    if (!d.pairedDockId && (!d.connectedDockIds || d.connectedDockIds.length === 0)) continue;
    docksByTile.set(d.tileKey, d);
    dockById.set(d.dockId, d);
  }
};

const townTypeAt = (x: number, y: number): "MARKET" | "FARMING" | "ANCIENT" => {
  const region = regionTypeAtLocal(x, y);
  if (region === "FERTILE_PLAINS") return seeded01(x, y, activeSeason.worldSeed + 881) > 0.2 ? "FARMING" : "MARKET";
  if (region === "ANCIENT_HEARTLAND") return seeded01(x, y, activeSeason.worldSeed + 882) > 0.2 ? "ANCIENT" : "MARKET";
  if (region === "CRYSTAL_WASTES") return seeded01(x, y, activeSeason.worldSeed + 883) > 0.45 ? "ANCIENT" : "MARKET";
  if (region === "BROKEN_HIGHLANDS") return seeded01(x, y, activeSeason.worldSeed + 884) > 0.6 ? "ANCIENT" : "MARKET";

  const biome = landBiomeAt(x, y);
  if (biome === "GRASS") return seeded01(x, y, activeSeason.worldSeed + 882) > 0.7 ? "MARKET" : "FARMING";
  if (biome === "SAND") return seeded01(x, y, activeSeason.worldSeed + 883) > 0.7 ? "ANCIENT" : "MARKET";
  return seeded01(x, y, activeSeason.worldSeed + 884) > 0.5 ? "MARKET" : "ANCIENT";
};

const generateTowns = (seed: number): void => {
  townsByTile.clear();
  firstSpecialSiteCaptureClaimed.clear();
  const worldScale = (WORLD_WIDTH * WORLD_HEIGHT) / 1_000_000;
  const target = Math.max(70, Math.floor(180 * worldScale));
  const minSpacing = Math.max(5, Math.floor(Math.min(WORLD_WIDTH, WORLD_HEIGHT) * 0.018));
  const placed: Array<{ x: number; y: number }> = [];
  for (let i = 0; i < 120_000 && placed.length < target; i += 1) {
    const x = Math.floor(seeded01(i * 13, i * 17, seed + 9301) * WORLD_WIDTH);
    const y = Math.floor(seeded01(i * 19, i * 23, seed + 9311) * WORLD_HEIGHT);
    if (terrainAt(x, y) !== "LAND") continue;
    const tileKey = key(x, y);
    if (docksByTile.has(tileKey) || clusterByTile.has(tileKey)) continue;
    const tooClose = placed.some((p) => {
      const dx = Math.min(Math.abs(p.x - x), WORLD_WIDTH - Math.abs(p.x - x));
      const dy = Math.min(Math.abs(p.y - y), WORLD_HEIGHT - Math.abs(p.y - y));
      return dx + dy < minSpacing;
    });
    if (tooClose) continue;
    placed.push({ x, y });
    townsByTile.set(tileKey, {
      townId: `town-${townsByTile.size}`,
      tileKey,
      type: townTypeAt(x, y),
      population: POPULATION_MIN + Math.floor(seeded01(x, y, seed + 9601) * POPULATION_START_SPREAD),
      maxPopulation: POPULATION_MAX,
      connectedTownCount: 0,
      connectedTownBonus: 0,
      lastGrowthTickAt: now()
    });
  }
};

const canPlaceTownAt = (x: number, y: number, ignoreTileKey?: TileKey): boolean => {
  if (terrainAt(x, y) !== "LAND") return false;
  const tk = key(x, y);
  if (tk !== ignoreTileKey && townsByTile.has(tk)) return false;
  if (docksByTile.has(tk)) return false;
  if (clusterByTile.has(tk)) return false;
  return true;
};

const findNearestTownPlacement = (originX: number, originY: number, ignoreTileKey?: TileKey): TileKey | undefined => {
  if (canPlaceTownAt(originX, originY, ignoreTileKey)) return key(originX, originY);
  const maxRadius = Math.max(WORLD_WIDTH, WORLD_HEIGHT);
  for (let radius = 1; radius <= maxRadius; radius += 1) {
    for (let dy = -radius; dy <= radius; dy += 1) {
      for (let dx = -radius; dx <= radius; dx += 1) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) continue;
        const x = wrapX(originX + dx, WORLD_WIDTH);
        const y = wrapY(originY + dy, WORLD_HEIGHT);
        if (canPlaceTownAt(x, y, ignoreTileKey)) return key(x, y);
      }
    }
  }
  return undefined;
};

const normalizeTownPlacements = (): void => {
  const existingTowns = [...townsByTile.values()];
  townsByTile.clear();
  for (const town of existingTowns) {
    const [x, y] = parseKey(town.tileKey);
    const destinationKey = findNearestTownPlacement(x, y, town.tileKey);
    if (!destinationKey) continue;
    const [destX, destY] = parseKey(destinationKey);
    townsByTile.set(destinationKey, {
      ...town,
      tileKey: destinationKey,
      type: townTypeAt(destX, destY)
    });
  }
};

const TOWN_CAPTURE_SHOCK_MS = 10 * 60 * 1000;
const TOWN_CAPTURE_GROWTH_RADIUS = 20;

const applyTownCaptureShock = (tileKey: TileKey): void => {
  const [x, y] = parseKey(tileKey);
  const until = now() + TOWN_CAPTURE_SHOCK_MS;
  townCaptureShockUntilByTile.set(tileKey, until);
  for (const otherTownKey of townsByTile.keys()) {
    if (otherTownKey === tileKey) continue;
    const [ox, oy] = parseKey(otherTownKey);
    if (chebyshevDistance(ox, oy, x, y) > TOWN_CAPTURE_GROWTH_RADIUS) continue;
    const currentUntil = townGrowthShockUntilByTile.get(otherTownKey) ?? 0;
    townGrowthShockUntilByTile.set(otherTownKey, Math.max(currentUntil, until));
  }
};

const ensureBaselineEconomyCoverage = (seed: number): void => {
  const block = 30;
  for (let by = 0; by < WORLD_HEIGHT; by += block) {
    for (let bx = 0; bx < WORLD_WIDTH; bx += block) {
      const land: Array<{ x: number; y: number }> = [];
      let hasTown = false;
      let hasFood = false;

      for (let dy = 0; dy < block; dy += 1) {
        for (let dx = 0; dx < block; dx += 1) {
          const x = wrapX(bx + dx, WORLD_WIDTH);
          const y = wrapY(by + dy, WORLD_HEIGHT);
          if (terrainAt(x, y) !== "LAND") continue;
          const tk = key(x, y);
          land.push({ x, y });
          if (townsByTile.has(tk)) hasTown = true;
          const clusterId = clusterByTile.get(tk);
          const cluster = clusterId ? clustersById.get(clusterId) : undefined;
          if (cluster && (clusterResourceType(cluster) === "FARM" || clusterResourceType(cluster) === "FISH")) hasFood = true;
        }
      }

      if (land.length === 0) continue;

      if (!hasTown) {
        const picked = land.find((tile) => !docksByTile.has(key(tile.x, tile.y)) && !clusterByTile.has(key(tile.x, tile.y)) && !townsByTile.has(key(tile.x, tile.y)));
        if (picked) {
          townsByTile.set(key(picked.x, picked.y), {
            townId: `town-${townsByTile.size}`,
            tileKey: key(picked.x, picked.y),
            type: townTypeAt(picked.x, picked.y),
            population: POPULATION_MIN + Math.floor(seeded01(picked.x, picked.y, seed + 9601) * POPULATION_START_SPREAD),
            maxPopulation: POPULATION_MAX,
            connectedTownCount: 0,
            connectedTownBonus: 0,
            lastGrowthTickAt: now()
          });
        }
      }

      if (!hasFood) {
        const center = land[Math.floor(seeded01(bx + 3, by + 7, seed + 9501) * land.length)]!;
        const pickFoodTiles = (resource: ResourceType, relaxed: boolean): TileKey[] =>
          nearestLandTiles(center.x, center.y, land, 8, (tile) => {
            const tk = key(tile.x, tile.y);
            if (clusterByTile.has(tk) || docksByTile.has(tk) || townsByTile.has(tk)) return false;
            return resourcePlacementAllowed(tile.x, tile.y, resource, relaxed);
          });
        let resourceType: ResourceType | undefined;
        let foodTiles = pickFoodTiles("FARM", false);
        if (foodTiles.length >= 6) resourceType = "FARM";
        else {
          foodTiles = pickFoodTiles("FISH", false);
          if (foodTiles.length >= 6) resourceType = "FISH";
        }
        if (!resourceType) {
          foodTiles = pickFoodTiles("FARM", true);
          if (foodTiles.length >= 6) resourceType = "FARM";
          else {
            foodTiles = pickFoodTiles("FISH", true);
            if (foodTiles.length >= 6) resourceType = "FISH";
          }
        }
        if (foodTiles.length >= 6) {
          const clusterId = `cl-${clustersById.size}`;
          clustersById.set(clusterId, {
            clusterId,
            clusterType: resourceType === "FISH" ? "COASTAL_SHOALS" : "FERTILE_PLAINS",
            resourceType: resourceType ?? "FARM",
            centerX: center.x,
            centerY: center.y,
            radius: 3,
            controlThreshold: 3
          });
          for (const tk of foodTiles) clusterByTile.set(tk, clusterId);
        }
      }
    }
  }
};

const ensureInterestCoverage = (seed: number): void => {
  const block = 15;
  for (let by = 0; by < WORLD_HEIGHT; by += block) {
    for (let bx = 0; bx < WORLD_WIDTH; bx += block) {
      const land: Array<{ x: number; y: number }> = [];
      let interesting = false;
      for (let dy = 0; dy < block; dy += 1) {
        for (let dx = 0; dx < block; dx += 1) {
          const x = wrapX(bx + dx, WORLD_WIDTH);
          const y = wrapY(by + dy, WORLD_HEIGHT);
          if (terrainAt(x, y) !== "LAND") continue;
          const tk = key(x, y);
          land.push({ x, y });
          if (clusterByTile.has(tk) || docksByTile.has(tk) || townsByTile.has(tk)) interesting = true;
        }
      }
      if (interesting || land.length === 0) continue;
      let picked = land[Math.floor(seeded01(bx, by, seed + 9401) * land.length)]!;
      for (let i = 0; i < land.length; i += 1) {
        const cand = land[i]!;
        if (clusterByTile.has(key(cand.x, cand.y))) continue;
        if (docksByTile.has(key(cand.x, cand.y))) continue;
        picked = cand;
        break;
      }
      const tk = key(picked.x, picked.y);
      if (!townsByTile.has(tk) && !docksByTile.has(tk) && !clusterByTile.has(tk)) {
        townsByTile.set(tk, {
          townId: `town-${townsByTile.size}`,
          tileKey: tk,
          type: townTypeAt(picked.x, picked.y),
          population: POPULATION_MIN + Math.floor(seeded01(picked.x, picked.y, seed + 9601) * POPULATION_START_SPREAD),
          maxPopulation: POPULATION_MAX,
          connectedTownCount: 0,
          connectedTownBonus: 0,
          lastGrowthTickAt: now()
        });
      }
    }
  }
};

const townSupport = (townKey: TileKey, ownerId: string): { supportCurrent: number; supportMax: number } => {
  const [x, y] = parseKey(townKey);
  let supportCurrent = 0;
  let supportMax = 0;
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      if (dx === 0 && dy === 0) continue;
      const nx = wrapX(x + dx, WORLD_WIDTH);
      const ny = wrapY(y + dy, WORLD_HEIGHT);
      if (terrainAt(nx, ny) !== "LAND") continue;
      supportMax += 1;
      const nk = key(nx, ny);
      if (ownership.get(nk) !== ownerId) continue;
      if (ownershipStateByTile.get(nk) !== "SETTLED") continue;
      supportCurrent += 1;
    }
  }
  return { supportCurrent, supportMax };
};

const townPopulationTier = (population: number): PopulationTier => {
  if (population >= 5_000_000) return "METROPOLIS";
  if (population >= 1_000_000) return "GREAT_CITY";
  if (population >= 100_000) return "CITY";
  return "TOWN";
};

const townPopulationMultiplier = (population: number): number => {
  const tier = townPopulationTier(population);
  if (tier === "CITY") return 1.5;
  if (tier === "GREAT_CITY") return 2.5;
  if (tier === "METROPOLIS") return 3.2;
  return 1;
};

const activeStructureAt = (tileKey: TileKey, ownerId: string | undefined, type: EconomicStructureType): boolean => {
  const structure = economicStructuresByTile.get(tileKey);
  return Boolean(structure && structure.type === type && ownerId && structure.ownerId === ownerId && structure.status === "active");
};

const ownedStructureAt = (tileKey: TileKey, ownerId: string | undefined, type: EconomicStructureType): boolean => {
  const structure = economicStructuresByTile.get(tileKey);
  return Boolean(structure && structure.type === type && ownerId && structure.ownerId === ownerId);
};

const ownedTownKeysForPlayer = (playerId: string): TileKey[] =>
  [...townsByTile.values()]
    .filter((town) => ownership.get(town.tileKey) === playerId && ownershipStateByTile.get(town.tileKey) === "SETTLED")
    .sort((a, b) => a.townId.localeCompare(b.townId))
    .map((town) => town.tileKey);

const firstThreeTownKeySetForPlayer = (playerId: string): Set<TileKey> => {
  return new Set(ownedTownKeysForPlayer(playerId).slice(0, 3));
};

const townMaxPopulationForOwner = (town: TownDefinition, ownerId: string | undefined): number => {
  if (!ownerId) return POPULATION_MAX;
  const effects = getPlayerEffectsForPlayer(ownerId);
  if (effects.populationCapFirst3TownsMult <= 1) return POPULATION_MAX;
  const featured = ownedTownKeysForPlayer(ownerId).slice(0, 3);
  return featured.includes(town.tileKey) ? Math.round(POPULATION_MAX * effects.populationCapFirst3TownsMult) : POPULATION_MAX;
};

const connectedTownStepCount = (connectedTownCount: number): number => Math.max(0, Math.min(3, connectedTownCount));

const connectedTownBonusForOwner = (connectedTownCount: number, ownerId: string | undefined): number => {
  const stepCount = connectedTownStepCount(connectedTownCount);
  if (stepCount <= 0) return 0;
  const baseSteps = [0.5, 0.4, 0.3];
  const effects = ownerId ? getPlayerEffectsForPlayer(ownerId) : emptyPlayerEffects();
  const extraPerStep = effects.connectedTownStepBonusAdd;
  let total = 0;
  for (let index = 0; index < stepCount; index += 1) total += baseSteps[index]! + extraPerStep;
  return total;
};

const computeTownFeedingState = (
  playerId: string,
  availableFood: number
): { foodCoverage: number; fedTownKeys: Set<TileKey> } => {
  const player = players.get(playerId);
  if (!player) {
    return {
      foodCoverage: foodUpkeepCoverageByPlayer.get(playerId) ?? 1,
      fedTownKeys: new Set()
    };
  }

  const effects = getPlayerEffectsForPlayer(playerId);
  const townKeys = ownedTownKeysForPlayer(playerId);
  let upkeepNeed = 0;
  for (const townKey of townKeys) {
    const town = townsByTile.get(townKey);
    if (!town) continue;
    upkeepNeed += townFoodUpkeepPerMinute(town) * effects.townFoodUpkeepMult;
  }
  let remainingFood = Math.max(0, availableFood);
  const fedTownKeys = new Set<TileKey>();
  for (const townKey of townKeys) {
    const town = townsByTile.get(townKey);
    if (!town) continue;
    const townNeed = townFoodUpkeepPerMinute(town) * effects.townFoodUpkeepMult;
    if (townNeed <= 0) {
      fedTownKeys.add(townKey);
      continue;
    }
    if (remainingFood + 1e-9 < townNeed) continue;
    fedTownKeys.add(townKey);
    remainingFood = Math.max(0, remainingFood - townNeed);
  }
  const foodCoverage = upkeepNeed <= 0 ? 1 : Math.max(0, Math.min(1, Math.max(0, availableFood) / upkeepNeed));
  return { foodCoverage, fedTownKeys };
};

const townFeedingStateForPlayer = (
  playerId: string
): { foodCoverage: number; fedTownKeys: Set<TileKey> } => {
  const cached = townFeedingStateByPlayer.get(playerId);
  if (cached) return cached;
  const player = players.get(playerId);
  if (!player) {
    return {
      foodCoverage: foodUpkeepCoverageByPlayer.get(playerId) ?? 1,
      fedTownKeys: new Set()
    };
  }
  const stock = getOrInitStrategicStocks(playerId);
  return computeTownFeedingState(playerId, Math.max(0, stock.FOOD ?? 0) + availableYieldStrategicForPlayer(player, "FOOD"));
};

const isTownFedForOwner = (townKey: TileKey, ownerId: string | undefined): boolean => {
  if (!ownerId) return false;
  return townFeedingStateForPlayer(ownerId).fedTownKeys.has(townKey);
};

const townIncomeSuppressed = (townKey: TileKey): boolean => (townCaptureShockUntilByTile.get(townKey) ?? 0) > now();

const townGrowthSuppressed = (townKey: TileKey): boolean =>
  (townCaptureShockUntilByTile.get(townKey) ?? 0) > now() || (townGrowthShockUntilByTile.get(townKey) ?? 0) > now();

const marketIncomeMultiplierAt = (tileKey: TileKey, ownerId: string | undefined): number => {
  if (!activeStructureAt(tileKey, ownerId, "MARKET") || !isTownFedForOwner(tileKey, ownerId)) return 1;
  const effects = ownerId ? getPlayerEffectsForPlayer(ownerId) : emptyPlayerEffects();
  return 1 + effects.marketIncomeBonusAdd;
};

const marketCapMultiplierAt = (tileKey: TileKey, ownerId: string | undefined): number => {
  if (!activeStructureAt(tileKey, ownerId, "MARKET") || !isTownFedForOwner(tileKey, ownerId)) return 1;
  const effects = ownerId ? getPlayerEffectsForPlayer(ownerId) : emptyPlayerEffects();
  return 1 + effects.marketCapBonusAdd;
};

const granaryCapMultiplierAt = (tileKey: TileKey, ownerId: string | undefined): number => {
  if (!activeStructureAt(tileKey, ownerId, "GRANARY")) return 1;
  const effects = ownerId ? getPlayerEffectsForPlayer(ownerId) : emptyPlayerEffects();
  return 1 + effects.granaryCapBonusAdd;
};

const dockConnectedOwnedSettledCount = (dock: Dock, ownerId: string | undefined): number => {
  if (!ownerId) return 0;
  const linkedDockIds = dock.connectedDockIds?.length ? dock.connectedDockIds : [dock.pairedDockId];
  let count = 0;
  for (const dockId of linkedDockIds) {
    const linked = dockById.get(dockId);
    if (!linked) continue;
    if (ownership.get(linked.tileKey) !== ownerId) continue;
    if (ownershipStateByTile.get(linked.tileKey) !== "SETTLED") continue;
    count += 1;
  }
  return count;
};

const dockIncomeForOwner = (dock: Dock, ownerId: string | undefined): number => {
  if (!ownerId) return 0;
  if (ownership.get(dock.tileKey) !== ownerId) return 0;
  if (ownershipStateByTile.get(dock.tileKey) !== "SETTLED") return 0;
  const effects = getPlayerEffectsForPlayer(ownerId);
  const connectionCount = dockConnectedOwnedSettledCount(dock, ownerId);
  return DOCK_INCOME_PER_MIN * effects.dockGoldOutputMult * (1 + effects.dockConnectionBonusPerLink * connectionCount);
};

const dockCapForOwner = (dock: Dock, ownerId: string | undefined): number => {
  if (!ownerId) return TILE_YIELD_CAP_GOLD;
  return dockIncomeForOwner(dock, ownerId) * 60 * 8 * getPlayerEffectsForPlayer(ownerId).dockGoldCapMult;
};

const townIncomeForOwner = (town: TownDefinition, ownerId: string | undefined): number => {
  if (!ownerId) return 0;
  if (ownership.get(town.tileKey) !== ownerId) return 0;
  if (ownershipStateByTile.get(town.tileKey) !== "SETTLED") return 0;
  if (townIncomeSuppressed(town.tileKey)) return 0;
  const { supportCurrent, supportMax } = townSupport(town.tileKey, ownerId);
  const supportRatio = supportMax <= 0 ? 1 : supportCurrent / supportMax;
  if (!isTownFedForOwner(town.tileKey, ownerId)) return 0;
  const effects = getPlayerEffectsForPlayer(ownerId);
  return (
    TOWN_BASE_GOLD_PER_MIN *
    supportRatio *
    townPopulationMultiplier(town.population) *
    (1 + town.connectedTownBonus) *
    marketIncomeMultiplierAt(town.tileKey, ownerId) *
    effects.townGoldOutputMult *
    effects.populationIncomeMult
  );
};

const townCapForOwner = (town: TownDefinition, ownerId: string | undefined): number => {
  if (!ownerId) return TILE_YIELD_CAP_GOLD;
  const effects = getPlayerEffectsForPlayer(ownerId);
  const income = townIncomeForOwner(town, ownerId);
  return income * 60 * 8 * effects.townGoldCapMult * marketCapMultiplierAt(town.tileKey, ownerId) * granaryCapMultiplierAt(town.tileKey, ownerId);
};

const settledLandKeysForPlayer = (playerId: string): Set<TileKey> => {
  const settledLand = new Set<TileKey>();
  for (const tk of players.get(playerId)?.territoryTiles ?? []) {
    if (ownershipStateByTile.get(tk) === "SETTLED" && terrainAtRuntime(...parseKey(tk)) === "LAND") settledLand.add(tk);
  }
  return settledLand;
};

const directlyConnectedTownKeysForTown = (playerId: string, originTownKey: TileKey, settledLand = settledLandKeysForPlayer(playerId)): TileKey[] => {
  if (!settledLand.has(originTownKey)) return [];
  const ownedTownKeySet = new Set(ownedTownKeysForPlayer(playerId));
  const queue = [originTownKey];
  const visited = new Set<TileKey>([originTownKey]);
  const connectedTowns = new Set<TileKey>();
  while (queue.length > 0) {
    const current = queue.shift()!;
    const [cx, cy] = parseKey(current);
    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        if (dx === 0 && dy === 0) continue;
        const nextKey = key(wrapX(cx + dx, WORLD_WIDTH), wrapY(cy + dy, WORLD_HEIGHT));
        if (!settledLand.has(nextKey) || visited.has(nextKey)) continue;
        if (ownedTownKeySet.has(nextKey) && nextKey !== originTownKey) {
          connectedTowns.add(nextKey);
          visited.add(nextKey);
          continue;
        }
        visited.add(nextKey);
        queue.push(nextKey);
      }
    }
  }
  return [...connectedTowns];
};

const recomputeTownNetworkForPlayer = (playerId: string): void => {
  const settledLand = settledLandKeysForPlayer(playerId);
  for (const townKey of ownedTownKeysForPlayer(playerId)) {
    const town = townsByTile.get(townKey);
    if (!town) continue;
    const connectedTownCount = directlyConnectedTownKeysForTown(playerId, townKey, settledLand).length;
    town.connectedTownCount = connectedTownCount;
    town.connectedTownBonus = connectedTownBonusForOwner(connectedTownCount, playerId);
  }
};

const townFoodUpkeepPerMinute = (town: TownDefinition): number => {
  const base = 0.1;
  const tier = townPopulationTier(town.population);
  if (tier === "CITY") return base * 2;
  if (tier === "GREAT_CITY") return base * 4;
  if (tier === "METROPOLIS") return base * 8;
  return base;
};

const pausePopulationGrowthFromWar = (playerId: string): void => {
  const effects = getPlayerEffectsForPlayer(playerId);
  const pauseMs = Math.round(GROWTH_PAUSE_MS * effects.growthPauseDurationMult);
  const currentUntil = growthPausedUntilByPlayer.get(playerId) ?? 0;
  const baseUntil = Math.max(now(), currentUntil);
  growthPausedUntilByPlayer.set(playerId, Math.min(now() + GROWTH_PAUSE_MAX_MS, baseUntil + pauseMs));
};

const updateTownPopulationForPlayer = (player: Player): Set<TileKey> => {
  const touched = new Set<TileKey>();
  const nowMs = now();
  const growthPausedUntil = growthPausedUntilByPlayer.get(player.id) ?? 0;
  const warFactor = nowMs < growthPausedUntil ? 0 : 1;
  for (const tk of ownedTownKeysForPlayer(player.id)) {
    const town = townsByTile.get(tk);
    if (!town) continue;
    const elapsedMinutes = Math.max(1, Math.floor((nowMs - town.lastGrowthTickAt) / POPULATION_GROWTH_TICK_MS));
    town.lastGrowthTickAt = nowMs;
    town.maxPopulation = townMaxPopulationForOwner(town, player.id);
    if (!isTownFedForOwner(tk, player.id) || warFactor <= 0 || townGrowthSuppressed(tk)) continue;
    const firstThreeTownKeys = firstThreeTownKeySetForPlayer(player.id);
    const growthMult =
      getPlayerEffectsForPlayer(player.id).populationGrowthMult *
      (firstThreeTownKeys.has(town.tileKey) ? getPlayerEffectsForPlayer(player.id).firstThreeTownsPopulationGrowthMult : 1);
    const growth =
      town.population *
      POPULATION_GROWTH_BASE_RATE *
      growthMult *
      (1 - town.population / Math.max(1, town.maxPopulation)) *
      elapsedMinutes;
    if (growth <= 0) continue;
    town.population = Math.min(town.maxPopulation, town.population + growth);
    touched.add(tk);
  }
  return touched;
};

const townPopulationGrowthPerMinuteForOwner = (town: TownDefinition, ownerId: string | undefined): number => {
  if (!ownerId) return 0;
  if (ownership.get(town.tileKey) !== ownerId) return 0;
  if (ownershipStateByTile.get(town.tileKey) !== "SETTLED") return 0;
  const growthPausedUntil = growthPausedUntilByPlayer.get(ownerId) ?? 0;
  if (!isTownFedForOwner(town.tileKey, ownerId) || now() < growthPausedUntil || townGrowthSuppressed(town.tileKey)) return 0;
  const effects = getPlayerEffectsForPlayer(ownerId);
  const firstThreeTownKeys = firstThreeTownKeySetForPlayer(ownerId);
  const growthMult = effects.populationGrowthMult * (firstThreeTownKeys.has(town.tileKey) ? effects.firstThreeTownsPopulationGrowthMult : 1);
  const logisticFactor = 1 - town.population / Math.max(1, town.maxPopulation);
  if (logisticFactor <= 0) return 0;
  return town.population * POPULATION_GROWTH_BASE_RATE * growthMult * logisticFactor;
};

const tileYieldCapsFor = (tileKey: TileKey, ownerId: string | undefined): { gold: number; strategicEach: number } => {
  const effects = ownerId ? getPlayerEffectsForPlayer(ownerId) : emptyPlayerEffects();
  if (!ownerId) {
    return {
      gold: TILE_YIELD_CAP_GOLD * effects.harvestCapMult,
      strategicEach: TILE_YIELD_CAP_RESOURCE * effects.harvestCapMult
    };
  }
  const [x, y] = parseKey(tileKey);
  const resource = resourceAt(x, y);
  const dock = docksByTile.get(tileKey);
  const town = townsByTile.get(tileKey);
  const sabotageMult = sabotageMultiplierAt(tileKey);
  const goldPerMinute =
    ((players.get(ownerId)?.capitalTileKey === tileKey ? BASE_GOLD_PER_MIN : 0) +
      (resource ? (resourceRate[resource] ?? 0) * sabotageMult : 0) +
      (dock ? dockIncomeForOwner(dock, ownerId) : 0) +
      (town ? townIncomeForOwner(town, ownerId) * sabotageMult : 0)) *
    (players.get(ownerId)?.mods.income ?? 1) *
    PASSIVE_INCOME_MULT *
    HARVEST_GOLD_RATE_MULT;
  const strategicResource = toStrategicResource(resource);
  const strategicBaseDaily = strategicResource && resource ? (strategicDailyFromResource[resource] ?? 0) : 0;
  const fallbackGoldCap = TILE_YIELD_CAP_GOLD * effects.harvestCapMult;
  const fallbackResourceCap = TILE_YIELD_CAP_RESOURCE * effects.harvestCapMult;
  return {
    gold: town
      ? townCapForOwner(town, ownerId)
      : dock
        ? dockCapForOwner(dock, ownerId)
        : goldPerMinute > 0
          ? goldPerMinute * 60 * 8
          : fallbackGoldCap,
    strategicEach: strategicBaseDaily > 0 ? strategicBaseDaily / 3 : fallbackResourceCap
  };
};

const claimFirstSpecialSiteCaptureBonus = (player: Player, x: number, y: number): number => {
  const tk = key(x, y);
  if (firstSpecialSiteCaptureClaimed.has(tk)) return 0;
  const town = townsByTile.get(tk);
  if (!town) return 0;
  const eligible = town.type === "ANCIENT" || town.type === "MARKET"; // "market" represents camps in prototype.
  if (!eligible) return 0;
  firstSpecialSiteCaptureClaimed.add(tk);
  player.points += FIRST_SPECIAL_SITE_CAPTURE_GOLD;
  recalcPlayerDerived(player);
  return FIRST_SPECIAL_SITE_CAPTURE_GOLD;
};

const worldLooksBland = (): boolean => {
  const step = 15;
  let checkedBlocks = 0;
  let blandBlocks = 0;
  for (let y = 0; y < WORLD_HEIGHT; y += step) {
    for (let x = 0; x < WORLD_WIDTH; x += step) {
      let land = 0;
      let nearBarrier = 0;
      let nearHook = 0;
      for (let dy = 0; dy < step; dy += 1) {
        for (let dx = 0; dx < step; dx += 1) {
          const wx = wrapX(x + dx, WORLD_WIDTH);
          const wy = wrapY(y + dy, WORLD_HEIGHT);
          const tt = terrainAt(wx, wy);
          if (tt !== "LAND") continue;
          land += 1;
          const neighbors: Array<[number, number]> = [
            [wx, wrapY(wy - 1, WORLD_HEIGHT)],
            [wrapX(wx + 1, WORLD_WIDTH), wy],
            [wx, wrapY(wy + 1, WORLD_HEIGHT)],
            [wrapX(wx - 1, WORLD_WIDTH), wy]
          ];
          if (neighbors.some(([nx, ny]) => terrainAt(nx, ny) !== "LAND")) nearBarrier += 1;
          const tk = key(wx, wy);
          if (clusterByTile.has(tk) || townsByTile.has(tk) || docksByTile.has(tk)) nearHook += 1;
        }
      }
      checkedBlocks += 1;
      if (land < step * step * 0.45) continue;
      const barrierRatio = nearBarrier / Math.max(1, land);
      const hookRatio = nearHook / Math.max(1, land);
      if (barrierRatio < 0.08 && hookRatio < 0.02) blandBlocks += 1;
    }
  }
  return blandBlocks > checkedBlocks * 0.22;
};

const regenerateStrategicWorld = (initialSeed: number): number => {
  let seed = initialSeed;
  for (let i = 0; i < 8; i += 1) {
    setWorldSeed(seed);
    generateClusters(seed);
    generateDocks(seed);
    generateTowns(seed);
    ensureBaselineEconomyCoverage(seed);
    ensureInterestCoverage(seed);
    normalizeTownPlacements();
    if (!worldLooksBland()) return seed;
    seed = Math.floor(seeded01(seed + i * 101, seed + i * 137, seed + 9001) * 1_000_000_000);
  }
  return seed;
};

const dockLinkedDestinations = (fromDock: Dock): Dock[] => {
  const out: Dock[] = [];
  const seen = new Set<string>();
  for (const dockId of fromDock.connectedDockIds ?? []) {
    const linked = dockById.get(dockId);
    if (!linked || seen.has(linked.dockId)) continue;
    out.push(linked);
    seen.add(linked.dockId);
  }
  if (seen.size === 0 && fromDock.pairedDockId) {
    const direct = dockById.get(fromDock.pairedDockId);
    if (direct) {
      out.push(direct);
      seen.add(direct.dockId);
    }
    for (const d of dockById.values()) {
      if (d.dockId === fromDock.dockId) continue;
      if (d.pairedDockId !== fromDock.dockId) continue;
      if (seen.has(d.dockId)) continue;
      out.push(d);
      seen.add(d.dockId);
    }
  }
  return out;
};

const validDockCrossingTarget = (fromDock: Dock, toX: number, toY: number, allowAdjacentToDock = true): boolean => {
  const linked = dockLinkedDestinations(fromDock);
  for (const targetDock of linked) {
    const [px, py] = parseKey(targetDock.tileKey);
    if (toX === px && toY === py) return true;
    if (allowAdjacentToDock && isAdjacentTile(px, py, toX, toY)) return true;
  }
  return false;
};

const findOwnedDockOriginForCrossing = (
  actor: Player,
  toX: number,
  toY: number,
  allowAdjacentToDock = true
): Tile | undefined => {
  for (const tk of actor.territoryTiles) {
    const dock = docksByTile.get(tk);
    if (!dock) continue;
    const [x, y] = parseKey(tk);
    const t = playerTile(x, y);
    if (t.ownerId !== actor.id || t.terrain !== "LAND") continue;
    if (validDockCrossingTarget(dock, toX, toY, allowAdjacentToDock)) return t;
  }
  return undefined;
};

const adjacentNeighbors = (x: number, y: number): Tile[] => [
  playerTile(x, y - 1),
  playerTile(x + 1, y),
  playerTile(x, y + 1),
  playerTile(x - 1, y),
  playerTile(x - 1, y - 1),
  playerTile(x + 1, y - 1),
  playerTile(x + 1, y + 1),
  playerTile(x - 1, y + 1)
];

const isOccupiedPlayerTile = (tile: Tile): boolean => {
  if (!tile.ownerId) return false;
  if (tile.ownerId === BARBARIAN_OWNER_ID) return false;
  const state = tile.ownershipState ?? "SETTLED";
  return state === "FRONTIER" || state === "SETTLED";
};

const isValuableTile = (tile: Tile): boolean =>
  Boolean(tile.resource || tile.town || tile.fort || tile.siegeOutpost || tile.dockId);

const isBarbarianPriorityValueTile = (tile: Tile): boolean =>
  Boolean(tile.resource || tile.town || tile.siegeOutpost || tile.dockId);

const getBarbarianTargetPriority = (tile: Tile): number | null => {
  if (tile.terrain !== "LAND") return null;
  if (tile.fort) return null;
  if (!tile.ownerId) return isBarbarianPriorityValueTile(tile) ? 5 : 6;
  if (!isOccupiedPlayerTile(tile)) return null;
  const state = tile.ownershipState ?? "SETTLED";
  const highValue = isBarbarianPriorityValueTile(tile);
  if (state === "FRONTIER") return highValue ? 1 : 2;
  return highValue ? 3 : 4;
};

const removeBarbarianAgent = (agentId: string): void => {
  const agent = barbarianAgents.get(agentId);
  if (!agent) return;
  barbarianAgents.delete(agentId);
  barbarianAgentByTileKey.delete(key(agent.x, agent.y));
};

const removeBarbarianAtTile = (tileKey: TileKey): void => {
  const agentId = barbarianAgentByTileKey.get(tileKey);
  if (!agentId) return;
  removeBarbarianAgent(agentId);
};

const upsertBarbarianAgent = (agent: BarbarianAgent): void => {
  const existing = barbarianAgents.get(agent.id);
  if (existing) {
    barbarianAgentByTileKey.delete(key(existing.x, existing.y));
  }
  barbarianAgents.set(agent.id, agent);
  barbarianAgentByTileKey.set(key(agent.x, agent.y), agent.id);
};

const spawnBarbarianAgentAt = (x: number, y: number, progress = 0): BarbarianAgent => {
  const agent: BarbarianAgent = {
    id: `barb-${crypto.randomUUID()}`,
    x,
    y,
    progress,
    lastActionAt: now(),
    nextActionAt: now() + BARBARIAN_ACTION_INTERVAL_MS
  };
  upsertBarbarianAgent(agent);
  return agent;
};

const isNearPlayerTerritory = (x: number, y: number, radius: number): boolean => {
  for (let dy = -radius; dy <= radius; dy += 1) {
    for (let dx = -radius; dx <= radius; dx += 1) {
      const t = playerTile(x + dx, y + dy);
      if (t.ownerId && t.ownerId !== BARBARIAN_OWNER_ID) return true;
    }
  }
  return false;
};

const spawnInitialBarbarians = (): void => {
  const worldScale = (WORLD_WIDTH * WORLD_HEIGHT) / 1_000_000;
  const target = Math.max(20, Math.floor(INITIAL_BARBARIAN_COUNT * worldScale));
  let spawned = 0;
  let attempts = 0;
  while (spawned < target && attempts < target * 200) {
    attempts += 1;
    const x = Math.floor(Math.random() * WORLD_WIDTH);
    const y = Math.floor(Math.random() * WORLD_HEIGHT);
    const tk = key(x, y);
    const t = playerTile(x, y);
    if (t.terrain !== "LAND") continue;
    if (t.ownerId) continue;
    if (t.town || t.dockId || t.fort || t.siegeOutpost) continue;
    if (isNearPlayerTerritory(x, y, 2)) continue;
    updateOwnership(x, y, BARBARIAN_OWNER_ID, "BARBARIAN");
    spawnBarbarianAgentAt(x, y);
    spawned += 1;
  }
};

const isOutOfSightOfAllPlayers = (x: number, y: number): boolean => {
  for (const p of players.values()) {
    if (visible(p, x, y)) return false;
  }
  return true;
};

const isValidBarbarianSpawnTile = (x: number, y: number): boolean => {
  const t = playerTile(x, y);
  if (t.terrain !== "LAND") return false;
  if (t.ownerId) return false;
  if (t.town || t.dockId || t.fort || t.siegeOutpost) return false;
  return true;
};

const maintainBarbarianPopulation = (): void => {
  if (!hasOnlinePlayers()) return;
  const deficit = Math.max(0, MIN_ACTIVE_BARBARIAN_AGENTS - barbarianAgents.size);
  if (deficit <= 0) return;
  const wanted = Math.min(deficit, BARBARIAN_MAINTENANCE_MAX_SPAWNS_PER_PASS);
  let spawned = 0;
  let attempts = 0;
  const maxAttempts = wanted * 600;
  while (spawned < wanted && attempts < maxAttempts) {
    attempts += 1;
    const x = Math.floor(Math.random() * WORLD_WIDTH);
    const y = Math.floor(Math.random() * WORLD_HEIGHT);
    if (!isValidBarbarianSpawnTile(x, y)) continue;
    if (!isOutOfSightOfAllPlayers(x, y)) continue;
    updateOwnership(x, y, BARBARIAN_OWNER_ID, "BARBARIAN");
    spawnBarbarianAgentAt(x, y, 0);
    spawned += 1;
    logBarbarianEvent(`spawn maintenance @ ${x},${y}`);
  }
};

const getBarbarianProgressGain = (tile: Tile): number => (isOccupiedPlayerTile(tile) && isValuableTile(tile) ? 2 : 1);

const barbarianDefenseScore = (tile: Tile): number => {
  if (!tile.ownerId || tile.ownerId === BARBARIAN_OWNER_ID) return 0;
  const defender = players.get(tile.ownerId);
  if (!defender) return 10;
  const tk = key(tile.x, tile.y);
  const fortMult = fortDefenseMultAt(defender.id, tk);
  const dockMult = docksByTile.has(tk) ? DOCK_DEFENSE_MULT : 1;
  return (
    10 *
    defender.mods.defense *
    playerDefensiveness(defender) *
    fortMult *
    dockMult *
    settledDefenseMultiplierForTarget(defender.id, tile) *
    ownershipDefenseMultiplierForTarget(tile)
  );
};

const chooseBarbarianTarget = (agent: BarbarianAgent): Tile | undefined => {
  const candidates = adjacentNeighbors(agent.x, agent.y)
    .map((tile) => ({
      tile,
      priority: getBarbarianTargetPriority(tile),
      defenseScore: barbarianDefenseScore(tile),
      random: Math.random()
    }))
    .filter((entry) => entry.priority !== null) as Array<{ tile: Tile; priority: number; defenseScore: number; random: number }>;
  if (candidates.length === 0) return undefined;
  candidates.sort((a, b) => {
    if (a.priority !== b.priority) return a.priority - b.priority;
    if (a.defenseScore !== b.defenseScore) return a.defenseScore - b.defenseScore;
    return a.random - b.random;
  });
  return candidates[0]?.tile;
};

const exportDockPairs = (): Array<{ ax: number; ay: number; bx: number; by: number }> => {
  const out: Array<{ ax: number; ay: number; bx: number; by: number }> = [];
  const seen = new Set<string>();
  for (const d of dockById.values()) {
    const linkedDockIds = d.connectedDockIds?.length ? d.connectedDockIds : d.pairedDockId ? [d.pairedDockId] : [];
    for (const dockId of linkedDockIds) {
      const pair = dockById.get(dockId);
      if (!pair) continue;
      const edgeKey = d.dockId < pair.dockId ? `${d.dockId}|${pair.dockId}` : `${pair.dockId}|${d.dockId}`;
      if (seen.has(edgeKey)) continue;
      seen.add(edgeKey);
      const [ax, ay] = parseKey(d.tileKey);
      const [bx, by] = parseKey(pair.tileKey);
      out.push({ ax, ay, bx, by });
    }
  }
  return out;
};

const applyBreachShockAround = (x: number, y: number, defenderId: string): void => {
  const neighbors: Array<[number, number]> = [
    [x, y - 1],
    [x + 1, y],
    [x, y + 1],
    [x - 1, y]
  ];
  for (const [nxRaw, nyRaw] of neighbors) {
    const nx = wrapX(nxRaw, WORLD_WIDTH);
    const ny = wrapY(nyRaw, WORLD_HEIGHT);
    const t = playerTile(nx, ny);
    if (t.terrain !== "LAND") continue;
    if (t.ownerId !== defenderId) continue;
    if (t.ownershipState !== "SETTLED") continue;
    breachShockByTile.set(key(nx, ny), { ownerId: defenderId, expiresAt: now() + BREACH_SHOCK_MS });
  }
};

const clearWorldProgressForSeason = (): void => {
  const pending = new Set<PendingCapture>(combatLocks.values());
  for (const pcap of pending) {
    pcap.cancelled = true;
    if (pcap.timeout) clearTimeout(pcap.timeout);
  }
  for (const settle of pendingSettlementsByTile.values()) {
    settle.cancelled = true;
    if (settle.timeout) clearTimeout(settle.timeout);
  }
  pendingSettlementsByTile.clear();
  townCaptureShockUntilByTile.clear();
  townGrowthShockUntilByTile.clear();
  tileYieldByTile.clear();
  tileHistoryByTile.clear();
  terrainShapesByTile.clear();
  victoryPressureById.clear();
  frontierSettlementsByPlayer.clear();
  seasonWinner = undefined;
  ownership.clear();
  ownershipStateByTile.clear();
  barbarianAgents.clear();
  barbarianAgentByTileKey.clear();
  combatLocks.clear();
  allianceRequests.clear();
  repeatFights.clear();
  collectVisibleCooldownByPlayer.clear();
  cachedVisibilitySnapshotByPlayer.clear();
  cachedChunkSnapshotByPlayer.clear();
  revealWatchersByTarget.clear();
  economyIndexByPlayer.clear();
  observatoryTileKeysByPlayer.clear();
  economicStructureTileKeysByPlayer.clear();
  for (const t of fortBuildTimers.values()) clearTimeout(t);
  fortBuildTimers.clear();
  fortsByTile.clear();
  for (const t of observatoryBuildTimers.values()) clearTimeout(t);
  observatoryBuildTimers.clear();
  observatoriesByTile.clear();
  for (const t of siegeOutpostBuildTimers.values()) clearTimeout(t);
  siegeOutpostBuildTimers.clear();
  siegeOutpostsByTile.clear();
  for (const t of economicStructureBuildTimers.values()) clearTimeout(t);
  economicStructureBuildTimers.clear();
  economicStructuresByTile.clear();
  sabotageByTile.clear();
  abilityCooldownsByPlayer.clear();
  revealedEmpireTargetsByPlayer.clear();
  breachShockByTile.clear();
  settlementDefenseByTile.clear();
  victoryPressurePausedAt = undefined;
  for (const d of dockById.values()) d.cooldownUntil = 0;
  vendettaCaptureCountsByPlayer.clear();
  for (const p of players.values()) {
    p.points = STARTING_GOLD;
    p.level = 0;
    delete p.techRootId;
    p.techIds.clear();
    p.domainIds.clear();
    p.allies.clear();
    p.territoryTiles.clear();
    p.T = 0;
    p.E = 0;
    p.Ts = 0;
    p.Es = 0;
    delete p.spawnOrigin;
    p.spawnShieldUntil = now() + 120_000;
    p.stamina = STAMINA_MAX;
    p.staminaUpdatedAt = now();
    p.isEliminated = false;
    p.respawnPending = false;
    p.missions = [];
    p.missionStats = defaultMissionStats();
    p.powerups = {};
    p.mods = { attack: 1, defense: 1, income: 1, vision: 1 };
    resourceCountsByPlayer.set(p.id, { FARM: 0, FISH: 0, FUR: 0, WOOD: 0, IRON: 0, GEMS: 0 });
    strategicResourceStockByPlayer.set(p.id, emptyStrategicStocks());
    strategicResourceBufferByPlayer.set(p.id, emptyStrategicStocks());
    economyIndexByPlayer.set(p.id, emptyPlayerEconomyIndex());
    dynamicMissionsByPlayer.set(p.id, []);
    temporaryAttackBuffUntilByPlayer.delete(p.id);
    temporaryIncomeBuffUntilByPlayer.delete(p.id);
    forcedRevealTilesByPlayer.set(p.id, new Set<TileKey>());
    setRevealTargetsForPlayer(p.id, []);
    playerBaseMods.set(p.id, { attack: 1, defense: 1, income: 1, vision: 1 });
    playerEffectsByPlayer.set(p.id, emptyPlayerEffects());
    clusterControlledTilesByPlayer.set(p.id, new Map());
  }
};

const archiveCurrentSeason = (): void => {
  const endedAt = now();
  activeSeason.status = "archived";
  const rows = [...players.values()];
  const topBy = (score: (p: Player) => number): Array<{ playerId: string; name: string; value: number }> =>
    [...rows]
      .sort((a, b) => score(b) - score(a))
      .slice(0, 10)
      .map((p) => ({ playerId: p.id, name: p.name, value: score(p) }));
  const archiveEntry: SeasonArchiveEntry = {
    seasonId: activeSeason.seasonId,
    endedAt,
    mostTerritory: topBy((p) => p.T),
    mostPoints: topBy((p) => p.points),
    longestSurvivalMs: topBy((p) => Math.max(0, endedAt - p.lastActiveAt))
  };
  if (seasonWinner) archiveEntry.winner = seasonWinner;
  seasonArchives.push(archiveEntry);
};

const startNewSeason = (): void => {
  archiveCurrentSeason();
  activeSeason = {
    seasonId: `s-${Date.now()}`,
    startAt: now(),
    endAt: now() + SEASON_LENGTH_DAYS * 24 * 60 * 60 * 1000,
    worldSeed: Math.floor(Math.random() * 1_000_000_000),
    techTreeConfigId: "",
    status: "active"
  };
  activeSeason.worldSeed = regenerateStrategicWorld(activeSeason.worldSeed);
  setWorldSeed(activeSeason.worldSeed);
  activeSeasonTechConfig = chooseSeasonalTechConfig(activeSeason.worldSeed);
  activeSeason.techTreeConfigId = activeSeasonTechConfig.configId;
  clearWorldProgressForSeason();
  for (const p of players.values()) spawnPlayer(p);
  spawnInitialBarbarians();
  for (const p of players.values()) {
    recomputeClusterBonusForPlayer(p);
    const ws = socketsByPlayer.get(p.id);
    if (!ws || ws.readyState !== ws.OPEN) continue;
    ws.send(
      JSON.stringify({
        type: "SEASON_ROLLOVER",
        season: activeSeason,
        seasonTechTreeId: activeSeason.techTreeConfigId
      })
    );
  }
};

const regenerateWorldInPlace = (): void => {
  activeSeason.worldSeed = Math.floor(Math.random() * 1_000_000_000);
  activeSeason.worldSeed = regenerateStrategicWorld(activeSeason.worldSeed);
  setWorldSeed(activeSeason.worldSeed);
  activeSeasonTechConfig = chooseSeasonalTechConfig(activeSeason.worldSeed);
  activeSeason.techTreeConfigId = activeSeasonTechConfig.configId;
  clearWorldProgressForSeason();
  for (const p of players.values()) spawnPlayer(p);
  spawnInitialBarbarians();
  for (const p of players.values()) {
    recomputeClusterBonusForPlayer(p);
    const ws = socketsByPlayer.get(p.id);
    if (!ws || ws.readyState !== ws.OPEN) continue;
    ws.send(
      JSON.stringify({
        type: "WORLD_REGENERATED",
        season: activeSeason
      })
    );
  }
};

const runtimeTileCore = (x: number, y: number): RuntimeTileCore => {
  const wx = wrapX(x, WORLD_WIDTH);
  const wy = wrapY(y, WORLD_HEIGHT);
  const tileKey = key(wx, wy);
  const terrain = terrainAtRuntime(wx, wy);
  const ownerId = ownership.get(tileKey);
  const ownershipState = ownerId ? (ownershipStateByTile.get(tileKey) ?? (ownerId === BARBARIAN_OWNER_ID ? "BARBARIAN" : "SETTLED")) : undefined;
  const resource = terrain === "LAND" ? applyClusterResources(wx, wy, resourceAt(wx, wy)) : undefined;
  return { x: wx, y: wy, tileKey, terrain, ownerId, ownershipState, resource };
};

const playerTile = (x: number, y: number): Tile => {
  const wx = wrapX(x, WORLD_WIDTH);
  const wy = wrapY(y, WORLD_HEIGHT);
  const tk = key(wx, wy);
  const terrain = terrainAtRuntime(wx, wy);
  const baseResource = terrain === "LAND" ? resourceAt(wx, wy) : undefined;
  const resource = terrain === "LAND" ? applyClusterResources(wx, wy, baseResource) : undefined;
  const ownerId = ownership.get(key(wx, wy));
  const ownershipState = ownershipStateByTile.get(key(wx, wy));
  const clusterId = clusterByTile.get(tk);
  const clusterType = clusterId ? clustersById.get(clusterId)?.clusterType : undefined;
  const dock = terrain === "LAND" ? docksByTile.get(tk) : undefined;
  const town = terrain === "LAND" ? townsByTile.get(tk) : undefined;
  const fort = terrain === "LAND" ? fortsByTile.get(tk) : undefined;
  const observatory = terrain === "LAND" ? observatoriesByTile.get(tk) : undefined;
  const siegeOutpost = terrain === "LAND" ? siegeOutpostsByTile.get(tk) : undefined;
  const sabotage = sabotageByTile.get(tk);
  const breachShock = breachShockByTile.get(tk);
  const history = tileHistoryByTile.get(tk);
  const tile: Tile = {
    x: wx,
    y: wy,
    terrain,
    lastChangedAt: now()
  };
  const continentId = continentIdAt(wx, wy);
  const regionType = regionTypeAtLocal(wx, wy);
  if (resource) tile.resource = resource;
  if (ownerId) {
    tile.ownerId = ownerId;
    tile.ownershipState = ownershipState ?? (ownerId === BARBARIAN_OWNER_ID ? "BARBARIAN" : "SETTLED");
    if (ownerId !== BARBARIAN_OWNER_ID && players.get(ownerId)?.capitalTileKey === tk) tile.capital = true;
  }
  if (continentId !== undefined) tile.continentId = continentId;
  if (terrain === "LAND" && regionType) (tile as Tile & { regionType?: string }).regionType = regionType;
  if (terrain === "LAND" && clusterId) tile.clusterId = clusterId;
  if (terrain === "LAND" && clusterType) tile.clusterType = clusterType;
  if (dock) tile.dockId = dock.dockId;
  if (breachShock && breachShock.expiresAt > now() && ownerId === breachShock.ownerId) tile.breachShockUntil = breachShock.expiresAt;
  if (town) {
    const owner = ownerId;
    const support = owner ? townSupport(town.tileKey, owner) : { supportCurrent: 0, supportMax: 0 };
    const goldPerMinute = townIncomeForOwner(town, owner) * sabotageMultiplierAt(town.tileKey);
    const isFed = isTownFedForOwner(town.tileKey, owner);
    const connectedTownKeys = owner ? directlyConnectedTownKeysForTown(owner, town.tileKey) : [];
    tile.town = {
      type: town.type,
      baseGoldPerMinute: TOWN_BASE_GOLD_PER_MIN,
      supportCurrent: support.supportCurrent,
      supportMax: support.supportMax,
      goldPerMinute,
      cap: townCapForOwner(town, owner),
      isFed,
      population: town.population,
      maxPopulation: town.maxPopulation,
      populationGrowthPerMinute: townPopulationGrowthPerMinuteForOwner(town, owner),
      populationTier: townPopulationTier(town.population),
      connectedTownCount: town.connectedTownCount,
      connectedTownBonus: town.connectedTownBonus,
      connectedTownNames: connectedTownKeys
        .map((townKey) => townsByTile.get(townKey)?.townId)
        .filter((label): label is string => Boolean(label)),
      hasMarket: ownedStructureAt(town.tileKey, owner, "MARKET"),
      marketActive: activeStructureAt(town.tileKey, owner, "MARKET") && isFed,
      hasGranary: ownedStructureAt(town.tileKey, owner, "GRANARY"),
      granaryActive: activeStructureAt(town.tileKey, owner, "GRANARY"),
      foodUpkeepPerMinute: townFoodUpkeepPerMinute(town)
    };
  }
  if (fort) {
    const fortView: { ownerId: string; status: "under_construction" | "active"; completesAt?: number } = {
      ownerId: fort.ownerId,
      status: fort.status
    };
    if (fort.status === "under_construction") fortView.completesAt = fort.completesAt;
    tile.fort = fortView;
  }
  if (observatory) {
    const status = observatoryStatusForTile(observatory.ownerId, observatory.tileKey);
    tile.observatory = {
      ownerId: observatory.ownerId,
      status
    };
    if (status === "under_construction" && observatory.completesAt !== undefined) tile.observatory.completesAt = observatory.completesAt;
  }
  if (siegeOutpost) {
    const siegeView: { ownerId: string; status: "under_construction" | "active"; completesAt?: number } = {
      ownerId: siegeOutpost.ownerId,
      status: siegeOutpost.status
    };
    if (siegeOutpost.status === "under_construction") siegeView.completesAt = siegeOutpost.completesAt;
    tile.siegeOutpost = siegeView;
  }
  if (sabotage && sabotage.endsAt > now()) {
    tile.sabotage = {
      ownerId: sabotage.casterPlayerId,
      endsAt: sabotage.endsAt,
      outputMultiplier: sabotage.outputMultiplier
    };
  }
  const economicStructure = economicStructuresByTile.get(key(wx, wy));
  if (economicStructure) {
    tile.economicStructure = {
      ownerId: economicStructure.ownerId,
      type: economicStructure.type,
      status: economicStructure.status
    };
    if (economicStructure.completesAt !== undefined) tile.economicStructure.completesAt = economicStructure.completesAt;
  }
  if (history && (history.captureCount > 0 || history.structureHistory.length > 0 || history.lastStructureType)) {
    const historyView: NonNullable<Tile["history"]> = {
      previousOwners: [...history.previousOwners],
      captureCount: history.captureCount,
      structureHistory: [...history.structureHistory]
    };
    if (history.lastOwnerId !== undefined) historyView.lastOwnerId = history.lastOwnerId;
    if (history.lastCapturedAt !== undefined) historyView.lastCapturedAt = history.lastCapturedAt;
    if (history.lastStructureType !== undefined) historyView.lastStructureType = history.lastStructureType;
    tile.history = historyView;
  }
  const yieldBuf = tileYieldByTile.get(key(wx, wy));
  const ownerEffects = ownerId ? getPlayerEffectsForPlayer(ownerId) : emptyPlayerEffects();
  if (ownerId && ownershipState === "SETTLED" && terrain === "LAND") {
    const sabotageMult = sabotageMultiplierAt(key(wx, wy));
    const goldPerMinuteFromTile =
      ((tile.capital ? BASE_GOLD_PER_MIN : 0) +
        (resource ? (resourceRate[resource] ?? 0) * sabotageMult : 0) +
        (dock ? dockIncomeForOwner(dock, ownerId) : 0) +
        (town ? townIncomeForOwner(town, ownerId) * sabotageMult : 0)) *
      (players.get(ownerId)?.mods.income ?? 1) *
      PASSIVE_INCOME_MULT *
      HARVEST_GOLD_RATE_MULT;
    const strategicPerDay: Partial<Record<StrategicResource, number>> = {};
    const sr = toStrategicResource(resource);
    if (sr && resource) {
      const mult = activeResourceIncomeMult(ownerId, resource);
      strategicPerDay[sr] =
        (strategicDailyFromResource[resource] ?? 0) *
        mult *
        sabotageMult *
        economicStructureOutputMultAt(key(wx, wy), ownerId);
    }
    if (town?.type === "ANCIENT") {
      strategicPerDay.SHARD = (strategicPerDay.SHARD ?? 0) + strategicResourceRates.SHARD * ownerEffects.resourceOutputMult.SHARD;
    }
    (tile as Tile & { yieldRate?: { goldPerMinute?: number; strategicPerDay?: Partial<Record<StrategicResource, number>> } }).yieldRate = {
      goldPerMinute: Number(goldPerMinuteFromTile.toFixed(4)),
      strategicPerDay
    };
  }
  (tile as Tile & { yieldCap?: { gold: number; strategicEach: number } }).yieldCap = tileYieldCapsFor(tk, ownerId);
  if (yieldBuf && ownerId) {
    const strategic = roundedPositiveStrategic(yieldBuf.strategic);
    if (yieldBuf.gold > 0 || hasPositiveStrategicBuffer(yieldBuf.strategic)) {
      (tile as Tile & { yield?: { gold: number; strategic: Partial<Record<StrategicResource, number>> } }).yield = {
        gold: Number(yieldBuf.gold.toFixed(3)),
        strategic
      };
    }
  }
  return tile;
};

const cardinalNeighborCores = (x: number, y: number): RuntimeTileCore[] => [
  runtimeTileCore(x, y - 1),
  runtimeTileCore(x + 1, y),
  runtimeTileCore(x, y + 1),
  runtimeTileCore(x - 1, y)
];

const adjacentNeighborCores = (x: number, y: number): RuntimeTileCore[] => [
  runtimeTileCore(x, y - 1),
  runtimeTileCore(x + 1, y),
  runtimeTileCore(x, y + 1),
  runtimeTileCore(x - 1, y),
  runtimeTileCore(x - 1, y - 1),
  runtimeTileCore(x + 1, y - 1),
  runtimeTileCore(x + 1, y + 1),
  runtimeTileCore(x - 1, y + 1)
];

const isValidCapitalTile = (player: Player, tileKey: TileKey | undefined): tileKey is TileKey => {
  if (!tileKey) return false;
  return ownership.get(tileKey) === player.id && ownershipStateByTile.get(tileKey) === "SETTLED";
};

const chooseCapitalTileKey = (player: Player): TileKey | undefined => {
  if (isValidCapitalTile(player, player.spawnOrigin)) return player.spawnOrigin;
  const settledTowns = [...townsByTile.keys()]
    .filter((tk) => ownership.get(tk) === player.id && ownershipStateByTile.get(tk) === "SETTLED")
    .sort();
  if (settledTowns.length > 0) return settledTowns[0];
  const settledTiles = [...player.territoryTiles].filter((tk) => ownershipStateByTile.get(tk) === "SETTLED").sort();
  return settledTiles[0];
};

const sendVisibleTileDeltaAt = (x: number, y: number): void => {
  for (const p of players.values()) {
    if (!tileInSubscription(p.id, x, y)) continue;
    if (!visible(p, x, y)) continue;
    const current = playerTile(x, y);
    current.fogged = false;
    sendToPlayer(p.id, { type: "TILE_DELTA", updates: [current] });
  }
};

const sendVisibleTileDeltaSquare = (x: number, y: number, radius: number): void => {
  for (let dy = -radius; dy <= radius; dy += 1) {
    for (let dx = -radius; dx <= radius; dx += 1) {
      sendVisibleTileDeltaAt(wrapX(x + dx, WORLD_WIDTH), wrapY(y + dy, WORLD_HEIGHT));
    }
  }
};

const reconcileCapitalForPlayer = (player: Player): void => {
  const previous = player.capitalTileKey;
  const next = isValidCapitalTile(player, previous) ? previous : chooseCapitalTileKey(player);
  if (previous === next) return;
  if (next) player.capitalTileKey = next;
  else delete player.capitalTileKey;
  if (previous) {
    const [x, y] = parseKey(previous);
    sendVisibleTileDeltaAt(x, y);
  }
  if (next) {
    const [x, y] = parseKey(next);
    sendVisibleTileDeltaAt(x, y);
  }
};

const getOrInitResourceCounts = (playerId: string): Record<ResourceType, number> => {
  let counts = resourceCountsByPlayer.get(playerId);
  if (!counts) {
    counts = { FARM: 0, FISH: 0, FUR: 0, WOOD: 0, IRON: 0, GEMS: 0 };
    resourceCountsByPlayer.set(playerId, counts);
  } else {
    if (counts.FARM === undefined) counts.FARM = 0;
    if (counts.FISH === undefined) counts.FISH = 0;
    if (counts.FUR === undefined) counts.FUR = 0;
    if (counts.WOOD === undefined) counts.WOOD = 0;
    if (counts.IRON === undefined) counts.IRON = 0;
    if (counts.GEMS === undefined) counts.GEMS = 0;
  }
  return counts;
};

const emptyStrategicStocks = (): Record<StrategicResource, number> => ({
  FOOD: 0,
  IRON: 0,
  CRYSTAL: 0,
  SUPPLY: 0,
  SHARD: 0
});

const emptyTileYield = (): TileYieldBuffer => ({
  gold: 0,
  strategic: emptyStrategicStocks()
});

const emptyPlayerEconomyIndex = (): PlayerEconomyIndex => ({
  settledResourceTileKeys: new Set<TileKey>(),
  settledDockTileKeys: new Set<TileKey>(),
  settledTownTileKeys: new Set<TileKey>(),
  ancientTownTileKeys: new Set<TileKey>()
});

const getOrInitEconomyIndex = (playerId: string): PlayerEconomyIndex => {
  let index = economyIndexByPlayer.get(playerId);
  if (!index) {
    index = emptyPlayerEconomyIndex();
    economyIndexByPlayer.set(playerId, index);
  }
  return index;
};

const getOrInitOwnedTileKeySet = (index: Map<string, Set<TileKey>>, playerId: string): Set<TileKey> => {
  let set = index.get(playerId);
  if (!set) {
    set = new Set<TileKey>();
    index.set(playerId, set);
  }
  return set;
};

const trackOwnedTileKey = (index: Map<string, Set<TileKey>>, playerId: string, tileKey: TileKey): void => {
  getOrInitOwnedTileKeySet(index, playerId).add(tileKey);
};

const untrackOwnedTileKey = (index: Map<string, Set<TileKey>>, playerId: string, tileKey: TileKey): void => {
  const set = index.get(playerId);
  if (!set) return;
  set.delete(tileKey);
  if (set.size === 0) index.delete(playerId);
};

const rebuildEconomyIndexForPlayer = (playerId: string): void => {
  const player = players.get(playerId);
  if (!player) {
    economyIndexByPlayer.delete(playerId);
    return;
  }
  const index = getOrInitEconomyIndex(playerId);
  index.settledResourceTileKeys.clear();
  index.settledDockTileKeys.clear();
  index.settledTownTileKeys.clear();
  index.ancientTownTileKeys.clear();
  for (const tileKey of player.territoryTiles) {
    if (ownershipStateByTile.get(tileKey) !== "SETTLED") continue;
    const [x, y] = parseKey(tileKey);
    if (terrainAtRuntime(x, y) !== "LAND") continue;
    const resource = applyClusterResources(x, y, resourceAt(x, y));
    if (resource) index.settledResourceTileKeys.add(tileKey);
    if (docksByTile.has(tileKey)) index.settledDockTileKeys.add(tileKey);
    const town = townsByTile.get(tileKey);
    if (town) {
      index.settledTownTileKeys.add(tileKey);
      if (town.type === "ANCIENT") index.ancientTownTileKeys.add(tileKey);
    }
  }
};

const hasPositiveStrategicBuffer = (strategic: Partial<Record<StrategicResource, number>>): boolean => {
  for (const resource of STRATEGIC_RESOURCE_KEYS) {
    if ((strategic[resource] ?? 0) > 0) return true;
  }
  return false;
};

const pruneEmptyTileYield = (tileKey: TileKey, y: TileYieldBuffer): void => {
  if (y.gold > 0 || hasPositiveStrategicBuffer(y.strategic)) return;
  tileYieldByTile.delete(tileKey);
};

const roundedPositiveStrategic = (strategic: Record<StrategicResource, number>): Partial<Record<StrategicResource, number>> => {
  const out: Partial<Record<StrategicResource, number>> = {};
  for (const resource of STRATEGIC_RESOURCE_KEYS) {
    const value = strategic[resource] ?? 0;
    if (value > 0) out[resource] = Number(value.toFixed(3));
  }
  return out;
};

const getOrInitStrategicStocks = (playerId: string): Record<StrategicResource, number> => {
  let stock = strategicResourceStockByPlayer.get(playerId);
  if (!stock) {
    stock = emptyStrategicStocks();
    strategicResourceStockByPlayer.set(playerId, stock);
  }
  for (const r of ["FOOD", "IRON", "CRYSTAL", "SUPPLY", "SHARD"] as const) {
    if (stock[r] === undefined) stock[r] = 0;
  }
  return stock;
};

const getOrInitStrategicBuffer = (playerId: string): Record<StrategicResource, number> => {
  let buf = strategicResourceBufferByPlayer.get(playerId);
  if (!buf) {
    buf = emptyStrategicStocks();
    strategicResourceBufferByPlayer.set(playerId, buf);
  }
  for (const r of ["FOOD", "IRON", "CRYSTAL", "SUPPLY", "SHARD"] as const) {
    if (buf[r] === undefined) buf[r] = 0;
  }
  return buf;
};

const getOrInitTileYield = (tileKey: TileKey): TileYieldBuffer => {
  let y = tileYieldByTile.get(tileKey);
  if (!y) {
    y = emptyTileYield();
    tileYieldByTile.set(tileKey, y);
  }
  for (const r of ["FOOD", "IRON", "CRYSTAL", "SUPPLY", "SHARD"] as const) {
    if (y.strategic[r] === undefined) y.strategic[r] = 0;
  }
  return y;
};

const emptyUpkeepBreakdown = (): UpkeepBreakdown => ({ need: 0, fromYield: 0, fromStock: 0, remaining: 0 });
const emptyUpkeepDiagnostics = (): UpkeepDiagnostics => ({
  food: emptyUpkeepBreakdown(),
  iron: emptyUpkeepBreakdown(),
  supply: emptyUpkeepBreakdown(),
  crystal: emptyUpkeepBreakdown(),
  gold: emptyUpkeepBreakdown(),
  foodCoverage: 1
});

const consumeYieldStrategicForPlayer = (
  player: Player,
  resource: StrategicResource,
  needed: number,
  touchedTileKeys: Set<TileKey>
): number => {
  if (needed <= 0) return 0;
  let remaining = needed;
  let paid = 0;
  for (const tk of player.territoryTiles) {
    if (ownershipStateByTile.get(tk) !== "SETTLED") continue;
    if (remaining <= 0) break;
    const y = tileYieldByTile.get(tk);
    if (!y) continue;
    const available = Math.max(0, y.strategic[resource] ?? 0);
    if (available <= 0) continue;
    const take = Math.min(available, remaining);
    y.strategic[resource] = Math.max(0, available - take);
    remaining -= take;
    paid += take;
    touchedTileKeys.add(tk);
    pruneEmptyTileYield(tk, y);
  }
  return paid;
};

const consumeYieldGoldForPlayer = (player: Player, needed: number, touchedTileKeys: Set<TileKey>): number => {
  if (needed <= 0) return 0;
  let remaining = needed;
  let paid = 0;
  for (const tk of player.territoryTiles) {
    if (ownershipStateByTile.get(tk) !== "SETTLED") continue;
    if (remaining <= 0) break;
    const y = tileYieldByTile.get(tk);
    if (!y) continue;
    const available = Math.max(0, y.gold);
    if (available <= 0) continue;
    const take = Math.min(available, remaining);
    y.gold = Math.max(0, available - take);
    remaining -= take;
    paid += take;
    touchedTileKeys.add(tk);
    pruneEmptyTileYield(tk, y);
  }
  return paid;
};

const availableYieldStrategicForPlayer = (player: Player, resource: StrategicResource): number => {
  let total = 0;
  for (const tk of player.territoryTiles) {
    if (ownershipStateByTile.get(tk) !== "SETTLED") continue;
    const y = tileYieldByTile.get(tk);
    if (!y) continue;
    total += Math.max(0, y.strategic[resource] ?? 0);
  }
  return total;
};

const getPlayerEffectsForPlayer = (playerId: string): PlayerEffects => {
  const existing = playerEffectsByPlayer.get(playerId);
  if (existing) return existing;
  const base = emptyPlayerEffects();
  playerEffectsByPlayer.set(playerId, base);
  return base;
};

const recomputePlayerEffectsForPlayer = (player: Player): void => {
  const next = emptyPlayerEffects();
  for (const id of player.techIds) {
    const tech = techById.get(id);
    const effects = tech?.effects;
    if (!effects) continue;
    if (effects.unlockForts) next.unlockForts = true;
    if (effects.unlockSiegeOutposts) next.unlockSiegeOutposts = true;
    if (effects.unlockGranary) next.unlockGranary = true;
    if (effects.unlockRevealRegion) next.unlockRevealRegion = true;
    if (effects.unlockRevealEmpire) next.unlockRevealEmpire = true;
    if (effects.unlockDeepStrike) next.unlockDeepStrike = true;
    if (effects.unlockMountainPass) next.unlockMountainPass = true;
    if (effects.unlockTerrainShaping) next.unlockTerrainShaping = true;
    if (effects.unlockBreachAttack) next.unlockBreachAttack = true;
    if (typeof effects.settlementSpeedMult === "number") next.settlementSpeedMult *= effects.settlementSpeedMult;
    if (typeof effects.operationalTempoMult === "number") next.operationalTempoMult *= effects.operationalTempoMult;
    if (typeof effects.populationGrowthMult === "number") next.populationGrowthMult *= effects.populationGrowthMult;
    if (typeof effects.firstThreeTownsPopulationGrowthMult === "number") {
      next.firstThreeTownsPopulationGrowthMult *= effects.firstThreeTownsPopulationGrowthMult;
    }
    if (typeof effects.populationCapFirst3TownsMult === "number") next.populationCapFirst3TownsMult *= effects.populationCapFirst3TownsMult;
    if (typeof effects.growthPauseDurationMult === "number") next.growthPauseDurationMult *= effects.growthPauseDurationMult;
    if (typeof effects.townFoodUpkeepMult === "number") next.townFoodUpkeepMult *= effects.townFoodUpkeepMult;
    if (typeof effects.settledFoodUpkeepMult === "number") next.settledFoodUpkeepMult *= effects.settledFoodUpkeepMult;
    if (typeof effects.settledGoldUpkeepMult === "number") next.settledGoldUpkeepMult *= effects.settledGoldUpkeepMult;
    if (typeof effects.townGoldOutputMult === "number") next.townGoldOutputMult *= effects.townGoldOutputMult;
    if (typeof effects.townGoldCapMult === "number") next.townGoldCapMult *= effects.townGoldCapMult;
    if (typeof effects.marketBonusMult === "number") {
      next.marketIncomeBonusAdd *= effects.marketBonusMult;
      next.marketCapBonusAdd *= effects.marketBonusMult;
    }
    if (typeof effects.granaryBonusMult === "number") next.granaryCapBonusAdd *= effects.granaryBonusMult;
    if (typeof effects.marketIncomeBonusAdd === "number") next.marketIncomeBonusAdd += effects.marketIncomeBonusAdd;
    if (typeof effects.marketCapBonusAdd === "number") next.marketCapBonusAdd += effects.marketCapBonusAdd;
    if (typeof effects.granaryCapBonusAdd === "number") next.granaryCapBonusAdd += effects.granaryCapBonusAdd;
    if (typeof effects.granaryCapBonusAddPctPoints === "number") next.granaryCapBonusAdd += effects.granaryCapBonusAddPctPoints;
    if (typeof effects.populationIncomeMult === "number") next.populationIncomeMult *= effects.populationIncomeMult;
    if (typeof effects.connectedTownStepBonusAdd === "number") next.connectedTownStepBonusAdd += effects.connectedTownStepBonusAdd;
    if (typeof effects.harvestCapMult === "number") next.harvestCapMult *= effects.harvestCapMult;
    if (typeof effects.fortDefenseMult === "number") next.fortDefenseMult *= effects.fortDefenseMult;
    if (typeof effects.fortIronUpkeepMult === "number") next.fortIronUpkeepMult *= effects.fortIronUpkeepMult;
    if (typeof effects.fortGoldUpkeepMult === "number") next.fortGoldUpkeepMult *= effects.fortGoldUpkeepMult;
    if (typeof effects.outpostAttackMult === "number") next.outpostAttackMult *= effects.outpostAttackMult;
    if (typeof effects.outpostSupplyUpkeepMult === "number") next.outpostSupplyUpkeepMult *= effects.outpostSupplyUpkeepMult;
    if (typeof effects.outpostGoldUpkeepMult === "number") next.outpostGoldUpkeepMult *= effects.outpostGoldUpkeepMult;
    if (typeof effects.revealUpkeepMult === "number") next.revealUpkeepMult *= effects.revealUpkeepMult;
    if (typeof effects.revealCapacityBonus === "number") next.revealCapacityBonus += effects.revealCapacityBonus;
    if (typeof effects.visionRadiusBonus === "number") next.visionRadiusBonus += effects.visionRadiusBonus;
    if (typeof effects.dockGoldOutputMult === "number") next.dockGoldOutputMult *= effects.dockGoldOutputMult;
    if (typeof effects.dockGoldCapMult === "number") next.dockGoldCapMult *= effects.dockGoldCapMult;
    if (typeof effects.dockConnectionBonusPerLink === "number") next.dockConnectionBonusPerLink = effects.dockConnectionBonusPerLink;
    if (effects.dockRoutesVisible) next.dockRoutesVisible = true;
    if (typeof effects.marketCrystalUpkeepMult === "number") next.marketCrystalUpkeepMult *= effects.marketCrystalUpkeepMult;
    if (typeof effects.settledDefenseMult === "number") next.settledDefenseMult *= effects.settledDefenseMult;
    if (typeof effects.attackVsSettledMult === "number") next.attackVsSettledMult *= effects.attackVsSettledMult;
    if (typeof effects.attackVsFortsMult === "number") next.attackVsFortsMult *= effects.attackVsFortsMult;
    if (typeof effects.newSettlementDefenseMult === "number") next.newSettlementDefenseMult *= effects.newSettlementDefenseMult;
    if (effects.resourceOutputMult) {
      if (typeof effects.resourceOutputMult.farm === "number") next.resourceOutputMult.FARM *= effects.resourceOutputMult.farm;
      if (typeof effects.resourceOutputMult.fish === "number") next.resourceOutputMult.FISH *= effects.resourceOutputMult.fish;
      if (typeof effects.resourceOutputMult.iron === "number") next.resourceOutputMult.IRON *= effects.resourceOutputMult.iron;
      if (typeof effects.resourceOutputMult.supply === "number") next.resourceOutputMult.SUPPLY *= effects.resourceOutputMult.supply;
      if (typeof effects.resourceOutputMult.crystal === "number") next.resourceOutputMult.CRYSTAL *= effects.resourceOutputMult.crystal;
      if (typeof effects.resourceOutputMult.shard === "number") next.resourceOutputMult.SHARD *= effects.resourceOutputMult.shard;
    }
  }
  for (const id of player.domainIds) {
    const domain = domainById.get(id);
    const effects = domain?.effects;
    if (!effects) continue;
    if (effects.unlockRevealEmpire) next.unlockRevealEmpire = true;
    if (typeof effects.buildCapacityAdd === "number") next.buildCapacityAdd += effects.buildCapacityAdd;
    if (typeof effects.settlementSpeedMult === "number") next.settlementSpeedMult *= effects.settlementSpeedMult;
    if (typeof effects.populationGrowthMult === "number") next.populationGrowthMult *= effects.populationGrowthMult;
    if (typeof effects.firstThreeTownsPopulationGrowthMult === "number") {
      next.firstThreeTownsPopulationGrowthMult *= effects.firstThreeTownsPopulationGrowthMult;
    }
    if (typeof effects.populationCapFirst3TownsMult === "number") next.populationCapFirst3TownsMult *= effects.populationCapFirst3TownsMult;
    if (typeof effects.growthPauseDurationMult === "number") next.growthPauseDurationMult *= effects.growthPauseDurationMult;
    if (typeof effects.townFoodUpkeepMult === "number") next.townFoodUpkeepMult *= effects.townFoodUpkeepMult;
    if (typeof effects.settledFoodUpkeepMult === "number") next.settledFoodUpkeepMult *= effects.settledFoodUpkeepMult;
    if (typeof effects.settledGoldUpkeepMult === "number") next.settledGoldUpkeepMult *= effects.settledGoldUpkeepMult;
    if (typeof effects.townGoldOutputMult === "number") next.townGoldOutputMult *= effects.townGoldOutputMult;
    if (typeof effects.townGoldCapMult === "number") next.townGoldCapMult *= effects.townGoldCapMult;
    if (typeof effects.marketBonusMult === "number") {
      next.marketIncomeBonusAdd *= effects.marketBonusMult;
      next.marketCapBonusAdd *= effects.marketBonusMult;
    }
    if (typeof effects.granaryBonusMult === "number") next.granaryCapBonusAdd *= effects.granaryBonusMult;
    if (typeof effects.connectedTownStepBonusAdd === "number") next.connectedTownStepBonusAdd += effects.connectedTownStepBonusAdd;
    if (typeof effects.harvestCapMult === "number") next.harvestCapMult *= effects.harvestCapMult;
    if (typeof effects.fortBuildGoldCostMult === "number") next.fortBuildGoldCostMult *= effects.fortBuildGoldCostMult;
    if (typeof effects.fortDefenseMult === "number") next.fortDefenseMult *= effects.fortDefenseMult;
    if (typeof effects.fortIronUpkeepMult === "number") next.fortIronUpkeepMult *= effects.fortIronUpkeepMult;
    if (typeof effects.fortGoldUpkeepMult === "number") next.fortGoldUpkeepMult *= effects.fortGoldUpkeepMult;
    if (typeof effects.outpostAttackMult === "number") next.outpostAttackMult *= effects.outpostAttackMult;
    if (typeof effects.outpostSupplyUpkeepMult === "number") next.outpostSupplyUpkeepMult *= effects.outpostSupplyUpkeepMult;
    if (typeof effects.outpostGoldUpkeepMult === "number") next.outpostGoldUpkeepMult *= effects.outpostGoldUpkeepMult;
    if (typeof effects.revealUpkeepMult === "number") next.revealUpkeepMult *= effects.revealUpkeepMult;
    if (typeof effects.revealCapacityBonus === "number") next.revealCapacityBonus += effects.revealCapacityBonus;
    if (typeof effects.visionRadiusBonus === "number") next.visionRadiusBonus += effects.visionRadiusBonus;
    if (typeof effects.settledDefenseMult === "number") next.settledDefenseMult *= effects.settledDefenseMult;
    if (typeof effects.attackVsSettledMult === "number") next.attackVsSettledMult *= effects.attackVsSettledMult;
    if (typeof effects.attackVsFortsMult === "number") next.attackVsFortsMult *= effects.attackVsFortsMult;
    if (typeof effects.newSettlementDefenseMult === "number") next.newSettlementDefenseMult *= effects.newSettlementDefenseMult;
    if (effects.resourceOutputMult) {
      if (typeof effects.resourceOutputMult.farm === "number") next.resourceOutputMult.FARM *= effects.resourceOutputMult.farm;
      if (typeof effects.resourceOutputMult.fish === "number") next.resourceOutputMult.FISH *= effects.resourceOutputMult.fish;
      if (typeof effects.resourceOutputMult.iron === "number") next.resourceOutputMult.IRON *= effects.resourceOutputMult.iron;
      if (typeof effects.resourceOutputMult.supply === "number") next.resourceOutputMult.SUPPLY *= effects.resourceOutputMult.supply;
      if (typeof effects.resourceOutputMult.crystal === "number") next.resourceOutputMult.CRYSTAL *= effects.resourceOutputMult.crystal;
      if (typeof effects.resourceOutputMult.shard === "number") next.resourceOutputMult.SHARD *= effects.resourceOutputMult.shard;
    }
  }
  playerEffectsByPlayer.set(player.id, next);
};

const revealCapacityForPlayer = (player: Player): number => {
  return playerHasTechIds(player, ABILITY_DEFS.reveal_empire.requiredTechIds) || getOrInitRevealTargets(player.id).size > 0 ? 1 : 0;
};

const effectiveVisionRadiusForPlayer = (player: Player): number =>
  Math.max(1, Math.floor(VISION_RADIUS * player.mods.vision) + getPlayerEffectsForPlayer(player.id).visionRadiusBonus);

const getOrInitRevealTargets = (playerId: string): Set<string> => {
  let set = revealedEmpireTargetsByPlayer.get(playerId);
  if (!set) {
    set = new Set<string>();
    revealedEmpireTargetsByPlayer.set(playerId, set);
  }
  return set;
};

const markVisibilityDirty = (playerId: string): void => {
  cachedVisibilitySnapshotByPlayer.delete(playerId);
  cachedChunkSnapshotByPlayer.delete(playerId);
};

const markVisibilityDirtyForPlayers = (playerIds: Iterable<string>): void => {
  for (const playerId of playerIds) markVisibilityDirty(playerId);
};

const addRevealWatcher = (targetPlayerId: string, watcherPlayerId: string): void => {
  let watchers = revealWatchersByTarget.get(targetPlayerId);
  if (!watchers) {
    watchers = new Set<string>();
    revealWatchersByTarget.set(targetPlayerId, watchers);
  }
  watchers.add(watcherPlayerId);
};

const removeRevealWatcher = (targetPlayerId: string, watcherPlayerId: string): void => {
  const watchers = revealWatchersByTarget.get(targetPlayerId);
  if (!watchers) return;
  watchers.delete(watcherPlayerId);
  if (watchers.size === 0) revealWatchersByTarget.delete(targetPlayerId);
};

const setRevealTargetsForPlayer = (playerId: string, targetPlayerIds: Iterable<string>): Set<string> => {
  const nextTargets = new Set<string>(targetPlayerIds);
  const currentTargets = revealedEmpireTargetsByPlayer.get(playerId);
  if (currentTargets) {
    for (const targetPlayerId of currentTargets) removeRevealWatcher(targetPlayerId, playerId);
  }
  revealedEmpireTargetsByPlayer.set(playerId, nextTargets);
  for (const targetPlayerId of nextTargets) addRevealWatcher(targetPlayerId, playerId);
  markVisibilityDirty(playerId);
  return nextTargets;
};

const getAbilityCooldowns = (playerId: string): Map<AbilityDefinition["id"], number> => {
  let byAbility = abilityCooldownsByPlayer.get(playerId);
  if (!byAbility) {
    byAbility = new Map();
    abilityCooldownsByPlayer.set(playerId, byAbility);
  }
  return byAbility;
};

const abilityReadyAt = (playerId: string, abilityId: AbilityDefinition["id"]): number => getAbilityCooldowns(playerId).get(abilityId) ?? 0;

const abilityOnCooldown = (playerId: string, abilityId: AbilityDefinition["id"]): boolean => abilityReadyAt(playerId, abilityId) > now();

const startAbilityCooldown = (playerId: string, abilityId: AbilityDefinition["id"]): void => {
  const def = ABILITY_DEFS[abilityId];
  if (def.cooldownMs <= 0) return;
  getAbilityCooldowns(playerId).set(abilityId, now() + def.cooldownMs);
};

const playerHasTechIds = (player: Player, techIds: string[]): boolean => techIds.every((id) => player.techIds.has(id));

const observatoryStatusForTile = (playerId: string, tileKey: TileKey): "under_construction" | "active" | "inactive" => {
  const observatory = observatoriesByTile.get(tileKey);
  if (!observatory || observatory.ownerId !== playerId) return "inactive";
  if (observatory.status === "under_construction") return "under_construction";
  const [x, y] = parseKey(tileKey);
  const t = playerTile(x, y);
  return t.ownerId === playerId && t.ownershipState === "SETTLED" ? observatory.status : "inactive";
};

const activeObservatoryTileKeysForPlayer = (playerId: string): TileKey[] => {
  const out: TileKey[] = [];
  for (const tk of observatoryTileKeysByPlayer.get(playerId) ?? []) {
    if (observatoryStatusForTile(playerId, tk) === "active") out.push(tk);
  }
  return out;
};

const syncObservatoriesForPlayer = (playerId: string, active: boolean): void => {
  let changed = false;
  for (const tk of observatoryTileKeysByPlayer.get(playerId) ?? []) {
    const observatory = observatoriesByTile.get(tk);
    if (!observatory) continue;
    if (observatory.status === "under_construction") continue;
    const [x, y] = parseKey(tk);
    const t = playerTile(x, y);
    const nextStatus = active && t.ownerId === playerId && t.ownershipState === "SETTLED" ? "active" : "inactive";
    if (observatory.status !== nextStatus) {
      observatory.status = nextStatus;
      changed = true;
    }
  }
  if (changed) markVisibilityDirty(playerId);
};

const hostileObservatoryProtectingTile = (actor: Player, x: number, y: number): TileKey | undefined => {
  for (const [tk, observatory] of observatoriesByTile) {
    if (observatory.ownerId === actor.id || actor.allies.has(observatory.ownerId)) continue;
    if (observatoryStatusForTile(observatory.ownerId, tk) !== "active") continue;
    const [ox, oy] = parseKey(tk);
    if (chebyshevDistance(ox, oy, x, y) <= OBSERVATORY_PROTECTION_RADIUS) return tk;
  }
  return undefined;
};

const sabotageMultiplierAt = (tileKey: TileKey): number => {
  const sabotage = sabotageByTile.get(tileKey);
  if (!sabotage || sabotage.endsAt <= now()) {
    if (sabotage) sabotageByTile.delete(tileKey);
    return 1;
  }
  return sabotage.outputMultiplier;
};

const economicStructureForTile = (tileKey: TileKey): EconomicStructure | undefined => economicStructuresByTile.get(tileKey);

const economicStructureUpkeepDue = (structure: EconomicStructure): boolean => structure.nextUpkeepAt <= now();

const economicStructureResourceType = (resource: ResourceType | undefined): EconomicStructureType | undefined => {
  if (resource === "FARM" || resource === "FISH") return "FARMSTEAD";
  if (resource === "WOOD" || resource === "FUR") return "CAMP";
  if (resource === "IRON" || resource === "GEMS") return "MINE";
  return undefined;
};

const economicStructureOutputMultAt = (tileKey: TileKey, ownerId: string | undefined): number => {
  const structure = economicStructuresByTile.get(tileKey);
  if (!structure || !ownerId || structure.ownerId !== ownerId || structure.status !== "active") return 1;
  return structure.type === "GRANARY" || structure.type === "MARKET" ? 1 : STRUCTURE_OUTPUT_MULT;
};

const chebyshevDistance = (ax: number, ay: number, bx: number, by: number): number => {
  const dx = Math.min(Math.abs(ax - bx), WORLD_WIDTH - Math.abs(ax - bx));
  const dy = Math.min(Math.abs(ay - by), WORLD_HEIGHT - Math.abs(ay - by));
  return Math.max(dx, dy);
};

const lineTilesBetween = (ax: number, ay: number, bx: number, by: number): Array<{ x: number; y: number }> => {
  const steps = chebyshevDistance(ax, ay, bx, by);
  if (steps <= 1) return [];
  const tiles: Array<{ x: number; y: number }> = [];
  for (let i = 1; i < steps; i += 1) {
    const ratio = i / steps;
    const x = wrapX(Math.round(ax + (bx - ax) * ratio), WORLD_WIDTH);
    const y = wrapY(Math.round(ay + (by - ay) * ratio), WORLD_HEIGHT);
    tiles.push({ x, y });
  }
  return tiles;
};

const validDeepStrikeTarget = (from: Tile, to: Tile): boolean => {
  if (from.ownerId === undefined) return false;
  const distance = chebyshevDistance(from.x, from.y, to.x, to.y);
  if (distance < 2 || distance > DEEP_STRIKE_MAX_DISTANCE) return false;
  for (const step of lineTilesBetween(from.x, from.y, to.x, to.y)) {
    if (terrainAtRuntime(step.x, step.y) === "MOUNTAIN") return false;
  }
  return true;
};

const validNavalInfiltrationTarget = (from: Tile, to: Tile): boolean => {
  const distance = chebyshevDistance(from.x, from.y, to.x, to.y);
  if (distance < 2 || distance > NAVAL_INFILTRATION_MAX_RANGE) return false;
  const middle = lineTilesBetween(from.x, from.y, to.x, to.y);
  if (middle.length === 0) return false;
  if (!middle.some((step) => terrainAtRuntime(step.x, step.y) === "SEA")) return false;
  if (middle.some((step) => terrainAtRuntime(step.x, step.y) === "MOUNTAIN")) return false;
  if (middle.some((step) => terrainAtRuntime(step.x, step.y) === "LAND")) return false;
  return to.terrain === "LAND";
};

const upkeepPerMinuteForPlayer = (player: Player): {
  food: number;
  iron: number;
  supply: number;
  crystal: number;
  gold: number;
} => {
  let townFoodUpkeep = 0;
  let settledTileCount = 0;
  let fortCount = 0;
  let outpostCount = 0;
  let observatoryCount = 0;
  for (const tk of player.territoryTiles) {
    if (ownershipStateByTile.get(tk) !== "SETTLED") continue;
    settledTileCount += 1;
    const town = townsByTile.get(tk);
    if (town) townFoodUpkeep += townFoodUpkeepPerMinute(town);
    const fort = fortsByTile.get(tk);
    if (fort?.ownerId === player.id && fort.status === "active") fortCount += 1;
    const siege = siegeOutpostsByTile.get(tk);
    if (siege?.ownerId === player.id && siege.status === "active") outpostCount += 1;
    const observatory = observatoriesByTile.get(tk);
    if (observatory?.ownerId === player.id && observatory?.status === "active") observatoryCount += 1;
  }
  const activeRevealCount = Math.min(1, getOrInitRevealTargets(player.id).size);
  const effects = getPlayerEffectsForPlayer(player.id);
  return {
    // Base town upkeep is 0.25 / 10 min. City tier and above pay double.
    food: townFoodUpkeep * effects.townFoodUpkeepMult,
    // 0.25 / 10 min per fort.
    iron: fortCount * 0.025 * effects.fortIronUpkeepMult,
    // 0.25 / 10 min per outpost.
    supply: outpostCount * 0.025 * effects.outpostSupplyUpkeepMult,
    // 0.25 / 10 min for each active empire reveal.
    crystal: activeRevealCount * REVEAL_EMPIRE_UPKEEP_PER_MIN * effects.revealUpkeepMult + observatoryCount * OBSERVATORY_UPKEEP_PER_MIN,
    // 2 gold / 10 min per fort + 2 gold / 10 min per outpost + 1 gold / 10 min per 40 settled tiles.
    gold: fortCount * 0.2 * effects.fortGoldUpkeepMult + outpostCount * 0.2 * effects.outpostGoldUpkeepMult + (settledTileCount / 40) * 0.1 * effects.settledGoldUpkeepMult
  };
};

function currentFoodCoverageForPlayer(playerId: string): number {
  const player = players.get(playerId);
  if (!player) return foodUpkeepCoverageByPlayer.get(playerId) ?? 1;
  return townFeedingStateForPlayer(playerId).foodCoverage;
}

const canPlaceEconomicStructure = (actor: Player, t: Tile, structureType: EconomicStructureType): { ok: boolean; reason?: string } => {
  if (t.terrain !== "LAND") return { ok: false, reason: "structure requires land tile" };
  if (t.ownerId !== actor.id || t.ownershipState !== "SETTLED") return { ok: false, reason: "structure requires settled owned tile" };
  const tk = key(t.x, t.y);
  if (fortsByTile.has(tk) || siegeOutpostsByTile.has(tk) || observatoriesByTile.has(tk) || economicStructuresByTile.has(tk)) {
    return { ok: false, reason: "tile already has structure" };
  }
  if (structureType === "FARMSTEAD" && t.resource !== "FARM" && t.resource !== "FISH") return { ok: false, reason: "farmstead requires FARM or FISH tile" };
  if (structureType === "CAMP" && t.resource !== "WOOD" && t.resource !== "FUR") return { ok: false, reason: "camp requires SUPPLY tile" };
  if (structureType === "MINE" && t.resource !== "IRON" && t.resource !== "GEMS") return { ok: false, reason: "mine requires IRON or CRYSTAL tile" };
  if ((structureType === "MARKET" || structureType === "GRANARY") && !townsByTile.has(tk)) return { ok: false, reason: `${structureType.toLowerCase()} requires town tile` };
  return { ok: true };
};

const tryBuildEconomicStructure = (actor: Player, x: number, y: number, structureType: EconomicStructureType): { ok: boolean; reason?: string } => {
  const t = playerTile(x, y);
  const tk = key(t.x, t.y);
  const placed = canPlaceEconomicStructure(actor, t, structureType);
  if (!placed.ok) return placed;

  if (structureType === "FARMSTEAD" && !actor.techIds.has("agriculture")) return { ok: false, reason: "unlock farmsteads via Agriculture first" };
  if (structureType === "CAMP" && !actor.techIds.has("leatherworking")) return { ok: false, reason: "unlock camps via Leatherworking first" };
  if (structureType === "MINE" && !actor.techIds.has("mining")) return { ok: false, reason: "unlock mines via Mining first" };
  if (structureType === "MARKET" && !actor.techIds.has("trade")) return { ok: false, reason: "unlock markets via Trade first" };
  if (structureType === "GRANARY" && !getPlayerEffectsForPlayer(actor.id).unlockGranary) return { ok: false, reason: "unlock granaries via Pottery first" };
  if (!canStartDevelopmentProcess(actor.id)) return { ok: false, reason: `all ${DEVELOPMENT_PROCESS_LIMIT} development slots are busy` };

  if (structureType === "FARMSTEAD") {
    if (actor.points < FARMSTEAD_BUILD_GOLD_COST) return { ok: false, reason: "insufficient gold for farmstead" };
    if (!consumeStrategicResource(actor, "FOOD", FARMSTEAD_BUILD_FOOD_COST)) return { ok: false, reason: "insufficient FOOD for farmstead" };
    actor.points -= FARMSTEAD_BUILD_GOLD_COST;
  } else if (structureType === "CAMP") {
    if (actor.points < CAMP_BUILD_GOLD_COST) return { ok: false, reason: "insufficient gold for camp" };
    if (!consumeStrategicResource(actor, "SUPPLY", CAMP_BUILD_SUPPLY_COST)) return { ok: false, reason: "insufficient SUPPLY for camp" };
    actor.points -= CAMP_BUILD_GOLD_COST;
  } else if (structureType === "MINE") {
    if (actor.points < MINE_BUILD_GOLD_COST) return { ok: false, reason: "insufficient gold for mine" };
    const matching = t.resource === "IRON" ? "IRON" : "CRYSTAL";
    if (!consumeStrategicResource(actor, matching, MINE_BUILD_RESOURCE_COST)) return { ok: false, reason: `insufficient ${matching} for mine` };
    actor.points -= MINE_BUILD_GOLD_COST;
  } else {
    if (structureType === "MARKET") {
      if (actor.points < MARKET_BUILD_GOLD_COST) return { ok: false, reason: "insufficient gold for market" };
      if (!consumeStrategicResource(actor, "CRYSTAL", MARKET_BUILD_CRYSTAL_COST)) return { ok: false, reason: "insufficient CRYSTAL for market" };
      actor.points -= MARKET_BUILD_GOLD_COST;
    } else {
      if (actor.points < GRANARY_BUILD_GOLD_COST) return { ok: false, reason: "insufficient gold for granary" };
      if (!consumeStrategicResource(actor, "FOOD", GRANARY_BUILD_FOOD_COST)) return { ok: false, reason: "insufficient FOOD for granary" };
      actor.points -= GRANARY_BUILD_GOLD_COST;
    }
  }

  recalcPlayerDerived(actor);
  const completesAt = now() + ECONOMIC_STRUCTURE_BUILD_MS;
  economicStructuresByTile.set(tk, {
    id: crypto.randomUUID(),
    type: structureType,
    tileKey: tk,
    ownerId: actor.id,
    status: "under_construction",
    completesAt,
    nextUpkeepAt: completesAt + ECONOMIC_STRUCTURE_UPKEEP_INTERVAL_MS
  });
  trackOwnedTileKey(economicStructureTileKeysByPlayer, actor.id, tk);
  recordTileStructureHistory(tk, structureType);
  const timer = setTimeout(() => {
    const current = economicStructuresByTile.get(tk);
    if (!current) return;
    const tileNow = runtimeTileCore(t.x, t.y);
    if (tileNow.ownerId !== actor.id || tileNow.ownershipState !== "SETTLED") {
      cancelEconomicStructureBuild(tk);
      return;
    }
    current.status = "active";
    delete current.completesAt;
    economicStructureBuildTimers.delete(tk);
    updateOwnership(t.x, t.y, actor.id);
  }, ECONOMIC_STRUCTURE_BUILD_MS);
  economicStructureBuildTimers.set(tk, timer);
  return { ok: true };
};

const syncEconomicStructuresForPlayer = (player: Player): Set<TileKey> => {
  const touched = new Set<TileKey>();
  const stock = getOrInitStrategicStocks(player.id);
  for (const tk of economicStructureTileKeysByPlayer.get(player.id) ?? []) {
    const structure = economicStructuresByTile.get(tk);
    if (!structure) continue;
    if (structure.status === "under_construction") continue;
    const [x, y] = parseKey(tk);
    const tile = playerTile(x, y);
    if (tile.ownerId !== player.id || tile.ownershipState !== "SETTLED") {
      structure.status = "inactive";
      touched.add(tk);
      continue;
    }
    if (!economicStructureUpkeepDue(structure)) continue;
    if (structure.type === "MARKET") {
      const marketCrystalUpkeep = MARKET_CRYSTAL_UPKEEP * getPlayerEffectsForPlayer(player.id).marketCrystalUpkeepMult;
      if ((stock.CRYSTAL ?? 0) >= marketCrystalUpkeep) {
        stock.CRYSTAL = Math.max(0, (stock.CRYSTAL ?? 0) - marketCrystalUpkeep);
        structure.status = "active";
      } else {
        structure.status = "inactive";
      }
    } else {
      const upkeep =
        structure.type === "FARMSTEAD"
          ? FARMSTEAD_GOLD_UPKEEP
          : structure.type === "CAMP"
            ? CAMP_GOLD_UPKEEP
            : structure.type === "MINE"
              ? MINE_GOLD_UPKEEP
              : GRANARY_GOLD_UPKEEP;
      if (player.points >= upkeep) {
        player.points = Math.max(0, player.points - upkeep);
        structure.status = "active";
      } else {
        structure.status = "inactive";
      }
    }
    structure.nextUpkeepAt = now() + ECONOMIC_STRUCTURE_UPKEEP_INTERVAL_MS;
    touched.add(tk);
  }
  return touched;
};

const applyUpkeepForPlayer = (player: Player): { touchedTileKeys: Set<TileKey> } => {
  const stock = getOrInitStrategicStocks(player.id);
  syncObservatoriesForPlayer(player.id, true);
  const upkeep = upkeepPerMinuteForPlayer(player);
  const touchedTileKeys = new Set<TileKey>();
  const diag = emptyUpkeepDiagnostics();
  const availableFoodBeforeUpkeep = Math.max(0, stock.FOOD ?? 0) + availableYieldStrategicForPlayer(player, "FOOD");
  const foodFeedingState = computeTownFeedingState(player.id, availableFoodBeforeUpkeep);

  const payResource = (resource: StrategicResource, needRaw: number): UpkeepBreakdown => {
    const need = Math.max(0, needRaw);
    const fromYield = consumeYieldStrategicForPlayer(player, resource, need, touchedTileKeys);
    const afterYield = Math.max(0, need - fromYield);
    const have = Math.max(0, stock[resource] ?? 0);
    const fromStock = Math.min(afterYield, have);
    stock[resource] = Math.max(0, have - fromStock);
    const remaining = Math.max(0, need - fromYield - fromStock);
    return { need, fromYield, fromStock, remaining };
  };

  diag.food = payResource("FOOD", upkeep.food);
  diag.iron = payResource("IRON", upkeep.iron);
  diag.supply = payResource("SUPPLY", upkeep.supply);
  diag.crystal = payResource("CRYSTAL", upkeep.crystal);
  diag.foodCoverage = foodFeedingState.foodCoverage;
  foodUpkeepCoverageByPlayer.set(player.id, diag.foodCoverage);
  townFeedingStateByPlayer.set(player.id, foodFeedingState);

  if (diag.crystal.need > 0 && diag.crystal.remaining > 0) {
    const activeReveals = revealedEmpireTargetsByPlayer.get(player.id);
    if (activeReveals && activeReveals.size > 0) {
      activeReveals.clear();
      sendToPlayer(player.id, { type: "REVEAL_EMPIRE_UPDATE", activeTargets: [] });
    }
    syncObservatoriesForPlayer(player.id, false);
    for (const [tk, observatory] of observatoriesByTile) {
      if (observatory.ownerId === player.id) touchedTileKeys.add(tk);
    }
  } else {
    syncObservatoriesForPlayer(player.id, true);
    for (const [tk, observatory] of observatoriesByTile) {
      if (observatory.ownerId === player.id) touchedTileKeys.add(tk);
    }
  }

  const goldNeed = Math.max(0, upkeep.gold);
  const goldFromYield = consumeYieldGoldForPlayer(player, goldNeed, touchedTileKeys);
  const goldAfterYield = Math.max(0, goldNeed - goldFromYield);
  const goldFromWallet = Math.min(goldAfterYield, Math.max(0, player.points));
  player.points = Math.max(0, player.points - goldFromWallet);
  diag.gold = {
    need: goldNeed,
    fromYield: goldFromYield,
    fromStock: goldFromWallet,
    remaining: Math.max(0, goldNeed - goldFromYield - goldFromWallet)
  };

  lastUpkeepByPlayer.set(player.id, diag);
  return { touchedTileKeys };
};

const addTileYield = (tileKey: TileKey, goldDelta: number, strategicDelta?: Partial<Record<StrategicResource, number>>): void => {
  const y = getOrInitTileYield(tileKey);
  const ownerId = ownership.get(tileKey);
  const caps = tileYieldCapsFor(tileKey, ownerId);
  const goldCap = caps.gold;
  const resourceCap = caps.strategicEach;
  if (goldDelta > 0) y.gold = Math.min(goldCap, y.gold + goldDelta);
  if (strategicDelta) {
    for (const [r, v] of Object.entries(strategicDelta) as Array<[StrategicResource, number]>) {
      if (v <= 0) continue;
      y.strategic[r] = Math.min(resourceCap, (y.strategic[r] ?? 0) + v);
    }
  }
};

const getOrInitDynamicMissions = (playerId: string): DynamicMissionDef[] => {
  let missions = dynamicMissionsByPlayer.get(playerId);
  if (!missions) {
    missions = [];
    dynamicMissionsByPlayer.set(playerId, missions);
  }
  return missions;
};

const getOrInitForcedReveal = (playerId: string): Set<TileKey> => {
  let set = forcedRevealTilesByPlayer.get(playerId);
  if (!set) {
    set = new Set<TileKey>();
    forcedRevealTilesByPlayer.set(playerId, set);
  }
  return set;
};

const activeAttackBuffMult = (playerId: string): number => {
  const until = temporaryAttackBuffUntilByPlayer.get(playerId) ?? 0;
  return until > now() ? VENDETTA_ATTACK_BUFF_MULT : 1;
};

const revealLinkedDocksForPlayer = (playerId: string, tileKey: TileKey): void => {
  const dock = docksByTile.get(tileKey);
  if (!dock) return;
  const forced = getOrInitForcedReveal(playerId);
  let changed = false;
  for (const linked of dockLinkedDestinations(dock)) {
    const [x, y] = parseKey(linked.tileKey);
    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        const revealTileKey = key(wrapX(x + dx, WORLD_WIDTH), wrapY(y + dy, WORLD_HEIGHT));
        if (forced.has(revealTileKey)) continue;
        forced.add(revealTileKey);
        changed = true;
      }
    }
  }
  if (changed) markVisibilityDirty(playerId);
};

const activeResourceIncomeMult = (playerId: string, resource: ResourceType): number => {
  const effects = getPlayerEffectsForPlayer(playerId);
  const permanent =
    resource === "FARM"
      ? effects.resourceOutputMult.FARM
      : resource === "FISH"
        ? effects.resourceOutputMult.FISH
        : resource === "IRON"
          ? effects.resourceOutputMult.IRON
          : resource === "GEMS"
            ? effects.resourceOutputMult.CRYSTAL
            : effects.resourceOutputMult.SUPPLY;
  const buff = temporaryIncomeBuffUntilByPlayer.get(playerId);
  if (!buff || buff.until <= now()) return permanent;
  return permanent * (buff.resources.includes(resource) ? RESOURCE_CHAIN_MULT : 1);
};

const fortDefenseMultAt = (defenderId: string, tileKey: TileKey): number => {
  const fortOnTarget = fortsByTile.get(tileKey);
  if (fortOnTarget?.status !== "active" || fortOnTarget.ownerId !== defenderId) return 1;
  return FORT_DEFENSE_MULT * getPlayerEffectsForPlayer(defenderId).fortDefenseMult;
};

const settlementDefenseMultAt = (defenderId: string, tileKey: TileKey): number => {
  const entry = settlementDefenseByTile.get(tileKey);
  if (!entry || entry.ownerId !== defenderId || entry.expiresAt <= now()) return 1;
  return entry.mult;
};

const ownershipDefenseMultiplierForTarget = (target: Tile): number => {
  return target.ownershipState === "FRONTIER" ? 0 : 1;
};

const outpostAttackMultAt = (attackerId: string, tileKey: TileKey): number => {
  const siegeOnOrigin = siegeOutpostsByTile.get(tileKey);
  if (siegeOnOrigin?.status !== "active" || siegeOnOrigin.ownerId !== attackerId) return 1;
  return SIEGE_OUTPOST_ATTACK_MULT * getPlayerEffectsForPlayer(attackerId).outpostAttackMult;
};

const attackMultiplierForTarget = (attackerId: string, target: Tile): number => {
  const effects = getPlayerEffectsForPlayer(attackerId);
  let mult = 1;
  if (target.ownershipState === "SETTLED") mult *= effects.attackVsSettledMult;
  if (fortsByTile.get(key(target.x, target.y))?.status === "active") mult *= effects.attackVsFortsMult;
  return mult;
};

const settledDefenseMultiplierForTarget = (defenderId: string, target: Tile): number => {
  if (target.ownershipState !== "SETTLED") return 1;
  return getPlayerEffectsForPlayer(defenderId).settledDefenseMult;
};

const incrementVendettaCount = (attackerId: string, targetId: string): void => {
  let map = vendettaCaptureCountsByPlayer.get(attackerId);
  if (!map) {
    map = new Map<string, number>();
    vendettaCaptureCountsByPlayer.set(attackerId, map);
  }
  map.set(targetId, (map.get(targetId) ?? 0) + 1);
};

const isAlly = (a: string, b: string): boolean => {
  const p = players.get(a);
  return Boolean(p?.allies.has(b));
};

const applyStaminaRegen = (p: Player): void => {
  // Prototype mode: stamina is disabled as a gameplay limiter.
  p.stamina = STAMINA_MAX;
  p.staminaUpdatedAt = now();
};

const visible = (p: Player, x: number, y: number): boolean => {
  return visibleInSnapshot(visibilitySnapshotForPlayer(p), wrapX(x, WORLD_WIDTH), wrapY(y, WORLD_HEIGHT));
};

const recalcPlayerDerived = (p: Player): void => {
  p.level = levelFromPoints(p.points);
};

const playerDefensiveness = (p: Player): number => {
  return defensivenessMultiplier(Math.max(1, p.Ts), Math.max(1, p.Es));
};

const sendToPlayer = (playerId: string, payload: unknown): void => {
  const ws = socketsByPlayer.get(playerId);
  if (ws && ws.readyState === ws.OPEN) ws.send(JSON.stringify(payload));
};

const onlineSocketCount = (): number => {
  let count = 0;
  for (const ws of socketsByPlayer.values()) {
    if (ws.readyState === ws.OPEN) count += 1;
  }
  return count;
};

const hasOnlinePlayers = (): boolean => onlineSocketCount() > 0 || [...players.values()].some((player) => player.isAi);
let victoryPressurePausedAt: number | undefined;

const pauseVictoryPressureTimers = (): void => {
  if (victoryPressurePausedAt === undefined) victoryPressurePausedAt = now();
};

const resumeVictoryPressureTimers = (): void => {
  if (victoryPressurePausedAt === undefined) return;
  const delta = now() - victoryPressurePausedAt;
  if (delta > 0) {
    for (const tracker of victoryPressureById.values()) {
      if (tracker.holdStartedAt) tracker.holdStartedAt += delta;
    }
  }
  victoryPressurePausedAt = undefined;
};

const isVisibleToAnyOnlinePlayer = (x: number, y: number): boolean => {
  for (const p of players.values()) {
    const ws = socketsByPlayer.get(p.id);
    if (!ws || ws.readyState !== ws.OPEN) continue;
    if (visible(p, x, y)) return true;
  }
  return false;
};

const logBarbarianEvent = (message: string): void => {
  app.log.info(`[barbarian] ${message}`);
};

const refreshSubscribedViewForPlayer = (playerId: string): void => {
  const ws = socketsByPlayer.get(playerId);
  const p = players.get(playerId);
  const sub = chunkSubscriptionByPlayer.get(playerId);
  if (!ws || ws.readyState !== ws.OPEN || !p || !sub) return;
  sendChunkSnapshot(ws, p, sub);
};

const fogTileForPlayer = (x: number, y: number): Tile => {
  const tk = key(x, y);
  const dock = docksByTile.get(tk);
  const clusterId = clusterByTile.get(tk);
  const clusterType = clusterId ? clustersById.get(clusterId)?.clusterType : undefined;
  const fogTile: Tile = {
    x,
    y,
    terrain: terrainAtRuntime(x, y),
    fogged: true,
    lastChangedAt: now()
  };
  if (dock) fogTile.dockId = dock.dockId;
  if (clusterId) fogTile.clusterId = clusterId;
  if (clusterType) fogTile.clusterType = clusterType;
  return fogTile;
};

const visibleTileForPlayer = (p: Player, x: number, y: number, snapshot?: VisibilitySnapshot): Tile => {
  if ((snapshot ? visibleInSnapshot(snapshot, x, y) : visible(p, x, y))) {
    const tile = playerTile(x, y);
    tile.fogged = false;
    return tile;
  }
  return fogTileForPlayer(x, y);
};

const sendLocalVisionDeltaForPlayer = (playerId: string, centers: Array<{ x: number; y: number }>): void => {
  const ws = socketsByPlayer.get(playerId);
  const p = players.get(playerId);
  const sub = chunkSubscriptionByPlayer.get(playerId);
  if (!ws || ws.readyState !== ws.OPEN || !p || !sub || centers.length === 0) return;
  const radius = effectiveVisionRadiusForPlayer(p) + OBSERVATORY_VISION_BONUS;
  const snapshot = visibilitySnapshotForPlayer(p);
  const seen = new Set<TileKey>();
  const updates: Tile[] = [];
  for (const center of centers) {
    for (let dy = -radius; dy <= radius; dy += 1) {
      for (let dx = -radius; dx <= radius; dx += 1) {
        const x = wrapX(center.x + dx, WORLD_WIDTH);
        const y = wrapY(center.y + dy, WORLD_HEIGHT);
        if (!tileInSubscription(playerId, x, y)) continue;
        const tk = key(x, y);
        if (seen.has(tk)) continue;
        seen.add(tk);
        updates.push(visibleTileForPlayer(p, x, y, snapshot));
      }
    }
  }
  if (updates.length > 0) sendToPlayer(playerId, { type: "TILE_DELTA", updates });
};

const broadcastLocalVisionDelta = (centers: Array<{ x: number; y: number }>): void => {
  for (const playerId of socketsByPlayer.keys()) sendLocalVisionDeltaForPlayer(playerId, centers);
};

const sendPlayerUpdate = (p: Player, incomeDelta: number): void => {
  const ws = socketsByPlayer.get(p.id);
  if (!ws || ws.readyState !== ws.OPEN) return;
  refreshGlobalStatusCache(false);
  const strategicStocks = getOrInitStrategicStocks(p.id);
  const strategicProduction = strategicProductionPerMinute(p);
  const upkeepDiag = lastUpkeepByPlayer.get(p.id) ?? emptyUpkeepDiagnostics();
  const upkeepNeed = upkeepPerMinuteForPlayer(p);
  const pendingSettlements = [...pendingSettlementsByTile.values()]
    .filter((settlement) => settlement.ownerId === p.id)
    .map((settlement) => {
      const [x, y] = parseKey(settlement.tileKey);
      return { x, y, startedAt: settlement.startedAt, resolvesAt: settlement.resolvesAt };
    });
  ws.send(
    JSON.stringify({
      type: "PLAYER_UPDATE",
      gold: p.points,
      points: p.points,
      name: p.name,
      tileColor: p.tileColor,
      visualStyle: empireStyleFromPlayer(p),
      profileNeedsSetup: p.profileComplete !== true,
      level: p.level,
      mods: p.mods,
      modBreakdown: playerModBreakdown(p),
      incomePerMinute: currentIncomePerMinute(p),
      incomeDelta,
      strategicResources: strategicStocks,
      strategicProductionPerMinute: strategicProduction,
      upkeepPerMinute: upkeepNeed,
      upkeepLastTick: upkeepDiag,
      stamina: p.stamina,
      T: p.T,
      E: p.E,
      Ts: p.Ts,
      Es: p.Es,
      shieldUntil: p.spawnShieldUntil,
      defensiveness: playerDefensiveness(p),
      availableTechPicks: availableTechPicks(p),
      techChoices: reachableTechs(p),
      techCatalog: activeTechCatalog(p),
      domainIds: [...p.domainIds],
      domainChoices: reachableDomains(p),
      domainCatalog: activeDomainCatalog(p),
      revealCapacity: revealCapacityForPlayer(p),
      activeRevealTargets: [...getOrInitRevealTargets(p.id)],
      abilityCooldowns: Object.fromEntries(getAbilityCooldowns(p.id)),
      pendingSettlements,
      missions: missionPayload(p),
      leaderboard: cachedLeaderboardSnapshot,
      seasonVictory: cachedVictoryPressureObjectives,
      seasonWinner
    })
  );
};

const collectYieldFromTile = (
  player: Player,
  tk: TileKey
): { gold: number; strategic: Record<StrategicResource, number> } => {
  const out = { gold: 0, strategic: emptyStrategicStocks() };
  const y = tileYieldByTile.get(tk);
  if (!y) return out;
  const [x, yPos] = parseKey(tk);
  const t = playerTile(x, yPos);
  if (t.ownerId !== player.id || t.terrain !== "LAND") return out;
  if (t.ownershipState !== "SETTLED") return out;
  const gold = Math.floor(y.gold * 100) / 100;
  if (gold > 0) {
    player.points += gold;
    out.gold = gold;
    y.gold = 0;
  }
  const stock = getOrInitStrategicStocks(player.id);
  for (const r of STRATEGIC_RESOURCE_KEYS) {
    const amt = Math.floor((y.strategic[r] ?? 0) * 100) / 100;
    if (amt <= 0) continue;
    stock[r] += amt;
    out.strategic[r] = amt;
    y.strategic[r] = 0;
  }
  pruneEmptyTileYield(tk, y);
  return out;
};

const collectVisibleYield = (
  player: Player
): { tiles: number; gold: number; strategic: Record<StrategicResource, number>; touchedTileKeys: TileKey[] } => {
  const out = { tiles: 0, gold: 0, strategic: emptyStrategicStocks(), touchedTileKeys: [] as TileKey[] };
  for (const tk of player.territoryTiles) {
    if (ownershipStateByTile.get(tk) !== "SETTLED") continue;
    const [x, y] = parseKey(tk);
    if (!visible(player, x, y)) continue;
    const got = collectYieldFromTile(player, tk);
    const touched = got.gold > 0 || hasPositiveStrategicBuffer(got.strategic);
    if (!touched) continue;
    out.tiles += 1;
    out.gold += got.gold;
    out.touchedTileKeys.push(tk);
    for (const r of STRATEGIC_RESOURCE_KEYS) out.strategic[r] += got.strategic[r] ?? 0;
  }
  if (out.gold > 0) recalcPlayerDerived(player);
  return out;
};

type BasicFrontierActionType = "EXPAND" | "ATTACK";

const hasPendingSettlementForPlayer = (playerId: string): boolean => {
  for (const pending of pendingSettlementsByTile.values()) {
    if (pending.ownerId === playerId) return true;
  }
  return false;
};

const tryQueueBasicFrontierAction = (
  actor: Player,
  actionType: BasicFrontierActionType,
  fromX: number,
  fromY: number,
  toX: number,
  toY: number
): number | undefined => {
  applyStaminaRegen(actor);
  actor.lastActiveAt = now();

  let from = playerTile(fromX, fromY);
  const to = playerTile(toX, toY);
  if (actionType === "EXPAND" && to.ownerId) return undefined;
  if (actionType === "ATTACK" && (!to.ownerId || to.ownerId === actor.id)) return undefined;

  let fk = key(from.x, from.y);
  const tk = key(to.x, to.y);
  let fromDock = docksByTile.get(fk);
  let adjacent = isAdjacentTile(from.x, from.y, to.x, to.y);
  const allowAdjacentToDock = actionType !== "EXPAND";
  let dockCrossing = Boolean(fromDock && validDockCrossingTarget(fromDock, to.x, to.y, allowAdjacentToDock));
  if (!adjacent && !dockCrossing && from.ownerId === actor.id) {
    const altFrom = findOwnedDockOriginForCrossing(actor, to.x, to.y, allowAdjacentToDock);
    if (altFrom) {
      from = altFrom;
      fk = key(from.x, from.y);
      fromDock = docksByTile.get(fk);
      adjacent = isAdjacentTile(from.x, from.y, to.x, to.y);
      dockCrossing = Boolean(fromDock && validDockCrossingTarget(fromDock, to.x, to.y, allowAdjacentToDock));
    }
  }
  if (!adjacent && !dockCrossing) return undefined;
  if (dockCrossing && fromDock && fromDock.cooldownUntil > now()) return undefined;
  if (from.ownerId !== actor.id || to.terrain !== "LAND") return undefined;
  if (combatLocks.has(fk) || combatLocks.has(tk)) return undefined;
  if (actor.points < FRONTIER_ACTION_GOLD_COST) return undefined;

  const defenderIsBarbarian = to.ownerId === BARBARIAN_OWNER_ID;
  const defender = to.ownerId && !defenderIsBarbarian ? players.get(to.ownerId) : undefined;
  if (defender && actor.allies.has(defender.id)) return undefined;
  if (defender && defender.spawnShieldUntil > now()) return undefined;

  if (actionType === "ATTACK" && to.ownerId && to.ownerId !== actor.id && !actor.allies.has(to.ownerId)) {
    pausePopulationGrowthFromWar(actor.id);
  }
  const resolvesAt = now() + (actionType === "EXPAND" && !to.ownerId ? FRONTIER_CLAIM_MS : COMBAT_LOCK_MS);
  const pending: PendingCapture = {
    resolvesAt,
    origin: fk,
    target: tk,
    attackerId: actor.id,
    staminaCost: 0,
    cancelled: false
  };
  combatLocks.set(fk, pending);
  combatLocks.set(tk, pending);

  pending.timeout = setTimeout(() => {
    if (pending.cancelled) return;
    combatLocks.delete(fk);
    combatLocks.delete(tk);
    if (dockCrossing && fromDock) fromDock.cooldownUntil = now() + DOCK_CROSSING_COOLDOWN_MS;

    if (!defender && !defenderIsBarbarian) {
      actor.points -= FRONTIER_ACTION_GOLD_COST;
      recalcPlayerDerived(actor);
      actor.stamina -= pending.staminaCost;
      updateOwnership(to.x, to.y, actor.id, "FRONTIER");
      claimFirstSpecialSiteCaptureBonus(actor, to.x, to.y);
      telemetryCounters.frontierClaims += 1;
      actor.missionStats.neutralCaptures += 1;
      maybeIssueResourceMission(actor, to.resource);
      updateMissionState(actor);
      sendPlayerUpdate(actor, 0);
      sendLocalVisionDeltaForPlayer(actor.id, [{ x: to.x, y: to.y }]);
      return;
    }

    actor.points -= FRONTIER_ACTION_GOLD_COST;
    actor.stamina -= pending.staminaCost;

    const siegeAtkMult = outpostAttackMultAt(actor.id, fk);
    const atkEff =
      10 * actor.mods.attack * activeAttackBuffMult(actor.id) * attackMultiplierForTarget(actor.id, to) * siegeAtkMult * randomFactor();
    const shock = breachShockByTile.get(tk);
    const shockMult = defender && shock && shock.ownerId === defender.id && shock.expiresAt > now() ? BREACH_SHOCK_DEF_MULT : 1;
    const defMult = defender ? playerDefensiveness(defender) * shockMult : 1;
    const fortMult = defender ? fortDefenseMultAt(defender.id, tk) : 1;
    const dockMult = docksByTile.has(tk) ? DOCK_DEFENSE_MULT : 1;
    const settledDefenseMult = defender ? settledDefenseMultiplierForTarget(defender.id, to) : 1;
    const newSettlementDefenseMult = defender ? settlementDefenseMultAt(defender.id, tk) : 1;
    const ownershipDefenseMult = ownershipDefenseMultiplierForTarget(to);
    const defEff = defenderIsBarbarian
      ? 10 * BARBARIAN_DEFENSE_POWER * dockMult * randomFactor()
      : 10 * (defender?.mods.defense ?? 1) * defMult * fortMult * dockMult * settledDefenseMult * newSettlementDefenseMult * ownershipDefenseMult * randomFactor();
    const win = Math.random() < combatWinChance(atkEff, defEff);

    if (win) {
      updateOwnership(to.x, to.y, actor.id, "FRONTIER");
      if (defenderIsBarbarian) {
        actor.points += BARBARIAN_CLEAR_GOLD_REWARD;
        logBarbarianEvent(`cleared by ${actor.id} @ ${to.x},${to.y}`);
      } else {
        actor.missionStats.enemyCaptures += 1;
      }
      actor.missionStats.combatWins += 1;
      if (defender) {
        incrementVendettaCount(actor.id, defender.id);
        maybeIssueVendettaMission(actor, defender.id);
        const attackerRating = ratingFromPointsLevel(actor.points, actor.level);
        const defenderRating = ratingFromPointsLevel(defender.points, defender.level);
        const pairKey = pairKeyFor(actor.id, defender.id);
        const nowMs = now();
        const entries = pruneRepeatFightEntries(pairKey, nowMs);
        entries.push(nowMs);
        repeatFights.set(pairKey, entries);
        const repeatMult = Math.max(PVP_REPEAT_FLOOR, 0.5 ** (entries.length - 1));
        actor.points += pvpPointsReward(baseTileValue(to.resource), attackerRating, defenderRating) * repeatMult * PVP_REWARD_MULT;
      }
      maybeIssueResourceMission(actor, to.resource);
    } else if (defenderIsBarbarian) {
      const barbarianAgentId = barbarianAgentByTileKey.get(tk);
      const barbarianAgent = barbarianAgentId ? barbarianAgents.get(barbarianAgentId) : undefined;
      updateOwnership(from.x, from.y, BARBARIAN_OWNER_ID, "BARBARIAN");
      if (barbarianAgent) {
        barbarianAgent.progress += getBarbarianProgressGain(from);
        barbarianAgent.x = from.x;
        barbarianAgent.y = from.y;
        barbarianAgent.lastActionAt = now();
        barbarianAgent.nextActionAt = now() + BARBARIAN_ACTION_INTERVAL_MS;
        upsertBarbarianAgent(barbarianAgent);
      }
      updateOwnership(to.x, to.y, undefined);
    } else if (defender) {
      updateOwnership(from.x, from.y, defender.id, "FRONTIER");
      defender.missionStats.enemyCaptures += 1;
      defender.missionStats.combatWins += 1;
      incrementVendettaCount(defender.id, actor.id);
      maybeIssueVendettaMission(defender, actor.id);
      maybeIssueResourceMission(defender, from.resource);
      const attackerRating = ratingFromPointsLevel(defender.points, defender.level);
      const defenderRating = ratingFromPointsLevel(actor.points, actor.level);
      defender.points += pvpPointsReward(baseTileValue(from.resource), attackerRating, defenderRating) * PVP_REWARD_MULT;
    }

    recalcPlayerDerived(actor);
    if (defender) recalcPlayerDerived(defender);
    updateMissionState(actor);
    if (defender) updateMissionState(defender);
    resolveEliminationIfNeeded(actor, socketsByPlayer.has(actor.id) || actor.isAi === true);
    if (defender) resolveEliminationIfNeeded(defender, socketsByPlayer.has(defender.id) || defender.isAi === true);
    sendPlayerUpdate(actor, 0);
    if (defender) sendPlayerUpdate(defender, 0);
    const changedCenters = [{ x: from.x, y: from.y }, { x: to.x, y: to.y }];
    sendLocalVisionDeltaForPlayer(actor.id, changedCenters);
    if (defender && !defenderIsBarbarian) sendLocalVisionDeltaForPlayer(defender.id, changedCenters);
  }, resolvesAt - now());

  return resolvesAt;
};

const chooseAiTech = (actor: Player): string | undefined => {
  if (availableTechPicks(actor) <= 0) return undefined;
  const flags = playerWorldFlags(actor);
  const counts = getOrInitResourceCounts(actor.id);
  const affordable = reachableTechs(actor)
    .map((id) => techById.get(id))
    .filter((tech): tech is NonNullable<typeof tech> => Boolean(tech))
    .filter((tech) => techChecklistFor(actor, tech).ok)
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
      score += Math.max(0, 24 - techDepth(tech.id) * 6);
      return { id: tech.id, score };
    })
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
  return affordable[0]?.id;
};

const chooseAiDomain = (actor: Player): string | undefined => {
  const flags = playerWorldFlags(actor);
  const counts = getOrInitResourceCounts(actor.id);
  const affordable = reachableDomains(actor)
    .map((id) => domainById.get(id))
    .filter((domain): domain is NonNullable<typeof domain> => Boolean(domain))
    .filter((domain) => domainChecklistFor(actor, domain.id).ok)
    .map((domain) => {
      let score = 0;
      if (domain.id === "frontier-doctrine" && !flags.has("active_town")) score += 45;
      if (domain.id === "frontier-doctrine" && actor.T < 20) score += 20;
      if (domain.id === "mercantile-charter" && flags.has("active_town")) score += 65;
      if (domain.id === "mercantile-charter" && flags.has("active_dock")) score += 35;
      if (domain.id === "farmers-compact" && ((counts.FARM ?? 0) > 0 || (counts.FISH ?? 0) > 0)) score += 50;
      if (domain.id === "iron-bastions" && flags.has("active_town")) score += 20;
      if (domain.id === "supply-raiding" && (counts.WOOD ?? 0) + (counts.FUR ?? 0) > 0) score += 18;
      return { id: domain.id, score };
    })
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
  return affordable[0]?.id;
};

const maybePickAiTech = (actor: Player): void => {
  const choice = chooseAiTech(actor);
  if (!choice) return;
  const outcome = applyTech(actor, choice);
  if (!outcome.ok) return;
  recomputeClusterBonusForPlayer(actor);
  sendPlayerUpdate(actor, 0);
};

const maybePickAiDomain = (actor: Player): void => {
  const choice = chooseAiDomain(actor);
  if (!choice) return;
  const outcome = applyDomain(actor, choice);
  if (!outcome.ok) return;
  recomputeClusterBonusForPlayer(actor);
  sendPlayerUpdate(actor, 0);
};

const executeUnifiedGameplayMessage = async (actor: Player, msg: ClientMessage, socket: Ws): Promise<boolean> => {
  actor.lastActiveAt = now();

  if (msg.type === "PING") {
    socket.send(JSON.stringify({ type: "PONG", t: msg.t }));
    return true;
  }

  if (msg.type === "SETTLE") {
    const out = startSettlement(actor, msg.x, msg.y);
    if (!out.ok) {
      socket.send(JSON.stringify({ type: "ERROR", code: "SETTLE_INVALID", message: out.reason, x: msg.x, y: msg.y }));
      return true;
    }
    sendPlayerUpdate(actor, 0);
    return true;
  }

  if (msg.type === "BUILD_FORT") {
    const out = tryBuildFort(actor, msg.x, msg.y);
    if (!out.ok) {
      socket.send(JSON.stringify({ type: "ERROR", code: "FORT_BUILD_INVALID", message: out.reason }));
      return true;
    }
    updateOwnership(msg.x, msg.y, actor.id);
    sendPlayerUpdate(actor, 0);
    return true;
  }

  if (msg.type === "BUILD_OBSERVATORY") {
    const out = tryBuildObservatory(actor, msg.x, msg.y);
    if (!out.ok) {
      socket.send(JSON.stringify({ type: "ERROR", code: "OBSERVATORY_BUILD_INVALID", message: out.reason }));
      return true;
    }
    updateOwnership(msg.x, msg.y, actor.id);
    sendPlayerUpdate(actor, 0);
    return true;
  }

  if (msg.type === "BUILD_ECONOMIC_STRUCTURE") {
    const out = tryBuildEconomicStructure(actor, msg.x, msg.y, msg.structureType);
    if (!out.ok) {
      socket.send(JSON.stringify({ type: "ERROR", code: "ECONOMIC_STRUCTURE_BUILD_INVALID", message: out.reason }));
      return true;
    }
    updateOwnership(msg.x, msg.y, actor.id);
    sendPlayerUpdate(actor, 0);
    return true;
  }

  if (msg.type === "BUILD_SIEGE_OUTPOST") {
    const out = tryBuildSiegeOutpost(actor, msg.x, msg.y);
    if (!out.ok) {
      socket.send(JSON.stringify({ type: "ERROR", code: "SIEGE_OUTPOST_BUILD_INVALID", message: out.reason }));
      return true;
    }
    updateOwnership(msg.x, msg.y, actor.id);
    sendPlayerUpdate(actor, 0);
    return true;
  }

  if (msg.type === "COLLECT_VISIBLE") {
    const cdUntil = collectVisibleCooldownByPlayer.get(actor.id) ?? 0;
    if (cdUntil > now()) {
      socket.send(JSON.stringify({ type: "ERROR", code: "COLLECT_COOLDOWN", message: "collect visible is on cooldown" }));
      return true;
    }
    const got = collectVisibleYield(actor);
    collectVisibleCooldownByPlayer.set(actor.id, now() + COLLECT_VISIBLE_COOLDOWN_MS);
    if (got.touchedTileKeys.length > 0) {
      const updates = got.touchedTileKeys.map((tk) => {
        const [x, y] = parseKey(tk);
        return playerTile(x, y);
      });
      sendToPlayer(actor.id, { type: "TILE_DELTA", updates });
    }
    sendToPlayer(actor.id, { type: "COLLECT_RESULT", mode: "visible", tiles: got.tiles, gold: got.gold, strategic: got.strategic });
    sendPlayerUpdate(actor, got.gold);
    return true;
  }

  if (msg.type === "CHOOSE_TECH") {
    const outcome = applyTech(actor, msg.techId);
    if (!outcome.ok) {
      socket.send(JSON.stringify({ type: "ERROR", code: "TECH_INVALID", message: outcome.reason }));
      return true;
    }
    recomputeClusterBonusForPlayer(actor);
    socket.send(
      JSON.stringify({
        type: "TECH_UPDATE",
        techRootId: actor.techRootId,
        techIds: [...actor.techIds],
        mods: actor.mods,
        incomePerMinute: currentIncomePerMinute(actor),
        powerups: actor.powerups,
        nextChoices: reachableTechs(actor),
        availableTechPicks: availableTechPicks(actor),
        missions: missionPayload(actor),
        techCatalog: activeTechCatalog(actor),
        domainChoices: reachableDomains(actor),
        domainCatalog: activeDomainCatalog(actor),
        domainIds: [...actor.domainIds],
        revealCapacity: revealCapacityForPlayer(actor),
        activeRevealTargets: [...getOrInitRevealTargets(actor.id)]
      })
    );
    broadcast({ type: "PLAYER_STYLE", playerId: actor.id, tileColor: actor.tileColor, visualStyle: empireStyleFromPlayer(actor) });
    sendPlayerUpdate(actor, 0);
    return true;
  }

  if (msg.type === "CHOOSE_DOMAIN") {
    const outcome = applyDomain(actor, msg.domainId);
    if (!outcome.ok) {
      socket.send(JSON.stringify({ type: "ERROR", code: "DOMAIN_INVALID", message: outcome.reason }));
      return true;
    }
    recomputeClusterBonusForPlayer(actor);
    socket.send(
      JSON.stringify({
        type: "DOMAIN_UPDATE",
        domainIds: [...actor.domainIds],
        mods: actor.mods,
        incomePerMinute: currentIncomePerMinute(actor),
        domainChoices: reachableDomains(actor),
        domainCatalog: activeDomainCatalog(actor),
        missions: missionPayload(actor),
        revealCapacity: revealCapacityForPlayer(actor),
        activeRevealTargets: [...getOrInitRevealTargets(actor.id)]
      })
    );
    broadcast({ type: "PLAYER_STYLE", playerId: actor.id, tileColor: actor.tileColor, visualStyle: empireStyleFromPlayer(actor) });
    sendPlayerUpdate(actor, 0);
    return true;
  }

  if (
    msg.type === "ATTACK" ||
    msg.type === "EXPAND"
  ) {
    const resolvesAt = tryQueueBasicFrontierAction(actor, msg.type, msg.fromX, msg.fromY, msg.toX, msg.toY);
    if (resolvesAt === undefined) {
      socket.send(JSON.stringify({ type: "ERROR", code: "ACTION_INVALID", message: "action failed validation" }));
    } else {
      socket.send(JSON.stringify({ type: "COMBAT_START", origin: { x: msg.fromX, y: msg.fromY }, target: { x: msg.toX, y: msg.toY }, resolvesAt }));
    }
    return true;
  }

  return false;
};

const bestAiFrontierAction = (
  actor: Player,
  kind: BasicFrontierActionType,
  filter: (tile: Tile) => boolean,
  victoryPath?: AiSeasonVictoryPathId
): { from: Tile; to: Tile } | undefined => {
  const visibility = visibilitySnapshotForPlayer(actor);
  let settledTileCount = 0;
  let frontierTileCount = 0;
  for (const tileKey of actor.territoryTiles) {
    const ownershipState = ownershipStateByTile.get(tileKey);
    if (ownershipState === "SETTLED") settledTileCount += 1;
    else if (ownershipState === "FRONTIER") frontierTileCount += 1;
  }
  const earlyExpansionMode = settledTileCount <= 2;
  const economicExpansionMode = settledTileCount <= 6;
  const visibleToActor = (x: number, y: number): boolean => visibleInSnapshot(visibility, x, y);
  const dockScoreForTile = (tile: Tile): number => {
    const tk = key(tile.x, tile.y);
    if (!visibleToActor(tile.x, tile.y)) return 0;
    const dock = docksByTile.get(tk);
    let score = 0;
    if (dock) {
      score += 90;
      const linked = dock.connectedDockIds?.length ? dock.connectedDockIds.length : dock.pairedDockId ? 1 : 0;
      score += linked * 18;
    }
    for (const neighbor of adjacentNeighborCores(tile.x, tile.y)) {
      if (!visibleToActor(neighbor.x, neighbor.y)) continue;
      const neighborDock = docksByTile.get(key(neighbor.x, neighbor.y));
      if (!neighborDock) continue;
      score += 24;
      if (neighbor.ownerId && neighbor.ownerId !== actor.id && !actor.allies.has(neighbor.ownerId)) score += 22;
    }
    return score;
  };

  const scoreFrontierAction = (from: Tile, to: Tile): number => {
    const toVisible = visibleToActor(to.x, to.y);
    const tk = key(to.x, to.y);
    const isTown = toVisible && townsByTile.has(tk);
    const resourceValue = toVisible && to.resource ? baseTileValue(to.resource) : 0;
    const dockValue = dockScoreForTile(to);
    const adjacentInteresting = adjacentNeighborCores(to.x, to.y).reduce((score, neighbor) => {
      if (!visibleToActor(neighbor.x, neighbor.y)) return score;
      const neighborKey = key(neighbor.x, neighbor.y);
      const hostileOwner = neighbor.ownerId && neighbor.ownerId !== actor.id && !actor.allies.has(neighbor.ownerId);
      if (townsByTile.has(neighborKey) && hostileOwner) return score + 45;
      if (neighbor.resource && hostileOwner) return score + Math.max(15, baseTileValue(neighbor.resource) / 2);
      if (docksByTile.has(neighborKey) && hostileOwner) return score + 35;
      return score;
    }, 0);
    const explorationValue = adjacentNeighborCores(to.x, to.y).reduce((score, neighbor) => {
      if (visibleToActor(neighbor.x, neighbor.y)) return score;
      let next = score + 18;
      if (neighbor.terrain === "SEA") next += 10;
      return next;
    }, toVisible ? 0 : 24);
    const exposedSides = adjacentNeighborCores(to.x, to.y).reduce((count, neighbor) => {
      if (neighbor.terrain !== "LAND") return count + 1;
      if (!neighbor.ownerId || neighbor.ownerId !== actor.id) return count + 1;
      return count;
    }, 0);
    const ownedNeighbors = adjacentNeighborCores(to.x, to.y).reduce((count, neighbor) => {
      if (neighbor.ownerId !== actor.id) return count;
      return count + 1;
    }, 0);
    const alliedSettledNeighbors = adjacentNeighborCores(to.x, to.y).reduce((count, neighbor) => {
      if (neighbor.ownerId !== actor.id || neighbor.ownershipState !== "SETTLED") return count;
      return count + 1;
    }, 0);
    const frontierNeighbors = adjacentNeighborCores(to.x, to.y).reduce((count, neighbor) => {
      if (neighbor.ownerId !== actor.id || neighbor.ownershipState !== "FRONTIER") return count;
      return count + 1;
    }, 0);
    const coastlineDiscoveryValue = adjacentNeighborCores(to.x, to.y).reduce((score, neighbor) => {
      if (neighbor.terrain !== "SEA") return score;
      return score + (visibleToActor(neighbor.x, neighbor.y) ? 10 : 18);
    }, 0);
    const compactnessValue = alliedSettledNeighbors * 8 - exposedSides * 12;
    const scoutShapePenalty =
      Math.max(0, ownedNeighbors - 2) * 36 +
      Math.max(0, alliedSettledNeighbors - 1) * 18 +
      Math.max(0, frontierNeighbors - 1) * 12;
    const directionalScoutValue =
      explorationValue +
      coastlineDiscoveryValue -
      scoutShapePenalty +
      (ownedNeighbors <= 2 ? 18 : 0) +
      (from.ownershipState === "FRONTIER" ? 10 : 0);
    const knownEconomicValue = isTown || resourceValue > 0 || dockValue > 0;
    const knownMilitaryValue = adjacentInteresting >= 35 || to.ownerId === BARBARIAN_OWNER_ID;
    const reserveAfterAction = actor.points - FRONTIER_ACTION_GOLD_COST;
    const futureSettlement = kind === "EXPAND"
      ? evaluateAiSettlementCandidate(actor, to, victoryPath, new Set<TileKey>([tk]))
      : undefined;
    const immediateSettlementPlan = Boolean(
      futureSettlement &&
        canAffordGoldCost(actor.points, SETTLE_COST + FRONTIER_ACTION_GOLD_COST) &&
        futureSettlement.supportsImmediatePlan
    );

    let score = 0;
    if (kind === "ATTACK") score += 40;
    if (isTown) score += kind === "ATTACK" ? 180 : 120;
    score += resourceValue * (kind === "ATTACK" ? 1.8 : 1.25);
    score += dockValue;
    score += adjacentInteresting;
    if (kind === "EXPAND" && !knownEconomicValue && !knownMilitaryValue) {
      score += directionalScoutValue;
      if (immediateSettlementPlan && futureSettlement) {
        score += futureSettlement.score * 0.75;
        if (futureSettlement.isDefensivelyCompact) score += 30;
      } else {
        score += compactnessValue * 0.2;
      }
    }
    if (to.ownerId === BARBARIAN_OWNER_ID) score += 35;
    if (victoryPath === "TOWN_CONTROL" && isTown) score += 120;
    if (victoryPath === "ECONOMIC_HEGEMONY") {
      score += resourceValue + dockValue;
      if (isTown) score += 30;
    }
    if (victoryPath === "SETTLED_TERRITORY" && kind === "EXPAND") score += 20;
    score -= exposedSides * (kind === "ATTACK" ? 6 : 18);
    if (actor.points <= SETTLE_COST && !knownEconomicValue && adjacentInteresting < 40) score -= 80;
    if (kind === "EXPAND" && !earlyExpansionMode) {
      if (reserveAfterAction < SETTLE_COST && !knownEconomicValue && adjacentInteresting < 35) score -= 180;
      if (settledTileCount >= 2 && !knownEconomicValue && !knownMilitaryValue) score -= 45;
      if (settledTileCount >= 4 && explorationValue < 45 && !knownEconomicValue) score -= 70;
      if (frontierTileCount >= Math.max(2, settledTileCount) && !knownEconomicValue && !knownMilitaryValue && !immediateSettlementPlan) score -= 140;
    }
    if (kind === "EXPAND" && from.ownershipState !== "SETTLED" && !knownEconomicValue && explorationValue < 35) score -= 10;
    if (earlyExpansionMode && kind === "EXPAND") {
      score += 15;
      if (!knownEconomicValue) {
        score += directionalScoutValue;
        if (immediateSettlementPlan && futureSettlement) score += futureSettlement.score * 0.5;
      }
    }
    if (economicExpansionMode && kind === "EXPAND") {
      if (knownEconomicValue || explorationValue >= 40) score += 20;
      if (knownEconomicValue) score += 15;
    }
    if (kind === "EXPAND" && !knownEconomicValue && !knownMilitaryValue && ownedNeighbors >= 3 && !immediateSettlementPlan) {
      score -= earlyExpansionMode ? 140 : 220;
    }
    if (kind === "EXPAND" && frontierTileCount >= Math.max(1, settledTileCount - 1) && !knownEconomicValue && !knownMilitaryValue && !immediateSettlementPlan) {
      score -= 220;
    }
    if (!toVisible && kind === "ATTACK") {
      score -= 100;
    }
    if (!knownEconomicValue && !knownMilitaryValue && explorationValue < 20 && !earlyExpansionMode) {
      score -= 90;
    }
    return score;
  };

  const candidates: Array<{ score: number; from: Tile; to: Tile }> = [];
  for (const tileKey of actor.territoryTiles) {
    const [x, y] = parseKey(tileKey);
    const from = playerTile(x, y);
    for (const to of aiFrontierActionCandidates(actor, from, kind)) {
      if (to.terrain !== "LAND" || !filter(to)) continue;
      const score = scoreFrontierAction(from, to);
      candidates.push({ score, from, to });
    }
  }
  candidates.sort((a, b) => b.score - a.score);
  const best = candidates[0];
  if (!best) return undefined;
  if (kind === "EXPAND" && earlyExpansionMode && best.score > Number.NEGATIVE_INFINITY) {
    return best;
  }
  const minScore =
    kind === "ATTACK"
      ? earlyExpansionMode
        ? 20
        : 35
      : earlyExpansionMode
        ? 0
        : economicExpansionMode
          ? 10
          : 30;
  return best.score >= minScore ? best : undefined;
};

const bestAiOpeningScoutExpand = (actor: Player): { from: Tile; to: Tile } | undefined => {
  let settledTileCount = 0;
  for (const tileKey of actor.territoryTiles) {
    if (ownershipStateByTile.get(tileKey) === "SETTLED") settledTileCount += 1;
  }
  if (settledTileCount > 2) return undefined;

  const visibility = visibilitySnapshotForPlayer(actor);
  const candidates: Array<{ score: number; from: Tile; to: Tile }> = [];
  for (const tileKey of actor.territoryTiles) {
    const [x, y] = parseKey(tileKey);
    const from = playerTile(x, y);
    for (const to of aiFrontierActionCandidates(actor, from, "EXPAND")) {
      if (to.terrain !== "LAND" || to.ownerId) continue;
      const scoutRevealTiles = new Set<TileKey>();
      for (const next of adjacentNeighborCores(to.x, to.y)) {
        if (next.terrain !== "LAND") continue;
        if (!visibleInSnapshot(visibility, next.x, next.y)) scoutRevealTiles.add(key(next.x, next.y));
        for (const secondRing of adjacentNeighborCores(next.x, next.y)) {
          if (secondRing.terrain !== "LAND") continue;
          if (!visibleInSnapshot(visibility, secondRing.x, secondRing.y)) scoutRevealTiles.add(key(secondRing.x, secondRing.y));
        }
      }
      const unseenNeighbors = scoutRevealTiles.size;
      const ownedNeighbors = adjacentNeighborCores(to.x, to.y).reduce((count, next) => {
        if (next.ownerId !== actor.id) return count;
        return count + 1;
      }, 0);
      const alliedSettledNeighbors = adjacentNeighborCores(to.x, to.y).reduce((count, next) => {
        if (next.ownerId !== actor.id || next.ownershipState !== "SETTLED") return count;
        return count + 1;
      }, 0);
      const frontierNeighbors = adjacentNeighborCores(to.x, to.y).reduce((count, next) => {
        if (next.ownerId !== actor.id || next.ownershipState !== "FRONTIER") return count;
        return count + 1;
      }, 0);
      const exposedSides = adjacentNeighborCores(to.x, to.y).reduce((count, next) => {
        if (next.terrain !== "LAND") return count + 1;
        if (!next.ownerId || next.ownerId !== actor.id) return count + 1;
        return count;
      }, 0);
      const coastlineDiscoveryValue = adjacentNeighborCores(to.x, to.y).reduce((score, next) => {
        if (next.terrain !== "SEA") return score;
        return score + 18;
      }, 0);
      const score =
        unseenNeighbors * 26 +
        coastlineDiscoveryValue +
        (ownedNeighbors <= 2 ? 16 : 0) +
        (from.ownershipState === "FRONTIER" ? 10 : 0) -
        Math.max(0, ownedNeighbors - 2) * 34 -
        Math.max(0, alliedSettledNeighbors - 1) * 20 -
        Math.max(0, frontierNeighbors - 1) * 12 -
        exposedSides * 4;
      candidates.push({ score, from, to });
    }
  }
  candidates.sort((a, b) => b.score - a.score);
  return candidates[0];
};

const scoreAiScoutExpandCandidate = (actor: Player, from: Tile, to: Tile, visibility = visibilitySnapshotForPlayer(actor)): number => {
  const scoutRevealTiles = new Set<TileKey>();
  for (const next of adjacentNeighborCores(to.x, to.y)) {
    if (next.terrain !== "LAND") continue;
    if (!visibleInSnapshot(visibility, next.x, next.y)) scoutRevealTiles.add(key(next.x, next.y));
    for (const secondRing of adjacentNeighborCores(next.x, next.y)) {
      if (secondRing.terrain !== "LAND") continue;
      if (!visibleInSnapshot(visibility, secondRing.x, secondRing.y)) scoutRevealTiles.add(key(secondRing.x, secondRing.y));
    }
  }
  const unseenNeighbors = scoutRevealTiles.size;
  const ownedNeighbors = adjacentNeighborCores(to.x, to.y).reduce((count, next) => {
    if (next.ownerId !== actor.id) return count;
    return count + 1;
  }, 0);
  const alliedSettledNeighbors = adjacentNeighborCores(to.x, to.y).reduce((count, next) => {
    if (next.ownerId !== actor.id || next.ownershipState !== "SETTLED") return count;
    return count + 1;
  }, 0);
  const frontierNeighbors = adjacentNeighborCores(to.x, to.y).reduce((count, next) => {
    if (next.ownerId !== actor.id || next.ownershipState !== "FRONTIER") return count;
    return count + 1;
  }, 0);
  const coastlineDiscoveryValue = adjacentNeighborCores(to.x, to.y).reduce((score, next) => {
    if (next.terrain !== "SEA") return score;
    return score + 18;
  }, 0);
  return (
    unseenNeighbors * 18 +
    coastlineDiscoveryValue +
    (ownedNeighbors <= 2 ? 16 : 0) +
    (from.ownershipState === "FRONTIER" ? 10 : 0) -
    Math.max(0, ownedNeighbors - 2) * 34 -
    Math.max(0, alliedSettledNeighbors - 1) * 20 -
    Math.max(0, frontierNeighbors - 1) * 12
  );
};

const bestAiScoutExpand = (actor: Player): { from: Tile; to: Tile } | undefined => {
  const visibility = visibilitySnapshotForPlayer(actor);
  const candidates: Array<{ score: number; from: Tile; to: Tile }> = [];
  for (const tileKey of actor.territoryTiles) {
    const [x, y] = parseKey(tileKey);
    const from = playerTile(x, y);
    for (const to of aiFrontierActionCandidates(actor, from, "EXPAND")) {
      if (to.terrain !== "LAND" || to.ownerId) continue;
      const score = scoreAiScoutExpandCandidate(actor, from, to, visibility);
      candidates.push({ score, from, to });
    }
  }
  candidates.sort((a, b) => b.score - a.score);
  const best = candidates[0];
  return best && best.score >= 30 ? best : undefined;
};

type AiFrontierOpportunityCounts = {
  economic: number;
  scout: number;
  scaffold: number;
  waste: number;
};

type AiNeutralFrontierClass = "economic" | "scaffold" | "scout" | "waste";

type AiSettlementCandidateEvaluation = {
  score: number;
  isEconomicallyInteresting: boolean;
  isStrategicallyInteresting: boolean;
  isDefensivelyCompact: boolean;
  supportsImmediatePlan: boolean;
  townSupportSignal: number;
  intrinsicDockValue: number;
};

const aiEconomyPriorityState = (
  actor: Player
): {
  controlledTowns: number;
  settledTiles: number;
  aiIncome: number;
  worldFlags: Set<string>;
  foodCoverageLow: boolean;
  economyWeak: boolean;
} => {
  const controlledTowns = countControlledTowns(actor.id);
  const settledTiles = [...actor.territoryTiles].filter((tileKey) => ownershipStateByTile.get(tileKey) === "SETTLED").length;
  const aiIncome = currentIncomePerMinute(actor);
  const worldFlags = playerWorldFlags(actor);
  const foodCoverageLow = controlledTowns > 0 && currentFoodCoverageForPlayer(actor.id) < 1.05;
  const economyWeak =
    aiIncome < (controlledTowns === 0 ? 12 : 18) ||
    (!worldFlags.has("active_town") && !worldFlags.has("active_dock") && settledTiles >= 6) ||
    foodCoverageLow;
  return { controlledTowns, settledTiles, aiIncome, worldFlags, foodCoverageLow, economyWeak };
};

const aiFoodPressureSignal = (actor: Player): number => {
  const ownedTownCount = ownedTownKeysForPlayer(actor.id).length;
  if (ownedTownCount <= 0) return 0;
  const coverage = currentFoodCoverageForPlayer(actor.id);
  if (coverage >= 1.2) return 0;
  if (coverage >= 1) return 35;
  if (coverage >= 0.85) return 80;
  return 140;
};

const aiDockStrategicSignal = (actor: Player, tile: Tile): number => {
  const dock = docksByTile.get(key(tile.x, tile.y));
  if (!dock) return 0;
  let score = 140;
  const linkedDocks = dockLinkedDestinations(dock);
  score += linkedDocks.length * 32;
  for (const linkedDock of linkedDocks) {
    const [linkedX, linkedY] = parseKey(linkedDock.tileKey);
    const linkedTile = playerTile(linkedX, linkedY);
    if (!linkedTile.ownerId) {
      score += 160;
      continue;
    }
    if (linkedTile.ownerId === actor.id) {
      score += linkedTile.ownershipState === "SETTLED" ? 70 : 110;
      continue;
    }
    if (!actor.allies.has(linkedTile.ownerId)) score += 135;
  }
  return score;
};

const aiFrontierActionCandidates = (
  actor: Player,
  from: Tile,
  actionType: BasicFrontierActionType
): Tile[] => {
  const out = new Map<TileKey, Tile>();
  for (const neighbor of adjacentNeighborCores(from.x, from.y)) {
    out.set(key(neighbor.x, neighbor.y), playerTile(neighbor.x, neighbor.y));
  }
  const fromDock = docksByTile.get(key(from.x, from.y));
  if (fromDock) {
    for (const linkedDock of dockLinkedDestinations(fromDock)) {
      const [linkedX, linkedY] = parseKey(linkedDock.tileKey);
      const linkedTile = playerTile(linkedX, linkedY);
      out.set(linkedDock.tileKey, linkedTile);
      if (actionType === "ATTACK") {
        for (const neighbor of adjacentNeighborCores(linkedTile.x, linkedTile.y)) {
          out.set(key(neighbor.x, neighbor.y), playerTile(neighbor.x, neighbor.y));
        }
      }
    }
  }
  return [...out.values()];
};

const aiEconomicFrontierSignal = (actor: Player, tile: Tile): number => {
  const visibility = visibilitySnapshotForPlayer(actor);
  const visibleToActor = (x: number, y: number): boolean => visibleInSnapshot(visibility, x, y);
  const tk = key(tile.x, tile.y);
  const foodPressure = aiFoodPressureSignal(actor);
  let score = 0;
  if (visibleToActor(tile.x, tile.y)) {
    if (townsByTile.has(tk)) score += 150;
    if (tile.resource) {
      score += 90 + baseTileValue(tile.resource);
      if (foodPressure > 0 && (tile.resource === "FARM" || tile.resource === "FISH")) score += foodPressure;
    }
    score += aiDockStrategicSignal(actor, tile);
  }
  for (const neighbor of adjacentNeighborCores(tile.x, tile.y)) {
    if (!visibleToActor(neighbor.x, neighbor.y)) continue;
    const neighborKey = key(neighbor.x, neighbor.y);
    if (townsByTile.has(neighborKey)) score += 110;
    if (neighbor.resource) {
      score += 65 + Math.floor(baseTileValue(neighbor.resource) * 0.6);
      if (foodPressure > 0 && (neighbor.resource === "FARM" || neighbor.resource === "FISH")) {
        score += Math.round(foodPressure * 0.7);
      }
    }
    if (docksByTile.has(neighborKey)) score += 95 + Math.round(aiDockStrategicSignal(actor, playerTile(neighbor.x, neighbor.y)) * 0.45);
  }
  return score;
};

const aiEnemyPressureSignal = (actor: Player, tile: Tile): number => {
  const visibility = visibilitySnapshotForPlayer(actor);
  const visibleToActor = (x: number, y: number): boolean => visibleInSnapshot(visibility, x, y);
  if (!tile.ownerId || tile.ownerId === actor.id || actor.allies.has(tile.ownerId) || tile.ownerId === BARBARIAN_OWNER_ID) return 0;
  let score = 0;
  const tk = key(tile.x, tile.y);
  const settledIntrusion = adjacentNeighborCores(tile.x, tile.y).reduce((count, neighbor) => {
    if (neighbor.terrain !== "LAND") return count;
    if (neighbor.ownerId !== actor.id || neighbor.ownershipState !== "SETTLED") return count;
    return count + 1;
  }, 0);
  const ownedIntrusion = adjacentNeighborCores(tile.x, tile.y).reduce((count, neighbor) => {
    if (neighbor.terrain !== "LAND") return count;
    if (neighbor.ownerId !== actor.id) return count;
    return count + 1;
  }, 0);
  if (ownedIntrusion > 0) {
    score += 180 + ownedIntrusion * 95 + settledIntrusion * 70;
    if (tile.ownershipState === "FRONTIER") score += 260;
  }
  if (settledIntrusion > 0) {
    score += 120 + settledIntrusion * 60;
  }
  if (visibleToActor(tile.x, tile.y)) {
    if (townsByTile.has(tk)) score += 180;
    if (tile.resource) score += 110 + baseTileValue(tile.resource);
    if (docksByTile.has(tk)) score += 150;
  }
  for (const neighbor of adjacentNeighborCores(tile.x, tile.y)) {
    if (!visibleToActor(neighbor.x, neighbor.y)) continue;
    const neighborKey = key(neighbor.x, neighbor.y);
    if (townsByTile.has(neighborKey)) score += 125;
    if (neighbor.resource) score += 85 + Math.floor(baseTileValue(neighbor.resource) * 0.7);
    if (docksByTile.has(neighborKey)) score += 110;
    for (const secondRing of adjacentNeighborCores(neighbor.x, neighbor.y)) {
      if (!visibleToActor(secondRing.x, secondRing.y)) continue;
      const secondRingKey = key(secondRing.x, secondRing.y);
      if (townsByTile.has(secondRingKey)) score += 45;
      if (secondRing.resource) score += 30 + Math.floor(baseTileValue(secondRing.resource) * 0.35);
      if (docksByTile.has(secondRingKey)) score += 40;
    }
  }
  return score;
};

const evaluateAiSettlementCandidate = (
  actor: Player,
  tile: Tile,
  victoryPath?: AiSeasonVictoryPathId,
  assumedFrontierKeys?: ReadonlySet<TileKey>
): AiSettlementCandidateEvaluation => {
  const tk = key(tile.x, tile.y);
  const assumedOwned = assumedFrontierKeys?.has(tk) ?? false;
  const actualOwnerId = assumedOwned ? actor.id : tile.ownerId;
  const actualOwnershipState = assumedOwned ? "FRONTIER" : tile.ownershipState;
  if (tile.terrain !== "LAND" || actualOwnerId !== actor.id || actualOwnershipState !== "FRONTIER") {
    return {
      score: Number.NEGATIVE_INFINITY,
      isEconomicallyInteresting: false,
      isStrategicallyInteresting: false,
      isDefensivelyCompact: false,
      supportsImmediatePlan: false,
      townSupportSignal: 0,
      intrinsicDockValue: 0
    };
  }

  const neighborOwnership = (neighbor: RuntimeTileCore): { ownerId: string | undefined; ownershipState: OwnershipState | undefined } => {
    const neighborKey = key(neighbor.x, neighbor.y);
    if (assumedFrontierKeys?.has(neighborKey)) {
      return { ownerId: actor.id, ownershipState: "FRONTIER" };
    }
    return { ownerId: neighbor.ownerId, ownershipState: neighbor.ownershipState };
  };

  const isTown = townsByTile.has(tk);
  const resourceValue = tile.resource ? baseTileValue(tile.resource) : 0;
  const economicFrontierSignal = aiEconomicFrontierSignal(actor, tile);
  const foodPressure = aiFoodPressureSignal(actor);
  const dockValue = docksByTile.has(tk) ? aiDockStrategicSignal(actor, tile) : 0;
  let townSupportSignal = 0;
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      if (dx === 0 && dy === 0) continue;
      const nx = wrapX(tile.x + dx, WORLD_WIDTH);
      const ny = wrapY(tile.y + dy, WORLD_HEIGHT);
      if (terrainAt(nx, ny) !== "LAND") continue;
      const neighborKey = key(nx, ny);
      if (!townsByTile.has(neighborKey)) continue;
      if (ownership.get(neighborKey) !== actor.id || ownershipStateByTile.get(neighborKey) !== "SETTLED") continue;
      const support = townSupport(neighborKey, actor.id);
      const deficit = Math.max(0, support.supportMax - support.supportCurrent);
      if (deficit <= 0) continue;
      townSupportSignal += 60 + deficit * 18;
    }
  }
  const foodSettlementSignal =
    foodPressure > 0 && (tile.resource === "FARM" || tile.resource === "FISH") ? Math.round(foodPressure * 0.9) : 0;
  const adjacentInteresting = adjacentNeighborCores(tile.x, tile.y).reduce((score, neighbor) => {
    const neighborKey = key(neighbor.x, neighbor.y);
    const hostileOwner = neighbor.ownerId && neighbor.ownerId !== actor.id && !actor.allies.has(neighbor.ownerId);
    if (townsByTile.has(neighborKey) && hostileOwner) return score + 35;
    if (neighbor.resource && hostileOwner) return score + Math.max(12, baseTileValue(neighbor.resource) / 2);
    if (docksByTile.has(neighborKey) && hostileOwner) return score + 28;
    return score;
  }, 0);
  const exposedSides = adjacentNeighborCores(tile.x, tile.y).reduce((count, neighbor) => {
    const ownership = neighborOwnership(neighbor);
    if (neighbor.terrain !== "LAND") return count + 1;
    if (!ownership.ownerId || ownership.ownerId !== actor.id) return count + 1;
    return count;
  }, 0);
  const ownedNeighbors = adjacentNeighborCores(tile.x, tile.y).reduce((count, neighbor) => {
    const ownership = neighborOwnership(neighbor);
    if (ownership.ownerId !== actor.id) return count;
    return count + 1;
  }, 0);
  const alliedSettledNeighbors = adjacentNeighborCores(tile.x, tile.y).reduce((count, neighbor) => {
    const ownership = neighborOwnership(neighbor);
    if (ownership.ownerId !== actor.id || ownership.ownershipState !== "SETTLED") return count;
    return count + 1;
  }, 0);
  const alliedFrontierNeighbors = adjacentNeighborCores(tile.x, tile.y).reduce((count, neighbor) => {
    const ownership = neighborOwnership(neighbor);
    if (ownership.ownerId !== actor.id || ownership.ownershipState !== "FRONTIER") return count;
    return count + 1;
  }, 0);
  const defensiveShapeValue =
    alliedSettledNeighbors * 22 +
    alliedFrontierNeighbors * 10 -
    exposedSides * 14 +
    (ownedNeighbors >= 3 ? 24 : 0) +
    (exposedSides <= 1 ? 18 : 0);
  const connectedCoreValue = alliedSettledNeighbors >= 2 ? 24 : alliedSettledNeighbors >= 1 ? 10 : -10;
  const isEconomicallyInteresting =
    isTown || Boolean(tile.resource) || dockValue > 0 || economicFrontierSignal >= 95 || townSupportSignal > 0;
  const isDefensivelyCompact = ownedNeighbors >= 3 && exposedSides <= 1;
  const isStrategicallyInteresting = adjacentInteresting >= 35 || defensiveShapeValue >= 26 || townSupportSignal > 0;

  let score = 0;
  if (isTown) score += 140;
  score += resourceValue * 1.5;
  score += foodSettlementSignal;
  score += dockValue;
  score += economicFrontierSignal;
  score += townSupportSignal;
  score += adjacentInteresting;
  score += defensiveShapeValue + connectedCoreValue;
  if (victoryPath === "SETTLED_TERRITORY") score += 25;
  if (victoryPath === "ECONOMIC_HEGEMONY") score += resourceValue + dockValue + (isTown ? 30 : 0);
  if (!isEconomicallyInteresting && !isStrategicallyInteresting) score -= 120;
  if (ownedNeighbors <= 1 && !isEconomicallyInteresting) score -= 70;
  if (exposedSides >= 3 && !isEconomicallyInteresting && adjacentInteresting < 25) score -= 55;

  const supportsImmediatePlan =
    isEconomicallyInteresting ||
    isDefensivelyCompact ||
    townSupportSignal > 0 ||
    score >= (victoryPath === "SETTLED_TERRITORY" ? 36 : 58);

  return {
    score,
    isEconomicallyInteresting,
    isStrategicallyInteresting,
    isDefensivelyCompact,
    supportsImmediatePlan,
    townSupportSignal,
    intrinsicDockValue: dockValue
  };
};

const isAiVisibleEconomicFrontierTile = (actor: Player, tile: Tile): boolean => {
  return aiEconomicFrontierSignal(actor, tile) >= 95;
};

const classifyAiNeutralFrontierOpportunity = (
  actor: Player,
  from: Tile,
  to: Tile,
  victoryPath?: AiSeasonVictoryPathId
): AiNeutralFrontierClass => {
  if (isAiVisibleEconomicFrontierTile(actor, to)) return "economic";
  const scaffoldEvaluation = evaluateAiSettlementCandidate(actor, to, victoryPath, new Set<TileKey>([key(to.x, to.y)]));
  if (scaffoldEvaluation.supportsImmediatePlan && scaffoldEvaluation.score >= 45) return "scaffold";
  if (scoreAiScoutExpandCandidate(actor, from, to) >= 30) return "scout";
  return "waste";
};

const bestAiScaffoldExpand = (actor: Player, victoryPath?: AiSeasonVictoryPathId): { from: Tile; to: Tile } | undefined => {
  const { economyWeak, foodCoverageLow } = aiEconomyPriorityState(actor);
  const candidates: Array<{ score: number; from: Tile; to: Tile }> = [];
  for (const tileKey of actor.territoryTiles) {
    const [x, y] = parseKey(tileKey);
    const from = playerTile(x, y);
    for (const to of aiFrontierActionCandidates(actor, from, "EXPAND")) {
      if (to.terrain !== "LAND" || to.ownerId) continue;
      const evaluation = evaluateAiSettlementCandidate(actor, to, victoryPath, new Set<TileKey>([key(to.x, to.y)]));
      if (!evaluation.supportsImmediatePlan) continue;
      if ((economyWeak || foodCoverageLow) && !evaluation.isEconomicallyInteresting) continue;
      let score = evaluation.score;
      if (evaluation.isDefensivelyCompact) score += 30;
      if (evaluation.isEconomicallyInteresting) score += 25;
      if (from.ownershipState === "SETTLED") score += 8;
      candidates.push({ score, from, to });
    }
  }
  candidates.sort((a, b) => b.score - a.score);
  const best = candidates[0];
  return best && best.score >= 45 ? best : undefined;
};

const bestAiEconomicExpand = (actor: Player, victoryPath?: AiSeasonVictoryPathId): { from: Tile; to: Tile } | undefined => {
  return bestAiFrontierAction(actor, "EXPAND", (tile) => !tile.ownerId && isAiVisibleEconomicFrontierTile(actor, tile), victoryPath);
};

const bestAiEnemyPressureAttack = (
  actor: Player,
  victoryPath?: AiSeasonVictoryPathId
): { from: Tile; to: Tile; score: number } | undefined => {
  const candidates: Array<{ from: Tile; to: Tile; score: number }> = [];
  for (const tileKey of actor.territoryTiles) {
    const [x, y] = parseKey(tileKey);
    const from = playerTile(x, y);
    for (const to of aiFrontierActionCandidates(actor, from, "ATTACK")) {
      if (
        to.terrain !== "LAND" ||
        !to.ownerId ||
        to.ownerId === actor.id ||
        to.ownerId === BARBARIAN_OWNER_ID ||
        actor.allies.has(to.ownerId)
      ) {
        continue;
      }
      const signal = aiEnemyPressureSignal(actor, to);
      if (signal <= 0) continue;
      let score = signal;
      const defender = players.get(to.ownerId);
      const attackBase = 10 * actor.mods.attack * activeAttackBuffMult(actor.id) * attackMultiplierForTarget(actor.id, to);
      const defenseBase =
        10 *
        (defender?.mods.defense ?? 1) *
        (defender ? playerDefensiveness(defender) : 1) *
        (defender ? fortDefenseMultAt(defender.id, key(to.x, to.y)) : 1) *
        (docksByTile.has(key(to.x, to.y)) ? DOCK_DEFENSE_MULT : 1) *
        (defender ? settledDefenseMultiplierForTarget(defender.id, to) : 1) *
        ownershipDefenseMultiplierForTarget(to);
      const winChance = combatWinChance(attackBase, defenseBase);
      score += Math.round(winChance * 220);
      if (to.ownershipState === "FRONTIER") score += 120;
      if (victoryPath === "TOWN_CONTROL") score += 45;
      if (victoryPath === "ECONOMIC_HEGEMONY") score += 20;
      candidates.push({ from, to, score });
    }
  }
  candidates.sort((a, b) => b.score - a.score);
  const best = candidates[0];
  return best && best.score >= 80 ? best : undefined;
};

const aiFrontierOpportunityCounts = (actor: Player, victoryPath?: AiSeasonVictoryPathId): AiFrontierOpportunityCounts => {
  const counts: AiFrontierOpportunityCounts = {
    economic: 0,
    scout: 0,
    scaffold: 0,
    waste: 0
  };
  for (const tileKey of actor.territoryTiles) {
    const [x, y] = parseKey(tileKey);
    const from = playerTile(x, y);
    for (const to of aiFrontierActionCandidates(actor, from, "EXPAND")) {
      if (to.terrain !== "LAND" || to.ownerId) continue;
      const frontierClass = classifyAiNeutralFrontierOpportunity(actor, from, to, victoryPath);
      counts[frontierClass] += 1;
    }
  }
  return counts;
};

const bestAiSettlementTile = (actor: Player, victoryPath?: AiSeasonVictoryPathId): Tile | undefined => {
  const { foodCoverageLow, economyWeak } = aiEconomyPriorityState(actor);
  const underThreat = [...actor.territoryTiles].some((tileKey) => {
    const [x, y] = parseKey(tileKey);
    if (ownershipStateByTile.get(tileKey) !== "SETTLED") return false;
    return adjacentNeighborCores(x, y).some((neighbor) => {
      if (neighbor.terrain !== "LAND") return false;
      if (!neighbor.ownerId || neighbor.ownerId === actor.id || actor.allies.has(neighbor.ownerId)) return false;
      return true;
    });
  });
  const frontierTiles = [...actor.territoryTiles]
    .filter((tileKey) => ownershipStateByTile.get(tileKey) === "FRONTIER")
    .map((tileKey) => {
      const [x, y] = parseKey(tileKey);
      const tile = playerTile(x, y);
      const evaluation = evaluateAiSettlementCandidate(actor, tile, victoryPath);
      return {
        tile,
        ...evaluation,
        hasIntrinsicEconomicValue: townsByTile.has(tileKey) || Boolean(tile.resource) || docksByTile.has(tileKey),
        priorityScore:
          evaluation.score +
          ((townsByTile.has(tileKey) || Boolean(tile.resource) || docksByTile.has(tileKey)) ? 480 : 0) +
          (evaluation.townSupportSignal > 0 ? 520 + evaluation.townSupportSignal : 0)
      };
    })
    .sort((a, b) => b.priorityScore - a.priorityScore || b.score - a.score);
  const best = frontierTiles[0];
  if (!best) return undefined;
  if (!best.isEconomicallyInteresting && !best.isStrategicallyInteresting) return undefined;
  if (
    (economyWeak || underThreat || foodCoverageLow) &&
    !best.hasIntrinsicEconomicValue &&
    best.tile.resource !== "FARM" &&
    best.tile.resource !== "FISH" &&
    best.townSupportSignal <= 0
  ) {
    return undefined;
  }
  const minScore = best.hasIntrinsicEconomicValue ? 20 : victoryPath === "SETTLED_TERRITORY" ? 32 : 55;
  return best.score >= minScore ? best.tile : undefined;
};

const bestAiFortTile = (actor: Player): Tile | undefined => {
  const fortCandidates = [...actor.territoryTiles]
    .filter((tileKey) => ownershipStateByTile.get(tileKey) === "SETTLED")
    .map((tileKey) => {
      const [x, y] = parseKey(tileKey);
      const tile = playerTile(x, y);
      const tk = key(tile.x, tile.y);
      let score = 0;
      if (townsByTile.has(tk)) score += 140;
      if (docksByTile.has(tk)) score += 120;
      if (tile.resource) score += baseTileValue(tile.resource) * 2;
      const hostileAdjacency = adjacentNeighborCores(tile.x, tile.y).reduce((count, neighbor) => {
        if (neighbor.terrain !== "LAND") return count;
        if (!neighbor.ownerId || neighbor.ownerId === actor.id || actor.allies.has(neighbor.ownerId)) return count;
        return count + 1;
      }, 0);
      score += hostileAdjacency * 24;
      return { tile, score };
    })
    .filter((entry) => isBorderTile(entry.tile.x, entry.tile.y, actor.id))
    .sort((a, b) => {
      return b.score - a.score;
    });
  const best = fortCandidates[0];
  return best && best.score >= 70 ? best.tile : undefined;
};

const bestAiEconomicStructure = (
  actor: Player
): { tile: Tile; structureType: EconomicStructureType } | undefined => {
  const stock = getOrInitStrategicStocks(actor.id);
  const candidates: Array<{ score: number; tile: Tile; structureType: EconomicStructureType }> = [];
  for (const tileKey of actor.territoryTiles) {
    if (ownershipStateByTile.get(tileKey) !== "SETTLED") continue;
    const [x, y] = parseKey(tileKey);
    const tile = playerTile(x, y);
    if (tile.economicStructure) continue;
    if (tile.resource === "FARM" || tile.resource === "FISH") {
      candidates.push({ score: 50, tile, structureType: "FARMSTEAD" });
      candidates.push({ score: 25, tile, structureType: "GRANARY" });
    } else if (tile.resource === "FUR" || tile.resource === "WOOD") {
      candidates.push({ score: 40, tile, structureType: "CAMP" });
      candidates.push({ score: 20, tile, structureType: "MARKET" });
    } else if (tile.resource === "IRON" || tile.resource === "GEMS") {
      candidates.push({ score: 45, tile, structureType: "MINE" });
      candidates.push({ score: 22, tile, structureType: "MARKET" });
    } else if (townsByTile.has(tileKey)) {
      candidates.push({ score: 35, tile, structureType: "MARKET" });
      candidates.push({ score: 18, tile, structureType: "GRANARY" });
    }
  }
  candidates.sort((a, b) => b.score - a.score);
  for (const candidate of candidates) {
    const placed = canPlaceEconomicStructure(actor, candidate.tile, candidate.structureType);
    if (!placed.ok) continue;
    if (candidate.structureType === "FARMSTEAD" && (!actor.techIds.has("agriculture") || actor.points < FARMSTEAD_BUILD_GOLD_COST || (stock.FOOD ?? 0) < FARMSTEAD_BUILD_FOOD_COST)) continue;
    if (candidate.structureType === "CAMP" && (!actor.techIds.has("leatherworking") || actor.points < CAMP_BUILD_GOLD_COST || (stock.SUPPLY ?? 0) < CAMP_BUILD_SUPPLY_COST)) continue;
    if (
      candidate.structureType === "MINE" &&
      (!actor.techIds.has("mining") ||
        actor.points < MINE_BUILD_GOLD_COST ||
        ((candidate.tile.resource === "IRON" ? stock.IRON : stock.CRYSTAL) ?? 0) < MINE_BUILD_RESOURCE_COST)
    ) continue;
    if (candidate.structureType === "MARKET" && (!actor.techIds.has("trade") || actor.points < MARKET_BUILD_GOLD_COST || (stock.CRYSTAL ?? 0) < MARKET_BUILD_CRYSTAL_COST)) continue;
    if (
      candidate.structureType === "GRANARY" &&
      (!getPlayerEffectsForPlayer(actor.id).unlockGranary || actor.points < GRANARY_BUILD_GOLD_COST || (stock.FOOD ?? 0) < GRANARY_BUILD_FOOD_COST)
    ) continue;
    return { tile: candidate.tile, structureType: candidate.structureType };
  }
  return undefined;
};

const executeAiGoapAction = (actor: Player, actionKey: string, victoryPath?: AiSeasonVictoryPathId): boolean => {
  if (actionKey === "wait_and_recover") return true;
  if (actionKey === "claim_neutral_border_tile") {
    const candidate = bestAiEconomicExpand(actor, victoryPath);
    if (!candidate) return false;
    void executeUnifiedGameplayMessage(
      actor,
      { type: "EXPAND", fromX: candidate.from.x, fromY: candidate.from.y, toX: candidate.to.x, toY: candidate.to.y },
      NOOP_WS
    );
    return true;
  }
  if (actionKey === "claim_scout_border_tile") {
    const candidate = bestAiScoutExpand(actor);
    if (!candidate) return false;
    void executeUnifiedGameplayMessage(
      actor,
      { type: "EXPAND", fromX: candidate.from.x, fromY: candidate.from.y, toX: candidate.to.x, toY: candidate.to.y },
      NOOP_WS
    );
    return true;
  }
  if (actionKey === "claim_scaffold_border_tile") {
    const candidate = bestAiScaffoldExpand(actor, victoryPath);
    if (!candidate) return false;
    void executeUnifiedGameplayMessage(
      actor,
      { type: "EXPAND", fromX: candidate.from.x, fromY: candidate.from.y, toX: candidate.to.x, toY: candidate.to.y },
      NOOP_WS
    );
    return true;
  }
  if (actionKey === "attack_barbarian_border_tile") {
    const candidate = bestAiFrontierAction(actor, "ATTACK", (tile) => tile.ownerId === BARBARIAN_OWNER_ID, victoryPath);
    if (!candidate) return false;
    void executeUnifiedGameplayMessage(
      actor,
      { type: "ATTACK", fromX: candidate.from.x, fromY: candidate.from.y, toX: candidate.to.x, toY: candidate.to.y },
      NOOP_WS
    );
    return true;
  }
  if (actionKey === "attack_enemy_border_tile") {
    const pressuredCandidate = bestAiEnemyPressureAttack(actor, victoryPath);
    const candidate =
      pressuredCandidate ??
      bestAiFrontierAction(
        actor,
        "ATTACK",
        (tile) => Boolean(tile.ownerId && tile.ownerId !== actor.id && tile.ownerId !== BARBARIAN_OWNER_ID && !actor.allies.has(tile.ownerId)),
        victoryPath
      );
    if (!candidate) return false;
    void executeUnifiedGameplayMessage(
      actor,
      { type: "ATTACK", fromX: candidate.from.x, fromY: candidate.from.y, toX: candidate.to.x, toY: candidate.to.y },
      NOOP_WS
    );
    return true;
  }
  if (actionKey === "settle_owned_frontier_tile") {
    const tile = bestAiSettlementTile(actor, victoryPath);
    if (!tile) return false;
    void executeUnifiedGameplayMessage(actor, { type: "SETTLE", x: tile.x, y: tile.y }, NOOP_WS);
    return true;
  }
  if (actionKey === "build_fort_on_exposed_tile") {
    const tile = bestAiFortTile(actor);
    if (!tile) return false;
    void executeUnifiedGameplayMessage(actor, { type: "BUILD_FORT", x: tile.x, y: tile.y }, NOOP_WS);
    return true;
  }
  if (actionKey === "build_economic_structure") {
    const candidate = bestAiEconomicStructure(actor);
    if (!candidate) return false;
    void executeUnifiedGameplayMessage(
      actor,
      { type: "BUILD_ECONOMIC_STRUCTURE", x: candidate.tile.x, y: candidate.tile.y, structureType: candidate.structureType },
      NOOP_WS
    );
    return true;
  }
  return false;
};

const setAiTurnDebug = (
  actor: Player,
  reason: string,
  extras?: Partial<Omit<AiTurnDebugEntry, "at" | "playerId" | "name" | "reason" | "points">>
): void => {
  const normalizedExtras = { ...(extras ?? {}) };
  if (normalizedExtras.primaryVictoryPath === undefined) delete normalizedExtras.primaryVictoryPath;
  if (normalizedExtras.goapGoalId === undefined) delete normalizedExtras.goapGoalId;
  if (normalizedExtras.goapActionKey === undefined) delete normalizedExtras.goapActionKey;
  if (normalizedExtras.executed === undefined) delete normalizedExtras.executed;
  if (normalizedExtras.incomePerMinute === undefined) delete normalizedExtras.incomePerMinute;
  if (normalizedExtras.controlledTowns === undefined) delete normalizedExtras.controlledTowns;
  if (normalizedExtras.settledTiles === undefined) delete normalizedExtras.settledTiles;
  if (normalizedExtras.details === undefined) delete normalizedExtras.details;
  aiTurnDebugByPlayer.set(actor.id, {
    at: now(),
    playerId: actor.id,
    name: actor.name,
    reason,
    points: actor.points,
    ...normalizedExtras
  });
};

const runAiTurn = (actor: Player): void => {
  if (!actor.isAi) return;
  actor.lastActiveAt = now();
  if (actor.T <= 0 || actor.territoryTiles.size === 0 || actor.respawnPending) {
    actor.respawnPending = false;
    spawnPlayer(actor);
    setAiTurnDebug(actor, "respawned");
    return;
  }
  const pendingCaptures = pendingCapturesByAttacker(actor.id).length;
  const pendingSettlement = hasPendingSettlementForPlayer(actor.id);
  if (pendingCaptures > 0) {
    setAiTurnDebug(actor, "waiting_on_pending_capture_resolution", {
      details: {
        pendingCaptures,
        pendingSettlement
      }
    });
    return;
  }

  const collected = collectVisibleYield(actor);
  if (collected.gold > 0 || hasPositiveStrategicBuffer(collected.strategic)) {
    sendPlayerUpdate(actor, collected.gold);
  }

  const territoryMetrics = collectPlayerCompetitionMetrics();
  const incomeByPlayer = territoryMetrics.map((metric) => ({ playerId: metric.playerId, value: metric.incomePerMinute })).sort((a, b) => b.value - a.value);
  const aiIncome = incomeByPlayer.find((entry) => entry.playerId === actor.id)?.value ?? currentIncomePerMinute(actor);
  const runnerUpIncome = incomeByPlayer.find((entry) => entry.playerId !== actor.id)?.value ?? 0;
  maybePickAiTech(actor);
  maybePickAiDomain(actor);
  const townsTarget = Math.max(1, Math.ceil(Math.max(1, townsByTile.size) * SEASON_VICTORY_TOWN_CONTROL_SHARE));
  const controlledTowns = countControlledTowns(actor.id);
  const settledTiles = [...actor.territoryTiles].filter((tileKey) => ownershipStateByTile.get(tileKey) === "SETTLED").length;
  const frontierTiles = [...actor.territoryTiles].filter((tileKey) => ownershipStateByTile.get(tileKey) === "FRONTIER").length;
  const settledTilesTarget = Math.max(1, Math.ceil(claimableLandTileCount() * SEASON_VICTORY_SETTLED_TERRITORY_SHARE));
  const worldFlags = playerWorldFlags(actor);
  const rawHostileThreat = [...actor.territoryTiles].some((tileKey) => {
    const [x, y] = parseKey(tileKey);
    const ownershipState = ownershipStateByTile.get(tileKey);
    if (ownershipState !== "SETTLED" && ownershipState !== "FRONTIER") return false;
    return adjacentNeighborCores(x, y).some((neighbor) => {
      if (neighbor.terrain !== "LAND") return false;
      if (!neighbor.ownerId || neighbor.ownerId === actor.id || actor.allies.has(neighbor.ownerId)) return false;
      return true;
    });
  });
  const underThreat = rawHostileThreat && settledTiles > 2;
  const openingScoutExpand = bestAiOpeningScoutExpand(actor);
  const bestScoutExpand = bestAiScoutExpand(actor);
  const bestBarbarianAttack = bestAiFrontierAction(actor, "ATTACK", (tile) => tile.ownerId === BARBARIAN_OWNER_ID);
  const bestEnemyAttack = bestAiFrontierAction(
    actor,
    "ATTACK",
    (tile) => Boolean(tile.ownerId && tile.ownerId !== actor.id && tile.ownerId !== BARBARIAN_OWNER_ID && !actor.allies.has(tile.ownerId))
  );
  const bestSettlement = bestAiSettlementTile(actor);
  const bestFortAnchor = bestAiFortTile(actor);
  const bestEconomicBuild = bestAiEconomicStructure(actor);
  const foodCoverage = currentFoodCoverageForPlayer(actor.id);
  const foodCoverageLow = controlledTowns > 0 && foodCoverage < 1.05;
  const economyWeak =
    aiIncome < (controlledTowns === 0 ? 12 : 18) ||
    (settledTiles >= 10 && aiIncome < 15) ||
    (!worldFlags.has("active_town") && !worldFlags.has("active_dock") && settledTiles >= 6) ||
    foodCoverageLow;
  const frontierDebt = frontierTiles >= Math.max(2, settledTiles);
  const threatCritical = underThreat && (controlledTowns > 0 || aiIncome >= 5 || frontierDebt);
  const needsFortifiedAnchor = Boolean(bestFortAnchor) && (controlledTowns > 0 || worldFlags.has("active_dock") || aiIncome >= 16);
  const preferredVictoryPath: AiSeasonVictoryPathId | undefined = economyWeak
    ? "ECONOMIC_HEGEMONY"
    : controlledTowns === 0
      ? "TOWN_CONTROL"
      : undefined;
  const primaryVictoryPath =
    preferredVictoryPath ??
    rankSeasonVictoryPaths({
      townsControlled: controlledTowns,
      townsTarget,
      incomePerMinute: aiIncome,
      incomeLeaderGap: aiIncome - runnerUpIncome,
      settledTiles,
      settledTilesTarget,
      underThreat,
      goldHealthy: canAffordGoldCost(actor.points, SETTLE_COST + FRONTIER_ACTION_GOLD_COST),
      staminaHealthy: actor.stamina >= 0
    })[0]?.id;
  const bestNeutralExpand = bestAiEconomicExpand(actor, primaryVictoryPath);
  const bestScaffoldExpand = bestAiScaffoldExpand(actor, primaryVictoryPath);
  const bestPressureAttack = bestAiEnemyPressureAttack(actor, primaryVictoryPath);
  const frontierOpportunityCounts = aiFrontierOpportunityCounts(actor, primaryVictoryPath);
  const economicPushReady = frontierOpportunityCounts.economic > 0 && Boolean(bestNeutralExpand);
  const urgentPressureAttackReady =
    Boolean(bestPressureAttack) &&
    actor.points >= FRONTIER_ACTION_GOLD_COST &&
    ((bestPressureAttack?.score ?? 0) >= 350 || (underThreat && (bestPressureAttack?.score ?? 0) >= 220));
  const pressureAttackReady =
    Boolean(bestPressureAttack) &&
    actor.points >= FRONTIER_ACTION_GOLD_COST &&
    (!threatCritical || urgentPressureAttackReady);

  if (urgentPressureAttackReady) {
    const executed = executeAiGoapAction(actor, "attack_enemy_border_tile", primaryVictoryPath);
    setAiTurnDebug(actor, executed ? "executed_pressure_counterattack_priority" : "failed_pressure_counterattack_priority", {
      incomePerMinute: aiIncome,
      controlledTowns,
      settledTiles,
      ...(primaryVictoryPath ? { primaryVictoryPath } : {}),
      goapActionKey: "attack_enemy_border_tile",
      executed,
      details: {
        enemyPressureScore: bestPressureAttack?.score ?? 0,
        underThreat,
        threatCritical,
        urgentPressureAttackReady
      }
    });
    if (executed) return;
  }

  if (foodCoverageLow && bestSettlement && canAffordGoldCost(actor.points, SETTLE_COST)) {
    const executed = executeAiGoapAction(actor, "settle_owned_frontier_tile", primaryVictoryPath);
    setAiTurnDebug(actor, executed ? "executed_food_settlement_priority" : "failed_food_settlement_priority", {
      incomePerMinute: aiIncome,
      controlledTowns,
      settledTiles,
      ...(primaryVictoryPath ? { primaryVictoryPath } : {}),
      goapActionKey: "settle_owned_frontier_tile",
      executed,
      details: {
        foodCoverage,
        foodCoverageLow,
        hasSettlementTarget: Boolean(bestSettlement),
        frontierTiles
      }
    });
    if (executed) return;
  }

  if (foodCoverageLow && economicPushReady && actor.points >= FRONTIER_ACTION_GOLD_COST) {
    const executed = executeAiGoapAction(actor, "claim_food_border_tile", primaryVictoryPath);
    setAiTurnDebug(actor, executed ? "executed_food_expand_priority" : "failed_food_expand_priority", {
      incomePerMinute: aiIncome,
      controlledTowns,
      settledTiles,
      ...(primaryVictoryPath ? { primaryVictoryPath } : {}),
      goapActionKey: "claim_food_border_tile",
      executed,
      details: {
        foodCoverage,
        foodCoverageLow,
        economicOpportunityCount: frontierOpportunityCounts.economic,
        hasNeutralLandOpportunity: Boolean(bestNeutralExpand)
      }
    });
    if (executed) return;
  }

  if ((economyWeak || frontierDebt) && bestSettlement && canAffordGoldCost(actor.points, SETTLE_COST)) {
    const executed = executeAiGoapAction(actor, "settle_owned_frontier_tile", primaryVictoryPath);
    setAiTurnDebug(actor, executed ? "executed_settlement_priority" : "failed_settlement_priority", {
      incomePerMinute: aiIncome,
      controlledTowns,
      settledTiles,
      ...(primaryVictoryPath ? { primaryVictoryPath } : {}),
      goapActionKey: "settle_owned_frontier_tile",
      executed,
      details: {
        economyWeak,
        frontierDebt,
        underThreat,
        hasSettlementTarget: Boolean(bestSettlement),
        frontierTiles
      }
    });
    if (executed) return;
  }
  if (pressureAttackReady && (primaryVictoryPath === "TOWN_CONTROL" || (bestPressureAttack?.score ?? 0) >= 150)) {
    const executed = executeAiGoapAction(actor, "attack_enemy_border_tile", primaryVictoryPath);
    setAiTurnDebug(actor, executed ? "executed_pressure_attack_priority" : "failed_pressure_attack_priority", {
      incomePerMinute: aiIncome,
      controlledTowns,
      settledTiles,
      ...(primaryVictoryPath ? { primaryVictoryPath } : {}),
      goapActionKey: "attack_enemy_border_tile",
      executed,
      details: {
        enemyPressureScore: bestPressureAttack?.score ?? 0,
        hasWeakEnemyBorder: Boolean(bestEnemyAttack),
        underThreat,
        threatCritical,
        urgentPressureAttackReady
      }
    });
    if (executed) return;
  }
  if (economyWeak && economicPushReady && actor.points >= FRONTIER_ACTION_GOLD_COST) {
    const executed = executeAiGoapAction(actor, "claim_neutral_border_tile", primaryVictoryPath);
    setAiTurnDebug(actor, executed ? "executed_economic_expand_priority" : "failed_economic_expand_priority", {
      incomePerMinute: aiIncome,
      controlledTowns,
      settledTiles,
      ...(primaryVictoryPath ? { primaryVictoryPath } : {}),
      goapActionKey: "claim_neutral_border_tile",
      executed,
      details: {
        economyWeak,
        economicOpportunityCount: frontierOpportunityCounts.economic,
        hasNeutralLandOpportunity: Boolean(bestNeutralExpand)
      }
    });
    if (executed) return;
  }
  if (economyWeak && bestEconomicBuild && !underThreat) {
    const executed = executeAiGoapAction(actor, "build_economic_structure", primaryVictoryPath);
    setAiTurnDebug(actor, executed ? "executed_economic_priority" : "failed_economic_priority", {
      incomePerMinute: aiIncome,
      controlledTowns,
      settledTiles,
      ...(primaryVictoryPath ? { primaryVictoryPath } : {}),
      goapActionKey: "build_economic_structure",
      executed,
      details: {
        economyWeak,
        underThreat,
        hasEconomicBuild: Boolean(bestEconomicBuild)
      }
    });
    if (executed) return;
  }
  if (needsFortifiedAnchor && underThreat && actor.points >= FORT_BUILD_COST) {
    const executed = executeAiGoapAction(actor, "build_fort_on_exposed_tile", primaryVictoryPath);
    setAiTurnDebug(actor, executed ? "executed_fort_priority" : "failed_fort_priority", {
      incomePerMinute: aiIncome,
      controlledTowns,
      settledTiles,
      ...(primaryVictoryPath ? { primaryVictoryPath } : {}),
      goapActionKey: "build_fort_on_exposed_tile",
      executed,
      details: {
        needsFortifiedAnchor,
        underThreat
      }
    });
    if (executed) return;
  }

  const goapState: AiEmpireGoapState = {
    hasNeutralLandOpportunity: Boolean(bestNeutralExpand),
    hasScoutOpportunity: Boolean(bestScoutExpand),
    hasScaffoldOpportunity: Boolean(bestScaffoldExpand),
    hasBarbarianTarget: Boolean(bestBarbarianAttack),
    hasWeakEnemyBorder: Boolean(bestPressureAttack ?? bestEnemyAttack),
    needsSettlement: Boolean(bestSettlement),
    frontierDebtHigh: frontierDebt,
    foodCoverageLow,
    underThreat,
    threatCritical,
    economyWeak,
    needsFortifiedAnchor,
    canAffordFrontierAction: canAffordGoldCost(actor.points, FRONTIER_ACTION_GOLD_COST),
    canAffordSettlement: canAffordGoldCost(actor.points, SETTLE_COST),
    canBuildFort: Boolean(bestFortAnchor) && actor.points >= FORT_BUILD_COST,
    canBuildEconomy: Boolean(bestEconomicBuild),
    goldHealthy: canAffordGoldCost(actor.points, SETTLE_COST + FRONTIER_ACTION_GOLD_COST),
    staminaHealthy: actor.stamina >= 0
  };

  const goapPlan = planBestGoal(goapState, goalsForVictoryPath(primaryVictoryPath), AI_EMPIRE_ACTIONS);
  const nextStep = goapPlan?.steps[0];
  if (!nextStep) {
    if (openingScoutExpand && actor.points >= FRONTIER_ACTION_GOLD_COST) {
      const executedAt = tryQueueBasicFrontierAction(
        actor,
        "EXPAND",
        openingScoutExpand.from.x,
        openingScoutExpand.from.y,
        openingScoutExpand.to.x,
        openingScoutExpand.to.y
      );
      const executed = executedAt !== undefined;
      setAiTurnDebug(actor, executed ? "executed_opening_scout" : "failed_opening_scout", {
        incomePerMinute: aiIncome,
        controlledTowns,
        settledTiles,
        ...(primaryVictoryPath ? { primaryVictoryPath } : {}),
        goapActionKey: "claim_neutral_border_tile",
        executed,
        details: {
          economyWeak,
          openingScout: true
        }
      });
      if (executed) return;
    }
    if (pressureAttackReady) {
      const executed = executeAiGoapAction(actor, "attack_enemy_border_tile", primaryVictoryPath);
      setAiTurnDebug(actor, executed ? "executed_pressure_attack_fallback" : "failed_pressure_attack_fallback", {
        incomePerMinute: aiIncome,
        controlledTowns,
        settledTiles,
        ...(primaryVictoryPath ? { primaryVictoryPath } : {}),
        goapActionKey: "attack_enemy_border_tile",
        executed,
        details: {
          enemyPressureScore: bestPressureAttack?.score ?? 0,
          hasWeakEnemyBorder: Boolean(bestEnemyAttack),
          urgentPressureAttackReady
        }
      });
      if (executed) return;
    }
    if (!economicPushReady && bestScoutExpand && actor.points >= FRONTIER_ACTION_GOLD_COST) {
      const executed = executeAiGoapAction(actor, "claim_scout_border_tile", primaryVictoryPath);
      setAiTurnDebug(actor, executed ? "executed_scout_fallback" : "failed_scout_fallback", {
        incomePerMinute: aiIncome,
        controlledTowns,
        settledTiles,
        ...(primaryVictoryPath ? { primaryVictoryPath } : {}),
        goapActionKey: "claim_scout_border_tile",
        executed,
        details: {
          economyWeak,
          hasScoutOpportunity: goapState.hasScoutOpportunity
        }
      });
      if (executed) return;
    }
    if (!economicPushReady && bestScaffoldExpand && actor.points >= FRONTIER_ACTION_GOLD_COST) {
      const executed = executeAiGoapAction(actor, "claim_scaffold_border_tile", primaryVictoryPath);
      setAiTurnDebug(actor, executed ? "executed_scaffold_fallback" : "failed_scaffold_fallback", {
        incomePerMinute: aiIncome,
        controlledTowns,
        settledTiles,
        ...(primaryVictoryPath ? { primaryVictoryPath } : {}),
        goapActionKey: "claim_scaffold_border_tile",
        executed,
        details: {
          economyWeak,
          hasScaffoldOpportunity: goapState.hasScaffoldOpportunity,
          scaffoldOpportunityCount: frontierOpportunityCounts.scaffold
        }
      });
      if (executed) return;
    }
    if (economyWeak && bestNeutralExpand && actor.points >= FRONTIER_ACTION_GOLD_COST) {
      const executed = executeAiGoapAction(actor, "claim_neutral_border_tile", primaryVictoryPath);
      setAiTurnDebug(actor, executed ? "executed_expand_fallback" : "failed_expand_fallback", {
        incomePerMinute: aiIncome,
        controlledTowns,
        settledTiles,
        ...(primaryVictoryPath ? { primaryVictoryPath } : {}),
        goapActionKey: "claim_neutral_border_tile",
        executed,
        details: {
          economyWeak,
          hasNeutralLandOpportunity: goapState.hasNeutralLandOpportunity,
          economicOpportunityCount: frontierOpportunityCounts.economic
        }
      });
      if (executed) return;
    }
    setAiTurnDebug(actor, "no_goap_step", {
      incomePerMinute: aiIncome,
      controlledTowns,
      settledTiles,
      ...(primaryVictoryPath ? { primaryVictoryPath } : {}),
      details: {
        hasNeutralLandOpportunity: goapState.hasNeutralLandOpportunity,
        hasScoutOpportunity: goapState.hasScoutOpportunity,
        hasScaffoldOpportunity: goapState.hasScaffoldOpportunity,
        hasBarbarianTarget: goapState.hasBarbarianTarget,
        hasWeakEnemyBorder: goapState.hasWeakEnemyBorder,
        enemyPressureScore: bestPressureAttack?.score ?? 0,
        needsSettlement: goapState.needsSettlement,
        frontierDebtHigh: goapState.frontierDebtHigh,
        foodCoverageLow: goapState.foodCoverageLow,
        underThreat: goapState.underThreat,
        threatCritical: goapState.threatCritical,
        economyWeak: goapState.economyWeak,
        needsFortifiedAnchor: goapState.needsFortifiedAnchor,
        canAffordFrontierAction: goapState.canAffordFrontierAction,
        canAffordSettlement: goapState.canAffordSettlement,
        canBuildFort: goapState.canBuildFort,
        canBuildEconomy: goapState.canBuildEconomy,
        goldHealthy: goapState.goldHealthy,
        economicOpportunityCount: frontierOpportunityCounts.economic,
        scoutOpportunityCount: frontierOpportunityCounts.scout,
        scaffoldOpportunityCount: frontierOpportunityCounts.scaffold,
        wasteOpportunityCount: frontierOpportunityCounts.waste
      }
    });
    return;
  }
  const executed = executeAiGoapAction(actor, nextStep.action.key, primaryVictoryPath);
  setAiTurnDebug(actor, executed ? "executed_goap_action" : "failed_goap_action", {
    incomePerMinute: aiIncome,
    controlledTowns,
    settledTiles,
    ...(primaryVictoryPath ? { primaryVictoryPath } : {}),
    goapGoalId: goapPlan.goalId,
    goapActionKey: nextStep.action.key,
    executed,
    details: {
      hasNeutralLandOpportunity: goapState.hasNeutralLandOpportunity,
      hasScoutOpportunity: goapState.hasScoutOpportunity,
      hasScaffoldOpportunity: goapState.hasScaffoldOpportunity,
      hasBarbarianTarget: goapState.hasBarbarianTarget,
      hasWeakEnemyBorder: goapState.hasWeakEnemyBorder,
      enemyPressureScore: bestPressureAttack?.score ?? 0,
      needsSettlement: goapState.needsSettlement,
      frontierDebtHigh: goapState.frontierDebtHigh,
      foodCoverageLow: goapState.foodCoverageLow,
      underThreat: goapState.underThreat,
      threatCritical: goapState.threatCritical,
      economyWeak: goapState.economyWeak,
      needsFortifiedAnchor: goapState.needsFortifiedAnchor,
      canAffordFrontierAction: goapState.canAffordFrontierAction,
      canAffordSettlement: goapState.canAffordSettlement,
      canBuildFort: goapState.canBuildFort,
      canBuildEconomy: goapState.canBuildEconomy,
      goldHealthy: goapState.goldHealthy,
      economicOpportunityCount: frontierOpportunityCounts.economic,
      scoutOpportunityCount: frontierOpportunityCounts.scout,
      scaffoldOpportunityCount: frontierOpportunityCounts.scaffold,
      wasteOpportunityCount: frontierOpportunityCounts.waste
    }
  });
};

let aiTickInFlight = false;
const queueMicrotaskFn =
  typeof setImmediate === "function"
    ? (fn: () => void): void => {
        setImmediate(fn);
      }
    : (fn: () => void): void => {
        queueMicrotask(fn);
      };

const runAiTick = (): void => {
  if (aiTickInFlight) return;
  const aiPlayers = [...players.values()].filter((actor) => actor.isAi);
  if (aiPlayers.length === 0) return;
  aiTickInFlight = true;
  let index = 0;

  const processBatch = (): void => {
    const end = Math.min(index + AI_TICK_BATCH_SIZE, aiPlayers.length);
    for (; index < end; index += 1) {
      const actor = aiPlayers[index]!;
      try {
        runAiTurn(actor);
      } catch (err) {
        logRuntimeError("ai tick failed", err);
      }
    }
    if (index < aiPlayers.length) {
      queueMicrotaskFn(processBatch);
      return;
    }
    aiTickInFlight = false;
  };

  processBatch();
};

const resolveEliminationIfNeeded = (p: Player, isOnline: boolean): void => {
  if (p.T > 0) return;
  p.isEliminated = true;
  p.points *= 0.7;
  recalcPlayerDerived(p);
  if (isOnline) spawnPlayer(p);
  else p.respawnPending = true;
};

const pendingCapturesByAttacker = (attackerId: string): PendingCapture[] => {
  const uniq = new Set<PendingCapture>();
  for (const lock of combatLocks.values()) {
    if (lock.attackerId === attackerId) uniq.add(lock);
  }
  return [...uniq];
};

const cancelPendingCapture = (capture: PendingCapture): void => {
  capture.cancelled = true;
  if (capture.timeout) clearTimeout(capture.timeout);
  combatLocks.delete(capture.origin);
  combatLocks.delete(capture.target);
};

const cancelAllBarbarianPendingCaptures = (): void => {
  const uniq = new Set<PendingCapture>();
  for (const lock of combatLocks.values()) {
    if (!lock.attackerId.startsWith(`${BARBARIAN_OWNER_ID}:`)) continue;
    uniq.add(lock);
  }
  for (const capture of uniq) cancelPendingCapture(capture);
};

const runBarbarianAction = (agent: BarbarianAgent): void => {
  const currentTile = playerTile(agent.x, agent.y);
  const currentKey = key(currentTile.x, currentTile.y);
  if (currentTile.ownerId !== BARBARIAN_OWNER_ID) {
    removeBarbarianAgent(agent.id);
    return;
  }
  if (combatLocks.has(currentKey)) {
    agent.lastActionAt = now();
    agent.nextActionAt = now() + BARBARIAN_ACTION_INTERVAL_MS;
    return;
  }
  const target = chooseBarbarianTarget(agent);
  if (!target) {
    agent.lastActionAt = now();
    agent.nextActionAt = now() + BARBARIAN_ACTION_INTERVAL_MS;
    return;
  }
  const targetKey = key(target.x, target.y);
  if (combatLocks.has(targetKey)) {
    agent.lastActionAt = now();
    agent.nextActionAt = now() + BARBARIAN_ACTION_INTERVAL_MS;
    return;
  }
  const defenderId = target.ownerId;
  if (!defenderId) {
    const oldX = agent.x;
    const oldY = agent.y;
    updateOwnership(target.x, target.y, BARBARIAN_OWNER_ID, "BARBARIAN");
    updateOwnership(oldX, oldY, undefined);
    agent.x = target.x;
    agent.y = target.y;
    agent.lastActionAt = now();
    agent.nextActionAt = now() + BARBARIAN_ACTION_INTERVAL_MS;
    upsertBarbarianAgent(agent);
    logBarbarianEvent(`expand ${agent.id} ${oldX},${oldY} -> ${target.x},${target.y}`);
    return;
  }
  if (defenderId === BARBARIAN_OWNER_ID) {
    agent.lastActionAt = now();
    agent.nextActionAt = now() + BARBARIAN_ACTION_INTERVAL_MS;
    return;
  }
  const pending: PendingCapture = {
    resolvesAt: now() + COMBAT_LOCK_MS,
    origin: currentKey,
    target: targetKey,
    attackerId: `${BARBARIAN_OWNER_ID}:${agent.id}`,
    staminaCost: 0,
    cancelled: false
  };
  combatLocks.set(currentKey, pending);
  combatLocks.set(targetKey, pending);
  logBarbarianEvent(`attack-start ${agent.id} ${currentTile.x},${currentTile.y} -> ${target.x},${target.y}`);
  if (defenderId && defenderId !== BARBARIAN_OWNER_ID) {
    sendToPlayer(defenderId, {
      type: "ATTACK_ALERT",
      attackerId: BARBARIAN_OWNER_ID,
      attackerName: "Barbarians",
      x: target.x,
      y: target.y,
      resolvesAt: pending.resolvesAt
    });
  }
  pending.timeout = setTimeout(() => {
    if (pending.cancelled) return;
    if (!hasOnlinePlayers()) {
      cancelPendingCapture(pending);
      return;
    }
    combatLocks.delete(currentKey);
    combatLocks.delete(targetKey);
    const live = barbarianAgents.get(agent.id);
    if (!live) return;
    const liveTile = runtimeTileCore(live.x, live.y);
    if (liveTile.ownerId !== BARBARIAN_OWNER_ID || key(liveTile.x, liveTile.y) !== currentKey) return;
    const currentTarget = playerTile(target.x, target.y);
    if (!currentTarget.ownerId || currentTarget.ownerId === BARBARIAN_OWNER_ID) {
      live.lastActionAt = now();
      live.nextActionAt = now() + BARBARIAN_ACTION_INTERVAL_MS;
      upsertBarbarianAgent(live);
      return;
    }
    const defender = players.get(currentTarget.ownerId);
    if (!defender) {
      live.lastActionAt = now();
      live.nextActionAt = now() + BARBARIAN_ACTION_INTERVAL_MS;
      upsertBarbarianAgent(live);
      return;
    }
    const shock = breachShockByTile.get(targetKey);
    const shockMult = shock && shock.ownerId === defender.id && shock.expiresAt > now() ? BREACH_SHOCK_DEF_MULT : 1;
    const fortMult = fortDefenseMultAt(defender.id, targetKey);
    const dockMult = docksByTile.has(targetKey) ? DOCK_DEFENSE_MULT : 1;
    const atkEff = 10 * BARBARIAN_ATTACK_POWER * randomFactor();
    const defEff =
      10 *
      BARBARIAN_DEFENSE_POWER *
      defender.mods.defense *
      playerDefensiveness(defender) *
      shockMult *
      fortMult *
      dockMult *
      settledDefenseMultiplierForTarget(defender.id, currentTarget) *
      settlementDefenseMultAt(defender.id, targetKey) *
      ownershipDefenseMultiplierForTarget(currentTarget) *
      randomFactor();
    const win = Math.random() < combatWinChance(atkEff, defEff);
    const progressBefore = live.progress;
    if (!win) {
      live.lastActionAt = now();
      live.nextActionAt = now() + BARBARIAN_ACTION_INTERVAL_MS;
      upsertBarbarianAgent(live);
      logBarbarianEvent(`attack-loss ${live.id} @ ${live.x},${live.y} vs ${target.x},${target.y}`);
      return;
    }
    const gain = getBarbarianProgressGain(currentTarget);
    live.progress += gain;
    logBarbarianEvent(`progress ${live.id} ${progressBefore} -> ${live.progress} at ${target.x},${target.y}`);
    const shouldMultiply = live.progress >= BARBARIAN_MULTIPLY_THRESHOLD;
    const oldX = live.x;
    const oldY = live.y;
    updateOwnership(target.x, target.y, BARBARIAN_OWNER_ID, "BARBARIAN");
    live.x = target.x;
    live.y = target.y;
    if (shouldMultiply) {
      updateOwnership(oldX, oldY, BARBARIAN_OWNER_ID, "BARBARIAN");
      spawnBarbarianAgentAt(oldX, oldY, 0);
      live.progress = 0;
      logBarbarianEvent(`multiply ${live.id} @ ${oldX},${oldY} after capture ${target.x},${target.y}`);
    } else {
      updateOwnership(oldX, oldY, undefined);
    }
    live.lastActionAt = now();
    live.nextActionAt = now() + BARBARIAN_ACTION_INTERVAL_MS;
    upsertBarbarianAgent(live);
    recalcPlayerDerived(defender);
    updateMissionState(defender);
    resolveEliminationIfNeeded(defender, socketsByPlayer.has(defender.id));
    logBarbarianEvent(`attack-win ${live.id} now @ ${live.x},${live.y} after ${target.x},${target.y}`);
  }, COMBAT_LOCK_MS);
};

const runBarbarianTick = (): void => {
  if (!hasOnlinePlayers()) return;
  const current = [...barbarianAgents.values()];
  for (const agent of current) {
    const live = barbarianAgents.get(agent.id);
    if (!live) continue;
    if (now() < live.nextActionAt) continue;
    if (!isVisibleToAnyOnlinePlayer(live.x, live.y)) {
      live.lastActionAt = now();
      live.nextActionAt = now() + BARBARIAN_ACTION_INTERVAL_MS;
      upsertBarbarianAgent(live);
      continue;
    }
    runBarbarianAction(live);
  }
};

const broadcast = (payload: unknown): void => {
  const serialized = JSON.stringify(payload);
  for (const ws of socketsByPlayer.values()) {
    if (ws.readyState === ws.OPEN) ws.send(serialized);
  }
};

const recomputeExposure = (p: Player): void => {
  let T = 0;
  let E = 0;
  let Ts = 0;
  let Es = 0;
  for (const tileKey of p.territoryTiles) {
    const [x, y] = parseKey(tileKey);
    const self = runtimeTileCore(x, y);
    if (self.ownerId !== p.id || self.terrain !== "LAND") continue;
    T += 1;
    const n = cardinalNeighborCores(x, y);
    let exposedSides = 0;
    for (const tile of n) {
      if (tile.terrain !== "LAND") continue;
      if (tile.ownerId === p.id) continue;
      if (tile.ownerId && p.allies.has(tile.ownerId)) continue;
      exposedSides += 1;
    }
    E += exposureWeightFromSides(exposedSides);

    if (self.ownershipState !== "SETTLED") continue;
    Ts += 1;
    let settledExposedSides = 0;
    for (const tile of n) {
      if (tile.terrain !== "LAND") continue;
      const isSameOrAllied = tile.ownerId === p.id || Boolean(tile.ownerId && p.allies.has(tile.ownerId));
      if (isSameOrAllied) continue;
      settledExposedSides += 1;
    }
    Es += settledExposedSides;
  }
  p.T = T;
  p.E = E;
  p.Ts = Ts;
  p.Es = Es;
};

const broadcastAllianceUpdate = (a: Player, b: Player): void => {
  const wa = socketsByPlayer.get(a.id);
  const wb = socketsByPlayer.get(b.id);
  wa?.send(JSON.stringify({ type: "ALLIANCE_UPDATE", allies: [...a.allies] }));
  wb?.send(JSON.stringify({ type: "ALLIANCE_UPDATE", allies: [...b.allies] }));
};

const exportPlayerStyles = (): Array<{ id: string; name: string; tileColor?: string; visualStyle: EmpireVisualStyle }> => {
  return [...players.values()].map((p) => {
    const out: { id: string; name: string; tileColor?: string; visualStyle: EmpireVisualStyle } = {
      id: p.id,
      name: p.name,
      visualStyle: empireStyleFromPlayer(p)
    };
    if (p.tileColor) out.tileColor = p.tileColor;
    return out;
  });
};

const chunkCountX = Math.ceil(WORLD_WIDTH / CHUNK_SIZE);
const chunkCountY = Math.ceil(WORLD_HEIGHT / CHUNK_SIZE);
const wrapChunkX = (cx: number): number => ((cx % chunkCountX) + chunkCountX) % chunkCountX;
const wrapChunkY = (cy: number): number => ((cy % chunkCountY) + chunkCountY) % chunkCountY;
const tileIndex = (x: number, y: number): number => y * WORLD_WIDTH + x;
const CHUNK_SNAPSHOT_WARN_MS = 60;
const CHUNK_SNAPSHOT_BATCH_SIZE = 4;
const chunkDist = (a: number, b: number, mod: number): number => {
  const d = Math.abs(a - b);
  return Math.min(d, mod - d);
};

interface VisibilitySnapshot {
  allVisible: boolean;
  visibleMask: Uint8Array;
}

const buildVisibilitySnapshot = (p: Player): VisibilitySnapshot => {
  if (DISABLE_FOG || fogDisabledByPlayer.get(p.id) === true) {
    return { allVisible: true, visibleMask: new Uint8Array(0) };
  }

  const visibleMask = new Uint8Array(WORLD_WIDTH * WORLD_HEIGHT);
  const forced = forcedRevealTilesByPlayer.get(p.id);
  if (forced) {
    for (const tk of forced) {
      const [fx, fy] = parseKey(tk);
      visibleMask[tileIndex(fx, fy)] = 1;
    }
  }
  const revealTargets = revealedEmpireTargetsByPlayer.get(p.id);
  if (revealTargets && revealTargets.size > 0) {
    for (const targetId of revealTargets) {
      const target = players.get(targetId);
      if (!target) continue;
      for (const tk of target.territoryTiles) {
        const [rx, ry] = parseKey(tk);
        visibleMask[tileIndex(rx, ry)] = 1;
      }
    }
  }

  const radius = effectiveVisionRadiusForPlayer(p);
  for (const tk of p.territoryTiles) {
    const [tx, ty] = parseKey(tk);
    for (let dy = -radius; dy <= radius; dy += 1) {
      for (let dx = -radius; dx <= radius; dx += 1) {
        const vx = wrapX(tx + dx, WORLD_WIDTH);
        const vy = wrapY(ty + dy, WORLD_HEIGHT);
        visibleMask[tileIndex(vx, vy)] = 1;
      }
    }
  }

  return { allVisible: false, visibleMask };
};

const visibilitySnapshotForPlayer = (player: Player): VisibilitySnapshot => {
  const cached = cachedVisibilitySnapshotByPlayer.get(player.id);
  if (cached) return cached;
  const snapshot = buildVisibilitySnapshot(player);
  cachedVisibilitySnapshotByPlayer.set(player.id, snapshot);
  return snapshot;
};

const visibleInSnapshot = (snapshot: VisibilitySnapshot, x: number, y: number): boolean => {
  if (snapshot.allVisible) return true;
  return snapshot.visibleMask[tileIndex(x, y)] === 1;
};

const sendChunkSnapshot = (socket: Ws, actor: Player, sub: { cx: number; cy: number; radius: number }): void => {
  const startedAt = now();
  const snapshot = visibilitySnapshotForPlayer(actor);
  const cachedSnapshot = cachedChunkSnapshotByPlayer.get(actor.id);
  if (
    cachedSnapshot &&
    cachedSnapshot.cx === sub.cx &&
    cachedSnapshot.cy === sub.cy &&
    cachedSnapshot.radius === sub.radius &&
    cachedSnapshot.visibility === snapshot
  ) {
    for (const payload of cachedSnapshot.payloads) socket.send(payload);
    chunkSnapshotSentAtByPlayer.set(actor.id, { cx: sub.cx, cy: sub.cy, radius: sub.radius, sentAt: now() });
    return;
  }
  const chunkBatch: Array<{ cx: number; cy: number; tilesMaskedByFog: Tile[] }> = [];
  const serializedPayloads: string[] = [];
  const fallbackLastChangedAt = now();
  let chunkCount = 0;
  let tileCount = 0;

  const flushChunkBatch = (): void => {
    if (chunkBatch.length === 0) return;
    if (chunkBatch.length === 1) {
      const chunk = chunkBatch[0]!;
      const payload = JSON.stringify({ type: "CHUNK_FULL", cx: chunk.cx, cy: chunk.cy, tilesMaskedByFog: chunk.tilesMaskedByFog });
      socket.send(payload);
      serializedPayloads.push(payload);
    } else {
      const payload = JSON.stringify({ type: "CHUNK_BATCH", chunks: chunkBatch });
      socket.send(payload);
      serializedPayloads.push(payload);
    }
    chunkBatch.length = 0;
  };

  for (let cy = sub.cy - sub.radius; cy <= sub.cy + sub.radius; cy += 1) {
    for (let cx = sub.cx - sub.radius; cx <= sub.cx + sub.radius; cx += 1) {
      const worldCx = wrapChunkX(cx);
      const worldCy = wrapChunkY(cy);
      const startX = worldCx * CHUNK_SIZE;
      const startY = worldCy * CHUNK_SIZE;
      const chunkTiles: Tile[] = [];

      for (let y = startY; y < startY + CHUNK_SIZE; y += 1) {
        for (let x = startX; x < startX + CHUNK_SIZE; x += 1) {
          tileCount += 1;
          const wx = wrapX(x, WORLD_WIDTH);
          const wy = wrapY(y, WORLD_HEIGHT);
          const tk = key(wx, wy);
          if (visibleInSnapshot(snapshot, wx, wy)) {
            const tile = playerTile(wx, wy);
            tile.fogged = false;
            chunkTiles.push(tile);
          } else {
            const fogTile: Tile = {
              x: wx,
              y: wy,
              terrain: terrainAtRuntime(wx, wy),
              fogged: true,
              lastChangedAt: fallbackLastChangedAt
            };
            const dock = docksByTile.get(tk);
            const clusterId = clusterByTile.get(tk);
            const clusterType = clusterId ? clustersById.get(clusterId)?.clusterType : undefined;
            if (dock) fogTile.dockId = dock.dockId;
            if (clusterId) fogTile.clusterId = clusterId;
            if (clusterType) fogTile.clusterType = clusterType;
            chunkTiles.push(fogTile);
          }
        }
      }

      chunkBatch.push({ cx: worldCx, cy: worldCy, tilesMaskedByFog: chunkTiles });
      chunkCount += 1;
      if (chunkBatch.length >= CHUNK_SNAPSHOT_BATCH_SIZE) flushChunkBatch();
    }
  }
  flushChunkBatch();

  const elapsed = now() - startedAt;
  cachedChunkSnapshotByPlayer.set(actor.id, {
    cx: sub.cx,
    cy: sub.cy,
    radius: sub.radius,
    visibility: snapshot,
    payloads: serializedPayloads
  });
  chunkSnapshotSentAtByPlayer.set(actor.id, { cx: sub.cx, cy: sub.cy, radius: sub.radius, sentAt: now() });
  if (elapsed >= CHUNK_SNAPSHOT_WARN_MS) {
    app.log.warn(
      { playerId: actor.id, elapsedMs: elapsed, chunks: chunkCount, tiles: tileCount, radius: sub.radius },
      "slow chunk snapshot"
    );
  }
};

const tileInSubscription = (playerId: string, x: number, y: number): boolean => {
  const sub = chunkSubscriptionByPlayer.get(playerId);
  if (!sub) return false;
  const tcx = wrapChunkX(Math.floor(x / CHUNK_SIZE));
  const tcy = wrapChunkY(Math.floor(y / CHUNK_SIZE));
  const scx = wrapChunkX(sub.cx);
  const scy = wrapChunkY(sub.cy);
  return chunkDist(tcx, scx, chunkCountX) <= sub.radius && chunkDist(tcy, scy, chunkCountY) <= sub.radius;
};

const availableTechPicks = (_player: Player): number => {
  // Tech progression is gated by points + branch prerequisites, not a consumable pick counter.
  return 1;
};

const defaultMissionStats = (): MissionStats => ({
  neutralCaptures: 0,
  enemyCaptures: 0,
  combatWins: 0,
  maxTilesHeld: 0,
  maxSettledTilesHeld: 0,
  maxFarmsHeld: 0,
  maxContinentsHeld: 0,
  maxTechPicks: 0
});

const ensureMissionDefaults = (player: Player): void => {
  if (!player.missionStats) player.missionStats = defaultMissionStats();
  if (player.missionStats.maxSettledTilesHeld === undefined) player.missionStats.maxSettledTilesHeld = 0;
  if (player.missionStats.maxContinentsHeld === undefined) player.missionStats.maxContinentsHeld = 0;
  if (player.missionStats.maxTechPicks === undefined) player.missionStats.maxTechPicks = 0;
  if (!player.missions) player.missions = [];
};

const missionProgressValue = (player: Player, kind: MissionKind): number => {
  ensureMissionDefaults(player);
  if (kind === "NEUTRAL_CAPTURES") return player.missionStats.neutralCaptures;
  if (kind === "ENEMY_CAPTURES") return player.missionStats.enemyCaptures;
  if (kind === "COMBAT_WINS") return player.missionStats.combatWins;
  if (kind === "TILES_HELD") return player.missionStats.maxTilesHeld;
  if (kind === "SETTLED_TILES_HELD") return player.missionStats.maxSettledTilesHeld;
  if (kind === "FARMS_HELD") return player.missionStats.maxFarmsHeld;
  if (kind === "CONTINENTS_HELD") return player.missionStats.maxContinentsHeld;
  return player.missionStats.maxTechPicks;
};

const ownedDockCount = (playerId: string): number => {
  let n = 0;
  for (const d of docksByTile.values()) {
    const [x, y] = parseKey(d.tileKey);
    const t = playerTile(x, y);
    if (t.ownerId === playerId) n += 1;
  }
  return n;
};

const dynamicMissionProgress = (player: Player, mission: DynamicMissionDef): { progress: number; target: number } => {
  if (mission.type === "VENDETTA") {
    const target = 8;
    const map = vendettaCaptureCountsByPlayer.get(player.id);
    const progress = mission.targetPlayerId ? (map?.get(mission.targetPlayerId) ?? 0) : 0;
    return { progress: Math.min(target, progress), target };
  }
  if (mission.type === "DOCK_HUNT") {
    return { progress: ownedDockCount(player.id) >= 1 ? 1 : 0, target: mission.targetDockCount ?? 1 };
  }
  const pair = mission.focusResources;
  if (!pair) return { progress: 0, target: 16 };
  const counts = getOrInitResourceCounts(player.id);
  const a = Math.min(8, counts[pair[0]] ?? 0);
  const b = Math.min(8, counts[pair[1]] ?? 0);
  return { progress: a + b, target: 16 };
};

const applyDynamicMissionReward = (player: Player, mission: DynamicMissionDef): void => {
  if (mission.rewarded) return;
  if (mission.type === "VENDETTA") {
    temporaryAttackBuffUntilByPlayer.set(player.id, Math.max(temporaryAttackBuffUntilByPlayer.get(player.id) ?? 0, now() + VENDETTA_ATTACK_BUFF_MS));
  } else if (mission.type === "DOCK_HUNT") {
    const reveal = getOrInitForcedReveal(player.id);
    const candidates = [...dockById.values()].filter((d) => {
      const [x, y] = parseKey(d.tileKey);
      return !visible(player, x, y);
    });
    for (let i = 0; i < Math.min(3, candidates.length); i += 1) {
      const d = candidates[i]!;
      const [x, y] = parseKey(d.tileKey);
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          reveal.add(key(wrapX(x + dx, WORLD_WIDTH), wrapY(y + dy, WORLD_HEIGHT)));
        }
      }
    }
  } else if (mission.focusResources) {
    temporaryIncomeBuffUntilByPlayer.set(player.id, { until: now() + RESOURCE_CHAIN_BUFF_MS, resources: mission.focusResources });
  }
  mission.rewarded = true;
};

const maybeIssueVendettaMission = (_player: Player, _targetPlayerId: string): void => {};

const maybeIssueDockMission = (_player: Player): void => {};

const maybeIssueResourceMission = (_player: Player, _captured?: ResourceType): void => {};

const dynamicMissionPayload = (_player: Player): MissionState[] => [];

const applyStaticMissionReward = (player: Player, mission: MissionState): void => {
  const stock = getOrInitStrategicStocks(player.id);
  if (mission.id === "frontier-scout") {
    stock.FOOD += 1;
    stock.SUPPLY += 1;
    return;
  }
  if (mission.id === "frontier-commander") {
    stock.IRON += 1;
    stock.CRYSTAL += 1;
    return;
  }
  if (mission.id === "regional-footprint") {
    stock.SHARD += 1;
  }
};

const syncMissionProgress = (_player: Player): boolean => false;

const unlockMissions = (_player: Player): boolean => false;

const continentsHeldCount = (player: Player): number => {
  const set = new Set<number>();
  for (const tk of player.territoryTiles) {
    const [x, y] = parseKey(tk);
    const cid = continentIdAt(x, y);
    if (cid !== undefined) set.add(cid);
  }
  return set.size;
};

const updateMissionState = (player: Player): boolean => {
  ensureMissionDefaults(player);
  player.missions = [];
  dynamicMissionsByPlayer.delete(player.id);
  return false;
};

const missionPayload = (_player: Player): MissionState[] => [];

const normalizePlayerProgressionState = (player: Player): void => {
  player.techIds = new Set([...player.techIds].filter((id) => techById.has(id)));
  player.domainIds = new Set([...player.domainIds].filter((id) => domainById.has(id)));
};

const computeLeaderboardSnapshot = (limitTop = 5): LeaderboardSnapshotView => {
  const rows = collectPlayerCompetitionMetrics().map((metric) => ({
    id: metric.playerId,
    name: metric.name,
    tiles: metric.settledTiles,
    incomePerMinute: metric.incomePerMinute,
    techs: metric.techs
  }));
  const overall = [...rows]
    .map((r) => ({ ...r, score: r.tiles * 1 + r.incomePerMinute * 3 + r.techs * 8 }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limitTop);
  const byTiles = [...rows]
    .sort((a, b) => b.tiles - a.tiles)
    .slice(0, limitTop)
    .map((r) => ({ id: r.id, name: r.name, value: r.tiles }));
  const byIncome = [...rows]
    .sort((a, b) => b.incomePerMinute - a.incomePerMinute)
    .slice(0, limitTop)
    .map((r) => ({ id: r.id, name: r.name, value: r.incomePerMinute }));
  const byTechs = [...rows]
    .sort((a, b) => b.techs - a.techs)
    .slice(0, limitTop)
    .map((r) => ({ id: r.id, name: r.name, value: r.techs }));

  return { overall, byTiles, byIncome, byTechs };
};

const trimFrontierSettlementsWindow = (playerId: string, nowMs = now()): number[] => {
  const timestamps = frontierSettlementsByPlayer.get(playerId);
  if (!timestamps || timestamps.length === 0) return [];
  let writeIndex = 0;
  for (let readIndex = 0; readIndex < timestamps.length; readIndex += 1) {
    const timestamp = timestamps[readIndex]!;
    if (nowMs - timestamp > VICTORY_PRESSURE_FRONTIER_REACH_WINDOW_MS) continue;
    timestamps[writeIndex] = timestamp;
    writeIndex += 1;
  }
  if (writeIndex !== timestamps.length) timestamps.length = writeIndex;
  if (writeIndex === 0) {
    frontierSettlementsByPlayer.delete(playerId);
    return [];
  }
  return timestamps;
};

const recordFrontierSettlementForPressure = (playerId: string): void => {
  const next = trimFrontierSettlementsWindow(playerId);
  next.push(now());
  frontierSettlementsByPlayer.set(playerId, next);
};

const uniqueLeader = (entries: Array<{ playerId: string; value: number }>): { playerId?: string; value: number } => {
  if (entries.length === 0) return { value: 0 };
  let top = entries[0]!;
  let runnerUp: { playerId: string; value: number } | undefined;
  for (let i = 1; i < entries.length; i += 1) {
    const entry = entries[i]!;
    if (entry.value > top.value) {
      runnerUp = top;
      top = entry;
      continue;
    }
    if (!runnerUp || entry.value > runnerUp.value) runnerUp = entry;
  }
  if (top.value <= 0) return { value: top.value };
  if (runnerUp && runnerUp.value === top.value) return { value: top.value };
  return { playerId: top.playerId, value: top.value };
};

const leadingPair = (entries: Array<{ playerId: string; value: number }>): {
  leaderPlayerId?: string;
  leaderValue: number;
  runnerUpValue: number;
  tied: boolean;
} => {
  if (entries.length === 0) return { leaderValue: 0, runnerUpValue: 0, tied: false };
  const sorted = [...entries].sort((a, b) => b.value - a.value);
  const leader = sorted[0]!;
  const runnerUp = sorted[1];
  return {
    leaderPlayerId: leader.playerId,
    leaderValue: leader.value,
    runnerUpValue: runnerUp?.value ?? 0,
    tied: Boolean(runnerUp && runnerUp.value === leader.value)
  };
};

const countControlledTowns = (playerId: string): number => {
  let count = 0;
  for (const tk of townsByTile.keys()) {
    if (ownership.get(tk) !== playerId) continue;
    if (ownershipStateByTile.get(tk) !== "SETTLED") continue;
    count += 1;
  }
  return count;
};

const worldResourceTileCounts = (): Record<ResourceType, number> => {
  const counts: Record<ResourceType, number> = { FARM: 0, FISH: 0, FUR: 0, WOOD: 0, IRON: 0, GEMS: 0 };
  for (let y = 0; y < WORLD_HEIGHT; y += 1) {
    for (let x = 0; x < WORLD_WIDTH; x += 1) {
      if (terrainAtRuntime(x, y) !== "LAND") continue;
      const resource = applyClusterResources(x, y, resourceAt(x, y));
      if (!resource) continue;
      counts[resource] += 1;
    }
  }
  return counts;
};

const controlledResourceTileCounts = (playerId: string): Record<ResourceType, number> => {
  const counts: Record<ResourceType, number> = { FARM: 0, FISH: 0, FUR: 0, WOOD: 0, IRON: 0, GEMS: 0 };
  for (const tk of players.get(playerId)?.territoryTiles ?? []) {
    const [x, y] = parseKey(tk);
    if (terrainAtRuntime(x, y) !== "LAND") continue;
    const resource = applyClusterResources(x, y, resourceAt(x, y));
    if (!resource) continue;
    counts[resource] += 1;
  }
  return counts;
};

const continentLandCounts = (): Map<number, number> => {
  const counts = new Map<number, number>();
  for (let y = 0; y < WORLD_HEIGHT; y += 1) {
    for (let x = 0; x < WORLD_WIDTH; x += 1) {
      if (terrainAtRuntime(x, y) !== "LAND") continue;
      const continentId = continentIdAt(x, y);
      if (continentId === undefined) continue;
      counts.set(continentId, (counts.get(continentId) ?? 0) + 1);
    }
  }
  return counts;
};

const continentControlledCounts = (playerId: string): Map<number, number> => {
  const counts = new Map<number, number>();
  for (const tk of players.get(playerId)?.territoryTiles ?? []) {
    const [x, y] = parseKey(tk);
    if (terrainAtRuntime(x, y) !== "LAND") continue;
    const continentId = continentIdAt(x, y);
    if (continentId === undefined) continue;
    counts.set(continentId, (counts.get(continentId) ?? 0) + 1);
  }
  return counts;
};

let cachedClaimableLandTileCount: { seed: number; count: number } | undefined;
const claimableLandTileCount = (): number => {
  if (cachedClaimableLandTileCount?.seed === activeSeason.worldSeed) return cachedClaimableLandTileCount?.count ?? 0;
  let count = 0;
  for (let y = 0; y < WORLD_HEIGHT; y += 1) {
    for (let x = 0; x < WORLD_WIDTH; x += 1) {
      if (terrainAtRuntime(x, y) === "LAND") count += 1;
    }
  }
  cachedClaimableLandTileCount = { seed: activeSeason.worldSeed, count };
  return count;
};

const collectPlayerCompetitionMetrics = (nowMs = now()): PlayerCompetitionMetrics[] => {
  const townCounts = new Map<string, number>();
  for (const tk of townsByTile.keys()) {
    const ownerId = ownership.get(tk);
    if (!ownerId) continue;
    if (ownershipStateByTile.get(tk) !== "SETTLED") continue;
    townCounts.set(ownerId, (townCounts.get(ownerId) ?? 0) + 1);
  }

  const metrics: PlayerCompetitionMetrics[] = [];
  for (const player of players.values()) {
    let settledTiles = 0;
    for (const tk of player.territoryTiles) {
      if (ownershipStateByTile.get(tk) === "SETTLED") settledTiles += 1;
    }
    metrics.push({
      playerId: player.id,
      name: player.name,
      tiles: player.T,
      settledTiles,
      incomePerMinute: currentIncomePerMinute(player),
      techs: player.techIds.size,
      controlledTowns: townCounts.get(player.id) ?? 0
    });
  }
  return metrics;
};

const uniqueLeaderFromMetrics = (
  metrics: PlayerCompetitionMetrics[],
  selectValue: (metric: PlayerCompetitionMetrics) => number
): { playerId?: string; value: number } => {
  return uniqueLeader(metrics.map((metric) => ({ playerId: metric.playerId, value: selectValue(metric) })));
};

const getVictoryPressureTracker = (id: SeasonVictoryPathId): VictoryPressureTracker => {
  let tracker = victoryPressureById.get(id);
  if (!tracker) {
    tracker = {};
    victoryPressureById.set(id, tracker);
  }
  return tracker;
};

const currentSeasonWinner = (): SeasonWinnerView | undefined => seasonWinner;

const computeVictoryPressureObjectives = (): SeasonVictoryObjectiveView[] => {
  const nowMs = now();
  const totalTownCount = Math.max(1, townsByTile.size);
  const townTarget = Math.max(1, Math.ceil(totalTownCount * SEASON_VICTORY_TOWN_CONTROL_SHARE));
  const settledTarget = Math.max(1, Math.ceil(claimableLandTileCount() * SEASON_VICTORY_SETTLED_TERRITORY_SHARE));
  const metrics = collectPlayerCompetitionMetrics(nowMs);
  const totalResourceCounts = worldResourceTileCounts();
  const allContinents = continentLandCounts();
  return VICTORY_PRESSURE_DEFS.map((def) => {
    const tracker = getVictoryPressureTracker(def.id);
    let leaderPlayerId: string | undefined;
    let leaderValue = 0;
    let conditionMet = false;
    let progressLabel = "";
    let thresholdLabel = "";

    if (def.id === "TOWN_CONTROL") {
      const leader = uniqueLeaderFromMetrics(metrics, (metric) => metric.controlledTowns);
      leaderPlayerId = leader.playerId;
      leaderValue = leader.value;
      conditionMet = Boolean(leaderPlayerId && leaderValue >= townTarget);
      progressLabel = `${leaderValue}/${townTarget} towns`;
      thresholdLabel = `Need ${townTarget} towns`;
    } else if (def.id === "SETTLED_TERRITORY") {
      const leader = uniqueLeaderFromMetrics(metrics, (metric) => metric.settledTiles);
      leaderPlayerId = leader.playerId;
      leaderValue = leader.value;
      conditionMet = Boolean(leaderPlayerId && leaderValue >= settledTarget);
      progressLabel = `${leaderValue}/${settledTarget} settled land`;
      thresholdLabel = `Need ${settledTarget} settled land tiles`;
    } else if (def.id === "ECONOMIC_HEGEMONY") {
      const pair = leadingPair(metrics.map((metric) => ({ playerId: metric.playerId, value: metric.incomePerMinute })));
      leaderPlayerId = pair.tied ? undefined : pair.leaderPlayerId;
      leaderValue = pair.leaderValue;
      const incomeThreshold = pair.runnerUpValue <= 0 ? Number.POSITIVE_INFINITY : pair.runnerUpValue * SEASON_VICTORY_ECONOMY_LEAD_MULT;
      conditionMet = Boolean(
        leaderPlayerId &&
          !pair.tied &&
          leaderValue >= SEASON_VICTORY_ECONOMY_MIN_INCOME &&
          pair.runnerUpValue > 0 &&
          leaderValue >= incomeThreshold
      );
      progressLabel = `${leaderValue.toFixed(1)} gold/m vs ${pair.runnerUpValue.toFixed(1)}`;
      thresholdLabel = `Need at least ${SEASON_VICTORY_ECONOMY_MIN_INCOME} gold/m and 33% lead`;
    } else if (def.id === "RESOURCE_MONOPOLY") {
      let bestLeaderId: string | undefined;
      let bestOwned = 0;
      let bestTotal = 0;
      let bestResource: ResourceType | undefined;
      for (const metric of metrics) {
        const controlled = controlledResourceTileCounts(metric.playerId);
        for (const resource of Object.keys(totalResourceCounts) as ResourceType[]) {
          const total = totalResourceCounts[resource];
          if (total <= 0) continue;
          const owned = controlled[resource] ?? 0;
          if (owned > bestOwned) {
            bestLeaderId = metric.playerId;
            bestOwned = owned;
            bestTotal = total;
            bestResource = resource;
          }
        }
      }
      leaderPlayerId = bestLeaderId;
      leaderValue = bestOwned;
      conditionMet = Boolean(leaderPlayerId && bestResource && bestTotal > 0 && bestOwned >= bestTotal);
      progressLabel = bestResource ? `${bestOwned}/${bestTotal} ${bestResource}` : "No resource leader";
      thresholdLabel = "Need 100% control of one resource type";
    } else {
      let bestLeaderId: string | undefined;
      let bestRatio = 0;
      let bestMinPct = 0;
      for (const metric of metrics) {
        const controlled = continentControlledCounts(metric.playerId);
        let minRatio = Number.POSITIVE_INFINITY;
        let validContinents = 0;
        for (const [continentId, totalLand] of allContinents) {
          if (totalLand <= 0) continue;
          validContinents += 1;
          const owned = controlled.get(continentId) ?? 0;
          minRatio = Math.min(minRatio, owned / totalLand);
        }
        if (validContinents === 0) continue;
        if (minRatio > bestRatio) {
          bestRatio = minRatio;
          bestMinPct = Math.round(minRatio * 100);
          bestLeaderId = metric.playerId;
        }
      }
      leaderPlayerId = bestLeaderId;
      leaderValue = bestMinPct;
      conditionMet = Boolean(leaderPlayerId && bestRatio >= SEASON_VICTORY_CONTINENT_FOOTPRINT_SHARE);
      progressLabel = `${bestMinPct}% minimum continent share`;
      thresholdLabel = "Need 20% of land on every continent";
    }

    const winner = currentSeasonWinner();
    const holdRemainingSeconds =
      !winner &&
      conditionMet &&
      tracker.leaderPlayerId === leaderPlayerId &&
      tracker.holdStartedAt
        ? Math.max(0, Math.ceil((tracker.holdStartedAt + def.holdDurationSeconds * 1000 - nowMs) / 1000))
        : undefined;
    const statusLabel = winner
      ? winner.objectiveId === def.id
        ? `Winner crowned: ${winner.playerName}`
        : "Season already decided"
      : conditionMet
        ? holdRemainingSeconds !== undefined
          ? `Holding · ${Math.max(0, Math.ceil(holdRemainingSeconds / 3600))}h left`
          : "Threshold met"
        : leaderValue > 0
          ? "Pressure building"
          : "No contender";
    const view: SeasonVictoryObjectiveView = {
      id: def.id,
      name: def.name,
      description: def.description,
      leaderName: leaderPlayerId ? players.get(leaderPlayerId)?.name ?? leaderPlayerId.slice(0, 8) : leaderValue > 0 ? "Contested" : "No leader",
      progressLabel,
      thresholdLabel,
      holdDurationSeconds: def.holdDurationSeconds,
      statusLabel,
      conditionMet
    };
    if (leaderPlayerId !== undefined) view.leaderPlayerId = leaderPlayerId;
    if (holdRemainingSeconds !== undefined) view.holdRemainingSeconds = holdRemainingSeconds;
    return view;
  });
};

let cachedLeaderboardSnapshot: LeaderboardSnapshotView = { overall: [], byTiles: [], byIncome: [], byTechs: [] };
let cachedVictoryPressureObjectives: SeasonVictoryObjectiveView[] = [];
let globalStatusCacheExpiresAt = 0;
let lastGlobalStatusBroadcastSig = "";

const refreshGlobalStatusCache = (force = false): void => {
  const nowMs = now();
  if (!force && nowMs < globalStatusCacheExpiresAt) return;
  cachedLeaderboardSnapshot = computeLeaderboardSnapshot();
  cachedVictoryPressureObjectives = computeVictoryPressureObjectives();
  globalStatusCacheExpiresAt = nowMs + GLOBAL_STATUS_CACHE_TTL_MS;
};

const currentLeaderboardSnapshot = (): LeaderboardSnapshotView => {
  refreshGlobalStatusCache(false);
  return cachedLeaderboardSnapshot;
};

const currentVictoryPressureObjectives = (): SeasonVictoryObjectiveView[] => {
  refreshGlobalStatusCache(false);
  return cachedVictoryPressureObjectives;
};

const globalStatusBroadcastSignature = (): string =>
  JSON.stringify({
    leaderboard: cachedLeaderboardSnapshot,
    seasonVictory: cachedVictoryPressureObjectives,
    seasonWinner
  });

const broadcastGlobalStatusUpdate = (force = false): void => {
  refreshGlobalStatusCache(force);
  const nextSig = globalStatusBroadcastSignature();
  if (!force && nextSig === lastGlobalStatusBroadcastSig) return;
  lastGlobalStatusBroadcastSig = nextSig;
  broadcast({
    type: "GLOBAL_STATUS_UPDATE",
    leaderboard: cachedLeaderboardSnapshot,
    seasonVictory: cachedVictoryPressureObjectives,
    seasonWinner
  });
};

const broadcastVictoryPressureUpdate = (announcement?: string): void => {
  refreshGlobalStatusCache(true);
  lastGlobalStatusBroadcastSig = globalStatusBroadcastSignature();
  broadcast({
    type: "SEASON_VICTORY_UPDATE",
    objectives: cachedVictoryPressureObjectives,
    announcement,
    seasonWinner
  });
};

const crownSeasonWinner = (playerId: string, def: VictoryPressureDefinition): void => {
  if (seasonWinner) return;
  const player = players.get(playerId);
  if (!player) return;
  seasonWinner = {
    playerId,
    playerName: player.name,
    crownedAt: now(),
    objectiveId: def.id,
    objectiveName: def.name
  };
  refreshGlobalStatusCache(true);
  lastGlobalStatusBroadcastSig = globalStatusBroadcastSignature();
  broadcast({
    type: "SEASON_WINNER_CROWNED",
    winner: seasonWinner,
    leaderboard: cachedLeaderboardSnapshot,
    objectives: cachedVictoryPressureObjectives
  });
};

const evaluateVictoryPressure = (): void => {
  if (seasonWinner) {
    refreshGlobalStatusCache(false);
    return;
  }
  const nowMs = now();
  const totalTownCount = Math.max(1, townsByTile.size);
  const townTarget = Math.max(1, Math.ceil(totalTownCount * SEASON_VICTORY_TOWN_CONTROL_SHARE));
  const settledTarget = Math.max(1, Math.ceil(claimableLandTileCount() * SEASON_VICTORY_SETTLED_TERRITORY_SHARE));
  const metrics = collectPlayerCompetitionMetrics(nowMs);
  let crowned: SeasonWinnerView | undefined;

  for (const def of VICTORY_PRESSURE_DEFS) {
    const tracker = getVictoryPressureTracker(def.id);
    let leaderPlayerId: string | undefined;
    let conditionMet = false;

    if (def.id === "TOWN_CONTROL") {
      const leader = uniqueLeaderFromMetrics(metrics, (metric) => metric.controlledTowns);
      leaderPlayerId = leader.playerId;
      conditionMet = Boolean(leaderPlayerId && leader.value >= townTarget);
    } else if (def.id === "SETTLED_TERRITORY") {
      const leader = uniqueLeaderFromMetrics(metrics, (metric) => metric.settledTiles);
      leaderPlayerId = leader.playerId;
      conditionMet = Boolean(leaderPlayerId && leader.value >= settledTarget);
    } else {
      const pair = leadingPair(metrics.map((metric) => ({ playerId: metric.playerId, value: metric.incomePerMinute })));
      leaderPlayerId = pair.tied ? undefined : pair.leaderPlayerId;
      conditionMet = Boolean(
        leaderPlayerId &&
          !pair.tied &&
          pair.leaderValue >= SEASON_VICTORY_ECONOMY_MIN_INCOME &&
          pair.runnerUpValue > 0 &&
          pair.leaderValue >= pair.runnerUpValue * SEASON_VICTORY_ECONOMY_LEAD_MULT
      );
    }

    if (!conditionMet || !leaderPlayerId) {
      delete tracker.leaderPlayerId;
      delete tracker.holdStartedAt;
      continue;
    }
    if (tracker.leaderPlayerId !== leaderPlayerId) {
      tracker.leaderPlayerId = leaderPlayerId;
      tracker.holdStartedAt = nowMs;
      continue;
    }
    if (!tracker.holdStartedAt) {
      tracker.holdStartedAt = nowMs;
      continue;
    }
    if (nowMs - tracker.holdStartedAt < def.holdDurationSeconds * 1000) continue;
    crownSeasonWinner(leaderPlayerId, def);
    crowned = currentSeasonWinner();
    break;
  }
  broadcastVictoryPressureUpdate(crowned ? `${crowned.playerName} was crowned season winner via ${crowned.objectiveName}.` : undefined);
};

const reachableTechs = (player: Player): string[] => {
  const out: string[] = [];
  for (const tech of TECHS) {
    if (!activeSeasonTechConfig.activeNodeIds.has(tech.id)) continue;
    if (player.techIds.has(tech.id)) continue;
    const prereqs = tech.prereqIds && tech.prereqIds.length > 0 ? tech.prereqIds : tech.requires ? [tech.requires] : [];
    if (prereqs.every((req) => player.techIds.has(req))) out.push(tech.id);
  }
  return out;
};

const techDepth = (id: string): number => {
  const seen = new Set<string>();
  const walk = (techId: string): number => {
    if (seen.has(techId)) return 0;
    seen.add(techId);
    const cur = techById.get(techId);
    if (!cur) return 0;
    const parents = cur.prereqIds && cur.prereqIds.length > 0 ? cur.prereqIds : cur.requires ? [cur.requires] : [];
    if (parents.length === 0) return 0;
    return Math.max(...parents.map((p) => walk(p))) + 1;
  };
  return walk(id);
};

const playerWorldFlags = (player: Player): Set<string> => {
  const flags = new Set<string>();
  if (player.Ts >= 8) flags.add("settled_tiles_8");
  if (player.Ts >= 16) flags.add("settled_tiles_16");
  let hasIron = false;
  let hasCrystal = false;
  let hasTown = false;
  let hasAncient = false;
  let hasDock = false;
  for (const tk of player.territoryTiles) {
    if (ownershipStateByTile.get(tk) !== "SETTLED") continue;
    const [x, y] = parseKey(tk);
    const t = playerTile(x, y);
    if (t.resource === "IRON") hasIron = true;
    if (t.resource === "GEMS") hasCrystal = true;
    if (docksByTile.has(tk)) hasDock = true;
    const town = townsByTile.get(tk);
    if (town) {
      hasTown = true;
      if (town.type === "ANCIENT") hasAncient = true;
    }
  }
  if (hasIron) flags.add("active_iron_site");
  if (hasCrystal) flags.add("active_crystal_site");
  if (hasTown) flags.add("active_town");
  if (hasAncient) flags.add("active_ancient_town");
  if (hasDock) flags.add("active_dock");
  return flags;
};

const techRequirements = (tech: (typeof TECHS)[number]): { gold: number; resources: Partial<Record<StrategicResource, number>> } => {
  if (tech.cost) {
    const resources: Partial<Record<StrategicResource, number>> = {};
    const food = tech.cost.food ?? 0;
    const iron = tech.cost.iron ?? 0;
    const crystal = tech.cost.crystal ?? 0;
    const supply = tech.cost.supply ?? 0;
    const shard = tech.cost.shard ?? 0;
    if (food > 0) resources.FOOD = food;
    if (iron > 0) resources.IRON = iron;
    if (crystal > 0) resources.CRYSTAL = crystal;
    if (supply > 0) resources.SUPPLY = supply;
    if (shard > 0) resources.SHARD = shard;
    return { gold: tech.cost.gold ?? 0, resources };
  }
  const depth = techDepth(tech.id);
  const gold = Math.max(15, 12 + depth * 9);
  const resources: Partial<Record<StrategicResource, number>> = {};

  const mods = tech.mods ?? {};
  const offensive = (mods.attack ?? 1) > 1;
  const defensive = (mods.defense ?? 1) > 1;
  const economic = (mods.income ?? 1) > 1;
  const vision = (mods.vision ?? 1) > 1;

  if (offensive) resources.IRON = Math.max(resources.IRON ?? 0, Math.max(0, Math.ceil(depth / 2)));
  if (defensive) resources.SUPPLY = Math.max(resources.SUPPLY ?? 0, Math.max(0, Math.ceil(depth / 3)));
  if (economic) resources.FOOD = Math.max(resources.FOOD ?? 0, Math.max(0, Math.ceil(depth / 2)));
  if (vision) resources.CRYSTAL = Math.max(resources.CRYSTAL ?? 0, Math.max(0, Math.ceil(depth / 2)));
  if (depth >= 6) {
    resources.SHARD = Math.max(resources.SHARD ?? 0, 1);
  }
  return { gold, resources };
};

const techChecklistFor = (
  player: Player,
  tech: (typeof TECHS)[number]
): { ok: boolean; checks: TechRequirementChecklist[]; resources: Partial<Record<StrategicResource, number>>; gold: number } => {
  const req = techRequirements(tech);
  const checks: TechRequirementChecklist[] = [];
  const stocks = getOrInitStrategicStocks(player.id);
  checks.push({ label: `Gold ${req.gold}`, met: player.points >= req.gold });
  for (const [r, amount] of Object.entries(req.resources) as Array<[StrategicResource, number]>) {
    checks.push({ label: `${r} ${amount}`, met: (stocks[r] ?? 0) >= amount });
  }
  return { ok: checks.every((c) => c.met), checks, resources: req.resources, gold: req.gold };
};

const activeTechCatalog = (player?: Player): Array<{
  id: string;
  name: string;
  rootId?: string;
  requires?: string;
  prereqIds?: string[];
  description: string;
  mods: Partial<Record<StatsModKey, number>>;
  effects?: (typeof TECHS)[number]["effects"];
  requirements: {
    gold: number;
    resources: Partial<Record<StrategicResource, number>>;
    checklist?: TechRequirementChecklist[];
    canResearch?: boolean;
  };
  grantsPowerup?: { id: string; charges: number };
}> => {
  return TECHS.filter((t) => activeSeasonTechConfig.activeNodeIds.has(t.id)).map((t) => {
    const out: {
      id: string;
      name: string;
      rootId?: string;
      requires?: string;
      prereqIds?: string[];
      description: string;
      mods: Partial<Record<StatsModKey, number>>;
      effects?: (typeof TECHS)[number]["effects"];
      requirements: {
        gold: number;
        resources: Partial<Record<StrategicResource, number>>;
        checklist?: TechRequirementChecklist[];
        canResearch?: boolean;
      };
      grantsPowerup?: { id: string; charges: number };
    } = {
      id: t.id,
      name: t.name,
      description: t.description,
      mods: t.mods ?? {},
      requirements: techRequirements(t)
    };
    if (t.effects) out.effects = { ...t.effects };
    if (t.rootId) out.rootId = t.rootId;
    if (t.requires) out.requires = t.requires;
    if (t.prereqIds && t.prereqIds.length > 0) out.prereqIds = [...t.prereqIds];
    if (t.grantsPowerup) out.grantsPowerup = t.grantsPowerup;
    if (player) {
      const check = techChecklistFor(player, t);
      out.requirements.checklist = check.checks;
      out.requirements.canResearch = check.ok;
    }
    return out;
  });
};

const IRON_DOMAIN_IDS = new Set<string>();
const SUPPLY_DOMAIN_IDS = new Set(["expansion"]);
const FOOD_DOMAIN_IDS = new Set(["urbanization"]);
const CRYSTAL_DOMAIN_IDS = new Set<string>();

const IRON_TECH_IDS = new Set(["masonry", "mining", "bronze-working", "fortified-walls", "siegecraft", "industrial-extraction", "breach-doctrine", "steelworking"]);
const SUPPLY_TECH_IDS = new Set(["toolmaking", "leatherworking", "harborcraft", "logistics", "navigation", "organized-supply", "deep-operations", "terrain-engineering", "imperial-roads"]);
const FOOD_TECH_IDS = new Set(["agriculture", "irrigation", "pottery", "banking", "civil-service"]);
const CRYSTAL_TECH_IDS = new Set([
  "cartography",
  "signal-fires",
  "surveying",
  "beacon-towers",
  "cryptography",
  "grand-cartography",
  "banking",
  "trade",
  "ledger-keeping",
  "coinage",
  "maritime-trade",
  "port-infrastructure",
  "global-trade-networks",
  "trade-empire"
]);

const empireStyleFromPlayer = (player: Player): EmpireVisualStyle => {
  const primaryOverlay = player.tileColor ?? colorFromId(player.id);
  let secondaryTint: EmpireVisualStyle["secondaryTint"] = "BALANCED";

  for (const id of player.domainIds) {
    if (IRON_DOMAIN_IDS.has(id)) {
      secondaryTint = "IRON";
      break;
    }
    if (SUPPLY_DOMAIN_IDS.has(id)) {
      secondaryTint = "SUPPLY";
      break;
    }
    if (FOOD_DOMAIN_IDS.has(id)) {
      secondaryTint = "FOOD";
      break;
    }
    if (CRYSTAL_DOMAIN_IDS.has(id)) {
      secondaryTint = "CRYSTAL";
      break;
    }
  }

  if (secondaryTint === "BALANCED") {
    const scores = { IRON: 0, SUPPLY: 0, FOOD: 0, CRYSTAL: 0 } satisfies Record<Exclude<EmpireVisualStyle["secondaryTint"], "BALANCED">, number>;
    for (const id of player.techIds) {
      if (IRON_TECH_IDS.has(id)) scores.IRON += 1;
      if (SUPPLY_TECH_IDS.has(id)) scores.SUPPLY += 1;
      if (FOOD_TECH_IDS.has(id)) scores.FOOD += 1;
      if (CRYSTAL_TECH_IDS.has(id)) scores.CRYSTAL += 1;
    }
    const ranked = (Object.entries(scores) as Array<[Exclude<EmpireVisualStyle["secondaryTint"], "BALANCED">, number]>)
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    if ((ranked[0]?.[1] ?? 0) >= 2) secondaryTint = ranked[0]![0];
  }

  const borderStyle: EmpireVisualStyle["borderStyle"] =
    secondaryTint === "IRON" ? "HEAVY" : secondaryTint === "SUPPLY" ? "DASHED" : secondaryTint === "FOOD" ? "SOFT" : secondaryTint === "CRYSTAL" ? "GLOW" : "SHARP";
  const structureAccent: EmpireVisualStyle["structureAccent"] = secondaryTint === "BALANCED" ? "NEUTRAL" : secondaryTint;

  return { primaryOverlay, secondaryTint, borderStyle, structureAccent };
};

const domainCostResources = (
  cost: Partial<Record<"gold" | "food" | "iron" | "supply" | "crystal" | "shard", number>>
): Partial<Record<StrategicResource, number>> => {
  const resources: Partial<Record<StrategicResource, number>> = {};
  if ((cost.food ?? 0) > 0) resources.FOOD = cost.food ?? 0;
  if ((cost.iron ?? 0) > 0) resources.IRON = cost.iron ?? 0;
  if ((cost.supply ?? 0) > 0) resources.SUPPLY = cost.supply ?? 0;
  if ((cost.crystal ?? 0) > 0) resources.CRYSTAL = cost.crystal ?? 0;
  if ((cost.shard ?? 0) > 0) resources.SHARD = cost.shard ?? 0;
  return resources;
};

const chosenDomainTierMax = (player: Player): number => {
  let tier = 0;
  for (const id of player.domainIds) {
    const d = domainById.get(id);
    if (d) tier = Math.max(tier, d.tier);
  }
  return tier;
};

const domainChecklistFor = (
  player: Player,
  domainId: string
): { ok: boolean; checks: DomainRequirementChecklist[]; gold: number; resources: Partial<Record<StrategicResource, number>> } => {
  const d = domainById.get(domainId);
  if (!d) return { ok: false, checks: [{ label: "Domain exists", met: false }], gold: 0, resources: {} };
  const checks: DomainRequirementChecklist[] = [];
  const stocks = getOrInitStrategicStocks(player.id);
  const gold = d.cost.gold ?? 0;
  const resources = domainCostResources(d.cost);
  const tierMax = chosenDomainTierMax(player);
  const pickedThisTier = [...player.domainIds].some((id) => domainById.get(id)?.tier === d.tier);
  checks.push({ label: `Requires tech ${d.requiresTechId}`, met: player.techIds.has(d.requiresTechId) });
  checks.push({ label: `Tier ${d.tier} progression`, met: d.tier <= tierMax + 1 });
  checks.push({ label: `One domain per tier`, met: !pickedThisTier });
  checks.push({ label: `Gold ${gold}`, met: player.points >= gold });
  for (const [r, amount] of Object.entries(resources) as Array<[StrategicResource, number]>) {
    checks.push({ label: `${r} ${amount}`, met: (stocks[r] ?? 0) >= amount });
  }
  return { ok: checks.every((c) => c.met), checks, gold, resources };
};

const reachableDomains = (player: Player): string[] => {
  const tierMax = chosenDomainTierMax(player);
  const targetTier = Math.min(5, tierMax + 1);
  const pickedAtTargetTier = [...player.domainIds].some((id) => domainById.get(id)?.tier === targetTier);
  if (pickedAtTargetTier) return [];
  return DOMAINS.filter((d) => d.tier === targetTier).map((d) => d.id);
};

const activeDomainCatalog = (player?: Player): Array<{
  id: string;
  tier: number;
  name: string;
  description: string;
  requiresTechId: string;
  mods: Partial<Record<StatsModKey, number>>;
  effects?: (typeof DOMAINS)[number]["effects"];
  requirements: {
    gold: number;
    resources: Partial<Record<StrategicResource, number>>;
    checklist?: DomainRequirementChecklist[];
    canResearch?: boolean;
  };
}> => {
  return DOMAINS.map((d) => {
    const out: {
      id: string;
      tier: number;
      name: string;
      description: string;
      requiresTechId: string;
      mods: Partial<Record<StatsModKey, number>>;
      effects?: (typeof DOMAINS)[number]["effects"];
      requirements: {
        gold: number;
        resources: Partial<Record<StrategicResource, number>>;
        checklist?: DomainRequirementChecklist[];
        canResearch?: boolean;
      };
    } = {
      id: d.id,
      tier: d.tier,
      name: d.name,
      description: d.description,
      requiresTechId: d.requiresTechId,
      mods: d.mods ?? {},
      requirements: {
        gold: d.cost.gold ?? 0,
        resources: domainCostResources(d.cost)
      }
    };
    if (d.effects) out.effects = { ...d.effects };
    if (player) {
      const check = domainChecklistFor(player, d.id);
      out.requirements.checklist = check.checks;
      out.requirements.canResearch = check.ok;
    }
    return out;
  });
};

const applyDomain = (player: Player, domainId: string): { ok: boolean; reason?: string } => {
  const d = domainById.get(domainId);
  if (!d) return { ok: false, reason: "domain not found" };
  if (player.domainIds.has(domainId)) return { ok: false, reason: "domain already selected" };
  const check = domainChecklistFor(player, domainId);
  if (!check.ok) {
    const miss = check.checks.find((c) => !c.met);
    return { ok: false, reason: `requirements not met: ${miss?.label ?? "unknown"}` };
  }
  player.points = Math.max(0, player.points - check.gold);
  const stock = getOrInitStrategicStocks(player.id);
  for (const [r, amount] of Object.entries(check.resources) as Array<[StrategicResource, number]>) {
    stock[r] = Math.max(0, stock[r] - amount);
  }
  player.domainIds.add(domainId);
  recomputeTechModsFromOwnedTechs(player);
  telemetryCounters.techUnlocks += 1;
  return { ok: true };
};

const applyTech = (player: Player, techId: string): { ok: boolean; reason?: string } => {
  const tech = techById.get(techId);
  if (!tech) return { ok: false, reason: "tech not found" };
  if (!activeSeasonTechConfig.activeNodeIds.has(techId)) return { ok: false, reason: "tech is not active this season" };
  if (player.techIds.has(techId)) return { ok: false, reason: "tech already selected" };
  const prereqs = tech.prereqIds && tech.prereqIds.length > 0 ? tech.prereqIds : tech.requires ? [tech.requires] : [];
  for (const req of prereqs) {
    if (!player.techIds.has(req)) {
      return { ok: false, reason: `required parent tech missing: ${req}` };
    }
  }
  const checklist = techChecklistFor(player, tech);
  if (!checklist.ok) {
    const miss = checklist.checks.find((c) => !c.met);
    return { ok: false, reason: `requirements not met: ${miss?.label ?? "unknown"}` };
  }
  player.points = Math.max(0, player.points - checklist.gold);
  const stock = getOrInitStrategicStocks(player.id);
  for (const [r, amount] of Object.entries(checklist.resources) as Array<[StrategicResource, number]>) {
    stock[r] = Math.max(0, stock[r] - amount);
  }

  player.techIds.add(tech.id);
  for (const [k, mult] of Object.entries(tech.mods ?? {}) as Array<[StatsModKey, number]>) {
    player.mods[k] *= mult;
  }
  playerBaseMods.set(player.id, {
    attack: player.mods.attack,
    defense: player.mods.defense,
    income: player.mods.income,
    vision: player.mods.vision
  });
  if (tech.grantsPowerup) {
    player.powerups[tech.grantsPowerup.id] = (player.powerups[tech.grantsPowerup.id] ?? 0) + tech.grantsPowerup.charges;
  }
  telemetryCounters.techUnlocks += 1;
  return { ok: true };
};

const countPlayerForts = (playerId: string): number => {
  let n = 0;
  for (const f of fortsByTile.values()) {
    if (f.ownerId === playerId) n += 1;
  }
  return n;
};

const countPlayerSiegeOutposts = (playerId: string): number => {
  let n = 0;
  for (const s of siegeOutpostsByTile.values()) {
    if (s.ownerId === playerId) n += 1;
  }
  return n;
};

const activeDevelopmentProcessCountForPlayer = (playerId: string): number => {
  let n = 0;
  for (const pending of pendingSettlementsByTile.values()) {
    if (pending.ownerId === playerId) n += 1;
  }
  for (const fort of fortsByTile.values()) {
    if (fort.ownerId === playerId && fort.status === "under_construction") n += 1;
  }
  for (const observatory of observatoriesByTile.values()) {
    if (observatory.ownerId === playerId && observatory.status === "under_construction") n += 1;
  }
  for (const siege of siegeOutpostsByTile.values()) {
    if (siege.ownerId === playerId && siege.status === "under_construction") n += 1;
  }
  for (const structure of economicStructuresByTile.values()) {
    if (structure.ownerId === playerId && structure.status === "under_construction") n += 1;
  }
  return n;
};

const canStartDevelopmentProcess = (playerId: string): boolean =>
  activeDevelopmentProcessCountForPlayer(playerId) < DEVELOPMENT_PROCESS_LIMIT;

const fortCapacityForPlayer = (playerId: string): number => {
  return Math.max(1, FORT_MAX_PER_PLAYER + getPlayerEffectsForPlayer(playerId).buildCapacityAdd);
};

const siegeOutpostCapacityForPlayer = (playerId: string): number => {
  return Math.max(1, SIEGE_OUTPOST_MAX_PER_PLAYER + getPlayerEffectsForPlayer(playerId).buildCapacityAdd);
};

const isBorderTile = (x: number, y: number, ownerId: string): boolean => {
  const n = cardinalNeighborCores(x, y);
  return n.some((t) => t.terrain === "LAND" && t.ownerId !== ownerId && !(t.ownerId && isAlly(ownerId, t.ownerId)));
};

const cancelFortBuild = (tileKey: TileKey): void => {
  const timer = fortBuildTimers.get(tileKey);
  if (timer) clearTimeout(timer);
  fortBuildTimers.delete(tileKey);
  const fort = fortsByTile.get(tileKey);
  if (fort?.status === "under_construction") fortsByTile.delete(tileKey);
};

const cancelSiegeOutpostBuild = (tileKey: TileKey): void => {
  const timer = siegeOutpostBuildTimers.get(tileKey);
  if (timer) clearTimeout(timer);
  siegeOutpostBuildTimers.delete(tileKey);
  const siege = siegeOutpostsByTile.get(tileKey);
  if (siege?.status === "under_construction") siegeOutpostsByTile.delete(tileKey);
};

const cancelObservatoryBuild = (tileKey: TileKey): void => {
  const timer = observatoryBuildTimers.get(tileKey);
  if (timer) clearTimeout(timer);
  observatoryBuildTimers.delete(tileKey);
  const observatory = observatoriesByTile.get(tileKey);
  if (observatory?.status === "under_construction") {
    untrackOwnedTileKey(observatoryTileKeysByPlayer, observatory.ownerId, tileKey);
    observatoriesByTile.delete(tileKey);
  }
};

const cancelEconomicStructureBuild = (tileKey: TileKey): void => {
  const timer = economicStructureBuildTimers.get(tileKey);
  if (timer) clearTimeout(timer);
  economicStructureBuildTimers.delete(tileKey);
  const structure = economicStructuresByTile.get(tileKey);
  if (structure?.status === "under_construction") {
    untrackOwnedTileKey(economicStructureTileKeysByPlayer, structure.ownerId, tileKey);
    economicStructuresByTile.delete(tileKey);
  }
};

const consumeStrategicResource = (player: Player, resource: StrategicResource, amount: number): boolean => {
  const stock = getOrInitStrategicStocks(player.id);
  if ((stock[resource] ?? 0) < amount) return false;
  stock[resource] -= amount;
  return true;
};

const clearPendingSettlement = (settlement: PendingSettlement): void => {
  settlement.cancelled = true;
  if (settlement.timeout) clearTimeout(settlement.timeout);
  pendingSettlementsByTile.delete(settlement.tileKey);
};

const refundPendingSettlement = (settlement: PendingSettlement): void => {
  const player = players.get(settlement.ownerId);
  if (!player) return;
  player.points += settlement.goldCost;
  recalcPlayerDerived(player);
};

const resolvePendingSettlement = (settlement: PendingSettlement): void => {
  if (settlement.cancelled) return;
  pendingSettlementsByTile.delete(settlement.tileKey);
  const [x, y] = parseKey(settlement.tileKey);
  const liveActor = players.get(settlement.ownerId);
  if (!liveActor) return;
  const live = runtimeTileCore(x, y);
  if (live.ownerId !== liveActor.id) {
    const capturedByEnemy = Boolean(live.ownerId && live.ownerId !== liveActor.id);
    if (!capturedByEnemy) {
      refundPendingSettlement(settlement);
      sendToPlayer(liveActor.id, { type: "ERROR", code: "SETTLE_INVALID", message: "settlement cancelled and gold returned", x, y });
    } else {
      sendToPlayer(liveActor.id, { type: "ERROR", code: "SETTLE_INVALID", message: "tile captured during settlement; gold forfeited", x, y });
    }
    sendPlayerUpdate(liveActor, 0);
    return;
  }
  if (live.ownershipState !== "FRONTIER") {
    refundPendingSettlement(settlement);
    sendToPlayer(liveActor.id, { type: "ERROR", code: "SETTLE_INVALID", message: "settlement cancelled and gold returned", x, y });
    sendPlayerUpdate(liveActor, 0);
    return;
  }
  updateOwnership(x, y, liveActor.id, "SETTLED");
  revealLinkedDocksForPlayer(liveActor.id, settlement.tileKey);
  recordFrontierSettlementForPressure(liveActor.id);
  const effects = getPlayerEffectsForPlayer(liveActor.id);
  if (effects.newSettlementDefenseMult > 1) {
    settlementDefenseByTile.set(settlement.tileKey, {
      ownerId: liveActor.id,
      expiresAt: now() + NEW_SETTLEMENT_DEFENSE_MS,
      mult: effects.newSettlementDefenseMult
    });
  }
  sendToPlayer(liveActor.id, {
    type: "COMBAT_RESULT",
    winnerId: liveActor.id,
    changes: [{ x, y, ownerId: liveActor.id, ownershipState: "SETTLED" }],
    pointsDelta: 0,
    levelDelta: 0
  });
  sendPlayerUpdate(liveActor, 0);
  telemetryCounters.settlements += 1;
};

const schedulePendingSettlementResolution = (settlement: PendingSettlement): void => {
  const remaining = Math.max(0, settlement.resolvesAt - now());
  settlement.timeout = setTimeout(() => resolvePendingSettlement(settlement), remaining);
};

const startSettlement = (
  actor: Player,
  x: number,
  y: number,
  opts?: { goldCost?: number; settleMs?: number }
): { ok: boolean; reason?: string; resolvesAt?: number } => {
  const goldCost = opts?.goldCost ?? SETTLE_COST;
  const effects = getPlayerEffectsForPlayer(actor.id);
  const settleMs = Math.max(250, Math.round((opts?.settleMs ?? SETTLE_MS) / effects.settlementSpeedMult));
  const t = playerTile(x, y);
  if (t.terrain !== "LAND") return { ok: false, reason: "settlement requires land tile" };
  if (t.ownerId !== actor.id) return { ok: false, reason: "tile must be owned" };
  if (t.ownershipState !== "FRONTIER") return { ok: false, reason: "tile is already settled" };
  if (!canAffordGoldCost(actor.points, goldCost)) return { ok: false, reason: "insufficient gold to settle" };
  const tk = key(t.x, t.y);
  if (pendingSettlementsByTile.has(tk)) return { ok: false, reason: "tile already settling" };
  if (combatLocks.has(tk)) return { ok: false, reason: "tile is locked in combat" };
  if (!canStartDevelopmentProcess(actor.id)) return { ok: false, reason: `all ${DEVELOPMENT_PROCESS_LIMIT} development slots are busy` };

  const startedAt = now();
  const resolvesAt = startedAt + settleMs;
  actor.points -= goldCost;
  recalcPlayerDerived(actor);
  const pending: PendingSettlement = {
    tileKey: tk,
    ownerId: actor.id,
    startedAt,
    resolvesAt,
    goldCost,
    cancelled: false
  };
  pendingSettlementsByTile.set(tk, pending);
  schedulePendingSettlementResolution(pending);
  sendPlayerUpdate(actor, 0);
  return { ok: true, resolvesAt };
};

const hasRevealCapability = (player: Player): boolean => {
  return playerHasTechIds(player, ABILITY_DEFS.reveal_empire.requiredTechIds) || getOrInitRevealTargets(player.id).size > 0;
};

const tryActivateRevealEmpire = (actor: Player, targetPlayerId: string): { ok: boolean; reason?: string } => {
  if (!hasRevealCapability(actor)) return { ok: false, reason: "unlock reveal capability via tech/domain first" };
  if (targetPlayerId === actor.id) return { ok: false, reason: "cannot reveal yourself" };
  const target = players.get(targetPlayerId);
  if (!target) return { ok: false, reason: "target empire not found" };
  if (actor.allies.has(targetPlayerId)) return { ok: false, reason: "cannot reveal allied empire" };
  const reveals = getOrInitRevealTargets(actor.id);
  if (abilityOnCooldown(actor.id, "reveal_empire")) return { ok: false, reason: "reveal empire is cooling down" };
  if (reveals.has(targetPlayerId)) return { ok: false, reason: "target already revealed" };
  if (reveals.size >= 1) return { ok: false, reason: "only one revealed empire allowed" };
  const stock = getOrInitStrategicStocks(actor.id);
  if ((stock.CRYSTAL ?? 0) < REVEAL_EMPIRE_ACTIVATION_COST) return { ok: false, reason: "insufficient crystal to activate reveal" };
  stock.CRYSTAL = Math.max(0, (stock.CRYSTAL ?? 0) - REVEAL_EMPIRE_ACTIVATION_COST);
  setRevealTargetsForPlayer(actor.id, [targetPlayerId]);
  return { ok: true };
};

const completeObservatoryConstruction = (tileKey: TileKey): void => {
  const current = observatoriesByTile.get(tileKey);
  if (!current) return;
  const [x, y] = parseKey(tileKey);
  const tileNow = runtimeTileCore(x, y);
  if (tileNow.ownerId !== current.ownerId || tileNow.ownershipState !== "SETTLED") {
    cancelObservatoryBuild(tileKey);
    return;
  }
  current.status = "active";
  delete current.completesAt;
  observatoryBuildTimers.delete(tileKey);
  markVisibilityDirty(current.ownerId);
  updateOwnership(x, y, current.ownerId);
};

const scheduleObservatoryConstruction = (tileKey: TileKey, buildMs: number): void => {
  const timer = setTimeout(() => completeObservatoryConstruction(tileKey), buildMs);
  observatoryBuildTimers.set(tileKey, timer);
};

const tryBuildObservatory = (actor: Player, x: number, y: number): { ok: boolean; reason?: string } => {
  if (!actor.techIds.has("cartography")) return { ok: false, reason: "unlock observatories via Cartography first" };
  const t = playerTile(x, y);
  if (t.terrain !== "LAND") return { ok: false, reason: "observatory requires land tile" };
  if (t.ownerId !== actor.id || t.ownershipState !== "SETTLED") return { ok: false, reason: "observatory requires settled owned tile" };
  const tk = key(t.x, t.y);
  if (observatoriesByTile.has(tk)) return { ok: false, reason: "tile already has observatory" };
  if (fortsByTile.has(tk)) return { ok: false, reason: "tile already has fort" };
  if (siegeOutpostsByTile.has(tk)) return { ok: false, reason: "tile already has siege outpost" };
  if (economicStructuresByTile.has(tk)) return { ok: false, reason: "tile already has structure" };
  if (!canStartDevelopmentProcess(actor.id)) return { ok: false, reason: `all ${DEVELOPMENT_PROCESS_LIMIT} development slots are busy` };
  if (actor.points < OBSERVATORY_BUILD_COST) return { ok: false, reason: "insufficient gold for observatory" };
  if (!consumeStrategicResource(actor, "CRYSTAL", OBSERVATORY_BUILD_CRYSTAL_COST)) return { ok: false, reason: "insufficient CRYSTAL for observatory" };
  actor.points -= OBSERVATORY_BUILD_COST;
  recalcPlayerDerived(actor);
  const completesAt = now() + OBSERVATORY_BUILD_MS;
  observatoriesByTile.set(tk, {
    observatoryId: crypto.randomUUID(),
    ownerId: actor.id,
    tileKey: tk,
    status: "under_construction",
    completesAt
  });
  trackOwnedTileKey(observatoryTileKeysByPlayer, actor.id, tk);
  markVisibilityDirty(actor.id);
  recordTileStructureHistory(tk, "OBSERVATORY");
  scheduleObservatoryConstruction(tk, OBSERVATORY_BUILD_MS);
  return { ok: true };
};

const trySabotageTile = (actor: Player, x: number, y: number): { ok: boolean; reason?: string } => {
  if (!playerHasTechIds(actor, ABILITY_DEFS.sabotage.requiredTechIds)) return { ok: false, reason: "requires Cryptography" };
  if (abilityOnCooldown(actor.id, "sabotage")) return { ok: false, reason: "sabotage is cooling down" };
  const t = playerTile(x, y);
  if (t.terrain !== "LAND") return { ok: false, reason: "sabotage requires land tile" };
  if (!t.ownerId || t.ownerId === actor.id || actor.allies.has(t.ownerId)) return { ok: false, reason: "target enemy-controlled town or resource tile" };
  if (!t.town && !t.resource) return { ok: false, reason: "target must be a town or resource tile" };
  if (hostileObservatoryProtectingTile(actor, x, y)) return { ok: false, reason: "target is inside enemy observatory protection field" };
  const tk = key(t.x, t.y);
  const current = sabotageByTile.get(tk);
  if (current && current.endsAt > now()) return { ok: false, reason: "tile already sabotaged" };
  if (!consumeStrategicResource(actor, "CRYSTAL", SABOTAGE_CRYSTAL_COST)) return { ok: false, reason: "insufficient CRYSTAL for sabotage" };
  sabotageByTile.set(tk, {
    targetTileKey: tk,
    casterPlayerId: actor.id,
    endsAt: now() + SABOTAGE_DURATION_MS,
    outputMultiplier: SABOTAGE_OUTPUT_MULT
  });
  startAbilityCooldown(actor.id, "sabotage");
  return { ok: true };
};

const terrainShapeWouldSealAdjacentOwnedLand = (x: number, y: number): boolean => {
  const neighbors: Array<[number, number]> = [
    [x, y - 1],
    [x + 1, y],
    [x, y + 1],
    [x - 1, y]
  ];
  for (const [nxRaw, nyRaw] of neighbors) {
    const nx = wrapX(nxRaw, WORLD_WIDTH);
    const ny = wrapY(nyRaw, WORLD_HEIGHT);
    const neighbor = playerTile(nx, ny);
    if (!neighbor.ownerId || neighbor.terrain !== "LAND") continue;
    const exits: Array<[number, number]> = [
      [nx, ny - 1],
      [nx + 1, ny],
      [nx, ny + 1],
      [nx - 1, ny]
    ];
    let hasLandExit = false;
    for (const [exRaw, eyRaw] of exits) {
      const ex = wrapX(exRaw, WORLD_WIDTH);
      const ey = wrapY(eyRaw, WORLD_HEIGHT);
      if (ex === wrapX(x, WORLD_WIDTH) && ey === wrapY(y, WORLD_HEIGHT)) continue;
      if (terrainAtRuntime(ex, ey) === "LAND") {
        hasLandExit = true;
        break;
      }
    }
    if (!hasLandExit) return true;
  }
  return false;
};

const tryCreateMountain = (actor: Player, x: number, y: number): { ok: boolean; reason?: string } => {
  if (!playerHasTechIds(actor, ABILITY_DEFS.create_mountain.requiredTechIds)) return { ok: false, reason: "requires Terrain Engineering" };
  if (abilityOnCooldown(actor.id, "create_mountain")) return { ok: false, reason: "create mountain is cooling down" };
  const t = playerTile(x, y);
  const tk = key(t.x, t.y);
  if (t.terrain !== "LAND") return { ok: false, reason: "target must be land" };
  if (!hasOwnedLandWithinRange(actor.id, t.x, t.y, TERRAIN_SHAPING_RANGE)) return { ok: false, reason: "target must be within 2 tiles of your land" };
  if (combatLocks.has(tk)) return { ok: false, reason: "tile locked in combat" };
  if (hostileObservatoryProtectingTile(actor, t.x, t.y)) return { ok: false, reason: "target is inside enemy observatory protection field" };
  if (townsByTile.has(tk)) return { ok: false, reason: "cannot create mountain on town tile" };
  if (docksByTile.has(tk)) return { ok: false, reason: "cannot create mountain on dock tile" };
  if (fortsByTile.has(tk) || siegeOutpostsByTile.has(tk) || observatoriesByTile.has(tk) || economicStructuresByTile.has(tk)) {
    return { ok: false, reason: "cannot create mountain on structured tile" };
  }
  if (!terrainShapeWithinPlayerDensity(t.x, t.y)) return { ok: false, reason: "too many created mountains nearby" };
  if (terrainShapeWouldSealAdjacentOwnedLand(t.x, t.y)) return { ok: false, reason: "would seal a nearby owned tile" };
  if (actor.points < TERRAIN_SHAPING_GOLD_COST) return { ok: false, reason: "insufficient gold for create mountain" };
  if (!consumeStrategicResource(actor, "CRYSTAL", TERRAIN_SHAPING_CRYSTAL_COST)) return { ok: false, reason: "insufficient CRYSTAL for create mountain" };

  actor.points -= TERRAIN_SHAPING_GOLD_COST;
  startAbilityCooldown(actor.id, "create_mountain");
  const previousOwnerId = t.ownerId;
  if (previousOwnerId) updateOwnership(t.x, t.y, undefined);
  else tileYieldByTile.delete(tk);
  terrainShapesByTile.set(tk, { terrain: "MOUNTAIN", createdByPlayer: true });
  recordMountainShapeHistory(tk, "created");
  recalcPlayerDerived(actor);
  if (previousOwnerId && previousOwnerId !== actor.id) {
    const previousOwner = players.get(previousOwnerId);
    if (previousOwner) {
      recalcPlayerDerived(previousOwner);
      resolveEliminationIfNeeded(previousOwner, socketsByPlayer.has(previousOwner.id));
      sendPlayerUpdate(previousOwner, 0);
    }
  }
  resolveEliminationIfNeeded(actor, socketsByPlayer.has(actor.id));
  return { ok: true };
};

const tryRemoveMountain = (actor: Player, x: number, y: number): { ok: boolean; reason?: string } => {
  if (!playerHasTechIds(actor, ABILITY_DEFS.remove_mountain.requiredTechIds)) return { ok: false, reason: "requires Terrain Engineering" };
  if (abilityOnCooldown(actor.id, "remove_mountain")) return { ok: false, reason: "remove mountain is cooling down" };
  const wx = wrapX(x, WORLD_WIDTH);
  const wy = wrapY(y, WORLD_HEIGHT);
  const tk = key(wx, wy);
  if (terrainAtRuntime(wx, wy) !== "MOUNTAIN") return { ok: false, reason: "target must be mountain" };
  if (!hasOwnedLandWithinRange(actor.id, wx, wy, TERRAIN_SHAPING_RANGE)) return { ok: false, reason: "target must be within 2 tiles of your land" };
  if (combatLocks.has(tk)) return { ok: false, reason: "tile locked in combat" };
  if (hostileObservatoryProtectingTile(actor, wx, wy)) return { ok: false, reason: "target is inside enemy observatory protection field" };
  if (actor.points < TERRAIN_SHAPING_GOLD_COST) return { ok: false, reason: "insufficient gold for remove mountain" };
  if (!consumeStrategicResource(actor, "CRYSTAL", TERRAIN_SHAPING_CRYSTAL_COST)) return { ok: false, reason: "insufficient CRYSTAL for remove mountain" };

  actor.points -= TERRAIN_SHAPING_GOLD_COST;
  startAbilityCooldown(actor.id, "remove_mountain");
  const originalTerrain = terrainAt(wx, wy);
  if (originalTerrain === "MOUNTAIN") terrainShapesByTile.set(tk, { terrain: "LAND", createdByPlayer: false });
  else terrainShapesByTile.delete(tk);
  tileYieldByTile.delete(tk);
  recordMountainShapeHistory(tk, "removed");
  recalcPlayerDerived(actor);
  return { ok: true };
};

const tryBuildFort = (actor: Player, x: number, y: number): { ok: boolean; reason?: string } => {
  const effects = getPlayerEffectsForPlayer(actor.id);
  if (!effects.unlockForts) return { ok: false, reason: "unlock forts via Masonry first" };
  const t = playerTile(x, y);
  if (t.terrain !== "LAND") return { ok: false, reason: "fort requires land tile" };
  if (t.ownerId !== actor.id) return { ok: false, reason: "fort tile must be owned" };
  const tk = key(t.x, t.y);
  if (fortsByTile.has(tk)) return { ok: false, reason: "tile already fortified" };
  if (siegeOutpostsByTile.has(tk)) return { ok: false, reason: "tile already has siege outpost" };
  if (observatoriesByTile.has(tk) || economicStructuresByTile.has(tk)) return { ok: false, reason: "tile already has structure" };
  const dock = docksByTile.get(tk);
  if (!dock && !isBorderTile(t.x, t.y, actor.id)) return { ok: false, reason: "fort must be on border tile or dock" };
  if (countPlayerForts(actor.id) >= fortCapacityForPlayer(actor.id)) return { ok: false, reason: "fort cap reached" };
  if (!canStartDevelopmentProcess(actor.id)) return { ok: false, reason: `all ${DEVELOPMENT_PROCESS_LIMIT} development slots are busy` };
  const goldCost = Math.ceil(FORT_BUILD_COST * effects.fortBuildGoldCostMult);
  if (actor.points < goldCost) return { ok: false, reason: "insufficient gold for fort" };
  if (!consumeStrategicResource(actor, "IRON", FORT_BUILD_IRON_COST)) return { ok: false, reason: "insufficient IRON for fort" };
  actor.points -= goldCost;
  recalcPlayerDerived(actor);
  const fort: Fort = {
    fortId: crypto.randomUUID(),
    ownerId: actor.id,
    tileKey: tk,
    status: "under_construction",
    startedAt: now(),
    completesAt: now() + FORT_BUILD_MS
  };
  fortsByTile.set(tk, fort);
  recordTileStructureHistory(tk, "FORT");
  const timer = setTimeout(() => {
    const current = fortsByTile.get(tk);
    if (!current) return;
    const tileNow = runtimeTileCore(t.x, t.y);
    if (tileNow.ownerId !== actor.id) {
      fortsByTile.delete(tk);
      fortBuildTimers.delete(tk);
      return;
    }
    current.status = "active";
    fortBuildTimers.delete(tk);
    updateOwnership(t.x, t.y, actor.id);
  }, FORT_BUILD_MS);
  fortBuildTimers.set(tk, timer);
  return { ok: true };
};

const tryBuildSiegeOutpost = (actor: Player, x: number, y: number): { ok: boolean; reason?: string } => {
  const effects = getPlayerEffectsForPlayer(actor.id);
  if (!effects.unlockSiegeOutposts) return { ok: false, reason: "unlock siege outposts via Leatherworking first" };
  const t = playerTile(x, y);
  if (t.terrain !== "LAND") return { ok: false, reason: "siege outpost requires land tile" };
  if (t.ownerId !== actor.id) return { ok: false, reason: "siege outpost tile must be owned" };
  const tk = key(t.x, t.y);
  if (siegeOutpostsByTile.has(tk)) return { ok: false, reason: "tile already has siege outpost" };
  if (fortsByTile.has(tk)) return { ok: false, reason: "tile already has fort" };
  if (observatoriesByTile.has(tk) || economicStructuresByTile.has(tk)) return { ok: false, reason: "tile already has structure" };
  if (!isBorderTile(t.x, t.y, actor.id)) return { ok: false, reason: "siege outpost must be on border tile" };
  if (countPlayerSiegeOutposts(actor.id) >= siegeOutpostCapacityForPlayer(actor.id))
    return { ok: false, reason: "siege outpost cap reached" };
  if (!canStartDevelopmentProcess(actor.id)) return { ok: false, reason: `all ${DEVELOPMENT_PROCESS_LIMIT} development slots are busy` };
  if (actor.points < SIEGE_OUTPOST_BUILD_COST) return { ok: false, reason: "insufficient gold for siege outpost" };
  if (!consumeStrategicResource(actor, "SUPPLY", SIEGE_OUTPOST_BUILD_SUPPLY_COST))
    return { ok: false, reason: "insufficient SUPPLY for siege outpost" };
  actor.points -= SIEGE_OUTPOST_BUILD_COST;
  recalcPlayerDerived(actor);
  const siegeOutpost: SiegeOutpost = {
    siegeOutpostId: crypto.randomUUID(),
    ownerId: actor.id,
    tileKey: tk,
    status: "under_construction",
    startedAt: now(),
    completesAt: now() + SIEGE_OUTPOST_BUILD_MS
  };
  siegeOutpostsByTile.set(tk, siegeOutpost);
  recordTileStructureHistory(tk, "SIEGE_OUTPOST");
  const timer = setTimeout(() => {
    const current = siegeOutpostsByTile.get(tk);
    if (!current) return;
    const tileNow = runtimeTileCore(t.x, t.y);
    if (tileNow.ownerId !== actor.id) {
      siegeOutpostsByTile.delete(tk);
      siegeOutpostBuildTimers.delete(tk);
      return;
    }
    current.status = "active";
    siegeOutpostBuildTimers.delete(tk);
    updateOwnership(t.x, t.y, actor.id);
  }, SIEGE_OUTPOST_BUILD_MS);
  siegeOutpostBuildTimers.set(tk, timer);
  return { ok: true };
};

const updateOwnership = (x: number, y: number, newOwner: string | undefined, newState?: OwnershipState): void => {
  const t = playerTile(x, y);
  const oldOwner = t.ownerId;
  const k = key(t.x, t.y);
  const clusterId = t.clusterId;
  const affectedPlayers = new Set<string>();
  if (oldOwner) affectedPlayers.add(oldOwner);
  if (newOwner) affectedPlayers.add(newOwner);
  for (const n of cardinalNeighborCores(t.x, t.y)) {
    if (n.ownerId) affectedPlayers.add(n.ownerId);
  }

  if (oldOwner && newOwner !== oldOwner) {
    if (oldOwner === BARBARIAN_OWNER_ID) {
      removeBarbarianAtTile(k);
    }
    const settle = pendingSettlementsByTile.get(k);
    if (settle) {
      clearPendingSettlement(settle);
      if (!newOwner || newOwner === settle.ownerId) {
        refundPendingSettlement(settle);
        const player = players.get(settle.ownerId);
        if (player) {
          sendToPlayer(player.id, { type: "ERROR", code: "SETTLE_INVALID", message: "settlement cancelled and gold returned", x: t.x, y: t.y });
          sendPlayerUpdate(player, 0);
        }
      } else {
        const player = players.get(settle.ownerId);
        if (player) {
          sendToPlayer(player.id, { type: "ERROR", code: "SETTLE_INVALID", message: "tile captured during settlement; gold forfeited", x: t.x, y: t.y });
          sendPlayerUpdate(player, 0);
        }
      }
    }
    const fort = fortsByTile.get(k);
    if (fort) {
      cancelFortBuild(k);
      fortsByTile.delete(k);
    }
    const observatory = observatoriesByTile.get(k);
    if (observatory) {
      if (observatory.status === "under_construction") {
        cancelObservatoryBuild(k);
      } else {
        untrackOwnedTileKey(observatoryTileKeysByPlayer, observatory.ownerId, k);
        observatoriesByTile.delete(k);
      }
    }
    const economic = economicStructuresByTile.get(k);
    const siege = siegeOutpostsByTile.get(k);
    if (siege) {
      cancelSiegeOutpostBuild(k);
      siegeOutpostsByTile.delete(k);
    }
    sabotageByTile.delete(k);
    breachShockByTile.delete(k);
    settlementDefenseByTile.delete(k);
    if (economic) {
      if (economic.status === "under_construction") {
        cancelEconomicStructureBuild(k);
      } else if (newOwner) {
        untrackOwnedTileKey(economicStructureTileKeysByPlayer, economic.ownerId, k);
        economic.ownerId = newOwner;
        economic.status = "inactive";
        delete economic.completesAt;
        economic.nextUpkeepAt = now() + ECONOMIC_STRUCTURE_UPKEEP_INTERVAL_MS;
        trackOwnedTileKey(economicStructureTileKeysByPlayer, newOwner, k);
      } else {
        untrackOwnedTileKey(economicStructureTileKeysByPlayer, economic.ownerId, k);
        economicStructuresByTile.delete(k);
      }
    }
  }

  if (newOwner) {
    ownership.set(k, newOwner);
    const stateToSet =
      newState ??
      (newOwner === BARBARIAN_OWNER_ID ? "BARBARIAN" : oldOwner === newOwner ? ownershipStateByTile.get(k) : "FRONTIER");
    ownershipStateByTile.set(k, stateToSet ?? (newOwner === BARBARIAN_OWNER_ID ? "BARBARIAN" : "FRONTIER"));
  } else {
    ownership.delete(k);
    ownershipStateByTile.delete(k);
    const observatory = observatoriesByTile.get(k);
    if (observatory) {
      if (observatory.status === "under_construction") {
        cancelObservatoryBuild(k);
      } else {
        untrackOwnedTileKey(observatoryTileKeysByPlayer, observatory.ownerId, k);
        observatoriesByTile.delete(k);
      }
    }
    const economic = economicStructuresByTile.get(k);
    if (economic) {
      if (economic.status === "under_construction") {
        cancelEconomicStructureBuild(k);
      } else {
        untrackOwnedTileKey(economicStructureTileKeysByPlayer, economic.ownerId, k);
        economicStructuresByTile.delete(k);
      }
    }
    sabotageByTile.delete(k);
    breachShockByTile.delete(k);
    settlementDefenseByTile.delete(k);
  }
  if (oldOwner !== newOwner) {
    if (!newOwner) tileYieldByTile.delete(k);
    if (oldOwner && newOwner) recordTileCaptureHistory(k, oldOwner, newOwner);
    if (oldOwner && newOwner && townsByTile.has(k)) applyTownCaptureShock(k);
  }

  if (oldOwner) {
    const p = players.get(oldOwner);
    if (p) {
      p.territoryTiles.delete(k);
      const r = t.resource;
      if (r) getOrInitResourceCounts(oldOwner)[r] = (getOrInitResourceCounts(oldOwner)[r] ?? 0) - 1;
      if (clusterId) setClusterControlDelta(oldOwner, clusterId, -1);
    }
  }

  if (newOwner) {
    const p = players.get(newOwner);
    if (p) {
      p.territoryTiles.add(k);
      const r = t.resource;
      if (r) getOrInitResourceCounts(newOwner)[r] = (getOrInitResourceCounts(newOwner)[r] ?? 0) + 1;
      if (clusterId) setClusterControlDelta(newOwner, clusterId, 1);
    }
  }

  for (const pid of affectedPlayers) {
    const p = players.get(pid);
    if (!p) continue;
    recomputeExposure(p);
    reconcileCapitalForPlayer(p);
    rebuildEconomyIndexForPlayer(pid);
  }

  const visibilityAffectedPlayers = new Set<string>();
  if (oldOwner) {
    visibilityAffectedPlayers.add(oldOwner);
    for (const watcherPlayerId of revealWatchersByTarget.get(oldOwner) ?? []) visibilityAffectedPlayers.add(watcherPlayerId);
  }
  if (newOwner) {
    visibilityAffectedPlayers.add(newOwner);
    for (const watcherPlayerId of revealWatchersByTarget.get(newOwner) ?? []) visibilityAffectedPlayers.add(watcherPlayerId);
  }
  markVisibilityDirtyForPlayers(visibilityAffectedPlayers);

  sendVisibleTileDeltaSquare(t.x, t.y, 1);
};

const spawnPlayer = (p: Player): void => {
  const hasNearbyTown = (x: number, y: number, radius: number): boolean => {
    for (let dy = -radius; dy <= radius; dy += 1) {
      for (let dx = -radius; dx <= radius; dx += 1) {
        if (Math.abs(dx) + Math.abs(dy) > radius) continue;
        if (townsByTile.has(key(wrapX(x + dx, WORLD_WIDTH), wrapY(y + dy, WORLD_HEIGHT)))) return true;
      }
    }
    return false;
  };
  const hasNearbyFood = (x: number, y: number, radius: number): boolean => {
    for (let dy = -radius; dy <= radius; dy += 1) {
      for (let dx = -radius; dx <= radius; dx += 1) {
        if (Math.abs(dx) + Math.abs(dy) > radius) continue;
        const tk = key(wrapX(x + dx, WORLD_WIDTH), wrapY(y + dy, WORLD_HEIGHT));
        const clusterId = clusterByTile.get(tk);
        const cluster = clusterId ? clustersById.get(clusterId) : undefined;
        if (!cluster) continue;
        const resource = clusterResourceType(cluster);
        if (resource === "FARM" || resource === "FISH") return true;
      }
    }
    return false;
  };
  const trySpawnAt = (x: number, y: number): boolean => {
    const t = playerTile(x, y);
    if (t.terrain !== "LAND") return false;
    const owner = t.ownerId;
    if (owner && owner !== BARBARIAN_OWNER_ID) return false;
    updateOwnership(x, y, p.id, "SETTLED");
    p.spawnOrigin = key(x, y);
    p.capitalTileKey = key(x, y);
    sendVisibleTileDeltaAt(x, y);
    p.spawnShieldUntil = now() + 120_000;
    p.isEliminated = false;
    p.respawnPending = false;
    if (appRef) appRef.log.info({ playerId: p.id, x, y }, "spawned player");
    return true;
  };

  for (let i = 0; i < 8000; i += 1) {
    const x = Math.floor(Math.random() * WORLD_WIDTH);
    const y = Math.floor(Math.random() * WORLD_HEIGHT);
    const t = playerTile(x, y);
    if (t.terrain !== "LAND" || t.ownerId) continue;
    if (!hasNearbyTown(x, y, 15)) continue;
    if (!hasNearbyFood(x, y, 15)) continue;
    if (trySpawnAt(x, y)) return;
  }

  for (let i = 0; i < 5000; i += 1) {
    const x = Math.floor(Math.random() * WORLD_WIDTH);
    const y = Math.floor(Math.random() * WORLD_HEIGHT);
    const t = playerTile(x, y);
    if (t.terrain !== "LAND") continue;
    if (!t.ownerId && trySpawnAt(x, y)) return;
  }

  // Fallback: allow reclaiming barbarian land so spawn is never impossible.
  for (let i = 0; i < 20_000; i += 1) {
    const x = Math.floor(Math.random() * WORLD_WIDTH);
    const y = Math.floor(Math.random() * WORLD_HEIGHT);
    const t = playerTile(x, y);
    if (t.terrain !== "LAND" || t.ownerId !== BARBARIAN_OWNER_ID) continue;
    if (trySpawnAt(x, y)) return;
  }

  // Final safety: deterministic scan in case random attempts miss.
  for (let y = 0; y < WORLD_HEIGHT; y += 1) {
    for (let x = 0; x < WORLD_WIDTH; x += 1) {
      if (trySpawnAt(x, y)) return;
    }
  }

  if (appRef) appRef.log.error({ playerId: p.id }, "failed to find any land tile for spawn");
  else console.error("failed to find any land tile for spawn", { playerId: p.id });
};

const serializePlayer = (p: Player) => ({
  ...p,
  techIds: [...p.techIds],
  domainIds: [...p.domainIds],
  territoryTiles: [...p.territoryTiles],
  allies: [...p.allies]
});

const rebuildOwnershipDerivedState = (): void => {
  for (const p of players.values()) {
    p.territoryTiles.clear();
    p.T = 0;
    p.E = 0;
    p.Ts = 0;
    p.Es = 0;
    resourceCountsByPlayer.set(p.id, { FARM: 0, FISH: 0, FUR: 0, WOOD: 0, IRON: 0, GEMS: 0 });
    clusterControlledTilesByPlayer.set(p.id, new Map());
  }

  for (const [tk, ownerId] of [...ownership.entries()]) {
    if (ownerId === BARBARIAN_OWNER_ID) {
      const [x, y] = parseKey(tk);
      const t = playerTile(x, y);
      if (t.terrain !== "LAND") {
        ownership.delete(tk);
        ownershipStateByTile.delete(tk);
        continue;
      }
      ownershipStateByTile.set(tk, "BARBARIAN");
      continue;
    }
    const p = players.get(ownerId);
    if (!p) {
      ownership.delete(tk);
      continue;
    }
    const [x, y] = parseKey(tk);
    const t = playerTile(x, y);
    if (t.terrain !== "LAND") {
      ownership.delete(tk);
      ownershipStateByTile.delete(tk);
      continue;
    }
    if (!ownershipStateByTile.has(tk)) ownershipStateByTile.set(tk, "SETTLED");
    p.territoryTiles.add(tk);
    p.T += 1;
    if (t.resource) getOrInitResourceCounts(ownerId)[t.resource] = (getOrInitResourceCounts(ownerId)[t.resource] ?? 0) + 1;
    if (t.clusterId) setClusterControlDelta(ownerId, t.clusterId, 1);
  }

  for (const p of players.values()) {
    recomputeExposure(p);
    reconcileCapitalForPlayer(p);
    updateMissionState(p);
  }
  for (const agent of [...barbarianAgents.values()]) {
    const t = playerTile(agent.x, agent.y);
    if (t.ownerId !== BARBARIAN_OWNER_ID || t.terrain !== "LAND") {
      removeBarbarianAgent(agent.id);
      continue;
    }
    upsertBarbarianAgent(agent);
  }
};

const playerHomeTile = (p: Player): { x: number; y: number } | undefined => {
  const first = p.spawnOrigin ?? [...p.territoryTiles][0];
  if (!first) return undefined;
  const [x, y] = parseKey(first);
  return { x, y };
};

const getOrCreatePlayerForIdentity = (identity: AuthIdentity): Player | undefined => {
  let player = players.get(identity.playerId);
  if (!player) player = [...players.values()].find((p) => p.name === identity.name);
  if (!player) {
    player = {
      id: crypto.randomUUID(),
      name: identity.name,
      profileComplete: false,
      points: STARTING_GOLD,
      level: 0,
      techIds: new Set<string>(),
      domainIds: new Set<string>(),
      mods: { attack: 1, defense: 1, income: 1, vision: 1 },
      powerups: {},
      tileColor: colorFromId(identity.name),
      missions: [],
      missionStats: defaultMissionStats(),
      territoryTiles: new Set<TileKey>(),
      T: 0,
      E: 0,
      Ts: 0,
      Es: 0,
      stamina: STAMINA_MAX,
      staminaUpdatedAt: now(),
      allies: new Set<string>(),
      spawnShieldUntil: now() + 120_000,
      isEliminated: false,
      respawnPending: false,
      lastActiveAt: now()
    };
    players.set(player.id, player);
    identity.playerId = player.id;
    playerBaseMods.set(player.id, { attack: 1, defense: 1, income: 1, vision: 1 });
    strategicResourceStockByPlayer.set(player.id, emptyStrategicStocks());
    strategicResourceBufferByPlayer.set(player.id, emptyStrategicStocks());
    economyIndexByPlayer.set(player.id, emptyPlayerEconomyIndex());
    dynamicMissionsByPlayer.set(player.id, []);
    forcedRevealTilesByPlayer.set(player.id, new Set<TileKey>());
    setRevealTargetsForPlayer(player.id, []);
    playerEffectsByPlayer.set(player.id, emptyPlayerEffects());
    spawnPlayer(player);
  }
  if (!player) return undefined;
  if (!(player.domainIds instanceof Set)) {
    (player as unknown as { domainIds: Set<string> }).domainIds = new Set<string>();
  }
  normalizePlayerProgressionState(player);
  if (player.T <= 0 || player.territoryTiles.size === 0) {
    spawnPlayer(player);
  }
  if (!player.tileColor) {
    player.tileColor = colorFromId(player.id);
  }
  if (player.name !== identity.name) {
    player.name = identity.name;
  }
  recomputePlayerEffectsForPlayer(player);
  ensureMissionDefaults(player);
  updateMissionState(player);
  return player;
};

const getOrInitTileHistory = (tileKey: TileKey): TileHistoryState => {
  let history = tileHistoryByTile.get(tileKey);
  if (!history) {
    history = {
      previousOwners: [],
      captureCount: 0,
      structureHistory: []
    };
    tileHistoryByTile.set(tileKey, history);
  }
  return history;
};

const pushRollingUnique = (items: string[], value: string, cap: number): void => {
  if (items[items.length - 1] !== value) items.push(value);
  while (items.length > cap) items.shift();
};

const recordTileCaptureHistory = (tileKey: TileKey, oldOwner: string, newOwner: string): void => {
  if (!oldOwner || !newOwner || oldOwner === newOwner) return;
  const history = getOrInitTileHistory(tileKey);
  history.lastOwnerId = oldOwner;
  pushRollingUnique(history.previousOwners, oldOwner, 5);
  history.captureCount += 1;
  history.lastCapturedAt = now();
};

const recordTileStructureHistory = (tileKey: TileKey, structureType: "FORT" | "SIEGE_OUTPOST" | "OBSERVATORY" | EconomicStructureType): void => {
  const history = getOrInitTileHistory(tileKey);
  history.lastStructureType = structureType;
  history.structureHistory.push(structureType);
  while (history.structureHistory.length > 5) history.structureHistory.shift();
};

const recordMountainShapeHistory = (tileKey: TileKey, kind: "created" | "removed"): void => {
  const history = getOrInitTileHistory(tileKey);
  if (kind === "created") history.wasMountainCreatedByPlayer = true;
  if (kind === "removed") history.wasMountainRemovedByPlayer = true;
};

const buildSnapshotState = (): SnapshotState => {
  const snapshot: SnapshotState = {
    world: { width: WORLD_WIDTH, height: WORLD_HEIGHT },
    players: [...players.values()].map(serializePlayer),
    ownership: [...ownership.entries()],
    ownershipState: [...ownershipStateByTile.entries()],
    barbarianAgents: [...barbarianAgents.values()],
    authIdentities: [...authIdentityByUid.values()],
    resources: [...resourceCountsByPlayer.entries()],
    strategicResources: [...strategicResourceStockByPlayer.entries()],
    strategicResourceBuffer: [...strategicResourceBufferByPlayer.entries()],
    tileYield: [...tileYieldByTile.entries()],
    tileHistory: [...tileHistoryByTile.entries()],
    terrainShapes: [...terrainShapesByTile.entries()],
    seasonVictory: [...victoryPressureById.entries()],
    frontierSettlements: [...frontierSettlementsByPlayer.entries()],
    dynamicMissions: [...dynamicMissionsByPlayer.entries()],
    temporaryAttackBuffUntil: [...temporaryAttackBuffUntilByPlayer.entries()],
    temporaryIncomeBuff: [...temporaryIncomeBuffUntilByPlayer.entries()],
    forcedReveal: [...forcedRevealTilesByPlayer.entries()].map(([pid, set]) => [pid, [...set]]),
    revealedEmpireTargets: [...revealedEmpireTargetsByPlayer.entries()].map(([pid, set]) => [pid, [...set]]),
    allianceRequests: [...allianceRequests.values()],
    forts: [...fortsByTile.values()],
    observatories: [...observatoriesByTile.values()],
    siegeOutposts: [...siegeOutpostsByTile.values()],
    economicStructures: [...economicStructuresByTile.values()],
    sabotage: [...sabotageByTile.values()],
    abilityCooldowns: [...abilityCooldownsByPlayer.entries()].map(([pid, map]) => [pid, [...map.entries()]]),
    docks: [...dockById.values()],
    towns: [...townsByTile.values()],
    firstSpecialSiteCaptureClaimed: [...firstSpecialSiteCaptureClaimed],
    clusters: [...clustersById.values()],
    clusterTiles: [...clusterByTile.entries()],
    pendingSettlements: [...pendingSettlementsByTile.values()].map((settle) => ({
      tileKey: settle.tileKey,
      ownerId: settle.ownerId,
      startedAt: settle.startedAt,
      resolvesAt: settle.resolvesAt,
      goldCost: settle.goldCost
    })),
    townCaptureShock: [...townCaptureShockUntilByTile.entries()],
    townGrowthShock: [...townGrowthShockUntilByTile.entries()],
    season: activeSeason,
    seasonArchives,
    seasonTechConfig: {
      ...activeSeasonTechConfig,
      activeNodeIds: [...activeSeasonTechConfig.activeNodeIds]
    }
  };
  if (seasonWinner) snapshot.seasonWinner = seasonWinner;
  return snapshot;
};

let snapshotSavePromise: Promise<void> = Promise.resolve();
const saveSnapshot = async (): Promise<void> => {
  const serialized = JSON.stringify(buildSnapshotState());
  snapshotSavePromise = snapshotSavePromise
    .catch(() => undefined)
    .then(async () => {
      await fs.promises.mkdir(SNAPSHOT_DIR, { recursive: true });
      const tmpFile = snapshotTempFile();
      await fs.promises.writeFile(tmpFile, serialized);
      await fs.promises.rename(tmpFile, SNAPSHOT_FILE);
    });
  return snapshotSavePromise;
};

const saveSnapshotInBackground = (): void => {
  void saveSnapshot().catch((err) => {
    logRuntimeError("snapshot save failed", err);
  });
};

const loadSnapshot = (): void => {
  if (!fs.existsSync(SNAPSHOT_FILE)) return;
  let raw: SnapshotState;
  try {
    raw = JSON.parse(fs.readFileSync(SNAPSHOT_FILE, "utf8")) as SnapshotState;
  } catch (err) {
    logRuntimeError("snapshot load failed", err);
    try {
      fs.renameSync(SNAPSHOT_FILE, `${SNAPSHOT_FILE}.corrupt-${Date.now()}`);
    } catch (renameErr) {
      logRuntimeError("failed to quarantine corrupt snapshot", renameErr);
    }
    return;
  }
  if (!raw.world || raw.world.width !== WORLD_WIDTH || raw.world.height !== WORLD_HEIGHT) {
    return;
  }
  for (const [k, v] of raw.ownership) ownership.set(k, v);
  if (raw.ownershipState && raw.ownershipState.length > 0) {
    for (const [k, v] of raw.ownershipState) ownershipStateByTile.set(k, v);
  } else {
    // Legacy snapshots: treat owned tiles as settled for compatibility.
    for (const [k, ownerId] of raw.ownership) {
      ownershipStateByTile.set(k, ownerId === BARBARIAN_OWNER_ID ? "BARBARIAN" : "SETTLED");
    }
  }
  barbarianAgents.clear();
  barbarianAgentByTileKey.clear();
  for (const agent of raw.barbarianAgents ?? []) {
    upsertBarbarianAgent(agent);
  }
  for (const identity of raw.authIdentities ?? []) authIdentityByUid.set(identity.uid, identity);
  for (const [pid, c] of raw.resources) {
    resourceCountsByPlayer.set(pid, {
      FARM: c.FARM ?? 0,
      FISH: c.FISH ?? 0,
      FUR: c.FUR ?? 0,
      WOOD: c.WOOD ?? 0,
      IRON: c.IRON ?? 0,
      GEMS: c.GEMS ?? 0
    });
  }
  for (const [pid, c] of raw.strategicResources ?? []) {
    const legacy = c as Record<string, number>;
    strategicResourceStockByPlayer.set(pid, {
      FOOD: c.FOOD ?? 0,
      IRON: c.IRON ?? 0,
      CRYSTAL: c.CRYSTAL ?? 0,
      SUPPLY: c.SUPPLY ?? legacy.STONE ?? 0,
      SHARD: c.SHARD ?? 0
    });
  }
  for (const [tk, history] of raw.tileHistory ?? []) {
    const normalized: TileHistoryState = {
      previousOwners: [...(history.previousOwners ?? [])].slice(-5),
      captureCount: history.captureCount ?? 0,
      structureHistory: [...(history.structureHistory ?? [])].slice(-5)
    };
    if (history.lastOwnerId !== undefined) normalized.lastOwnerId = history.lastOwnerId;
    if (history.lastCapturedAt !== undefined) normalized.lastCapturedAt = history.lastCapturedAt;
    if (history.lastStructureType !== undefined) normalized.lastStructureType = history.lastStructureType;
    if (history.wasMountainCreatedByPlayer !== undefined) normalized.wasMountainCreatedByPlayer = history.wasMountainCreatedByPlayer;
    if (history.wasMountainRemovedByPlayer !== undefined) normalized.wasMountainRemovedByPlayer = history.wasMountainRemovedByPlayer;
    tileHistoryByTile.set(tk, normalized);
  }
  for (const [tk, shape] of raw.terrainShapes ?? []) {
    terrainShapesByTile.set(tk, shape);
  }
  const legacySnapshot = raw as SnapshotState & { victoryPressure?: [SeasonVictoryPathId, VictoryPressureTracker][] };
  for (const [objectiveId, tracker] of raw.seasonVictory ?? legacySnapshot.victoryPressure ?? []) {
    const normalized: VictoryPressureTracker = {};
    if (tracker.leaderPlayerId !== undefined) normalized.leaderPlayerId = tracker.leaderPlayerId;
    if (tracker.holdStartedAt !== undefined) normalized.holdStartedAt = tracker.holdStartedAt;
    victoryPressureById.set(objectiveId, normalized);
  }
  for (const [playerId, timestamps] of raw.frontierSettlements ?? []) {
    frontierSettlementsByPlayer.set(playerId, [...timestamps]);
  }
  for (const [pid, c] of raw.strategicResourceBuffer ?? []) {
    const legacy = c as Record<string, number>;
    strategicResourceBufferByPlayer.set(pid, {
      FOOD: c.FOOD ?? 0,
      IRON: c.IRON ?? 0,
      CRYSTAL: c.CRYSTAL ?? 0,
      SUPPLY: c.SUPPLY ?? legacy.STONE ?? 0,
      SHARD: c.SHARD ?? 0
    });
  }
  for (const [tk, y] of raw.tileYield ?? []) {
    const legacyStrategic = (y.strategic ?? {}) as Record<string, number>;
    tileYieldByTile.set(tk, {
      gold: y.gold ?? 0,
      strategic: {
        FOOD: y.strategic?.FOOD ?? 0,
        IRON: y.strategic?.IRON ?? 0,
        CRYSTAL: y.strategic?.CRYSTAL ?? 0,
        SUPPLY: y.strategic?.SUPPLY ?? legacyStrategic.STONE ?? 0,
        SHARD: y.strategic?.SHARD ?? 0
      }
    });
  }
  for (const [pid, missions] of raw.dynamicMissions ?? []) {
    dynamicMissionsByPlayer.set(pid, missions);
  }
  for (const [pid, until] of raw.temporaryAttackBuffUntil ?? []) {
    temporaryAttackBuffUntilByPlayer.set(pid, until);
  }
  for (const [pid, buff] of raw.temporaryIncomeBuff ?? []) {
    temporaryIncomeBuffUntilByPlayer.set(pid, buff);
  }
  cachedVisibilitySnapshotByPlayer.clear();
  cachedChunkSnapshotByPlayer.clear();
  revealWatchersByTarget.clear();
  observatoryTileKeysByPlayer.clear();
  economicStructureTileKeysByPlayer.clear();
  for (const [pid, tiles] of raw.forcedReveal ?? []) {
    forcedRevealTilesByPlayer.set(pid, new Set<TileKey>(tiles));
  }
  for (const [pid, targets] of raw.revealedEmpireTargets ?? []) {
    setRevealTargetsForPlayer(pid, targets);
  }
  for (const request of raw.allianceRequests ?? []) allianceRequests.set(request.id, request);
  for (const f of raw.forts ?? []) fortsByTile.set(f.tileKey, f);
  for (const observatory of raw.observatories ?? []) {
    const normalized: Observatory = {
      observatoryId: observatory.observatoryId,
      ownerId: observatory.ownerId,
      tileKey: observatory.tileKey,
      status: observatory.status ?? "active"
    };
    if (observatory.completesAt !== undefined) normalized.completesAt = observatory.completesAt;
    observatoriesByTile.set(observatory.tileKey, normalized);
    trackOwnedTileKey(observatoryTileKeysByPlayer, observatory.ownerId, observatory.tileKey);
  }
  for (const s of raw.siegeOutposts ?? []) siegeOutpostsByTile.set(s.tileKey, s);
  for (const structure of raw.economicStructures ?? []) {
    const legacy = structure as EconomicStructure & { isActive?: boolean };
    const normalized: EconomicStructure = {
      id: structure.id,
      type: structure.type,
      tileKey: structure.tileKey,
      ownerId: structure.ownerId,
      status: structure.status ?? (legacy.isActive ? "active" : "inactive"),
      nextUpkeepAt: structure.nextUpkeepAt
    };
    if (structure.completesAt !== undefined) normalized.completesAt = structure.completesAt;
    economicStructuresByTile.set(structure.tileKey, normalized);
    trackOwnedTileKey(economicStructureTileKeysByPlayer, structure.ownerId, structure.tileKey);
  }
  for (const sabotage of raw.sabotage ?? []) sabotageByTile.set(sabotage.targetTileKey, sabotage);
  for (const [pid, entries] of raw.abilityCooldowns ?? []) {
    abilityCooldownsByPlayer.set(pid, new Map(entries));
  }
  for (const d of raw.docks ?? []) {
    docksByTile.set(d.tileKey, d);
    dockById.set(d.dockId, d);
  }
  for (const t of raw.towns ?? []) townsByTile.set(t.tileKey, t);
  for (const tk of raw.firstSpecialSiteCaptureClaimed ?? []) firstSpecialSiteCaptureClaimed.add(tk);
  for (const c of raw.clusters ?? []) clustersById.set(c.clusterId, c);
  for (const [tk, cid] of raw.clusterTiles ?? []) clusterByTile.set(tk, cid);
  for (const [tk, until] of raw.townCaptureShock ?? []) townCaptureShockUntilByTile.set(tk, until);
  for (const [tk, until] of raw.townGrowthShock ?? []) townGrowthShockUntilByTile.set(tk, until);
  normalizeTownPlacements();
  if (raw.season) activeSeason = raw.season;
  if (raw.seasonWinner) seasonWinner = raw.seasonWinner;
  if (raw.seasonArchives) seasonArchives.push(...raw.seasonArchives);
  if (raw.seasonTechConfig) {
    activeSeasonTechConfig = {
      ...raw.seasonTechConfig,
      activeNodeIds: new Set(raw.seasonTechConfig.activeNodeIds)
    };
  }
  if (!seasonTechConfigIsCompatible(activeSeasonTechConfig)) {
    activeSeasonTechConfig = chooseSeasonalTechConfig(activeSeason.worldSeed);
    activeSeason.techTreeConfigId = activeSeasonTechConfig.configId;
  }
  for (const p of raw.players) {
    const hydrated: Player = {
      ...p,
      profileComplete: p.profileComplete ?? true,
      Ts: p.Ts ?? 0,
      Es: p.Es ?? 0,
      techIds: new Set(p.techIds),
      domainIds: new Set(p.domainIds ?? []),
      territoryTiles: new Set(p.territoryTiles),
      allies: new Set(p.allies),
      missions: p.missions ?? [],
      missionStats: p.missionStats ?? defaultMissionStats()
    };
    ensureMissionDefaults(hydrated);
    normalizePlayerProgressionState(hydrated);
    players.set(p.id, hydrated);
    playerBaseMods.set(hydrated.id, {
      attack: hydrated.mods.attack,
      defense: hydrated.mods.defense,
      income: hydrated.mods.income,
      vision: hydrated.mods.vision
    });
    recomputePlayerEffectsForPlayer(hydrated);
  }
  for (const settlement of raw.pendingSettlements ?? []) {
    const hydrated: PendingSettlement = {
      tileKey: settlement.tileKey,
      ownerId: settlement.ownerId,
      startedAt: settlement.startedAt,
      resolvesAt: settlement.resolvesAt,
      goldCost: settlement.goldCost,
      cancelled: false
    };
    pendingSettlementsByTile.set(hydrated.tileKey, hydrated);
  }
  if (barbarianAgents.size === 0) {
    for (const [tk, ownerId] of ownership.entries()) {
      if (ownerId !== BARBARIAN_OWNER_ID) continue;
      const [x, y] = parseKey(tk);
      spawnBarbarianAgentAt(x, y, 0);
    }
  }
};

loadSnapshot();
ensureAiPlayers();
setWorldSeed(activeSeason.worldSeed);
const minAcceptableClusters = CLUSTER_COUNT_MIN;
const hasBiomeLinkedClusters = [...clustersById.values()].every((c) => Boolean(c.resourceType));
const clusterTilesById = new Map<string, number>();
for (const cid of clusterByTile.values()) clusterTilesById.set(cid, (clusterTilesById.get(cid) ?? 0) + 1);
const hasLegacyResourceMix = [...clustersById.values()].some((c) => c.resourceType === "WOOD");
const hasFurClusters = [...clustersById.values()].some((c) => c.resourceType === "FUR");
const hasExpectedClusterShape =
  clustersById.size === CLUSTER_COUNT_MIN &&
  [...clustersById.values()].every((c) => (clusterTilesById.get(c.clusterId) ?? 0) === 8);
const hasGemOnNonSand = (() => {
  for (const [tk, cid] of clusterByTile) {
    const c = clustersById.get(cid);
    if (!c || c.resourceType !== "GEMS") continue;
    const [x, y] = parseKey(tk);
    if (landBiomeAt(x, y) !== "SAND") return true;
  }
  return false;
})();
if (
  clustersById.size < minAcceptableClusters ||
  clusterByTile.size === 0 ||
  !hasBiomeLinkedClusters ||
  !hasExpectedClusterShape ||
  hasLegacyResourceMix ||
  !hasFurClusters ||
  hasGemOnNonSand
) {
  activeSeason.worldSeed = regenerateStrategicWorld(activeSeason.worldSeed);
  setWorldSeed(activeSeason.worldSeed);
}
const hasCrossContinentDockPairs = (() => {
  const seen = new Set<string>();
  let hasCrossContinentLink = false;
  for (const d of dockById.values()) {
    const linkedDockIds = d.connectedDockIds?.length ? d.connectedDockIds : d.pairedDockId ? [d.pairedDockId] : [];
    for (const dockId of linkedDockIds) {
      const pair = dockById.get(dockId);
      if (!pair) return false;
      const edgeKey = d.dockId < pair.dockId ? `${d.dockId}|${pair.dockId}` : `${pair.dockId}|${d.dockId}`;
      if (seen.has(edgeKey)) continue;
      seen.add(edgeKey);
      const [ax, ay] = parseKey(d.tileKey);
      const [bx, by] = parseKey(pair.tileKey);
      const ac = continentIdAt(ax, ay);
      const bc = continentIdAt(bx, by);
      if (ac === undefined || bc === undefined) return false;
      if (ac !== bc) hasCrossContinentLink = true;
    }
  }
  if (seen.size === 0) {
    return false;
  }
  return dockById.size > 0 && hasCrossContinentLink;
})();
if (dockById.size === 0 || docksByTile.size === 0 || !hasCrossContinentDockPairs || townsByTile.size === 0) {
  activeSeason.worldSeed = regenerateStrategicWorld(activeSeason.worldSeed);
  setWorldSeed(activeSeason.worldSeed);
}
if (activeSeasonTechConfig.rootNodeIds.length === 0 || activeSeasonTechConfig.activeNodeIds.size === 0) {
  activeSeasonTechConfig = chooseSeasonalTechConfig(activeSeason.worldSeed);
  activeSeason.techTreeConfigId = activeSeasonTechConfig.configId;
}
for (const p of players.values()) {
  if (!playerBaseMods.has(p.id)) {
    playerBaseMods.set(p.id, {
      attack: p.mods.attack,
      defense: p.mods.defense,
      income: p.mods.income,
      vision: p.mods.vision
    });
  }
  if (!revealedEmpireTargetsByPlayer.has(p.id)) setRevealTargetsForPlayer(p.id, []);
  rebuildEconomyIndexForPlayer(p.id);
  if (!playerEffectsByPlayer.has(p.id)) recomputePlayerEffectsForPlayer(p);
}
rebuildOwnershipDerivedState();
for (const p of players.values()) recomputeTechModsFromOwnedTechs(p);
for (const p of players.values()) {
  if (p.T <= 0 || p.territoryTiles.size === 0) {
    spawnPlayer(p);
  }
}
if (barbarianAgents.size === 0) {
  spawnInitialBarbarians();
}
for (const [tk, fort] of fortsByTile.entries()) {
  if (fort.status !== "under_construction") continue;
  const remaining = fort.completesAt - now();
  if (remaining <= 0) {
    fort.status = "active";
    continue;
  }
  const timer = setTimeout(() => {
    const live = fortsByTile.get(tk);
    if (!live) return;
    const [fx, fy] = parseKey(tk);
    const tileNow = playerTile(fx, fy);
    if (tileNow.ownerId !== live.ownerId) {
      fortsByTile.delete(tk);
      fortBuildTimers.delete(tk);
      return;
    }
    live.status = "active";
    fortBuildTimers.delete(tk);
    updateOwnership(fx, fy, live.ownerId);
  }, remaining);
  fortBuildTimers.set(tk, timer);
}
for (const [tk, observatory] of observatoriesByTile.entries()) {
  if (observatory.status !== "under_construction" || observatory.completesAt === undefined) continue;
  const remaining = observatory.completesAt - now();
  if (remaining <= 0) {
    observatory.status = "active";
    delete observatory.completesAt;
    continue;
  }
  scheduleObservatoryConstruction(tk, remaining);
}
for (const [tk, siege] of siegeOutpostsByTile.entries()) {
  if (siege.status !== "under_construction") continue;
  const remaining = siege.completesAt - now();
  if (remaining <= 0) {
    siege.status = "active";
    continue;
  }
  const timer = setTimeout(() => {
    const live = siegeOutpostsByTile.get(tk);
    if (!live) return;
    const [sx, sy] = parseKey(tk);
    const tileNow = playerTile(sx, sy);
    if (tileNow.ownerId !== live.ownerId) {
      siegeOutpostsByTile.delete(tk);
      siegeOutpostBuildTimers.delete(tk);
      return;
    }
    live.status = "active";
    siegeOutpostBuildTimers.delete(tk);
    updateOwnership(sx, sy, live.ownerId);
  }, remaining);
  siegeOutpostBuildTimers.set(tk, timer);
}
for (const [tk, structure] of economicStructuresByTile.entries()) {
  if (structure.status !== "under_construction" || structure.completesAt === undefined) continue;
  const remaining = structure.completesAt - now();
  if (remaining <= 0) {
    structure.status = "active";
    delete structure.completesAt;
    continue;
  }
  const [sx, sy] = parseKey(tk);
  const timer = setTimeout(() => {
    const current = economicStructuresByTile.get(tk);
    if (!current) return;
    const tileNow = runtimeTileCore(sx, sy);
    if (tileNow.ownerId !== current.ownerId || tileNow.ownershipState !== "SETTLED") {
      cancelEconomicStructureBuild(tk);
      return;
    }
    current.status = "active";
    delete current.completesAt;
    economicStructureBuildTimers.delete(tk);
    updateOwnership(sx, sy, current.ownerId);
  }, remaining);
  economicStructureBuildTimers.set(tk, timer);
}
for (const settlement of pendingSettlementsByTile.values()) {
  if (settlement.resolvesAt <= now()) resolvePendingSettlement(settlement);
  else schedulePendingSettlementResolution(settlement);
}
const runtimeIntervals: NodeJS.Timeout[] = [];
const registerInterval = (fn: () => void, ms: number): void => {
  runtimeIntervals.push(setInterval(fn, ms));
};

let lastSnapshotAt = 0;
registerInterval(() => {
  const nowMs = now();
  if (!hasOnlinePlayers() && nowMs - lastSnapshotAt < IDLE_SNAPSHOT_INTERVAL_MS) return;
  saveSnapshotInBackground();
  lastSnapshotAt = nowMs;
}, 30_000);
registerInterval(runBarbarianTick, 1_000);
registerInterval(runAiTick, AI_TICK_MS);
registerInterval(maintainBarbarianPopulation, BARBARIAN_MAINTENANCE_INTERVAL_MS);

registerInterval(() => {
  for (const [tk, shock] of breachShockByTile) {
    if (shock.expiresAt <= now()) breachShockByTile.delete(tk);
  }
  for (const [tk, defense] of settlementDefenseByTile) {
    if (defense.expiresAt <= now()) settlementDefenseByTile.delete(tk);
  }
  for (const [tk, until] of townCaptureShockUntilByTile) {
    if (until <= now()) townCaptureShockUntilByTile.delete(tk);
  }
  for (const [tk, until] of townGrowthShockUntilByTile) {
    if (until <= now()) townGrowthShockUntilByTile.delete(tk);
  }
  for (const [id, req] of allianceRequests) {
    if (req.expiresAt < now()) allianceRequests.delete(id);
  }
  for (const [pid, until] of temporaryAttackBuffUntilByPlayer) {
    if (until <= now()) temporaryAttackBuffUntilByPlayer.delete(pid);
  }
  for (const [pid, buff] of temporaryIncomeBuffUntilByPlayer) {
    if (buff.until <= now()) temporaryIncomeBuffUntilByPlayer.delete(pid);
  }
  for (const [tk, sabotage] of sabotageByTile) {
    if (sabotage.endsAt > now()) continue;
    sabotageByTile.delete(tk);
    const [sx, sy] = parseKey(tk);
    for (const p of players.values()) {
      if (!tileInSubscription(p.id, sx, sy)) continue;
      if (!visible(p, sx, sy)) continue;
      const current = playerTile(sx, sy);
      current.fogged = false;
      sendToPlayer(p.id, { type: "TILE_DELTA", updates: [current] });
    }
  }
  for (const [pid, cooldowns] of abilityCooldownsByPlayer) {
    for (const [abilityId, until] of cooldowns) {
      if (until <= now()) cooldowns.delete(abilityId);
    }
    if (cooldowns.size === 0) abilityCooldownsByPlayer.delete(pid);
  }
  for (const [pid, missions] of dynamicMissionsByPlayer) {
    dynamicMissionsByPlayer.set(
      pid,
      missions.filter((m) => m.expiresAt > now() || m.rewarded)
    );
  }
  if (!hasOnlinePlayers()) return;
  for (const p of players.values()) {
    if (now() - p.lastActiveAt > OFFLINE_YIELD_ACCUM_MAX_MS) {
      continue;
    }
    applyStaminaRegen(p);
    recomputeTownNetworkForPlayer(p.id);
    const populationTouched = updateTownPopulationForPlayer(p);
    const economicTouched = syncEconomicStructuresForPlayer(p);
    const capitalTileKey = isValidCapitalTile(p, p.capitalTileKey) ? p.capitalTileKey : undefined;
    const economyIndex = getOrInitEconomyIndex(p.id);
    if (capitalTileKey && ownershipStateByTile.get(capitalTileKey) === "SETTLED") {
      addTileYield(capitalTileKey, BASE_GOLD_PER_MIN, undefined);
    }
    for (const tk of economyIndex.settledResourceTileKeys) {
      const [x, y] = parseKey(tk);
      const resource = applyClusterResources(x, y, resourceAt(x, y));
      if (!resource) continue;
      const sabotageMult = sabotageMultiplierAt(tk);
      const goldDelta = (resourceRate[resource] ?? 0) * p.mods.income * PASSIVE_INCOME_MULT * HARVEST_GOLD_RATE_MULT * sabotageMult;
      const strategic: Partial<Record<StrategicResource, number>> = {};
      const sr = toStrategicResource(resource);
      if (sr) {
        strategic[sr] = (strategicDailyFromResource[resource] ?? 0) * activeResourceIncomeMult(p.id, resource) * HARVEST_RESOURCE_RATE_MULT * sabotageMult;
      }
      if (goldDelta > 0 || hasPositiveStrategicBuffer(strategic)) addTileYield(tk, goldDelta, strategic);
    }
    for (const tk of economyIndex.settledDockTileKeys) {
      const dock = docksByTile.get(tk);
      if (!dock) continue;
      const goldDelta = dockIncomeForOwner(dock, p.id) * p.mods.income * PASSIVE_INCOME_MULT * HARVEST_GOLD_RATE_MULT;
      if (goldDelta > 0) addTileYield(tk, goldDelta, undefined);
    }
    for (const tk of economyIndex.settledTownTileKeys) {
      const town = townsByTile.get(tk);
      if (!town) continue;
      const sabotageMult = sabotageMultiplierAt(tk);
      let goldDelta = townIncomeForOwner(town, p.id) * p.mods.income * PASSIVE_INCOME_MULT * HARVEST_GOLD_RATE_MULT * sabotageMult;
      let strategic: Partial<Record<StrategicResource, number>> | undefined;
      if (economyIndex.ancientTownTileKeys.has(tk)) {
        strategic = {
          SHARD: strategicResourceRates.SHARD * getPlayerEffectsForPlayer(p.id).resourceOutputMult.SHARD * HARVEST_RESOURCE_RATE_MULT
        };
      }
      if (goldDelta > 0 || (strategic && hasPositiveStrategicBuffer(strategic))) addTileYield(tk, goldDelta, strategic);
    }
    const upkeepResult = applyUpkeepForPlayer(p);
    const touchedTileKeys = new Set<TileKey>([...populationTouched, ...economicTouched, ...upkeepResult.touchedTileKeys]);
    if (touchedTileKeys.size > 0) {
      const updates = [...touchedTileKeys].map((tk) => {
        const [x, y] = parseKey(tk);
        return playerTile(x, y);
      });
      sendToPlayer(p.id, { type: "TILE_DELTA", updates });
    }
    updateMissionState(p);
    sendPlayerUpdate(p, 0);
  }
  evaluateVictoryPressure();
}, 60_000);

registerInterval(() => {
  if (!hasOnlinePlayers()) return;
  broadcastGlobalStatusUpdate(false);
}, GLOBAL_STATUS_BROADCAST_MS);

if (SEASONS_ENABLED) {
  registerInterval(() => {
    if (now() >= activeSeason.endAt) startNewSeason();
  }, 60_000);
}

const app = Fastify({ logger: true });
appRef = app;
await app.register(cors, { origin: true });
await app.register(websocket as never);

app.get("/health", async () => ({ ok: true }));
app.get("/season", async () => ({
  activeSeason,
  seasonWinner,
  seasonTechTreeId: activeSeason.techTreeConfigId,
  activeRoots: activeSeasonTechConfig.rootNodeIds,
  activeTechNodeCount: activeSeasonTechConfig.activeNodeIds.size,
  archiveCount: seasonArchives.length
}));
app.get("/admin/telemetry", async () => {
  let activeTowns = 0;
  let supportSum = 0;
  let supportCount = 0;
  for (const town of townsByTile.values()) {
    const [x, y] = parseKey(town.tileKey);
    const t = playerTile(x, y);
    if (!t.ownerId || t.ownershipState !== "SETTLED") continue;
    activeTowns += 1;
    const support = townSupport(town.tileKey, t.ownerId);
    if (support.supportMax > 0) {
      supportSum += support.supportCurrent / support.supportMax;
      supportCount += 1;
    }
  }
  return {
    ok: true,
    at: now(),
    onlinePlayers: onlineSocketCount(),
    totalPlayers: players.size,
    activeTowns,
    avgTownSupportRatio: supportCount > 0 ? supportSum / supportCount : 0,
    counters: telemetryCounters
  };
});
app.get("/admin/ai/debug", async () => {
  const entries = [...aiTurnDebugByPlayer.values()].sort((a, b) => a.name.localeCompare(b.name));
  const reasons = new Map<string, number>();
  for (const entry of entries) reasons.set(entry.reason, (reasons.get(entry.reason) ?? 0) + 1);
  return {
    ok: true,
    at: now(),
    aiPlayers: entries.length,
    reasons: [...reasons.entries()]
      .map(([reason, count]) => ({ reason, count }))
      .sort((a, b) => b.count - a.count || a.reason.localeCompare(b.reason)),
    entries
  };
});
app.post("/admin/season/rollover", async () => {
  if (!SEASONS_ENABLED) return { ok: false, disabled: true, message: "seasons temporarily disabled" };
  startNewSeason();
  await saveSnapshot();
  return { ok: true, activeSeason };
});
app.post("/admin/world/regenerate", async () => {
  regenerateWorldInPlace();
  await saveSnapshot();
  return { ok: true, activeSeason, regenerated: true };
});

(
  app as unknown as {
    get: (path: string, opts: { websocket: boolean }, handler: (connection: unknown) => void) => void;
  }
).get("/ws", { websocket: true }, (connection) => {
  const maybeSocket = (connection as { socket?: Ws } | Ws);
  const socket: Ws | undefined = (
    "socket" in maybeSocket ? maybeSocket.socket : maybeSocket
  ) as Ws | undefined;
  if (!socket || typeof socket.on !== "function" || typeof socket.send !== "function") {
    app.log.error({ connectionType: typeof connection }, "Invalid websocket connection object");
    return;
  }
  let authedPlayer: Player | undefined;

  socket.on("message", async (buf: import("ws").RawData) => {
    let raw: unknown;
    try {
      raw = JSON.parse(buf.toString());
    } catch {
      socket.send(JSON.stringify({ type: "ERROR", code: "BAD_JSON", message: "invalid JSON payload" }));
      return;
    }
    const parsed = ClientMessageSchema.safeParse(raw);
    if (!parsed.success) {
      socket.send(JSON.stringify({ type: "ERROR", code: "BAD_MSG", message: parsed.error.message }));
      return;
    }

    const msg = parsed.data as import("@border-empires/shared").ClientMessage;

    if (msg.type === "AUTH") {
      let decoded = cachedFirebaseIdentityForToken(msg.token);
      try {
        if (!decoded) {
          const verified = await jwtVerify(msg.token, firebaseJwks, {
            issuer: `https://securetoken.google.com/${FIREBASE_PROJECT_ID}`,
            audience: FIREBASE_PROJECT_ID
          });
          decoded = {
            uid: String(verified.payload.user_id ?? verified.payload.sub ?? ""),
            email: typeof verified.payload.email === "string" ? verified.payload.email : undefined,
            name: typeof verified.payload.name === "string" ? verified.payload.name : undefined
          };
          cacheVerifiedFirebaseIdentity(msg.token, decoded, typeof verified.payload.exp === "number" ? verified.payload.exp : undefined);
        }
      } catch (err) {
        if (!decoded) decoded = cachedFirebaseIdentityForToken(msg.token);
        if (decoded) {
          app.log.warn({ err }, "firebase token verification fallback to cached identity");
        } else {
          const authError = classifyAuthError(err);
          app.log.warn(
            {
              err,
              authErrorCode: authError.code
            },
            "firebase token verification failed"
          );
          socket.send(JSON.stringify({ type: "ERROR", code: authError.code, message: authError.message }));
          return;
        }
      }
      if (!decoded.uid) {
        socket.send(JSON.stringify({ type: "ERROR", code: "AUTH_FAIL", message: "Firebase token missing user id." }));
        return;
      }
      const preferredName = decoded.name || decoded.email?.split("@")[0] || `Empire-${decoded.uid.slice(0, 6)}`;
      const existingIdentity = authIdentityByUid.get(decoded.uid);
      const identity: AuthIdentity = existingIdentity ?? {
        uid: decoded.uid,
        playerId: "",
        name: uniquePlayerName(decoded.uid, preferredName),
        email: decoded.email
      };
      if (!existingIdentity) {
        authIdentityByUid.set(decoded.uid, identity);
      } else {
        identity.email = decoded.email;
      }
      const player = getOrCreatePlayerForIdentity(identity);
      if (!player) {
        socket.send(JSON.stringify({ type: "ERROR", code: "AUTH_FAIL", message: "player initialization failed" }));
        return;
      }

      authedPlayer = player;
      socketsByPlayer.set(player.id, socket);
      resumeVictoryPressureTimers();
      const strategicStocks = getOrInitStrategicStocks(player.id);
      const strategicProduction = strategicProductionPerMinute(player);
      const dockPairs = exportDockPairs();
      socket.send(
        JSON.stringify({
          type: "INIT",
          player: {
            id: player.id,
            name: player.name,
            profileNeedsSetup: player.profileComplete !== true,
            gold: player.points,
            points: player.points,
            level: player.level,
            mods: player.mods,
            modBreakdown: playerModBreakdown(player),
            incomePerMinute: currentIncomePerMinute(player),
            strategicResources: strategicStocks,
            strategicProductionPerMinute: strategicProduction,
            stamina: player.stamina,
            T: player.T,
            E: player.E,
            Ts: player.Ts,
            Es: player.Es,
            techRootId: player.techRootId,
            techIds: [...player.techIds],
            domainIds: [...player.domainIds],
            allies: [...player.allies],
            tileColor: player.tileColor,
            visualStyle: empireStyleFromPlayer(player),
            homeTile: playerHomeTile(player),
            availableTechPicks: availableTechPicks(player),
            revealCapacity: revealCapacityForPlayer(player),
            activeRevealTargets: [...getOrInitRevealTargets(player.id)],
            abilityCooldowns: Object.fromEntries(getAbilityCooldowns(player.id)),
            pendingSettlements: [...pendingSettlementsByTile.values()]
              .filter((settlement) => settlement.ownerId === player.id)
              .map((settlement) => {
                const [x, y] = parseKey(settlement.tileKey);
                return { x, y, startedAt: settlement.startedAt, resolvesAt: settlement.resolvesAt };
              })
          },
          config: {
            width: WORLD_WIDTH,
            height: WORLD_HEIGHT,
            chunkSize: CHUNK_SIZE,
            visionRadius: VISION_RADIUS,
            fogDisabled: DISABLE_FOG || fogDisabledByPlayer.get(player.id) === true,
            season: activeSeason,
            seasonTechTreeId: activeSeason.techTreeConfigId
          },
          mapMeta: {
            dockCount: dockById.size,
            dockPairCount: dockPairs.length,
            clusterCount: clustersById.size,
            townCount: townsByTile.size,
            dockPairs
          },
          techChoices: reachableTechs(player),
          techCatalog: activeTechCatalog(player),
          domainChoices: reachableDomains(player),
          domainCatalog: activeDomainCatalog(player),
          playerStyles: exportPlayerStyles(),
          missions: missionPayload(player),
          leaderboard: currentLeaderboardSnapshot(),
          seasonVictory: currentVictoryPressureObjectives(),
          seasonWinner,
          allianceRequests: [...allianceRequests.values()].filter((r) => r.toPlayerId === player.id)
        })
      );
      return;
    }

    if (!authedPlayer) {
      socket.send(JSON.stringify({ type: "ERROR", code: "NO_AUTH", message: "auth first" }));
      return;
    }
    const actor = authedPlayer;
    if (await executeUnifiedGameplayMessage(actor, msg, socket)) return;

    if (msg.type === "PING") {
      socket.send(JSON.stringify({ type: "PONG", t: msg.t }));
      return;
    }

    if (msg.type === "SET_TILE_COLOR") {
      actor.tileColor = msg.color;
      broadcast({ type: "PLAYER_STYLE", playerId: actor.id, tileColor: actor.tileColor, visualStyle: empireStyleFromPlayer(actor) });
      return;
    }

    if (msg.type === "SET_PROFILE") {
      const displayName = normalizedPlayerHandle(msg.displayName);
      if (displayName.length < 2) {
        socket.send(JSON.stringify({ type: "ERROR", code: "BAD_PROFILE", message: "Display name must be at least 2 characters." }));
        return;
      }
      actor.name = claimPlayerName(actor.id, displayName);
      actor.tileColor = msg.color;
      actor.profileComplete = true;
      for (const identity of authIdentityByUid.values()) {
        if (identity.playerId === actor.id) {
          identity.name = actor.name;
          break;
        }
      }
      broadcast({ type: "PLAYER_STYLE", playerId: actor.id, tileColor: actor.tileColor, visualStyle: empireStyleFromPlayer(actor) });
      sendPlayerUpdate(actor, 0);
      return;
    }

    if (msg.type === "SET_FOG_DISABLED") {
      if (!playerHasFogAdminAccess(actor.id)) {
        socket.send(JSON.stringify({ type: "ERROR", code: "ADMIN_ONLY", message: "fog toggle is admin-only" }));
        return;
      }
      fogDisabledByPlayer.set(actor.id, msg.disabled);
      socket.send(JSON.stringify({ type: "FOG_UPDATE", fogDisabled: DISABLE_FOG || msg.disabled }));
      const sub = chunkSubscriptionByPlayer.get(actor.id);
      if (sub) {
        sendChunkSnapshot(socket, actor, sub);
      }
      return;
    }

    if (msg.type === "SETTLE") {
      const out = startSettlement(actor, msg.x, msg.y);
      if (!out.ok) {
        socket.send(JSON.stringify({ type: "ERROR", code: "SETTLE_INVALID", message: out.reason, x: msg.x, y: msg.y }));
        return;
      }
      sendPlayerUpdate(actor, 0);
      return;
    }

    if (msg.type === "REVEAL_EMPIRE") {
      const out = tryActivateRevealEmpire(actor, msg.targetPlayerId);
      if (!out.ok) {
        socket.send(JSON.stringify({ type: "ERROR", code: "REVEAL_EMPIRE_INVALID", message: out.reason }));
        return;
      }
      sendToPlayer(actor.id, {
        type: "REVEAL_EMPIRE_UPDATE",
        activeTargets: [...getOrInitRevealTargets(actor.id)],
        revealCapacity: revealCapacityForPlayer(actor)
      });
      sendPlayerUpdate(actor, 0);
      refreshSubscribedViewForPlayer(actor.id);
      return;
    }

    if (msg.type === "SABOTAGE_TILE") {
      const out = trySabotageTile(actor, msg.x, msg.y);
      if (!out.ok) {
        socket.send(JSON.stringify({ type: "ERROR", code: "SABOTAGE_INVALID", message: out.reason }));
        return;
      }
      const target = runtimeTileCore(msg.x, msg.y);
      sendPlayerUpdate(actor, 0);
      sendVisibleTileDeltaAt(target.x, target.y);
      if (target.ownerId && target.ownerId !== actor.id) {
        sendToPlayer(target.ownerId, {
          type: "ATTACK_ALERT",
          attackerId: actor.id,
          attackerName: `${actor.name} sabotage`,
          x: target.x,
          y: target.y,
          resolvesAt: now() + SABOTAGE_DURATION_MS
        });
      }
      return;
    }

    if (msg.type === "BUILD_FORT") {
      const out = tryBuildFort(actor, msg.x, msg.y);
      if (!out.ok) {
        socket.send(JSON.stringify({ type: "ERROR", code: "FORT_BUILD_INVALID", message: out.reason }));
        return;
      }
      updateOwnership(msg.x, msg.y, actor.id);
      sendPlayerUpdate(actor, 0);
      return;
    }

    if (msg.type === "BUILD_OBSERVATORY") {
      const out = tryBuildObservatory(actor, msg.x, msg.y);
      if (!out.ok) {
        socket.send(JSON.stringify({ type: "ERROR", code: "OBSERVATORY_BUILD_INVALID", message: out.reason }));
        return;
      }
      updateOwnership(msg.x, msg.y, actor.id);
      sendPlayerUpdate(actor, 0);
      return;
    }

    if (msg.type === "BUILD_ECONOMIC_STRUCTURE") {
      const out = tryBuildEconomicStructure(actor, msg.x, msg.y, msg.structureType);
      if (!out.ok) {
        socket.send(JSON.stringify({ type: "ERROR", code: "ECONOMIC_STRUCTURE_BUILD_INVALID", message: out.reason }));
        return;
      }
      updateOwnership(msg.x, msg.y, actor.id);
      sendPlayerUpdate(actor, 0);
      return;
    }

    if (msg.type === "CREATE_MOUNTAIN") {
      const out = tryCreateMountain(actor, msg.x, msg.y);
      if (!out.ok) {
        socket.send(JSON.stringify({ type: "ERROR", code: "CREATE_MOUNTAIN_INVALID", message: out.reason }));
        return;
      }
      sendPlayerUpdate(actor, 0);
      broadcastLocalVisionDelta([{ x: wrapX(msg.x, WORLD_WIDTH), y: wrapY(msg.y, WORLD_HEIGHT) }]);
      return;
    }

    if (msg.type === "REMOVE_MOUNTAIN") {
      const out = tryRemoveMountain(actor, msg.x, msg.y);
      if (!out.ok) {
        socket.send(JSON.stringify({ type: "ERROR", code: "REMOVE_MOUNTAIN_INVALID", message: out.reason }));
        return;
      }
      sendPlayerUpdate(actor, 0);
      broadcastLocalVisionDelta([{ x: wrapX(msg.x, WORLD_WIDTH), y: wrapY(msg.y, WORLD_HEIGHT) }]);
      return;
    }

    if (msg.type === "CANCEL_FORT_BUILD") {
      const tk = key(wrapX(msg.x, WORLD_WIDTH), wrapY(msg.y, WORLD_HEIGHT));
      const fort = fortsByTile.get(tk);
      if (!fort || fort.ownerId !== actor.id || fort.status !== "under_construction") {
        socket.send(JSON.stringify({ type: "ERROR", code: "FORT_CANCEL_INVALID", message: "no fort under construction on tile" }));
        return;
      }
      cancelFortBuild(tk);
      updateOwnership(msg.x, msg.y, actor.id);
      return;
    }

    if (msg.type === "BUILD_SIEGE_OUTPOST") {
      const out = tryBuildSiegeOutpost(actor, msg.x, msg.y);
      if (!out.ok) {
        socket.send(JSON.stringify({ type: "ERROR", code: "SIEGE_OUTPOST_BUILD_INVALID", message: out.reason }));
        return;
      }
      updateOwnership(msg.x, msg.y, actor.id);
      sendPlayerUpdate(actor, 0);
      return;
    }

    if (msg.type === "CANCEL_SIEGE_OUTPOST_BUILD") {
      const tk = key(wrapX(msg.x, WORLD_WIDTH), wrapY(msg.y, WORLD_HEIGHT));
      const siege = siegeOutpostsByTile.get(tk);
      if (!siege || siege.ownerId !== actor.id || siege.status !== "under_construction") {
        socket.send(JSON.stringify({ type: "ERROR", code: "SIEGE_OUTPOST_CANCEL_INVALID", message: "no siege outpost under construction on tile" }));
        return;
      }
      cancelSiegeOutpostBuild(tk);
      updateOwnership(msg.x, msg.y, actor.id);
      return;
    }

    if (msg.type === "CANCEL_CAPTURE") {
      const pending = pendingCapturesByAttacker(actor.id);
      const pendingSettles = [...pendingSettlementsByTile.values()].filter((s) => s.ownerId === actor.id);
      if (pending.length === 0 && pendingSettles.length === 0) {
        socket.send(JSON.stringify({ type: "ERROR", code: "NO_ACTIVE_CAPTURE", message: "no active capture to cancel" }));
        return;
      }
      let refunded = 0;
      for (const pcap of pending) {
        refunded += pcap.staminaCost;
        cancelPendingCapture(pcap);
      }
      for (const settle of pendingSettles) {
        clearPendingSettlement(settle);
        refundPendingSettlement(settle);
      }
      if (refunded > 0) actor.stamina = Math.min(STAMINA_MAX, actor.stamina + refunded);
      socket.send(JSON.stringify({ type: "COMBAT_CANCELLED", count: pending.length + pendingSettles.length }));
      sendPlayerUpdate(actor, 0);
      return;
    }

    if (msg.type === "COLLECT_TILE") {
      const tk = key(wrapX(msg.x, WORLD_WIDTH), wrapY(msg.y, WORLD_HEIGHT));
      const [x, y] = parseKey(tk);
      const t = playerTile(x, y);
      if (t.ownerId !== actor.id) {
        socket.send(JSON.stringify({ type: "ERROR", code: "COLLECT_EMPTY", message: "tile is not owned by you", x, y }));
        return;
      }
      if (t.terrain !== "LAND") {
        socket.send(JSON.stringify({ type: "ERROR", code: "COLLECT_EMPTY", message: "tile is not land", x, y }));
        return;
      }
      if (t.ownershipState !== "SETTLED") {
        socket.send(JSON.stringify({ type: "ERROR", code: "COLLECT_EMPTY", message: "only settled tiles can be collected", x, y }));
        return;
      }
      const got = collectYieldFromTile(actor, tk);
      const touched = got.gold > 0 || hasPositiveStrategicBuffer(got.strategic);
      if (!touched) {
        socket.send(JSON.stringify({ type: "ERROR", code: "COLLECT_EMPTY", message: "yield is empty (upkeep may have consumed it)", x, y }));
        return;
      }
      recalcPlayerDerived(actor);
      sendToPlayer(actor.id, { type: "TILE_DELTA", updates: [playerTile(x, y)] });
      sendToPlayer(actor.id, { type: "COLLECT_RESULT", mode: "tile", x, y, gold: got.gold, strategic: got.strategic });
      sendPlayerUpdate(actor, got.gold);
      return;
    }

    if (msg.type === "COLLECT_VISIBLE") {
      const cdUntil = collectVisibleCooldownByPlayer.get(actor.id) ?? 0;
      if (cdUntil > now()) {
        socket.send(JSON.stringify({ type: "ERROR", code: "COLLECT_COOLDOWN", message: "collect visible is on cooldown" }));
        return;
      }
      const got = collectVisibleYield(actor);
      collectVisibleCooldownByPlayer.set(actor.id, now() + COLLECT_VISIBLE_COOLDOWN_MS);
      if (got.touchedTileKeys.length > 0) {
        const updates = got.touchedTileKeys.map((tk) => {
          const [x, y] = parseKey(tk);
          return playerTile(x, y);
        });
        sendToPlayer(actor.id, { type: "TILE_DELTA", updates });
      }
      sendToPlayer(actor.id, { type: "COLLECT_RESULT", mode: "visible", tiles: got.tiles, gold: got.gold, strategic: got.strategic });
      sendPlayerUpdate(actor, got.gold);
      return;
    }

    if (msg.type === "UNCAPTURE_TILE") {
      const t = runtimeTileCore(msg.x, msg.y);
      if (t.ownerId !== actor.id) {
        socket.send(JSON.stringify({ type: "ERROR", code: "UNCAPTURE_NOT_OWNER", message: "tile is not owned by you" }));
        return;
      }
      if (actor.T <= 1) {
        socket.send(JSON.stringify({ type: "ERROR", code: "UNCAPTURE_LAST_TILE", message: "cannot uncapture your last tile" }));
        return;
      }
      const tk = key(t.x, t.y);
      if (combatLocks.has(tk)) {
        socket.send(JSON.stringify({ type: "ERROR", code: "LOCKED", message: "tile locked in combat" }));
        return;
      }
      updateOwnership(t.x, t.y, undefined);
      updateMissionState(actor);
      resolveEliminationIfNeeded(actor, true);
      sendPlayerUpdate(actor, 0);
      return;
    }

    if (msg.type === "CHOOSE_TECH") {
      const outcome = applyTech(actor, msg.techId);
      if (!outcome.ok) {
        socket.send(JSON.stringify({ type: "ERROR", code: "TECH_INVALID", message: outcome.reason }));
        return;
      }
      recomputeClusterBonusForPlayer(actor);
      socket.send(
        JSON.stringify({
          type: "TECH_UPDATE",
          techRootId: actor.techRootId,
          techIds: [...actor.techIds],
          mods: actor.mods,
          modBreakdown: playerModBreakdown(actor),
          incomePerMinute: currentIncomePerMinute(actor),
          powerups: actor.powerups,
          nextChoices: reachableTechs(actor),
          availableTechPicks: availableTechPicks(actor),
          missions: missionPayload(actor),
          techCatalog: activeTechCatalog(actor),
          domainChoices: reachableDomains(actor),
          domainCatalog: activeDomainCatalog(actor),
          domainIds: [...actor.domainIds],
          revealCapacity: revealCapacityForPlayer(actor),
          activeRevealTargets: [...getOrInitRevealTargets(actor.id)]
        })
      );
      broadcast({ type: "PLAYER_STYLE", playerId: actor.id, tileColor: actor.tileColor, visualStyle: empireStyleFromPlayer(actor) });
      sendPlayerUpdate(actor, 0);
      return;
    }

    if (msg.type === "CHOOSE_DOMAIN") {
      const outcome = applyDomain(actor, msg.domainId);
      if (!outcome.ok) {
        socket.send(JSON.stringify({ type: "ERROR", code: "DOMAIN_INVALID", message: outcome.reason }));
        return;
      }
      recomputeClusterBonusForPlayer(actor);
      socket.send(
        JSON.stringify({
          type: "DOMAIN_UPDATE",
          domainIds: [...actor.domainIds],
          mods: actor.mods,
          modBreakdown: playerModBreakdown(actor),
          incomePerMinute: currentIncomePerMinute(actor),
          domainChoices: reachableDomains(actor),
          domainCatalog: activeDomainCatalog(actor),
          missions: missionPayload(actor),
          revealCapacity: revealCapacityForPlayer(actor),
          activeRevealTargets: [...getOrInitRevealTargets(actor.id)]
        })
      );
      broadcast({ type: "PLAYER_STYLE", playerId: actor.id, tileColor: actor.tileColor, visualStyle: empireStyleFromPlayer(actor) });
      sendPlayerUpdate(actor, 0);
      return;
    }

    if (msg.type === "ALLIANCE_REQUEST") {
      const targetNameNeedle = msg.targetPlayerName.trim().toLocaleLowerCase();
      const target = [...players.values()].find((p) => p.name.trim().toLocaleLowerCase() === targetNameNeedle);
      if (!target || target.id === actor.id) {
        socket.send(JSON.stringify({ type: "ERROR", code: "ALLIANCE_TARGET", message: "target not found" }));
        return;
      }
      if (actor.allies.has(target.id)) {
        socket.send(JSON.stringify({ type: "ERROR", code: "ALLIANCE_EXISTS", message: "already allied" }));
        return;
      }
      const request: AllianceRequest = {
        id: crypto.randomUUID(),
        fromPlayerId: actor.id,
        toPlayerId: target.id,
        createdAt: now(),
        expiresAt: now() + ALLIANCE_REQUEST_TTL_MS,
        fromName: actor.name,
        toName: target.name
      };
      allianceRequests.set(request.id, request);
      socket.send(JSON.stringify({ type: "ALLIANCE_REQUESTED", request, targetName: target.name }));
      socketsByPlayer.get(target.id)?.send(JSON.stringify({ type: "ALLIANCE_REQUEST_INCOMING", request, fromName: actor.name }));
      return;
    }

    if (msg.type === "ALLIANCE_ACCEPT") {
      const request = allianceRequests.get(msg.requestId);
      if (!request || request.toPlayerId !== actor.id || request.expiresAt < now()) {
        socket.send(JSON.stringify({ type: "ERROR", code: "ALLIANCE_REQUEST_INVALID", message: "request invalid or expired" }));
        return;
      }
      const from = players.get(request.fromPlayerId);
      if (!from) {
        socket.send(JSON.stringify({ type: "ERROR", code: "ALLIANCE_REQUEST_INVALID", message: "request sender offline/unknown" }));
        allianceRequests.delete(msg.requestId);
        return;
      }
      actor.allies.add(from.id);
      from.allies.add(actor.id);
      recomputeExposure(actor);
      recomputeExposure(from);
      allianceRequests.delete(msg.requestId);
      broadcastAllianceUpdate(actor, from);
      return;
    }

    if (msg.type === "ALLIANCE_BREAK") {
      const target = players.get(msg.targetPlayerId);
      if (!target || !actor.allies.has(target.id)) {
        socket.send(JSON.stringify({ type: "ERROR", code: "ALLIANCE_BREAK_INVALID", message: "not allied with target" }));
        return;
      }
      actor.allies.delete(target.id);
      target.allies.delete(actor.id);
      recomputeExposure(actor);
      recomputeExposure(target);
      broadcastAllianceUpdate(actor, target);
      return;
    }

    if (msg.type === "SUBSCRIBE_CHUNKS") {
      const sub = { cx: msg.cx, cy: msg.cy, radius: Math.max(0, Math.min(msg.radius, MAX_SUBSCRIBE_RADIUS)) };
      chunkSubscriptionByPlayer.set(actor.id, sub);
      const last = chunkSnapshotSentAtByPlayer.get(actor.id);
      if (last && last.cx === sub.cx && last.cy === sub.cy && last.radius === sub.radius && now() - last.sentAt < 2500) {
        return;
      }
      sendChunkSnapshot(socket, actor, sub);
      return;
    }

    if (msg.type === "ATTACK_PREVIEW") {
      let from = playerTile(msg.fromX, msg.fromY);
      const to = playerTile(msg.toX, msg.toY);
      let fk = key(from.x, from.y);
      const tk = key(to.x, to.y);
      let fromDock = docksByTile.get(fk);
      let adjacent = isAdjacentTile(from.x, from.y, to.x, to.y);
      let dockCrossing = Boolean(fromDock && validDockCrossingTarget(fromDock, to.x, to.y));
      if (!adjacent && !dockCrossing && from.ownerId === actor.id) {
        const altFrom = findOwnedDockOriginForCrossing(actor, to.x, to.y);
        if (altFrom) {
          from = altFrom;
          fk = key(from.x, from.y);
          fromDock = docksByTile.get(fk);
          adjacent = isAdjacentTile(from.x, from.y, to.x, to.y);
          dockCrossing = Boolean(fromDock && validDockCrossingTarget(fromDock, to.x, to.y));
        }
      }

      const sendInvalid = (reason: string): void => {
        socket.send(
          JSON.stringify({
            type: "ATTACK_PREVIEW_RESULT",
            from: { x: from.x, y: from.y },
            to: { x: to.x, y: to.y },
            valid: false,
            reason
          })
        );
      };

      if (from.ownerId !== actor.id) {
        sendInvalid("origin not owned");
        return;
      }
      if (!adjacent && !dockCrossing) {
        sendInvalid("target must be adjacent or valid dock crossing");
        return;
      }
      if (to.terrain !== "LAND") {
        sendInvalid("target is barrier");
        return;
      }
      if (combatLocks.has(fk) || combatLocks.has(tk)) {
        sendInvalid("tile locked in combat");
        return;
      }
      const defenderIsBarbarian = to.ownerId === BARBARIAN_OWNER_ID;
      const defender = to.ownerId && !defenderIsBarbarian ? players.get(to.ownerId) : undefined;
      if (!defender && !defenderIsBarbarian) {
        socket.send(
          JSON.stringify({
            type: "ATTACK_PREVIEW_RESULT",
            from: { x: from.x, y: from.y },
            to: { x: to.x, y: to.y },
            valid: true,
            winChance: 1
          })
        );
        return;
      }
      if (defender && actor.allies.has(defender.id)) {
        sendInvalid("cannot attack allied tile");
        return;
      }
      if (defender && !defenderIsBarbarian && defender.spawnShieldUntil > now()) {
        sendInvalid("target shielded");
        return;
      }

      const canBreakthrough =
        actor.techIds.has(BREAKTHROUGH_REQUIRED_TECH_ID) &&
        Boolean(to.ownerId && to.ownerId !== actor.id && to.ownerId !== BARBARIAN_OWNER_ID) &&
        !actor.allies.has(to.ownerId ?? "");
      const shock = breachShockByTile.get(tk);
      const shockMult = defender && shock && shock.ownerId === defender.id && shock.expiresAt > now() ? BREACH_SHOCK_DEF_MULT : 1;
      const defMult = defender ? playerDefensiveness(defender) * shockMult : 1;
      const fortMult = defender ? fortDefenseMultAt(defender.id, tk) : 1;
      const dockMult = docksByTile.has(tk) ? DOCK_DEFENSE_MULT : 1;
      const siegeAtkMult = outpostAttackMultAt(actor.id, fk);
      const atkEff = 10 * actor.mods.attack * siegeAtkMult * activeAttackBuffMult(actor.id) * attackMultiplierForTarget(actor.id, to);
      const settledDefenseMult = defender ? settledDefenseMultiplierForTarget(defender.id, to) : 1;
      const newSettlementDefenseMult = defender ? settlementDefenseMultAt(defender.id, tk) : 1;
      const ownershipDefenseMult = ownershipDefenseMultiplierForTarget(to);
      const defEff = defenderIsBarbarian
        ? 10 * BARBARIAN_DEFENSE_POWER * dockMult
        : 10 * (defender?.mods.defense ?? 1) * defMult * fortMult * dockMult * settledDefenseMult * newSettlementDefenseMult * ownershipDefenseMult;
      const breakthroughDefEff = defenderIsBarbarian ? defEff : defEff * BREAKTHROUGH_DEF_MULT_FACTOR;
      socket.send(
        JSON.stringify({
          type: "ATTACK_PREVIEW_RESULT",
          from: { x: from.x, y: from.y },
          to: { x: to.x, y: to.y },
          valid: true,
          winChance: combatWinChance(atkEff, defEff),
          breakthroughWinChance: canBreakthrough ? combatWinChance(atkEff, breakthroughDefEff) : undefined,
          atkEff,
          defEff,
          siegeAtkMult,
          defMult,
          fortMult,
          dockMult
        })
      );
      return;
    }

    if (
      msg.type !== "ATTACK" &&
      msg.type !== "EXPAND" &&
      msg.type !== "BREAKTHROUGH_ATTACK" &&
      msg.type !== "DEEP_STRIKE_ATTACK" &&
      msg.type !== "NAVAL_INFILTRATION_ATTACK"
    ) return;

    app.log.info(
      {
        playerId: actor.id,
        playerName: actor.name,
        action: msg.type,
        fromX: msg.fromX,
        fromY: msg.fromY,
        toX: msg.toX,
        toY: msg.toY
      },
      "action request"
    );

    const nowMs = now();
    const actionTimes = pruneActionTimes(actor.id, nowMs);
    if (actionTimes.length >= ACTION_LIMIT) {
      app.log.info({ playerId: actor.id, action: msg.type }, "action rejected: rate limit");
      socket.send(JSON.stringify({ type: "ERROR", code: "RATE_LIMIT", message: "too many actions; slow down briefly" }));
      return;
    }
    actionTimes.push(nowMs);
    actionTimestampsByPlayer.set(actor.id, actionTimes);

    applyStaminaRegen(actor);
    const staminaCost = 0;
    const isBreakthroughAttack = msg.type === "BREAKTHROUGH_ATTACK";
    const isDeepStrikeAttack = msg.type === "DEEP_STRIKE_ATTACK";
    const isNavalInfiltrationAttack = msg.type === "NAVAL_INFILTRATION_ATTACK";
    const isSpecialCrystalAttack = isDeepStrikeAttack || isNavalInfiltrationAttack;

    let from = playerTile(msg.fromX, msg.fromY);
    const to = playerTile(msg.toX, msg.toY);
    const preTk = key(to.x, to.y);
    if (msg.type === "EXPAND" && to.ownerId) {
      app.log.info({ playerId: actor.id, to: preTk, ownerId: to.ownerId }, "action rejected: expand target owned");
      socket.send(JSON.stringify({ type: "ERROR", code: "EXPAND_TARGET_OWNED", message: "expand only targets neutral land" }));
      return;
    }
    if (isBreakthroughAttack && !to.ownerId) {
      app.log.info({ playerId: actor.id, to: preTk }, "action rejected: breakthrough target not enemy");
      socket.send(JSON.stringify({ type: "ERROR", code: "BREAKTHROUGH_TARGET_INVALID", message: "breakthrough requires enemy tile" }));
      return;
    }
    if (isBreakthroughAttack && !actor.techIds.has(BREAKTHROUGH_REQUIRED_TECH_ID)) {
      socket.send(JSON.stringify({ type: "ERROR", code: "BREAKTHROUGH_TARGET_INVALID", message: "requires Breach Doctrine" }));
      return;
    }
    if (isDeepStrikeAttack && (!to.ownerId || to.ownerId === actor.id || actor.allies.has(to.ownerId))) {
      socket.send(JSON.stringify({ type: "ERROR", code: "DEEP_STRIKE_INVALID", message: "deep strike requires enemy tile" }));
      return;
    }
    if (isNavalInfiltrationAttack && (!to.ownerId || to.ownerId === actor.id || actor.allies.has(to.ownerId))) {
      socket.send(JSON.stringify({ type: "ERROR", code: "NAVAL_INFILTRATION_INVALID", message: "naval infiltration requires enemy tile" }));
      return;
    }
    if (isDeepStrikeAttack && hostileObservatoryProtectingTile(actor, to.x, to.y)) {
      socket.send(JSON.stringify({ type: "ERROR", code: "DEEP_STRIKE_INVALID", message: "target is inside enemy observatory protection field" }));
      return;
    }
    if (isNavalInfiltrationAttack && hostileObservatoryProtectingTile(actor, to.x, to.y)) {
      socket.send(JSON.stringify({ type: "ERROR", code: "NAVAL_INFILTRATION_INVALID", message: "landing tile is inside enemy observatory protection field" }));
      return;
    }
    if ((msg.type === "EXPAND" || msg.type === "ATTACK") && actor.points < FRONTIER_ACTION_GOLD_COST) {
      app.log.info({ playerId: actor.id, action: msg.type, points: actor.points, required: FRONTIER_ACTION_GOLD_COST }, "action rejected: insufficient gold");
      socket.send(
        JSON.stringify({
          type: "ERROR",
          code: "INSUFFICIENT_GOLD",
          message: msg.type === "ATTACK" ? "insufficient gold for attack" : "insufficient gold for frontier claim"
        })
      );
      return;
    }
    if (isBreakthroughAttack && actor.points < BREAKTHROUGH_GOLD_COST) {
      app.log.info({ playerId: actor.id, points: actor.points, required: BREAKTHROUGH_GOLD_COST }, "action rejected: insufficient gold for breakthrough");
      socket.send(JSON.stringify({ type: "ERROR", code: "INSUFFICIENT_GOLD", message: "insufficient gold for breakthrough" }));
      return;
    }
    if (isDeepStrikeAttack) {
      if (!playerHasTechIds(actor, ABILITY_DEFS.deep_strike.requiredTechIds)) {
        socket.send(JSON.stringify({ type: "ERROR", code: "DEEP_STRIKE_INVALID", message: "requires Deep Operations" }));
        return;
      }
      if (abilityOnCooldown(actor.id, "deep_strike")) {
        socket.send(JSON.stringify({ type: "ERROR", code: "DEEP_STRIKE_INVALID", message: "deep strike is cooling down" }));
        return;
      }
      if ((getOrInitStrategicStocks(actor.id).CRYSTAL ?? 0) < DEEP_STRIKE_CRYSTAL_COST) {
        socket.send(JSON.stringify({ type: "ERROR", code: "INSUFFICIENT_RESOURCE", message: "insufficient CRYSTAL for deep strike" }));
        return;
      }
    }
    if (isNavalInfiltrationAttack) {
      if (!playerHasTechIds(actor, ABILITY_DEFS.naval_infiltration.requiredTechIds)) {
        socket.send(JSON.stringify({ type: "ERROR", code: "NAVAL_INFILTRATION_INVALID", message: "requires Navigation" }));
        return;
      }
      if (abilityOnCooldown(actor.id, "naval_infiltration")) {
        socket.send(JSON.stringify({ type: "ERROR", code: "NAVAL_INFILTRATION_INVALID", message: "naval infiltration is cooling down" }));
        return;
      }
      if ((getOrInitStrategicStocks(actor.id).CRYSTAL ?? 0) < NAVAL_INFILTRATION_CRYSTAL_COST) {
        socket.send(JSON.stringify({ type: "ERROR", code: "INSUFFICIENT_RESOURCE", message: "insufficient CRYSTAL for naval infiltration" }));
        return;
      }
    }
    let fk = key(from.x, from.y);
    const tk = key(to.x, to.y);
    let fromDock = docksByTile.get(fk);
    let adjacent = isAdjacentTile(from.x, from.y, to.x, to.y);
    let dockCrossing = Boolean(fromDock && validDockCrossingTarget(fromDock, to.x, to.y));
    if (!adjacent && !dockCrossing && from.ownerId === actor.id) {
      const altFrom = findOwnedDockOriginForCrossing(actor, to.x, to.y);
      if (altFrom) {
        from = altFrom;
        fk = key(from.x, from.y);
        fromDock = docksByTile.get(fk);
        adjacent = isAdjacentTile(from.x, from.y, to.x, to.y);
        dockCrossing = Boolean(fromDock && validDockCrossingTarget(fromDock, to.x, to.y));
      }
    }
    const deepStrikeValid = isDeepStrikeAttack ? validDeepStrikeTarget(from, to) : false;
    const navalInfiltrationValid = isNavalInfiltrationAttack ? validNavalInfiltrationTarget(from, to) : false;
    if (!adjacent && !dockCrossing && !deepStrikeValid && !navalInfiltrationValid) {
      app.log.info({ playerId: actor.id, from: fk, to: tk }, "action rejected: not adjacent and not dock crossing");
      socket.send(
        JSON.stringify({
          type: "ERROR",
          code: isDeepStrikeAttack ? "DEEP_STRIKE_INVALID" : isNavalInfiltrationAttack ? "NAVAL_INFILTRATION_INVALID" : "NOT_ADJACENT",
          message: isDeepStrikeAttack
            ? "target must be within 2 tiles and not through mountains"
            : isNavalInfiltrationAttack
              ? "target must cross water and land within 4 tiles"
              : "target must be adjacent or valid dock crossing"
        })
      );
      return;
    }
    if (dockCrossing && fromDock && fromDock.cooldownUntil > now()) {
      app.log.info({ playerId: actor.id, dockId: fromDock.dockId, cooldownUntil: fromDock.cooldownUntil }, "action rejected: dock cooldown");
      socket.send(JSON.stringify({ type: "ERROR", code: "DOCK_COOLDOWN", message: "dock crossing endpoint on cooldown" }));
      return;
    }

    if (from.ownerId !== actor.id) {
      app.log.info({ playerId: actor.id, from: fk, fromOwner: from.ownerId }, "action rejected: origin not owned");
      socket.send(JSON.stringify({ type: "ERROR", code: "NOT_OWNER", message: "origin not owned" }));
      return;
    }

    if (to.terrain !== "LAND") {
      app.log.info({ playerId: actor.id, to: tk, terrain: to.terrain }, "action rejected: barrier target");
      socket.send(JSON.stringify({ type: "ERROR", code: "BARRIER", message: "target is barrier" }));
      return;
    }

    if (combatLocks.has(fk) || combatLocks.has(tk)) {
      app.log.info({ playerId: actor.id, from: fk, to: tk }, "action rejected: combat lock");
      socket.send(JSON.stringify({ type: "ERROR", code: "LOCKED", message: "tile locked in combat" }));
      return;
    }

    const defenderIsBarbarian = to.ownerId === BARBARIAN_OWNER_ID;
    const defender = to.ownerId && !defenderIsBarbarian ? players.get(to.ownerId) : undefined;
    if (defender && actor.allies.has(defender.id)) {
      app.log.info({ playerId: actor.id, defenderId: defender.id }, "action rejected: allied target");
      socket.send(JSON.stringify({ type: "ERROR", code: "ALLY_TARGET", message: "cannot attack allied tile" }));
      return;
    }
    if (isBreakthroughAttack) {
      if (!consumeStrategicResource(actor, "IRON", BREAKTHROUGH_IRON_COST)) {
        app.log.info({ playerId: actor.id }, "action rejected: insufficient IRON for breakthrough");
        socket.send(JSON.stringify({ type: "ERROR", code: "INSUFFICIENT_RESOURCE", message: "insufficient IRON for breakthrough" }));
        return;
      }
      actor.points -= BREAKTHROUGH_GOLD_COST;
      recalcPlayerDerived(actor);
      telemetryCounters.breakthroughAttacks += 1;
    }
    if (isDeepStrikeAttack) {
      if (!consumeStrategicResource(actor, "CRYSTAL", DEEP_STRIKE_CRYSTAL_COST)) {
        socket.send(JSON.stringify({ type: "ERROR", code: "INSUFFICIENT_RESOURCE", message: "insufficient CRYSTAL for deep strike" }));
        return;
      }
      startAbilityCooldown(actor.id, "deep_strike");
    }
    if (isNavalInfiltrationAttack) {
      if (!consumeStrategicResource(actor, "CRYSTAL", NAVAL_INFILTRATION_CRYSTAL_COST)) {
        socket.send(JSON.stringify({ type: "ERROR", code: "INSUFFICIENT_RESOURCE", message: "insufficient CRYSTAL for naval infiltration" }));
        return;
      }
      startAbilityCooldown(actor.id, "naval_infiltration");
    }
    if (msg.type !== "EXPAND" && to.ownerId && to.ownerId !== actor.id && !actor.allies.has(to.ownerId)) {
      pausePopulationGrowthFromWar(actor.id);
    }
    const resolvesAt = now() + (msg.type === "EXPAND" && !to.ownerId ? FRONTIER_CLAIM_MS : COMBAT_LOCK_MS);
    const pending: PendingCapture = {
      resolvesAt,
      origin: fk,
      target: tk,
      attackerId: actor.id,
      staminaCost,
      cancelled: false
    };
    combatLocks.set(fk, pending);
    combatLocks.set(tk, pending);
    app.log.info({ playerId: actor.id, action: msg.type, from: fk, to: tk, resolvesAt }, "action accepted");
    socket.send(JSON.stringify({ type: "COMBAT_START", origin: { x: from.x, y: from.y }, target: { x: to.x, y: to.y }, resolvesAt }));
    if (isBreakthroughAttack || isDeepStrikeAttack || isNavalInfiltrationAttack) sendPlayerUpdate(actor, 0);
    if (defender && !defenderIsBarbarian) {
      sendToPlayer(defender.id, {
        type: "ATTACK_ALERT",
        attackerId: actor.id,
        attackerName: actor.name,
        x: to.x,
        y: to.y,
        resolvesAt
      });
    }

    pending.timeout = setTimeout(() => {
      if (pending.cancelled) return;
      combatLocks.delete(fk);
      combatLocks.delete(tk);
      if (dockCrossing && fromDock) fromDock.cooldownUntil = now() + DOCK_CROSSING_COOLDOWN_MS;

      if (!defender && !defenderIsBarbarian) {
        if (msg.type === "EXPAND") {
          actor.points -= FRONTIER_ACTION_GOLD_COST;
          recalcPlayerDerived(actor);
        }
        actor.stamina -= staminaCost;
        updateOwnership(to.x, to.y, actor.id, "FRONTIER");
        const siteBonusGold = claimFirstSpecialSiteCaptureBonus(actor, to.x, to.y);
        telemetryCounters.frontierClaims += 1;
        actor.missionStats.neutralCaptures += 1;
        maybeIssueResourceMission(actor, to.resource);
        updateMissionState(actor);
        socket.send(
          JSON.stringify({
            type: "COMBAT_RESULT",
            winnerId: actor.id,
            changes: [{ x: to.x, y: to.y, ownerId: actor.id, ownershipState: "FRONTIER" }],
            pointsDelta: siteBonusGold,
            levelDelta: 0
          })
        );
        sendPlayerUpdate(actor, 0);
        sendLocalVisionDeltaForPlayer(actor.id, [{ x: to.x, y: to.y }]);
        return;
      }

      if (defender && defender.spawnShieldUntil > now()) {
        socket.send(JSON.stringify({ type: "ERROR", code: "SHIELDED", message: "target shielded" }));
        return;
      }

      if (msg.type === "ATTACK") {
        actor.points -= FRONTIER_ACTION_GOLD_COST;
        recalcPlayerDerived(actor);
      }
      actor.stamina -= staminaCost;

      const specialAttackMult = isDeepStrikeAttack ? DEEP_STRIKE_ATTACK_MULT : isNavalInfiltrationAttack ? NAVAL_INFILTRATION_ATTACK_MULT : 1;
      const atkEff =
        10 * actor.mods.attack * activeAttackBuffMult(actor.id) * attackMultiplierForTarget(actor.id, to) * specialAttackMult * randomFactor();
      const siegeAtkMult = outpostAttackMultAt(actor.id, fk);
      const atkEffWithSiege = atkEff * siegeAtkMult;
      const shock = breachShockByTile.get(tk);
      const shockMult = defender && shock && shock.ownerId === defender.id && shock.expiresAt > now() ? BREACH_SHOCK_DEF_MULT : 1;
      const defMultRaw = defender ? playerDefensiveness(defender) * shockMult : 1;
      const defMult = isBreakthroughAttack ? defMultRaw * BREAKTHROUGH_DEF_MULT_FACTOR : defMultRaw;
      const fortMult = defender ? fortDefenseMultAt(defender.id, tk) : 1;
      const dockMult = docksByTile.has(tk) ? DOCK_DEFENSE_MULT : 1;
      const settledDefenseMult = defender ? settledDefenseMultiplierForTarget(defender.id, to) : 1;
      const newSettlementDefenseMult = defender ? settlementDefenseMultAt(defender.id, tk) : 1;
      const ownershipDefenseMult = ownershipDefenseMultiplierForTarget(to);
      const defEff = defenderIsBarbarian
        ? 10 * BARBARIAN_DEFENSE_POWER * dockMult * randomFactor()
        : 10 * (defender?.mods.defense ?? 1) * defMult * fortMult * dockMult * settledDefenseMult * newSettlementDefenseMult * ownershipDefenseMult * randomFactor();
      const p = combatWinChance(atkEffWithSiege, defEff);
      const win = Math.random() < p;

      let pointsDelta = 0;
      let resultChanges: Array<{
        x: number;
        y: number;
        ownerId?: string;
        ownershipState?: "FRONTIER" | "SETTLED" | "BARBARIAN";
      }> = [];
      if (win) {
        const targetWasSettled = to.ownershipState === "SETTLED";
        updateOwnership(to.x, to.y, actor.id, "FRONTIER");
        resultChanges = [{ x: to.x, y: to.y, ownerId: actor.id, ownershipState: "FRONTIER" }];
        if (!defenderIsBarbarian && isBreakthroughAttack && targetWasSettled && defender) {
          applyBreachShockAround(to.x, to.y, defender.id);
        }
        if (defenderIsBarbarian) {
          pointsDelta = BARBARIAN_CLEAR_GOLD_REWARD;
          actor.points += pointsDelta;
          logBarbarianEvent(`cleared by ${actor.id} @ ${to.x},${to.y}`);
        } else {
          actor.missionStats.enemyCaptures += 1;
        }
        actor.missionStats.combatWins += 1;
        if (defender) {
          incrementVendettaCount(actor.id, defender.id);
          maybeIssueVendettaMission(actor, defender.id);
        }
        maybeIssueResourceMission(actor, to.resource);
        if (defender) {
          const attackerRating = ratingFromPointsLevel(actor.points, actor.level);
          const defenderRating = ratingFromPointsLevel(defender.points, defender.level);
          const pairKey = pairKeyFor(actor.id, defender.id);
          const nowMs = now();
          const entries = pruneRepeatFightEntries(pairKey, nowMs);
          entries.push(nowMs);
          repeatFights.set(pairKey, entries);
          const repeatMult = Math.max(PVP_REPEAT_FLOOR, 0.5 ** (entries.length - 1));
          pointsDelta = actor.allies.has(defender.id) ? 0 : pvpPointsReward(baseTileValue(to.resource), attackerRating, defenderRating) * repeatMult * PVP_REWARD_MULT;
          actor.points += pointsDelta;
        }
      } else {
        if (defenderIsBarbarian) {
          const barbarianAgentId = barbarianAgentByTileKey.get(tk);
          const barbarianAgent = barbarianAgentId ? barbarianAgents.get(barbarianAgentId) : undefined;
          if (barbarianAgent) {
            const progressBefore = barbarianAgent.progress;
            barbarianAgent.progress += getBarbarianProgressGain(from);
            updateOwnership(from.x, from.y, BARBARIAN_OWNER_ID, "BARBARIAN");
            barbarianAgent.x = from.x;
            barbarianAgent.y = from.y;
            barbarianAgent.lastActionAt = now();
            barbarianAgent.nextActionAt = now() + BARBARIAN_ACTION_INTERVAL_MS;
            upsertBarbarianAgent(barbarianAgent);
            updateOwnership(to.x, to.y, undefined);
            resultChanges = [
              { x: from.x, y: from.y, ownerId: BARBARIAN_OWNER_ID, ownershipState: "BARBARIAN" },
              { x: to.x, y: to.y }
            ];
            logBarbarianEvent(`progress ${barbarianAgent.id} ${progressBefore} -> ${barbarianAgent.progress} on defense ${from.x},${from.y}`);
          } else {
            updateOwnership(from.x, from.y, BARBARIAN_OWNER_ID, "BARBARIAN");
            updateOwnership(to.x, to.y, undefined);
            resultChanges = [
              { x: from.x, y: from.y, ownerId: BARBARIAN_OWNER_ID, ownershipState: "BARBARIAN" },
              { x: to.x, y: to.y }
            ];
          }
          pointsDelta = 0;
        } else if (defender) {
          updateOwnership(from.x, from.y, defender.id, "FRONTIER");
          resultChanges = [{ x: from.x, y: from.y, ownerId: defender.id, ownershipState: "FRONTIER" }];
          defender.missionStats.enemyCaptures += 1;
          defender.missionStats.combatWins += 1;
          incrementVendettaCount(defender.id, actor.id);
          maybeIssueVendettaMission(defender, actor.id);
          maybeIssueResourceMission(defender, from.resource);
          const attackerRating = ratingFromPointsLevel(defender.points, defender.level);
          const defenderRating = ratingFromPointsLevel(actor.points, actor.level);
          pointsDelta = actor.allies.has(defender.id) ? 0 : pvpPointsReward(baseTileValue(from.resource), attackerRating, defenderRating) * PVP_REWARD_MULT;
          defender.points += pointsDelta;
        }
      }

      recalcPlayerDerived(actor);
      if (defender) recalcPlayerDerived(defender);
      updateMissionState(actor);
      if (defender) updateMissionState(defender);

      resolveEliminationIfNeeded(actor, true);
      if (defender) resolveEliminationIfNeeded(defender, socketsByPlayer.has(defender.id));

      socket.send(JSON.stringify({
        type: "COMBAT_RESULT",
        winnerId: win ? actor.id : defenderIsBarbarian ? BARBARIAN_OWNER_ID : defender?.id,
        changes: resultChanges,
        pointsDelta,
        levelDelta: 0
      }));
      sendPlayerUpdate(actor, 0);
      if (defender && !defenderIsBarbarian) sendPlayerUpdate(defender, 0);
      const changedCenters = resultChanges.map((change) => ({ x: change.x, y: change.y }));
      sendLocalVisionDeltaForPlayer(actor.id, changedCenters);
      if (defender && !defenderIsBarbarian) sendLocalVisionDeltaForPlayer(defender.id, changedCenters);
    }, resolvesAt - now());
  });

  socket.on("close", () => {
    if (authedPlayer) {
      for (const pcap of pendingCapturesByAttacker(authedPlayer.id)) cancelPendingCapture(pcap);
      for (const settle of [...pendingSettlementsByTile.values()]) {
        if (settle.ownerId !== authedPlayer.id) continue;
        settle.cancelled = true;
        if (settle.timeout) clearTimeout(settle.timeout);
        pendingSettlementsByTile.delete(settle.tileKey);
      }
      socketsByPlayer.delete(authedPlayer.id);
      chunkSubscriptionByPlayer.delete(authedPlayer.id);
      chunkSnapshotSentAtByPlayer.delete(authedPlayer.id);
      actionTimestampsByPlayer.delete(authedPlayer.id);
      fogDisabledByPlayer.delete(authedPlayer.id);
      if (!hasOnlinePlayers()) {
        cancelAllBarbarianPendingCaptures();
        pauseVictoryPressureTimers();
        saveSnapshotInBackground();
        lastSnapshotAt = now();
      }
    }
  });
});

const shutdown = async (signal: string): Promise<void> => {
  app.log.info({ signal }, "shutting down server");
  let exitCode = 0;
  for (const interval of runtimeIntervals) clearInterval(interval);
  runtimeIntervals.length = 0;
  try {
    await saveSnapshot();
  } catch (err) {
    exitCode = 1;
    app.log.error({ err, signal }, "error saving snapshot during shutdown");
  }
  try {
    await app.close();
  } catch (err) {
    exitCode = 1;
    app.log.error({ err, signal }, "error during shutdown");
  } finally {
    process.exit(exitCode);
  }
};

process.once("SIGINT", () => {
  void shutdown("SIGINT");
});
process.once("SIGTERM", () => {
  void shutdown("SIGTERM");
});

await app.listen({ host: "0.0.0.0", port: PORT });

import Fastify from "fastify";
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
  FRONTIER_CLAIM_MS,
  DOCK_CROSSING_COOLDOWN_MS,
  DOCK_DEFENSE_MULT,
  DOCK_PAIRS_MAX,
  DOCK_PAIRS_MIN,
  FORT_BUILD_COST,
  FORT_BUILD_MS,
  FORT_DEFENSE_MULT,
  FORT_MAX_PER_PLAYER,
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
  terrainAt,
  wrapX,
  wrapY,
  type Player,
  type MissionKind,
  type MissionState,
  type MissionStats,
  type ClusterType,
  type OwnershipState,
  type ResourceType,
  type Season,
  type Tile,
  type TileKey,
  type Fort,
  type SiegeOutpost,
  type Dock,
  type BarbarianAgent,
} from "@border-empires/shared";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { loadTechTree, type StatsModKey } from "./tech-tree.js";
import { loadDomainTree } from "./domain-tree.js";

const PORT = Number(process.env.PORT ?? 3001);
const DISABLE_FOG = process.env.DISABLE_FOG === "1";
const SNAPSHOT_DIR = path.resolve(process.cwd(), "snapshots");
const SNAPSHOT_FILE = path.join(SNAPSHOT_DIR, "state.json");

type Ws = import("ws").WebSocket;

interface AllianceRequest {
  id: string;
  fromPlayerId: string;
  toPlayerId: string;
  createdAt: number;
  expiresAt: number;
}

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
}

interface ClusterDefinition {
  clusterId: string;
  clusterType: ClusterType;
  resourceType?: ResourceType;
  centerX: number;
  centerY: number;
  radius: number;
  controlThreshold: number;
  bonus: { attack?: number; defense?: number; income?: number; vision?: number };
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
}

type StrategicResource = "FOOD" | "IRON" | "CRYSTAL" | "SUPPLY" | "SHARD";
const STRATEGIC_RESOURCE_KEYS: readonly StrategicResource[] = ["FOOD", "IRON", "CRYSTAL", "SUPPLY", "SHARD"];

interface TileYieldBuffer {
  gold: number;
  strategic: Record<StrategicResource, number>;
}

interface TechRequirementChecklist {
  label: string;
  met: boolean;
}

interface DomainRequirementChecklist {
  label: string;
  met: boolean;
}

interface TelemetryCounters {
  frontierClaims: number;
  settlements: number;
  rapidSettlements: number;
  breakthroughAttacks: number;
  scoutPulses: number;
  defensiveFortifies: number;
  techUnlocks: number;
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
const HARVEST_GOLD_RATE_MULT = 0.18;
const HARVEST_RESOURCE_RATE_MULT = 1 / 1440;
const TILE_YIELD_CAP_GOLD = 24;
const TILE_YIELD_CAP_RESOURCE = 6;
const OFFLINE_YIELD_ACCUM_MAX_MS = 12 * 60 * 60 * 1000;
const COLLECT_VISIBLE_COOLDOWN_MS = 20_000;
const FIRST_SPECIAL_SITE_CAPTURE_GOLD = 6;
const STARTING_GOLD = 20;
const MIN_ACTIVE_BARBARIAN_AGENTS = 80;
const BARBARIAN_MAINTENANCE_INTERVAL_MS = 10_000;
const BARBARIAN_MAINTENANCE_MAX_SPAWNS_PER_PASS = 6;
const PVP_REWARD_MULT = 0.55;
const DOCK_INCOME_PER_MIN = 5;
const BREAKTHROUGH_GOLD_COST = 2;
const BREAKTHROUGH_IRON_COST = 1;
const FORT_BUILD_IRON_COST = 45;
const SIEGE_OUTPOST_BUILD_SUPPLY_COST = 45;
const BREAKTHROUGH_DEF_MULT_FACTOR = 0.6;
const SCOUT_PULSE_CRYSTAL_COST = 1;
const SCOUT_PULSE_RADIUS = 8;
const SCOUT_PULSE_MS = 25_000;
const REVEAL_EMPIRE_UPKEEP_PER_MIN = 0.025;
const RAPID_SETTLE_GOLD_COST = 3;
const RAPID_SETTLE_FOOD_COST = 1;
const RAPID_SETTLE_MS = 1_500;
const DEFENSIVE_FORTIFY_SUPPLY_COST = 1;
const DEFENSIVE_FORTIFY_MULT = 1.25;
const DEFENSIVE_FORTIFY_MS = 45_000;
const BREACH_SHOCK_MS = 180_000;
const BREACH_SHOCK_DEF_MULT = 0.72;
const DYNAMIC_MISSION_MS = 7 * 24 * 60 * 60 * 1000;
const VENDETTA_ATTACK_BUFF_MULT = 1.15;
const VENDETTA_ATTACK_BUFF_MS = 24 * 60 * 60 * 1000;
const RESOURCE_CHAIN_BUFF_MS = 24 * 60 * 60 * 1000;
const RESOURCE_CHAIN_MULT = 1.4;
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
    incomePerMinute += c * resourceRate[r];
  }
  let ownedDockCount = 0;
  for (const d of docksByTile.values()) {
    const [dx, dy] = parseKey(d.tileKey);
    const t = playerTile(dx, dy);
    if (t.ownerId === player.id && t.ownershipState === "SETTLED") ownedDockCount += 1;
  }
  incomePerMinute += ownedDockCount * DOCK_INCOME_PER_MIN;
  for (const town of townsByTile.values()) {
    incomePerMinute += townIncomeForOwner(town, player.id);
  }
  return incomePerMinute * player.mods.income * PASSIVE_INCOME_MULT + BASE_GOLD_PER_MIN;
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
      out[sr] += (daily / 1440) * mult;
    }
  }
  for (const town of townsByTile.values()) {
    const [x, y] = parseKey(town.tileKey);
    const t = playerTile(x, y);
    if (t.ownerId !== player.id || t.ownershipState !== "SETTLED") continue;
    if (town.type === "ANCIENT") out.SHARD += strategicResourceRates.SHARD / 1440;
  }
  return out;
};

const players = new Map<string, Player>();
const passwordByName = new Map<string, string>();
const tokenToPlayerId = new Map<string, string>();
const socketsByPlayer = new Map<string, Ws>();
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
  resolvesAt: number;
  cancelled: boolean;
  timeout?: NodeJS.Timeout;
}
interface ScoutPulse {
  ownerId: string;
  x: number;
  y: number;
  expiresAt: number;
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
interface DefensiveFortify {
  ownerId: string;
  expiresAt: number;
  consumed: boolean;
}
const combatLocks = new Map<TileKey, PendingCapture>();
const pendingSettlementsByTile = new Map<TileKey, PendingSettlement>();
const repeatFights = new Map<string, number[]>();
const resourceCountsByPlayer = new Map<string, Record<ResourceType, number>>();
const strategicResourceStockByPlayer = new Map<string, Record<StrategicResource, number>>();
const strategicResourceBufferByPlayer = new Map<string, Record<StrategicResource, number>>();
const foodUpkeepCoverageByPlayer = new Map<string, number>();
const tileYieldByTile = new Map<TileKey, TileYieldBuffer>();
const lastUpkeepByPlayer = new Map<string, UpkeepDiagnostics>();
const dynamicMissionsByPlayer = new Map<string, DynamicMissionDef[]>();
const temporaryAttackBuffUntilByPlayer = new Map<string, number>();
const temporaryIncomeBuffUntilByPlayer = new Map<string, { until: number; resources: [ResourceType, ResourceType] }>();
const vendettaCaptureCountsByPlayer = new Map<string, Map<string, number>>();
const forcedRevealTilesByPlayer = new Map<string, Set<TileKey>>();
const allianceRequests = new Map<string, AllianceRequest>();
const chunkSubscriptionByPlayer = new Map<string, { cx: number; cy: number; radius: number }>();
const chunkSnapshotSentAtByPlayer = new Map<string, { cx: number; cy: number; radius: number; sentAt: number }>();
const collectVisibleCooldownByPlayer = new Map<string, number>();
const actionTimestampsByPlayer = new Map<string, number[]>();
const fogDisabledByPlayer = new Map<string, boolean>();
const fortsByTile = new Map<TileKey, Fort>();
const fortBuildTimers = new Map<TileKey, NodeJS.Timeout>();
const siegeOutpostsByTile = new Map<TileKey, SiegeOutpost>();
const siegeOutpostBuildTimers = new Map<TileKey, NodeJS.Timeout>();
const docksByTile = new Map<TileKey, Dock>();
const dockById = new Map<string, Dock>();
const clusterByTile = new Map<TileKey, string>();
const clustersById = new Map<string, ClusterDefinition>();
const clusterControlledTilesByPlayer = new Map<string, Map<string, number>>();
const townsByTile = new Map<TileKey, TownDefinition>();
const firstSpecialSiteCaptureClaimed = new Set<TileKey>();
const scoutPulsesByPlayer = new Map<string, ScoutPulse[]>();
const revealedEmpireTargetsByPlayer = new Map<string, Set<string>>();
const defensiveFortifyByTile = new Map<TileKey, DefensiveFortify>();
const breachShockByTile = new Map<TileKey, { ownerId: string; expiresAt: number }>();
const playerBaseMods = new Map<string, { attack: number; defense: number; income: number; vision: number }>();
const domainEffectsByPlayer = new Map<string, { revealUpkeepMult: number; revealCapacityBonus: number }>();
const seasonArchives: SeasonArchiveEntry[] = [];
const telemetryCounters: TelemetryCounters = {
  frontierClaims: 0,
  settlements: 0,
  rapidSettlements: 0,
  breakthroughAttacks: 0,
  scoutPulses: 0,
  defensiveFortifies: 0,
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
const SEASONS_ENABLED = false;

const seeded01 = (x: number, y: number, seed: number): number => {
  const n = Math.sin((x * 12.9898 + y * 78.233 + seed * 43758.5453) % 100000) * 43758.5453123;
  return n - Math.floor(n);
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
  bonus: { attack?: number; defense?: number; income?: number; vision?: number };
}> = [
  { type: "FERTILE_PLAINS", resourceType: "FARM", threshold: 3, bonus: { income: 1.25 } },
  { type: "IRON_HILLS", resourceType: "IRON", threshold: 3, bonus: { attack: 1.08 } },
  { type: "CRYSTAL_BASIN", resourceType: "GEMS", threshold: 3, bonus: { vision: 1.08 } },
  { type: "HORSE_STEPPES", resourceType: "FUR", threshold: 3, bonus: { attack: 1.05, defense: 1.03 } },
  { type: "COASTAL_SHOALS", resourceType: "FISH", threshold: 3, bonus: { income: 1.2, vision: 1.03 } }
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

const resetPlayerClusterMods = (player: Player): void => {
  const base = playerBaseMods.get(player.id) ?? { attack: 1, defense: 1, income: 1, vision: 1 };
  player.mods.attack = base.attack;
  player.mods.defense = base.defense;
  player.mods.income = base.income;
  player.mods.vision = base.vision;
};

const recomputeClusterBonusForPlayer = (player: Player): void => {
  resetPlayerClusterMods(player);
  const controls = clusterControlledTilesByPlayer.get(player.id);
  if (!controls) return;
  for (const [cid, count] of controls) {
    const cluster = clustersById.get(cid);
    if (!cluster) continue;
    if (count < cluster.controlThreshold) continue;
    if (cluster.bonus.attack) player.mods.attack *= cluster.bonus.attack;
    if (cluster.bonus.defense) player.mods.defense *= cluster.bonus.defense;
    if (cluster.bonus.income) player.mods.income *= cluster.bonus.income;
    if (cluster.bonus.vision) player.mods.vision *= cluster.bonus.vision;
  }
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
  recomputeDomainEffectsForPlayer(player);
  recomputeClusterBonusForPlayer(player);
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
  const targetCount = CLUSTER_COUNT_MIN;
  const clusterTileCount = 8;
  const clusterPlan: ResourceType[] = [];
  for (let i = 0; i < targetCount; i += 1) {
    const bucket = i % 5;
    if (bucket === 0) clusterPlan.push("FARM");
    else if (bucket === 1) clusterPlan.push("FUR");
    else if (bucket === 2) clusterPlan.push("GEMS");
    else if (bucket === 3) clusterPlan.push("IRON");
    else clusterPlan.push("FISH");
  }

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
        controlThreshold: def.threshold,
        bonus: def.bonus
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
          controlThreshold: def.threshold,
          bonus: def.bonus
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
  return clusterResourceType(c);
};

type DockCandidate = { x: number; y: number; componentId: number; seaX: number; seaY: number };
type LandComponentMeta = {
  id: number;
  tileCount: number;
  fallbackX: number;
  fallbackY: number;
  oceanCandidates: DockCandidate[];
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
  const worldScale = (WORLD_WIDTH * WORLD_HEIGHT) / 1_000_000;
  const rawPairs = DOCK_PAIRS_MIN + Math.floor(seeded01(seed + 5, seed + 9, seed + 700) * (DOCK_PAIRS_MAX - DOCK_PAIRS_MIN + 1));
  const targetPairs = Math.max(10, Math.floor(rawPairs * worldScale));
  const baseTargetDocks = Math.max(20, targetPairs * 2);
  const { components, componentByIndex } = analyzeLandComponentsForDocks(seed, oceanMask);
  const forced: DockCandidate[] = [];
  for (const comp of components) {
    if (comp.tileCount < 24) continue;
    if (comp.oceanCandidates.length > 0) {
      const pick = Math.floor(seeded01(comp.id, seed + 407, seed + 409) * comp.oceanCandidates.length);
      forced.push(comp.oceanCandidates[pick]!);
    }
  }

  const targetDocks = Math.max(baseTargetDocks, forced.length);
  const candidates: DockCandidate[] = [];
  for (let i = 0; i < 120_000 && candidates.length < targetDocks * 18; i += 1) {
    const x = Math.floor(seeded01(i * 19, i * 23, seed + 401) * WORLD_WIDTH);
    const y = Math.floor(seeded01(i * 29, i * 31, seed + 409) * WORLD_HEIGHT);
    if (!isCoastalLand(x, y)) continue;
    const oceanNeighbor = adjacentOceanSea(x, y, oceanMask);
    if (!oceanNeighbor) continue;
    const componentId = componentByIndex[worldIndex(x, y)] ?? -1;
    if (componentId < 0) continue;
    candidates.push({ x, y, componentId, seaX: oceanNeighbor.x, seaY: oceanNeighbor.y });
  }
  const minSpacing = Math.max(8, Math.floor(Math.min(WORLD_WIDTH, WORLD_HEIGHT) * 0.02));
  const selected: DockCandidate[] = [];
  const used = new Set<string>();
  for (const c of forced) {
    const tk = key(c.x, c.y);
    if (used.has(tk)) continue;
    selected.push(c);
    used.add(tk);
  }
  for (let i = 0; i < candidates.length && selected.length < targetDocks; i += 1) {
    const c = candidates[i]!;
    const tk = key(c.x, c.y);
    if (used.has(tk)) continue;
    const tooClose = selected.some((s) => {
      const dx = Math.min(Math.abs(s.x - c.x), WORLD_WIDTH - Math.abs(s.x - c.x));
      const dy = Math.min(Math.abs(s.y - c.y), WORLD_HEIGHT - Math.abs(s.y - c.y));
      return dx + dy < minSpacing;
    });
    if (tooClose) continue;
    selected.push(c);
    used.add(tk);
  }

  const docks: Dock[] = selected.map((s, i) => ({
    dockId: `dock-${i}`,
    tileKey: key(s.x, s.y),
    pairedDockId: "",
    cooldownUntil: 0
  }));

  for (let i = 0; i < selected.length; i += 1) {
    const a = selected[i]!;
    let bestIdx = -1;
    let bestDist = Number.POSITIVE_INFINITY;
    for (let j = 0; j < selected.length; j += 1) {
      if (i === j) continue;
      const b = selected[j]!;
      if (a.componentId === b.componentId) continue;
      const dx = Math.min(Math.abs(a.seaX - b.seaX), WORLD_WIDTH - Math.abs(a.seaX - b.seaX));
      const dy = Math.min(Math.abs(a.seaY - b.seaY), WORLD_HEIGHT - Math.abs(a.seaY - b.seaY));
      const dist = dx + dy;
      if (dist < bestDist) {
        bestDist = dist;
        bestIdx = j;
      }
    }
    if (bestIdx === -1) {
      // Fallback: if all candidates ended up on one continent, keep local nearest to avoid empty pairing.
      for (let j = 0; j < selected.length; j += 1) {
        if (i === j) continue;
        const b = selected[j]!;
        const dx = Math.min(Math.abs(a.seaX - b.seaX), WORLD_WIDTH - Math.abs(a.seaX - b.seaX));
        const dy = Math.min(Math.abs(a.seaY - b.seaY), WORLD_HEIGHT - Math.abs(a.seaY - b.seaY));
        const dist = dx + dy;
        if (dist < bestDist) {
          bestDist = dist;
          bestIdx = j;
        }
      }
    }
    if (bestIdx === -1) continue;
    docks[i]!.pairedDockId = docks[bestIdx]!.dockId;
  }

  for (const d of docks) {
    if (!d.pairedDockId) continue;
    docksByTile.set(d.tileKey, d);
    dockById.set(d.dockId, d);
  }
};

const townBaseIncomeByType: Record<"MARKET" | "FARMING" | "ANCIENT", number> = {
  MARKET: 4,
  FARMING: 4,
  ANCIENT: 4
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
  const target = Math.max(45, Math.floor(120 * worldScale));
  const minSpacing = Math.max(5, Math.floor(Math.min(WORLD_WIDTH, WORLD_HEIGHT) * 0.018));
  const placed: Array<{ x: number; y: number }> = [];
  for (let i = 0; i < 120_000 && placed.length < target; i += 1) {
    const x = Math.floor(seeded01(i * 13, i * 17, seed + 9301) * WORLD_WIDTH);
    const y = Math.floor(seeded01(i * 19, i * 23, seed + 9311) * WORLD_HEIGHT);
    if (terrainAt(x, y) !== "LAND") continue;
    if (docksByTile.has(key(x, y))) continue;
    const tooClose = placed.some((p) => {
      const dx = Math.min(Math.abs(p.x - x), WORLD_WIDTH - Math.abs(p.x - x));
      const dy = Math.min(Math.abs(p.y - y), WORLD_HEIGHT - Math.abs(p.y - y));
      return dx + dy < minSpacing;
    });
    if (tooClose) continue;
    placed.push({ x, y });
    const tk = key(x, y);
    townsByTile.set(tk, { townId: `town-${townsByTile.size}`, tileKey: tk, type: townTypeAt(x, y) });
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
        townsByTile.set(tk, { townId: `town-${townsByTile.size}`, tileKey: tk, type: townTypeAt(picked.x, picked.y) });
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

const townIncomeForOwner = (town: TownDefinition, ownerId: string | undefined): number => {
  if (!ownerId) return 0;
  if (ownership.get(town.tileKey) !== ownerId) return 0;
  if (ownershipStateByTile.get(town.tileKey) !== "SETTLED") return 0;
  const base = townBaseIncomeByType[town.type] ?? 0;
  const { supportCurrent, supportMax } = townSupport(town.tileKey, ownerId);
  const ratio = supportMax <= 0 ? 1 : supportCurrent / supportMax;
  const upkeepCoverage = foodUpkeepCoverageByPlayer.get(ownerId) ?? 1;
  return base * (0.35 + 0.65 * ratio) * upkeepCoverage;
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
    ensureInterestCoverage(seed);
    if (!worldLooksBland()) return seed;
    seed = Math.floor(seeded01(seed + i * 101, seed + i * 137, seed + 9001) * 1_000_000_000);
  }
  return seed;
};

const dockLinkedDestinations = (fromDock: Dock): Dock[] => {
  const out: Dock[] = [];
  const seen = new Set<string>();
  const direct = dockById.get(fromDock.pairedDockId);
  if (direct) {
    out.push(direct);
    seen.add(direct.dockId);
  }
  // Bidirectional hub travel: if other docks point to this dock, this dock can travel back to them.
  for (const d of dockById.values()) {
    if (d.dockId === fromDock.dockId) continue;
    if (d.pairedDockId !== fromDock.dockId) continue;
    if (seen.has(d.dockId)) continue;
    out.push(d);
    seen.add(d.dockId);
  }
  return out;
};

const validDockCrossingTarget = (fromDock: Dock, toX: number, toY: number): boolean => {
  const linked = dockLinkedDestinations(fromDock);
  for (const targetDock of linked) {
    const [px, py] = parseKey(targetDock.tileKey);
    if (toX === px && toY === py) return true;
    if (isAdjacentTile(px, py, toX, toY)) return true;
  }
  return false;
};

const findOwnedDockOriginForCrossing = (actor: Player, toX: number, toY: number): Tile | undefined => {
  for (const tk of actor.territoryTiles) {
    const dock = docksByTile.get(tk);
    if (!dock) continue;
    const [x, y] = parseKey(tk);
    const t = playerTile(x, y);
    if (t.ownerId !== actor.id || t.terrain !== "LAND") continue;
    if (validDockCrossingTarget(dock, toX, toY)) return t;
  }
  return undefined;
};

const cardinalNeighbors = (x: number, y: number): Tile[] => [
  playerTile(x, y - 1),
  playerTile(x + 1, y),
  playerTile(x, y + 1),
  playerTile(x - 1, y)
];

const isOccupiedPlayerTile = (tile: Tile): boolean => {
  if (!tile.ownerId) return false;
  if (tile.ownerId === BARBARIAN_OWNER_ID) return false;
  const state = tile.ownershipState ?? "SETTLED";
  return state === "FRONTIER" || state === "SETTLED";
};

const isValuableTile = (tile: Tile): boolean =>
  Boolean(tile.resource || tile.town || tile.fort || tile.siegeOutpost || tile.dockId);

const getBarbarianTargetPriority = (tile: Tile): number | null => {
  if (tile.terrain !== "LAND") return null;
  if (!isOccupiedPlayerTile(tile)) return null;
  const state = tile.ownershipState ?? "SETTLED";
  const valuable = isValuableTile(tile);
  if (state === "FRONTIER") return valuable ? 1 : 2;
  return valuable ? 3 : 4;
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
    console.info("barbarian event", { type: "SPAWN", reason: "maintenance", x, y, timestamp: now() });
  }
};

const getBarbarianProgressGain = (tile: Tile): number => (isOccupiedPlayerTile(tile) && isValuableTile(tile) ? 2 : 1);

const barbarianDefenseScore = (tile: Tile): number => {
  if (!tile.ownerId || tile.ownerId === BARBARIAN_OWNER_ID) return 0;
  const defender = players.get(tile.ownerId);
  if (!defender) return 10;
  const tk = key(tile.x, tile.y);
  const fortOnTarget = fortsByTile.get(tk);
  const fortMult = fortOnTarget?.status === "active" && fortOnTarget.ownerId === defender.id ? FORT_DEFENSE_MULT : 1;
  const dockMult = docksByTile.has(tk) ? DOCK_DEFENSE_MULT : 1;
  return 10 * defender.mods.defense * playerDefensiveness(defender) * fortMult * dockMult;
};

const chooseBarbarianTarget = (agent: BarbarianAgent): Tile | undefined => {
  const candidates = cardinalNeighbors(agent.x, agent.y)
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
  for (const d of dockById.values()) {
    const pair = dockById.get(d.pairedDockId);
    if (!pair) continue;
    const [ax, ay] = parseKey(d.tileKey);
    const [bx, by] = parseKey(pair.tileKey);
    out.push({ ax, ay, bx, by });
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
  tileYieldByTile.clear();
  ownership.clear();
  ownershipStateByTile.clear();
  barbarianAgents.clear();
  barbarianAgentByTileKey.clear();
  combatLocks.clear();
  allianceRequests.clear();
  repeatFights.clear();
  collectVisibleCooldownByPlayer.clear();
  for (const t of fortBuildTimers.values()) clearTimeout(t);
  fortBuildTimers.clear();
  fortsByTile.clear();
  for (const t of siegeOutpostBuildTimers.values()) clearTimeout(t);
  siegeOutpostBuildTimers.clear();
  siegeOutpostsByTile.clear();
  defensiveFortifyByTile.clear();
  scoutPulsesByPlayer.clear();
  revealedEmpireTargetsByPlayer.clear();
  breachShockByTile.clear();
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
    dynamicMissionsByPlayer.set(p.id, []);
    temporaryAttackBuffUntilByPlayer.delete(p.id);
    temporaryIncomeBuffUntilByPlayer.delete(p.id);
    forcedRevealTilesByPlayer.set(p.id, new Set<TileKey>());
    revealedEmpireTargetsByPlayer.set(p.id, new Set<string>());
    playerBaseMods.set(p.id, { attack: 1, defense: 1, income: 1, vision: 1 });
    domainEffectsByPlayer.set(p.id, { revealUpkeepMult: 1, revealCapacityBonus: 0 });
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
  seasonArchives.push({
    seasonId: activeSeason.seasonId,
    endedAt,
    mostTerritory: topBy((p) => p.T),
    mostPoints: topBy((p) => p.points),
    longestSurvivalMs: topBy((p) => Math.max(0, endedAt - p.lastActiveAt))
  });
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

const playerTile = (x: number, y: number): Tile => {
  const wx = wrapX(x, WORLD_WIDTH);
  const wy = wrapY(y, WORLD_HEIGHT);
  const terrain = terrainAt(wx, wy);
  const baseResource = resourceAt(wx, wy);
  const resource = applyClusterResources(wx, wy, baseResource);
  const ownerId = ownership.get(key(wx, wy));
  const ownershipState = ownershipStateByTile.get(key(wx, wy));
  const clusterId = clusterByTile.get(key(wx, wy));
  const clusterType = clusterId ? clustersById.get(clusterId)?.clusterType : undefined;
  const dock = docksByTile.get(key(wx, wy));
  const town = townsByTile.get(key(wx, wy));
  const fort = fortsByTile.get(key(wx, wy));
  const siegeOutpost = siegeOutpostsByTile.get(key(wx, wy));
  const breachShock = breachShockByTile.get(key(wx, wy));
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
  }
  if (continentId !== undefined) tile.continentId = continentId;
  if (regionType) (tile as Tile & { regionType?: string }).regionType = regionType;
  if (clusterId) tile.clusterId = clusterId;
  if (clusterType) tile.clusterType = clusterType;
  if (dock) tile.dockId = dock.dockId;
  if (breachShock && breachShock.expiresAt > now() && ownerId === breachShock.ownerId) tile.breachShockUntil = breachShock.expiresAt;
  if (town) {
    const owner = ownerId;
    const baseGoldPerMinute = townBaseIncomeByType[town.type];
    const support = owner ? townSupport(town.tileKey, owner) : { supportCurrent: 0, supportMax: 0 };
    const goldPerMinute = townIncomeForOwner(town, owner);
    tile.town = {
      type: town.type,
      baseGoldPerMinute,
      supportCurrent: support.supportCurrent,
      supportMax: support.supportMax,
      goldPerMinute,
      foodUpkeepPerMinute: 0.025
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
  if (siegeOutpost) {
    const siegeView: { ownerId: string; status: "under_construction" | "active"; completesAt?: number } = {
      ownerId: siegeOutpost.ownerId,
      status: siegeOutpost.status
    };
    if (siegeOutpost.status === "under_construction") siegeView.completesAt = siegeOutpost.completesAt;
    tile.siegeOutpost = siegeView;
  }
  const yieldBuf = tileYieldByTile.get(key(wx, wy));
  if (ownerId && ownershipState === "SETTLED" && terrain === "LAND") {
    const goldPerMinuteFromTile =
      ((resource ? resourceRate[resource] : 0) + (dock ? DOCK_INCOME_PER_MIN : 0) + (town ? townIncomeForOwner(town, ownerId) : 0)) *
      (players.get(ownerId)?.mods.income ?? 1) *
      PASSIVE_INCOME_MULT *
      HARVEST_GOLD_RATE_MULT;
    const strategicPerDay: Partial<Record<StrategicResource, number>> = {};
    const sr = toStrategicResource(resource);
    if (sr && resource) {
      const mult = activeResourceIncomeMult(ownerId, resource);
      strategicPerDay[sr] = (strategicDailyFromResource[resource] ?? 0) * mult;
    }
    if (town?.type === "ANCIENT") {
      strategicPerDay.SHARD = (strategicPerDay.SHARD ?? 0) + strategicResourceRates.SHARD;
    }
    (tile as Tile & { yieldRate?: { goldPerMinute?: number; strategicPerDay?: Partial<Record<StrategicResource, number>> } }).yieldRate = {
      goldPerMinute: Number(goldPerMinuteFromTile.toFixed(4)),
      strategicPerDay
    };
  }
  (tile as Tile & { yieldCap?: { gold: number; strategicEach: number } }).yieldCap = {
    gold: TILE_YIELD_CAP_GOLD,
    strategicEach: TILE_YIELD_CAP_RESOURCE
  };
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

const activeScoutPulsesForPlayer = (playerId: string, nowMs: number): ScoutPulse[] => {
  const pulses = scoutPulsesByPlayer.get(playerId);
  if (!pulses || pulses.length === 0) return [];
  let writeIndex = 0;
  for (let readIndex = 0; readIndex < pulses.length; readIndex += 1) {
    const pulse = pulses[readIndex]!;
    if (pulse.expiresAt <= nowMs) continue;
    pulses[writeIndex] = pulse;
    writeIndex += 1;
  }
  if (writeIndex !== pulses.length) pulses.length = writeIndex;
  if (writeIndex === 0) {
    scoutPulsesByPlayer.delete(playerId);
    return [];
  }
  return pulses;
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

const getDomainEffectsForPlayer = (playerId: string): { revealUpkeepMult: number; revealCapacityBonus: number } => {
  const existing = domainEffectsByPlayer.get(playerId);
  if (existing) return existing;
  const base = { revealUpkeepMult: 1, revealCapacityBonus: 0 };
  domainEffectsByPlayer.set(playerId, base);
  return base;
};

const recomputeDomainEffectsForPlayer = (player: Player): void => {
  const next = { revealUpkeepMult: 1, revealCapacityBonus: 0 };
  for (const id of player.domainIds) {
    const d = domainById.get(id);
    if (!d?.effects) continue;
    if (typeof d.effects.revealUpkeepMult === "number") next.revealUpkeepMult *= d.effects.revealUpkeepMult;
    if (typeof d.effects.revealCapacityBonus === "number") next.revealCapacityBonus += d.effects.revealCapacityBonus;
  }
  domainEffectsByPlayer.set(player.id, next);
};

const revealCapacityForPlayer = (player: Player): number => {
  let cap = 1;
  if (player.techIds.has("grand-cartography")) cap += 1;
  cap += getDomainEffectsForPlayer(player.id).revealCapacityBonus;
  return Math.max(0, cap);
};

const getOrInitRevealTargets = (playerId: string): Set<string> => {
  let set = revealedEmpireTargetsByPlayer.get(playerId);
  if (!set) {
    set = new Set<string>();
    revealedEmpireTargetsByPlayer.set(playerId, set);
  }
  return set;
};

const upkeepPerMinuteForPlayer = (player: Player): {
  food: number;
  iron: number;
  supply: number;
  crystal: number;
  gold: number;
} => {
  const settledTiles = [...player.territoryTiles].filter((tk) => ownershipStateByTile.get(tk) === "SETTLED").length;
  let townCount = 0;
  let fortCount = 0;
  let outpostCount = 0;
  for (const tk of player.territoryTiles) {
    if (ownershipStateByTile.get(tk) !== "SETTLED") continue;
    if (townsByTile.has(tk)) townCount += 1;
    const fort = fortsByTile.get(tk);
    if (fort?.ownerId === player.id && fort.status === "active") fortCount += 1;
    const siege = siegeOutpostsByTile.get(tk);
    if (siege?.ownerId === player.id && siege.status === "active") outpostCount += 1;
  }
  const activeRevealCount = getOrInitRevealTargets(player.id).size;
  const revealUpkeepMult = getDomainEffectsForPlayer(player.id).revealUpkeepMult;
  return {
    // 0.25 / 10 min per town, and 0.25 / 10 min per 40 settled.
    food: townCount * 0.025 + (settledTiles / 40) * 0.025,
    // 0.25 / 10 min per fort.
    iron: fortCount * 0.025,
    // 0.25 / 10 min per outpost.
    supply: outpostCount * 0.025,
    // 0.25 / 10 min for each active empire reveal.
    crystal: activeRevealCount * REVEAL_EMPIRE_UPKEEP_PER_MIN * revealUpkeepMult,
    // 2 gold / 10 min per fort + 2 gold / 10 min per outpost + settled gold upkeep 1 / 10 min / 40 settled.
    gold: fortCount * 0.2 + outpostCount * 0.2 + (settledTiles / 40) * 0.1
  };
};

const applyUpkeepForPlayer = (player: Player): { touchedTileKeys: Set<TileKey> } => {
  const stock = getOrInitStrategicStocks(player.id);
  const upkeep = upkeepPerMinuteForPlayer(player);
  const touchedTileKeys = new Set<TileKey>();
  const diag = emptyUpkeepDiagnostics();

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
  diag.foodCoverage = diag.food.need <= 0 ? 1 : Math.max(0, Math.min(1, (diag.food.fromYield + diag.food.fromStock) / diag.food.need));
  foodUpkeepCoverageByPlayer.set(player.id, diag.foodCoverage);

  if (diag.crystal.need > 0 && diag.crystal.remaining > 0) {
    const activeReveals = revealedEmpireTargetsByPlayer.get(player.id);
    if (activeReveals && activeReveals.size > 0) {
      activeReveals.clear();
      sendToPlayer(player.id, { type: "REVEAL_EMPIRE_UPDATE", activeTargets: [] });
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
  if (goldDelta > 0) y.gold = Math.min(TILE_YIELD_CAP_GOLD, y.gold + goldDelta);
  if (strategicDelta) {
    for (const [r, v] of Object.entries(strategicDelta) as Array<[StrategicResource, number]>) {
      if (v <= 0) continue;
      y.strategic[r] = Math.min(TILE_YIELD_CAP_RESOURCE, (y.strategic[r] ?? 0) + v);
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

const activeResourceIncomeMult = (playerId: string, resource: ResourceType): number => {
  const buff = temporaryIncomeBuffUntilByPlayer.get(playerId);
  if (!buff || buff.until <= now()) return 1;
  return buff.resources.includes(resource) ? RESOURCE_CHAIN_MULT : 1;
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
  if (DISABLE_FOG || fogDisabledByPlayer.get(p.id) === true) return true;
  const forced = forcedRevealTilesByPlayer.get(p.id);
  if (forced?.has(key(wrapX(x, WORLD_WIDTH), wrapY(y, WORLD_HEIGHT)))) return true;
  const activePulses = activeScoutPulsesForPlayer(p.id, now());
  for (const pulse of activePulses) {
    const dx = Math.min(Math.abs(pulse.x - x), WORLD_WIDTH - Math.abs(pulse.x - x));
    const dy = Math.min(Math.abs(pulse.y - y), WORLD_HEIGHT - Math.abs(pulse.y - y));
    if (dx <= SCOUT_PULSE_RADIUS && dy <= SCOUT_PULSE_RADIUS) return true;
  }

  const revealTargets = revealedEmpireTargetsByPlayer.get(p.id);
  if (revealTargets && revealTargets.size > 0) {
    const t = playerTile(x, y);
    if (t.ownerId && revealTargets.has(t.ownerId)) return true;
  }
  const radius = Math.max(1, Math.floor(VISION_RADIUS * p.mods.vision));
  for (const k of p.territoryTiles) {
    const [tx, ty] = parseKey(k);
    const dx = Math.min(Math.abs(tx - x), WORLD_WIDTH - Math.abs(tx - x));
    const dy = Math.min(Math.abs(ty - y), WORLD_HEIGHT - Math.abs(ty - y));
    if (dx <= radius && dy <= radius) return true;
  }
  return false;
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

const refreshSubscribedViewForPlayer = (playerId: string): void => {
  const ws = socketsByPlayer.get(playerId);
  const p = players.get(playerId);
  const sub = chunkSubscriptionByPlayer.get(playerId);
  if (!ws || ws.readyState !== ws.OPEN || !p || !sub) return;
  sendChunkSnapshot(ws, p, sub);
};

const sendPlayerUpdate = (p: Player, incomeDelta: number): void => {
  const ws = socketsByPlayer.get(p.id);
  if (!ws || ws.readyState !== ws.OPEN) return;
  const strategicStocks = getOrInitStrategicStocks(p.id);
  const strategicProduction = strategicProductionPerMinute(p);
  const upkeepDiag = lastUpkeepByPlayer.get(p.id) ?? emptyUpkeepDiagnostics();
  const upkeepNeed = upkeepPerMinuteForPlayer(p);
  ws.send(
    JSON.stringify({
      type: "PLAYER_UPDATE",
      gold: p.points,
      points: p.points,
      level: p.level,
      mods: p.mods,
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
      domainIds: [...p.domainIds],
      domainChoices: reachableDomains(p),
      domainCatalog: activeDomainCatalog(p),
      revealCapacity: revealCapacityForPlayer(p),
      activeRevealTargets: [...getOrInitRevealTargets(p.id)],
      missions: missionPayload(p),
      leaderboard: leaderboardSnapshot(p)
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
  for (const r of ["FOOD", "IRON", "CRYSTAL", "SUPPLY", "SHARD"] as const) {
    const amt = Math.floor((y.strategic[r] ?? 0) * 100) / 100;
    if (amt <= 0) continue;
    stock[r] += amt;
    out.strategic[r] = amt;
    y.strategic[r] = 0;
  }
  const hasRemaining = y.gold > 0 || (Object.values(y.strategic) as number[]).some((v) => v > 0);
  if (!hasRemaining) tileYieldByTile.delete(tk);
  return out;
};

const collectVisibleYield = (
  player: Player
): { tiles: number; gold: number; strategic: Record<StrategicResource, number>; touchedTileKeys: TileKey[] } => {
  const sub = chunkSubscriptionByPlayer.get(player.id);
  const out = { tiles: 0, gold: 0, strategic: emptyStrategicStocks(), touchedTileKeys: [] as TileKey[] };
  if (!sub) return out;
  const visited = new Set<TileKey>();
  for (let cy = sub.cy - sub.radius; cy <= sub.cy + sub.radius; cy += 1) {
    for (let cx = sub.cx - sub.radius; cx <= sub.cx + sub.radius; cx += 1) {
      const worldCx = wrapChunkX(cx);
      const worldCy = wrapChunkY(cy);
      const startX = worldCx * CHUNK_SIZE;
      const startY = worldCy * CHUNK_SIZE;
      for (let y = startY; y < startY + CHUNK_SIZE; y += 1) {
        for (let x = startX; x < startX + CHUNK_SIZE; x += 1) {
          const wx = wrapX(x, WORLD_WIDTH);
          const wy = wrapY(y, WORLD_HEIGHT);
          if (!visible(player, wx, wy)) continue;
          const tk = key(wx, wy);
          if (visited.has(tk)) continue;
          visited.add(tk);
          const got = collectYieldFromTile(player, tk);
          const touched = got.gold > 0 || (Object.values(got.strategic) as number[]).some((v) => v > 0);
          if (!touched) continue;
          out.tiles += 1;
          out.gold += got.gold;
          out.touchedTileKeys.push(tk);
          for (const r of ["FOOD", "IRON", "CRYSTAL", "SUPPLY", "SHARD"] as const) out.strategic[r] += got.strategic[r] ?? 0;
        }
      }
    }
  }
  if (out.gold > 0) recalcPlayerDerived(player);
  return out;
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
  if (!defenderId || defenderId === BARBARIAN_OWNER_ID) {
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
  console.info("barbarian event", { type: "ATTACK_START", barbarianId: agent.id, x: currentTile.x, y: currentTile.y, targetX: target.x, targetY: target.y, timestamp: now() });
  pending.timeout = setTimeout(() => {
    if (pending.cancelled) return;
    combatLocks.delete(currentKey);
    combatLocks.delete(targetKey);
    const live = barbarianAgents.get(agent.id);
    if (!live) return;
    const liveTile = playerTile(live.x, live.y);
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
    const fortOnTarget = fortsByTile.get(targetKey);
    const fortMult = fortOnTarget?.status === "active" && fortOnTarget.ownerId === defender.id ? FORT_DEFENSE_MULT : 1;
    const dockMult = docksByTile.has(targetKey) ? DOCK_DEFENSE_MULT : 1;
    const atkEff = 10 * BARBARIAN_ATTACK_POWER * randomFactor();
    const defEff = 10 * BARBARIAN_DEFENSE_POWER * defender.mods.defense * playerDefensiveness(defender) * shockMult * fortMult * dockMult * randomFactor();
    const win = Math.random() < combatWinChance(atkEff, defEff);
    const progressBefore = live.progress;
    if (!win) {
      live.lastActionAt = now();
      live.nextActionAt = now() + BARBARIAN_ACTION_INTERVAL_MS;
      upsertBarbarianAgent(live);
      console.info("barbarian event", { type: "ATTACK_LOSS", barbarianId: live.id, x: live.x, y: live.y, targetX: target.x, targetY: target.y, timestamp: now() });
      return;
    }
    const gain = getBarbarianProgressGain(currentTarget);
    live.progress += gain;
    console.info(
      "barbarian event",
      { type: "PROGRESS_GAIN", barbarianId: live.id, x: live.x, y: live.y, targetX: target.x, targetY: target.y, progressBefore, progressAfter: live.progress, timestamp: now() },
    );
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
      console.info("barbarian event", { type: "MULTIPLY", barbarianId: live.id, x: live.x, y: live.y, targetX: target.x, targetY: target.y, timestamp: now() });
    } else {
      updateOwnership(oldX, oldY, undefined);
    }
    live.lastActionAt = now();
    live.nextActionAt = now() + BARBARIAN_ACTION_INTERVAL_MS;
    upsertBarbarianAgent(live);
    recalcPlayerDerived(defender);
    updateMissionState(defender);
    resolveEliminationIfNeeded(defender, socketsByPlayer.has(defender.id));
    console.info("barbarian event", { type: "ATTACK_WIN", barbarianId: live.id, x: live.x, y: live.y, targetX: target.x, targetY: target.y, timestamp: now() });
  }, COMBAT_LOCK_MS);
};

const runBarbarianTick = (): void => {
  const current = [...barbarianAgents.values()];
  for (const agent of current) {
    const live = barbarianAgents.get(agent.id);
    if (!live) continue;
    if (now() < live.nextActionAt) continue;
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
    const self = playerTile(x, y);
    if (self.ownerId !== p.id || self.terrain !== "LAND") continue;
    T += 1;
    const n = [
      playerTile(x, y - 1),
      playerTile(x + 1, y),
      playerTile(x, y + 1),
      playerTile(x - 1, y)
    ];
    for (const tile of n) {
      if (tile.terrain !== "LAND") continue;
      if (tile.ownerId === p.id) continue;
      if (tile.ownerId && p.allies.has(tile.ownerId)) continue;
      E += 1;
    }

    if (self.ownershipState !== "SETTLED") continue;
    Ts += 1;
    for (const tile of n) {
      if (tile.terrain !== "LAND") continue;
      const isSameOrAllied = tile.ownerId === p.id || Boolean(tile.ownerId && p.allies.has(tile.ownerId));
      if (isSameOrAllied && tile.ownershipState === "SETTLED") continue;
      Es += 1;
    }
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

const exportPlayerStyles = (): Array<{ id: string; name: string; tileColor?: string }> => {
  return [...players.values()].map((p) => {
    const out: { id: string; name: string; tileColor?: string } = { id: p.id, name: p.name };
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
const chunkDist = (a: number, b: number, mod: number): number => {
  const d = Math.abs(a - b);
  return Math.min(d, mod - d);
};

interface VisibilitySnapshot {
  allVisible: boolean;
  visibleIndexes: Set<number>;
}

const buildVisibilitySnapshot = (p: Player): VisibilitySnapshot => {
  if (DISABLE_FOG || fogDisabledByPlayer.get(p.id) === true) {
    return { allVisible: true, visibleIndexes: new Set<number>() };
  }

  const visibleIndexes = new Set<number>();
  const forced = forcedRevealTilesByPlayer.get(p.id);
  if (forced) {
    for (const tk of forced) {
      const [fx, fy] = parseKey(tk);
      visibleIndexes.add(tileIndex(fx, fy));
    }
  }

  const activePulses = activeScoutPulsesForPlayer(p.id, now());
  for (const pulse of activePulses) {
    for (let dy = -SCOUT_PULSE_RADIUS; dy <= SCOUT_PULSE_RADIUS; dy += 1) {
      for (let dx = -SCOUT_PULSE_RADIUS; dx <= SCOUT_PULSE_RADIUS; dx += 1) {
        const px = wrapX(pulse.x + dx, WORLD_WIDTH);
        const py = wrapY(pulse.y + dy, WORLD_HEIGHT);
        visibleIndexes.add(tileIndex(px, py));
      }
    }
  }

  const revealTargets = revealedEmpireTargetsByPlayer.get(p.id);
  if (revealTargets && revealTargets.size > 0) {
    for (const targetId of revealTargets) {
      const target = players.get(targetId);
      if (!target) continue;
      for (const tk of target.territoryTiles) {
        const [rx, ry] = parseKey(tk);
        visibleIndexes.add(tileIndex(rx, ry));
      }
    }
  }

  const radius = Math.max(1, Math.floor(VISION_RADIUS * p.mods.vision));
  for (const tk of p.territoryTiles) {
    const [tx, ty] = parseKey(tk);
    for (let dy = -radius; dy <= radius; dy += 1) {
      for (let dx = -radius; dx <= radius; dx += 1) {
        const vx = wrapX(tx + dx, WORLD_WIDTH);
        const vy = wrapY(ty + dy, WORLD_HEIGHT);
        visibleIndexes.add(tileIndex(vx, vy));
      }
    }
  }

  return { allVisible: false, visibleIndexes };
};

const visibleInSnapshot = (snapshot: VisibilitySnapshot, x: number, y: number): boolean => {
  if (snapshot.allVisible) return true;
  return snapshot.visibleIndexes.has(tileIndex(x, y));
};

const sendChunkSnapshot = (socket: Ws, actor: Player, sub: { cx: number; cy: number; radius: number }): void => {
  const startedAt = now();
  const snapshot = buildVisibilitySnapshot(actor);
  const updates: Tile[] = [];
  const fallbackLastChangedAt = now();
  let chunkCount = 0;
  let tileCount = 0;

  for (let cy = sub.cy - sub.radius; cy <= sub.cy + sub.radius; cy += 1) {
    for (let cx = sub.cx - sub.radius; cx <= sub.cx + sub.radius; cx += 1) {
      const worldCx = wrapChunkX(cx);
      const worldCy = wrapChunkY(cy);
      const startX = worldCx * CHUNK_SIZE;
      const startY = worldCy * CHUNK_SIZE;

      for (let y = startY; y < startY + CHUNK_SIZE; y += 1) {
        for (let x = startX; x < startX + CHUNK_SIZE; x += 1) {
          tileCount += 1;
          const wx = wrapX(x, WORLD_WIDTH);
          const wy = wrapY(y, WORLD_HEIGHT);
          const tk = key(wx, wy);
          if (visibleInSnapshot(snapshot, wx, wy)) {
            const tile = playerTile(wx, wy);
            tile.fogged = false;
            updates.push(tile);
          } else {
            const fogTile: Tile = {
              x: wx,
              y: wy,
              terrain: terrainAt(wx, wy),
              fogged: true,
              lastChangedAt: fallbackLastChangedAt
            };
            const dock = docksByTile.get(tk);
            const clusterId = clusterByTile.get(tk);
            const clusterType = clusterId ? clustersById.get(clusterId)?.clusterType : undefined;
            if (dock) fogTile.dockId = dock.dockId;
            if (clusterId) fogTile.clusterId = clusterId;
            if (clusterType) fogTile.clusterType = clusterType;
            updates.push(fogTile);
          }
        }
      }

      socket.send(JSON.stringify({ type: "CHUNK_FULL", cx: worldCx, cy: worldCy, tilesMaskedByFog: updates }));
      updates.length = 0;
      chunkCount += 1;
    }
  }

  const elapsed = now() - startedAt;
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

const maybeIssueVendettaMission = (player: Player, targetPlayerId: string): void => {
  const missions = getOrInitDynamicMissions(player.id);
  if (missions.some((m) => m.type === "VENDETTA" && m.expiresAt > now() && !m.rewarded)) return;
  missions.push({
    id: `dyn-vendetta-${now()}`,
    type: "VENDETTA",
    targetPlayerId,
    expiresAt: now() + DYNAMIC_MISSION_MS,
    completed: false,
    rewarded: false
  });
};

const maybeIssueDockMission = (player: Player): void => {
  const missions = getOrInitDynamicMissions(player.id);
  if (missions.some((m) => m.type === "DOCK_HUNT" && m.expiresAt > now() && !m.rewarded)) return;
  if (ownedDockCount(player.id) > 0) return;
  if (player.missionStats.neutralCaptures < 18) return;
  missions.push({
    id: `dyn-dock-${now()}`,
    type: "DOCK_HUNT",
    targetDockCount: 1,
    expiresAt: now() + DYNAMIC_MISSION_MS,
    completed: false,
    rewarded: false
  });
};

const maybeIssueResourceMission = (player: Player, captured?: ResourceType): void => {
  if (!captured) return;
  const missions = getOrInitDynamicMissions(player.id);
  if (missions.some((m) => m.type === "RESOURCE_CHAIN" && m.expiresAt > now() && !m.rewarded)) return;
  const pool = (["FARM", "FISH", "IRON", "GEMS", "FUR", "WOOD"] as const).filter(
    (r): r is ResourceType => r !== captured
  );
  if (pool.length < 2) return;
  const a = pool[Math.floor(seeded01(now(), player.points, player.level + 17) * pool.length)]!;
  const b = pool[Math.floor(seeded01(now() + 97, player.points + 41, player.level + 71) * pool.length)]!;
  const pair: [ResourceType, ResourceType] = a === b ? [a, pool[(pool.indexOf(a) + 1) % pool.length]!] : [a, b];
  missions.push({
    id: `dyn-resource-${now()}`,
    type: "RESOURCE_CHAIN",
    focusResources: pair,
    expiresAt: now() + DYNAMIC_MISSION_MS,
    completed: false,
    rewarded: false
  });
};

const dynamicMissionPayload = (player: Player): MissionState[] => {
  const missions = getOrInitDynamicMissions(player.id);
  const out: MissionState[] = [];
  for (let i = missions.length - 1; i >= 0; i -= 1) {
    const m = missions[i]!;
    if (m.expiresAt <= now()) {
      missions.splice(i, 1);
      continue;
    }
    const { progress, target } = dynamicMissionProgress(player, m);
    m.completed = progress >= target;
    if (m.completed && !m.rewarded) applyDynamicMissionReward(player, m);
    if (m.type === "VENDETTA") {
      out.push({
        id: m.id,
        kind: "ENEMY_CAPTURES",
        name: "War Council: Finish Them",
        description: `After your recent victory, your people demand total defeat of that rival. Capture ${target} tiles from that empire before the week ends.`,
        unlockPoints: 0,
        target,
        progress,
        rewardPoints: 0,
        rewardLabel: "Reward: +15% attack for 24h",
        expiresAt: m.expiresAt,
        completed: m.completed,
        claimed: m.rewarded
      });
    } else if (m.type === "DOCK_HUNT") {
      out.push({
        id: m.id,
        kind: "CONTINENTS_HELD",
        name: "Expedition Charter",
        description: "Your explorers ask for a sea bridge. Capture a dock this week to open new routes.",
        unlockPoints: 0,
        target,
        progress,
        rewardPoints: 0,
        rewardLabel: "Reward: reveal 3 additional docks",
        expiresAt: m.expiresAt,
        completed: m.completed,
        claimed: m.rewarded
      });
    } else {
      const pair = m.focusResources ?? ["IRON", "GEMS"];
      out.push({
        id: m.id,
        kind: "FARMS_HELD",
        name: "Resource Fever",
        description: `Your people want more supply: control 8 ${pair[0]} and 8 ${pair[1]} before expiry.`,
        unlockPoints: 0,
        target: 16,
        progress,
        rewardPoints: 0,
        rewardLabel: `Reward: +40% ${pair[0]} & ${pair[1]} resource income for 24h`,
        expiresAt: m.expiresAt,
        completed: m.completed,
        claimed: m.rewarded
      });
    }
  }
  return out;
};

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

const syncMissionProgress = (player: Player): boolean => {
  ensureMissionDefaults(player);
  let changed = false;
  for (const m of player.missions) {
    const nextProgress = Math.min(m.target, missionProgressValue(player, m.kind));
    if (nextProgress !== m.progress) {
      m.progress = nextProgress;
      changed = true;
    }
    if (!m.completed && m.progress >= m.target) {
      m.completed = true;
      changed = true;
    }
    if (m.completed && !m.claimed) {
      m.claimed = true;
      applyStaticMissionReward(player, m);
      player.points += m.rewardPoints;
      changed = true;
    }
  }
  return changed;
};

const unlockMissions = (player: Player): boolean => {
  ensureMissionDefaults(player);
  const existing = new Set(player.missions.map((m) => m.id));
  const completed = new Set(player.missions.filter((m) => m.claimed || m.completed).map((m) => m.id));
  let changed = false;
  for (const def of MISSION_DEFS) {
    if (existing.has(def.id)) continue;
    if (player.points < def.unlockPoints) continue;
    if (def.prerequisiteId && !completed.has(def.prerequisiteId)) continue;
    const state: MissionState = {
      ...def,
      progress: Math.min(def.target, missionProgressValue(player, def.kind)),
      completed: false,
      claimed: false
    };
    player.missions.push(state);
    changed = true;
  }
  return changed;
};

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
  const farms = getOrInitResourceCounts(player.id).FARM ?? 0;
  player.missionStats.maxTilesHeld = Math.max(player.missionStats.maxTilesHeld, player.T);
  player.missionStats.maxSettledTilesHeld = Math.max(player.missionStats.maxSettledTilesHeld, player.Ts);
  player.missionStats.maxFarmsHeld = Math.max(player.missionStats.maxFarmsHeld, farms);
  player.missionStats.maxContinentsHeld = Math.max(player.missionStats.maxContinentsHeld, continentsHeldCount(player));
  player.missionStats.maxTechPicks = Math.max(player.missionStats.maxTechPicks, player.techIds.size);
  const unlocked = unlockMissions(player);
  const progressed = syncMissionProgress(player);
  maybeIssueDockMission(player);
  dynamicMissionPayload(player);
  if (progressed) recalcPlayerDerived(player);
  return unlocked || progressed;
};

const missionPayload = (player: Player): MissionState[] => {
  ensureMissionDefaults(player);
  return [...player.missions.map((m) => ({ ...m })), ...dynamicMissionPayload(player)];
};

const leaderboardSnapshot = (
  _actor: Player,
  limitTop = 5
): {
  overall: Array<{ id: string; name: string; tiles: number; incomePerMinute: number; techs: number; score: number }>;
  byTiles: Array<{ id: string; name: string; value: number }>;
  byIncome: Array<{ id: string; name: string; value: number }>;
  byTechs: Array<{ id: string; name: string; value: number }>;
} => {
  const rows = [...players.values()].map((p) => ({
    id: p.id,
    name: p.name,
    tiles: p.T,
    incomePerMinute: currentIncomePerMinute(p),
    techs: p.techIds.size
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

const reachableTechs = (player: Player): string[] => {
  const initial = new Set<string>();
  if (player.techIds.size === 0) {
    for (const rootId of activeSeasonTechConfig.rootNodeIds) {
      if (!player.techIds.has(rootId)) initial.add(rootId);
    }
    return [...initial];
  }
  const out: string[] = [];
  for (const techId of player.techIds) {
    for (const child of childrenByTech.get(techId) ?? []) {
      if (!activeSeasonTechConfig.activeNodeIds.has(child)) continue;
      if (player.techIds.has(child)) continue;
      const childTech = techById.get(child);
      if (!childTech) continue;
      const prereqs = childTech.prereqIds && childTech.prereqIds.length > 0 ? childTech.prereqIds : childTech.requires ? [childTech.requires] : [];
      if (prereqs.every((req) => player.techIds.has(req))) out.push(child);
    }
  }
  return [...new Set(out)];
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
  for (const tk of player.territoryTiles) {
    if (ownershipStateByTile.get(tk) !== "SETTLED") continue;
    const [x, y] = parseKey(tk);
    const t = playerTile(x, y);
    if (t.resource === "IRON") hasIron = true;
    if (t.resource === "GEMS") hasCrystal = true;
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
  return DOMAINS.filter((d) => d.tier === targetTier && player.techIds.has(d.requiresTechId)).map((d) => d.id);
};

const activeDomainCatalog = (player?: Player): Array<{
  id: string;
  tier: number;
  name: string;
  description: string;
  requiresTechId: string;
  mods: Partial<Record<StatsModKey, number>>;
  effects?: { revealUpkeepMult?: number; revealCapacityBonus?: number };
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
      effects?: { revealUpkeepMult?: number; revealCapacityBonus?: number };
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

const isBorderTile = (x: number, y: number, ownerId: string): boolean => {
  const n = [
    playerTile(x, y - 1),
    playerTile(x + 1, y),
    playerTile(x, y + 1),
    playerTile(x - 1, y)
  ];
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

const consumeStrategicResource = (player: Player, resource: StrategicResource, amount: number): boolean => {
  const stock = getOrInitStrategicStocks(player.id);
  if ((stock[resource] ?? 0) < amount) return false;
  stock[resource] -= amount;
  return true;
};

const startSettlement = (
  actor: Player,
  x: number,
  y: number,
  opts?: { goldCost?: number; settleMs?: number; foodCost?: number; rapid?: boolean }
): { ok: boolean; reason?: string; resolvesAt?: number } => {
  const goldCost = opts?.goldCost ?? SETTLE_COST;
  const settleMs = opts?.settleMs ?? SETTLE_MS;
  const foodCost = opts?.foodCost ?? 0;
  const t = playerTile(x, y);
  if (t.terrain !== "LAND") return { ok: false, reason: "settlement requires land tile" };
  if (t.ownerId !== actor.id) return { ok: false, reason: "tile must be owned" };
  if (t.ownershipState !== "FRONTIER") return { ok: false, reason: "tile is already settled" };
  if (actor.points < goldCost) return { ok: false, reason: "insufficient gold to settle" };
  const stocks = getOrInitStrategicStocks(actor.id);
  if ((stocks.FOOD ?? 0) < foodCost) return { ok: false, reason: "insufficient FOOD for rapid settlement" };
  const tk = key(t.x, t.y);
  if (pendingSettlementsByTile.has(tk)) return { ok: false, reason: "tile already settling" };
  if (combatLocks.has(tk)) return { ok: false, reason: "tile is locked in combat" };

  actor.points -= goldCost;
  if (foodCost > 0) stocks.FOOD -= foodCost;
  recalcPlayerDerived(actor);
  const resolvesAt = now() + settleMs;
  const pending: PendingSettlement = {
    tileKey: tk,
    ownerId: actor.id,
    resolvesAt,
    cancelled: false
  };
  pendingSettlementsByTile.set(tk, pending);
  pending.timeout = setTimeout(() => {
    if (pending.cancelled) return;
    pendingSettlementsByTile.delete(tk);
    const live = playerTile(t.x, t.y);
    if (live.ownerId !== actor.id || live.ownershipState !== "FRONTIER") return;
    updateOwnership(t.x, t.y, actor.id, "SETTLED");
    sendToPlayer(actor.id, {
      type: "COMBAT_RESULT",
      winnerId: actor.id,
      changes: [{ x: t.x, y: t.y, ownerId: actor.id, ownershipState: "SETTLED" }],
      pointsDelta: 0,
      levelDelta: 0
    });
    sendPlayerUpdate(actor, 0);
    if (opts?.rapid) telemetryCounters.rapidSettlements += 1;
    else telemetryCounters.settlements += 1;
  }, settleMs);
  return { ok: true, resolvesAt };
};

const tryDefensiveFortify = (actor: Player, x: number, y: number): { ok: boolean; reason?: string } => {
  const t = playerTile(x, y);
  if (t.terrain !== "LAND") return { ok: false, reason: "target must be land" };
  if (t.ownerId !== actor.id) return { ok: false, reason: "target must be owned" };
  if (t.ownershipState !== "SETTLED") return { ok: false, reason: "target must be settled" };
  if (!consumeStrategicResource(actor, "SUPPLY", DEFENSIVE_FORTIFY_SUPPLY_COST)) {
    return { ok: false, reason: "insufficient SUPPLY" };
  }
  defensiveFortifyByTile.set(key(t.x, t.y), { ownerId: actor.id, expiresAt: now() + DEFENSIVE_FORTIFY_MS, consumed: false });
  telemetryCounters.defensiveFortifies += 1;
  return { ok: true };
};

const tryScoutPulse = (actor: Player, x: number, y: number): { ok: boolean; reason?: string } => {
  const t = playerTile(x, y);
  if (t.ownerId !== actor.id) return { ok: false, reason: "target must be your tile" };
  if (!visible(actor, t.x, t.y)) return { ok: false, reason: "target must be visible" };
  if (!consumeStrategicResource(actor, "CRYSTAL", SCOUT_PULSE_CRYSTAL_COST)) {
    return { ok: false, reason: "insufficient CRYSTAL" };
  }
  const pulses = scoutPulsesByPlayer.get(actor.id) ?? [];
  pulses.push({ ownerId: actor.id, x: t.x, y: t.y, expiresAt: now() + SCOUT_PULSE_MS });
  scoutPulsesByPlayer.set(actor.id, pulses);
  telemetryCounters.scoutPulses += 1;
  return { ok: true };
};

const hasRevealCapability = (player: Player): boolean => {
  if (player.domainIds.has("crystal-network") || player.domainIds.has("hidden-hand") || player.domainIds.has("oracle-state")) return true;
  if (player.techIds.has("cryptography") || player.techIds.has("grand-cartography")) return true;
  return false;
};

const tryActivateRevealEmpire = (actor: Player, targetPlayerId: string): { ok: boolean; reason?: string } => {
  if (!hasRevealCapability(actor)) return { ok: false, reason: "unlock reveal capability via tech/domain first" };
  if (targetPlayerId === actor.id) return { ok: false, reason: "cannot reveal yourself" };
  const target = players.get(targetPlayerId);
  if (!target) return { ok: false, reason: "target empire not found" };
  if (actor.allies.has(targetPlayerId)) return { ok: false, reason: "cannot reveal allied empire" };
  const reveals = getOrInitRevealTargets(actor.id);
  if (reveals.has(targetPlayerId)) return { ok: false, reason: "target already revealed" };
  const capacity = revealCapacityForPlayer(actor);
  if (reveals.size >= capacity) return { ok: false, reason: `reveal capacity reached (${capacity})` };
  const stock = getOrInitStrategicStocks(actor.id);
  const upfrontCost = REVEAL_EMPIRE_UPKEEP_PER_MIN * getDomainEffectsForPlayer(actor.id).revealUpkeepMult;
  if ((stock.CRYSTAL ?? 0) < upfrontCost) return { ok: false, reason: "insufficient crystal to activate reveal" };
  stock.CRYSTAL = Math.max(0, (stock.CRYSTAL ?? 0) - upfrontCost);
  reveals.add(targetPlayerId);
  return { ok: true };
};

const stopRevealEmpire = (actor: Player, targetPlayerId: string): boolean => {
  const reveals = getOrInitRevealTargets(actor.id);
  return reveals.delete(targetPlayerId);
};

const tryBuildFort = (actor: Player, x: number, y: number): { ok: boolean; reason?: string } => {
  const t = playerTile(x, y);
  if (t.terrain !== "LAND") return { ok: false, reason: "fort requires land tile" };
  if (t.ownerId !== actor.id) return { ok: false, reason: "fort tile must be owned" };
  const tk = key(t.x, t.y);
  if (fortsByTile.has(tk)) return { ok: false, reason: "tile already fortified" };
  if (siegeOutpostsByTile.has(tk)) return { ok: false, reason: "tile already has siege outpost" };
  const dock = docksByTile.get(tk);
  if (!dock && !isBorderTile(t.x, t.y, actor.id)) return { ok: false, reason: "fort must be on border tile or dock" };
  if (countPlayerForts(actor.id) >= FORT_MAX_PER_PLAYER) return { ok: false, reason: "fort cap reached" };
  if (actor.points < FORT_BUILD_COST) return { ok: false, reason: "insufficient gold for fort" };
  if (!consumeStrategicResource(actor, "IRON", FORT_BUILD_IRON_COST)) return { ok: false, reason: "insufficient IRON for fort" };
  actor.points -= FORT_BUILD_COST;
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
  const timer = setTimeout(() => {
    const current = fortsByTile.get(tk);
    if (!current) return;
    const tileNow = playerTile(t.x, t.y);
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
  const t = playerTile(x, y);
  if (t.terrain !== "LAND") return { ok: false, reason: "siege outpost requires land tile" };
  if (t.ownerId !== actor.id) return { ok: false, reason: "siege outpost tile must be owned" };
  const tk = key(t.x, t.y);
  if (siegeOutpostsByTile.has(tk)) return { ok: false, reason: "tile already has siege outpost" };
  if (fortsByTile.has(tk)) return { ok: false, reason: "tile already has fort" };
  if (!isBorderTile(t.x, t.y, actor.id)) return { ok: false, reason: "siege outpost must be on border tile" };
  if (countPlayerSiegeOutposts(actor.id) >= SIEGE_OUTPOST_MAX_PER_PLAYER) return { ok: false, reason: "siege outpost cap reached" };
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
  const timer = setTimeout(() => {
    const current = siegeOutpostsByTile.get(tk);
    if (!current) return;
    const tileNow = playerTile(t.x, t.y);
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
  for (const n of [playerTile(t.x, t.y - 1), playerTile(t.x + 1, t.y), playerTile(t.x, t.y + 1), playerTile(t.x - 1, t.y)]) {
    if (n.ownerId) affectedPlayers.add(n.ownerId);
  }

  if (oldOwner && newOwner !== oldOwner) {
    if (oldOwner === BARBARIAN_OWNER_ID) {
      removeBarbarianAtTile(k);
    }
    const settle = pendingSettlementsByTile.get(k);
    if (settle) {
      settle.cancelled = true;
      if (settle.timeout) clearTimeout(settle.timeout);
      pendingSettlementsByTile.delete(k);
    }
    const fort = fortsByTile.get(k);
    if (fort) {
      cancelFortBuild(k);
      fortsByTile.delete(k);
    }
    const siege = siegeOutpostsByTile.get(k);
    if (siege) {
      cancelSiegeOutpostBuild(k);
      siegeOutpostsByTile.delete(k);
    }
    defensiveFortifyByTile.delete(k);
    breachShockByTile.delete(k);
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
    breachShockByTile.delete(k);
  }
  if (oldOwner !== newOwner) {
    tileYieldByTile.delete(k);
  }

  if (oldOwner) {
    const p = players.get(oldOwner);
    if (p) {
      p.territoryTiles.delete(k);
      const r = t.resource;
      if (r) getOrInitResourceCounts(oldOwner)[r] -= 1;
      if (clusterId) setClusterControlDelta(oldOwner, clusterId, -1);
    }
  }

  if (newOwner) {
    const p = players.get(newOwner);
    if (p) {
      p.territoryTiles.add(k);
      const r = t.resource;
      if (r) getOrInitResourceCounts(newOwner)[r] += 1;
      if (clusterId) setClusterControlDelta(newOwner, clusterId, 1);
    }
  }

  for (const pid of affectedPlayers) {
    const p = players.get(pid);
    if (!p) continue;
    recomputeExposure(p);
  }

  for (const p of players.values()) {
    if (!tileInSubscription(p.id, t.x, t.y)) continue;
    if (!visible(p, t.x, t.y)) continue;
    const current = playerTile(t.x, t.y);
    current.fogged = false;
    sendToPlayer(p.id, {
      type: "TILE_DELTA",
      updates: [current]
    });
  }
};

const spawnPlayer = (p: Player): void => {
  const trySpawnAt = (x: number, y: number): boolean => {
    const t = playerTile(x, y);
    if (t.terrain !== "LAND") return false;
    const owner = t.ownerId;
    if (owner && owner !== BARBARIAN_OWNER_ID) return false;
    updateOwnership(x, y, p.id, "SETTLED");
    p.spawnOrigin = key(x, y);
    p.spawnShieldUntil = now() + 120_000;
    p.isEliminated = false;
    p.respawnPending = false;
    app.log.info({ playerId: p.id, x, y }, "spawned player");
    return true;
  };

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

  app.log.error({ playerId: p.id }, "failed to find any land tile for spawn");
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
    if (t.resource) getOrInitResourceCounts(ownerId)[t.resource] += 1;
    if (t.clusterId) setClusterControlDelta(ownerId, t.clusterId, 1);
  }

  for (const p of players.values()) {
    recomputeExposure(p);
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

const saveSnapshot = (): void => {
  fs.mkdirSync(SNAPSHOT_DIR, { recursive: true });
  const payload = {
    world: { width: WORLD_WIDTH, height: WORLD_HEIGHT },
    players: [...players.values()].map(serializePlayer),
    ownership: [...ownership.entries()],
    ownershipState: [...ownershipStateByTile.entries()],
    barbarianAgents: [...barbarianAgents.values()],
    passwords: [...passwordByName.entries()],
    resources: [...resourceCountsByPlayer.entries()],
    strategicResources: [...strategicResourceStockByPlayer.entries()],
    strategicResourceBuffer: [...strategicResourceBufferByPlayer.entries()],
    tileYield: [...tileYieldByTile.entries()],
    dynamicMissions: [...dynamicMissionsByPlayer.entries()],
    temporaryAttackBuffUntil: [...temporaryAttackBuffUntilByPlayer.entries()],
    temporaryIncomeBuff: [...temporaryIncomeBuffUntilByPlayer.entries()],
    forcedReveal: [...forcedRevealTilesByPlayer.entries()].map(([pid, set]) => [pid, [...set]]),
    revealedEmpireTargets: [...revealedEmpireTargetsByPlayer.entries()].map(([pid, set]) => [pid, [...set]]),
    allianceRequests: [...allianceRequests.values()],
    forts: [...fortsByTile.values()],
    siegeOutposts: [...siegeOutpostsByTile.values()],
    docks: [...dockById.values()],
    towns: [...townsByTile.values()],
    firstSpecialSiteCaptureClaimed: [...firstSpecialSiteCaptureClaimed],
    clusters: [...clustersById.values()],
    clusterTiles: [...clusterByTile.entries()],
    season: activeSeason,
    seasonArchives,
    seasonTechConfig: {
      ...activeSeasonTechConfig,
      activeNodeIds: [...activeSeasonTechConfig.activeNodeIds]
    }
  };
  fs.writeFileSync(SNAPSHOT_FILE, JSON.stringify(payload));
};

const loadSnapshot = (): void => {
  if (!fs.existsSync(SNAPSHOT_FILE)) return;
  const raw = JSON.parse(fs.readFileSync(SNAPSHOT_FILE, "utf8")) as {
    world?: { width: number; height: number };
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
    passwords: [string, string][];
    resources: [string, Record<ResourceType, number>][];
    strategicResources?: [string, Record<StrategicResource, number>][];
    strategicResourceBuffer?: [string, Record<StrategicResource, number>][];
    tileYield?: [TileKey, TileYieldBuffer][];
    dynamicMissions?: [string, DynamicMissionDef[]][];
    temporaryAttackBuffUntil?: [string, number][];
    temporaryIncomeBuff?: [string, { until: number; resources: [ResourceType, ResourceType] }][];
    forcedReveal?: [string, TileKey[]][];
    revealedEmpireTargets?: [string, string[]][];
    allianceRequests?: AllianceRequest[];
    forts?: Fort[];
    siegeOutposts?: SiegeOutpost[];
    docks?: Dock[];
    towns?: TownDefinition[];
    firstSpecialSiteCaptureClaimed?: TileKey[];
    clusters?: ClusterDefinition[];
    clusterTiles?: [TileKey, string][];
    season?: Season;
    seasonArchives?: SeasonArchiveEntry[];
    seasonTechConfig?: Omit<SeasonalTechConfig, "activeNodeIds"> & { activeNodeIds: string[] };
  };
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
  for (const [n, p] of raw.passwords) passwordByName.set(n, p);
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
  for (const [pid, tiles] of raw.forcedReveal ?? []) {
    forcedRevealTilesByPlayer.set(pid, new Set<TileKey>(tiles));
  }
  for (const [pid, targets] of raw.revealedEmpireTargets ?? []) {
    revealedEmpireTargetsByPlayer.set(pid, new Set<string>(targets));
  }
  for (const request of raw.allianceRequests ?? []) allianceRequests.set(request.id, request);
  for (const f of raw.forts ?? []) fortsByTile.set(f.tileKey, f);
  for (const s of raw.siegeOutposts ?? []) siegeOutpostsByTile.set(s.tileKey, s);
  for (const d of raw.docks ?? []) {
    docksByTile.set(d.tileKey, d);
    dockById.set(d.dockId, d);
  }
  for (const t of raw.towns ?? []) townsByTile.set(t.tileKey, t);
  for (const tk of raw.firstSpecialSiteCaptureClaimed ?? []) firstSpecialSiteCaptureClaimed.add(tk);
  for (const c of raw.clusters ?? []) clustersById.set(c.clusterId, c);
  for (const [tk, cid] of raw.clusterTiles ?? []) clusterByTile.set(tk, cid);
  if (raw.season) activeSeason = raw.season;
  if (raw.seasonArchives) seasonArchives.push(...raw.seasonArchives);
  if (raw.seasonTechConfig) {
    activeSeasonTechConfig = {
      ...raw.seasonTechConfig,
      activeNodeIds: new Set(raw.seasonTechConfig.activeNodeIds)
    };
  }
  for (const p of raw.players) {
    const hydrated: Player = {
      ...p,
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
    players.set(p.id, hydrated);
    playerBaseMods.set(hydrated.id, {
      attack: hydrated.mods.attack,
      defense: hydrated.mods.defense,
      income: hydrated.mods.income,
      vision: hydrated.mods.vision
    });
    recomputeDomainEffectsForPlayer(hydrated);
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
  for (const d of dockById.values()) {
    if (seen.has(d.dockId)) continue;
    const pair = dockById.get(d.pairedDockId);
    if (!pair) return false;
    seen.add(d.dockId);
    seen.add(pair.dockId);
    const [ax, ay] = parseKey(d.tileKey);
    const [bx, by] = parseKey(pair.tileKey);
    const ac = continentIdAt(ax, ay);
    const bc = continentIdAt(bx, by);
    if (ac === undefined || bc === undefined || ac === bc) return false;
  }
  return dockById.size > 0;
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
  if (!revealedEmpireTargetsByPlayer.has(p.id)) revealedEmpireTargetsByPlayer.set(p.id, new Set<string>());
  if (!domainEffectsByPlayer.has(p.id)) recomputeDomainEffectsForPlayer(p);
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
const runtimeIntervals: NodeJS.Timeout[] = [];
const registerInterval = (fn: () => void, ms: number): void => {
  runtimeIntervals.push(setInterval(fn, ms));
};

registerInterval(saveSnapshot, 30_000);
registerInterval(runBarbarianTick, 1_000);
registerInterval(maintainBarbarianPopulation, BARBARIAN_MAINTENANCE_INTERVAL_MS);

registerInterval(() => {
  for (const [tk, shock] of breachShockByTile) {
    if (shock.expiresAt <= now()) breachShockByTile.delete(tk);
  }
  for (const [tk, buff] of defensiveFortifyByTile) {
    if (buff.expiresAt <= now() || buff.consumed) defensiveFortifyByTile.delete(tk);
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
  for (const [pid, missions] of dynamicMissionsByPlayer) {
    dynamicMissionsByPlayer.set(
      pid,
      missions.filter((m) => m.expiresAt > now() || m.rewarded)
    );
  }
  for (const p of players.values()) {
    if (now() - p.lastActiveAt > OFFLINE_YIELD_ACCUM_MAX_MS) {
      sendPlayerUpdate(p, 0);
      continue;
    }
    applyStaminaRegen(p);
    for (const tk of p.territoryTiles) {
      if (ownershipStateByTile.get(tk) !== "SETTLED") continue;
        const [x, y] = parseKey(tk);
        const t = playerTile(x, y);
        if (t.ownerId !== p.id || t.terrain !== "LAND" || t.ownershipState !== "SETTLED") continue;
        let goldDelta = 0;
        if (t.resource) goldDelta += resourceRate[t.resource] * p.mods.income * PASSIVE_INCOME_MULT * HARVEST_GOLD_RATE_MULT;
        if (docksByTile.has(tk)) goldDelta += DOCK_INCOME_PER_MIN * p.mods.income * PASSIVE_INCOME_MULT * HARVEST_GOLD_RATE_MULT;
        const town = townsByTile.get(tk);
        if (town) goldDelta += townIncomeForOwner(town, p.id) * p.mods.income * PASSIVE_INCOME_MULT * HARVEST_GOLD_RATE_MULT;
        const strategic: Partial<Record<StrategicResource, number>> = {};
        const sr = toStrategicResource(t.resource);
        if (sr) {
          const mult = t.resource ? activeResourceIncomeMult(p.id, t.resource) : 1;
          const daily = t.resource ? (strategicDailyFromResource[t.resource] ?? 0) : 0;
          strategic[sr] = (daily * mult) * HARVEST_RESOURCE_RATE_MULT;
        }
        if (town?.type === "ANCIENT") {
          strategic.SHARD = (strategic.SHARD ?? 0) + strategicResourceRates.SHARD * HARVEST_RESOURCE_RATE_MULT;
        }
        const hasStrategic = hasPositiveStrategicBuffer(strategic);
        if (goldDelta > 0 || hasStrategic) addTileYield(tk, goldDelta, strategic);
    }
    const upkeepResult = applyUpkeepForPlayer(p);
    if (upkeepResult.touchedTileKeys.size > 0) {
      const updates = [...upkeepResult.touchedTileKeys].map((tk) => {
        const [x, y] = parseKey(tk);
        return playerTile(x, y);
      });
      sendToPlayer(p.id, { type: "TILE_DELTA", updates });
    }
    updateMissionState(p);
    sendPlayerUpdate(p, 0);
  }
}, 60_000);

if (SEASONS_ENABLED) {
  registerInterval(() => {
    if (now() >= activeSeason.endAt) startNewSeason();
  }, 60_000);
}

const app = Fastify({ logger: true });
await app.register(websocket as never);

app.get("/health", async () => ({ ok: true }));
app.get("/season", async () => ({
  activeSeason,
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
    onlinePlayers: socketsByPlayer.size,
    totalPlayers: players.size,
    activeTowns,
    avgTownSupportRatio: supportCount > 0 ? supportSum / supportCount : 0,
    counters: telemetryCounters
  };
});
app.post("/admin/season/rollover", async () => {
  if (!SEASONS_ENABLED) return { ok: false, disabled: true, message: "seasons temporarily disabled" };
  startNewSeason();
  return { ok: true, activeSeason };
});
app.post("/admin/world/regenerate", async () => {
  regenerateWorldInPlace();
  saveSnapshot();
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

  socket.on("message", (buf: import("ws").RawData) => {
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
      const [name, password] = msg.token.split(":");
      if (!name || !password) {
        socket.send(JSON.stringify({ type: "ERROR", code: "AUTH_FORMAT", message: "token must be name:password" }));
        return;
      }

      const existing = passwordByName.get(name);
      if (existing && existing !== password) {
        socket.send(JSON.stringify({ type: "ERROR", code: "AUTH_FAIL", message: "wrong password" }));
        return;
      }
      if (!existing) passwordByName.set(name, password);

      let player = [...players.values()].find((p) => p.name === name);
      if (!player) {
        player = {
          id: crypto.randomUUID(),
          name,
          points: STARTING_GOLD,
          level: 0,
          techIds: new Set<string>(),
          domainIds: new Set<string>(),
          mods: { attack: 1, defense: 1, income: 1, vision: 1 },
          powerups: {},
          tileColor: colorFromId(name),
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
        playerBaseMods.set(player.id, { attack: 1, defense: 1, income: 1, vision: 1 });
        strategicResourceStockByPlayer.set(player.id, emptyStrategicStocks());
        strategicResourceBufferByPlayer.set(player.id, emptyStrategicStocks());
        dynamicMissionsByPlayer.set(player.id, []);
        forcedRevealTilesByPlayer.set(player.id, new Set<TileKey>());
        revealedEmpireTargetsByPlayer.set(player.id, new Set<string>());
        domainEffectsByPlayer.set(player.id, { revealUpkeepMult: 1, revealCapacityBonus: 0 });
        spawnPlayer(player);
      }
      if (!(player.domainIds instanceof Set)) {
        (player as unknown as { domainIds: Set<string> }).domainIds = new Set<string>();
      }
      if (player.T <= 0 || player.territoryTiles.size === 0) {
        spawnPlayer(player);
      }
      if (!player.tileColor) {
        player.tileColor = colorFromId(player.id);
      }
      recomputeDomainEffectsForPlayer(player);
      ensureMissionDefaults(player);
      updateMissionState(player);
      if (!player) {
        socket.send(JSON.stringify({ type: "ERROR", code: "AUTH_FAIL", message: "player initialization failed" }));
        return;
      }

      authedPlayer = player;
      tokenToPlayerId.set(msg.token, player.id);
      socketsByPlayer.set(player.id, socket);
      const strategicStocks = getOrInitStrategicStocks(player.id);
      const strategicProduction = strategicProductionPerMinute(player);
      const dockPairs = exportDockPairs();
      socket.send(
        JSON.stringify({
          type: "INIT",
          player: {
            id: player.id,
            name: player.name,
            gold: player.points,
            points: player.points,
            level: player.level,
            mods: player.mods,
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
            homeTile: playerHomeTile(player),
            availableTechPicks: availableTechPicks(player),
            revealCapacity: revealCapacityForPlayer(player),
            activeRevealTargets: [...getOrInitRevealTargets(player.id)]
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
          leaderboard: leaderboardSnapshot(player),
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
    actor.lastActiveAt = now();

    if (msg.type === "PING") {
      socket.send(JSON.stringify({ type: "PONG", t: msg.t }));
      return;
    }

    if (msg.type === "SET_TILE_COLOR") {
      actor.tileColor = msg.color;
      broadcast({ type: "PLAYER_STYLE", playerId: actor.id, tileColor: actor.tileColor });
      return;
    }

    if (msg.type === "SET_FOG_DISABLED") {
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
        socket.send(JSON.stringify({ type: "ERROR", code: "SETTLE_INVALID", message: out.reason }));
        return;
      }
      socket.send(JSON.stringify({ type: "COMBAT_START", origin: { x: msg.x, y: msg.y }, target: { x: msg.x, y: msg.y }, resolvesAt: out.resolvesAt }));
      sendPlayerUpdate(actor, 0);
      return;
    }

    if (msg.type === "RAPID_SETTLE") {
      const out = startSettlement(actor, msg.x, msg.y, {
        goldCost: RAPID_SETTLE_GOLD_COST,
        settleMs: RAPID_SETTLE_MS,
        foodCost: RAPID_SETTLE_FOOD_COST,
        rapid: true
      });
      if (!out.ok) {
        socket.send(JSON.stringify({ type: "ERROR", code: "RAPID_SETTLE_INVALID", message: out.reason }));
        return;
      }
      socket.send(JSON.stringify({ type: "COMBAT_START", origin: { x: msg.x, y: msg.y }, target: { x: msg.x, y: msg.y }, resolvesAt: out.resolvesAt }));
      sendPlayerUpdate(actor, 0);
      return;
    }

    if (msg.type === "DEFENSIVE_FORTIFY") {
      const out = tryDefensiveFortify(actor, msg.x, msg.y);
      if (!out.ok) {
        socket.send(JSON.stringify({ type: "ERROR", code: "DEFENSIVE_FORTIFY_INVALID", message: out.reason }));
        return;
      }
      updateOwnership(msg.x, msg.y, actor.id);
      sendPlayerUpdate(actor, 0);
      return;
    }

    if (msg.type === "SCOUT_PULSE") {
      const out = tryScoutPulse(actor, msg.x, msg.y);
      if (!out.ok) {
        socket.send(JSON.stringify({ type: "ERROR", code: "SCOUT_PULSE_INVALID", message: out.reason }));
        return;
      }
      socket.send(JSON.stringify({ type: "SCOUT_PULSE_OK", x: msg.x, y: msg.y, expiresAt: now() + SCOUT_PULSE_MS }));
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

    if (msg.type === "STOP_REVEAL_EMPIRE") {
      if (!stopRevealEmpire(actor, msg.targetPlayerId)) {
        socket.send(JSON.stringify({ type: "ERROR", code: "REVEAL_EMPIRE_STOP_INVALID", message: "target is not actively revealed" }));
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
        settle.cancelled = true;
        if (settle.timeout) clearTimeout(settle.timeout);
        pendingSettlementsByTile.delete(settle.tileKey);
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
        socket.send(JSON.stringify({ type: "ERROR", code: "COLLECT_EMPTY", message: "tile is not owned by you" }));
        return;
      }
      if (t.terrain !== "LAND") {
        socket.send(JSON.stringify({ type: "ERROR", code: "COLLECT_EMPTY", message: "tile is not land" }));
        return;
      }
      if (t.ownershipState !== "SETTLED") {
        socket.send(JSON.stringify({ type: "ERROR", code: "COLLECT_EMPTY", message: "only settled tiles can be collected" }));
        return;
      }
      const got = collectYieldFromTile(actor, tk);
      const touched = got.gold > 0 || (Object.values(got.strategic) as number[]).some((v) => v > 0);
      if (!touched) {
        socket.send(JSON.stringify({ type: "ERROR", code: "COLLECT_EMPTY", message: "yield is empty (upkeep may have consumed it)" }));
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
      const t = playerTile(msg.x, msg.y);
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
          incomePerMinute: currentIncomePerMinute(actor),
          domainChoices: reachableDomains(actor),
          domainCatalog: activeDomainCatalog(actor),
          missions: missionPayload(actor),
          revealCapacity: revealCapacityForPlayer(actor),
          activeRevealTargets: [...getOrInitRevealTargets(actor.id)]
        })
      );
      sendPlayerUpdate(actor, 0);
      return;
    }

    if (msg.type === "ALLIANCE_REQUEST") {
      const target = [...players.values()].find((p) => p.name === msg.targetPlayerName);
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
        expiresAt: now() + ALLIANCE_REQUEST_TTL_MS
      };
      allianceRequests.set(request.id, request);
      socket.send(JSON.stringify({ type: "ALLIANCE_REQUESTED", request }));
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
      const sub = { cx: msg.cx, cy: msg.cy, radius: msg.radius };
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

      const shock = breachShockByTile.get(tk);
      const shockMult = defender && shock && shock.ownerId === defender.id && shock.expiresAt > now() ? BREACH_SHOCK_DEF_MULT : 1;
      const defMult = defender ? playerDefensiveness(defender) * shockMult : 1;
      const fortOnTarget = fortsByTile.get(tk);
      const fortMult = defender && fortOnTarget?.status === "active" && fortOnTarget.ownerId === defender.id ? FORT_DEFENSE_MULT : 1;
      const dockMult = docksByTile.has(tk) ? DOCK_DEFENSE_MULT : 1;
      const siegeOnOrigin = siegeOutpostsByTile.get(fk);
      const siegeAtkMult = siegeOnOrigin?.status === "active" && siegeOnOrigin.ownerId === actor.id ? SIEGE_OUTPOST_ATTACK_MULT : 1;
      const atkEff = 10 * actor.mods.attack * siegeAtkMult * activeAttackBuffMult(actor.id);
      const defEff = defenderIsBarbarian
        ? 10 * BARBARIAN_DEFENSE_POWER * dockMult
        : 10 * (defender?.mods.defense ?? 1) * defMult * fortMult * dockMult;
      socket.send(
        JSON.stringify({
          type: "ATTACK_PREVIEW_RESULT",
          from: { x: from.x, y: from.y },
          to: { x: to.x, y: to.y },
          valid: true,
          winChance: combatWinChance(atkEff, defEff),
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

    if (msg.type !== "ATTACK" && msg.type !== "EXPAND" && msg.type !== "BREAKTHROUGH_ATTACK") return;

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

    const actionTimes = (actionTimestampsByPlayer.get(actor.id) ?? []).filter((t) => now() - t <= ACTION_WINDOW_MS);
    if (actionTimes.length >= ACTION_LIMIT) {
      app.log.info({ playerId: actor.id, action: msg.type }, "action rejected: rate limit");
      socket.send(JSON.stringify({ type: "ERROR", code: "RATE_LIMIT", message: "too many actions; slow down briefly" }));
      return;
    }
    actionTimes.push(now());
    actionTimestampsByPlayer.set(actor.id, actionTimes);

    applyStaminaRegen(actor);
    const staminaCost = 0;

    let from = playerTile(msg.fromX, msg.fromY);
    const to = playerTile(msg.toX, msg.toY);
    const preTk = key(to.x, to.y);
    if (msg.type === "EXPAND" && to.ownerId) {
      app.log.info({ playerId: actor.id, to: preTk, ownerId: to.ownerId }, "action rejected: expand target owned");
      socket.send(JSON.stringify({ type: "ERROR", code: "EXPAND_TARGET_OWNED", message: "expand only targets neutral land" }));
      return;
    }
    if (msg.type === "BREAKTHROUGH_ATTACK" && !to.ownerId) {
      app.log.info({ playerId: actor.id, to: preTk }, "action rejected: breakthrough target not enemy");
      socket.send(JSON.stringify({ type: "ERROR", code: "BREAKTHROUGH_TARGET_INVALID", message: "breakthrough requires enemy tile" }));
      return;
    }
    if (msg.type === "EXPAND" && actor.points < FRONTIER_ACTION_GOLD_COST) {
      app.log.info({ playerId: actor.id, points: actor.points, required: FRONTIER_ACTION_GOLD_COST }, "action rejected: insufficient gold for expand");
      socket.send(JSON.stringify({ type: "ERROR", code: "INSUFFICIENT_GOLD", message: "insufficient gold for frontier claim" }));
      return;
    }
    if (msg.type === "BREAKTHROUGH_ATTACK" && actor.points < BREAKTHROUGH_GOLD_COST) {
      app.log.info({ playerId: actor.id, points: actor.points, required: BREAKTHROUGH_GOLD_COST }, "action rejected: insufficient gold for breakthrough");
      socket.send(JSON.stringify({ type: "ERROR", code: "INSUFFICIENT_GOLD", message: "insufficient gold for breakthrough" }));
      return;
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
    if (!adjacent && !dockCrossing) {
      app.log.info({ playerId: actor.id, from: fk, to: tk }, "action rejected: not adjacent and not dock crossing");
      socket.send(JSON.stringify({ type: "ERROR", code: "NOT_ADJACENT", message: "target must be adjacent or valid dock crossing" }));
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
    if (msg.type === "BREAKTHROUGH_ATTACK") {
      if (!consumeStrategicResource(actor, "IRON", BREAKTHROUGH_IRON_COST)) {
        app.log.info({ playerId: actor.id }, "action rejected: insufficient IRON for breakthrough");
        socket.send(JSON.stringify({ type: "ERROR", code: "INSUFFICIENT_RESOURCE", message: "insufficient IRON for breakthrough" }));
        return;
      }
      actor.points -= BREAKTHROUGH_GOLD_COST;
      recalcPlayerDerived(actor);
      telemetryCounters.breakthroughAttacks += 1;
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
        refreshSubscribedViewForPlayer(actor.id);
        return;
      }

      if (defender && defender.spawnShieldUntil > now()) {
        socket.send(JSON.stringify({ type: "ERROR", code: "SHIELDED", message: "target shielded" }));
        return;
      }

      actor.stamina -= staminaCost;

      const atkEff = 10 * actor.mods.attack * activeAttackBuffMult(actor.id) * randomFactor();
      const siegeOnOrigin = siegeOutpostsByTile.get(fk);
      const siegeAtkMult = siegeOnOrigin?.status === "active" && siegeOnOrigin.ownerId === actor.id ? SIEGE_OUTPOST_ATTACK_MULT : 1;
      const atkEffWithSiege = atkEff * siegeAtkMult;
      const shock = breachShockByTile.get(tk);
      const shockMult = defender && shock && shock.ownerId === defender.id && shock.expiresAt > now() ? BREACH_SHOCK_DEF_MULT : 1;
      const defMultRaw = defender ? playerDefensiveness(defender) * shockMult : 1;
      const defMult = msg.type === "BREAKTHROUGH_ATTACK" ? defMultRaw * BREAKTHROUGH_DEF_MULT_FACTOR : defMultRaw;
      const fortOnTarget = fortsByTile.get(tk);
      const fortMult = defender && fortOnTarget?.status === "active" && fortOnTarget.ownerId === defender.id ? FORT_DEFENSE_MULT : 1;
      const dockMult = docksByTile.has(tk) ? DOCK_DEFENSE_MULT : 1;
      const fortified = defensiveFortifyByTile.get(tk);
      const defensiveFortifyMult =
        defender && fortified && fortified.ownerId === defender.id && fortified.expiresAt > now() && !fortified.consumed ? DEFENSIVE_FORTIFY_MULT : 1;
      if (defender && fortified && fortified.ownerId === defender.id && fortified.expiresAt > now() && !fortified.consumed) {
        fortified.consumed = true;
      }
      const defEff = defenderIsBarbarian
        ? 10 * BARBARIAN_DEFENSE_POWER * dockMult * randomFactor()
        : 10 * (defender?.mods.defense ?? 1) * defMult * fortMult * dockMult * defensiveFortifyMult * randomFactor();
      const p = combatWinChance(atkEffWithSiege, defEff);
      const win = Math.random() < p;

      let pointsDelta = 0;
      if (win) {
        const targetWasSettled = to.ownershipState === "SETTLED";
        updateOwnership(to.x, to.y, actor.id, "FRONTIER");
        if (!defenderIsBarbarian && msg.type === "BREAKTHROUGH_ATTACK" && targetWasSettled && defender) {
          applyBreachShockAround(to.x, to.y, defender.id);
        }
        if (defenderIsBarbarian) {
          pointsDelta = BARBARIAN_CLEAR_GOLD_REWARD;
          actor.points += pointsDelta;
          app.log.info({ type: "CLEARED", playerId: actor.id, x: to.x, y: to.y, timestamp: now() }, "barbarian event");
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
          const entries = (repeatFights.get(pairKey) ?? []).filter((ts) => now() - ts <= PVP_REPEAT_WINDOW_MS);
          entries.push(now());
          repeatFights.set(pairKey, entries);
          const repeatMult = Math.max(PVP_REPEAT_FLOOR, 0.5 ** (entries.length - 1));
          pointsDelta = actor.allies.has(defender.id) ? 0 : pvpPointsReward(baseTileValue(to.resource), attackerRating, defenderRating) * repeatMult * PVP_REWARD_MULT;
          actor.points += pointsDelta;
        }
      } else {
        if (defenderIsBarbarian) {
          pointsDelta = 0;
        } else if (defender) {
          updateOwnership(from.x, from.y, defender.id, "FRONTIER");
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
        changes: win
          ? [{ x: to.x, y: to.y, ownerId: actor.id, ownershipState: "FRONTIER" }]
          : defenderIsBarbarian
            ? []
            : defender
              ? [{ x: from.x, y: from.y, ownerId: defender.id, ownershipState: "FRONTIER" }]
              : [],
        pointsDelta,
        levelDelta: 0
      }));
      refreshSubscribedViewForPlayer(actor.id);
      if (defender && !defenderIsBarbarian) refreshSubscribedViewForPlayer(defender.id);
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
    }
  });
});

const shutdown = async (signal: string): Promise<void> => {
  app.log.info({ signal }, "shutting down server");
  for (const interval of runtimeIntervals) clearInterval(interval);
  runtimeIntervals.length = 0;
  try {
    await app.close();
  } catch (err) {
    app.log.error({ err, signal }, "error during shutdown");
  } finally {
    process.exit(0);
  }
};

process.once("SIGINT", () => {
  void shutdown("SIGINT");
});
process.once("SIGTERM", () => {
  void shutdown("SIGTERM");
});

await app.listen({ host: "0.0.0.0", port: PORT });

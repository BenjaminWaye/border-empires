import Fastify from "fastify";
import websocket from "@fastify/websocket";
import {
  CHUNK_SIZE,
  CLUSTER_COUNT_MAX,
  CLUSTER_COUNT_MIN,
  ClientMessageSchema,
  COMBAT_LOCK_MS,
  DOCK_CROSSING_COOLDOWN_MS,
  DOCK_DEFENSE_MULT,
  DOCK_PAIRS_MAX,
  DOCK_PAIRS_MIN,
  FORT_BUILD_COST,
  FORT_BUILD_MS,
  FORT_DEFENSE_MULT,
  FORT_MAX_PER_PLAYER,
  PVP_REPEAT_FLOOR,
  PVP_REPEAT_WINDOW_MS,
  SEASON_LENGTH_DAYS,
  STAMINA_MAX,
  STAMINA_REGEN_MS,
  VISION_RADIUS,
  WORLD_HEIGHT,
  WORLD_WIDTH,
  combatWinChance,
  computeOwnershipChangeDelta,
  defensivenessMultiplier,
  levelFromPoints,
  pvpPointsReward,
  randomFactor,
  ratingFromPointsLevel,
  resourceAt,
  terrainAt,
  wrapX,
  wrapY,
  type Player,
  type MissionKind,
  type MissionState,
  type MissionStats,
  type ClusterType,
  type ResourceType,
  type Season,
  type Tile,
  type TileKey,
  type Fort,
  type Dock
} from "@border-empires/shared";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { loadTechTree, type StatsModKey } from "./tech-tree.js";

const PORT = Number(process.env.PORT ?? 3001);
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
  target: number;
  rewardPoints: number;
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

const key = (x: number, y: number): TileKey => `${x},${y}`;
const parseKey = (k: TileKey): [number, number] => {
  const [xs, ys] = k.split(",");
  return [Number(xs), Number(ys)];
};

const now = (): number => Date.now();
const ALLIANCE_REQUEST_TTL_MS = 5 * 60_000;
const MISSION_DEFS: MissionDef[] = [
  {
    id: "frontier-first-steps",
    kind: "NEUTRAL_CAPTURES",
    name: "Frontier First Steps",
    description: "Capture 8 neutral tiles.",
    unlockPoints: 20,
    target: 8,
    rewardPoints: 60
  },
  {
    id: "regional-footprint",
    kind: "TILES_HELD",
    name: "Regional Footprint",
    description: "Hold 20 tiles at once.",
    unlockPoints: 80,
    target: 20,
    rewardPoints: 120
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

const resourceRate: Record<ResourceType, number> = {
  FARM: 0.3,
  WOOD: 0.2,
  IRON: 0.35,
  GEMS: 0.5
};

const baseTileValue = (resource: ResourceType | undefined): number => {
  if (!resource) return 10;
  if (resource === "FARM") return 20;
  if (resource === "WOOD") return 30;
  if (resource === "IRON") return 40;
  return 60;
};

const players = new Map<string, Player>();
const passwordByName = new Map<string, string>();
const tokenToPlayerId = new Map<string, string>();
const socketsByPlayer = new Map<string, Ws>();
const ownership = new Map<TileKey, string>();
const combatLocks = new Map<TileKey, { resolvesAt: number; origin: TileKey; target: TileKey }>();
const repeatFights = new Map<string, number[]>();
const resourceCountsByPlayer = new Map<string, Record<ResourceType, number>>();
const allianceRequests = new Map<string, AllianceRequest>();
const chunkSubscriptionByPlayer = new Map<string, { cx: number; cy: number; radius: number }>();
const actionTimestampsByPlayer = new Map<string, number[]>();
const fortsByTile = new Map<TileKey, Fort>();
const fortBuildTimers = new Map<TileKey, NodeJS.Timeout>();
const docksByTile = new Map<TileKey, Dock>();
const dockById = new Map<string, Dock>();
const clusterByTile = new Map<TileKey, string>();
const clustersById = new Map<string, ClusterDefinition>();
const clusterControlledTilesByPlayer = new Map<string, Map<string, number>>();
const playerBaseMods = new Map<string, { attack: number; defense: number; income: number; vision: number }>();
const seasonArchives: SeasonArchiveEntry[] = [];
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

const seeded01 = (x: number, y: number, seed: number): number => {
  const n = Math.sin((x * 12.9898 + y * 78.233 + seed * 43758.5453) % 100000) * 43758.5453123;
  return n - Math.floor(n);
};

const isAdjacentTile = (ax: number, ay: number, bx: number, by: number): boolean => {
  const dx = Math.abs(ax - bx);
  const dy = Math.abs(ay - by);
  if (dx + dy === 1) return true;
  if (dx === WORLD_WIDTH - 1 && ay === by) return true;
  if (dy === WORLD_HEIGHT - 1 && ax === bx) return true;
  return false;
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

const clusterTypeDefs: Array<{
  type: ClusterType;
  threshold: number;
  bonus: { attack?: number; defense?: number; income?: number; vision?: number };
}> = [
  { type: "FERTILE_PLAINS", threshold: 10, bonus: { income: 1.5 } },
  { type: "IRON_HILLS", threshold: 5, bonus: { attack: 1.1 } },
  { type: "CRYSTAL_BASIN", threshold: 5, bonus: { vision: 1.1 } },
  { type: "HORSE_STEPPES", threshold: 8, bonus: { attack: 1.06, defense: 1.04 } },
  { type: "ANCIENT_RUINS", threshold: 4, bonus: { defense: 1.1 } }
];

const chooseSeasonalTechConfig = (seed: number): SeasonalTechConfig => {
  const roots = [...TECH_ROOTS];
  const rootCount = Math.min(5, Math.max(3, 3 + Math.floor(seeded01(seed, seed + 7, seed + 901) * 3)));
  roots.sort((a, b) => seeded01(Number.parseInt(a.id.slice(-4), 36) || 0, seed, seed + 333) - seeded01(Number.parseInt(b.id.slice(-4), 36) || 0, seed, seed + 333));
  const selectedRoots = roots.slice(0, rootCount);
  const activeNodeIds = new Set<string>();
  for (const root of selectedRoots) {
    const q: string[] = [root.id];
    let visited = 0;
    while (q.length > 0 && visited < 24) {
      const id = q.shift()!;
      if (activeNodeIds.has(id)) continue;
      activeNodeIds.add(id);
      visited += 1;
      for (const c of childrenByTech.get(id) ?? []) q.push(c);
    }
  }
  return {
    configId: `tree-${seed}`,
    rootNodeIds: selectedRoots.map((r) => r.id),
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

const generateClusters = (seed: number): void => {
  clusterByTile.clear();
  clustersById.clear();
  const count = CLUSTER_COUNT_MIN + Math.floor(seeded01(seed, seed + 3, seed + 13) * (CLUSTER_COUNT_MAX - CLUSTER_COUNT_MIN + 1));
  for (let i = 0; i < count; i += 1) {
    const cx = Math.floor(seeded01(i * 31, i * 47, seed + 101) * WORLD_WIDTH);
    const cy = Math.floor(seeded01(i * 53, i * 67, seed + 151) * WORLD_HEIGHT);
    if (terrainAt(cx, cy) !== "LAND") continue;
    const def = clusterTypeDefs[Math.floor(seeded01(i * 71, i * 73, seed + 191) * clusterTypeDefs.length)];
    if (!def) continue;
    const radius = 6 + Math.floor(seeded01(i * 79, i * 83, seed + 211) * 13); // ~113-529 tiles
    const clusterId = `cl-${i}`;
    clustersById.set(clusterId, {
      clusterId,
      clusterType: def.type,
      centerX: cx,
      centerY: cy,
      radius,
      controlThreshold: def.threshold,
      bonus: def.bonus
    });
    for (let dy = -radius; dy <= radius; dy += 1) {
      for (let dx = -radius; dx <= radius; dx += 1) {
        const wx = wrapX(cx + dx, WORLD_WIDTH);
        const wy = wrapY(cy + dy, WORLD_HEIGHT);
        if (terrainAt(wx, wy) !== "LAND") continue;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > radius) continue;
        const noise = seeded01(wx, wy, seed + i * 997);
        if (noise > 0.85) continue;
        const k = key(wx, wy);
        if (!clusterByTile.has(k)) clusterByTile.set(k, clusterId);
      }
    }
  }
};

const applyClusterResources = (x: number, y: number, base: ResourceType | undefined): ResourceType | undefined => {
  const cid = clusterByTile.get(key(x, y));
  if (!cid) return base;
  const c = clustersById.get(cid);
  if (!c) return base;
  if (c.clusterType === "FERTILE_PLAINS") return "FARM";
  if (c.clusterType === "IRON_HILLS") return "IRON";
  if (c.clusterType === "CRYSTAL_BASIN") return "GEMS";
  if (c.clusterType === "HORSE_STEPPES") return "WOOD";
  return base ?? "GEMS";
};

const generateDocks = (seed: number): void => {
  docksByTile.clear();
  dockById.clear();
  const targetPairs = DOCK_PAIRS_MIN + Math.floor(seeded01(seed + 5, seed + 9, seed + 700) * (DOCK_PAIRS_MAX - DOCK_PAIRS_MIN + 1));
  const candidates: Array<{ x: number; y: number }> = [];
  for (let i = 0; i < 20_000 && candidates.length < targetPairs * 8; i += 1) {
    const x = Math.floor(seeded01(i * 19, i * 23, seed + 401) * WORLD_WIDTH);
    const y = Math.floor(seeded01(i * 29, i * 31, seed + 409) * WORLD_HEIGHT);
    if (!isCoastalLand(x, y)) continue;
    candidates.push({ x, y });
  }
  const used = new Set<string>();
  let dockCounter = 0;
  for (let i = 0; i < candidates.length && dockCounter < targetPairs; i += 1) {
    const a = candidates[i]!;
    const ak = key(a.x, a.y);
    if (used.has(ak)) continue;
    let bestIdx = -1;
    let bestScore = -1;
    for (let j = i + 1; j < candidates.length; j += 1) {
      const b = candidates[j]!;
      const bk = key(b.x, b.y);
      if (used.has(bk)) continue;
      const dx = Math.min(Math.abs(a.x - b.x), WORLD_WIDTH - Math.abs(a.x - b.x));
      const dy = Math.min(Math.abs(a.y - b.y), WORLD_HEIGHT - Math.abs(a.y - b.y));
      const dist = dx + dy;
      if (dist < 350) continue;
      if (dist > bestScore) {
        bestScore = dist;
        bestIdx = j;
      }
    }
    if (bestIdx === -1) continue;
    const b = candidates[bestIdx]!;
    const bk = key(b.x, b.y);
    used.add(ak);
    used.add(bk);
    const da: Dock = { dockId: `dock-${dockCounter}-a`, tileKey: ak, pairedDockId: `dock-${dockCounter}-b`, cooldownUntil: 0 };
    const db: Dock = { dockId: `dock-${dockCounter}-b`, tileKey: bk, pairedDockId: `dock-${dockCounter}-a`, cooldownUntil: 0 };
    docksByTile.set(ak, da);
    docksByTile.set(bk, db);
    dockById.set(da.dockId, da);
    dockById.set(db.dockId, db);
    dockCounter += 1;
  }
};

const validDockCrossingTarget = (fromDock: Dock, toX: number, toY: number): boolean => {
  const pair = dockById.get(fromDock.pairedDockId);
  if (!pair) return false;
  const [px, py] = parseKey(pair.tileKey);
  if (toX === px && toY === py) return true;
  return isAdjacentTile(px, py, toX, toY);
};

const clearWorldProgressForSeason = (): void => {
  ownership.clear();
  combatLocks.clear();
  allianceRequests.clear();
  repeatFights.clear();
  for (const t of fortBuildTimers.values()) clearTimeout(t);
  fortBuildTimers.clear();
  fortsByTile.clear();
  for (const d of dockById.values()) d.cooldownUntil = 0;
  for (const p of players.values()) {
    p.points = 0;
    p.level = 0;
    delete p.techRootId;
    p.techIds.clear();
    p.allies.clear();
    p.territoryTiles.clear();
    p.T = 0;
    p.E = 0;
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
    resourceCountsByPlayer.set(p.id, { FARM: 0, WOOD: 0, IRON: 0, GEMS: 0 });
    playerBaseMods.set(p.id, { attack: 1, defense: 1, income: 1, vision: 1 });
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
  generateClusters(activeSeason.worldSeed);
  generateDocks(activeSeason.worldSeed);
  activeSeasonTechConfig = chooseSeasonalTechConfig(activeSeason.worldSeed);
  activeSeason.techTreeConfigId = activeSeasonTechConfig.configId;
  clearWorldProgressForSeason();
  for (const p of players.values()) spawnPlayer(p);
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

const playerTile = (x: number, y: number): Tile => {
  const wx = wrapX(x, WORLD_WIDTH);
  const wy = wrapY(y, WORLD_HEIGHT);
  const terrain = terrainAt(wx, wy);
  const baseResource = resourceAt(wx, wy);
  const resource = applyClusterResources(wx, wy, baseResource);
  const ownerId = ownership.get(key(wx, wy));
  const clusterId = clusterByTile.get(key(wx, wy));
  const clusterType = clusterId ? clustersById.get(clusterId)?.clusterType : undefined;
  const dock = docksByTile.get(key(wx, wy));
  const fort = fortsByTile.get(key(wx, wy));
  const tile: Tile = {
    x: wx,
    y: wy,
    terrain,
    lastChangedAt: now()
  };
  if (resource) tile.resource = resource;
  if (ownerId) tile.ownerId = ownerId;
  if (clusterId) tile.clusterId = clusterId;
  if (clusterType) tile.clusterType = clusterType;
  if (dock) tile.dockId = dock.dockId;
  if (fort) {
    const fortView: { ownerId: string; status: "under_construction" | "active"; completesAt?: number } = {
      ownerId: fort.ownerId,
      status: fort.status
    };
    if (fort.status === "under_construction") fortView.completesAt = fort.completesAt;
    tile.fort = fortView;
  }
  return tile;
};

const getOrInitResourceCounts = (playerId: string): Record<ResourceType, number> => {
  let counts = resourceCountsByPlayer.get(playerId);
  if (!counts) {
    counts = { FARM: 0, WOOD: 0, IRON: 0, GEMS: 0 };
    resourceCountsByPlayer.set(playerId, counts);
  }
  return counts;
};

const isAlly = (a: string, b: string): boolean => {
  const p = players.get(a);
  return Boolean(p?.allies.has(b));
};

const applyStaminaRegen = (p: Player): void => {
  const elapsed = now() - p.staminaUpdatedAt;
  const gained = Math.floor(elapsed / STAMINA_REGEN_MS);
  if (gained > 0) {
    p.stamina = Math.min(STAMINA_MAX, p.stamina + gained);
    p.staminaUpdatedAt += gained * STAMINA_REGEN_MS;
  }
};

const visible = (p: Player, x: number, y: number): boolean => {
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

const sendToPlayer = (playerId: string, payload: unknown): void => {
  const ws = socketsByPlayer.get(playerId);
  if (ws && ws.readyState === ws.OPEN) ws.send(JSON.stringify(payload));
};

const broadcast = (payload: unknown): void => {
  const serialized = JSON.stringify(payload);
  for (const ws of socketsByPlayer.values()) {
    if (ws.readyState === ws.OPEN) ws.send(serialized);
  }
};

const recomputeExposure = (p: Player): void => {
  let E = 0;
  for (const tileKey of p.territoryTiles) {
    const [x, y] = parseKey(tileKey);
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
  }
  p.E = E;
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
const chunkDist = (a: number, b: number, mod: number): number => {
  const d = Math.abs(a - b);
  return Math.min(d, mod - d);
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

const availableTechPicks = (player: Player): number => {
  // One free root pick at start, then one pick per level thereafter.
  return Math.max(0, 1 + player.level - player.techIds.size);
};

const defaultMissionStats = (): MissionStats => ({
  neutralCaptures: 0,
  enemyCaptures: 0,
  combatWins: 0,
  maxTilesHeld: 0,
  maxFarmsHeld: 0
});

const ensureMissionDefaults = (player: Player): void => {
  if (!player.missionStats) player.missionStats = defaultMissionStats();
  if (!player.missions) player.missions = [];
};

const missionProgressValue = (player: Player, kind: MissionKind): number => {
  ensureMissionDefaults(player);
  if (kind === "NEUTRAL_CAPTURES") return player.missionStats.neutralCaptures;
  if (kind === "ENEMY_CAPTURES") return player.missionStats.enemyCaptures;
  if (kind === "COMBAT_WINS") return player.missionStats.combatWins;
  if (kind === "TILES_HELD") return player.missionStats.maxTilesHeld;
  return player.missionStats.maxFarmsHeld;
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
      player.points += m.rewardPoints;
      changed = true;
    }
  }
  return changed;
};

const unlockMissions = (player: Player): boolean => {
  ensureMissionDefaults(player);
  const existing = new Set(player.missions.map((m) => m.id));
  let changed = false;
  for (const def of MISSION_DEFS) {
    if (existing.has(def.id)) continue;
    if (player.points < def.unlockPoints) continue;
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

const updateMissionState = (player: Player): boolean => {
  ensureMissionDefaults(player);
  const farms = getOrInitResourceCounts(player.id).FARM ?? 0;
  player.missionStats.maxTilesHeld = Math.max(player.missionStats.maxTilesHeld, player.T);
  player.missionStats.maxFarmsHeld = Math.max(player.missionStats.maxFarmsHeld, farms);
  const unlocked = unlockMissions(player);
  const progressed = syncMissionProgress(player);
  if (progressed) recalcPlayerDerived(player);
  return unlocked || progressed;
};

const missionPayload = (player: Player): MissionState[] => {
  ensureMissionDefaults(player);
  return player.missions.map((m) => ({ ...m }));
};

const leaderboardSnapshot = (
  actor: Player,
  limitTop = 5,
  limitRivals = 5
): {
  top: Array<{ id: string; name: string; points: number; level: number; rating: number }>;
  rivals: Array<{ id: string; name: string; points: number; level: number; rating: number }>;
} => {
  const rows = [...players.values()].map((p) => ({
    id: p.id,
    name: p.name,
    points: p.points,
    level: p.level,
    rating: ratingFromPointsLevel(p.points, p.level)
  }));
  rows.sort((a, b) => b.rating - a.rating);
  const top = rows.slice(0, limitTop);

  const actorRating = ratingFromPointsLevel(actor.points, actor.level);
  const rivals = rows
    .filter((r) => r.id !== actor.id)
    .sort((a, b) => Math.abs(a.rating - actorRating) - Math.abs(b.rating - actorRating))
    .slice(0, limitRivals);

  return { top, rivals };
};

const reachableTechs = (player: Player): string[] => {
  if (availableTechPicks(player) <= 0) return [];
  if (!player.techRootId) {
    return activeSeasonTechConfig.rootNodeIds;
  }
  if (!activeSeasonTechConfig.activeNodeIds.has(player.techRootId)) {
    // Player root from older season/tree; allow fresh root pick path.
    return activeSeasonTechConfig.rootNodeIds;
  }
  const ownedInRoot = [...player.techIds].filter((id) => techById.get(id)?.rootId === player.techRootId);
  if (ownedInRoot.length === 0) {
    // Fallback for legacy/inconsistent players: allow selecting the root again.
    return TECHS.filter((t) => !t.requires && t.rootId === player.techRootId && activeSeasonTechConfig.activeNodeIds.has(t.id)).map((t) => t.id);
  }
  const out: string[] = [];
  for (const techId of ownedInRoot) {
    for (const child of childrenByTech.get(techId) ?? []) {
      if (!activeSeasonTechConfig.activeNodeIds.has(child)) continue;
      if (!player.techIds.has(child)) out.push(child);
    }
  }
  return out;
};

const activeTechCatalog = (): Array<{
  id: string;
  name: string;
  rootId: string;
  requires?: string;
  description: string;
  mods: Partial<Record<StatsModKey, number>>;
  grantsPowerup?: { id: string; charges: number };
}> => {
  return TECHS.filter((t) => activeSeasonTechConfig.activeNodeIds.has(t.id)).map((t) => {
    const out: {
      id: string;
      name: string;
      rootId: string;
      requires?: string;
      description: string;
      mods: Partial<Record<StatsModKey, number>>;
      grantsPowerup?: { id: string; charges: number };
    } = {
      id: t.id,
      name: t.name,
      rootId: t.rootId,
      description: t.description,
      mods: t.mods ?? {}
    };
    if (t.requires) out.requires = t.requires;
    if (t.grantsPowerup) out.grantsPowerup = t.grantsPowerup;
    return out;
  });
};

const applyTech = (player: Player, techId: string): { ok: boolean; reason?: string } => {
  if (availableTechPicks(player) <= 0) return { ok: false, reason: "no tech picks available; gain a level first" };
  const tech = techById.get(techId);
  if (!tech) return { ok: false, reason: "tech not found" };
  if (!activeSeasonTechConfig.activeNodeIds.has(techId)) return { ok: false, reason: "tech is not active this season" };
  if (player.techIds.has(techId)) return { ok: false, reason: "tech already selected" };
  if (player.techRootId && !activeSeasonTechConfig.activeNodeIds.has(player.techRootId)) {
    // Old season root should not block new tree.
    delete player.techRootId;
    player.techIds.clear();
  }
  if (!player.techRootId) {
    if (tech.requires) return { ok: false, reason: "first pick must be a root tech" };
    player.techRootId = tech.rootId;
  } else {
    if (tech.rootId !== player.techRootId) return { ok: false, reason: "tech is outside locked subtree" };
    if (tech.requires && !player.techIds.has(tech.requires)) return { ok: false, reason: "required parent tech missing" };
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
  return { ok: true };
};

const countPlayerForts = (playerId: string): number => {
  let n = 0;
  for (const f of fortsByTile.values()) {
    if (f.ownerId === playerId) n += 1;
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

const tryBuildFort = (actor: Player, x: number, y: number): { ok: boolean; reason?: string } => {
  const t = playerTile(x, y);
  if (t.terrain !== "LAND") return { ok: false, reason: "fort requires land tile" };
  if (t.ownerId !== actor.id) return { ok: false, reason: "fort tile must be owned" };
  const tk = key(t.x, t.y);
  if (fortsByTile.has(tk)) return { ok: false, reason: "tile already fortified" };
  const dock = docksByTile.get(tk);
  if (!dock && !isBorderTile(t.x, t.y, actor.id)) return { ok: false, reason: "fort must be on border tile or dock" };
  if (countPlayerForts(actor.id) >= FORT_MAX_PER_PLAYER) return { ok: false, reason: "fort cap reached" };
  if (actor.points < FORT_BUILD_COST) return { ok: false, reason: "insufficient points for fort" };
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

const updateOwnership = (x: number, y: number, newOwner: string | undefined): void => {
  const t = playerTile(x, y);
  const oldOwner = t.ownerId;
  const k = key(t.x, t.y);
  const clusterId = t.clusterId;

  if (oldOwner && newOwner !== oldOwner) {
    const fort = fortsByTile.get(k);
    if (fort) {
      cancelFortBuild(k);
      fortsByTile.delete(k);
    }
  }

  if (newOwner) ownership.set(k, newOwner);
  else ownership.delete(k);

  const delta = computeOwnershipChangeDelta(
    t.x,
    t.y,
    oldOwner,
    newOwner,
    (nx, ny) => playerTile(nx, ny),
    (a, b) => isAlly(a, b)
  );

  for (const [pid, d] of delta.deltaByPlayer) {
    const p = players.get(pid);
    if (!p) continue;
    p.T += d.dT;
    p.E += d.dE;
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

  for (const p of players.values()) {
    if (!tileInSubscription(p.id, t.x, t.y)) continue;
    if (!visible(p, t.x, t.y)) continue;
    const current = playerTile(t.x, t.y);
    sendToPlayer(p.id, {
      type: "TILE_DELTA",
      updates: [current]
    });
  }
};

const spawnPlayer = (p: Player): void => {
  for (let i = 0; i < 5000; i += 1) {
    const x = Math.floor(Math.random() * WORLD_WIDTH);
    const y = Math.floor(Math.random() * WORLD_HEIGHT);
    const t = playerTile(x, y);
    if (t.terrain === "LAND" && !t.ownerId) {
      updateOwnership(x, y, p.id);
      p.spawnOrigin = key(x, y);
      p.spawnShieldUntil = now() + 120_000;
      p.isEliminated = false;
      p.respawnPending = false;
      return;
    }
  }
};

const serializePlayer = (p: Player) => ({
  ...p,
  techIds: [...p.techIds],
  territoryTiles: [...p.territoryTiles],
  allies: [...p.allies]
});

const rebuildOwnershipDerivedState = (): void => {
  for (const p of players.values()) {
    p.territoryTiles.clear();
    p.T = 0;
    p.E = 0;
    resourceCountsByPlayer.set(p.id, { FARM: 0, WOOD: 0, IRON: 0, GEMS: 0 });
    clusterControlledTilesByPlayer.set(p.id, new Map());
  }

  for (const [tk, ownerId] of [...ownership.entries()]) {
    const p = players.get(ownerId);
    if (!p) {
      ownership.delete(tk);
      continue;
    }
    const [x, y] = parseKey(tk);
    const t = playerTile(x, y);
    if (t.terrain !== "LAND") {
      ownership.delete(tk);
      continue;
    }
    p.territoryTiles.add(tk);
    p.T += 1;
    if (t.resource) getOrInitResourceCounts(ownerId)[t.resource] += 1;
    if (t.clusterId) setClusterControlDelta(ownerId, t.clusterId, 1);
  }

  for (const p of players.values()) {
    recomputeExposure(p);
    updateMissionState(p);
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
    players: [...players.values()].map(serializePlayer),
    ownership: [...ownership.entries()],
    passwords: [...passwordByName.entries()],
    resources: [...resourceCountsByPlayer.entries()],
    allianceRequests: [...allianceRequests.values()],
    forts: [...fortsByTile.values()],
    docks: [...dockById.values()],
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
    players: Array<
      Omit<Player, "techIds" | "territoryTiles" | "allies"> & {
        techIds: string[];
        territoryTiles: TileKey[];
        allies: string[];
        missions?: MissionState[];
        missionStats?: MissionStats;
      }
    >;
    ownership: [TileKey, string][];
    passwords: [string, string][];
    resources: [string, Record<ResourceType, number>][];
    allianceRequests?: AllianceRequest[];
    forts?: Fort[];
    docks?: Dock[];
    clusters?: ClusterDefinition[];
    clusterTiles?: [TileKey, string][];
    season?: Season;
    seasonArchives?: SeasonArchiveEntry[];
    seasonTechConfig?: Omit<SeasonalTechConfig, "activeNodeIds"> & { activeNodeIds: string[] };
  };
  for (const [k, v] of raw.ownership) ownership.set(k, v);
  for (const [n, p] of raw.passwords) passwordByName.set(n, p);
  for (const [pid, c] of raw.resources) resourceCountsByPlayer.set(pid, c);
  for (const request of raw.allianceRequests ?? []) allianceRequests.set(request.id, request);
  for (const f of raw.forts ?? []) fortsByTile.set(f.tileKey, f);
  for (const d of raw.docks ?? []) {
    docksByTile.set(d.tileKey, d);
    dockById.set(d.dockId, d);
  }
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
      techIds: new Set(p.techIds),
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
  }
};

loadSnapshot();
if (clustersById.size === 0 || clusterByTile.size === 0) generateClusters(activeSeason.worldSeed);
if (dockById.size === 0 || docksByTile.size === 0) generateDocks(activeSeason.worldSeed);
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
}
rebuildOwnershipDerivedState();
for (const p of players.values()) {
  if (p.T <= 0 || p.territoryTiles.size === 0) {
    spawnPlayer(p);
  }
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
setInterval(saveSnapshot, 30_000);

setInterval(() => {
  for (const [id, req] of allianceRequests) {
    if (req.expiresAt < now()) allianceRequests.delete(id);
  }
  for (const p of players.values()) {
    applyStaminaRegen(p);
    const counts = getOrInitResourceCounts(p.id);
    let incomePerMinute = 0;
    for (const [r, c] of Object.entries(counts) as [ResourceType, number][]) {
      incomePerMinute += c * resourceRate[r];
    }
    p.points += (incomePerMinute * p.mods.income) / 60;
    recalcPlayerDerived(p);
    updateMissionState(p);

    const ws = socketsByPlayer.get(p.id);
    if (ws && ws.readyState === ws.OPEN) {
      ws.send(
        JSON.stringify({
          type: "PLAYER_UPDATE",
          points: p.points,
          level: p.level,
          stamina: p.stamina,
          shieldUntil: p.spawnShieldUntil,
          defensiveness: defensivenessMultiplier(p.T, p.E),
          availableTechPicks: availableTechPicks(p),
          missions: missionPayload(p),
          leaderboard: leaderboardSnapshot(p)
        })
      );
    }
  }
}, 1_000);

setInterval(() => {
  if (now() >= activeSeason.endAt) startNewSeason();
}, 60_000);

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
app.post("/admin/season/rollover", async () => {
  startNewSeason();
  return { ok: true, activeSeason };
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
    const parsed = ClientMessageSchema.safeParse(JSON.parse(buf.toString()));
    if (!parsed.success) {
      socket.send(JSON.stringify({ type: "ERROR", code: "BAD_MSG", message: parsed.error.message }));
      return;
    }

    const msg = parsed.data;

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
          points: 0,
          level: 0,
          techIds: new Set<string>(),
          mods: { attack: 1, defense: 1, income: 1, vision: 1 },
          powerups: {},
          tileColor: colorFromId(name),
          missions: [],
          missionStats: defaultMissionStats(),
          territoryTiles: new Set<TileKey>(),
          T: 0,
          E: 0,
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
        spawnPlayer(player);
      }
      if (player.T <= 0 || player.territoryTiles.size === 0) {
        spawnPlayer(player);
      }
      if (!player.tileColor) {
        player.tileColor = colorFromId(player.id);
      }
      ensureMissionDefaults(player);
      updateMissionState(player);
      if (!player) {
        socket.send(JSON.stringify({ type: "ERROR", code: "AUTH_FAIL", message: "player initialization failed" }));
        return;
      }

      authedPlayer = player;
      tokenToPlayerId.set(msg.token, player.id);
      socketsByPlayer.set(player.id, socket);
      socket.send(
        JSON.stringify({
          type: "INIT",
          player: {
            id: player.id,
            name: player.name,
            points: player.points,
            level: player.level,
            stamina: player.stamina,
            T: player.T,
            E: player.E,
            techRootId: player.techRootId,
            techIds: [...player.techIds],
            allies: [...player.allies],
            tileColor: player.tileColor,
            homeTile: playerHomeTile(player),
            availableTechPicks: availableTechPicks(player)
          },
          config: {
            width: WORLD_WIDTH,
            height: WORLD_HEIGHT,
            chunkSize: CHUNK_SIZE,
            visionRadius: VISION_RADIUS,
            season: activeSeason,
            seasonTechTreeId: activeSeason.techTreeConfigId
          },
          techChoices: reachableTechs(player),
          techCatalog: activeTechCatalog(),
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

    if (msg.type === "PING") {
      socket.send(JSON.stringify({ type: "PONG", t: msg.t }));
      return;
    }

    if (msg.type === "SET_TILE_COLOR") {
      actor.tileColor = msg.color;
      broadcast({ type: "PLAYER_STYLE", playerId: actor.id, tileColor: actor.tileColor });
      return;
    }

    if (msg.type === "BUILD_FORT") {
      const out = tryBuildFort(actor, msg.x, msg.y);
      if (!out.ok) {
        socket.send(JSON.stringify({ type: "ERROR", code: "FORT_BUILD_INVALID", message: out.reason }));
        return;
      }
      updateOwnership(msg.x, msg.y, actor.id);
      socket.send(
        JSON.stringify({
          type: "PLAYER_UPDATE",
          points: actor.points,
          level: actor.level,
          stamina: actor.stamina,
          shieldUntil: actor.spawnShieldUntil,
          defensiveness: defensivenessMultiplier(actor.T, actor.E),
          availableTechPicks: availableTechPicks(actor),
          missions: missionPayload(actor),
          leaderboard: leaderboardSnapshot(actor)
        })
      );
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
          powerups: actor.powerups,
          nextChoices: reachableTechs(actor),
          availableTechPicks: availableTechPicks(actor),
          missions: missionPayload(actor),
          techCatalog: activeTechCatalog()
        })
      );
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
      chunkSubscriptionByPlayer.set(actor.id, { cx: msg.cx, cy: msg.cy, radius: msg.radius });
      const updates: Tile[] = [];
      for (let cy = msg.cy - msg.radius; cy <= msg.cy + msg.radius; cy += 1) {
        for (let cx = msg.cx - msg.radius; cx <= msg.cx + msg.radius; cx += 1) {
          const worldCx = wrapChunkX(cx);
          const worldCy = wrapChunkY(cy);
          const startX = worldCx * CHUNK_SIZE;
          const startY = worldCy * CHUNK_SIZE;

          for (let y = startY; y < startY + CHUNK_SIZE; y += 1) {
            for (let x = startX; x < startX + CHUNK_SIZE; x += 1) {
              const tile = playerTile(x, y);
              if (visible(actor, x, y)) {
                updates.push(tile);
              } else {
                updates.push({ x: tile.x, y: tile.y, terrain: tile.terrain, lastChangedAt: tile.lastChangedAt });
              }
            }
          }

          socket.send(JSON.stringify({ type: "CHUNK_FULL", cx: worldCx, cy: worldCy, tilesMaskedByFog: updates }));
          updates.length = 0;
        }
      }
      return;
    }

    if (msg.type !== "ATTACK" && msg.type !== "EXPAND") return;

    const actionTimes = (actionTimestampsByPlayer.get(actor.id) ?? []).filter((t) => now() - t <= ACTION_WINDOW_MS);
    if (actionTimes.length >= ACTION_LIMIT) {
      socket.send(JSON.stringify({ type: "ERROR", code: "RATE_LIMIT", message: "too many actions; slow down briefly" }));
      return;
    }
    actionTimes.push(now());
    actionTimestampsByPlayer.set(actor.id, actionTimes);

    applyStaminaRegen(actor);
    const staminaCost = msg.type === "ATTACK" ? 1 : 0;
    if (actor.stamina < staminaCost) {
      socket.send(JSON.stringify({ type: "ERROR", code: "NO_STAMINA", message: "insufficient stamina" }));
      return;
    }

    const from = playerTile(msg.fromX, msg.fromY);
    const to = playerTile(msg.toX, msg.toY);
    const fk = key(from.x, from.y);
    const tk = key(to.x, to.y);
    const fromDock = docksByTile.get(fk);
    const adjacent = isAdjacentTile(from.x, from.y, to.x, to.y);
    const dockCrossing = Boolean(fromDock && validDockCrossingTarget(fromDock, to.x, to.y));
    if (!adjacent && !dockCrossing) {
      socket.send(JSON.stringify({ type: "ERROR", code: "NOT_ADJACENT", message: "target must be adjacent or valid dock crossing" }));
      return;
    }
    if (dockCrossing && fromDock && fromDock.cooldownUntil > now()) {
      socket.send(JSON.stringify({ type: "ERROR", code: "DOCK_COOLDOWN", message: "dock crossing endpoint on cooldown" }));
      return;
    }

    if (from.ownerId !== actor.id) {
      socket.send(JSON.stringify({ type: "ERROR", code: "NOT_OWNER", message: "origin not owned" }));
      return;
    }

    if (to.terrain !== "LAND") {
      socket.send(JSON.stringify({ type: "ERROR", code: "BARRIER", message: "target is barrier" }));
      return;
    }

    if (combatLocks.has(fk) || combatLocks.has(tk)) {
      socket.send(JSON.stringify({ type: "ERROR", code: "LOCKED", message: "tile locked in combat" }));
      return;
    }

    const defender = to.ownerId ? players.get(to.ownerId) : undefined;
    if (defender && actor.allies.has(defender.id)) {
      socket.send(JSON.stringify({ type: "ERROR", code: "ALLY_TARGET", message: "cannot attack allied tile" }));
      return;
    }
    const resolvesAt = now() + COMBAT_LOCK_MS;
    combatLocks.set(fk, { resolvesAt, origin: fk, target: tk });
    combatLocks.set(tk, { resolvesAt, origin: fk, target: tk });
    if (dockCrossing && fromDock) fromDock.cooldownUntil = now() + DOCK_CROSSING_COOLDOWN_MS;

    socket.send(JSON.stringify({ type: "COMBAT_START", origin: { x: from.x, y: from.y }, target: { x: to.x, y: to.y }, resolvesAt }));

    setTimeout(() => {
      combatLocks.delete(fk);
      combatLocks.delete(tk);

      if (!defender) {
        actor.stamina -= staminaCost;
        updateOwnership(to.x, to.y, actor.id);
        actor.missionStats.neutralCaptures += 1;
        updateMissionState(actor);
        socket.send(JSON.stringify({ type: "COMBAT_RESULT", winnerId: actor.id, changes: [{ x: to.x, y: to.y, ownerId: actor.id }], pointsDelta: 0, levelDelta: 0 }));
        return;
      }

      if (defender.spawnShieldUntil > now()) {
        socket.send(JSON.stringify({ type: "ERROR", code: "SHIELDED", message: "target shielded" }));
        return;
      }

      actor.stamina -= staminaCost;

      const atkEff = 10 * actor.mods.attack * randomFactor();
      const defMult = defensivenessMultiplier(defender.T, defender.E);
      const fortOnTarget = fortsByTile.get(tk);
      const fortMult = fortOnTarget?.status === "active" && fortOnTarget.ownerId === defender.id ? FORT_DEFENSE_MULT : 1;
      const dockMult = docksByTile.has(tk) ? DOCK_DEFENSE_MULT : 1;
      const defEff = 10 * defender.mods.defense * defMult * fortMult * dockMult * randomFactor();
      const p = combatWinChance(atkEff, defEff);
      const win = Math.random() < p;

      let pointsDelta = 0;
      if (win) {
        updateOwnership(to.x, to.y, actor.id);
        actor.missionStats.enemyCaptures += 1;
        actor.missionStats.combatWins += 1;
        const attackerRating = ratingFromPointsLevel(actor.points, actor.level);
        const defenderRating = ratingFromPointsLevel(defender.points, defender.level);
        const pairKey = pairKeyFor(actor.id, defender.id);
        const entries = (repeatFights.get(pairKey) ?? []).filter((ts) => now() - ts <= PVP_REPEAT_WINDOW_MS);
        entries.push(now());
        repeatFights.set(pairKey, entries);
        const repeatMult = Math.max(PVP_REPEAT_FLOOR, 0.5 ** (entries.length - 1));
        pointsDelta = actor.allies.has(defender.id) ? 0 : pvpPointsReward(baseTileValue(to.resource), attackerRating, defenderRating) * repeatMult;
        actor.points += pointsDelta;
      } else {
        updateOwnership(from.x, from.y, defender.id);
        defender.missionStats.enemyCaptures += 1;
        defender.missionStats.combatWins += 1;
        const attackerRating = ratingFromPointsLevel(defender.points, defender.level);
        const defenderRating = ratingFromPointsLevel(actor.points, actor.level);
        pointsDelta = actor.allies.has(defender.id) ? 0 : pvpPointsReward(baseTileValue(from.resource), attackerRating, defenderRating);
        defender.points += pointsDelta;
      }

      recalcPlayerDerived(actor);
      recalcPlayerDerived(defender);
      updateMissionState(actor);
      updateMissionState(defender);

      if (actor.T === 0) {
        actor.isEliminated = true;
        actor.points *= 0.7;
        spawnPlayer(actor);
      }
      if (defender.T === 0) {
        defender.isEliminated = true;
        defender.points *= 0.7;
        if (socketsByPlayer.has(defender.id)) spawnPlayer(defender);
        else defender.respawnPending = true;
      }

      socket.send(JSON.stringify({
        type: "COMBAT_RESULT",
        winnerId: win ? actor.id : defender.id,
        changes: win ? [{ x: to.x, y: to.y, ownerId: actor.id }] : [{ x: from.x, y: from.y, ownerId: defender.id }],
        pointsDelta,
        levelDelta: 0
      }));
    }, COMBAT_LOCK_MS);
  });

  socket.on("close", () => {
    if (authedPlayer) {
      socketsByPlayer.delete(authedPlayer.id);
      chunkSubscriptionByPlayer.delete(authedPlayer.id);
      actionTimestampsByPlayer.delete(authedPlayer.id);
    }
  });
});

await app.listen({ host: "0.0.0.0", port: PORT });

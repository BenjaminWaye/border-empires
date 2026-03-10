import Fastify from "fastify";
import websocket from "@fastify/websocket";
import {
  CHUNK_SIZE,
  ClientMessageSchema,
  COMBAT_LOCK_MS,
  PVP_REPEAT_FLOOR,
  PVP_REPEAT_WINDOW_MS,
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
  wrapX,
  wrapY,
  type Player,
  type ResourceType,
  type Terrain,
  type Tile,
  type TileKey
} from "@border-empires/shared";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const PORT = 3001;
const SNAPSHOT_DIR = path.resolve(process.cwd(), "snapshots");
const SNAPSHOT_FILE = path.join(SNAPSHOT_DIR, "state.json");

type Ws = import("ws").WebSocket;
type StatsModKey = "attack" | "defense" | "income" | "vision";

interface TechDef {
  id: string;
  rootId: string;
  name: string;
  description: string;
  requires?: string;
  mods?: Partial<Record<StatsModKey, number>>;
  grantsPowerup?: { id: string; charges: number };
}

interface AllianceRequest {
  id: string;
  fromPlayerId: string;
  toPlayerId: string;
  createdAt: number;
  expiresAt: number;
}

const key = (x: number, y: number): TileKey => `${x},${y}`;
const parseKey = (k: TileKey): [number, number] => {
  const [xs, ys] = k.split(",");
  return [Number(xs), Number(ys)];
};

const now = (): number => Date.now();
const ALLIANCE_REQUEST_TTL_MS = 5 * 60_000;
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

const TECHS: TechDef[] = [
  { id: "warlord-core", rootId: "warlord-core", name: "Warlord Core", description: "A militant doctrine.", mods: { attack: 1.1 } },
  { id: "warlord-blitz", rootId: "warlord-core", requires: "warlord-core", name: "Blitz Drills", description: "Faster strike prep.", mods: { attack: 1.08 } },
  { id: "warlord-bastion", rootId: "warlord-core", requires: "warlord-core", name: "Iron Wall", description: "Counter-pressure defense.", mods: { defense: 1.08 } },
  { id: "warden-core", rootId: "warden-core", name: "Warden Core", description: "Stoic border science.", mods: { defense: 1.1 } },
  { id: "warden-terrain", rootId: "warden-core", requires: "warden-core", name: "Terrain Study", description: "Use front geometry better.", mods: { defense: 1.08 } },
  { id: "warden-outposts", rootId: "warden-core", requires: "warden-core", name: "Outpost Optics", description: "Expanded surveillance grid.", mods: { vision: 1.2 } },
  { id: "guild-core", rootId: "guild-core", name: "Guild Core", description: "Commercial expansion policy.", mods: { income: 1.1 } },
  { id: "guild-agri", rootId: "guild-core", requires: "guild-core", name: "Agrarian Logistics", description: "Higher farming throughput.", mods: { income: 1.1 } },
  { id: "guild-reserve", rootId: "guild-core", requires: "guild-core", name: "War Reserve", description: "Stored military ration packs.", grantsPowerup: { id: "overdrive", charges: 1 } }
];

const techById = new Map(TECHS.map((t) => [t.id, t]));
const childrenByTech = new Map<string, string[]>();
for (const tech of TECHS) {
  if (!tech.requires) continue;
  const children = childrenByTech.get(tech.requires) ?? [];
  children.push(tech.id);
  childrenByTech.set(tech.requires, children);
}

const validateTechTree = (): void => {
  for (const tech of TECHS) {
    if (tech.requires && !techById.has(tech.requires)) {
      throw new Error(`Tech ${tech.id} references missing parent ${tech.requires}`);
    }
  }
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const dfs = (id: string): void => {
    if (visited.has(id)) return;
    if (visiting.has(id)) throw new Error(`Tech cycle detected at ${id}`);
    visiting.add(id);
    for (const child of childrenByTech.get(id) ?? []) dfs(child);
    visiting.delete(id);
    visited.add(id);
  };
  for (const root of TECHS.filter((t) => !t.requires)) dfs(root.id);
};

const seeded01 = (x: number, y: number, seed: number): number => {
  const n = Math.sin((x * 12.9898 + y * 78.233 + seed * 43758.5453) % 100000) * 43758.5453123;
  return n - Math.floor(n);
};

const terrainAt = (x: number, y: number): Terrain => {
  const v = seeded01(x, y, 42);
  if (v < 0.1) return "SEA";
  if (v > 0.93) return "MOUNTAIN";
  return "LAND";
};

const resourceAt = (x: number, y: number): ResourceType | undefined => {
  const t = terrainAt(x, y);
  if (t !== "LAND") return undefined;
  const v = seeded01(x, y, 77);
  if (v < 0.08) return "FARM";
  if (v < 0.11) return "WOOD";
  if (v < 0.125) return "IRON";
  if (v < 0.13) return "GEMS";
  return undefined;
};

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

const playerTile = (x: number, y: number): Tile => {
  const wx = wrapX(x, WORLD_WIDTH);
  const wy = wrapY(y, WORLD_HEIGHT);
  const terrain = terrainAt(wx, wy);
  const resource = resourceAt(wx, wy);
  const ownerId = ownership.get(key(wx, wy));
  const tile: Tile = {
    x: wx,
    y: wy,
    terrain,
    lastChangedAt: now()
  };
  if (resource) tile.resource = resource;
  if (ownerId) tile.ownerId = ownerId;
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

const reachableTechs = (player: Player): string[] => {
  if (!player.techRootId) {
    return TECHS.filter((t) => !t.requires).map((t) => t.id);
  }
  const ownedInRoot = [...player.techIds].filter((id) => techById.get(id)?.rootId === player.techRootId);
  if (ownedInRoot.length === 0) {
    // Fallback for legacy/inconsistent players: allow selecting the root again.
    return TECHS.filter((t) => !t.requires && t.rootId === player.techRootId).map((t) => t.id);
  }
  const out: string[] = [];
  for (const techId of ownedInRoot) {
    for (const child of childrenByTech.get(techId) ?? []) {
      if (!player.techIds.has(child)) out.push(child);
    }
  }
  return out;
};

const applyTech = (player: Player, techId: string): { ok: boolean; reason?: string } => {
  const tech = techById.get(techId);
  if (!tech) return { ok: false, reason: "tech not found" };
  if (player.techIds.has(techId)) return { ok: false, reason: "tech already selected" };
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
  if (tech.grantsPowerup) {
    player.powerups[tech.grantsPowerup.id] = (player.powerups[tech.grantsPowerup.id] ?? 0) + tech.grantsPowerup.charges;
  }
  return { ok: true };
};

const updateOwnership = (x: number, y: number, newOwner: string | undefined): void => {
  const t = playerTile(x, y);
  const oldOwner = t.ownerId;
  const k = key(t.x, t.y);
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
    }
  }

  if (newOwner) {
    const p = players.get(newOwner);
    if (p) {
      p.territoryTiles.add(k);
      const r = t.resource;
      if (r) getOrInitResourceCounts(newOwner)[r] += 1;
    }
  }

  for (const p of players.values()) {
    if (!visible(p, t.x, t.y)) continue;
    sendToPlayer(p.id, {
      type: "TILE_DELTA",
      updates: [{ x: t.x, y: t.y, ownerId: newOwner, terrain: t.terrain, resource: t.resource }]
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
      if (!p.spawnOrigin) p.spawnOrigin = key(x, y);
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
    allianceRequests: [...allianceRequests.values()]
  };
  fs.writeFileSync(SNAPSHOT_FILE, JSON.stringify(payload));
};

const loadSnapshot = (): void => {
  if (!fs.existsSync(SNAPSHOT_FILE)) return;
  const raw = JSON.parse(fs.readFileSync(SNAPSHOT_FILE, "utf8")) as {
    players: Array<Omit<Player, "techIds" | "territoryTiles" | "allies"> & { techIds: string[]; territoryTiles: TileKey[]; allies: string[] }>;
    ownership: [TileKey, string][];
    passwords: [string, string][];
    resources: [string, Record<ResourceType, number>][];
    allianceRequests?: AllianceRequest[];
  };
  for (const [k, v] of raw.ownership) ownership.set(k, v);
  for (const [n, p] of raw.passwords) passwordByName.set(n, p);
  for (const [pid, c] of raw.resources) resourceCountsByPlayer.set(pid, c);
  for (const request of raw.allianceRequests ?? []) allianceRequests.set(request.id, request);
  for (const p of raw.players) {
    players.set(p.id, {
      ...p,
      techIds: new Set(p.techIds),
      territoryTiles: new Set(p.territoryTiles),
      allies: new Set(p.allies)
    });
  }
};

validateTechTree();
loadSnapshot();
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

    const ws = socketsByPlayer.get(p.id);
    if (ws && ws.readyState === ws.OPEN) {
      ws.send(
        JSON.stringify({
          type: "PLAYER_UPDATE",
          points: p.points,
          level: p.level,
          stamina: p.stamina,
          shieldUntil: p.spawnShieldUntil,
          defensiveness: defensivenessMultiplier(p.T, p.E)
        })
      );
    }
  }
}, 1_000);

const app = Fastify({ logger: true });
await app.register(websocket as never);

app.get("/health", async () => ({ ok: true }));

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
        spawnPlayer(player);
      }
      if (player.T <= 0 || player.territoryTiles.size === 0) {
        spawnPlayer(player);
      }
      if (!player.tileColor) {
        player.tileColor = colorFromId(player.id);
      }
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
            homeTile: playerHomeTile(player)
          },
          config: { width: WORLD_WIDTH, height: WORLD_HEIGHT, chunkSize: CHUNK_SIZE, visionRadius: VISION_RADIUS },
          techChoices: reachableTechs(player),
          techCatalog: TECHS.map((t) => ({ id: t.id, name: t.name, rootId: t.rootId, requires: t.requires })),
          playerStyles: exportPlayerStyles(),
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

    if (msg.type === "CHOOSE_TECH") {
      const outcome = applyTech(actor, msg.techId);
      if (!outcome.ok) {
        socket.send(JSON.stringify({ type: "ERROR", code: "TECH_INVALID", message: outcome.reason }));
        return;
      }
      socket.send(
        JSON.stringify({
          type: "TECH_UPDATE",
          techRootId: actor.techRootId,
          techIds: [...actor.techIds],
          mods: actor.mods,
          powerups: actor.powerups,
          nextChoices: reachableTechs(actor),
          techCatalog: TECHS.map((t) => ({ id: t.id, name: t.name, rootId: t.rootId, requires: t.requires }))
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
      const updates: Tile[] = [];
      for (let cy = msg.cy - msg.radius; cy <= msg.cy + msg.radius; cy += 1) {
        for (let cx = msg.cx - msg.radius; cx <= msg.cx + msg.radius; cx += 1) {
          const worldCx = ((cx % Math.ceil(WORLD_WIDTH / CHUNK_SIZE)) + Math.ceil(WORLD_WIDTH / CHUNK_SIZE)) % Math.ceil(WORLD_WIDTH / CHUNK_SIZE);
          const worldCy = ((cy % Math.ceil(WORLD_HEIGHT / CHUNK_SIZE)) + Math.ceil(WORLD_HEIGHT / CHUNK_SIZE)) % Math.ceil(WORLD_HEIGHT / CHUNK_SIZE);
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

    applyStaminaRegen(actor);
    const staminaCost = msg.type === "ATTACK" ? 1 : 0;
    if (actor.stamina < staminaCost) {
      socket.send(JSON.stringify({ type: "ERROR", code: "NO_STAMINA", message: "insufficient stamina" }));
      return;
    }

    const from = playerTile(msg.fromX, msg.fromY);
    const to = playerTile(msg.toX, msg.toY);
    const manhattan = Math.abs(from.x - to.x) + Math.abs(from.y - to.y);
    if (manhattan !== 1 && !(Math.abs(from.x - to.x) === WORLD_WIDTH - 1 && from.y === to.y) && !(Math.abs(from.y - to.y) === WORLD_HEIGHT - 1 && from.x === to.x)) {
      socket.send(JSON.stringify({ type: "ERROR", code: "NOT_ADJACENT", message: "must be N/E/S/W adjacent" }));
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

    const fk = key(from.x, from.y);
    const tk = key(to.x, to.y);
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

    socket.send(JSON.stringify({ type: "COMBAT_START", origin: { x: from.x, y: from.y }, target: { x: to.x, y: to.y }, resolvesAt }));

    setTimeout(() => {
      combatLocks.delete(fk);
      combatLocks.delete(tk);

      if (!defender) {
        actor.stamina -= staminaCost;
        updateOwnership(to.x, to.y, actor.id);
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
      const defEff = 10 * defender.mods.defense * defMult * randomFactor();
      const p = combatWinChance(atkEff, defEff);
      const win = Math.random() < p;

      let pointsDelta = 0;
      if (win) {
        updateOwnership(to.x, to.y, actor.id);
        const attackerRating = ratingFromPointsLevel(actor.points, actor.level);
        const defenderRating = ratingFromPointsLevel(defender.points, defender.level);
        const pairKey = `${actor.id}:${defender.id}`;
        const entries = (repeatFights.get(pairKey) ?? []).filter((ts) => now() - ts <= PVP_REPEAT_WINDOW_MS);
        entries.push(now());
        repeatFights.set(pairKey, entries);
        const repeatMult = Math.max(PVP_REPEAT_FLOOR, 0.5 ** (entries.length - 1));
        pointsDelta = actor.allies.has(defender.id) ? 0 : pvpPointsReward(baseTileValue(to.resource), attackerRating, defenderRating) * repeatMult;
        actor.points += pointsDelta;
      } else {
        updateOwnership(from.x, from.y, defender.id);
        const attackerRating = ratingFromPointsLevel(defender.points, defender.level);
        const defenderRating = ratingFromPointsLevel(actor.points, actor.level);
        pointsDelta = actor.allies.has(defender.id) ? 0 : pvpPointsReward(baseTileValue(from.resource), attackerRating, defenderRating);
        defender.points += pointsDelta;
      }

      recalcPlayerDerived(actor);
      recalcPlayerDerived(defender);

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
    if (authedPlayer) socketsByPlayer.delete(authedPlayer.id);
  });
});

await app.listen({ host: "0.0.0.0", port: PORT });

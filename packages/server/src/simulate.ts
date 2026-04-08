import WebSocket from "ws";
import { CHUNK_SIZE, WORLD_HEIGHT, WORLD_WIDTH } from "@border-empires/shared";

type Tile = { x: number; y: number; terrain: "LAND" | "SEA" | "MOUNTAIN"; ownerId?: string };

type Bot = {
  name: string;
  ws: WebSocket;
  me?: string;
  known: Map<string, Tile>;
  owned: Set<string>;
  connected: boolean;
};

const SERVER_URL = process.env.SERVER_URL ?? "ws://localhost:3001/ws";
const BOTS = Number(process.env.BOTS ?? 40);
const ACTIONS_PER_MIN = Number(process.env.APM ?? 600);
const DURATION_SEC = Number(process.env.DURATION_SEC ?? 120);

const key = (x: number, y: number): string => `${x},${y}`;
const wrapX = (x: number): number => (x + WORLD_WIDTH) % WORLD_WIDTH;
const wrapY = (y: number): number => (y + WORLD_HEIGHT) % WORLD_HEIGHT;
const neighborOffsets: ReadonlyArray<readonly [dx: number, dy: number]> = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0]
];

const bots: Bot[] = [];
let actionsSent = 0;
let actionErrors = 0;
const pickRandomOwnedTile = (bot: Bot): Tile | undefined => {
  if (bot.owned.size === 0) return undefined;
  const targetIndex = Math.floor(Math.random() * bot.owned.size);
  let currentIndex = 0;
  for (const tileKey of bot.owned) {
    if (currentIndex === targetIndex) return bot.known.get(tileKey);
    currentIndex += 1;
  }
  return undefined;
};

const subscribeAround = (bot: Bot, x: number, y: number): void => {
  const cx = Math.floor(x / CHUNK_SIZE);
  const cy = Math.floor(y / CHUNK_SIZE);
  bot.ws.send(JSON.stringify({ type: "SUBSCRIBE_CHUNKS", cx, cy, radius: 2 }));
};

const registerBot = (idx: number): Bot => {
  const name = `bot_${idx}_${Math.random().toString(36).slice(2, 8)}`;
  const ws = new WebSocket(SERVER_URL);
  const bot: Bot = { name, ws, known: new Map(), owned: new Set(), connected: false };

  ws.on("open", () => {
    bot.connected = true;
    ws.send(JSON.stringify({ type: "AUTH", token: `${name}:pw` }));
  });

  ws.on("message", (buf) => {
    const msg = JSON.parse(buf.toString()) as Record<string, unknown>;
    if (msg.type === "INIT") {
      const p = msg.player as Record<string, unknown>;
      bot.me = p.id as string;
      const home = p.homeTile as { x: number; y: number } | undefined;
      if (home) subscribeAround(bot, home.x, home.y);
    }

    if (msg.type === "CHUNK_FULL") {
      const tiles = (msg.tilesMaskedByFog as Tile[]) ?? [];
      for (const t of tiles) {
        bot.known.set(key(t.x, t.y), t);
        if (bot.me && t.ownerId === bot.me) bot.owned.add(key(t.x, t.y));
      }
    }

    if (msg.type === "TILE_DELTA") {
      const updates = (msg.updates as Tile[]) ?? [];
      for (const t of updates) {
        const prev = bot.known.get(key(t.x, t.y));
        bot.known.set(key(t.x, t.y), { ...(prev ?? { x: t.x, y: t.y, terrain: "LAND" }), ...t });
        if (bot.me) {
          if (t.ownerId === bot.me) bot.owned.add(key(t.x, t.y));
          else bot.owned.delete(key(t.x, t.y));
        }
      }
    }

    if (msg.type === "ERROR") actionErrors += 1;
  });

  ws.on("close", () => {
    bot.connected = false;
  });

  ws.on("error", () => {
    bot.connected = false;
  });

  return bot;
};

for (let i = 0; i < BOTS; i += 1) bots.push(registerBot(i));

const chooseAction = (bot: Bot): { from: Tile; to: Tile; kind: "EXPAND" | "ATTACK" } | undefined => {
  if (!bot.me) return undefined;
  if (bot.owned.size === 0) return undefined;

  for (let i = 0; i < 20; i += 1) {
    const from = pickRandomOwnedTile(bot);
    if (!from) return undefined;
    for (const [dx, dy] of neighborOffsets) {
      const nx = wrapX(from.x + dx);
      const ny = wrapY(from.y + dy);
      const target = bot.known.get(key(nx, ny));
      if (!target || target.terrain !== "LAND") continue;
      if (!target.ownerId) return { from, to: target, kind: "EXPAND" };
      if (target.ownerId !== bot.me) return { from, to: target, kind: "ATTACK" };
    }
  }

  return undefined;
};

const intervalMs = Math.max(25, Math.floor(60_000 / ACTIONS_PER_MIN));
const startedAt = Date.now();
const actionTimer = setInterval(() => {
  let action: { from: Tile; to: Tile; kind: "EXPAND" | "ATTACK" } | undefined;
  let bot: Bot | undefined;
  for (let i = 0; i < bots.length; i += 1) {
    const candidate = bots[Math.floor(Math.random() * bots.length)];
    if (!candidate?.connected || !candidate.me) continue;
    bot = candidate;
    action = chooseAction(candidate);
    if (action) break;
  }
  if (!bot || !action) return;

  bot.ws.send(
    JSON.stringify({
      type: action.kind,
      fromX: action.from.x,
      fromY: action.from.y,
      toX: action.to.x,
      toY: action.to.y
    })
  );
  actionsSent += 1;

  if (Math.random() < 0.2) subscribeAround(bot, action.from.x, action.from.y);
}, intervalMs);

setTimeout(() => {
  clearInterval(actionTimer);
  for (const b of bots) {
    try {
      b.ws.close();
    } catch {
      // ignore close race
    }
  }
  const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
  console.log(`Load sim complete in ${elapsed}s`);
  console.log(`Bots: ${BOTS}`);
  console.log(`Actions sent: ${actionsSent}`);
  console.log(`Approx actions/min: ${Math.round((actionsSent / Number(elapsed)) * 60)}`);
  console.log(`Server errors seen: ${actionErrors}`);
  process.exit(0);
}, DURATION_SEC * 1000);

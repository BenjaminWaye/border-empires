import "./style.css";
import { CHUNK_SIZE, WORLD_HEIGHT, WORLD_WIDTH } from "@border-empires/shared";

type Tile = {
  x: number;
  y: number;
  terrain: "LAND" | "SEA" | "MOUNTAIN";
  resource?: string;
  ownerId?: string;
};

type AllianceRequest = {
  id: string;
  fromPlayerId: string;
  toPlayerId: string;
  createdAt: number;
  expiresAt: number;
};
type TechInfo = { id: string; name: string; rootId: string; requires?: string };

const canvas = document.querySelector<HTMLCanvasElement>("#game");
const hud = document.querySelector<HTMLDivElement>("#hud");
if (!canvas || !hud) throw new Error("missing DOM roots");

const ctx = canvas.getContext("2d");
if (!ctx) throw new Error("missing 2d context");

hud.innerHTML = `
  <div id="stats"></div>
  <div id="selected"></div>
  <div class="row">
    <button id="center-me">Center On My Tile</button>
    <button id="refresh">Refresh View</button>
  </div>
  <div class="row">
    <input id="tile-color" type="color" value="#38b000" />
    <button id="set-color">Set My Tile Color</button>
  </div>
  <div class="row">
    <input id="alliance-target" placeholder="ally player name" />
    <button id="alliance-send">Send</button>
  </div>
  <div class="row">
    <input id="alliance-break-id" placeholder="break by player id" />
    <button id="alliance-break">Break</button>
  </div>
  <div class="row">
    <select id="tech-pick"></select>
    <button id="tech-choose">Choose Tech</button>
  </div>
  <div id="alliance-requests"></div>
  <div id="feed"></div>
`;

const statsEl = document.querySelector<HTMLDivElement>("#stats");
const selectedEl = document.querySelector<HTMLDivElement>("#selected");
const feedEl = document.querySelector<HTMLDivElement>("#feed");
const techPickEl = document.querySelector<HTMLSelectElement>("#tech-pick");
const allianceTargetEl = document.querySelector<HTMLInputElement>("#alliance-target");
const allianceBreakIdEl = document.querySelector<HTMLInputElement>("#alliance-break-id");
const allianceRequestsEl = document.querySelector<HTMLDivElement>("#alliance-requests");
const allianceSendBtn = document.querySelector<HTMLButtonElement>("#alliance-send");
const allianceBreakBtn = document.querySelector<HTMLButtonElement>("#alliance-break");
const techChooseBtn = document.querySelector<HTMLButtonElement>("#tech-choose");
const centerMeBtn = document.querySelector<HTMLButtonElement>("#center-me");
const refreshBtn = document.querySelector<HTMLButtonElement>("#refresh");
const tileColorInput = document.querySelector<HTMLInputElement>("#tile-color");
const setColorBtn = document.querySelector<HTMLButtonElement>("#set-color");
if (!statsEl || !selectedEl || !feedEl || !techPickEl || !allianceTargetEl || !allianceBreakIdEl || !allianceRequestsEl || !allianceSendBtn || !allianceBreakBtn || !techChooseBtn || !centerMeBtn || !refreshBtn || !tileColorInput || !setColorBtn) {
  throw new Error("hud elements missing");
}

const state = {
  me: "",
  meName: "",
  connection: "connecting" as "connecting" | "connected" | "initialized" | "disconnected",
  points: 0,
  level: 0,
  stamina: 0,
  selected: undefined as { x: number; y: number } | undefined,
  homeTile: undefined as { x: number; y: number } | undefined,
  tiles: new Map<string, Tile>(),
  camX: 0,
  camY: 0,
  zoom: 22,
  techRootId: undefined as string | undefined,
  techIds: [] as string[],
  techChoices: [] as string[],
  techCatalog: [] as TechInfo[],
  allies: [] as string[],
  playerColors: new Map<string, string>(),
  incomingAllianceRequests: [] as AllianceRequest[],
  feed: [] as string[]
};

const key = (x: number, y: number): string => `${x},${y}`;
const wrapX = (x: number): number => (x + WORLD_WIDTH) % WORLD_WIDTH;
const wrapY = (y: number): number => (y + WORLD_HEIGHT) % WORLD_HEIGHT;
const hashString = (s: string): number => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
};
const ownerColor = (ownerId: string): string => {
  const h = hashString(ownerId) % 360;
  return `hsl(${h} 70% 48%)`;
};
const effectiveColor = (ownerId: string): string => state.playerColors.get(ownerId) ?? ownerColor(ownerId);
const seeded01 = (x: number, y: number, seed: number): number => {
  const n = Math.sin((x * 12.9898 + y * 78.233 + seed * 43758.5453) % 100000) * 43758.5453123;
  return n - Math.floor(n);
};
const terrainAt = (x: number, y: number): Tile["terrain"] => {
  const v = seeded01(x, y, 42);
  if (v < 0.1) return "SEA";
  if (v > 0.93) return "MOUNTAIN";
  return "LAND";
};

const pushFeed = (msg: string): void => {
  state.feed.unshift(msg);
  state.feed = state.feed.slice(0, 7);
};

const centerOnOwnedTile = (): void => {
  const own = [...state.tiles.values()].find((t) => t.ownerId === state.me);
  if (own) {
    state.camX = own.x;
    state.camY = own.y;
    return;
  }
  if (state.homeTile) {
    state.camX = state.homeTile.x;
    state.camY = state.homeTile.y;
  }
};

const requestViewRefresh = (): void => {
  if (ws.readyState !== ws.OPEN) return;
  ws.send(
    JSON.stringify({
      type: "SUBSCRIBE_CHUNKS",
      cx: Math.floor(state.camX / CHUNK_SIZE),
      cy: Math.floor(state.camY / CHUNK_SIZE),
      radius: 2
    })
  );
};

const selectedTile = (): Tile | undefined => {
  if (!state.selected) return undefined;
  return state.tiles.get(key(state.selected.x, state.selected.y));
};

const renderHud = (): void => {
  statsEl.textContent = `${state.meName || "Player"} | ${state.connection.toUpperCase()} | Points ${state.points.toFixed(1)} | Level ${state.level} | Stamina ${state.stamina} | Allies ${state.allies.length}`;

  const selected = selectedTile();
  if (!selected) {
    selectedEl.textContent = "Select one of your tiles, then click adjacent land to expand or enemy tile to attack.";
  } else {
    selectedEl.textContent = `Selected (${selected.x}, ${selected.y}) ${selected.ownerId === state.me ? "[YOURS]" : selected.ownerId ? `[ENEMY ${selected.ownerId.slice(0, 8)}]` : "[NEUTRAL]"}`;
  }

  techPickEl.innerHTML = "";
  const catalogById = new Map(state.techCatalog.map((t) => [t.id, t]));
  for (const choice of state.techChoices) {
    const opt = document.createElement("option");
    opt.value = choice;
    const info = catalogById.get(choice);
    opt.textContent = info ? `${info.name} (${info.id})` : choice;
    techPickEl.append(opt);
  }
  if (state.techChoices.length === 0) {
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = "No available tech choices";
    techPickEl.append(opt);
  }

  allianceRequestsEl.innerHTML = "";
  for (const request of state.incomingAllianceRequests) {
    const row = document.createElement("div");
    row.className = "row";
    const label = document.createElement("span");
    label.textContent = `Request ${request.id.slice(0, 8)} from ${request.fromPlayerId.slice(0, 8)}`;
    const btn = document.createElement("button");
    btn.textContent = "Accept";
    btn.onclick = () => {
      ws.send(JSON.stringify({ type: "ALLIANCE_ACCEPT", requestId: request.id }));
    };
    row.append(label, btn);
    allianceRequestsEl.append(row);
  }

  feedEl.innerHTML = state.feed.map((f) => `<div>${f}</div>`).join("");
};

const resize = (): void => {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
};
window.addEventListener("resize", resize);
resize();

const token = localStorage.getItem("be_token") ?? prompt("Enter login as name:password") ?? "player:pass";
localStorage.setItem("be_token", token);

const ws = new WebSocket("ws://localhost:3001/ws");

allianceSendBtn.onclick = () => {
  const target = allianceTargetEl.value.trim();
  if (!target) return;
  ws.send(JSON.stringify({ type: "ALLIANCE_REQUEST", targetPlayerName: target }));
};

allianceBreakBtn.onclick = () => {
  const target = allianceBreakIdEl.value.trim();
  if (!target) return;
  ws.send(JSON.stringify({ type: "ALLIANCE_BREAK", targetPlayerId: target }));
};

techChooseBtn.onclick = () => {
  const techId = techPickEl.value;
  if (!techId) return;
  ws.send(JSON.stringify({ type: "CHOOSE_TECH", techId }));
};

centerMeBtn.onclick = () => {
  centerOnOwnedTile();
  requestViewRefresh();
};

refreshBtn.onclick = () => requestViewRefresh();
setColorBtn.onclick = () => {
  const color = tileColorInput.value;
  if (!/^#[0-9a-fA-F]{6}$/.test(color)) return;
  ws.send(JSON.stringify({ type: "SET_TILE_COLOR", color }));
};

ws.addEventListener("open", () => {
  state.connection = "connected";
  renderHud();
  ws.send(JSON.stringify({ type: "AUTH", token }));
});
ws.addEventListener("close", () => {
  state.connection = "disconnected";
  pushFeed("Disconnected from server.");
  renderHud();
});
ws.addEventListener("error", () => {
  state.connection = "disconnected";
  pushFeed("WebSocket error: cannot reach game server on :3001.");
  renderHud();
});

ws.addEventListener("message", (ev) => {
  const msg = JSON.parse(ev.data as string) as Record<string, unknown>;
  if (msg.type === "INIT") {
    state.connection = "initialized";
    const p = msg.player as Record<string, unknown>;
    state.me = p.id as string;
    state.meName = p.name as string;
    state.points = p.points as number;
    state.level = p.level as number;
    state.stamina = p.stamina as number;
    state.techRootId = p.techRootId as string | undefined;
    state.techIds = (p.techIds as string[]) ?? [];
    state.allies = (p.allies as string[]) ?? [];
    const myTileColor = p.tileColor as string | undefined;
    if (myTileColor) {
      state.playerColors.set(state.me, myTileColor);
      tileColorInput.value = myTileColor;
    }
    for (const s of ((msg.playerStyles as Array<{ id: string; tileColor?: string }>) ?? [])) {
      if (s.tileColor) state.playerColors.set(s.id, s.tileColor);
    }
    const homeTile = p.homeTile as { x: number; y: number } | undefined;
    if (homeTile) {
      state.homeTile = homeTile;
      state.camX = homeTile.x;
      state.camY = homeTile.y;
      state.selected = homeTile;
    }
    state.techChoices = (msg.techChoices as string[]) ?? [];
    state.techCatalog = (msg.techCatalog as TechInfo[]) ?? [];
    state.incomingAllianceRequests = (msg.allianceRequests as AllianceRequest[]) ?? [];
    pushFeed(`Spawned. Your tile is centered.`);
    requestViewRefresh();
    renderHud();
  }
  if (msg.type === "CHUNK_FULL") {
    const tiles = msg.tilesMaskedByFog as Tile[];
    for (const t of tiles) state.tiles.set(key(t.x, t.y), t);
    if (![...state.tiles.values()].some((t) => t.ownerId === state.me)) {
      centerOnOwnedTile();
    }
  }
  if (msg.type === "PLAYER_UPDATE") {
    state.points = msg.points as number;
    state.level = msg.level as number;
    state.stamina = msg.stamina as number;
    renderHud();
  }
  if (msg.type === "COMBAT_RESULT") {
    const changes = msg.changes as Array<{ x: number; y: number; ownerId?: string }>;
    for (const c of changes) {
      const existing = state.tiles.get(key(c.x, c.y));
      if (existing) {
        if (c.ownerId) existing.ownerId = c.ownerId;
        else delete existing.ownerId;
      }
    }
    pushFeed(`Combat winner: ${(msg.winnerId as string).slice(0, 8)}`);
    renderHud();
  }
  if (msg.type === "TILE_DELTA") {
    const updates = (msg.updates as Array<{ x: number; y: number; ownerId?: string; terrain?: Tile["terrain"]; resource?: string }>) ?? [];
    for (const update of updates) {
      const existing = state.tiles.get(key(update.x, update.y));
      const merged: Tile = existing ?? { x: update.x, y: update.y, terrain: update.terrain ?? "LAND" };
      if (update.terrain) merged.terrain = update.terrain;
      if (update.resource) merged.resource = update.resource;
      if (update.ownerId) merged.ownerId = update.ownerId;
      else delete merged.ownerId;
      state.tiles.set(key(update.x, update.y), merged);
    }
  }
  if (msg.type === "TECH_UPDATE") {
    state.techRootId = msg.techRootId as string | undefined;
    state.techIds = (msg.techIds as string[]) ?? [];
    state.techChoices = (msg.nextChoices as string[]) ?? [];
    state.techCatalog = (msg.techCatalog as TechInfo[]) ?? state.techCatalog;
    pushFeed(`Tech chosen: ${state.techIds[state.techIds.length - 1] ?? "unknown"}`);
    renderHud();
  }
  if (msg.type === "ALLIANCE_REQUEST_INCOMING") {
    state.incomingAllianceRequests.push(msg.request as AllianceRequest);
    pushFeed(`Incoming alliance request`);
    renderHud();
  }
  if (msg.type === "ALLIANCE_REQUESTED") {
    pushFeed(`Alliance request sent`);
    renderHud();
  }
  if (msg.type === "ALLIANCE_UPDATE") {
    state.allies = (msg.allies as string[]) ?? [];
    pushFeed(`Alliances updated (${state.allies.length})`);
    renderHud();
  }
  if (msg.type === "ERROR") {
    pushFeed(`Error ${msg.code as string}: ${msg.message as string}`);
    renderHud();
  }
  if (msg.type === "PLAYER_STYLE") {
    const pid = msg.playerId as string;
    const color = msg.tileColor as string | undefined;
    if (pid && color) {
      state.playerColors.set(pid, color);
      if (pid === state.me) tileColorInput.value = color;
    }
  }
});

const draw = (): void => {
  ctx.fillStyle = "#0b1320";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const size = state.zoom;
  const halfW = Math.floor(canvas.width / size / 2);
  const halfH = Math.floor(canvas.height / size / 2);

  for (let y = -halfH; y <= halfH; y += 1) {
    for (let x = -halfW; x <= halfW; x += 1) {
      const wx = wrapX(state.camX + x);
      const wy = wrapY(state.camY + y);
      const t = state.tiles.get(key(wx, wy));
      const px = (x + halfW) * size;
      const py = (y + halfH) * size;

      if (!t) {
        const tt = terrainAt(wx, wy);
        if (tt === "SEA") ctx.fillStyle = "#184e77";
        else if (tt === "MOUNTAIN") ctx.fillStyle = "#555";
        else ctx.fillStyle = "#2d6a4f";
      } else if (t.terrain === "SEA") {
        ctx.fillStyle = "#184e77";
      } else if (t.terrain === "MOUNTAIN") {
        ctx.fillStyle = "#555";
      } else if (t.ownerId) {
        ctx.fillStyle = effectiveColor(t.ownerId);
      } else {
        ctx.fillStyle = "#2d6a4f";
      }

      ctx.fillRect(px, py, size - 1, size - 1);

      if (t?.ownerId === state.me) {
        ctx.strokeStyle = "rgba(255,255,255,0.25)";
        ctx.strokeRect(px + 1, py + 1, size - 3, size - 3);
      }

      if (state.selected && state.selected.x === wx && state.selected.y === wy) {
        ctx.strokeStyle = "#ffd166";
        ctx.lineWidth = 2;
        ctx.strokeRect(px + 1, py + 1, size - 3, size - 3);
        ctx.lineWidth = 1;
      }
    }
  }

  requestAnimationFrame(draw);
};

draw();
renderHud();

canvas.addEventListener("wheel", (ev) => {
  ev.preventDefault();
  state.zoom = Math.min(40, Math.max(10, state.zoom + (ev.deltaY > 0 ? -1 : 1)));
});

window.addEventListener("keydown", (ev) => {
  if (ev.key === "ArrowUp") state.camY = wrapY(state.camY - 1);
  if (ev.key === "ArrowDown") state.camY = wrapY(state.camY + 1);
  if (ev.key === "ArrowLeft") state.camX = wrapX(state.camX - 1);
  if (ev.key === "ArrowRight") state.camX = wrapX(state.camX + 1);

  if (ev.key.toLowerCase() === "r") requestViewRefresh();
});

setInterval(() => {
  requestViewRefresh();
}, 2_500);

canvas.addEventListener("click", (ev) => {
  const size = state.zoom;
  const halfW = Math.floor(canvas.width / size / 2);
  const halfH = Math.floor(canvas.height / size / 2);
  const gx = Math.floor(ev.offsetX / size) - halfW + state.camX;
  const gy = Math.floor(ev.offsetY / size) - halfH + state.camY;
  const wx = wrapX(gx);
  const wy = wrapY(gy);

  const clicked = state.tiles.get(key(wx, wy));
  if (!clicked) {
    state.selected = { x: wx, y: wy };
    renderHud();
    return;
  }

  if (!state.selected) {
    state.selected = { x: wx, y: wy };
    renderHud();
    return;
  }

  const from = state.tiles.get(key(state.selected.x, state.selected.y));
  const to = clicked;
  if (!from) {
    state.selected = { x: wx, y: wy };
    renderHud();
    return;
  }

  if (from.ownerId !== state.me) {
    state.selected = { x: wx, y: wy };
    renderHud();
    return;
  }

  if (!to.ownerId) {
    ws.send(JSON.stringify({ type: "EXPAND", fromX: from.x, fromY: from.y, toX: to.x, toY: to.y }));
    pushFeed(`Expand attempt (${to.x}, ${to.y})`);
  } else if (to.ownerId !== state.me) {
    ws.send(JSON.stringify({ type: "ATTACK", fromX: from.x, fromY: from.y, toX: to.x, toY: to.y }));
    pushFeed(`Attack attempt (${to.x}, ${to.y})`);
  }

  state.selected = { x: wx, y: wy };
  renderHud();
});

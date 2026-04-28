import WebSocket from "../packages/server/node_modules/ws/wrapper.mjs";

const wsUrl = process.env.WS_URL ?? "ws://127.0.0.1:3101/ws";
const authToken = process.env.AUTH_TOKEN ?? "player-1";
const actionType = process.env.ACTION_TYPE ?? (process.env.ATTACK === "1" ? "ATTACK" : "");
const shouldSendFrontierAction = actionType === "ATTACK" || actionType === "EXPAND";
const waitForGlobalStatus = process.env.WAIT_FOR_GLOBAL_STATUS === "1";
const useFixedFrontierPayload = process.env.ATTACK_FIXED === "1";
const printTileKeys = (process.env.PRINT_TILE_KEYS ?? "")
  .split("|")
  .map((value) => value.trim())
  .filter(Boolean);
const defaultAttackPayload = {
  type: actionType || "ATTACK",
  fromX: Number(process.env.ATTACK_FROM_X ?? "4"),
  fromY: Number(process.env.ATTACK_FROM_Y ?? "4"),
  toX: Number(process.env.ATTACK_TO_X ?? "5"),
  toY: Number(process.env.ATTACK_TO_Y ?? "4"),
  commandId: process.env.ATTACK_COMMAND_ID ?? `smoke-${Date.now()}`,
  clientSeq: Number(process.env.ATTACK_CLIENT_SEQ ?? "1")
};

const timeoutMs = Number(process.env.SMOKE_TIMEOUT_MS ?? "12000");
const expectedTypes = shouldSendFrontierAction
  ? new Set(
      actionType === "ATTACK"
        ? ["INIT", "COMMAND_QUEUED", "ACTION_ACCEPTED", "COMBAT_START", "COMBAT_RESULT"]
        : ["INIT", "COMMAND_QUEUED", "ACTION_ACCEPTED", "FRONTIER_RESULT"]
    )
  : new Set(waitForGlobalStatus ? ["INIT", "GLOBAL_STATUS_UPDATE"] : ["INIT"]);
const seenTypes = new Set();

const chooseLiveFrontierPayload = (message) => {
  const initialTiles = Array.isArray(message.initialState?.tiles) ? message.initialState.tiles : [];
  const playerId = typeof message.player?.id === "string" ? message.player.id : "player-1";
  const tilesByKey = new Map(initialTiles.map((tile) => [`${tile.x},${tile.y}`, tile]));
  const directions = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1]
  ];

  for (const tile of initialTiles) {
    if (tile?.ownerId !== playerId) continue;
    for (const [dx, dy] of directions) {
      const neighbor = tilesByKey.get(`${tile.x + dx},${tile.y + dy}`);
      if (!neighbor || neighbor.ownerId === playerId) continue;
      if (actionType === "EXPAND" && neighbor.ownerId) continue;
      const nextClientSeq = Number(message.recovery?.nextClientSeq ?? defaultAttackPayload.clientSeq);
      return {
        ...defaultAttackPayload,
        fromX: tile.x,
        fromY: tile.y,
        toX: neighbor.x,
        toY: neighbor.y,
        clientSeq: Number.isFinite(nextClientSeq) && nextClientSeq > 0 ? nextClientSeq : defaultAttackPayload.clientSeq
      };
    }
  }

  return defaultAttackPayload;
};

const summarize = (payload) => {
  if (typeof payload !== "object" || payload === null) return payload;
  const message = payload;
  switch (message.type) {
    case "INIT":
      if (printTileKeys.length > 0) {
        const tiles = Array.isArray(message.initialState?.tiles) ? message.initialState.tiles : [];
        const byKey = new Map(tiles.map((tile) => [`${tile.x},${tile.y}`, tile]));
        message.probeTiles = printTileKeys.map((key) => byKey.get(key) ?? { key, missing: true });
      }
      return {
        type: "INIT",
        player: message.player,
        recovery: message.recovery,
        initialTiles: Array.isArray(message.initialState?.tiles) ? message.initialState.tiles.length : 0,
        ...(message.probeTiles ? { probeTiles: message.probeTiles } : {})
      };
    case "TILE_DELTA_BATCH":
      return {
        type: "TILE_DELTA_BATCH",
        commandId: message.commandId,
        tiles: Array.isArray(message.tiles) ? message.tiles.length : 0
      };
    default:
      return message;
  }
};

const finishIfComplete = (socket) => {
  for (const type of expectedTypes) {
    if (!seenTypes.has(type)) return;
  }
  socket.close();
};

const timeoutId = setTimeout(() => {
  console.error(JSON.stringify({
    ok: false,
    reason: "timeout",
    expected: [...expectedTypes],
    seen: [...seenTypes]
  }));
  process.exit(2);
}, timeoutMs);

const socket = new WebSocket(wsUrl);
socket.on("open", () => {
  console.log(JSON.stringify({ type: "WS_OPEN", wsUrl }));
  socket.send(JSON.stringify({ type: "AUTH", token: authToken }));
});

socket.on("message", (data) => {
  const text = data.toString();
  const parsed = JSON.parse(text);
  console.log(JSON.stringify(summarize(parsed)));
  if (typeof parsed.type === "string") seenTypes.add(parsed.type);
  if (parsed.type === "INIT" && shouldSendFrontierAction) {
    const payload = useFixedFrontierPayload ? defaultAttackPayload : chooseLiveFrontierPayload(parsed);
    console.log(JSON.stringify({ type: "ATTACK_PROBE", payload }));
    socket.send(JSON.stringify(payload));
  }
  finishIfComplete(socket);
});

socket.on("close", () => {
  clearTimeout(timeoutId);
  const complete = [...expectedTypes].every((type) => seenTypes.has(type));
  console.log(JSON.stringify({ ok: complete, expected: [...expectedTypes], seen: [...seenTypes] }));
  process.exit(complete ? 0 : 1);
});

socket.on("error", (error) => {
  clearTimeout(timeoutId);
  console.error(JSON.stringify({ ok: false, reason: "ws-error", message: error.message }));
  process.exit(1);
});

import WebSocket from "../packages/server/node_modules/ws/wrapper.mjs";

const wsUrl = process.env.WS_URL ?? "ws://127.0.0.1:3101/ws";
const authToken = process.env.AUTH_TOKEN ?? "player-1";
const iterations = Math.max(1, Number(process.env.SOAK_ITERATIONS ?? "20"));
const warmupIterations = Math.max(0, Number(process.env.SOAK_WARMUP_ITERATIONS ?? "1"));
const timeoutMs = Math.max(1_000, Number(process.env.SOAK_TIMEOUT_MS ?? "15000"));
const waitForResult = process.env.SOAK_WAIT_FOR_RESULT === "1";
const reconnectEachIteration = process.env.SOAK_RECONNECT_EACH_ITERATION === "1";
const allowAttacks = process.env.SOAK_ALLOW_ATTACKS === "1";
const logEachIteration = process.env.SOAK_LOG_EACH_ITERATION !== "0";
const refreshOnEmptyFrontier = process.env.SOAK_REFRESH_ON_EMPTY_FRONTIER !== "0";
const candidateVisionRadius = Math.max(1, Number(process.env.SOAK_CANDIDATE_VISION_RADIUS ?? "4"));
const emitAcceptedLatencies = process.env.SOAK_EMIT_LATENCIES === "1";

const percentile = (values, fraction) => {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * fraction) - 1));
  return sorted[index];
};

const tileKey = (x, y) => `${x},${y}`;

const normalizeTile = (tile) => ({
  x: Number(tile.x),
  y: Number(tile.y),
  ...(typeof tile.terrain === "string" ? { terrain: tile.terrain } : {}),
  ...(typeof tile.resource === "string" ? { resource: tile.resource } : {}),
  ...(typeof tile.ownerId === "string" ? { ownerId: tile.ownerId } : {}),
  ...(typeof tile.ownershipState === "string" ? { ownershipState: tile.ownershipState } : {})
});

const candidateScore = (tilesByKey, payload, playerId) => {
  const { toX, toY, type } = payload;
  let score = 0;
  for (let dy = -candidateVisionRadius; dy <= candidateVisionRadius; dy += 1) {
    for (let dx = -candidateVisionRadius; dx <= candidateVisionRadius; dx += 1) {
      const neighbor = tilesByKey.get(tileKey(toX + dx, toY + dy));
      if (!neighbor) {
        score += 4;
        continue;
      }
      if (neighbor.terrain !== "LAND") {
        score -= 8;
        continue;
      }
      if (!neighbor.ownerId) {
        score += 3;
        continue;
      }
      if (neighbor.ownerId !== playerId) {
        score += type === "ATTACK" ? 2 : 1;
        continue;
      }
      score -= 1;
    }
  }
  return score;
};

const collectCandidatePayloads = (tilesByKey, playerId, invalidTargets = new Set(), invalidOrigins = new Set()) => {
  const expandPayloads = [];
  const attackPayloads = [];
  const directions = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1]
  ];

  for (const tile of tilesByKey.values()) {
    if (!tile || tile.ownerId !== playerId || tile.terrain !== "LAND") continue;
    for (const [dx, dy] of directions) {
      const neighbor = tilesByKey.get(tileKey(tile.x + dx, tile.y + dy));
      if (!neighbor || neighbor.terrain !== "LAND") continue;
      const nextOriginKey = tileKey(tile.x, tile.y);
      const nextTargetKey = tileKey(neighbor.x, neighbor.y);
      if (invalidOrigins.has(nextOriginKey) || invalidTargets.has(nextTargetKey)) continue;
      if (!neighbor.ownerId) {
        expandPayloads.push({
          type: "EXPAND",
          fromX: tile.x,
          fromY: tile.y,
          toX: neighbor.x,
          toY: neighbor.y
        });
        continue;
      }
      if (neighbor.ownerId !== playerId) {
        attackPayloads.push({
          type: "ATTACK",
          fromX: tile.x,
          fromY: tile.y,
          toX: neighbor.x,
          toY: neighbor.y
        });
      }
    }
  }

  const rankedExpands = expandPayloads
    .map((payload) => ({ payload, score: candidateScore(tilesByKey, payload, playerId) }))
    .sort((left, right) => right.score - left.score)
    .map((entry) => entry.payload);
  const rankedAttacks = attackPayloads
    .map((payload) => ({ payload, score: candidateScore(tilesByKey, payload, playerId) }))
    .sort((left, right) => right.score - left.score)
    .map((entry) => entry.payload);

  if (!allowAttacks) {
    return rankedExpands;
  }

  return rankedExpands.length > 0 ? [...rankedExpands, ...rankedAttacks] : rankedAttacks;
};

const openSession = () =>
  new Promise((resolve, reject) => {
    const socket = new WebSocket(wsUrl);
    const state = {
      socket,
      playerId: "player-1",
      nextClientSeq: 1,
      tilesByKey: new Map(),
      ready: false
    };
    const timeoutId = setTimeout(() => {
      try {
        socket.close();
      } catch {
        // Ignore close races during bootstrap timeout.
      }
      reject(new Error("timed out waiting for INIT"));
    }, timeoutMs);

    socket.on("open", () => {
      socket.send(JSON.stringify({ type: "AUTH", token: authToken }));
    });

    socket.on("message", (data) => {
      const message = JSON.parse(data.toString());
      if (message.type === "INIT") {
        const initialTiles = Array.isArray(message.initialState?.tiles) ? message.initialState.tiles : [];
        for (const tile of initialTiles) {
          const normalized = normalizeTile(tile);
          state.tilesByKey.set(tileKey(normalized.x, normalized.y), normalized);
        }
        state.playerId = typeof message.player?.id === "string" ? message.player.id : state.playerId;
        state.nextClientSeq = Math.max(1, Number(message.recovery?.nextClientSeq ?? 1));
        state.ready = true;
        clearTimeout(timeoutId);
        resolve(state);
        return;
      }

      if (message.type === "TILE_DELTA_BATCH" && Array.isArray(message.tiles)) {
        for (const tile of message.tiles) {
          const normalized = normalizeTile(tile);
          const existing = state.tilesByKey.get(tileKey(normalized.x, normalized.y)) ?? { x: normalized.x, y: normalized.y };
          state.tilesByKey.set(tileKey(normalized.x, normalized.y), {
            ...existing,
            ...normalized
          });
        }
      }
    });

    socket.on("error", (error) => {
      clearTimeout(timeoutId);
      reject(error);
    });
  });

const closeSession = async (session) => {
  if (!session?.socket) return;
  try {
    session.socket.close();
  } catch {
    // Ignore close races during soak shutdown.
  }
};

const runIteration = (session, iteration) =>
  new Promise((resolve, reject) => {
    let startedAt = 0;
    let queuedAt = 0;
    let acceptedAt = 0;
    let resultAt = 0;
    let activePayload = null;
    const invalidTargets = new Set();
    const invalidOrigins = new Set();
    let timeoutId;

    const cleanup = () => {
      clearTimeout(timeoutId);
      session.socket.off?.("message", onMessage);
      session.socket.off?.("error", onError);
      session.socket.removeListener?.("message", onMessage);
      session.socket.removeListener?.("error", onError);
    };

    const sendNextCandidate = () => {
      const candidatePayloads = collectCandidatePayloads(session.tilesByKey, session.playerId, invalidTargets, invalidOrigins);
      if (candidatePayloads.length === 0) {
        cleanup();
        reject(new Error(`iteration ${iteration} found no frontier action candidate`));
        return;
      }
      const next = candidatePayloads[0];
      activePayload = {
        ...next,
        clientSeq: session.nextClientSeq,
        commandId: `soak-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      };
      session.nextClientSeq += 1;
      startedAt = Date.now();
      queuedAt = 0;
      acceptedAt = 0;
      resultAt = 0;
      session.socket.send(JSON.stringify(activePayload));
    };

    const finish = (result) => {
      cleanup();
      resolve(result);
    };

    const onError = (error) => {
      cleanup();
      reject(error);
    };

    const onMessage = (data) => {
      const message = JSON.parse(data.toString());
      if (message.type === "TILE_DELTA_BATCH" && Array.isArray(message.tiles)) {
        for (const tile of message.tiles) {
          const normalized = normalizeTile(tile);
          const existing = session.tilesByKey.get(tileKey(normalized.x, normalized.y)) ?? { x: normalized.x, y: normalized.y };
          session.tilesByKey.set(tileKey(normalized.x, normalized.y), {
            ...existing,
            ...normalized
          });
        }
      }

      if (!activePayload) return;
      if (message.commandId !== activePayload.commandId) return;

      if (message.type === "COMMAND_QUEUED") {
        queuedAt = Date.now();
        return;
      }
      if (message.type === "ACTION_ACCEPTED") {
        acceptedAt = Date.now();
        if (!waitForResult) {
          finish({
            iteration,
            attack: activePayload,
            resultType: "ACTION_ACCEPTED",
            queuedDelayMs: queuedAt > 0 ? queuedAt - startedAt : null,
            acceptedDelayMs: acceptedAt - startedAt,
            resultDelayMs: null
          });
        }
        return;
      }
      if (message.type === "ERROR") {
        if (
          message.code === "ATTACK_COOLDOWN" ||
          message.code === "ATTACK_TARGET_INVALID" ||
          message.code === "NOT_OWNER" ||
          message.code === "NOT_ADJACENT" ||
          message.code === "LOCKED" ||
          message.code === "EXPAND_TARGET_OWNED" ||
          message.code === "BARRIER" ||
          message.code === "EXPAND_COOLDOWN"
        ) {
          if (activePayload) {
            const originKey = tileKey(activePayload.fromX, activePayload.fromY);
            const targetKey = tileKey(activePayload.toX, activePayload.toY);
            if (message.code === "NOT_OWNER") invalidOrigins.add(originKey);
            if (
              message.code === "ATTACK_TARGET_INVALID" ||
              message.code === "LOCKED" ||
              message.code === "EXPAND_TARGET_OWNED" ||
              message.code === "BARRIER"
            ) {
              invalidTargets.add(targetKey);
            }
          }
          sendNextCandidate();
          return;
        }
        if (
          message.code === "INSUFFICIENT_MANPOWER" ||
          message.code === "INSUFFICIENT_RESOURCES"
        ) {
          // Player-wide resource exhaustion — bail up to outer loop for regen pause.
          cleanup();
          reject(new Error(`iteration ${iteration} resource exhausted: ${message.code}`));
          return;
        }
        cleanup();
        reject(new Error(`iteration ${iteration} got ${message.code}: ${message.message}`));
        return;
      }
      if (message.type === "COMBAT_RESULT" || message.type === "FRONTIER_RESULT") {
        resultAt = Date.now();
        finish({
          iteration,
          attack: activePayload,
          resultType: message.type,
          queuedDelayMs: queuedAt > 0 ? queuedAt - startedAt : null,
          acceptedDelayMs: acceptedAt > 0 ? acceptedAt - startedAt : null,
          resultDelayMs: resultAt - startedAt
        });
      }
    };

    timeoutId = setTimeout(() => {
      cleanup();
      reject(new Error(`iteration ${iteration} timed out`));
    }, timeoutMs);

    session.socket.on("message", onMessage);
    session.socket.on("error", onError);
    sendNextCandidate();
  });

let session = await openSession();
const results = [];

for (let iteration = 1; iteration <= iterations + warmupIterations; iteration += 1) {
  let result;
  let refreshedForIteration = false;
  let resourcePausesForIteration = 0;
  for (;;) {
    try {
      result = await runIteration(session, iteration);
      break;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes("resource exhausted") && resourcePausesForIteration < 3) {
        // Manpower/resources globally exhausted — pause briefly to let regen catch up.
        resourcePausesForIteration += 1;
        await new Promise((resolvePause) => setTimeout(resolvePause, 2500));
        continue;
      }
      if (!refreshOnEmptyFrontier || refreshedForIteration || !message.includes("found no frontier action candidate")) {
        throw error;
      }
      await closeSession(session);
      session = await openSession();
      refreshedForIteration = true;
    }
  }
  if (iteration <= warmupIterations) {
    if (logEachIteration) {
      console.log(JSON.stringify({ ...result, warmup: true, reconnectEachIteration }));
    }
  } else {
    results.push(result);
    if (logEachIteration) {
      console.log(JSON.stringify({ ...result, reconnectEachIteration }));
    }
  }
  if (reconnectEachIteration && iteration < iterations + warmupIterations) {
    await closeSession(session);
    session = await openSession();
  }
}

await closeSession(session);

const acceptedLatencies = results.map((result) => result.acceptedDelayMs).filter((value) => typeof value === "number");
const summary = {
  ok: true,
  warmupIterations,
  iterations,
  reconnectEachIteration,
  acceptedSamples: acceptedLatencies.length,
  acceptedMinMs: acceptedLatencies.length > 0 ? Math.min(...acceptedLatencies) : null,
  acceptedMaxMs: acceptedLatencies.length > 0 ? Math.max(...acceptedLatencies) : null,
  acceptedP95Ms: percentile(acceptedLatencies, 0.95),
  acceptedP99Ms: percentile(acceptedLatencies, 0.99),
  acceptanceOver500Ms: acceptedLatencies.filter((value) => value > 500).length
};
if (emitAcceptedLatencies) summary.acceptedLatenciesMs = acceptedLatencies;

console.log(JSON.stringify(summary));

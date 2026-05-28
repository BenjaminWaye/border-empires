#!/usr/bin/env node
import WebSocket from "ws";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// ── Config ──────────────────────────────────────────────────────────────────
const WS_URL = process.env.WS_URL ?? "ws://127.0.0.1:3101/ws";
const CONCURRENCY_LEVELS = parseConcurrencyLevels(process.env.CONCURRENCY_LEVELS ?? "5,10,20,30,40,50");
const LEVEL_DURATION_MS = Math.max(5_000, Number(process.env.LEVEL_DURATION_MS ?? "60000"));
const ACTIONS_PER_CLIENT_PER_SEC = Math.max(0.1, Number(process.env.ACTIONS_PER_CLIENT_PER_SEC ?? "1"));
const AUTH_TOKEN_PREFIX = process.env.AUTH_TOKEN_PREFIX ?? "loadtest-";
const GATEWAY_METRICS_URL = process.env.GATEWAY_METRICS_URL ?? "http://127.0.0.1:3101/metrics";
const SIMULATION_METRICS_URL = process.env.SIMULATION_METRICS_URL ?? "http://127.0.0.1:50052/metrics";
const CANDIDATE_VISION_RADIUS = 4;

// ── Pure helpers ────────────────────────────────────────────────────────────

export function parseConcurrencyLevels(raw) {
  const levels = [];
  for (const part of raw.split(",")) {
    const trimmed = part.trim();
    if (trimmed === "") continue;
    const n = Number(trimmed);
    if (!Number.isInteger(n) || n < 1) {
      throw new Error(`CONCURRENCY_LEVELS must be positive integers, got "${trimmed}"`);
    }
    levels.push(n);
  }
  if (levels.length === 0) throw new Error("CONCURRENCY_LEVELS must not be empty");
  return levels;
}

export function computeCliffLevel(levelRecords, thresholds) {
  for (const record of levelRecords) {
    if (record.initFailures > 0) return record.level;
    if (typeof record.acceptedP99Ms === "number" && record.acceptedP99Ms >= thresholds.acceptedP99Ms) return record.level;
    if (typeof record.gatewayEventLoopMaxMs === "number" && record.gatewayEventLoopMaxMs >= thresholds.gatewayEventLoopMaxMs) return record.level;
    if (typeof record.simEventLoopMaxMs === "number" && record.simEventLoopMaxMs >= thresholds.simEventLoopMaxMs) return record.level;
  }
  return null;
}

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
  for (let dy = -CANDIDATE_VISION_RADIUS; dy <= CANDIDATE_VISION_RADIUS; dy += 1) {
    for (let dx = -CANDIDATE_VISION_RADIUS; dx <= CANDIDATE_VISION_RADIUS; dx += 1) {
      const neighbor = tilesByKey.get(tileKey(toX + dx, toY + dy));
      if (!neighbor) { score += 4; continue; }
      if (neighbor.terrain !== "LAND") { score -= 8; continue; }
      if (!neighbor.ownerId) { score += 3; continue; }
      if (neighbor.ownerId !== playerId) { score += type === "ATTACK" ? 2 : 1; continue; }
      score -= 1;
    }
  }
  return score;
};

const collectCandidatePayloads = (tilesByKey, playerId, invalidTargets, invalidOrigins) => {
  const expandPayloads = [];
  const attackPayloads = [];
  const directions = [[1, 0], [-1, 0], [0, 1], [0, -1]];

  for (const tile of tilesByKey.values()) {
    if (!tile || tile.ownerId !== playerId || tile.terrain !== "LAND") continue;
    for (const [dx, dy] of directions) {
      const neighbor = tilesByKey.get(tileKey(tile.x + dx, tile.y + dy));
      if (!neighbor || neighbor.terrain !== "LAND") continue;
      const originKey = tileKey(tile.x, tile.y);
      const targetKey = tileKey(neighbor.x, neighbor.y);
      if (invalidOrigins.has(originKey) || invalidTargets.has(targetKey)) continue;
      if (!neighbor.ownerId) {
        expandPayloads.push({ type: "EXPAND", fromX: tile.x, fromY: tile.y, toX: neighbor.x, toY: neighbor.y });
        continue;
      }
      if (neighbor.ownerId !== playerId) {
        attackPayloads.push({ type: "ATTACK", fromX: tile.x, fromY: tile.y, toX: neighbor.x, toY: neighbor.y });
      }
    }
  }

  const ranked = (list) =>
    list.map((p) => ({ payload: p, score: candidateScore(tilesByKey, p, playerId) }))
      .sort((a, b) => b.score - a.score)
      .map((e) => e.payload);

  const expands = ranked(expandPayloads);
  const attacks = ranked(attackPayloads);
  return expands.length > 0 ? [...expands, ...attacks] : attacks;
};

const quantile = (values, q) => {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * q) - 1));
  return sorted[index] ?? null;
};

const parsePrometheus = (text) => {
  const metrics = {};
  for (const line of text.split(/\r?\n/)) {
    if (!line || line.startsWith("#")) continue;
    const parts = line.trim().split(/\s+/);
    if (parts.length < 2) continue;
    const value = Number(parts[1]);
    if (!Number.isFinite(value)) continue;
    metrics[parts[0]] = value;
  }
  return metrics;
};

const fetchMetrics = async (url) => {
  const response = await fetch(url, { headers: { accept: "text/plain" } });
  if (!response.ok) throw new Error(`failed to fetch ${url}: ${response.status}`);
  return parsePrometheus(await response.text());
};

// ── Client session ──────────────────────────────────────────────────────────

const openSession = (token, timeoutMs = 15_000) =>
  new Promise((resolve, reject) => {
    const socket = new WebSocket(WS_URL);
    const state = { socket, playerId: token, nextClientSeq: 1, tilesByKey: new Map(), ready: false };
    const timer = setTimeout(() => { try { socket.close(); } catch { /* */ } reject(new Error(`INIT timeout for ${token}`)); }, timeoutMs);

    socket.on("open", () => socket.send(JSON.stringify({ type: "AUTH", token })));

    socket.on("message", (data) => {
      const msg = JSON.parse(data.toString());
      if (msg.type === "INIT") {
        for (const tile of (Array.isArray(msg.initialState?.tiles) ? msg.initialState.tiles : [])) {
          const n = normalizeTile(tile);
          state.tilesByKey.set(tileKey(n.x, n.y), n);
        }
        state.playerId = typeof msg.player?.id === "string" ? msg.player.id : state.playerId;
        state.nextClientSeq = Math.max(1, Number(msg.recovery?.nextClientSeq ?? 1));
        state.ready = true;
        clearTimeout(timer);
        resolve(state);
        return;
      }
      if (msg.type === "TILE_DELTA_BATCH" && Array.isArray(msg.tiles)) {
        for (const tile of msg.tiles) {
          const n = normalizeTile(tile);
          const existing = state.tilesByKey.get(tileKey(n.x, n.y)) ?? { x: n.x, y: n.y };
          state.tilesByKey.set(tileKey(n.x, n.y), { ...existing, ...n });
        }
      }
    });

    socket.on("error", (err) => { clearTimeout(timer); reject(err); });
  });

const closeSession = async (state) => {
  if (!state?.socket) return;
  try { state.socket.close(); } catch { /* */ }
};

const sendAction = (state, timeoutMs) =>
  new Promise((resolve, reject) => {
    const invalidTargets = new Set();
    const invalidOrigins = new Set();
    let timer;

    const send = () => {
      const candidates = collectCandidatePayloads(state.tilesByKey, state.playerId, invalidTargets, invalidOrigins);
      if (candidates.length === 0) {
        clearTimeout(timer);
        reject(new Error("no frontier action candidate"));
        return;
      }
      const payload = {
        ...candidates[0],
        clientSeq: state.nextClientSeq,
        commandId: `cl-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      };
      state.nextClientSeq += 1;
      const startedAt = Date.now();
      let acceptedAt = 0;

      const onMessage = (data) => {
        const msg = JSON.parse(data.toString());

        if (msg.type === "TILE_DELTA_BATCH" && Array.isArray(msg.tiles)) {
          for (const tile of msg.tiles) {
            const n = normalizeTile(tile);
            const existing = state.tilesByKey.get(tileKey(n.x, n.y)) ?? { x: n.x, y: n.y };
            state.tilesByKey.set(tileKey(n.x, n.y), { ...existing, ...n });
          }
        }

        if (msg.commandId !== payload.commandId) return;

        if (msg.type === "ACTION_ACCEPTED") {
          acceptedAt = Date.now();
          clearTimeout(timer);
          state.socket.removeListener("message", onMessage);
          resolve({ acceptedDelayMs: acceptedAt - startedAt });
          return;
        }
        if (msg.type === "COMBAT_RESULT" || msg.type === "FRONTIER_RESULT") {
          if (acceptedAt === 0) acceptedAt = Date.now();
          clearTimeout(timer);
          state.socket.removeListener("message", onMessage);
          resolve({ acceptedDelayMs: acceptedAt - startedAt });
          return;
        }
        if (msg.type === "ERROR") {
          const recoverable = ["ATTACK_COOLDOWN", "ATTACK_TARGET_INVALID", "NOT_OWNER", "NOT_ADJACENT",
            "LOCKED", "EXPAND_TARGET_OWNED", "BARRIER", "EXPAND_COOLDOWN"];
          if (recoverable.includes(msg.code)) {
            const originKey = tileKey(payload.fromX, payload.fromY);
            const targetKey = tileKey(payload.toX, payload.toY);
            if (msg.code === "NOT_OWNER") invalidOrigins.add(originKey);
            else invalidTargets.add(targetKey);
            send();
            return;
          }
          clearTimeout(timer);
          state.socket.removeListener("message", onMessage);
          reject(new Error(`${msg.code}: ${msg.message}`));
        }
      };

      timer = setTimeout(() => {
        state.socket.removeListener("message", onMessage);
        reject(new Error("action timeout"));
      }, timeoutMs);

      state.socket.on("message", onMessage);
      state.socket.send(JSON.stringify(payload));
    };

    send();
  });

// ── Metrics poller ──────────────────────────────────────────────────────────

const pollMetrics = (gatewayUrl, simUrl, intervalMs, stopSignal) =>
  new Promise((resolve) => {
    const samples = [];
    const timer = setInterval(async () => {
      if (stopSignal.stopped) {
        clearInterval(timer);
        resolve(samples);
        return;
      }
      try {
        const [gateway, simulation] = await Promise.all([fetchMetrics(gatewayUrl), fetchMetrics(simUrl)]);
        samples.push({ at: Date.now(), gateway, simulation });
      } catch { /* transient scrape failure */ }
    }, intervalMs);
  });

// ── Per-level runner ────────────────────────────────────────────────────────

const runLevel = async (level, durationMs, actionsPerSec) => {
  const clients = [];
  const initFailures = [];
  const actionIntervalMs = Math.max(100, Math.round(1000 / actionsPerSec));
  const actionTimeoutMs = Math.max(5_000, actionIntervalMs * 5);

  // Open all N clients concurrently
  const openPromises = [];
  for (let i = 0; i < level; i += 1) {
    const token = `${AUTH_TOKEN_PREFIX}${i}`;
    openPromises.push(
      openSession(token, 30_000).then(
        (state) => clients.push(state),
        (err) => initFailures.push({ index: i, token, message: err.message?.slice(0, 200) ?? String(err).slice(0, 200) })
      )
    );
  }
  await Promise.all(openPromises);

  // Start metrics polling
  const stopSignal = { stopped: false };
  const metricsPromise = pollMetrics(GATEWAY_METRICS_URL, SIMULATION_METRICS_URL, 1000, stopSignal);

  // Start action loops for each connected client
  const actionLoops = clients.map((state) => {
    const acceptedLatencies = [];
    let stopped = false;
    const timer = setInterval(async () => {
      if (stopped) return;
      try {
        const result = await sendAction(state, actionTimeoutMs);
        if (typeof result.acceptedDelayMs === "number") acceptedLatencies.push(result.acceptedDelayMs);
      } catch {
        // Recoverable failures — continue
      }
    }, actionIntervalMs);

    return {
      state,
      stop: () => { stopped = true; clearInterval(timer); },
      acceptedLatencies
    };
  });

  // Hold for duration
  await new Promise((r) => setTimeout(r, durationMs));

  // Stop action loops
  for (const loop of actionLoops) loop.stop();

  // Stop metrics polling
  stopSignal.stopped = true;
  const metricsSamples = await metricsPromise;

  // Close all clients
  await Promise.all(clients.map(closeSession));

  // Aggregate
  const allLatencies = actionLoops.flatMap((l) => l.acceptedLatencies).filter((v) => Number.isFinite(v));
  return {
    level,
    clientsRequested: level,
    clientsConnected: clients.length,
    initFailures: initFailures.length,
    initFailureDetails: initFailures.slice(0, 10),
    totalAcceptedActions: allLatencies.length,
    acceptedP50Ms: quantile(allLatencies, 0.5),
    acceptedP95Ms: quantile(allLatencies, 0.95),
    acceptedP99Ms: quantile(allLatencies, 0.99),
    acceptedMaxMs: allLatencies.length > 0 ? Math.max(...allLatencies) : null,
    gatewayEventLoopMaxMs: metricsSamples.length > 0
      ? Math.max(...metricsSamples.map((s) => s.gateway["gateway_event_loop_max_ms"] ?? 0)) : null,
    simEventLoopMaxMs: metricsSamples.length > 0
      ? Math.max(...metricsSamples.map((s) => s.simulation["sim_event_loop_max_ms"] ?? 0)) : null,
    simHumanInteractiveBacklogMaxMs: metricsSamples.length > 0
      ? Math.max(...metricsSamples.map((s) => s.simulation["sim_human_interactive_backlog_ms"] ?? 0)) : null,
    simCheckpointRssMaxMb: metricsSamples.length > 0
      ? Math.max(...metricsSamples.map((s) => s.simulation["sim_checkpoint_rss_mb"] ?? 0)) : null,
    metricsSampleCount: metricsSamples.length
  };
};

// ── Main ────────────────────────────────────────────────────────────────────

const isMain = process.argv[1] && fileURLToPath(import.meta.url).endsWith(process.argv[1].split("/").pop());

if (isMain) {
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dateStamp = new Date().toISOString().slice(0, 10);
const outputPath = resolve(root, "docs", "load-results", `concurrent-${dateStamp}.json`);

const thresholds = {
  acceptedP99Ms: 250,
  gatewayEventLoopMaxMs: 1000,
  simEventLoopMaxMs: 1000
};

const levelRecords = [];

for (const level of CONCURRENCY_LEVELS) {
  console.log(`[level] starting N=${level} clients, duration=${LEVEL_DURATION_MS}ms...`);
  const record = await runLevel(level, LEVEL_DURATION_MS, ACTIONS_PER_CLIENT_PER_SEC);
  levelRecords.push(record);
  console.log(`[level] N=${level} connected=${record.clientsConnected} failed=${record.initFailures} ` +
    `actions=${record.totalAcceptedActions} p99=${record.acceptedP99Ms}ms ` +
    `gwLoop=${record.gatewayEventLoopMaxMs}ms simLoop=${record.simEventLoopMaxMs}ms`);
}

const cliffLevel = computeCliffLevel(levelRecords, thresholds);

const payload = {
  at: new Date().toISOString(),
  config: {
    wsUrl: WS_URL,
    concurrencyLevels: CONCURRENCY_LEVELS,
    levelDurationMs: LEVEL_DURATION_MS,
    actionsPerClientPerSec: ACTIONS_PER_CLIENT_PER_SEC,
    authTokenPrefix: AUTH_TOKEN_PREFIX,
    gatewayMetricsUrl: GATEWAY_METRICS_URL,
    simulationMetricsUrl: SIMULATION_METRICS_URL
  },
  thresholds,
  cliffLevel,
  levels: levelRecords
};

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, JSON.stringify(payload, null, 2) + "\n", "utf8");
console.log(outputPath);

if (cliffLevel !== null) {
  console.log(`[cliff] found at N=${cliffLevel}`);
} else {
  console.log(`[cliff] no cliff found up to max level ${CONCURRENCY_LEVELS[CONCURRENCY_LEVELS.length - 1]}`);
}
}

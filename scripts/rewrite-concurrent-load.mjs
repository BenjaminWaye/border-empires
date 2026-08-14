#!/usr/bin/env node
import WebSocket from "ws";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

// ── Config ──────────────────────────────────────────────────────────────────
const WS_URL = process.env.WS_URL ?? "ws://127.0.0.1:3101/ws";
const CONCURRENCY_LEVELS = parseConcurrencyLevels(process.env.CONCURRENCY_LEVELS ?? "5,10,20,30,40,50,75,100");
const LEVEL_DURATION_MS = Math.max(5_000, Number(process.env.LEVEL_DURATION_MS ?? "60000"));
const ACTIONS_PER_CLIENT_PER_SEC = Math.max(0.1, Number(process.env.ACTIONS_PER_CLIENT_PER_SEC ?? "1"));
const AUTH_TOKEN_PREFIX = process.env.AUTH_TOKEN_PREFIX ?? "loadtest-";
const GATEWAY_METRICS_URL = process.env.GATEWAY_METRICS_URL ?? "http://127.0.0.1:3101/metrics";
const SIMULATION_METRICS_URL = process.env.SIMULATION_METRICS_URL ?? "http://127.0.0.1:50052/metrics";
const CANDIDATE_VISION_RADIUS = 4;
const RESOURCE_PAUSE_MS = 2500;
const MAX_RESOURCE_PAUSES = 3;

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
    if (
      typeof thresholds.simWriterQueueDepthMaxDepth === "number" &&
      typeof record.simWriterQueueDepthMaxDepth === "number" &&
      record.simWriterQueueDepthMaxDepth >= thresholds.simWriterQueueDepthMaxDepth
    ) {
      return record.level;
    }
    // Per-action-type SLA (e.g. "1s max, for every action type, at all
    // times") — checked independently of the pooled acceptedP99Ms above so a
    // regression isolated to one action type (say, SETTLE alone going slow)
    // can't hide behind the other types' healthy numbers in the pooled stat.
    if (typeof thresholds.acceptedMaxMsByType === "number" && record.byActionType) {
      for (const stats of Object.values(record.byActionType)) {
        if (typeof stats.maxMs === "number" && stats.maxMs >= thresholds.acceptedMaxMsByType) return record.level;
      }
    }
  }
  return null;
}

const tileKey = (x, y) => `${x},${y}`;

export const parseMuster = (musterJson) => {
  if (typeof musterJson !== "string" || musterJson.length === 0) return undefined;
  try {
    const parsed = JSON.parse(musterJson);
    return typeof parsed?.mode === "string" ? parsed : undefined;
  } catch {
    return undefined;
  }
};

const normalizeTile = (tile) => ({
  x: Number(tile.x),
  y: Number(tile.y),
  ...(typeof tile.terrain === "string" ? { terrain: tile.terrain } : {}),
  ...(typeof tile.resource === "string" ? { resource: tile.resource } : {}),
  ...(typeof tile.ownerId === "string" ? { ownerId: tile.ownerId } : {}),
  ...(typeof tile.ownershipState === "string" ? { ownershipState: tile.ownershipState } : {}),
  // Settle-eligibility: owned LAND tile with neither field set has no town yet.
  ...(typeof tile.townPopulationTier === "string" ? { townPopulationTier: tile.townPopulationTier } : {}),
  ...(typeof tile.townJson === "string" && tile.townJson.length > 0 ? { hasTown: true } : {}),
  // Muster state: undefined = no flag (can SET_MUSTER HOLD); mode "HOLD" = flag
  // placed but not yet firing (can switch to ADVANCE); mode "ADVANCE" = already
  // auto-firing via the simulation's background muster tick (runtime-muster-tick.ts)
  // — nothing further to send for it, the load is server-side from here.
  ...(parseMuster(tile.musterJson) ? { muster: parseMuster(tile.musterJson) } : {})
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

// Invalid-candidate learning is scoped by action type (not just tile
// coordinate) — a coordinate that failed as an EXPAND target (say, someone
// else claimed the neighbor) says nothing about whether that same
// coordinate is eligible for a completely different action, e.g. the
// player's own SETTLE on a tile that happens to sit at those coordinates.
// Sharing one unscoped set across all four action types was found live to
// make SETTLE/SET_MUSTER candidate pools silently empty out within the
// first few EXPAND/ATTACK rejections, well before their own tiles ever
// actually failed. SET_MUSTER's two modes (HOLD/ADVANCE) are scoped
// separately too — they have unrelated eligibility rules.
const invalidationScope = (payload) => (payload.type === "SET_MUSTER" ? `SET_MUSTER_${payload.mode}` : payload.type);
const scopedKey = (scope, x, y) => `${scope}:${tileKey(x, y)}`;
const originKeyOf = (payload) =>
  scopedKey(invalidationScope(payload), payload.fromX ?? payload.x, payload.fromY ?? payload.y);
const targetKeyOf = (payload) =>
  scopedKey(invalidationScope(payload), payload.toX ?? payload.x, payload.toY ?? payload.y);

const collectFrontierCandidates = (tilesByKey, playerId, invalidTargets, invalidOrigins) => {
  const expandPayloads = [];
  const attackPayloads = [];
  const directions = [[1, 0], [-1, 0], [0, 1], [0, -1]];

  for (const tile of tilesByKey.values()) {
    if (!tile || tile.ownerId !== playerId || tile.terrain !== "LAND") continue;
    for (const [dx, dy] of directions) {
      const neighbor = tilesByKey.get(tileKey(tile.x + dx, tile.y + dy));
      if (!neighbor || neighbor.terrain !== "LAND") continue;
      if (!neighbor.ownerId) {
        if (invalidOrigins.has(scopedKey("EXPAND", tile.x, tile.y)) || invalidTargets.has(scopedKey("EXPAND", neighbor.x, neighbor.y))) continue;
        expandPayloads.push({ type: "EXPAND", fromX: tile.x, fromY: tile.y, toX: neighbor.x, toY: neighbor.y });
        continue;
      }
      if (neighbor.ownerId !== playerId) {
        if (invalidOrigins.has(scopedKey("ATTACK", tile.x, tile.y)) || invalidTargets.has(scopedKey("ATTACK", neighbor.x, neighbor.y))) continue;
        attackPayloads.push({ type: "ATTACK", fromX: tile.x, fromY: tile.y, toX: neighbor.x, toY: neighbor.y });
      }
    }
  }

  const ranked = (list) =>
    list.map((p) => ({ payload: p, score: candidateScore(tilesByKey, p, playerId) }))
      .sort((a, b) => b.score - a.score)
      .map((e) => e.payload);

  return { expands: ranked(expandPayloads), attacks: ranked(attackPayloads) };
};

// SETTLE requires ownershipState === "FRONTIER" specifically (see
// handleSettleCommand in apps/simulation/src/runtime/runtime.ts) — an
// established interior ("SETTLED") tile is not eligible even though you own
// it. Owning-but-not-frontier is the common case for older territory, so
// this is a much narrower pool than "everything you own without a town".
export const collectSettleCandidates = (tilesByKey, playerId, invalidTargets, invalidOrigins) => {
  const payloads = [];
  for (const tile of tilesByKey.values()) {
    if (!tile || tile.ownerId !== playerId || tile.terrain !== "LAND") continue;
    if (tile.ownershipState !== "FRONTIER") continue;
    if (tile.townPopulationTier || tile.hasTown) continue;
    const key = scopedKey("SETTLE", tile.x, tile.y);
    if (invalidOrigins.has(key) || invalidTargets.has(key)) continue;
    payloads.push({ type: "SETTLE", x: tile.x, y: tile.y });
  }
  return payloads;
};

// Owned LAND tiles with no muster flag yet — candidates to place one (mode HOLD).
export const collectMusterHoldCandidates = (tilesByKey, playerId, invalidTargets, invalidOrigins) => {
  const payloads = [];
  for (const tile of tilesByKey.values()) {
    if (!tile || tile.ownerId !== playerId || tile.terrain !== "LAND") continue;
    if (tile.muster) continue;
    const key = scopedKey("SET_MUSTER_HOLD", tile.x, tile.y);
    if (invalidOrigins.has(key) || invalidTargets.has(key)) continue;
    payloads.push({ type: "SET_MUSTER", x: tile.x, y: tile.y, mode: "HOLD" });
  }
  return payloads;
};

// Owned tiles already holding a muster flag (mode HOLD) — candidates to activate
// it (mode ADVANCE). Once ADVANCE is set, the simulation's own background muster
// tick (runtime-muster-tick.ts) auto-fires attacks via BFS from that tile on its
// own cadence — the client sends this ONE command, not a stream of attacks, so
// the ongoing load from "100 players with active ADVANCE flags" is mostly
// server-side tick cost, not client-request volume. See the load-test plan.
// MUSTER_ATTACK_COST (packages/shared/src/config.ts) is 60 — the higher of the
// two mustered-manpower thresholds the server enforces (FRONTIER_ATTACK_MUSTER_COST
// is 15, for expand-via-muster). Requiring the full 60 before treating a flag as
// advance-ready keeps this conservative regardless of what auto-fire finds nearby.
// Accrual is MUSTER_BASE_RATE_PER_MIN=180/min, so a flag placed seconds ago in
// this same run won't clear this bar — ADVANCE candidates mostly come from
// flags that were already mustering before the test started (see the
// pre-seeding note in the load-test plan).
const MUSTER_ADVANCE_READY_AMOUNT = 60;

export const collectMusterAdvanceCandidates = (tilesByKey, playerId, invalidTargets, invalidOrigins) => {
  const payloads = [];
  for (const tile of tilesByKey.values()) {
    if (!tile || tile.ownerId !== playerId || tile.terrain !== "LAND") continue;
    if (tile.muster?.mode !== "HOLD") continue;
    if (!(Number(tile.muster.amount) >= MUSTER_ADVANCE_READY_AMOUNT)) continue;
    const key = scopedKey("SET_MUSTER_ADVANCE", tile.x, tile.y);
    if (invalidOrigins.has(key) || invalidTargets.has(key)) continue;
    payloads.push({ type: "SET_MUSTER", x: tile.x, y: tile.y, mode: "ADVANCE" });
  }
  return payloads;
};

// Weighted mix approximating a real player's action spread: expand and attack
// dominate, settling and mustering are less frequent. Configurable via env so
// a run can be skewed toward stressing one action type specifically.
const ACTION_WEIGHTS = {
  EXPAND: Math.max(0, Number(process.env.WEIGHT_EXPAND ?? "40")),
  ATTACK: Math.max(0, Number(process.env.WEIGHT_ATTACK ?? "25")),
  SETTLE: Math.max(0, Number(process.env.WEIGHT_SETTLE ?? "20")),
  MUSTER_HOLD: Math.max(0, Number(process.env.WEIGHT_MUSTER_HOLD ?? "8")),
  MUSTER_ADVANCE: Math.max(0, Number(process.env.WEIGHT_MUSTER_ADVANCE ?? "7"))
};

// Picks one candidate payload per call, weighted across the pools that
// currently have anything eligible. Falls back through EXPAND -> ATTACK when
// a pool is empty (matches the prior EXPAND-preferred behavior) rather than
// failing outright just because, say, everything is already settled.
export const pickCandidatePayload = (tilesByKey, playerId, invalidTargets, invalidOrigins) => {
  const { expands, attacks } = collectFrontierCandidates(tilesByKey, playerId, invalidTargets, invalidOrigins);
  const settles = collectSettleCandidates(tilesByKey, playerId, invalidTargets, invalidOrigins);
  const musterHolds = collectMusterHoldCandidates(tilesByKey, playerId, invalidTargets, invalidOrigins);
  const musterAdvances = collectMusterAdvanceCandidates(tilesByKey, playerId, invalidTargets, invalidOrigins);

  const pools = [
    { weight: ACTION_WEIGHTS.EXPAND, list: expands },
    { weight: ACTION_WEIGHTS.ATTACK, list: attacks },
    { weight: ACTION_WEIGHTS.SETTLE, list: settles },
    { weight: ACTION_WEIGHTS.MUSTER_HOLD, list: musterHolds },
    { weight: ACTION_WEIGHTS.MUSTER_ADVANCE, list: musterAdvances }
  ].filter((pool) => pool.list.length > 0 && pool.weight > 0);

  if (pools.length === 0) {
    // Nothing weighted is available — fall back to whatever exists at all,
    // preferring expand (matches the original script's behavior).
    if (expands.length > 0) return expands[0];
    if (attacks.length > 0) return attacks[0];
    if (settles.length > 0) return settles[0];
    if (musterHolds.length > 0) return musterHolds[0];
    if (musterAdvances.length > 0) return musterAdvances[0];
    return undefined;
  }

  const totalWeight = pools.reduce((sum, pool) => sum + pool.weight, 0);
  let roll = Math.random() * totalWeight;
  for (const pool of pools) {
    roll -= pool.weight;
    if (roll <= 0) return pool.list[0];
  }
  return pools.at(-1).list[0];
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
    const state = {
      socket,
      playerId: token,
      nextClientSeq: 1,
      tilesByKey: new Map(),
      pending: new Map(),
      // Tracks accepted-but-not-yet-resolved commands so COMBAT_RESULT/FRONTIER_RESULT
      // latency can be sampled passively, without making the action loop wait for it.
      // EXPAND resolves via FRONTIER_CLAIM_MS (15s) and ATTACK via COMBAT_LOCK_MS (30s)
      // — both game-mechanic timers, not server latency — so blocking the pacing loop
      // on them (as opposed to just observing them) reintroduces the exact bug fixed in
      // the nightly-load-harness workflow (see LOAD_HARNESS_WAIT_FOR_RESULT).
      awaitingResolution: new Map(),
      resolvedLatencies: [],
      // Single-slot, not a map — this script dispatches serially (one
      // command in flight per client), so there's never more than one
      // uncorrelated command awaiting its ACTION_ACCEPTED at a time. See the
      // SET_MUSTER comment in the message handler below.
      waitingUncorrelated: undefined,
      ready: false
    };
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

      // Checked independently of `pending` below — by the time a resolution
      // message arrives, ACTION_ACCEPTED has usually already deleted the
      // pending entry and unblocked the action loop for this commandId.
      if (msg.type === "COMBAT_RESULT" || msg.type === "FRONTIER_RESULT") {
        const awaiting = state.awaitingResolution.get(msg.commandId);
        if (awaiting) {
          state.awaitingResolution.delete(msg.commandId);
          state.resolvedLatencies.push(Date.now() - awaiting.startedAt);
        }
      }

      // SET_MUSTER needs special handling on two fronts:
      // 1. dispatchDurableCommand is called without withMetadata (see
      //    gateway-app.ts) — unlike EXPAND/ATTACK/SETTLE, the client's
      //    commandId is never forwarded; the server always assigns its own.
      //    commandId correlation is therefore impossible.
      // 2. handleSetMusterCommand (apps/simulation/src/runtime-structure-
      //    lifecycle-command-handlers.ts) calls resolveCommand() directly on
      //    success — it never goes through an "accepted" step at all, so no
      //    ACTION_ACCEPTED is ever sent for it, correlatable or not.
      // The only response the client genuinely gets is COMMAND_QUEUED (the
      // gateway's own persistence ack, sent before the simulation RPC even
      // happens) — that's the best available signal, though it necessarily
      // measures less of the round trip than ACTION_ACCEPTED does for the
      // other three action types. Since this script dispatches serially
      // (never more than one command in flight per client), an uncorrelated
      // COMMAND_QUEUED arriving while a SET_MUSTER is the only thing awaited
      // can safely be attributed to it.
      if (msg.type === "COMMAND_QUEUED" && state.waitingUncorrelated && !state.pending.has(msg.commandId)) {
        const entry = state.waitingUncorrelated;
        state.waitingUncorrelated = undefined;
        clearTimeout(entry.timer);
        entry.resolve({ kind: "accepted", actionType: entry.payload.type, acceptedDelayMs: Date.now() - entry.startedAt });
        return;
      }

      const entry = state.pending.get(msg.commandId);
      if (!entry) return;

      if (msg.type === "ACTION_ACCEPTED") {
        entry.acceptedAt = Date.now();
        clearTimeout(entry.timer);
        state.pending.delete(msg.commandId);
        // Only EXPAND/ATTACK get a correlated terminal message (FRONTIER_RESULT/
        // COMBAT_RESULT) — SETTLE and SET_MUSTER don't, so there's nothing to await.
        if (entry.payload.type === "EXPAND" || entry.payload.type === "ATTACK") {
          state.awaitingResolution.set(msg.commandId, { startedAt: entry.startedAt });
        }
        entry.resolve({ kind: "accepted", actionType: entry.payload.type, acceptedDelayMs: entry.acceptedAt - entry.startedAt });
        return;
      }

      if (msg.type === "COMBAT_RESULT" || msg.type === "FRONTIER_RESULT") {
        if (entry.acceptedAt === 0) entry.acceptedAt = Date.now();
        clearTimeout(entry.timer);
        state.pending.delete(msg.commandId);
        entry.resolve({ kind: "accepted", actionType: entry.payload.type, acceptedDelayMs: entry.acceptedAt - entry.startedAt });
        return;
      }

      if (msg.type === "ERROR") {
        const recoverable = ["ATTACK_COOLDOWN", "ATTACK_TARGET_INVALID", "NOT_OWNER", "NOT_ADJACENT",
          "LOCKED", "EXPAND_TARGET_OWNED", "BARRIER", "EXPAND_COOLDOWN",
          // SETTLE_INVALID covers several reasons (not a frontier tile, bad terrain,
          // already settling, no free development slot) and MUSTER_INVALID covers
          // "no muster on owned tile" / "owned LAND tile required" — all are
          // per-tile, so learning and skipping the tile (not retrying it every
          // tick until its 60s SETTLE_MS timer clears) is the right response.
          "SETTLE_INVALID", "MUSTER_INVALID",
          // Safety net for MUSTER_ADVANCE_READY_AMOUNT being an approximation
          // of the server's real (target-dependent) threshold — if a candidate
          // still isn't ready, learn and skip it rather than retry every tick.
          "INSUFFICIENT_MUSTER"];
        if (recoverable.includes(msg.code)) {
          clearTimeout(entry.timer);
          state.pending.delete(msg.commandId);
          entry.resolve({
            kind: "error_recoverable",
            code: msg.code,
            originKey: originKeyOf(entry.payload),
            targetKey: targetKeyOf(entry.payload)
          });
          return;
        }

        if (msg.code === "INSUFFICIENT_MANPOWER" || msg.code === "INSUFFICIENT_RESOURCES") {
          clearTimeout(entry.timer);
          state.pending.delete(msg.commandId);
          entry.resolve({ kind: "resource_exhausted", code: msg.code });
          return;
        }

        clearTimeout(entry.timer);
        state.pending.delete(msg.commandId);
        entry.reject(new Error(`${msg.code}: ${msg.message}`));
      }
    });

    socket.on("error", (err) => { clearTimeout(timer); reject(err); });
  });

const closeSession = async (state) => {
  if (!state?.socket) return;
  try { state.socket.close(); } catch { /* */ }
};

// ── Serial action dispatch (one per client, no listener pileup) ─────────────

const sendAction = (state, timeoutMs, invalidTargets, invalidOrigins) =>
  new Promise((resolve, reject) => {
    const candidate = pickCandidatePayload(state.tilesByKey, state.playerId, invalidTargets, invalidOrigins);
    if (!candidate) {
      reject(new Error("no frontier action candidate"));
      return;
    }
    const payload = {
      ...candidate,
      clientSeq: state.nextClientSeq,
      commandId: `cl-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    };
    state.nextClientSeq += 1;
    const startedAt = Date.now();

    const entry = {
      resolve,
      reject,
      startedAt,
      acceptedAt: 0,
      payload,
      timer: setTimeout(() => {
        state.pending.delete(payload.commandId);
        if (state.waitingUncorrelated === entry) state.waitingUncorrelated = undefined;
        reject(new Error("action timeout"));
      }, timeoutMs)
    };

    state.pending.set(payload.commandId, entry);
    // See the SET_MUSTER comment in the message handler — its commandId is
    // never echoed back, so it can't be found via state.pending at all.
    if (payload.type === "SET_MUSTER") state.waitingUncorrelated = entry;
    state.socket.send(JSON.stringify(payload));
  });

// ── Per-client action loop (serial, resource-aware) ─────────────────────────

const ACTION_TYPES = ["EXPAND", "ATTACK", "SETTLE", "SET_MUSTER"];

const actionLoop = async (state, deadlineAt, actionIntervalMs, actionTimeoutMs) => {
  const acceptedLatenciesByType = Object.fromEntries(ACTION_TYPES.map((t) => [t, []]));
  const invalidTargets = new Set();
  const invalidOrigins = new Set();
  let resourcePauses = 0;
  let exhausted = false;

  while (Date.now() < deadlineAt && !exhausted) {
    const loopStart = Date.now();

    try {
      const result = await sendAction(state, actionTimeoutMs, invalidTargets, invalidOrigins);

      if (result.kind === "accepted" && typeof result.acceptedDelayMs === "number") {
        (acceptedLatenciesByType[result.actionType] ??= []).push(result.acceptedDelayMs);
        resourcePauses = 0;
      } else if (result.kind === "error_recoverable") {
        // Learn from recoverable rejection to avoid re-picking same candidate
        if (result.code === "NOT_OWNER") {
          invalidOrigins.add(result.originKey);
        } else {
          invalidTargets.add(result.targetKey);
        }
        resourcePauses = 0;
      } else if (result.kind === "resource_exhausted") {
        resourcePauses += 1;
        if (resourcePauses > MAX_RESOURCE_PAUSES) {
          exhausted = true;
          break;
        }
        await new Promise((r) => setTimeout(r, RESOURCE_PAUSE_MS));
        continue;
      }
    } catch (err) {
      if (process.env.DEBUG_LOAD_SCRIPT === "1") console.error("[debug] tick error:", err.message);
      // Non-recoverable error — skip this tick
    }

    // Maintain cadence: sleep for the remainder of the interval. Previously
    // guarded with `&& Date.now() + remaining < deadlineAt` to avoid an extra
    // delay right at the end of the level — but a client that runs out of
    // candidates (a real scenario once SETTLE/MUSTER pools exhaust, not just
    // a rare edge case) then has sendAction reject synchronously every call,
    // making `elapsed` ~0 forever, and that guard skips sleeping entirely
    // once inside the last actionIntervalMs of the level — spinning the
    // event loop as fast as possible for the remainder of the level (47k+
    // iterations/45s observed locally). Always sleeping is at worst a few
    // hundred ms past the nominal deadline, which is harmless.
    const elapsed = Date.now() - loopStart;
    const remaining = actionIntervalMs - elapsed;
    if (remaining > 0) {
      await new Promise((r) => setTimeout(r, remaining));
    }
  }

  return { acceptedLatenciesByType, resolvedLatencies: state.resolvedLatencies, exhausted };
};

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

  // Baseline counters so this level's delta (not the process's lifetime total)
  // is what gets reported — otherwise retries/backpressure from an earlier
  // level would inflate every subsequent level's numbers.
  const baselineMetrics = await Promise.all([
    fetchMetrics(GATEWAY_METRICS_URL).catch(() => ({})),
    fetchMetrics(SIMULATION_METRICS_URL).catch(() => ({}))
  ]);
  const baselineGatewaySqliteRetryTotal = baselineMetrics[0]["gateway_sqlite_retry_total"] ?? 0;
  const baselineSimWriterQueueBackpressureWaitTotal = baselineMetrics[1]["sim_writer_queue_backpressure_wait_total"] ?? 0;

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

  // Start serial action loops for each connected client
  const deadlineAt = Date.now() + durationMs;
  const loopResults = await Promise.all(
    clients.map((state) => actionLoop(state, deadlineAt, actionIntervalMs, actionTimeoutMs))
  );

  // Stop metrics polling
  stopSignal.stopped = true;
  const metricsSamples = await metricsPromise;

  // Close all clients
  await Promise.all(clients.map(closeSession));

  // Aggregate
  const latenciesByType = Object.fromEntries(
    ACTION_TYPES.map((type) => [
      type,
      loopResults.flatMap((l) => l.acceptedLatenciesByType[type] ?? []).filter((v) => Number.isFinite(v))
    ])
  );
  const allLatencies = ACTION_TYPES.flatMap((type) => latenciesByType[type]);
  const allResolvedLatencies = loopResults.flatMap((l) => l.resolvedLatencies).filter((v) => Number.isFinite(v));
  const exhaustedCount = loopResults.filter((l) => l.exhausted).length;

  // Per-action-type breakdown — the 1s SLA is evaluated per type (see
  // acceptedP99UnderSlaMsByType in computeCliffLevel), not just on the pooled
  // total, since SETTLE/SET_MUSTER could plausibly have a different cost
  // profile than EXPAND/ATTACK and pooling would hide a regression isolated
  // to one action type.
  const byActionType = Object.fromEntries(
    ACTION_TYPES.map((type) => {
      const values = latenciesByType[type];
      return [
        type,
        {
          count: values.length,
          p50Ms: quantile(values, 0.5),
          p95Ms: quantile(values, 0.95),
          p99Ms: quantile(values, 0.99),
          maxMs: values.length > 0 ? Math.max(...values) : null
        }
      ];
    })
  );

  const lastSample = metricsSamples.at(-1);
  const gatewaySqliteRetryTotalDelta = lastSample
    ? Math.max(0, (lastSample.gateway["gateway_sqlite_retry_total"] ?? 0) - baselineGatewaySqliteRetryTotal)
    : null;
  const simWriterQueueBackpressureWaitDelta = lastSample
    ? Math.max(0, (lastSample.simulation["sim_writer_queue_backpressure_wait_total"] ?? 0) - baselineSimWriterQueueBackpressureWaitTotal)
    : null;

  return {
    level,
    clientsRequested: level,
    clientsConnected: clients.length,
    initFailures: initFailures.length,
    initFailureDetails: initFailures.slice(0, 10),
    exhaustedClients: exhaustedCount,
    totalAcceptedActions: allLatencies.length,
    acceptedP50Ms: quantile(allLatencies, 0.5),
    acceptedP95Ms: quantile(allLatencies, 0.95),
    acceptedP99Ms: quantile(allLatencies, 0.99),
    acceptedMaxMs: allLatencies.length > 0 ? Math.max(...allLatencies) : null,
    byActionType,
    // Full COMBAT_RESULT/FRONTIER_RESULT round trip, sampled passively (see
    // awaitingResolution in openSession) — dominated by the game's own
    // FRONTIER_CLAIM_MS/COMBAT_LOCK_MS timers, not server latency. Reported
    // for visibility that resolution is still happening correctly under
    // load, NOT gated on — an EXPAND/ATTACK can never resolve in under 15s/
    // 30s by design, so a tight SLA here would always fail regardless of
    // server health.
    resolvedSampleCount: allResolvedLatencies.length,
    resolvedP50Ms: quantile(allResolvedLatencies, 0.5),
    resolvedP99Ms: quantile(allResolvedLatencies, 0.99),
    resolvedMaxMs: allResolvedLatencies.length > 0 ? Math.max(...allResolvedLatencies) : null,
    gatewayEventLoopMaxMs: metricsSamples.length > 0
      ? Math.max(...metricsSamples.map((s) => s.gateway["gateway_event_loop_max_ms"] ?? 0)) : null,
    simEventLoopMaxMs: metricsSamples.length > 0
      ? Math.max(...metricsSamples.map((s) => s.simulation["sim_event_loop_max_ms"] ?? 0)) : null,
    simHumanInteractiveBacklogMaxMs: metricsSamples.length > 0
      ? Math.max(...metricsSamples.map((s) => s.simulation["sim_human_interactive_backlog_ms"] ?? 0)) : null,
    simCheckpointRssMaxMb: metricsSamples.length > 0
      ? Math.max(...metricsSamples.map((s) => s.simulation["sim_checkpoint_rss_mb"] ?? 0)) : null,
    // sim_writer_queue_depth is a live gauge of in-flight SQLite writer-worker
    // messages (DEFAULT_MAX_PENDING=500 is where the sim thread starts
    // self-throttling); a level trending toward that cap is the earliest
    // signal of a persistence bottleneck, well before event-loop lag shows it.
    simWriterQueueDepthMaxDepth: metricsSamples.length > 0
      ? Math.max(...metricsSamples.map((s) => s.simulation["sim_writer_queue_depth"] ?? 0)) : null,
    simWriterQueueBackpressureWaitDelta,
    gatewaySqliteRetryTotalDelta,
    metricsSampleCount: metricsSamples.length
  };
};

// ── Main ────────────────────────────────────────────────────────────────────

const isMain = import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMain) {
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dateStamp = new Date().toISOString().slice(0, 10);
const outputPath = resolve(root, "docs", "load-results", `concurrent-${dateStamp}.json`);

const thresholds = {
  acceptedP99Ms: 250,
  gatewayEventLoopMaxMs: 1000,
  simEventLoopMaxMs: 1000,
  // DEFAULT_MAX_PENDING in SqliteWriterChannel (apps/simulation) is 500 — the
  // point where the sim thread starts self-throttling writes. Gate at 400 so
  // a queue trending toward saturation trips the cliff before backpressure
  // (and the command-acceptance latency it causes) actually engages.
  simWriterQueueDepthMaxDepth: 400,
  // "Never above 1s, for any of the four action types" SLA. This is the
  // acceptance ack (ACTION_ACCEPTED/COMMAND_QUEUED), never the full
  // FRONTIER_RESULT/COMBAT_RESULT resolution — see resolvedP99Ms's comment
  // in runLevel for why a 1s SLA against resolution would be meaningless.
  acceptedMaxMsByType: Math.max(1, Number(process.env.ACCEPTED_MAX_MS_SLA ?? "1000"))
};

const levelRecords = [];

for (const level of CONCURRENCY_LEVELS) {
  console.log(`[level] starting N=${level} clients, duration=${LEVEL_DURATION_MS}ms...`);
  const record = await runLevel(level, LEVEL_DURATION_MS, ACTIONS_PER_CLIENT_PER_SEC);
  levelRecords.push(record);
  console.log(`[level] N=${level} connected=${record.clientsConnected} failed=${record.initFailures} ` +
    `exhausted=${record.exhaustedClients} actions=${record.totalAcceptedActions} ` +
    `p99=${record.acceptedP99Ms}ms resolvedP99=${record.resolvedP99Ms}ms ` +
    `gwLoop=${record.gatewayEventLoopMaxMs}ms simLoop=${record.simEventLoopMaxMs}ms ` +
    `writerQueue=${record.simWriterQueueDepthMaxDepth} sqliteRetries=${record.gatewaySqliteRetryTotalDelta}`);
  for (const [type, stats] of Object.entries(record.byActionType)) {
    if (stats.count === 0) continue;
    console.log(`  [${type}] n=${stats.count} p50=${stats.p50Ms}ms p99=${stats.p99Ms}ms max=${stats.maxMs}ms`);
  }
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

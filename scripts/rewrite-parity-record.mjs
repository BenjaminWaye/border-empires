#!/usr/bin/env node
/**
 * scripts/rewrite-parity-record.mjs
 *
 * Parity trace recorder — autonomous client that connects to a live game
 * server, drives a gameplay session covering all DurableCommandType variants,
 * and saves the command sequence to docs/parity-traces/real-YYYYMMDD.json
 * for use with rewrite-parity-replay.mjs.
 *
 * Usage:
 *   node scripts/rewrite-parity-record.mjs [output-file]
 *   PARITY_RECORD=1 node scripts/rewrite-parity-record.mjs [output-file]
 *
 * Environment variables:
 *   RECORD_WS_URL        WebSocket URL to record against
 *                        (default: wss://border-empires.fly.dev/ws)
 *   PARITY_AUTH_TOKEN    Auth token / player credential
 *                        (default: __parity_harness_player__)
 *   PARITY_TIMEOUT_MS    Per-command wait timeout ms (default: 20000)
 *   RECORD_MIN_COMMANDS  Minimum commands before writing the file (default: 50)
 *
 * Output format is compatible with rewrite-parity-replay.mjs.
 *
 * Design notes:
 *   - Commands are driven in a fixed playbook covering the core
 *     DurableCommandType set. Rare commands (CAST_AETHER_BRIDGE, SIPHON_TILE,
 *     etc.) are attempted and recorded with their ERROR if preconditions are
 *     absent — this is valid for parity testing (both servers should return
 *     the same error).
 *   - State is maintained incrementally: TILE_DELTA_BATCH and
 *     PLAYER_UPDATE/PLAYER_SUBSCRIPTION_SNAPSHOT drive world-state refreshes
 *     so each playbook step can inspect current owned tiles, frontier,
 *     resources, and techs.
 *   - The recorder always writes the file when it exits, even if fewer than
 *     RECORD_MIN_COMMANDS were recorded (it exits with code 1 in that case).
 *
 * See §9.3 of docs/rewrite-completion-plan-2026-04-19.md for context.
 */

import { mkdir, writeFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const recordWsUrl = process.env.RECORD_WS_URL ?? "wss://border-empires.fly.dev/ws";
const authToken = process.env.PARITY_AUTH_TOKEN ?? "__parity_harness_player__";
const perCommandTimeoutMs = Math.max(5_000, Number(process.env.PARITY_TIMEOUT_MS ?? "20000"));
const minCommands = Math.max(1, Number(process.env.RECORD_MIN_COMMANDS ?? "50"));

const now = new Date();
const dateStamp = now.toISOString().slice(0, 10).replace(/-/g, "");
const defaultOutput = resolve(root, "docs", "parity-traces", `real-${dateStamp}.json`);
const outputFile = process.argv[2] ?? defaultOutput;

// ---------------------------------------------------------------------------
// World state (mutated in place as events arrive)
// ---------------------------------------------------------------------------

const state = {
  playerId: authToken,
  worldSeed: null,
  seasonId: null,
  snapshotLabel: null,
  tilesByKey: new Map(),    // key="{x},{y}" → TileData
  gold: 0,
  manpower: 0,
  techIds: [],
  domainId: null,
  tileCount: 0,
  availableTechChoices: [],  // tech ids we can choose next
  availableDomainChoices: [], // domain ids we can choose
};

const tileKey = (x, y) => `${x},${y}`;

const applyTileDelta = (tiles) => {
  for (const t of tiles) {
    const key = tileKey(t.x, t.y);
    const existing = state.tilesByKey.get(key) ?? { x: t.x, y: t.y };
    state.tilesByKey.set(key, { ...existing, ...t });
  }
};

const applyPlayerUpdate = (msg) => {
  if (typeof msg.gold === "number") state.gold = msg.gold;
  if (typeof msg.manpower === "number") state.manpower = msg.manpower;
  if (typeof msg.tileCount === "number") state.tileCount = msg.tileCount;
  if (typeof msg.domainId === "string") state.domainId = msg.domainId;
  if (Array.isArray(msg.techIds)) state.techIds = msg.techIds;
  if (Array.isArray(msg.availableTechChoices)) state.availableTechChoices = msg.availableTechChoices;
  if (Array.isArray(msg.availableDomainChoices)) state.availableDomainChoices = msg.availableDomainChoices;
};

// ---------------------------------------------------------------------------
// State queries used by the playbook
// ---------------------------------------------------------------------------

const DIRECTIONS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

const ownedTiles = () =>
  [...state.tilesByKey.values()].filter((t) => t.ownerId === state.playerId && t.terrain === "LAND");

const settledTiles = () =>
  ownedTiles().filter((t) => t.ownershipState === "SETTLED");

const unsettledTiles = () =>
  ownedTiles().filter((t) => t.ownershipState !== "SETTLED");

const frontierTiles = () => {
  const frontier = [];
  const seen = new Set();
  for (const owned of ownedTiles()) {
    for (const [dx, dy] of DIRECTIONS) {
      const key = tileKey(owned.x + dx, owned.y + dy);
      if (seen.has(key)) continue;
      seen.add(key);
      const neighbor = state.tilesByKey.get(key);
      if (neighbor && neighbor.terrain === "LAND" && !neighbor.ownerId) {
        frontier.push({ origin: owned, target: neighbor });
      }
    }
  }
  return frontier;
};

const enemyAdjacentTiles = () => {
  const results = [];
  const seen = new Set();
  for (const owned of ownedTiles()) {
    for (const [dx, dy] of DIRECTIONS) {
      const key = tileKey(owned.x + dx, owned.y + dy);
      if (seen.has(key)) continue;
      seen.add(key);
      const neighbor = state.tilesByKey.get(key);
      if (neighbor && neighbor.terrain === "LAND" && neighbor.ownerId && neighbor.ownerId !== state.playerId) {
        results.push({ origin: owned, target: neighbor });
      }
    }
  }
  return results;
};

const tileWithStructure = (structureType) =>
  [...state.tilesByKey.values()].find(
    (t) => t.ownerId === state.playerId &&
      Array.isArray(t.structures) &&
      t.structures.includes(structureType)
  ) ?? null;

const tileWithPendingBuild = () =>
  [...state.tilesByKey.values()].find(
    (t) => t.ownerId === state.playerId && t.pendingBuildType
  ) ?? null;

const tileWithResource = () =>
  [...state.tilesByKey.values()].find(
    (t) => t.ownerId === state.playerId &&
      t.resource &&
      t.resource !== "NONE" &&
      t.ownershipState === "SETTLED"
  ) ?? null;

const anyEnemyTile = () =>
  [...state.tilesByKey.values()].find(
    (t) => t.ownerId && t.ownerId !== state.playerId && t.terrain === "LAND"
  ) ?? null;

// ---------------------------------------------------------------------------
// WebSocket connection + sendAndWait
// ---------------------------------------------------------------------------

let ws;
let pendingCommandId = null;
let pendingResolve = null;
let pendingReject = null;
let pendingTimer = null;

const isTerminalEvent = (msg) =>
  msg.commandId === pendingCommandId &&
  (msg.type === "ACTION_ACCEPTED" ||
    msg.type === "COMBAT_RESULT" ||
    msg.type === "FRONTIER_RESULT" ||
    msg.type === "COLLECT_RESULT" ||
    msg.type === "TECH_UPDATE" ||
    msg.type === "DOMAIN_UPDATE" ||
    msg.type === "TILE_DELTA_BATCH" ||
    msg.type === "ERROR");

const handleMessage = (data) => {
  let msg;
  try {
    msg = JSON.parse(data.toString());
  } catch {
    return;
  }

  // Update world state from all incoming messages
  if (msg.type === "TILE_DELTA_BATCH" && Array.isArray(msg.tiles)) {
    applyTileDelta(msg.tiles);
  }
  if (msg.type === "PLAYER_UPDATE" || msg.type === "PLAYER_SUBSCRIPTION_SNAPSHOT") {
    applyPlayerUpdate(msg);
  }
  if (msg.type === "TECH_UPDATE") {
    if (Array.isArray(msg.techIds)) state.techIds = msg.techIds;
    if (Array.isArray(msg.availableTechChoices)) state.availableTechChoices = msg.availableTechChoices;
  }
  if (msg.type === "DOMAIN_UPDATE") {
    if (typeof msg.domainId === "string") state.domainId = msg.domainId;
    if (Array.isArray(msg.availableDomainChoices)) state.availableDomainChoices = msg.availableDomainChoices;
  }

  // Resolve any pending command wait
  if (pendingCommandId && isTerminalEvent(msg)) {
    clearTimeout(pendingTimer);
    const resolve = pendingResolve;
    pendingCommandId = null;
    pendingResolve = null;
    pendingReject = null;
    pendingTimer = null;
    resolve(msg);
  }
};

/**
 * Connects to the game WebSocket, sends AUTH, waits for INIT.
 * Returns worldSeed, seasonId, snapshotLabel, and playerId from INIT payload.
 */
const connect = () =>
  new Promise(async (resolve, reject) => {
    let WebSocket;
    try {
      WebSocket = globalThis.WebSocket ?? (await import("ws")).default;
    } catch {
      reject(new Error("WebSocket not available. Run: pnpm add -D ws"));
      return;
    }

    ws = new WebSocket(recordWsUrl);
    const initTimer = setTimeout(() => {
      ws.close();
      reject(new Error(`Timed out waiting for INIT from ${recordWsUrl}`));
    }, perCommandTimeoutMs);

    const onOpen = () => {
      ws.send(JSON.stringify({ type: "AUTH", token: authToken }));
    };

    const onMessage = (data) => {
      let msg;
      try {
        msg = JSON.parse(data.toString?.() ?? data);
      } catch {
        return;
      }

      if (msg.type === "INIT") {
        clearTimeout(initTimer);
        // Bootstrap world state from INIT
        const season = msg.config?.season ?? msg.season ?? {};
        state.worldSeed = season.worldSeed ?? msg.worldSeed ?? null;
        state.seasonId = season.seasonId ?? msg.seasonId ?? null;
        state.snapshotLabel = msg.snapshotLabel ?? msg.config?.snapshotLabel ?? null;
        if (msg.player) {
          state.playerId = msg.player.id ?? state.playerId;
          applyPlayerUpdate(msg.player);
        }
        if (Array.isArray(msg.initialState?.tiles)) {
          applyTileDelta(msg.initialState.tiles);
        }
        if (Array.isArray(msg.worldStatus?.availableDomainChoices)) {
          state.availableDomainChoices = msg.worldStatus.availableDomainChoices;
        }

        // Switch to the persistent message handler
        ws.removeEventListener?.("message", onMessage);
        ws.removeListener?.("message", onMessage);
        ws.on?.("message", handleMessage);
        ws.addEventListener?.("message", (ev) => handleMessage(ev.data ?? ev));

        resolve({ worldSeed: state.worldSeed, seasonId: state.seasonId, snapshotLabel: state.snapshotLabel });
        return;
      }
    };

    ws.addEventListener?.("open", onOpen);
    ws.addEventListener?.("message", onMessage);
    ws.on?.("open", onOpen);
    ws.on?.("message", onMessage);

    ws.addEventListener?.("error", (ev) => reject(new Error(ev.message ?? "WebSocket error")));
    ws.on?.("error", (err) => reject(err));
  });

let cmdCounter = 0;
const nextCommandId = (prefix) => `parity-${prefix}-${String(++cmdCounter).padStart(3, "0")}`;

/**
 * Sends a command message and waits for its terminal event.
 * Returns { commandId, message, terminalEvent } or throws on timeout.
 */
const sendAndWait = (cmdType, payload, description) => {
  const commandId = nextCommandId(cmdType.toLowerCase().replace(/_/g, "-"));
  const message = { type: cmdType, ...payload, commandId };

  return new Promise((resolve, reject) => {
    pendingCommandId = commandId;
    pendingResolve = resolve;
    pendingReject = reject;
    pendingTimer = setTimeout(() => {
      if (pendingCommandId === commandId) {
        pendingCommandId = null;
        pendingResolve = null;
        pendingReject = null;
        pendingTimer = null;
        reject(new Error(`Timeout waiting for terminal event after ${cmdType} (commandId=${commandId})`));
      }
    }, perCommandTimeoutMs);

    ws.send?.(JSON.stringify(message));
    // ws.send is available for both native WebSocket and ws package
    if (!ws.send) {
      clearTimeout(pendingTimer);
      reject(new Error("WebSocket not connected"));
    }
  }).then((terminalEvent) => ({
    commandId,
    message: { type: cmdType, ...payload },
    terminalEvent
  }));
};

// ---------------------------------------------------------------------------
// Playbook step helpers — each returns a recorded command entry or null
// ---------------------------------------------------------------------------

const makeEntry = (description, commandId, message, terminalEvent) => ({
  description,
  commandId,
  waitForEvent: terminalEvent.type,
  message,
  recordedTerminalEvent: terminalEvent.type,
  recordedOutcome: terminalEvent.type === "ERROR" ? terminalEvent.code ?? "ERROR" : "ok"
});

const tryStep = async (description, fn) => {
  try {
    const result = await fn();
    if (result) {
      console.log(`  ✓ ${description} → ${result.terminalEvent.type}` +
        (result.terminalEvent.code ? ` (${result.terminalEvent.code})` : ""));
      return makeEntry(description, result.commandId, result.message, result.terminalEvent);
    }
    console.log(`  – ${description} (skipped — precondition not met)`);
    return null;
  } catch (err) {
    console.log(`  ✗ ${description}: ${err.message}`);
    return null;
  }
};

// Individual command generators

const stepCollectVisible = async () =>
  sendAndWait("COLLECT_VISIBLE", {}, "collect-visible");

const stepCollectTile = async () => {
  const tile = tileWithResource();
  if (!tile) return null;
  return sendAndWait("COLLECT_TILE", { x: tile.x, y: tile.y }, "collect-tile");
};

const stepExpand = async () => {
  const candidates = frontierTiles();
  if (candidates.length === 0) return null;
  const { origin, target } = candidates[0];
  return sendAndWait("EXPAND", { fromX: origin.x, fromY: origin.y, toX: target.x, toY: target.y }, "expand");
};

const stepSettle = async () => {
  const candidates = unsettledTiles();
  if (candidates.length === 0) return null;
  const tile = candidates[0];
  return sendAndWait("SETTLE", { x: tile.x, y: tile.y }, "settle");
};

const stepAttack = async () => {
  const candidates = enemyAdjacentTiles();
  if (candidates.length === 0) return null;
  const { origin, target } = candidates[0];
  return sendAndWait("ATTACK", { fromX: origin.x, fromY: origin.y, toX: target.x, toY: target.y }, "attack");
};

const stepChooseTech = async () => {
  const choices = state.availableTechChoices;
  if (!choices || choices.length === 0) return null;
  // Pick the first available tech that we haven't already chosen
  const techId = choices.find((id) => !state.techIds.includes(id)) ?? choices[0];
  return sendAndWait("CHOOSE_TECH", { techId }, "choose-tech");
};

const stepChooseDomain = async () => {
  if (state.domainId) return null; // already have a domain
  const choices = state.availableDomainChoices;
  if (!choices || choices.length === 0) return null;
  return sendAndWait("CHOOSE_DOMAIN", { domainId: choices[0] }, "choose-domain");
};

const stepBuildFort = async () => {
  const candidates = settledTiles().filter((t) => !Array.isArray(t.structures) || !t.structures.some((s) => s.includes("FORT")));
  if (candidates.length === 0) return null;
  const tile = candidates[0];
  return sendAndWait("BUILD_FORT", { x: tile.x, y: tile.y }, "build-fort");
};

const stepCancelFortBuild = async () => {
  const tile = tileWithPendingBuild();
  if (!tile) return null;
  return sendAndWait("CANCEL_FORT_BUILD", { x: tile.x, y: tile.y }, "cancel-fort-build");
};

const stepBuildObservatory = async () => {
  const candidates = settledTiles().filter((t) => !Array.isArray(t.structures) || t.structures.length === 0);
  if (candidates.length === 0) return null;
  const tile = candidates[0];
  return sendAndWait("BUILD_OBSERVATORY", { x: tile.x, y: tile.y }, "build-observatory");
};

const stepCancelStructureBuild = async () => {
  const tile = tileWithPendingBuild();
  if (!tile) return null;
  return sendAndWait("CANCEL_STRUCTURE_BUILD", { x: tile.x, y: tile.y }, "cancel-structure-build");
};

const stepBuildEconomicStructure = async () => {
  const candidates = settledTiles().filter(
    (t) => t.resource && t.resource !== "NONE" &&
      (!Array.isArray(t.structures) || !t.structures.some((s) => s.includes("ECONOMIC")))
  );
  if (candidates.length === 0) return null;
  const tile = candidates[0];
  return sendAndWait("BUILD_ECONOMIC_STRUCTURE", { x: tile.x, y: tile.y }, "build-economic-structure");
};

const stepBuildSiegeOutpost = async () => {
  const candidates = settledTiles().filter((t) => !Array.isArray(t.structures) || t.structures.length === 0);
  if (candidates.length === 0) return null;
  const tile = candidates[0];
  return sendAndWait("BUILD_SIEGE_OUTPOST", { x: tile.x, y: tile.y }, "build-siege-outpost");
};

const stepCancelSiegeOutpostBuild = async () => {
  const tile = tileWithPendingBuild();
  if (!tile) return null;
  return sendAndWait("CANCEL_SIEGE_OUTPOST_BUILD", { x: tile.x, y: tile.y }, "cancel-siege-outpost-build");
};

const stepRemoveStructure = async () => {
  // Find a tile with a structure that can be removed (not a fort)
  const candidates = [...state.tilesByKey.values()].filter(
    (t) => t.ownerId === state.playerId &&
      Array.isArray(t.structures) &&
      t.structures.some((s) => s.includes("OBSERVATORY") || s.includes("ECONOMIC"))
  );
  if (candidates.length === 0) return null;
  const tile = candidates[0];
  const structureType = tile.structures.find((s) => s.includes("OBSERVATORY") || s.includes("ECONOMIC"));
  return sendAndWait("REMOVE_STRUCTURE", { x: tile.x, y: tile.y, structureType }, "remove-structure");
};

const stepRevealEmpire = async () => {
  const enemy = anyEnemyTile();
  if (!enemy?.ownerId) return null;
  return sendAndWait("REVEAL_EMPIRE", { playerId: enemy.ownerId }, "reveal-empire");
};

const stepRevealEmpireStats = async () => {
  const enemy = anyEnemyTile();
  if (!enemy?.ownerId) return null;
  return sendAndWait("REVEAL_EMPIRE_STATS", { playerId: enemy.ownerId }, "reveal-empire-stats");
};

const stepCollectShard = async () => {
  const tile = [...state.tilesByKey.values()].find(
    (t) => t.ownerId === state.playerId && t.hasShard
  );
  if (!tile) return null;
  return sendAndWait("COLLECT_SHARD", { x: tile.x, y: tile.y }, "collect-shard");
};

const stepSetConverterEnabled = async () => {
  const tile = tileWithStructure("CONVERTER") ?? tileWithStructure("ECONOMIC");
  if (!tile) return null;
  return sendAndWait("SET_CONVERTER_STRUCTURE_ENABLED", { x: tile.x, y: tile.y, enabled: false }, "set-converter-enabled");
};

const stepOverloadSynthesizer = async () => {
  const tile = tileWithStructure("SYNTHESIZER");
  if (!tile) return null;
  return sendAndWait("OVERLOAD_SYNTHESIZER", { x: tile.x, y: tile.y }, "overload-synthesizer");
};

const stepUncaptureTile = async () => {
  const candidates = ownedTiles().filter((t) => t.ownershipState === "CAPTURED");
  if (candidates.length === 0) return null;
  const tile = candidates[0];
  return sendAndWait("UNCAPTURE_TILE", { x: tile.x, y: tile.y }, "uncapture-tile");
};

const stepCancelCapture = async () => {
  const candidates = ownedTiles().filter((t) => t.captureInProgress);
  if (candidates.length === 0) return null;
  const tile = candidates[0];
  return sendAndWait("CANCEL_CAPTURE", { x: tile.x, y: tile.y }, "cancel-capture");
};

// Aether commands — require specific techs; attempt and record ERROR if unavailable
const stepCastAetherBridge = async () => {
  const candidates = settledTiles();
  if (candidates.length < 2) return null;
  const [from, to] = candidates;
  return sendAndWait("CAST_AETHER_BRIDGE", { fromX: from.x, fromY: from.y, toX: to.x, toY: to.y }, "cast-aether-bridge");
};

const stepCastAetherWall = async () => {
  const candidates = frontierTiles();
  if (candidates.length === 0) return null;
  const { target } = candidates[0];
  return sendAndWait("CAST_AETHER_WALL", { x: target.x, y: target.y }, "cast-aether-wall");
};

const stepSiphonTile = async () => {
  const enemy = anyEnemyTile();
  if (!enemy) return null;
  return sendAndWait("SIPHON_TILE", { x: enemy.x, y: enemy.y }, "siphon-tile");
};

const stepPurgeSiphon = async () => {
  const tile = [...state.tilesByKey.values()].find((t) => t.siphonActive);
  if (!tile) return null;
  return sendAndWait("PURGE_SIPHON", { x: tile.x, y: tile.y }, "purge-siphon");
};

const stepAirportBombard = async () => {
  const airport = tileWithStructure("AIRPORT");
  const enemy = anyEnemyTile();
  if (!airport || !enemy) return null;
  return sendAndWait("AIRPORT_BOMBARD", { fromX: airport.x, fromY: airport.y, toX: enemy.x, toY: enemy.y }, "airport-bombard");
};

const stepCreateMountain = async () => {
  // Attempt on an unclaimed tile — will ERROR unless admin access
  const candidates = [...state.tilesByKey.values()].filter((t) => !t.ownerId && t.terrain === "LAND");
  if (candidates.length === 0) return null;
  const tile = candidates[0];
  return sendAndWait("CREATE_MOUNTAIN", { x: tile.x, y: tile.y }, "create-mountain");
};

const stepRemoveMountain = async () => {
  const tile = [...state.tilesByKey.values()].find((t) => t.terrain === "MOUNTAIN");
  if (!tile) return null;
  return sendAndWait("REMOVE_MOUNTAIN", { x: tile.x, y: tile.y }, "remove-mountain");
};

const stepBreakthroughAttack = async () => {
  const outpost = tileWithStructure("SIEGE_OUTPOST");
  const candidates = enemyAdjacentTiles();
  if (!outpost || candidates.length === 0) return null;
  const { target } = candidates[0];
  return sendAndWait("BREAKTHROUGH_ATTACK", { fromX: outpost.x, fromY: outpost.y, toX: target.x, toY: target.y }, "breakthrough-attack");
};

// ---------------------------------------------------------------------------
// Playbook — ordered sequence of steps targeting all DurableCommandTypes
// ---------------------------------------------------------------------------

const buildPlaybook = () => [
  // Phase 0: Initial resource collection
  ["COLLECT_VISIBLE (initial)", stepCollectVisible],
  ["COLLECT_TILE (initial)", stepCollectTile],
  ["COLLECT_VISIBLE (2)", stepCollectVisible],

  // Phase 1: Expansion — drive frontier growth
  ["EXPAND (1)", stepExpand],
  ["EXPAND (2)", stepExpand],
  ["EXPAND (3)", stepExpand],
  ["EXPAND (4)", stepExpand],
  ["EXPAND (5)", stepExpand],

  // Phase 2: Settlement
  ["SETTLE (1)", stepSettle],
  ["SETTLE (2)", stepSettle],
  ["SETTLE (3)", stepSettle],

  // Phase 3: Technology and domain
  ["CHOOSE_DOMAIN", stepChooseDomain],
  ["CHOOSE_TECH (1)", stepChooseTech],
  ["CHOOSE_TECH (2)", stepChooseTech],

  // Phase 4: Buildings and cancellation
  ["BUILD_FORT (then immediately cancel)", stepBuildFort],
  ["CANCEL_FORT_BUILD", stepCancelFortBuild],
  ["BUILD_FORT (keep)", stepBuildFort],
  ["BUILD_OBSERVATORY (then cancel)", stepBuildObservatory],
  ["CANCEL_STRUCTURE_BUILD", stepCancelStructureBuild],
  ["BUILD_ECONOMIC_STRUCTURE", stepBuildEconomicStructure],
  ["BUILD_SIEGE_OUTPOST (then cancel)", stepBuildSiegeOutpost],
  ["CANCEL_SIEGE_OUTPOST_BUILD", stepCancelSiegeOutpostBuild],

  // Phase 5: Mid-game collection and combat
  ["COLLECT_VISIBLE (3)", stepCollectVisible],
  ["COLLECT_TILE (2)", stepCollectTile],
  ["COLLECT_SHARD (1)", stepCollectShard],
  ["ATTACK (1)", stepAttack],
  ["ATTACK (2)", stepAttack],
  ["ATTACK (3)", stepAttack],

  // Phase 6: More expansion
  ["EXPAND (6)", stepExpand],
  ["EXPAND (7)", stepExpand],
  ["EXPAND (8)", stepExpand],
  ["EXPAND (9)", stepExpand],
  ["EXPAND (10)", stepExpand],
  ["SETTLE (4)", stepSettle],
  ["SETTLE (5)", stepSettle],

  // Phase 7: Advanced tech
  ["CHOOSE_TECH (3)", stepChooseTech],
  ["CHOOSE_TECH (4)", stepChooseTech],

  // Phase 8: Info queries and rare commands
  ["REVEAL_EMPIRE", stepRevealEmpire],
  ["REVEAL_EMPIRE_STATS", stepRevealEmpireStats],
  ["UNCAPTURE_TILE", stepUncaptureTile],
  ["CANCEL_CAPTURE", stepCancelCapture],

  // Phase 9: Structure interaction
  ["SET_CONVERTER_STRUCTURE_ENABLED", stepSetConverterEnabled],
  ["OVERLOAD_SYNTHESIZER", stepOverloadSynthesizer],
  ["REMOVE_STRUCTURE", stepRemoveStructure],

  // Phase 10: Rare/gated commands (will ERROR if preconditions absent)
  ["BREAKTHROUGH_ATTACK", stepBreakthroughAttack],
  ["CAST_AETHER_BRIDGE", stepCastAetherBridge],
  ["CAST_AETHER_WALL", stepCastAetherWall],
  ["SIPHON_TILE", stepSiphonTile],
  ["PURGE_SIPHON", stepPurgeSiphon],
  ["AIRPORT_BOMBARD", stepAirportBombard],
  ["CREATE_MOUNTAIN", stepCreateMountain],
  ["REMOVE_MOUNTAIN", stepRemoveMountain],

  // Phase 11: Top-up to hit minCommands
  ["COLLECT_VISIBLE (4)", stepCollectVisible],
  ["EXPAND (11)", stepExpand],
  ["EXPAND (12)", stepExpand],
  ["EXPAND (13)", stepExpand],
  ["EXPAND (14)", stepExpand],
  ["EXPAND (15)", stepExpand],
  ["SETTLE (6)", stepSettle],
  ["COLLECT_TILE (3)", stepCollectTile],
  ["ATTACK (4)", stepAttack],
  ["ATTACK (5)", stepAttack],
  ["CHOOSE_TECH (5)", stepChooseTech],
  ["COLLECT_SHARD (2)", stepCollectShard],
  ["COLLECT_VISIBLE (5)", stepCollectVisible],
  ["EXPAND (16)", stepExpand],
  ["EXPAND (17)", stepExpand],
];

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

console.log(`Parity recorder starting`);
console.log(`  Target:  ${recordWsUrl}`);
console.log(`  Auth:    ${authToken}`);
console.log(`  Output:  ${outputFile}`);
console.log(`  Goal:    ≥${minCommands} commands`);
console.log(``);

let initInfo;
try {
  console.log(`Connecting...`);
  initInfo = await connect();
  console.log(`Connected — INIT received`);
  console.log(`  worldSeed:     ${state.worldSeed}`);
  console.log(`  seasonId:      ${state.seasonId}`);
  console.log(`  snapshotLabel: ${state.snapshotLabel}`);
  console.log(`  playerId:      ${state.playerId}`);
  console.log(`  ownedTiles:    ${ownedTiles().length}`);
  console.log(`  frontier:      ${frontierTiles().length}`);
  console.log(``);
} catch (err) {
  console.error(`✗ Connection failed: ${err.message}`);
  process.exit(1);
}

const recorded = [];
const playbook = buildPlaybook();

console.log(`Running playbook (${playbook.length} steps):`);
for (const [description, stepFn] of playbook) {
  const entry = await tryStep(description, stepFn);
  if (entry) {
    recorded.push(entry);
  }
  // Small delay between commands to avoid overwhelming the server
  await new Promise((r) => setTimeout(r, 150));
}

try {
  ws.close?.();
} catch {
  // Ignore close errors
}

console.log(``);
console.log(`Recording complete — ${recorded.length} commands captured`);

const coverageByType = {};
for (const entry of recorded) {
  coverageByType[entry.message.type] = (coverageByType[entry.message.type] ?? 0) + 1;
}
const typesHit = Object.keys(coverageByType).sort();
console.log(`Command types covered (${typesHit.length}):`);
for (const t of typesHit) {
  console.log(`  ${t}: ${coverageByType[t]}`);
}

const traceDoc = {
  description: `Parity trace recorded ${now.toISOString().slice(0, 10)}`,
  recordedAt: now.toISOString(),
  playerId: state.playerId,
  worldSeed: state.worldSeed,
  seasonId: state.seasonId,
  snapshotLabel: state.snapshotLabel,
  recordWsUrl,
  durationMinutes: null,
  typesHit,
  coverageByType,
  commandCount: recorded.length,
  commands: recorded.map(({ description, commandId, waitForEvent, message, recordedTerminalEvent, recordedOutcome }) => ({
    description,
    commandId,
    waitForEvent,
    recordedTerminalEvent,
    recordedOutcome,
    message
  }))
};

await mkdir(dirname(outputFile), { recursive: true });
await writeFile(outputFile, JSON.stringify(traceDoc, null, 2), "utf8");
console.log(`\nTrace written to: ${outputFile}`);

if (recorded.length < minCommands) {
  console.error(`\n⚠ Only ${recorded.length} commands recorded (target: ${minCommands})`);
  console.error(`  Check that the server has enough world state (owned tiles, frontier, etc.)`);
  console.error(`  You can re-run with RECORD_MIN_COMMANDS=1 to accept fewer commands.`);
  process.exit(1);
}

console.log(`\n✅ Trace ready — run the parity check with:`);
console.log(`   node scripts/rewrite-parity-replay.mjs ${outputFile}`);

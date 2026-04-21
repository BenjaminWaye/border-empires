#!/usr/bin/env node
/**
 * scripts/rewrite-parity-replay.mjs
 *
 * Parity harness: replays a recorded command trace against both the legacy
 * backend (wss://border-empires.fly.dev/ws) and the rewrite gateway, then
 * compares final world state snapshots.
 *
 * Usage:
 *   node scripts/rewrite-parity-replay.mjs [trace-file]
 *
 * Environment variables:
 *   LEGACY_WS_URL     WebSocket URL for the legacy monolith (default: wss://border-empires.fly.dev/ws)
 *   REWRITE_WS_URL    WebSocket URL for the rewrite gateway (default: ws://127.0.0.1:3101/ws)
 *   PARITY_TIMEOUT_MS Per-command wait timeout in ms (default: 15000)
 *   PARITY_AUTH_TOKEN Auth token to use (default: "__parity_harness_player__")
 *
 * Trace file format: docs/parity-traces/trace-stub-20260420.json
 *
 * Exit codes:
 *   0 = parity green (diffs empty)
 *   1 = parity red (diffs found) or connection/protocol error
 *   2 = usage error
 *
 * See §9.3 of docs/rewrite-completion-plan-2026-04-19.md for design context.
 */

import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
const legacyWsUrl = process.env.LEGACY_WS_URL ?? "wss://border-empires.fly.dev/ws";
const rewriteWsUrl = process.env.REWRITE_WS_URL ?? "ws://127.0.0.1:3101/ws";
const perCommandTimeoutMs = Math.max(5_000, Number(process.env.PARITY_TIMEOUT_MS ?? "15000"));
const authToken = process.env.PARITY_AUTH_TOKEN ?? "__parity_harness_player__";

const traceFile = process.argv[2] ?? resolve(root, "docs", "parity-traces", "trace-stub-20260420.json");

// ---------------------------------------------------------------------------
// Trace loading
// ---------------------------------------------------------------------------
let trace;
try {
  const raw = await readFile(traceFile, "utf8");
  trace = JSON.parse(raw);
} catch (err) {
  console.error(`ERROR: Could not load trace file: ${traceFile}`);
  console.error(err.message);
  process.exit(2);
}

if (!Array.isArray(trace.commands)) {
  console.error("ERROR: Trace file must have a top-level 'commands' array.");
  process.exit(2);
}

console.log(`Parity harness starting`);
console.log(`  Legacy:  ${legacyWsUrl}`);
console.log(`  Rewrite: ${rewriteWsUrl}`);
console.log(`  Trace:   ${traceFile} (${trace.commands.length} commands)`);
console.log(``);

// ---------------------------------------------------------------------------
// WebSocket helpers
// ---------------------------------------------------------------------------

/**
 * Creates a minimal WebSocket session that:
 * 1. Connects, sends AUTH
 * 2. Waits for INIT (world state)
 * 3. Replays commands from the trace, waits for terminal events
 * 4. Returns the final PlayerSubscriptionSnapshot + WorldStatusSnapshot
 */
const runSession = (wsUrl, label) =>
  new Promise(async (resolve, reject) => {
    // Use native WebSocket if available (Node 22+), otherwise ws package
    let WebSocket;
    try {
      WebSocket = globalThis.WebSocket ?? (await import("ws")).default;
    } catch {
      reject(new Error("WebSocket not available. Install ws: pnpm add -D ws"));
      return;
    }

    const ws = new WebSocket(wsUrl);
    const pendingByCommandId = new Map();
    let playerSnapshot = null;
    let worldStatus = null;
    let commandQueue = [...trace.commands];
    let running = false;
    let commandTimer = null;
    let currentCommandId = null;
    const receivedEvents = [];

    const fail = (reason) => {
      clearTimeout(commandTimer);
      ws.close();
      reject(new Error(`[${label}] ${reason}`));
    };

    const sendCommand = () => {
      if (commandQueue.length === 0) {
        // All commands processed — collect final state
        clearTimeout(commandTimer);
        ws.close();
        resolve({ playerSnapshot, worldStatus, receivedEvents });
        return;
      }

      const cmd = commandQueue.shift();
      currentCommandId = cmd.commandId ?? `parity-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const message = { ...cmd.message, commandId: currentCommandId };

      commandTimer = setTimeout(() => {
        fail(`Timeout waiting for terminal event after command ${message.type} (commandId=${currentCommandId})`);
      }, perCommandTimeoutMs);

      ws.send(JSON.stringify(message));
    };

    ws.addEventListener("open", () => {
      ws.send(JSON.stringify({ type: "AUTH", token: authToken }));
    });

    ws.addEventListener("error", (event) => {
      fail(`WebSocket error: ${event.message ?? "unknown"}`);
    });

    ws.addEventListener("close", (event) => {
      if (running) {
        // Closed unexpectedly mid-replay
        clearTimeout(commandTimer);
        reject(new Error(`[${label}] WebSocket closed unexpectedly (code=${event.code}, reason=${event.reason})`));
      }
    });

    ws.addEventListener("message", (event) => {
      let msg;
      try {
        msg = JSON.parse(event.data);
      } catch {
        return;
      }

      receivedEvents.push(msg);

      // Capture world state from INIT
      if (msg.type === "INIT") {
        playerSnapshot = msg.player ?? playerSnapshot;
        worldStatus = msg.worldStatus ?? worldStatus;
        if (msg.initialState?.tiles) {
          playerSnapshot = { ...(playerSnapshot ?? {}), tiles: msg.initialState.tiles };
        }
        // Start replaying commands after init
        if (!running) {
          running = true;
          sendCommand();
        }
        return;
      }

      // Update snapshots from deltas
      if (msg.type === "PLAYER_SUBSCRIPTION_SNAPSHOT" || msg.type === "PLAYER_UPDATE") {
        playerSnapshot = { ...(playerSnapshot ?? {}), ...msg };
        return;
      }
      if (msg.type === "WORLD_STATUS" || msg.type === "WORLD_STATUS_SNAPSHOT") {
        worldStatus = { ...(worldStatus ?? {}), ...msg };
        return;
      }
      if (msg.type === "TILE_DELTA_BATCH" && Array.isArray(msg.tiles)) {
        if (playerSnapshot) {
          const tileMap = new Map((playerSnapshot.tiles ?? []).map((t) => [`${t.x},${t.y}`, t]));
          for (const delta of msg.tiles) {
            const key = `${delta.x},${delta.y}`;
            tileMap.set(key, { ...(tileMap.get(key) ?? {}), ...delta });
          }
          playerSnapshot = { ...playerSnapshot, tiles: [...tileMap.values()] };
        }
      }

      // Terminal events: advance to next command
      const isTerminal =
        msg.commandId === currentCommandId &&
        (msg.type === "ACTION_ACCEPTED" ||
          msg.type === "COMBAT_RESULT" ||
          msg.type === "FRONTIER_RESULT" ||
          msg.type === "COLLECT_RESULT" ||
          msg.type === "TECH_UPDATE" ||
          msg.type === "DOMAIN_UPDATE" ||
          msg.type === "TILE_DELTA_BATCH" ||
          msg.type === "ERROR");

      if (isTerminal) {
        clearTimeout(commandTimer);
        // Small delay to allow subsequent delta events to arrive
        setTimeout(sendCommand, 100);
      }
    });
  });

// ---------------------------------------------------------------------------
// Snapshot diffing
// ---------------------------------------------------------------------------

/**
 * Extracts the parity-relevant fields from a player snapshot for comparison.
 * Sorts tiles by (x,y) so ordering doesn't affect the diff.
 */
const extractParityState = (playerSnapshot, worldStatus) => {
  const tiles = (playerSnapshot?.tiles ?? [])
    .map((t) => ({
      x: t.x,
      y: t.y,
      ownerId: t.ownerId ?? null,
      ownershipState: t.ownershipState ?? null,
      combatLockResolvesAt: t.combatLockResolvesAt ?? null
    }))
    .sort((a, b) => a.x - b.x || a.y - b.y);

  const player = playerSnapshot
    ? {
        gold: playerSnapshot.gold ?? null,
        manpower: playerSnapshot.manpower ?? null,
        tileCount: playerSnapshot.tileCount ?? null,
        techIds: [...(playerSnapshot.techIds ?? [])].sort(),
        domainId: playerSnapshot.domainId ?? null
      }
    : null;

  const world = worldStatus
    ? {
        seasonId: worldStatus.seasonId ?? null,
        worldSeed: worldStatus.worldSeed ?? null
      }
    : null;

  return { tiles, player, world };
};

/**
 * Deep-diffs two parity states. Returns an array of diff strings (empty = parity green).
 */
const diffParityStates = (legacy, rewrite) => {
  const diffs = [];

  // World identity
  if (legacy.world?.seasonId !== rewrite.world?.seasonId) {
    diffs.push(`world.seasonId: legacy=${legacy.world?.seasonId} rewrite=${rewrite.world?.seasonId}`);
  }

  // Player resource state
  for (const field of ["gold", "manpower", "tileCount", "domainId"]) {
    if (legacy.player?.[field] !== rewrite.player?.[field]) {
      diffs.push(`player.${field}: legacy=${legacy.player?.[field]} rewrite=${rewrite.player?.[field]}`);
    }
  }
  const legacyTechs = JSON.stringify(legacy.player?.techIds);
  const rewriteTechs = JSON.stringify(rewrite.player?.techIds);
  if (legacyTechs !== rewriteTechs) {
    diffs.push(`player.techIds: legacy=${legacyTechs} rewrite=${rewriteTechs}`);
  }

  // Tile ownership and combat locks
  const legacyTileMap = new Map(legacy.tiles.map((t) => [`${t.x},${t.y}`, t]));
  const rewriteTileMap = new Map(rewrite.tiles.map((t) => [`${t.x},${t.y}`, t]));
  const allKeys = new Set([...legacyTileMap.keys(), ...rewriteTileMap.keys()]);
  for (const key of allKeys) {
    const lt = legacyTileMap.get(key);
    const rt = rewriteTileMap.get(key);
    if (!lt && rt) {
      diffs.push(`tile[${key}]: missing in legacy, present in rewrite (ownerId=${rt.ownerId})`);
      continue;
    }
    if (lt && !rt) {
      diffs.push(`tile[${key}]: present in legacy (ownerId=${lt.ownerId}), missing in rewrite`);
      continue;
    }
    if (lt.ownerId !== rt.ownerId) {
      diffs.push(`tile[${key}].ownerId: legacy=${lt.ownerId} rewrite=${rt.ownerId}`);
    }
    if (lt.ownershipState !== rt.ownershipState) {
      diffs.push(`tile[${key}].ownershipState: legacy=${lt.ownershipState} rewrite=${rt.ownershipState}`);
    }
    // Combat lock tolerance: allow ±1000ms for clock skew
    const ltLock = lt.combatLockResolvesAt ?? 0;
    const rtLock = rt.combatLockResolvesAt ?? 0;
    if (Math.abs(ltLock - rtLock) > 1000) {
      diffs.push(`tile[${key}].combatLockResolvesAt: legacy=${ltLock} rewrite=${rtLock}`);
    }
  }

  return diffs;
};

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

let legacyResult, rewriteResult;

try {
  console.log(`Connecting to legacy (${legacyWsUrl})...`);
  legacyResult = await runSession(legacyWsUrl, "legacy");
  console.log(`✓ Legacy session complete (${legacyResult.receivedEvents.length} events)`);
} catch (err) {
  console.error(`✗ Legacy session failed: ${err.message}`);
  process.exit(1);
}

try {
  console.log(`Connecting to rewrite gateway (${rewriteWsUrl})...`);
  rewriteResult = await runSession(rewriteWsUrl, "rewrite");
  console.log(`✓ Rewrite session complete (${rewriteResult.receivedEvents.length} events)`);
} catch (err) {
  console.error(`✗ Rewrite session failed: ${err.message}`);
  process.exit(1);
}

const legacyState = extractParityState(legacyResult.playerSnapshot, legacyResult.worldStatus);
const rewriteState = extractParityState(rewriteResult.playerSnapshot, rewriteResult.worldStatus);

const diffs = diffParityStates(legacyState, rewriteState);

console.log(``);
if (diffs.length === 0) {
  console.log(`✅ PARITY GREEN — no differences found`);
  console.log(`   Legacy tiles:  ${legacyState.tiles.length}`);
  console.log(`   Rewrite tiles: ${rewriteState.tiles.length}`);
  process.exit(0);
} else {
  console.error(`❌ PARITY RED — ${diffs.length} difference(s) found:`);
  for (const diff of diffs) {
    console.error(`  - ${diff}`);
  }
  process.exit(1);
}

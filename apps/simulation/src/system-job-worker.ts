/**
 * System job worker thread.
 *
 * Handles barbarian maintenance, truce expiry, ability cooldown ticks,
 * and structure upkeep — all system-player-owned frontier commands.
 * Runs in a Worker so these jobs never block human command acceptance.
 *
 * Message protocol (main → worker):
 *   { type: "init"; worldView: PlannerWorldView }
 *   { type: "sync_players"; players: PlannerPlayerView[] }
 *   { type: "tile_deltas"; tileDeltas: SimulationTileDelta[] }
 *   { type: "plan"; playerId: string; clientSeq: number; issuedAt: number;
 *     sessionPrefix: "system-runtime" }
 *   { type: "pause" }
 *   { type: "resume" }
 *   { type: "shutdown" }
 *
 * Message protocol (worker → main):
 *   { type: "command"; playerId: string; command: CommandEnvelope | null }
 *   { type: "ready" }
 */

import { parentPort } from "node:worker_threads";
import {
  ATTACK_MANPOWER_MIN,
  FRONTIER_CLAIM_COST
,
  type Terrain
} from "@border-empires/shared";
import { buildDockLinksByDockTileKey, type DockRouteDefinition } from "./dock-network.js";
import { chooseNextOwnedFrontierCommandFromLookup } from "./frontier-command-planner.js";
import type { PlannerPlayerView, PlannerWorldView, PlannerTileView } from "./planner-world-view.js";
import type { CommandEnvelope } from "@border-empires/sim-protocol";

if (!parentPort) throw new Error("system-job-worker must run inside a Worker thread");

let paused = false;
const tilesByKey = new Map<string, PlannerTileView>();
let dockLinksByDockTileKey = new Map<string, readonly string[]>();
const playersById = new Map<string, PlannerPlayerView>();
const playerTileCacheById = new Map<string, {
  tileCollectionVersion: number;
  ownedTiles: PlannerTileView[];
}>();

const BARBARIAN_PLAYER_ID = "barbarian-1";
const BARBARIAN_TILE_COOLDOWN_MS = 15_000;
const barbarianCooldownByTileKey = new Map<string, number>();

type SimulationTileDelta = {
  x: number;
  y: number;
  terrain?: Terrain | undefined;
  resource?: string | undefined;
  dockId?: string | undefined;
  ownerId?: string | undefined;
  ownershipState?: string | undefined;
  townJson?: string | undefined;
};

const parseTownSupport = (
  townJson: string | undefined
): PlannerTileView["town"] | undefined => {
  if (typeof townJson !== "string") return undefined;
  try {
    const parsed = JSON.parse(townJson) as { supportMax?: unknown; supportCurrent?: unknown };
    return {
      ...(typeof parsed.supportMax === "number" ? { supportMax: parsed.supportMax } : {}),
      ...(typeof parsed.supportCurrent === "number" ? { supportCurrent: parsed.supportCurrent } : {})
    };
  } catch {
    return undefined;
  }
};

const applyTileDelta = (delta: SimulationTileDelta): void => {
  const key = `${delta.x},${delta.y}`;
  const existing = tilesByKey.get(key);
  const terrain = delta.terrain ?? existing?.terrain;
  if (!terrain) return;
  const next: PlannerTileView = existing ?? { x: delta.x, y: delta.y, terrain };

  if (delta.terrain) next.terrain = delta.terrain;
  if ("resource" in delta) {
    if (delta.resource) next.resource = delta.resource as PlannerTileView["resource"];
    else delete next.resource;
  }
  if ("dockId" in delta) {
    if (delta.dockId) next.dockId = delta.dockId;
    else delete next.dockId;
  }
  if ("ownerId" in delta) {
    if (delta.ownerId) next.ownerId = delta.ownerId;
    else delete next.ownerId;
  }
  if ("ownershipState" in delta) {
    if (delta.ownershipState) next.ownershipState = delta.ownershipState as PlannerTileView["ownershipState"];
    else delete next.ownershipState;
  }
  if ("townJson" in delta) {
    const town = parseTownSupport(delta.townJson);
    if (town) next.town = town;
    else delete next.town;
  }

  tilesByKey.set(key, next);
};

const resolveOwnedTiles = (player: PlannerPlayerView): PlannerTileView[] => {
  const cached = playerTileCacheById.get(player.id);
  if (cached && cached.tileCollectionVersion === player.tileCollectionVersion) {
    return cached.ownedTiles;
  }
  const ownedTiles = player.territoryTileKeys
    .map((k) => tilesByKey.get(k))
    .filter((t): t is PlannerTileView => t !== undefined);
  playerTileCacheById.set(player.id, {
    tileCollectionVersion: player.tileCollectionVersion,
    ownedTiles
  });
  return ownedTiles;
};

// ─── Planning logic ───────────────────────────────────────────────────────────

const tileHasNonBarbarianNeighbor = (tile: PlannerTileView): boolean => {
  const neighbors: ReadonlyArray<readonly [number, number]> = [
    [tile.x + 1, tile.y],
    [tile.x - 1, tile.y],
    [tile.x, tile.y + 1],
    [tile.x, tile.y - 1]
  ];
  for (const [nx, ny] of neighbors) {
    const neighbor = tilesByKey.get(`${nx},${ny}`);
    if (!neighbor) continue;
    if (neighbor.ownerId && neighbor.ownerId !== BARBARIAN_PLAYER_ID) return true;
  }
  return false;
};

const chooseBarbarianCommand = (
  player: PlannerPlayerView,
  clientSeq: number,
  issuedAt: number
): CommandEnvelope | null => {
  const ownedTiles = resolveOwnedTiles(player);
  if (ownedTiles.length === 0) return null;

  const now = Date.now();
  const eligibleTiles: PlannerTileView[] = [];
  for (const tile of ownedTiles) {
    const tileKey = `${tile.x},${tile.y}`;
    const cooldownUntil = barbarianCooldownByTileKey.get(tileKey);
    if (cooldownUntil !== undefined && cooldownUntil > now) continue;
    if (!tileHasNonBarbarianNeighbor(tile)) continue;
    eligibleTiles.push(tile);
  }
  if (eligibleTiles.length === 0) return null;

  const command = chooseNextOwnedFrontierCommandFromLookup(
    tilesByKey,
    eligibleTiles,
    player.id,
    clientSeq,
    issuedAt,
    "system-runtime",
    { canAttack: true, canExpand: true, dockLinksByDockTileKey }
  ) ?? null;

  if (command) {
    try {
      const payload = JSON.parse(command.payloadJson) as { fromX?: unknown; fromY?: unknown };
      if (typeof payload.fromX === "number" && typeof payload.fromY === "number") {
        barbarianCooldownByTileKey.set(`${payload.fromX},${payload.fromY}`, now + BARBARIAN_TILE_COOLDOWN_MS);
      }
    } catch {
      // ignore — cooldown best-effort
    }
  }
  return command;
};

const chooseSystemCommand = (
  playerId: string,
  clientSeq: number,
  issuedAt: number
): CommandEnvelope | null => {
  const player = playersById.get(playerId);
  if (!player) return null;
  if (player.hasActiveLock) return null;

  if (playerId === BARBARIAN_PLAYER_ID) {
    return chooseBarbarianCommand(player, clientSeq, issuedAt);
  }

  const ownedTiles = resolveOwnedTiles(player);

  const canAttack = player.points >= FRONTIER_CLAIM_COST && player.manpower >= ATTACK_MANPOWER_MIN;
  const canExpand = player.points >= FRONTIER_CLAIM_COST;

  if (!canAttack && !canExpand) return null;

  return chooseNextOwnedFrontierCommandFromLookup(
    tilesByKey,
    ownedTiles,
    playerId,
    clientSeq,
    issuedAt,
    "system-runtime",
    { canAttack, canExpand, dockLinksByDockTileKey }
  ) ?? null;
};

// ─── Message handler ──────────────────────────────────────────────────────────

parentPort.on("message", (msg: unknown) => {
  if (!msg || typeof msg !== "object") return;
  const message = msg as Record<string, unknown>;

  switch (message.type) {
    case "pause":
      paused = true;
      break;

    case "resume":
      paused = false;
      break;

    case "shutdown":
      process.exit(0);
      break;

    case "plan": {
      if (paused) {
        parentPort!.postMessage({ type: "command", playerId: message.playerId, command: null });
        break;
      }
      try {
        const command = chooseSystemCommand(
          message.playerId as string,
          message.clientSeq as number,
          message.issuedAt as number
        );
        parentPort!.postMessage({ type: "command", playerId: message.playerId, command });
      } catch (err) {
        parentPort!.postMessage({
          type: "error",
          playerId: message.playerId,
          message: err instanceof Error ? err.message : String(err)
        });
      }
      break;
    }

    case "init": {
      const worldView = message.worldView as PlannerWorldView;
      tilesByKey.clear();
      playersById.clear();
      playerTileCacheById.clear();
      for (const tile of worldView.tiles) {
        tilesByKey.set(`${tile.x},${tile.y}`, tile);
      }
      dockLinksByDockTileKey = buildDockLinksByDockTileKey((worldView.docks ?? []) as DockRouteDefinition[]);
      for (const player of worldView.players) {
        playersById.set(player.id, player);
      }
      break;
    }

    case "sync_players": {
      const players = (message.players as PlannerPlayerView[]) ?? [];
      for (const player of players) {
        const cached = playerTileCacheById.get(player.id);
        if (cached && cached.tileCollectionVersion !== player.tileCollectionVersion) {
          playerTileCacheById.delete(player.id);
        }
        playersById.set(player.id, player);
      }
      break;
    }

    case "tile_deltas": {
      const tileDeltas = (message.tileDeltas as SimulationTileDelta[]) ?? [];
      for (const tileDelta of tileDeltas) {
        applyTileDelta(tileDelta);
      }
      break;
    }
  }
});

parentPort.postMessage({ type: "ready" });

const METRICS_INTERVAL_MS = 5_000;
setInterval(() => {
  parentPort!.postMessage({ type: "metrics", memoryUsage: process.memoryUsage() });
}, METRICS_INTERVAL_MS).unref();

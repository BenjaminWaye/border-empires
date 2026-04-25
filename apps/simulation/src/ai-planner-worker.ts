/**
 * AI planner worker thread.
 *
 * Runs inside a Node.js Worker so that planning computation never blocks the
 * main simulation event loop. The worker keeps planner state in-memory and is
 * updated incrementally via player/tile deltas.
 *
 * Message protocol (main → worker):
 *   { type: "init"; worldView: PlannerWorldView }
 *   { type: "sync_players"; players: PlannerPlayerView[] }
 *   { type: "tile_deltas"; tileDeltas: SimulationTileDelta[] }
 *   { type: "plan"; playerId: string; clientSeq: number; issuedAt: number;
 *     sessionPrefix: "ai-runtime" }
 *   { type: "pause" }
 *   { type: "resume" }
 *   { type: "shutdown" }
 *
 * Message protocol (worker → main):
 *   { type: "command"; playerId: string; command: CommandEnvelope | null;
 *     diagnostic?: AutomationPlannerDiagnostic }
 *   { type: "ready" }
 */

import { parentPort } from "node:worker_threads";
import {
  createAutomationNoopDiagnostic,
  planAutomationCommand
} from "./automation-command-planner.js";
import type { AutomationPlannerDiagnostic } from "./automation-command-planner.js";
import { buildDockLinksByDockTileKey, type DockRouteDefinition } from "./dock-network.js";
import type { PlannerPlayerView, PlannerWorldView, PlannerTileView } from "./planner-world-view.js";
import type { CommandEnvelope } from "@border-empires/sim-protocol";

if (!parentPort) throw new Error("ai-planner-worker must run inside a Worker thread");

let paused = false;
const tilesByKey = new Map<string, PlannerTileView>();
let dockLinksByDockTileKey = new Map<string, readonly string[]>();
const playersById = new Map<string, PlannerPlayerView>();
const playerTileCacheById = new Map<string, {
  tileCollectionVersion: number;
  ownedTiles: PlannerTileView[];
  frontierTiles: PlannerTileView[];
  pendingSettlementTileKeys: Set<string>;
}>();

type SimulationTileDelta = {
  x: number;
  y: number;
  terrain?: "LAND" | "SEA" | "MOUNTAIN" | undefined;
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
    if (delta.resource) next.resource = delta.resource;
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
    if (delta.ownershipState) next.ownershipState = delta.ownershipState;
    else delete next.ownershipState;
  }
  if ("townJson" in delta) {
    const town = parseTownSupport(delta.townJson);
    if (town) next.town = town;
    else delete next.town;
  }

  tilesByKey.set(key, next);
};

const resolvePlayerTiles = (
  player: PlannerPlayerView
): {
  ownedTiles: PlannerTileView[];
  frontierTiles: PlannerTileView[];
  pendingSettlementTileKeys: Set<string>;
} => {
  const cached = playerTileCacheById.get(player.id);
  if (cached && cached.tileCollectionVersion === player.tileCollectionVersion) {
    return {
      ownedTiles: cached.ownedTiles,
      frontierTiles: cached.frontierTiles,
      pendingSettlementTileKeys: cached.pendingSettlementTileKeys
    };
  }

  const ownedTiles = player.territoryTileKeys
    .map((k) => tilesByKey.get(k))
    .filter((t): t is PlannerTileView => t !== undefined);
  const frontierTiles = player.frontierTileKeys
    .map((k) => tilesByKey.get(k))
    .filter((t): t is PlannerTileView => t !== undefined);
  const pendingSettlementTileKeys = new Set(player.pendingSettlementTileKeys);

  playerTileCacheById.set(player.id, {
    tileCollectionVersion: player.tileCollectionVersion,
    ownedTiles,
    frontierTiles,
    pendingSettlementTileKeys
  });
  return { ownedTiles, frontierTiles, pendingSettlementTileKeys };
};

// ─── Planning logic ───────────────────────────────────────────────────────────

const choosePlannerCommand = (
  playerId: string,
  clientSeq: number,
  issuedAt: number
): { command: CommandEnvelope | null; diagnostic: AutomationPlannerDiagnostic } => {
  const player = playersById.get(playerId);
  if (!player) {
    return {
      command: null,
      diagnostic: createAutomationNoopDiagnostic(playerId, "ai-runtime", "player_missing")
    };
  }
  const { frontierTiles, ownedTiles, pendingSettlementTileKeys } = resolvePlayerTiles(player);
  const plan = planAutomationCommand({
    playerId,
    points: player.points,
    manpower: player.manpower,
    hasActiveLock: player.hasActiveLock,
    activeDevelopmentProcessCount: player.activeDevelopmentProcessCount,
    frontierTiles,
    ownedTiles,
    tilesByKey,
    dockLinksByDockTileKey,
    isPendingSettlement: (tile) => pendingSettlementTileKeys.has(`${tile.x},${tile.y}`),
    clientSeq,
    issuedAt,
    sessionPrefix: "ai-runtime"
  });
  return {
    command: plan.command ?? null,
    diagnostic: plan.diagnostic
  };
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
        const plan = choosePlannerCommand(
          message.playerId as string,
          message.clientSeq as number,
          message.issuedAt as number
        );
        parentPort!.postMessage({ type: "command", playerId: message.playerId, command: plan.command, diagnostic: plan.diagnostic });
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

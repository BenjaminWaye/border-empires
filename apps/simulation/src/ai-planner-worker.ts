/**
 * AI planner worker thread.
 *
 * Runs inside a Node.js Worker so that planning computation never blocks the
 * main simulation event loop. The worker is stateless across ticks: each
 * "plan" message carries a scoped PlannerWorldView tile slice for the player
 * being planned and the worker responds with the chosen CommandEnvelope (or
 * null if no command is needed).
 *
 * Message protocol (main → worker):
 *   { type: "plan"; playerId: string; clientSeq: number; issuedAt: number;
 *     sessionPrefix: "ai-runtime"; worldView: PlannerWorldView }
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
  DEVELOPMENT_PROCESS_LIMIT,
  FRONTIER_CLAIM_COST,
  SETTLE_COST
} from "@border-empires/shared";
import { chooseNextOwnedFrontierCommandFromLookup } from "./frontier-command-planner.js";
import { chooseBestStrategicSettlementTile } from "./ai-settlement-priority.js";
import type { PlannerWorldView, PlannerTileView } from "./planner-world-view.js";
import type { CommandEnvelope } from "@border-empires/sim-protocol";

if (!parentPort) throw new Error("ai-planner-worker must run inside a Worker thread");

let paused = false;

// ─── Planning logic ───────────────────────────────────────────────────────────

const choosePlannerCommand = (
  playerId: string,
  clientSeq: number,
  issuedAt: number,
  worldView: PlannerWorldView
): CommandEnvelope | null => {
  const player = worldView.players.find((p) => p.id === playerId);
  if (!player) return null;
  if (player.hasActiveLock) return null;

  // Rebuild tile lookup (cheap — object references, no deep copy)
  const tilesByKey = new Map<string, PlannerTileView>(
    worldView.tiles.map((t) => [`${t.x},${t.y}`, t])
  );

  // Cast to the shape expected by existing pure functions.
  // PlannerTileView is structurally compatible with what frontier-command-planner
  // and ai-settlement-priority read (they only access: x, y, terrain, ownerId,
  // ownershipState, resource, dockId, town.supportMax/Current).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tilesAsGame = tilesByKey as unknown as any;

  // Settlement check (mirror of SimulationRuntime.chooseNextAutomationCommand)
  const canSettle =
    player.activeDevelopmentProcessCount < DEVELOPMENT_PROCESS_LIMIT &&
    player.points >= SETTLE_COST;

  if (canSettle) {
    const pendingSettlementTileKeys = new Set(player.pendingSettlementTileKeys);
    const frontierTiles = player.frontierTileKeys
      .map((k) => tilesByKey.get(k))
      .filter((t): t is PlannerTileView => t !== undefined);
    const best = chooseBestStrategicSettlementTile(
      playerId,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      frontierTiles as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      tilesAsGame as any,
      (tile) => pendingSettlementTileKeys.has(`${tile.x},${tile.y}`)
    );
    if (best) {
      return {
        commandId: `ai-runtime-${playerId}-${clientSeq}-${issuedAt}`,
        sessionId: `ai-runtime:${playerId}`,
        playerId,
        clientSeq,
        issuedAt,
        type: "SETTLE",
        payloadJson: JSON.stringify({ x: best.x, y: best.y })
      };
    }
  }

  // Frontier command (attack / expand)
  const ownedTiles = player.territoryTileKeys
    .map((k) => tilesByKey.get(k))
    .filter((t): t is PlannerTileView => t !== undefined);

  const canAttack = player.points >= FRONTIER_CLAIM_COST && player.manpower >= ATTACK_MANPOWER_MIN;
  const canExpand = player.points >= FRONTIER_CLAIM_COST;

  if (!canAttack && !canExpand) return null;

  return chooseNextOwnedFrontierCommandFromLookup(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    tilesByKey as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ownedTiles as any,
    playerId,
    clientSeq,
    issuedAt,
    "ai-runtime",
    { canAttack, canExpand }
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
        const command = choosePlannerCommand(
          message.playerId as string,
          message.clientSeq as number,
          message.issuedAt as number,
          message.worldView as PlannerWorldView
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
  }
});

parentPort.postMessage({ type: "ready" });

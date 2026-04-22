/**
 * System job worker thread.
 *
 * Handles barbarian maintenance, truce expiry, ability cooldown ticks,
 * and structure upkeep — all system-player-owned frontier commands.
 * Runs in a Worker so these jobs never block human command acceptance.
 *
 * Message protocol (main → worker):
 *   { type: "plan"; playerId: string; clientSeq: number; issuedAt: number;
 *     sessionPrefix: "system-runtime"; worldView: PlannerWorldView }
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
} from "@border-empires/shared";
import { chooseNextOwnedFrontierCommandFromLookup } from "./frontier-command-planner.js";
import type { PlannerWorldView, PlannerTileView } from "./planner-world-view.js";
import type { CommandEnvelope } from "@border-empires/sim-protocol";

if (!parentPort) throw new Error("system-job-worker must run inside a Worker thread");

let paused = false;

// ─── Planning logic ───────────────────────────────────────────────────────────

const chooseSystemCommand = (
  playerId: string,
  clientSeq: number,
  issuedAt: number,
  worldView: PlannerWorldView
): CommandEnvelope | null => {
  const player = worldView.players.find((p) => p.id === playerId);
  if (!player) return null;
  if (player.hasActiveLock) return null;

  const tilesByKey = new Map<string, PlannerTileView>(
    worldView.tiles.map((t) => [`${t.x},${t.y}`, t])
  );

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
    "system-runtime",
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
        const command = chooseSystemCommand(
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

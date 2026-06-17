import type { CommandEnvelope, SimulationEvent } from "@border-empires/sim-protocol";
import type { DomainTileState, FrontierCommandType } from "@border-empires/game-domain";
import {
  MUSTER_SYSTEM_ENABLED,
  MUSTER_BASE_RATE_PER_MIN,
  MUSTER_DEPOT_SPEED_MULT,
  MUSTER_STALE_MS,
  OUTPOST_DEPOT_RADIUS
} from "@border-empires/shared";
import { coordsInChebyshevRadius, sweepAttackCandidates } from "../territory-automation/territory-automation.js";
import { simulationTileKey } from "../seed-state/seed-state.js";
import type { RuntimePlayer, SimulationTileWireDelta } from "../runtime-types.js";

export type MusterTickInput = {
  nowMs: number;
  players: ReadonlyMap<string, RuntimePlayer>;
  tiles: ReadonlyMap<string, DomainTileState>;
  musterTilesByOwner: ReadonlyMap<string, Set<string>>;
  activeSiegeOutpostsByOwner: ReadonlyMap<string, Set<string>>;
  activeLightOutpostsByOwner: ReadonlyMap<string, Set<string>>;
  applyManpowerRegen: (player: RuntimePlayer, nowMs: number) => void;
  playerManpowerCap: (player: RuntimePlayer) => number;
  replaceTileState: (tileKey: string, tile: DomainTileState, commandId?: string) => void;
  emitEvent: (event: SimulationEvent) => void;
  tileDeltaFromState: (tile: DomainTileState) => SimulationTileWireDelta;
  // ADVANCE auto-fire wiring.
  requiredMusterForTarget: (target: DomainTileState) => number;
  nextTerritoryAutomationCommandId: (label: string, playerId: string, tileKey: string, nowMs: number) => string;
  handleFrontierCommand: (command: CommandEnvelope, actionType: FrontierCommandType) => boolean;
  locksByTile: ReadonlyMap<string, unknown>;
};

/**
 * Accumulation tick for the mustering system. The player's manpower regen rate
 * is split evenly across all active flags (depot bonus applied per tile).
 * Each tile is capped at the player's manpower cap (playerManpowerCap).
 *
 * Stale musters (set more than MUSTER_STALE_MS ago) are auto-cleared with a
 * full manpower refund so the pool doesn't stay permanently locked.
 *
 * No-op when the muster system is disabled.
 */
export const tickMuster = (input: MusterTickInput): void => {
  if (!MUSTER_SYSTEM_ENABLED) return;

  for (const [playerId, musterKeys] of input.musterTilesByOwner) {
    if (musterKeys.size === 0) continue;
    const player = input.players.get(playerId);
    if (!player) continue;

    input.applyManpowerRegen(player, input.nowMs);

    const outpostKeys = outpostTileKeysForPlayer(input, playerId);

    // Count non-stale flags so throughput is split evenly across them.
    let activeMusterCount = 0;
    for (const tileKey of musterKeys) {
      const tile = input.tiles.get(tileKey);
      if (!tile?.muster || tile.muster.ownerId !== playerId) continue;
      if (tile.muster.setAt != null && input.nowMs - tile.muster.setAt > MUSTER_STALE_MS) continue;
      activeMusterCount++;
    }
    if (activeMusterCount === 0) continue;

    const batchCommandId = `muster-tick:${playerId}:${input.nowMs}`;
    const batchDeltas: ReturnType<MusterTickInput["tileDeltaFromState"]>[] = [];

    for (const tileKey of musterKeys) {
      const tile = input.tiles.get(tileKey);
      if (!tile?.muster || tile.muster.ownerId !== playerId) continue;

      // Auto-clear stale musters and refund the manpower to the pool.
      if (tile.muster.setAt != null && input.nowMs - tile.muster.setAt > MUSTER_STALE_MS) {
        player.manpower = Math.min(
          input.playerManpowerCap(player),
          player.manpower + tile.muster.amount
        );
        const clearedTile: DomainTileState = { ...tile, muster: undefined };
        input.replaceTileState(tileKey, clearedTile);
        batchDeltas.push({ ...input.tileDeltaFromState(clearedTile), musterJson: "" });
        continue;
      }

      const elapsedMin = Math.max(0, (input.nowMs - tile.muster.updatedAt) / 60_000);
      const depotMult = isInsideDepotZone(tile, outpostKeys) ? MUSTER_DEPOT_SPEED_MULT : 1;
      const headroom = Math.max(0, input.playerManpowerCap(player) - tile.muster.amount);
      const inflow = Math.min(
        (MUSTER_BASE_RATE_PER_MIN / activeMusterCount) * depotMult * elapsedMin,
        headroom,
        player.manpower
      );

      let currentTile = tile;
      if (inflow > 0.0001) {
        player.manpower -= inflow;
        currentTile = {
          ...tile,
          muster: {
            ...tile.muster,
            amount: tile.muster.amount + inflow,
            updatedAt: input.nowMs
          }
        };
        input.replaceTileState(tileKey, currentTile);
        batchDeltas.push(input.tileDeltaFromState(currentTile));
      } else if (elapsedMin > 0) {
        // Stamp updatedAt so elapsed time doesn't accumulate while pool is empty.
        currentTile = {
          ...tile,
          muster: { ...tile.muster, updatedAt: input.nowMs }
        };
        input.replaceTileState(tileKey, currentTile);
      }

      // ADVANCE auto-fire runs regardless of inflow so a full flag still strikes.
      if (currentTile.muster?.mode === "ADVANCE") {
        maybeAdvanceFire(input, currentTile, playerId);
      }
    }

    if (batchDeltas.length > 0) {
      input.emitEvent({
        eventType: "TILE_DELTA_BATCH",
        commandId: batchCommandId,
        playerId,
        playerManpower: player.manpower,
        tileDeltas: batchDeltas
      });
    }
  }
};

/**
 * ADVANCE auto-fire: if the muster tile can afford an adjacent enemy target,
 * launch an ATTACK from the muster tile itself. The actual muster spend happens
 * at combat resolution (consumeOriginMuster); the origin lock created by the
 * attack prevents this flag from firing again until that resolves.
 */
const maybeAdvanceFire = (input: MusterTickInput, musterTile: DomainTileState, playerId: string): void => {
  const musterAmount = musterTile.muster?.amount ?? 0;
  const originKey = simulationTileKey(musterTile.x, musterTile.y);
  // Don't stack a second strike while the origin is locked in combat.
  if (input.locksByTile.has(originKey)) return;

  const candidates = sweepAttackCandidates(musterTile, playerId, 1, (x, y) =>
    input.tiles.get(simulationTileKey(x, y))
  );
  for (const target of candidates) {
    if (musterAmount < input.requiredMusterForTarget(target)) continue;
    const commandId = input.nextTerritoryAutomationCommandId(
      "muster-advance",
      playerId,
      simulationTileKey(target.x, target.y),
      input.nowMs
    );
    const accepted = input.handleFrontierCommand(
      {
        commandId,
        sessionId: `system-runtime:territory-automation:${playerId}`,
        playerId,
        clientSeq: 0,
        issuedAt: input.nowMs,
        type: "ATTACK",
        payloadJson: JSON.stringify({ fromX: musterTile.x, fromY: musterTile.y, toX: target.x, toY: target.y })
      },
      "ATTACK"
    );
    if (accepted) return;
  }
};

const outpostTileKeysForPlayer = (input: MusterTickInput, playerId: string): Set<string> => {
  const keys = new Set<string>();
  const siege = input.activeSiegeOutpostsByOwner.get(playerId);
  if (siege) for (const key of siege) keys.add(key);
  const light = input.activeLightOutpostsByOwner.get(playerId);
  if (light) for (const key of light) keys.add(key);
  return keys;
};

const isInsideDepotZone = (tile: DomainTileState, outpostKeys: Set<string>): boolean => {
  if (outpostKeys.size === 0) return false;
  if (outpostKeys.has(simulationTileKey(tile.x, tile.y))) return true;
  for (const { x, y } of coordsInChebyshevRadius(tile.x, tile.y, OUTPOST_DEPOT_RADIUS)) {
    if (outpostKeys.has(simulationTileKey(x, y))) return true;
  }
  return false;
};

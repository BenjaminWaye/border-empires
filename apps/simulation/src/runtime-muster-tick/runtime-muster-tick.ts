import type { CommandEnvelope, SimulationEvent } from "@border-empires/sim-protocol";
import type { DomainTileState, FrontierCommandType } from "@border-empires/game-domain";
import {
  MUSTER_SYSTEM_ENABLED,
  MUSTER_BASE_RATE_PER_MIN,
  MUSTER_DEPOT_SPEED_MULT,
  MUSTER_STALE_MS,
  OUTPOST_DEPOT_RADIUS
} from "@border-empires/shared";
import { chebyshevDistanceSimple, coordsInChebyshevRadius, sweepAttackCandidates } from "../territory-automation/territory-automation.js";
import { simulationTileKey } from "../seed-state/seed-state.js";
import type { RuntimePlayer, SimulationTileWireDelta } from "../runtime-types.js";

// Distance threshold beyond which ADVANCE search slows to a reduced cadence.
const ADVANCE_THROTTLE_DIST = 15;
// How long to wait before re-searching when the front is far away (ms).
const ADVANCE_FAR_COOLDOWN_MS = 3_000;
// How long to wait before re-searching when nothing attackable was found at all (ms).
const ADVANCE_EMPTY_COOLDOWN_MS = 10_000;

export type MusterAdvanceCooldowns = Map<string, number>; // musterTileKey -> nextSearchAt (ms)

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
  // Per-flag cooldown state (mutated in place, lives on the Runtime instance).
  advanceCooldowns: MusterAdvanceCooldowns;
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
 * ADVANCE auto-fire: expands outward from the muster tile (doubling radius each
 * pass) until it finds an enemy tile that the player already borders, then fires
 * from the closest owned adjacent tile. No hard radius cap — players learn the
 * tradeoff by placing flags far from their front.
 *
 * Cooldown (stored in advanceCooldowns, lives on the Runtime):
 *   - Enemy found within ADVANCE_THROTTLE_DIST tiles → fire every tick
 *   - Enemy found beyond that → ADVANCE_FAR_COOLDOWN_MS between searches
 *   - Nothing attackable found at all → ADVANCE_EMPTY_COOLDOWN_MS cooldown
 */
const maybeAdvanceFire = (input: MusterTickInput, musterTile: DomainTileState, playerId: string): void => {
  const musterAmount = musterTile.muster?.amount ?? 0;
  const originKey = simulationTileKey(musterTile.x, musterTile.y);

  // Respect per-flag cooldown.
  const cooldownUntil = input.advanceCooldowns.get(originKey) ?? 0;
  if (input.nowMs < cooldownUntil) return;

  const getTile = (x: number, y: number): DomainTileState | undefined =>
    input.tiles.get(simulationTileKey(x, y));

  // Expanding radius search — starts at 1 tile, doubles each pass.
  // sweepAttackCandidates returns enemy tiles within the radius sorted nearest-first,
  // so the first attackable hit is always the closest enemy.
  let bestFrom: DomainTileState | undefined;
  let nearestEnemy: DomainTileState | undefined;
  let searchRadius = 1;

  outer: while (true) {
    const candidates = sweepAttackCandidates(musterTile, playerId, searchRadius, getTile);
    for (const candidate of candidates) {
      if (musterAmount < input.requiredMusterForTarget(candidate)) continue;
      // Find the owned tile adjacent to this enemy closest to the muster flag.
      for (const { x, y } of coordsInChebyshevRadius(candidate.x, candidate.y, 1)) {
        const neighbor = getTile(x, y);
        if (!neighbor || neighbor.ownerId !== playerId || neighbor.terrain !== "LAND") continue;
        if (input.locksByTile.has(simulationTileKey(x, y))) continue;
        const fromDist = chebyshevDistanceSimple(musterTile.x, musterTile.y, x, y);
        if (!bestFrom || fromDist < chebyshevDistanceSimple(musterTile.x, musterTile.y, bestFrom.x, bestFrom.y)) {
          bestFrom = neighbor;
          nearestEnemy = candidate;
        }
      }
      if (nearestEnemy) break outer;
    }
    // No attackable target at this radius. Double and try again.
    // sweepAttackCandidates re-scans inner tiles too — acceptable because the
    // cooldown means this loop rarely runs more than once or twice per flag per tick.
    if (searchRadius >= 225) break; // practical bound: half the world width
    searchRadius = Math.min(searchRadius * 2, 225);
  }

  if (!nearestEnemy || !bestFrom) {
    input.advanceCooldowns.set(originKey, input.nowMs + ADVANCE_EMPTY_COOLDOWN_MS);
    return;
  }

  const enemyDist = chebyshevDistanceSimple(musterTile.x, musterTile.y, nearestEnemy.x, nearestEnemy.y);
  if (enemyDist > ADVANCE_THROTTLE_DIST) {
    input.advanceCooldowns.set(originKey, input.nowMs + ADVANCE_FAR_COOLDOWN_MS);
  } else {
    input.advanceCooldowns.delete(originKey); // next tick
  }

  const commandId = input.nextTerritoryAutomationCommandId(
    "muster-advance",
    playerId,
    simulationTileKey(nearestEnemy.x, nearestEnemy.y),
    input.nowMs
  );
  input.handleFrontierCommand(
    {
      commandId,
      sessionId: `system-runtime:territory-automation:${playerId}`,
      playerId,
      clientSeq: 0,
      issuedAt: input.nowMs,
      type: "ATTACK",
      payloadJson: JSON.stringify({ fromX: bestFrom.x, fromY: bestFrom.y, toX: nearestEnemy.x, toY: nearestEnemy.y })
    },
    "ATTACK"
  );
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

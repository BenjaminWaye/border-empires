import type { CommandEnvelope, SimulationEvent } from "@border-empires/sim-protocol";
import type { DomainTileState, FrontierCommandType } from "@border-empires/game-domain";
import {
  MUSTER_SYSTEM_ENABLED,
  MUSTER_BASE_RATE_PER_MIN,
  MUSTER_DEPOT_SPEED_MULT,
  MUSTER_STALE_MS,
  OUTPOST_DEPOT_RADIUS,
  RAIL_DEPOT_MUSTER_RADIUS
} from "@border-empires/shared";
import { chebyshevDistanceSimple, coordsInChebyshevRadius } from "../territory-automation/territory-automation.js";
import { simulationTileKey } from "../seed-state/seed-state.js";
import type { RuntimePlayer, SimulationTileWireDelta } from "../runtime-types.js";

// Distance threshold beyond which ADVANCE search slows to a reduced cadence.
const ADVANCE_THROTTLE_DIST = 15;
// How long to wait before re-searching when the front is far away (ms).
const ADVANCE_FAR_COOLDOWN_MS = 3_000;
// How long to wait before re-searching when nothing attackable was found at all (ms).
const ADVANCE_EMPTY_COOLDOWN_MS = 10_000;

export type MusterAdvanceCooldowns = Map<string, number>; // musterTileKey -> nextSearchAt (ms)

type Position = { x: number; y: number };

export type MusterTickInput = {
  nowMs: number;
  players: ReadonlyMap<string, RuntimePlayer>;
  tiles: ReadonlyMap<string, DomainTileState>;
  musterTilesByOwner: ReadonlyMap<string, Set<string>>;
  activeSiegeOutpostsByOwner: ReadonlyMap<string, Set<string>>;
  activeLightOutpostsByOwner: ReadonlyMap<string, Set<string>>;
  railDepotPositionsByOwner: ReadonlyMap<string, ReadonlyArray<Position>>;
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
    const depotPositions = input.railDepotPositionsByOwner.get(playerId) ?? [];

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
      const depotMult = musterSpeedMultiplier(tile, outpostKeys, depotPositions);
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
 * Returns the muster speed multiplier for a tile:
 *   - 2.0 if an outpost is within OUTPOST_DEPOT_RADIUS and backed by a Rail Depot
 *   - 1.25 if an outpost is within OUTPOST_DEPOT_RADIUS but no depot nearby
 *   - 1.0 if no outpost is nearby
 *
 * The depot check is O(outposts × depots), both typically < 10.
 */
const musterSpeedMultiplier = (
  tile: DomainTileState,
  outpostKeys: Set<string>,
  depotPositions: ReadonlyArray<Position>
): number => {
  if (outpostKeys.size === 0) return 1;
  // Check if any outpost is within OUTPOST_DEPOT_RADIUS of this tile.
  let hasNearbyOutpost = false;
  if (outpostKeys.has(simulationTileKey(tile.x, tile.y))) {
    hasNearbyOutpost = true;
  } else {
    for (const { x, y } of coordsInChebyshevRadius(tile.x, tile.y, OUTPOST_DEPOT_RADIUS)) {
      if (outpostKeys.has(simulationTileKey(x, y))) {
        hasNearbyOutpost = true;
        break;
      }
    }
  }
  if (!hasNearbyOutpost) return 1;

  // Outpost found — check if any depot boosts it.
  if (depotPositions.length === 0) return MUSTER_DEPOT_SPEED_MULT;

  // Find the nearest outpost to the tile, then check if it's near a depot.
  // We already know an outpost is nearby — now find which one and check depot proximity.
  const nearestOutpost = findNearestOutpost(tile, outpostKeys);
  if (!nearestOutpost) return MUSTER_DEPOT_SPEED_MULT;

  for (const depot of depotPositions) {
    if (chebyshevDistanceSimple(nearestOutpost.x, nearestOutpost.y, depot.x, depot.y) <= RAIL_DEPOT_MUSTER_RADIUS) {
      return 2.0; // depot-backed outpost: full boost
    }
  }
  return MUSTER_DEPOT_SPEED_MULT;
};

/** Find the nearest active outpost tile to the given tile. */
const findNearestOutpost = (tile: DomainTileState, outpostKeys: Set<string>): Position | undefined => {
  // Check the tile itself first.
  if (outpostKeys.has(simulationTileKey(tile.x, tile.y))) return { x: tile.x, y: tile.y };
  // Scan outward from radius 1 to OUTPOST_DEPOT_RADIUS.
  for (let r = 1; r <= OUTPOST_DEPOT_RADIUS; r++) {
    for (const { x, y } of coordsInChebyshevRadius(tile.x, tile.y, r)) {
      // Only check the perimeter (distance === r) for efficiency.
      if (chebyshevDistanceSimple(tile.x, tile.y, x, y) === r && outpostKeys.has(simulationTileKey(x, y))) {
        return { x, y };
      }
    }
  }
  return undefined;
};

/**
 * ADVANCE auto-fire: BFS through connected owned tiles from the muster tile until
 * it finds an owned tile with an adjacent attackable enemy, then fires from there.
 * BFS guarantees the firing tile is reachable via a chain of owned tiles, preventing
 * attacks sourced from isolated territory pockets disconnected from the muster flag.
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

  // No manpower staged yet — skip the BFS entirely and back off.
  if (musterAmount <= 0) {
    input.advanceCooldowns.set(originKey, input.nowMs + ADVANCE_EMPTY_COOLDOWN_MS);
    return;
  }

  const getTile = (x: number, y: number): DomainTileState | undefined =>
    input.tiles.get(simulationTileKey(x, y));

  // BFS through connected owned tiles. Visiting in graph-distance order means the
  // first attackable enemy found is adjacent to the closest connected owned tile.
  // Uses a head pointer instead of shift() to keep dequeue O(1).
  const visited = new Set<string>([originKey]);
  const queue: DomainTileState[] = [musterTile];
  let head = 0;
  let bestFrom: DomainTileState | undefined;
  let nearestEnemy: DomainTileState | undefined;

  outer: while (head < queue.length) {
    const current = queue[head++]!;
    const currentKey = simulationTileKey(current.x, current.y);

    for (const { x, y } of coordsInChebyshevRadius(current.x, current.y, 1)) {
      const neighbor = getTile(x, y);
      if (!neighbor || neighbor.terrain !== "LAND") continue;
      const nKey = simulationTileKey(x, y);

      if (neighbor.ownerId === playerId) {
        if (!visited.has(nKey)) {
          visited.add(nKey);
          queue.push(neighbor);
        }
      } else if (
        neighbor.ownerId &&
        (neighbor.ownershipState === "FRONTIER" || neighbor.ownershipState === "SETTLED" || neighbor.ownershipState === "BARBARIAN") &&
        musterAmount >= input.requiredMusterForTarget(neighbor) &&
        !input.locksByTile.has(currentKey)
      ) {
        bestFrom = current;
        nearestEnemy = neighbor;
        break outer;
      }
    }
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
      payloadJson: JSON.stringify({ fromX: bestFrom.x, fromY: bestFrom.y, toX: nearestEnemy.x, toY: nearestEnemy.y, musterSourceX: musterTile.x, musterSourceY: musterTile.y })
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

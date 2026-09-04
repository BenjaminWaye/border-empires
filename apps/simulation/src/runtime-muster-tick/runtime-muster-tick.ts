import type { CommandEnvelope, SimulationEvent } from "@border-empires/sim-protocol";
import type { DomainTileState, FrontierCommandType } from "@border-empires/game-domain";
import type { FrontierCommandResult } from "../runtime-frontier-command.js";
import {
  MUSTER_BASE_RATE_PER_MIN,
  MUSTER_DEPOT_SPEED_MULT,
  MUSTER_STALE_MS,
  musterFlagCap,
  OUTPOST_DEPOT_RADIUS,
  RAIL_DEPOT_BOOSTED_MUSTER_MULT,
  RAIL_DEPOT_MUSTER_RADIUS
} from "@border-empires/shared";
import { chebyshevDistanceSimple, coordsInChebyshevRadius } from "../territory-automation/territory-automation.js";
import { simulationTileKey } from "../seed-state/seed-state.js";
import type { LockRecord, RuntimePlayer, SimulationTileWireDelta } from "../runtime-types.js";
import {
  ADVANCE_EMPTY_COOLDOWN_MS,
  ADVANCE_FAR_COOLDOWN_MS,
  ADVANCE_MAX_RANGE_TILES,
  ADVANCE_THROTTLE_DIST,
  lockSourcedFromMusterTile,
  syncMusterStatus,
  type MusterAdvanceCooldowns
} from "./muster-auto-fire-shared.js";
import { maybeMarchFire } from "./runtime-muster-march.js";

export type { MusterAdvanceCooldowns } from "./muster-auto-fire-shared.js";

type Position = { x: number; y: number };

export type MusterTickInput = {
  nowMs: number;
  players: ReadonlyMap<string, RuntimePlayer>;
  tiles: ReadonlyMap<string, DomainTileState>;
  musterTilesByOwner: ReadonlyMap<string, Set<string>>;
  activeSiegeOutpostsByOwner: ReadonlyMap<string, Set<string>>;
  activeRelayBeaconsByOwner: ReadonlyMap<string, Set<string>>;
  railDepotPositionsByOwner: ReadonlyMap<string, ReadonlyArray<Position>>;
  applyManpowerRegen: (player: RuntimePlayer, nowMs: number) => void;
  playerManpowerCap: (player: RuntimePlayer) => number;
  replaceTileState: (tileKey: string, tile: DomainTileState, commandId?: string) => void;
  emitEvent: (event: SimulationEvent) => void;
  tileDeltaFromState: (tile: DomainTileState) => SimulationTileWireDelta;
  // ADVANCE auto-fire wiring.
  requiredMusterForTarget: (target: DomainTileState) => number;
  nextTerritoryAutomationCommandId: (label: string, playerId: string, tileKey: string, nowMs: number) => string;
  handleFrontierCommand: (command: CommandEnvelope, actionType: FrontierCommandType) => FrontierCommandResult;
  // Active combat locks (keyed by origin/target tile) so ADVANCE can skip tiles
  // already committed to a fight and enforce one attack in flight per flag via
  // LockRecord.musterSourceKey.
  locksByTile: ReadonlyMap<string, LockRecord>;
  // Per-flag cooldown state (mutated in place, lives on the Runtime instance).
  advanceCooldowns: MusterAdvanceCooldowns;
  // Dock crossings (owned dock tile -> linked dock tile keys) so ADVANCE's BFS
  // can reach across water the same way manual ATTACK/EXPAND commands do.
  dockLinksByDockTileKey: ReadonlyMap<string, readonly string[]>;
  // §5.4: a dormant Siege/Relay Beacon doesn't grant the muster
  // depot-speed/Rail-Depot-boost bonus.
  isStructureDormant: (playerId: string, tileKey: string, field: "siegeOutpost" | "economicStructure") => boolean;
};

export type MusterTickContext = Omit<MusterTickInput, "nowMs" | "musterTilesByOwner">;

/**
 * Builds the two tick entry points Runtime calls (`tickMuster` every server
 * tick, `tickWatchedMusterTiles` on demand for actively-viewed flags) so the
 * orchestration — and the watched-tile filtering — lives next to the muster
 * logic itself instead of inline on the Runtime class.
 *
 * `buildContext` and the tile-map getters are passed in as closures (rather
 * than a plain snapshot) because several fields (e.g. rail depot positions)
 * must be recomputed fresh from current Runtime state on every call.
 */
export const createMusterTickRunner = (
  buildContext: (musterTilesByOwner: ReadonlyMap<string, Set<string>>) => MusterTickContext,
  getMusterTilesByOwner: () => ReadonlyMap<string, Set<string>>,
  getWatchedMusterTileByPlayer: () => ReadonlyMap<string, string>
): { tickMuster: (nowMs: number) => void; tickWatchedMusterTiles: (nowMs: number) => void } => ({
  tickMuster: (nowMs: number): void => {
    const musterTilesByOwner = getMusterTilesByOwner();
    tickMuster({ nowMs, musterTilesByOwner, ...buildContext(musterTilesByOwner) });
  },
  tickWatchedMusterTiles: (nowMs: number): void => {
    const watched = getWatchedMusterTileByPlayer();
    if (watched.size === 0) return;
    // Build a filtered view of musterTilesByOwner containing only watched players.
    // Passing all of each player's muster tiles preserves the throughput-split
    // calculation (activeMusterCount) across their flags.
    const allMusterTilesByOwner = getMusterTilesByOwner();
    const filteredMusterTiles = new Map<string, Set<string>>();
    for (const [playerId, tileKey] of watched) {
      const playerTiles = allMusterTilesByOwner.get(playerId);
      if (!playerTiles?.has(tileKey)) continue;
      filteredMusterTiles.set(playerId, playerTiles);
    }
    if (filteredMusterTiles.size === 0) return;
    tickMuster({ nowMs, musterTilesByOwner: filteredMusterTiles, ...buildContext(filteredMusterTiles) });
  }
});

/**
 * Accumulation tick for the mustering system. The player's manpower regen rate
 * is split evenly across all active flags (depot bonus applied per tile).
 * Each flag starts capped at musterFlagCap's default share of the player's
 * manpower cap (10%, capped at MUSTER_FLAG_BASE_CAP_CEILING) so a single flag
 * can never lock up the whole pool by default — raising it takes a
 * deliberate, costed "Expand Capacity" press (UPGRADE_MUSTER_CAP command,
 * +another 10% share per press, tracked as capLevel on the tile), the same
 * way training more units costs more resources rather than units just
 * accumulating on their own.
 *
 * Stale musters (set more than MUSTER_STALE_MS ago) are auto-cleared with a
 * full manpower refund so the pool doesn't stay permanently locked.
 *
 */
export const tickMuster = (input: MusterTickInput): void => {
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
      const wonderMusterRateMult = player.wonderMusterRateMultiplier ?? 1;
      // A flag's cap defaults to a fraction of the player's manpower cap
      // (musterFlagCap) and only grows further through paid "Expand
      // Capacity" presses (capLevel), never on its own — musterFlagCap
      // itself clamps to the manpower cap so an upgraded flag can't demand
      // more than the pool could ever hold.
      const flagCap = musterFlagCap(input.playerManpowerCap(player), tile.muster.capLevel);
      const headroom = Math.max(0, flagCap - tile.muster.amount);
      const inflow = Math.min(
        (MUSTER_BASE_RATE_PER_MIN / activeMusterCount) * depotMult * wonderMusterRateMult * elapsedMin,
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

      // ADVANCE/MARCH auto-fire runs regardless of inflow so a full flag still strikes.
      if (currentTile.muster?.mode === "ADVANCE") {
        maybeAdvanceFire(input, currentTile, playerId);
      } else if (currentTile.muster?.mode === "MARCH") {
        maybeMarchFire(input, currentTile, playerId);
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
 *   - RAIL_DEPOT_BOOSTED_MUSTER_MULT if an outpost within OUTPOST_DEPOT_RADIUS
 *     is itself within RAIL_DEPOT_MUSTER_RADIUS of a Rail Depot
 *   - MUSTER_DEPOT_SPEED_MULT if an outpost is within OUTPOST_DEPOT_RADIUS but
 *     none of the nearby outposts are depot-backed
 *   - 1.0 if no outpost is nearby
 *
 * Checks every outpost within range (not just the closest one) because the
 * closest outpost to this tile isn't necessarily the one nearest a depot.
 */
const musterSpeedMultiplier = (
  tile: DomainTileState,
  outpostKeys: Set<string>,
  depotPositions: ReadonlyArray<Position>
): number => {
  if (outpostKeys.size === 0) return 1;

  const nearbyOutposts = outpostsWithinRadius(tile, outpostKeys);
  if (nearbyOutposts.length === 0) return 1;
  if (depotPositions.length === 0) return MUSTER_DEPOT_SPEED_MULT;

  for (const outpost of nearbyOutposts) {
    for (const depot of depotPositions) {
      if (chebyshevDistanceSimple(outpost.x, outpost.y, depot.x, depot.y) <= RAIL_DEPOT_MUSTER_RADIUS) {
        return RAIL_DEPOT_BOOSTED_MUSTER_MULT;
      }
    }
  }
  return MUSTER_DEPOT_SPEED_MULT;
};

/** All active outpost tiles within OUTPOST_DEPOT_RADIUS of the given tile. */
const outpostsWithinRadius = (tile: DomainTileState, outpostKeys: Set<string>): Position[] => {
  const found: Position[] = [];
  if (outpostKeys.has(simulationTileKey(tile.x, tile.y))) found.push({ x: tile.x, y: tile.y });
  for (const { x, y } of coordsInChebyshevRadius(tile.x, tile.y, OUTPOST_DEPOT_RADIUS)) {
    if (outpostKeys.has(simulationTileKey(x, y))) found.push({ x, y });
  }
  return found;
};

/**
 * ADVANCE auto-fire: BFS through connected owned tiles from the muster tile,
 * collecting every attackable enemy tile reachable that way, then fires at
 * whichever one is genuinely nearest instead of stopping at the first hit —
 * BFS visiting order tracks hop count from the flag, and two candidates found
 * at the same hop depth can still sit at very different real distances once
 * the frontier bends around locked/contested tiles, so ties are broken by
 * Chebyshev distance to the flag. BFS guarantees the firing tile is reachable
 * via a chain of owned tiles, preventing attacks sourced from isolated
 * territory pockets disconnected from the muster flag.
 *
 * "Nearest" and the range cap are both measured in BFS hops, not raw
 * Chebyshev distance — a dock link is one hop regardless of how far apart the
 * paired docks sit on the map, so a legitimate cross-water ADVANCE flag isn't
 * penalized for the distance the dock crossing collapses. If the nearest
 * candidate found is beyond ADVANCE_MAX_RANGE_TILES hops — which happens once
 * every nearby front is locked by sibling flags or other combat — the flag
 * idles rather than striking across the map at whatever unlocked tile it
 * could still reach.
 *
 * Cooldown (stored in advanceCooldowns, lives on the Runtime):
 *   - Flag already has an attack in flight → wait until that lock resolves
 *   - Enemy found within ADVANCE_THROTTLE_DIST hops → fire every tick
 *   - Enemy found beyond that (but within ADVANCE_MAX_RANGE_TILES) → ADVANCE_FAR_COOLDOWN_MS
 *   - Nothing attackable within range → ADVANCE_EMPTY_COOLDOWN_MS cooldown
 */
const maybeAdvanceFire = (input: MusterTickInput, musterTile: DomainTileState, playerId: string): void => {
  const musterAmount = musterTile.muster?.amount ?? 0;
  const originKey = simulationTileKey(musterTile.x, musterTile.y);

  // One attack at a time per flag: while this flag already has an attack in
  // flight (an active lock funded from this muster tile), don't launch another
  // — back off until that lock resolves, then re-search. This also guarantees
  // the flag's full muster amount is available when the affordability gate
  // below runs, so no underfunded ATTACK is ever submitted.
  const inFlightLock = lockSourcedFromMusterTile(input.locksByTile, originKey);
  if (inFlightLock) {
    const resolvesAt = Math.max(inFlightLock.resolvesAt, input.nowMs);
    input.advanceCooldowns.set(originKey, resolvesAt);
    syncMusterStatus(input, musterTile, originKey, playerId, input.nowMs, {
      inFlight: true,
      nextActionAt: resolvesAt,
      fightX: inFlightLock.targetX,
      fightY: inFlightLock.targetY
    });
    return;
  }

  // Respect per-flag cooldown.
  const cooldownUntil = input.advanceCooldowns.get(originKey) ?? 0;
  if (input.nowMs < cooldownUntil) {
    syncMusterStatus(input, musterTile, originKey, playerId, input.nowMs, { inFlight: false, nextActionAt: cooldownUntil });
    return;
  }

  // No manpower staged yet — skip the BFS entirely and back off.
  if (musterAmount <= 0) {
    const nextActionAt = input.nowMs + ADVANCE_EMPTY_COOLDOWN_MS;
    input.advanceCooldowns.set(originKey, nextActionAt);
    syncMusterStatus(input, musterTile, originKey, playerId, input.nowMs, { inFlight: false, nextActionAt });
    return;
  }

  const getTile = (x: number, y: number): DomainTileState | undefined =>
    input.tiles.get(simulationTileKey(x, y));

  // BFS through connected owned tiles, collecting every attackable enemy tile
  // found along the way instead of stopping at the first one. Tracks each
  // owned tile's hop depth from the flag (a dock link is one hop regardless
  // of the real distance it crosses) so both the range cap and the
  // nearest-candidate tie-break are dock-fair; Chebyshev distance only breaks
  // ties between candidates found at the same hop depth.
  // Uses a head pointer instead of shift() to keep dequeue O(1).
  const visited = new Set<string>([originKey]);
  const depthByKey = new Map<string, number>([[originKey, 0]]);
  const queue: DomainTileState[] = [musterTile];
  let head = 0;
  let best: { from: DomainTileState; enemy: DomainTileState; hops: number; dist: number } | undefined;

  while (head < queue.length) {
    const current = queue[head++]!;
    const currentKey = simulationTileKey(current.x, current.y);
    const currentDepth = depthByKey.get(currentKey)!;

    const dockLinkedKeys = input.dockLinksByDockTileKey.get(currentKey) ?? [];
    const neighborCoords = [
      ...coordsInChebyshevRadius(current.x, current.y, 1),
      ...dockLinkedKeys.map((key) => {
        const [nx, ny] = key.split(",").map(Number);
        return { x: nx!, y: ny! };
      })
    ];

    for (const { x, y } of neighborCoords) {
      const neighbor = getTile(x, y);
      if (!neighbor || neighbor.terrain !== "LAND") continue;
      const nKey = simulationTileKey(x, y);

      if (neighbor.ownerId === playerId) {
        if (!visited.has(nKey)) {
          visited.add(nKey);
          depthByKey.set(nKey, currentDepth + 1);
          queue.push(neighbor);
        }
      } else if (
        neighbor.ownerId &&
        (neighbor.ownershipState === "FRONTIER" || neighbor.ownershipState === "SETTLED" || neighbor.ownershipState === "BARBARIAN") &&
        musterAmount >= input.requiredMusterForTarget(neighbor) &&
        !input.locksByTile.has(currentKey) &&
        !input.locksByTile.has(nKey)
      ) {
        const hops = currentDepth + 1;
        const dist = chebyshevDistanceSimple(musterTile.x, musterTile.y, neighbor.x, neighbor.y);
        if (!best || hops < best.hops || (hops === best.hops && dist < best.dist)) {
          best = { from: current, enemy: neighbor, hops, dist };
        }
      }
    }
  }

  // Nothing attackable at all, or the nearest candidate is beyond the hard
  // range cap (every closer front locked/contested) — idle rather than
  // striking whatever unlocked tile happens to be reachable, however far.
  if (!best || best.hops > ADVANCE_MAX_RANGE_TILES) {
    const nextActionAt = input.nowMs + ADVANCE_EMPTY_COOLDOWN_MS;
    input.advanceCooldowns.set(originKey, nextActionAt);
    syncMusterStatus(input, musterTile, originKey, playerId, input.nowMs, { inFlight: false, nextActionAt });
    return;
  }

  const bestFrom = best.from;
  const nearestEnemy = best.enemy;

  if (best.hops > ADVANCE_THROTTLE_DIST) {
    input.advanceCooldowns.set(originKey, input.nowMs + ADVANCE_FAR_COOLDOWN_MS);
  } else {
    input.advanceCooldowns.delete(originKey); // next tick
  }
  // The attack fires unconditionally below — mark in-flight now rather than
  // waiting for the lock to show up next tick, so the client doesn't flash
  // back to a stale "planning next move" state for one tick in between.
  syncMusterStatus(input, musterTile, originKey, playerId, input.nowMs, {
    inFlight: true,
    nextActionAt: undefined,
    fightX: nearestEnemy.x,
    fightY: nearestEnemy.y
  });

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
  if (siege) {
    for (const key of siege) {
      if (!input.isStructureDormant(playerId, key, "siegeOutpost")) keys.add(key);
    }
  }
  const light = input.activeRelayBeaconsByOwner.get(playerId);
  if (light) {
    for (const key of light) {
      if (!input.isStructureDormant(playerId, key, "economicStructure")) keys.add(key);
    }
  }
  return keys;
};

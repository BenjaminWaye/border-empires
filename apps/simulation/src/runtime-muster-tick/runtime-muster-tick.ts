import type { CommandEnvelope, SimulationEvent } from "@border-empires/sim-protocol";
import type { DomainTileState, FrontierCommandType } from "@border-empires/game-domain";
import type { FrontierCommandResult } from "../runtime-frontier-command.js";
import { MUSTER_BASE_RATE_PER_MIN, MUSTER_MAX_CONCURRENT_ACTIONS, MUSTER_STALE_MS, musterFlagCap } from "@border-empires/shared";
import { simulationTileKey } from "../seed-state/seed-state.js";
import type { LockRecord, RuntimePlayer, SimulationTileWireDelta } from "../runtime-types.js";
import {
  ADVANCE_EMPTY_COOLDOWN_MS,
  ADVANCE_FAR_COOLDOWN_MS,
  ADVANCE_MAX_RANGE_TILES,
  ADVANCE_THROTTLE_DIST,
  locksSourcedFromMusterTile,
  pickAdvanceTarget,
  syncMusterStatus,
  type MusterAdvanceCooldowns
} from "./muster-auto-fire-shared.js";
import { maybeMarchFire } from "./runtime-muster-march.js";
import { scanAdvanceCandidates } from "./muster-advance-scan.js";
import { musterSpeedMultiplier, outpostTileKeysForPlayer, type Position } from "./muster-depot-speed.js";
import { musterPoolFloorFor } from "../ai-build-manpower-floor.js";
import { creditManpower } from "../runtime-manpower-ceiling.js";

export type { MusterAdvanceCooldowns } from "./muster-auto-fire-shared.js";
export type { Position } from "./muster-depot-speed.js";

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
  // Active aether bridge crossings for a given player (bridge endpoint tile
  // key -> linked endpoint tile keys), so ADVANCE/MARCH's BFS can cross a
  // connected aether bridge the same way manual ATTACK/EXPAND commands do,
  // instead of only ever walking plain adjacency through owned territory.
  aetherBridgeNeighborKeysForPlayer: (playerId: string) => ReadonlyMap<string, readonly string[]>;
  // §5.4: a dormant Siege/Relay Beacon doesn't grant the muster
  // depot-speed/Rail-Depot-boost bonus.
  isStructureDormant: (playerId: string, tileKey: string, field: "siegeOutpost" | "economicStructure") => boolean;
  // MARCH's neutral-tile expansion fallback (runtime-muster-march.ts) only
  // considers a candidate tile inside the player's own reach — EXPAND is not
  // reach-gated server-side, but letting auto-fire claim ground outside reach
  // would grow territory faster than a player manually could, so the
  // automation path holds itself to a tighter bar than the command it issues.
  isInReach: (playerId: string, x: number, y: number) => boolean;
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
): {
  tickMuster: (nowMs: number) => void;
  tickWatchedMusterTiles: (nowMs: number) => void;
  tickMusterForPlayer: (playerId: string, nowMs: number) => void;
} => ({
  tickMuster: (nowMs: number): void => {
    const musterTilesByOwner = getMusterTilesByOwner();
    tickMuster({ nowMs, musterTilesByOwner, ...buildContext(musterTilesByOwner) });
  },
  // Re-ticks one player's own muster flags on demand, right after a command
  // mutates one of them (e.g. SET_MUSTER) — so the command's own tile delta
  // already carries a correct amount/ratePerMin instead of the player
  // waiting up to 30s for the next tickMuster sweep to stamp one. Passes the
  // player's *entire* flag set (not just the one just touched), same as
  // tickWatchedMusterTiles, so activeMusterCount's throughput split is
  // recomputed correctly across all of that player's flags, not just one.
  tickMusterForPlayer: (playerId: string, nowMs: number): void => {
    const allMusterTilesByOwner = getMusterTilesByOwner();
    const playerTiles = allMusterTilesByOwner.get(playerId);
    if (!playerTiles || playerTiles.size === 0) return;
    const filteredMusterTiles = new Map<string, Set<string>>([[playerId, playerTiles]]);
    tickMuster({ nowMs, musterTilesByOwner: filteredMusterTiles, ...buildContext(filteredMusterTiles) });
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
 * manpower cap (the larger of 10% and MUSTER_FLAG_BASE_CAP_FLOOR) so a single flag
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

    const musterPoolFloor = musterPoolFloorFor(player);
    const batchCommandId = `muster-tick:${playerId}:${input.nowMs}`;
    const batchDeltas: ReturnType<MusterTickInput["tileDeltaFromState"]>[] = [];

    for (const tileKey of musterKeys) {
      const tile = input.tiles.get(tileKey);
      if (!tile?.muster || tile.muster.ownerId !== playerId) continue;

      // Auto-clear stale musters and refund the manpower to the pool.
      if (tile.muster.setAt != null && input.nowMs - tile.muster.setAt > MUSTER_STALE_MS) {
        creditManpower(player, tile.muster.amount, input.playerManpowerCap(player));
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
      const rawRatePerMin = (MUSTER_BASE_RATE_PER_MIN / activeMusterCount) * depotMult * wonderMusterRateMult;
      // AI flags may only draw pool manpower above the build floor (see
      // ai-build-manpower-floor.ts); ratePerMin above stays the nominal rate so
      // the client's interpolation is unaffected.
      const drawable = Math.max(0, player.manpower - musterPoolFloor);
      const inflow = Math.min(rawRatePerMin * elapsedMin, headroom, drawable);
      // Quantized to ~3 decimals so the client's local-clock interpolation
      // has a stable, near-jitter-free rate to extrapolate against, and so
      // an unstable float doesn't defeat an equality guard and cause
      // unbounded re-emission (the exact failure mode behind outage 8d4f9e6).
      const ratePerMin = Math.round(rawRatePerMin * 1000) / 1000;

      let currentTile = tile;
      if (inflow > 0.0001) {
        player.manpower -= inflow;
        currentTile = {
          ...tile,
          muster: {
            ...tile.muster,
            amount: tile.muster.amount + inflow,
            updatedAt: input.nowMs,
            ratePerMin
          }
        };
        input.replaceTileState(tileKey, currentTile);
        batchDeltas.push(input.tileDeltaFromState(currentTile));
      } else if (tile.muster.ratePerMin !== ratePerMin) {
        // The rate itself changed (a brand-new flag has no ratePerMin yet,
        // or a sibling flag joined/left and shifted this one's throughput
        // share) even though there's no inflow to apply right now — the
        // client still needs this delta to know the new rate, so (unlike
        // the silent elapsedMin-only branch below) this one emits. This is
        // what lets tickMusterForPlayer (called right after SET_MUSTER)
        // give a brand-new flag a correct ratePerMin on its very first
        // sample instead of waiting for the next periodic sweep.
        currentTile = {
          ...tile,
          muster: { ...tile.muster, updatedAt: input.nowMs, ratePerMin }
        };
        input.replaceTileState(tileKey, currentTile);
        batchDeltas.push(input.tileDeltaFromState(currentTile));
      } else if (elapsedMin > 0) {
        // Rate is unchanged and there's no inflow (pool empty) -- just
        // re-stamp updatedAt so elapsed time doesn't silently accumulate,
        // without emitting a delta (deliberate: avoids repeat network
        // chatter for an idle flag with nothing new to report).
        currentTile = {
          ...tile,
          muster: { ...tile.muster, updatedAt: input.nowMs, ratePerMin }
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
// musterSpeedMultiplier / outpostTileKeysForPlayer: see muster-depot-speed.ts.

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
 * The flag commits to that nearest tile: if it can't afford it yet (a SETTLED
 * tile costs more than a FRONTIER one) it saves up instead of spending on a
 * cheaper, farther tile -- otherwise cheap frontier attacks would drain it
 * before it ever reached the settled cost. The one exception is a nearest tile
 * costing more than the player's manpower cap, which no flag could ever fund.
 *
 * Cooldown (stored in advanceCooldowns, lives on the Runtime):
 *   - Flag already has the maximum number of actions in flight → wait until a lock resolves
 *   - Enemy found within ADVANCE_THROTTLE_DIST hops → fire every tick
 *   - Enemy found beyond that (but within ADVANCE_MAX_RANGE_TILES) → ADVANCE_FAR_COOLDOWN_MS
 *   - Nothing attackable within range → ADVANCE_EMPTY_COOLDOWN_MS cooldown
 */
const maybeAdvanceFire = (input: MusterTickInput, musterTile: DomainTileState, playerId: string): void => {
  const musterAmount = musterTile.muster?.amount ?? 0;
  const originKey = simulationTileKey(musterTile.x, musterTile.y);

  const inFlightLocks = locksSourcedFromMusterTile(input.locksByTile, originKey);
  if (inFlightLocks.length >= MUSTER_MAX_CONCURRENT_ACTIONS) {
    // Use the lock's own resolvesAt verbatim, never Math.max(…, nowMs): an
    // overdue lock would otherwise re-clamp to nowMs on every tick, so
    // syncMusterStatus's equality guard never matches and each tick replaces
    // the tile and persists a TILE_DELTA_BATCH — an unbounded write flood per
    // stuck flag. The client already ignores a nextActionAt in the past.
    const nextLock = inFlightLocks.reduce((soonest, lock) => lock.resolvesAt < soonest.resolvesAt ? lock : soonest);
    const resolvesAt = nextLock.resolvesAt;
    input.advanceCooldowns.set(originKey, resolvesAt);
    syncMusterStatus(input, musterTile, originKey, playerId, input.nowMs, {
      inFlight: true,
      nextActionAt: resolvesAt,
      fightX: nextLock.targetX,
      fightY: nextLock.targetY,
      inFlightCount: inFlightLocks.length
    });
    return;
  }

  // Respect per-flag cooldown. Not a new search, so carry the previous
  // search's reason (noTargetInRange/insufficientManpower) forward instead
  // of clearing it back to the generic "Planning next move" text for the
  // rest of the cooldown window.
  const cooldownUntil = input.advanceCooldowns.get(originKey) ?? 0;
  if (input.nowMs < cooldownUntil) {
    syncMusterStatus(input, musterTile, originKey, playerId, input.nowMs, {
      inFlight: inFlightLocks.length > 0,
      inFlightCount: inFlightLocks.length,
      nextActionAt: cooldownUntil,
      noTargetInRange: musterTile.muster?.noTargetInRange,
      insufficientManpower: musterTile.muster?.insufficientManpower,
      unfundableTarget: musterTile.muster?.unfundableTarget
    });
    return;
  }

  // No manpower staged yet — skip the BFS entirely and back off. Zero staged
  // manpower can never afford any target, so this is always an
  // insufficient-manpower cooldown rather than "no target exists".
  const reservedMuster = inFlightLocks.reduce((total, lock) => total + (lock.actionType === "ATTACK" ? lock.manpowerCost : 0), 0);
  const availableMuster = Math.max(0, musterAmount - reservedMuster);
  if (availableMuster <= 0) {
    const nextActionAt = input.nowMs + ADVANCE_EMPTY_COOLDOWN_MS;
    input.advanceCooldowns.set(originKey, nextActionAt);
    syncMusterStatus(input, musterTile, originKey, playerId, input.nowMs, { inFlight: inFlightLocks.length > 0, inFlightCount: inFlightLocks.length, nextActionAt, insufficientManpower: true });
    return;
  }

  const { nearest, nearestAffordable } = scanAdvanceCandidates(input, musterTile, playerId, availableMuster);

  // Nothing attackable at all, or the nearest candidate is beyond the hard
  // range cap (every closer front locked/contested) — idle rather than
  // striking whatever unlocked tile happens to be reachable, however far.
  if (!nearest || nearest.hops > ADVANCE_MAX_RANGE_TILES) {
    const nextActionAt = input.nowMs + ADVANCE_EMPTY_COOLDOWN_MS;
    input.advanceCooldowns.set(originKey, nextActionAt);
    syncMusterStatus(input, musterTile, originKey, playerId, input.nowMs, {
      inFlight: inFlightLocks.length > 0,
      inFlightCount: inFlightLocks.length,
      nextActionAt,
      noTargetInRange: true
    });
    return;
  }

  // Save up for the nearest target instead of dodging it (see pickAdvanceTarget).
  const player = input.players.get(playerId);
  const { best, unfundable } = pickAdvanceTarget(
    nearest,
    nearestAffordable,
    availableMuster,
    musterFlagCap(player ? input.playerManpowerCap(player) : Number.MAX_SAFE_INTEGER, musterTile.muster?.capLevel)
  );
  if (!best) {
    const nextActionAt = input.nowMs + ADVANCE_EMPTY_COOLDOWN_MS;
    input.advanceCooldowns.set(originKey, nextActionAt);
    syncMusterStatus(input, musterTile, originKey, playerId, input.nowMs, {
      inFlight: inFlightLocks.length > 0,
      inFlightCount: inFlightLocks.length,
      nextActionAt,
      insufficientManpower: true,
      unfundableTarget: unfundable
    });
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
    inFlightCount: inFlightLocks.length + 1,
    nextActionAt: undefined,
    fightX: nearestEnemy.x,
    fightY: nearestEnemy.y,
    unfundableTarget: unfundable
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
      // docs/replenishment-update-plan.md D6: carry this flag's chosen commitment into the ATTACK it fires -- only against a SETTLED target (see the matching comment in runtime-muster-march.ts's maybeMarchFire).
      payloadJson: JSON.stringify({ fromX: bestFrom.x, fromY: bestFrom.y, toX: nearestEnemy.x, toY: nearestEnemy.y, musterSourceX: musterTile.x, musterSourceY: musterTile.y, ...(nearestEnemy.ownershipState === "SETTLED" && musterTile.muster?.commitManpower ? { commitManpower: musterTile.muster.commitManpower } : {}) })
    },
    "ATTACK"
  );
};

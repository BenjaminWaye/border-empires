import { MUSTER_AUTO_FLAG_THRESHOLD_TILES } from "../client-constants.js";
import { attackSyncLog } from "../client-debug/client-debug.js";
import {
  findClosestMuster,
  findFundedMusterWithinRange,
  isDockCrossingBetween,
  parkOrReuseMusterFlagForAttack
} from "../client-muster-attack-gate/client-muster-attack-gate.js";
import { formatSiegeRemaining, ownTileSiegeAt, type OwnTileSiege } from "../client-muster-siege/client-muster-siege.js";
import { armMusterTransit } from "../client-muster-transit/client-muster-transit.js";
import { requiredMusterWithCommit } from "../client-attack-commit/client-attack-commit.js";
import type { ClientState } from "../client-state/client-state.js";
import type { Tile } from "../client-types.js";

// Extracted from client-queue-logic.ts's processActionQueue (well over the
// repo's 500-line cap): the muster-funded branch of a manual ATTACK on a
// non-barbarian tile. Every path here ends the current queue step -- the
// attack is armed on a flag's march, parked behind a flag that is still
// filling, or held because the flag/launch tile is under siege -- so the
// caller always `continue`s afterwards.

export type MusterAttackDispatchDeps = {
  keyFor: (x: number, y: number) => string;
  isAdjacent: (ax: number, ay: number, bx: number, by: number) => boolean;
  pushFeed: (message: string, type?: "combat" | "mission" | "error" | "info" | "alliance" | "tech", severity?: "info" | "success" | "warn" | "error") => void;
  renderHud: () => void;
  sendSetMuster: (x: number, y: number, mode: "HOLD") => void;
  sendGameMessage?: (payload: unknown) => boolean;
};

export type MusterAttackDispatchInput = {
  /** The queue entry being dispatched, re-queued as-is when held for a siege. */
  entry: { x: number; y: number; retries?: number };
  from: Tile;
  to: Tile;
  targetKey: string;
  commandId: string;
  clientSeq: number;
};

const clearInFlightAction = (state: ClientState): void => {
  state.capture = undefined;
  state.actionInFlight = false;
  state.actionCurrent = undefined;
  state.actionTargetKey = "";
  state.actionAcceptedAck = false;
  state.combatStartAck = false;
  state.actionAcceptTimeoutHandledAt = 0;
};

// Last siege we told the player about per target, so a held attack that is
// re-checked every queue pass says so once per siege rather than every pass.
// Bounded: one entry per held target, removed once that target dispatches.
const announcedSiegeByTarget = new Map<string, number>();

/**
 * Hold an attack whose flag or launch tile is under siege: the server would
 * refuse it LOCKED anyway, because an enemy fight is targeting the tile the
 * troops would leave from. Put it back on the queue to retry the moment that
 * fight resolves, instead of firing into a guaranteed rejection.
 */
const holdAttackForSiege = (
  state: ClientState,
  input: MusterAttackDispatchInput,
  siege: OwnTileSiege,
  deps: MusterAttackDispatchDeps
): void => {
  clearInFlightAction(state);
  state.actionQueue.push(input.entry);
  state.frontierSyncWaitUntilByTarget.set(input.targetKey, siege.resolvesAt + 250);
  attackSyncLog("muster-attack-held-for-siege", {
    targetKey: input.targetKey,
    besiegedTile: { x: siege.x, y: siege.y },
    attackerName: siege.attackerName,
    resolvesAt: siege.resolvesAt
  });
  if (announcedSiegeByTarget.get(input.targetKey) !== siege.resolvesAt) {
    if (announcedSiegeByTarget.size >= 64) announcedSiegeByTarget.clear();
    announcedSiegeByTarget.set(input.targetKey, siege.resolvesAt);
    deps.pushFeed(
      `Muster at (${siege.x}, ${siege.y}) is under siege by ${siege.attackerName} — attack on (${input.to.x}, ${input.to.y}) will launch when it's free in ${formatSiegeRemaining(siege.resolvesAt - Date.now())}.`,
      "combat",
      "warn"
    );
  }
  deps.renderHud();
};

export const dispatchMusterFundedAttack = (
  state: ClientState,
  input: MusterAttackDispatchInput,
  deps: MusterAttackDispatchDeps
): void => {
  const { from, to, targetKey, commandId, clientSeq } = input;
  const nowMs = Date.now();
  const closest = findClosestMuster(state, to.x, to.y);
  // A "ready" flag found by findClosestMuster must itself be adjacent (or dock-linked) to fire directly — merely "in range" gets NOT_ADJACENT server-side.
  const closestIsAdjacentOrLinked =
    closest != null &&
    (deps.isAdjacent(closest.tile.x, closest.tile.y, to.x, to.y) ||
      isDockCrossingBetween(state, closest.tile.x, closest.tile.y, to.x, to.y));
  if (!closest || closest.dist >= MUSTER_AUTO_FLAG_THRESHOLD_TILES || !closestIsAdjacentOrLinked) {
    // No flag itself sits adjacent — but the server auto-funds an ATTACK from any owned flag within remote-funding range of the firing tile (see findFundedMusterWithinRange), same as ADVANCE already relies on. Fire from the normal border origin instead of parking behind a redundant new flag.
    const funded = findFundedMusterWithinRange(state, from.x, from.y, requiredMusterWithCommit(state, to));
    if (funded) {
      // The funding flag's troops are pinned while its tile is attacked, and
      // they can't launch from a launch tile that is itself being attacked.
      const siege = ownTileSiegeAt(state, funded.tile.x, funded.tile.y, nowMs) ?? ownTileSiegeAt(state, from.x, from.y, nowMs);
      if (siege) return holdAttackForSiege(state, input, siege, deps);
      announcedSiegeByTarget.delete(targetKey);
      // Real travel time: the company doesn't march until it reaches
      // the target, so the ATTACK itself isn't even sent (let alone
      // its 30s combat lock started) until armMusterTransit's local
      // timer elapses — see client-muster-transit.ts and
      // fireDueMusterTransits, which is what actually sends it once
      // due. Distance is from the *funding flag* to the firing tile
      // (the flag's own march to the front), matching what the flag
      // physically has to cover, not the trivial firing-tile-to-target
      // adjacency.
      armMusterTransit(state, deps.keyFor, {
        musterX: funded.tile.x, musterY: funded.tile.y,
        fromX: from.x, fromY: from.y, toX: to.x, toY: to.y,
        transitTiles: Math.max(1, funded.dist),
        commandId, clientSeq
      });
      deps.pushFeed(
        `Company marching from a flag ${funded.dist} tile${funded.dist === 1 ? "" : "s"} away — attack will fire on arrival`,
        "combat", "info"
      );
      deps.renderHud();
      return;
    }
    // No fully-funded flag nearby — reuse an existing flag if one's in
    // range, or (if none exists and we're not at the muster cap) stage
    // a new one. See parkOrReuseMusterFlagForAttack for the full
    // decision.
    clearInFlightAction(state);
    state.queuedTargetKeys.delete(targetKey);
    parkOrReuseMusterFlagForAttack(state, { from, to, closest }, deps);
    return;
  }
  // The flag touches the target, so the attack launches from the flag's own
  // tile -- which can't send troops out while an enemy is attacking it.
  const siege = ownTileSiegeAt(state, closest.tile.x, closest.tile.y, nowMs);
  if (siege) return holdAttackForSiege(state, input, siege, deps);
  announcedSiegeByTarget.delete(targetKey);
  // Flag found within range already has enough manpower staged
  // (findClosestMuster only returns flags at/above MUSTER_ATTACK_COST)
  // — arm its march instead of firing instantly. The flag is already
  // adjacent/dock-linked to the target (closestIsAdjacentOrLinked,
  // checked above), so it fires from itself once the march completes.
  armMusterTransit(state, deps.keyFor, {
    musterX: closest.tile.x, musterY: closest.tile.y,
    fromX: closest.tile.x, fromY: closest.tile.y, toX: to.x, toY: to.y,
    transitTiles: Math.max(1, closest.dist),
    commandId, clientSeq
  });
  deps.pushFeed(
    `Company marching from flag ${closest.dist} tile${closest.dist === 1 ? "" : "s"} away — attack will fire on arrival`,
    "combat",
    "info"
  );
  deps.renderHud();
};

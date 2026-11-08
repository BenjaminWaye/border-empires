import { WORLD_HEIGHT, WORLD_WIDTH } from "@border-empires/shared";
import { attackSyncLog } from "../client-debug/client-debug.js";
import { stampMusterTransitResolvesAt } from "../client-muster-transit/client-muster-transit.js";
import type { ClientState } from "../client-state/client-state.js";

// The client sends frontier commands through one dispatch slot
// (state.actionInFlight / actionCurrent / capture): one command at a time
// waits for the server to accept it. That slot used to stay held for an
// ATTACK's whole combat lock (15s or more), so a player could only ever have
// one attack resolving, however many flags or however much manpower they
// had. The server has no such limit -- every ATTACK gets its own lock, and
// muster flags reserve manpower per attack (musterReservedByKey).
//
// Once the server locks an ATTACK (COMBAT_START), this module moves it out of
// the slot into detachedAttacksByCommandId (keyed by commandId, matched again
// when its COMBAT_RESULT arrives) and outgoingMusterAttacksByTile (keyed by
// target, which the 3D skirmish, claim plates and tile-menu battle progress
// already draw for any number of concurrent fights). The slot is then free
// for the next attack straight away.

export type DetachedAttack = {
  targetX: number;
  targetY: number;
  /** When the fight was first shown (state.capture.startAt), for countdowns. */
  startAt: number;
  resolvesAt: number;
  combatSnapshot?: NonNullable<ClientState["capture"]>["combatSnapshot"];
  /** The server's locked prediction from COMBAT_START, used when the result
   *  arrives as a bare commit (see resolveCombatResultPayload). */
  lockedResult?: Record<string, unknown>;
};

// Bounded by the number of attacks a player can have resolving at once,
// which manpower already caps far below this; the oldest entry goes first.
const MAX_DETACHED_ATTACKS = 128;
// A result that never arrives (target vanished, reconnect) is dropped well
// after its lock should have resolved.
const DETACHED_ATTACK_GRACE_MS = 60_000;

type DetachState = Pick<
  ClientState,
  | "detachedAttacksByCommandId"
  | "outgoingMusterAttacksByTile"
  | "musterTransitByCommand"
  | "capture"
  | "pendingCombatReveal"
  | "actionInFlight"
  | "actionAcceptedAck"
  | "combatStartAck"
  | "actionAcceptTimeoutHandledAt"
  | "actionStartedAt"
  | "actionCurrent"
  | "actionTargetKey"
  | "actionQueue"
  | "frontierSyncWaitUntilByTarget"
  | "tiles"
  | "me"
>;

type LockedAttackMessage = { commandId?: unknown; target?: unknown; origin?: unknown; resolvesAt?: unknown };

const asPoint = (value: unknown): { x: number; y: number } | undefined => {
  const point = value as { x?: unknown; y?: unknown } | undefined;
  return point && typeof point.x === "number" && typeof point.y === "number" ? { x: point.x, y: point.y } : undefined;
};

export const pruneDetachedAttacks = (state: Pick<ClientState, "detachedAttacksByCommandId">, nowMs: number): void => {
  for (const [commandId, attack] of state.detachedAttacksByCommandId) {
    if (nowMs > attack.resolvesAt + DETACHED_ATTACK_GRACE_MS) state.detachedAttacksByCommandId.delete(commandId);
  }
};

/**
 * Called after COMBAT_START has bound a locked ATTACK to the dispatch slot.
 * Moves it into the concurrent tracking maps and frees the slot. Returns
 * true when it did, so the caller can start the next queued attack.
 */
export const detachLockedAttack = (
  state: DetachState,
  keyFor: (x: number, y: number) => string,
  msg: LockedAttackMessage,
  nowMs: number = Date.now()
): boolean => {
  const commandId = msg.commandId;
  const target = asPoint(msg.target);
  const resolvesAt = msg.resolvesAt;
  if (typeof commandId !== "string" || !commandId || !target || typeof resolvesAt !== "number") return false;
  const capture = state.capture;
  if (!capture || capture.actionType !== "ATTACK" || capture.target.x !== target.x || capture.target.y !== target.y) return false;
  if (state.actionCurrent?.commandId && state.actionCurrent.commandId !== commandId) return false;
  pruneDetachedAttacks(state, nowMs);
  if (state.detachedAttacksByCommandId.size >= MAX_DETACHED_ATTACKS) {
    const oldest = state.detachedAttacksByCommandId.keys().next().value;
    if (oldest !== undefined) state.detachedAttacksByCommandId.delete(oldest);
  }
  const targetKey = keyFor(target.x, target.y);
  const reveal = state.pendingCombatReveal?.targetKey === targetKey ? state.pendingCombatReveal : undefined;
  state.detachedAttacksByCommandId.set(commandId, {
    targetX: target.x,
    targetY: target.y,
    startAt: capture.startAt,
    resolvesAt,
    ...(capture.combatSnapshot ? { combatSnapshot: capture.combatSnapshot } : {}),
    ...(reveal?.result ? { lockedResult: reveal.result } : {})
  });
  if (reveal) state.pendingCombatReveal = undefined;
  const origin = asPoint(msg.origin) ?? capture.origin;
  if (origin) {
    const winChance = capture.combatSnapshot?.winChance;
    state.outgoingMusterAttacksByTile.set(targetKey, {
      originX: origin.x, originY: origin.y, targetX: target.x, targetY: target.y, resolvesAt,
      ...(typeof winChance === "number" ? { winChance } : {})
    });
  }
  stampMusterTransitResolvesAt(state, commandId, resolvesAt);
  holdQueuedAttacksBehindLockedTarget(state, keyFor, target, resolvesAt);
  state.capture = undefined;
  state.actionInFlight = false;
  state.actionAcceptedAck = false;
  state.combatStartAck = false;
  state.actionAcceptTimeoutHandledAt = 0;
  state.actionStartedAt = 0;
  state.actionCurrent = undefined;
  state.actionTargetKey = "";
  attackSyncLog("attack-detached-from-slot", { commandId, target, resolvesAt, concurrent: state.detachedAttacksByCommandId.size });
  return true;
};

const wrappedDelta = (a: number, b: number, size: number): number => Math.min(Math.abs(a - b), size - Math.abs(a - b));
const isNeighbour = (ax: number, ay: number, bx: number, by: number): boolean => {
  const dx = wrappedDelta(ax, bx, WORLD_WIDTH);
  const dy = wrappedDelta(ay, by, WORLD_HEIGHT);
  return dx <= 1 && dy <= 1 && (dx !== 0 || dy !== 0);
};

/**
 * The next queued attack now goes out while this one is still resolving. A
 * queued tile whose only way in is through the tile being fought over has
 * no owned origin yet (an ATTACK claims nothing until it resolves), and the
 * queue would drop it as unreachable. Hold such tiles until the fight ends
 * (the queue retries a held target once its frontierSyncWaitUntil passes),
 * the way the whole queue used to wait for the attack's result.
 */
const holdQueuedAttacksBehindLockedTarget = (
  state: DetachState,
  keyFor: (x: number, y: number) => string,
  target: { x: number; y: number },
  resolvesAt: number
): void => {
  for (const entry of state.actionQueue) {
    if (!isNeighbour(entry.x, entry.y, target.x, target.y)) continue;
    let hasOwnedNeighbour = false;
    for (let dy = -1; dy <= 1 && !hasOwnedNeighbour; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        if (dx === 0 && dy === 0) continue;
        const x = (entry.x + dx + WORLD_WIDTH) % WORLD_WIDTH;
        const y = (entry.y + dy + WORLD_HEIGHT) % WORLD_HEIGHT;
        if (state.tiles.get(keyFor(x, y))?.ownerId === state.me) { hasOwnedNeighbour = true; break; }
      }
    }
    if (hasOwnedNeighbour) continue;
    const entryKey = keyFor(entry.x, entry.y);
    const waitUntil = resolvesAt + 250;
    if ((state.frontierSyncWaitUntilByTarget.get(entryKey) ?? 0) < waitUntil) state.frontierSyncWaitUntilByTarget.set(entryKey, waitUntil);
  }
};

// A detached attack whose result never arrived stops counting as a live
// fight this long after it should have resolved.
const LIVE_FIGHT_GRACE_MS = 10_000;

const detachedAsFight = (attack: DetachedAttack): NonNullable<ClientState["capture"]> => ({
  startAt: attack.startAt,
  resolvesAt: attack.resolvesAt,
  target: { x: attack.targetX, y: attack.targetY },
  actionType: "ATTACK",
  ...(attack.combatSnapshot ? { combatSnapshot: attack.combatSnapshot } : {})
});

type OwnFightState = Pick<ClientState, "capture" | "detachedAttacksByCommandId">;

/** This player's own fight on a tile: the attack in the slot, or one that already left it. */
export const ownFightAt = (state: OwnFightState, x: number, y: number, nowMs: number = Date.now()): NonNullable<ClientState["capture"]> | undefined => {
  if (state.capture && state.capture.target.x === x && state.capture.target.y === y) return state.capture;
  for (const attack of state.detachedAttacksByCommandId.values()) {
    if (attack.targetX === x && attack.targetY === y && nowMs <= attack.resolvesAt + LIVE_FIGHT_GRACE_MS) return detachedAsFight(attack);
  }
  return undefined;
};

/** The fight a single-row HUD summary should show: the slot's, else the detached one resolving soonest. */
export const latestOwnFight = (state: OwnFightState, nowMs: number = Date.now()): NonNullable<ClientState["capture"]> | undefined => {
  if (state.capture) return state.capture;
  let soonest: DetachedAttack | undefined;
  for (const attack of state.detachedAttacksByCommandId.values()) {
    if (nowMs > attack.resolvesAt + LIVE_FIGHT_GRACE_MS) continue;
    if (!soonest || attack.resolvesAt < soonest.resolvesAt) soonest = attack;
  }
  return soonest ? detachedAsFight(soonest) : undefined;
};

/** Season rollover: none of the old season's attacks, marches or reservations carry over. */
export const clearOwnAttackTracking = (
  state: Pick<ClientState, "detachedAttacksByCommandId" | "outgoingMusterAttacksByTile" | "musterTransitByCommand" | "deferredAttackByCommand">
): void => {
  state.detachedAttacksByCommandId.clear();
  state.outgoingMusterAttacksByTile.clear();
  state.musterTransitByCommand.clear();
  state.deferredAttackByCommand.clear();
};

export const isDetachedAttackCommandId = (state: Pick<ClientState, "detachedAttacksByCommandId">, commandId: unknown): boolean =>
  typeof commandId === "string" && state.detachedAttacksByCommandId.has(commandId);

/** Removes and returns the detached attack a COMBAT_RESULT belongs to. */
export const takeDetachedAttack = (state: Pick<ClientState, "detachedAttacksByCommandId">, commandId: unknown): DetachedAttack | undefined => {
  if (typeof commandId !== "string") return undefined;
  const attack = state.detachedAttacksByCommandId.get(commandId);
  if (attack) state.detachedAttacksByCommandId.delete(commandId);
  return attack;
};

/** A bare-commit result for a detached attack falls back to the prediction the
 *  server locked at COMBAT_START, same as resolveCombatResultPayload does for
 *  the attack still in the slot. */
export const detachedCombatResultPayload = (
  msg: Record<string, unknown>,
  attack: DetachedAttack,
  commitOnlyResult: boolean
): Record<string, unknown> => (commitOnlyResult && attack.lockedResult ? attack.lockedResult : msg);

/**
 * COMBAT_CANCELLED: the server's CANCEL_CAPTURE removes every frontier lock
 * the player holds, so drop the attack in the dispatch slot and every
 * detached one, along with their map tracking and flag reservations.
 */
export const clearAllAttacksAfterCancel = (state: Omit<DetachState, "actionQueue" | "frontierSyncWaitUntilByTarget" | "tiles" | "me"> & Pick<ClientState, "deferredAttackByCommand">): void => {
  // Every outgoing fight was this player's, flag auto-fire included, and the
  // server just removed all of them.
  state.outgoingMusterAttacksByTile.clear();
  state.detachedAttacksByCommandId.clear();
  // Fired marches (no deferred send left) were funding the cancelled locks;
  // still-marching ones were never sent and stay armed.
  for (const commandId of [...state.musterTransitByCommand.keys()]) {
    if (!state.deferredAttackByCommand.has(commandId)) state.musterTransitByCommand.delete(commandId);
  }
  state.capture = undefined;
  state.actionInFlight = false;
  state.actionAcceptedAck = false;
  state.combatStartAck = false;
  state.actionAcceptTimeoutHandledAt = 0;
  state.actionStartedAt = 0;
  state.actionTargetKey = "";
  state.actionCurrent = undefined;
};

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
  resolvesAt: number;
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
    resolvesAt,
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
  stampMusterTransitResolvesAt(state, target.x, target.y, resolvesAt);
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

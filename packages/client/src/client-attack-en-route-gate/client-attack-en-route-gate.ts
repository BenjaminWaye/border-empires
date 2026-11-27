// Greys out Launch Attack on a tile this player already has an attack heading
// for (or fighting over). Once the server accepts an attack it combat-locks
// the target until the fight resolves, so a second Launch Attack was refused
// with "Another battle is already being fought for this tile". Attacks still
// held client-side (a muster company marching, or parked until its flag
// fills) count too: a second one would be refused as soon as the first fires.

import type { ClientState } from "../client-state/client-state.js";
import type { Tile, TileActionDef } from "../client-types.js";

export const ATTACK_EN_ROUTE_LABEL = "Attack En Route";
export const ATTACK_EN_ROUTE_REASON = "Your troops are already on the way";

export type AttackEnRouteState = Pick<
  ClientState,
  | "capture"
  | "actionInFlight"
  | "actionTargetKey"
  | "actionCurrent"
  | "outgoingMusterAttacksByTile"
  | "musterTransitByCommand"
  | "deferredAttackByCommand"
  | "detachedAttacksByCommandId"
  | "pendingMusterAttacks"
>;

const live = (resolvesAt: number | undefined, nowMs: number): boolean => resolvesAt === undefined || resolvesAt > nowMs;

/** True when one of this player's own attacks is already targeting (x, y). */
export const hasOwnAttackEnRoute = (state: AttackEnRouteState, x: number, y: number, nowMs = Date.now()): boolean => {
  const key = `${x},${y}`;
  const capture = state.capture;
  if (capture && capture.actionType !== "EXPAND" && capture.target.x === x && capture.target.y === y && capture.resolvesAt > nowMs) return true;
  if (state.actionInFlight && state.actionTargetKey === key && state.actionCurrent?.actionType === "ATTACK") return true;
  const muster = state.outgoingMusterAttacksByTile.get(key);
  if (muster && !muster.isExpand && muster.resolvesAt > nowMs) return true;
  for (const transit of state.musterTransitByCommand.values()) {
    if (transit.targetX === x && transit.targetY === y && live(transit.resolvesAt, nowMs)) return true;
  }
  for (const deferred of state.deferredAttackByCommand.values()) {
    if (deferred.toX === x && deferred.toY === y) return true;
  }
  for (const detached of state.detachedAttacksByCommandId.values()) {
    if (detached.targetX === x && detached.targetY === y && detached.resolvesAt > nowMs) return true;
  }
  return state.pendingMusterAttacks.some((parked) => parked.targetX === x && parked.targetY === y);
};

/**
 * Swaps an enabled Launch Attack row for a disabled "Attack En Route" one
 * while an own attack on this tile is in flight. Rows already disabled for
 * another reason (spawn shield, no origin) keep that reason. Feeds both the
 * tile sheet and the confirming second tap, so neither can re-send it.
 */
/** The disabled row gateAttackEnRouteActions puts in Launch Attack's place. */
export const attackEnRouteRow = (): TileActionDef => ({ id: "launch_attack", label: ATTACK_EN_ROUTE_LABEL, disabled: true, disabledReason: ATTACK_EN_ROUTE_REASON });

export const isAttackEnRouteRow = (action: TileActionDef): boolean => action.id === "launch_attack" && action.disabledReason === ATTACK_EN_ROUTE_REASON;

export const gateAttackEnRouteActions = (actions: TileActionDef[], state: AttackEnRouteState, tile: Pick<Tile, "x" | "y">, nowMs = Date.now()): TileActionDef[] => {
  const launch = actions.find((action) => action.id === "launch_attack");
  if (!launch || launch.disabled || !hasOwnAttackEnRoute(state, tile.x, tile.y, nowMs)) return actions;
  const gated = attackEnRouteRow();
  return actions.map((action) => (action === launch ? gated : action));
};

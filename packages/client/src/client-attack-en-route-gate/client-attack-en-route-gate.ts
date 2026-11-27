// Greys out Launch Attack on a tile this player already has an attack heading
// for (or fighting over). The server combat-locks the target from the moment
// an attack is accepted -- including the march -- until it resolves, so a
// second Launch Attack was only ever refused with "Another battle is already
// being fought for this tile". The button now says so before the tap.

import type { ClientState } from "../client-state/client-state.js";
import type { Tile, TileActionDef } from "../client-types.js";

export const ATTACK_EN_ROUTE_LABEL = "Attack En Route";
export const ATTACK_EN_ROUTE_REASON = "Your troops are already on the way";

type AttackEnRouteState = Pick<
  ClientState,
  | "capture"
  | "actionInFlight"
  | "actionTargetKey"
  | "actionCurrent"
  | "outgoingMusterAttacksByTile"
  | "musterTransitByCommand"
  | "deferredAttackByCommand"
  | "detachedAttacksByCommandId"
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
  return false;
};

/**
 * Swaps an enabled Launch Attack row for a disabled "Attack En Route" one
 * while an own attack on this tile is in flight. Rows already disabled for
 * another reason (spawn shield, no origin) keep that reason. Feeds both the
 * tile sheet and the confirming second tap, so neither can re-send it.
 */
export const gateAttackEnRouteActions = (actions: TileActionDef[], state: AttackEnRouteState, tile: Pick<Tile, "x" | "y">, nowMs = Date.now()): TileActionDef[] => {
  const launch = actions.find((action) => action.id === "launch_attack");
  if (!launch || launch.disabled || !hasOwnAttackEnRoute(state, tile.x, tile.y, nowMs)) return actions;
  const gated: TileActionDef = { id: launch.id, label: ATTACK_EN_ROUTE_LABEL, disabled: true, disabledReason: ATTACK_EN_ROUTE_REASON };
  return actions.map((action) => (action === launch ? gated : action));
};

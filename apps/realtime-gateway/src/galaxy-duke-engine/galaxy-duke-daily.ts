// The daily rhythm (design doc §30): one order per system and one decree per
// Duke, each recharging a day after it is used. Reactions (answering a Writ or
// the Court's offer, cancelling a build) are free. Pure logic.
import { isActionReady, nextActionAvailableAt, tryTakeAction } from "../galaxy-action-gate/galaxy-action-gate.js";
import { findSystem, replaceSystem } from "./galaxy-duke-systems.js";
import type { DukeState } from "./galaxy-duke-types.js";

export type DailyGateError = { ok: false; code: "ORDER_NOT_READY" | "DECREE_NOT_READY"; availableAt: number } | { ok: false; code: "NO_SUCH_SYSTEM" };

export const orderReadyAt = (state: DukeState, seasonId: string): number => nextActionAvailableAt(findSystem(state, seasonId)?.orderGate);
export const isOrderReady = (state: DukeState, seasonId: string, now: number): boolean => isActionReady(findSystem(state, seasonId)?.orderGate, now);
export const decreeReadyAt = (state: DukeState): number => nextActionAvailableAt(state.petitionGate);
export const isDecreeReady = (state: DukeState, now: number): boolean => isActionReady(state.petitionGate, now);

// Spends the system's order; the caller then applies what the order does.
export const takeOrder = (state: DukeState, seasonId: string, now: number): { ok: true; state: DukeState } | DailyGateError => {
  const system = findSystem(state, seasonId);
  if (!system) return { ok: false, code: "NO_SUCH_SYSTEM" };
  const gated = tryTakeAction(system.orderGate, now);
  if (!gated.ok) return { ok: false, code: "ORDER_NOT_READY", availableAt: gated.availableAt };
  return { ok: true, state: replaceSystem(state, { ...system, orderGate: gated.state }) };
};

export const takeDecree = (state: DukeState, now: number): { ok: true; state: DukeState } | DailyGateError => {
  const gated = tryTakeAction(state.petitionGate, now);
  if (!gated.ok) return { ok: false, code: "DECREE_NOT_READY", availableAt: gated.availableAt };
  return { ok: true, state: { ...state, petitionGate: gated.state } };
};

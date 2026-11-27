// The scout drone's charges in words for the AFC menus: "5/8 · +1 in 3h 58m", or "8/8" when all are ready.
// The players' last open ask (review rounds 5-10): nothing said charges come back, or when. Owner: in the AFC menu.
import { nextScoutChargeAt } from "@border-empires/shared";
import type { ClientState } from "../client-state/client-state.js";
import { scoutClock } from "./client-scout-drone-dock.js";
import { scoutChargesMax, scoutChargesReady } from "./client-scout-drone-plan.js";

/** "ready/max", the part that fits a narrow button. */
export const scoutChargeCount = (state: Pick<ClientState, "scoutDroneCharges">, nowMs: number): string =>
  `${scoutChargesReady(state, nowMs)}/${scoutChargesMax(state)}`;

/** "ready/max", plus "+1 in …" while a charge is refilling. */
export const scoutChargeStatus = (state: Pick<ClientState, "scoutDroneCharges">, nowMs: number): string => {
  const ready = scoutChargesReady(state, nowMs);
  const next = ready < scoutChargesMax(state) && state.scoutDroneCharges ? nextScoutChargeAt(state.scoutDroneCharges, nowMs) : undefined;
  return next === undefined ? scoutChargeCount(state, nowMs) : `${scoutChargeCount(state, nowMs)} · +1 in ${scoutClock(next - nowMs)}`;
};

/** With no charge ready, how long until the next one is back ("3h 58m"); undefined while any is ready. */
export const scoutChargeRefillIn = (state: Pick<ClientState, "scoutDroneCharges">, nowMs: number): string | undefined => {
  if (scoutChargesReady(state, nowMs) > 0 || !state.scoutDroneCharges) return undefined;
  const next = nextScoutChargeAt(state.scoutDroneCharges, nowMs);
  return next === undefined ? undefined : scoutClock(next - nowMs);
};

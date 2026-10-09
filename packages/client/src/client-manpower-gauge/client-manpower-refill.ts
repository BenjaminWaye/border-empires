import { MANPOWER_REFILL_WINDOW_MS, nextManpowerRefillAtMs } from "@border-empires/shared";

/**
 * Client view of the periodic manpower refill. The schedule is a pure function
 * of the player id, so the client derives it locally (same as the server) and
 * nothing extra travels on the wire.
 */

/** Epoch ms of this player's next refill, or undefined before the player id is known. */
export const nextManpowerRefillForPlayer = (playerId: string | undefined, nowMs: number): number | undefined =>
  playerId ? nextManpowerRefillAtMs(playerId, nowMs) : undefined;

/** "1h 20m", "45m", "<1m"; callers handle the "refill is due" case themselves. */
export const formatRefillCountdown = (ms: number): string => {
  const totalMinutes = Math.ceil(Math.max(0, ms) / 60_000);
  if (totalMinutes < 1) return "<1m";
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes}m`;
  return minutes === 0 ? `${hours}h` : `${hours}h ${minutes}m`;
};

/**
 * Time until manpower reaches the cap, counting whole refills. Each refill is
 * estimated at a full window of regen; the first one can be a little smaller if
 * manpower was spent after sitting at the cap mid-window, so this can run up to
 * one window optimistic in that case. Undefined when regen is paused.
 */
export const msUntilManpowerFull = (
  manpower: number,
  manpowerCap: number,
  manpowerRegenPerMinute: number,
  nextRefillAtMs: number,
  nowMs: number
): number | undefined => {
  if (manpower >= manpowerCap) return 0;
  const perRefill = manpowerRegenPerMinute * (MANPOWER_REFILL_WINDOW_MS / 60_000);
  if (!(perRefill > 0)) return undefined;
  const refillsNeeded = Math.ceil((manpowerCap - manpower) / perRefill);
  return Math.max(0, nextRefillAtMs - nowMs) + (refillsNeeded - 1) * MANPOWER_REFILL_WINDOW_MS;
};

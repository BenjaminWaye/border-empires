/**
 * Manpower regeneration is paid out in one chunk per refill window instead of
 * ticking up continuously. The per-minute rates in config.ts still define how
 * much each window pays: rate x window length.
 */
export const MANPOWER_REFILL_WINDOW_MS = 4 * 60 * 60 * 1000;

/**
 * Manpower refill schedule. Regeneration is credited at the end of each refill
 * window (every MANPOWER_REFILL_WINDOW_MS) rather than continuously. Each
 * player's windows are offset by a stable hash of their id so refills (and the
 * state updates they trigger) spread across the window instead of landing for
 * everyone at once, and so no one can time an attack around a global reload.
 *
 * Pure functions of (playerId, time): the server and client both derive the
 * same schedule from the player id, so no schedule has to travel on the wire.
 */

/** Stable 32-bit FNV-1a hash of a player id. */
const hashPlayerId = (playerId: string): number => {
  let hash = 0x811c9dc5;
  for (let index = 0; index < playerId.length; index += 1) {
    hash ^= playerId.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
};

/** This player's offset into the refill window, in [0, windowMs). */
export const manpowerRefillOffsetMs = (playerId: string, windowMs: number = MANPOWER_REFILL_WINDOW_MS): number =>
  hashPlayerId(playerId) % windowMs;

/** The most recent refill boundary at or before `nowMs`. */
export const lastManpowerRefillAtMs = (playerId: string, nowMs: number, windowMs: number = MANPOWER_REFILL_WINDOW_MS): number => {
  const offset = manpowerRefillOffsetMs(playerId, windowMs);
  return Math.floor((nowMs - offset) / windowMs) * windowMs + offset;
};

/** The next refill boundary strictly after `nowMs`. */
export const nextManpowerRefillAtMs = (playerId: string, nowMs: number, windowMs: number = MANPOWER_REFILL_WINDOW_MS): number =>
  lastManpowerRefillAtMs(playerId, nowMs, windowMs) + windowMs;

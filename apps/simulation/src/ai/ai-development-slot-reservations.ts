import type { CommandEnvelope } from "@border-empires/sim-protocol";

export const AI_DEVELOPMENT_RESERVATION_GRACE_MS = 6_000;

export type DevelopmentSlotReservation = {
  commandId: string;
  expiresAt: number;
};

export const isDevelopmentSlotCommand = (type: CommandEnvelope["type"]): boolean =>
  type === "BUILD_FORT" ||
  type === "BUILD_OBSERVATORY" ||
  type === "BUILD_SIEGE_OUTPOST" ||
  type === "BUILD_ECONOMIC_STRUCTURE";

export const reservedDevelopmentSlotCount = (
  reservationsByPlayer: Map<string, DevelopmentSlotReservation[]>,
  playerId: string,
  at: number
): number => {
  const reservations = reservationsByPlayer.get(playerId);
  if (!reservations) return 0;
  const active = reservations.filter((reservation) => reservation.expiresAt > at);
  if (active.length) reservationsByPlayer.set(playerId, active);
  else reservationsByPlayer.delete(playerId);
  return active.length;
};

export const reserveDevelopmentSlot = (
  reservationsByPlayer: Map<string, DevelopmentSlotReservation[]>,
  command: CommandEnvelope,
  at: number
): void => {
  if (!isDevelopmentSlotCommand(command.type)) return;
  const reservations = reservationsByPlayer.get(command.playerId) ?? [];
  reservations.push({
    commandId: command.commandId,
    expiresAt: at + AI_DEVELOPMENT_RESERVATION_GRACE_MS
  });
  reservationsByPlayer.set(command.playerId, reservations);
};

export const clearDevelopmentReservation = (
  reservationsByPlayer: Map<string, DevelopmentSlotReservation[]>,
  playerId: string,
  commandId: string
): void => {
  const reservations = reservationsByPlayer.get(playerId);
  if (!reservations) return;
  const next = reservations.filter((reservation) => reservation.commandId !== commandId);
  if (next.length) reservationsByPlayer.set(playerId, next);
  else reservationsByPlayer.delete(playerId);
};

/**
 * Clears every reservation for a player outright. Call this once a fresh
 * player snapshot has actually been synced from the runtime — at that point
 * activeDevelopmentProcessCount is known-current, so any synthetic
 * reservation covering the pre-sync staleness gap is no longer needed.
 *
 * Without this, an accepted dev-slot command (SETTLE/BUILD_FORT/
 * BUILD_ECONOMIC_STRUCTURE/...) only had its reservation lifted by
 * AI_DEVELOPMENT_RESERVATION_GRACE_MS elapsing — a guessed fixed window
 * that has nothing to do with when the worker's player snapshot actually
 * catches up. If the real sync landed sooner, the reservation over-blocked
 * for no reason; if a snapshot got delayed past the grace window (queued
 * behind other AI syncs on a busy tick), the AI resubmitted a doomed build
 * every rejection-cooldown cycle until the stale window finally expired —
 * a likely contributor to the BUILD_FORT/BUILD_ECONOMIC_STRUCTURE rejection
 * storms observed on staging (still under investigation; see
 * sim_ai_command_rejected_code_total added alongside this change).
 */
export const clearDevelopmentReservationsForPlayer = (
  reservationsByPlayer: Map<string, DevelopmentSlotReservation[]>,
  playerId: string
): void => {
  reservationsByPlayer.delete(playerId);
};

import type { CommandEnvelope } from "@border-empires/sim-protocol";

export const AI_DEVELOPMENT_RESERVATION_GRACE_MS = 6_000;

export type DevelopmentSlotReservation = {
  commandId: string;
  expiresAt: number;
};

export const isDevelopmentSlotCommand = (type: CommandEnvelope["type"]): boolean =>
  type === "SETTLE" ||
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

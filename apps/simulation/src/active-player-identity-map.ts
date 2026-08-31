import type { RecoveredSimulationState } from "./event-recovery/event-recovery.js";

export type ActivePlayerIdentity = {
  id: string;
  isAi: boolean;
};

export const createActivePlayerIdentityMap = (
  players: Iterable<{ id: string; isAi: boolean }>
): Map<string, ActivePlayerIdentity> =>
  new Map(
    [...players].map((player) => [
      player.id,
      {
        id: player.id,
        isAi: player.isAi
      }
    ])
  );

export const createRecoveredActivePlayerIdentityMap = (
  initialState: RecoveredSimulationState | undefined,
  fallbackPlayers: ReadonlyMap<string, ActivePlayerIdentity>
): Map<string, ActivePlayerIdentity> | undefined => {
  if (!initialState?.players || initialState.players.length === 0) return undefined;
  return new Map(
    initialState.players.map((player) => [
      player.id,
      {
        id: player.id,
        isAi: player.isAi ?? fallbackPlayers.get(player.id)?.isAi ?? false
      }
    ])
  );
};

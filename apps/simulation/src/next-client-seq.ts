import type { StoredSimulationCommand } from "./command-store.js";

export const buildNextClientSeqByPlayer = (
  commands: readonly StoredSimulationCommand[],
  playerIds: readonly string[]
): Record<string, number> => {
  const maxClientSeqByPlayer = new Map<string, number>();

  for (const command of commands) {
    const currentMax = maxClientSeqByPlayer.get(command.playerId) ?? 0;
    if (command.clientSeq > currentMax) {
      maxClientSeqByPlayer.set(command.playerId, command.clientSeq);
    }
  }

  return Object.fromEntries(
    playerIds.map((playerId) => [playerId, (maxClientSeqByPlayer.get(playerId) ?? 0) + 1] as const)
  );
};

import type { StoredSimulationCommand } from "../command-store/command-store.js";

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

// recoveredCommands (from loadRecoverableCommands) only carries QUEUED/ACCEPTED
// rows, so its max client_seq understates the true high-water mark once a
// player's commands resolve or reject (barbarian/system commands almost
// always do). Reseeding from that alone reissues a low seq that collides with
// resolved rows still in the commands table via the UNIQUE(player_id,
// client_seq) index — the staging boot crash-loop of 2026-07-14. Seed from
// both sources in a single pass so a not-yet-persisted recovered command can
// never lower the mark below the full-table MAX(client_seq).
export const seedNextClientSeqByPlayer = (
  recoveredCommands: readonly StoredSimulationCommand[],
  persistedMaxClientSeqByPlayer: Readonly<Record<string, number>>,
  playerIds: readonly string[]
): Record<string, number> => {
  const maxClientSeqByPlayer = new Map<string, number>(Object.entries(persistedMaxClientSeqByPlayer));

  for (const command of recoveredCommands) {
    const currentMax = maxClientSeqByPlayer.get(command.playerId) ?? 0;
    if (command.clientSeq > currentMax) {
      maxClientSeqByPlayer.set(command.playerId, command.clientSeq);
    }
  }

  return Object.fromEntries(
    playerIds.map((playerId) => [playerId, (maxClientSeqByPlayer.get(playerId) ?? 0) + 1] as const)
  );
};

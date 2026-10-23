import { MUSTER_UNDER_SIEGE_MESSAGE } from "@border-empires/shared";
import type { CommandEnvelope } from "@border-empires/sim-protocol";
import type { CombatLockTileReader } from "../combat-lock-index/combat-lock-index.js";
import type { LockRecord } from "../runtime-types.js";

/**
 * The enemy fight (if any) currently targeting this tile. A muster flag on a
 * tile like this is "under siege": its troops are pinned until the fight
 * resolves, so it can't be cleared (pulling the troops out right before the
 * tile falls), switched to Advance/March, or fund an attack. Your own fights
 * never besiege your own tile (you can't attack yourself), but the playerId
 * check keeps that explicit.
 */
export const besiegingLockAt = (
  locksByTile: CombatLockTileReader,
  tileKey: string,
  playerId: string
): LockRecord | undefined => {
  const lock = locksByTile.targetLockAt(tileKey);
  return lock && lock.playerId !== playerId ? lock : undefined;
};

/**
 * Rejects `command` with MUSTER_UNDER_SIEGE when the flag tile is besieged.
 * Returns true when it rejected, so the handler can return straight away.
 * The client greys these actions out first; this is the authoritative
 * backstop for a stale client or an AI command. The distinct code shows up
 * in sim_ai_command_rejected_code_total for AI players.
 */
export const rejectIfMusterBesieged = (
  locksByTile: CombatLockTileReader,
  command: CommandEnvelope,
  tileKey: string,
  rejectCommand: (command: CommandEnvelope, code: string, message: string) => void
): boolean => {
  if (!besiegingLockAt(locksByTile, tileKey, command.playerId)) return false;
  rejectCommand(command, "MUSTER_UNDER_SIEGE", MUSTER_UNDER_SIEGE_MESSAGE);
  return true;
};

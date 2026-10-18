import type { LockRecord, LockedCombatResolution } from "../runtime-types.js";
import type { RuntimeLockResolutionContext } from "../runtime-lock-resolution.js";
import { applyWinningTileCapture } from "../runtime-winning-capture.js";
import { applyCombatEncirclement } from "../runtime-lock-resolution-encirclement.js";
import { isAlliedOrTruced } from "../runtime-player-factory.js";
import { fortWardIsReady } from "./afc-battle-effects.js";

/** No combat roll, Momentum, recursive Breakthrough, or second primary plunder payout. */
export function applyBreakthroughCapture(context: RuntimeLockResolutionContext, primary: LockRecord, resolution: LockedCombatResolution | undefined): void {
  const award = resolution?.breakthroughTarget;
  const attacker = context.players.get(primary.playerId);
  if (!award || !attacker) return;
  const tile = context.tiles.get(award.key);
  if (!tile || tile.terrain !== "LAND" || tile.ownerId !== award.ownerId || isAlliedOrTruced(attacker, award.ownerId) ||
      context.locksByTile.has(award.key) || context.hasPendingClaim?.(award.key) || context.isTileShieldedByAegisLock(attacker.id, tile.x, tile.y) || fortWardIsReady(context.players, tile, context.now())) return;
  const lock: LockRecord = { ...primary, commandId: `${primary.commandId}:breakthrough`, targetKey: award.key, targetX: tile.x, targetY: tile.y, manpowerCost: 0 };
  delete lock.combatResolution;
  const relocation = applyWinningTileCapture(context, lock, tile);
  applyCombatEncirclement(context, lock, true, false, tile.ownerId);
  if (relocation !== undefined) context.relocateSettlementForPlayer(tile.ownerId, lock.commandId, relocation);
  context.respawnIfEliminated(tile.ownerId, lock.commandId);
  const defender = context.players.get(tile.ownerId);
  if (defender && !defender.isAi) context.emitPlayerStateUpdate({ commandId: lock.commandId, playerId: defender.id });
}

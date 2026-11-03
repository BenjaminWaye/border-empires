import type { LockRecord, LockedCombatResolution } from "../runtime-types.js";
import type { RuntimeLockResolutionContext } from "../runtime-lock-resolution.js";
import { applyWinningTileCapture } from "../runtime-winning-capture.js";
import { applyCombatEncirclement } from "../runtime-lock-resolution-encirclement.js";
import { isAlliedOrTruced } from "../runtime-player-factory.js";
import { fortWardIsReady } from "./afc-battle-effects.js";

/** No combat roll, Momentum, recursive Breakthrough, or second primary plunder payout. */
/** Captures each pre-picked Breakthrough tile through the normal capture pipeline, then announces them for the map effect. */
export function applyBreakthroughCapture(context: RuntimeLockResolutionContext, primary: LockRecord, resolution: LockedCombatResolution | undefined): void {
  const attacker = context.players.get(primary.playerId);
  if (!attacker) return;
  const captured: Array<{ x: number; y: number; ownerId: string }> = [];
  for (const [index, award] of (resolution?.breakthroughTargets ?? []).entries()) {
    const tile = context.tiles.get(award.key);
    if (!tile || tile.terrain !== "LAND" || tile.ownerId !== award.ownerId || isAlliedOrTruced(attacker, award.ownerId) ||
        context.locksByTile.has(award.key) || context.hasPendingClaim?.(award.key) || context.isTileShieldedByAegisLock(attacker.id, tile.x, tile.y) || fortWardIsReady(context.players, tile, context.now())) continue;
    const lock: LockRecord = { ...primary, commandId: `${primary.commandId}:breakthrough${index ? `:${index}` : ""}`, targetKey: award.key, targetX: tile.x, targetY: tile.y, manpowerCost: 0 };
    delete lock.combatResolution;
    const relocation = applyWinningTileCapture(context, lock, tile);
    applyCombatEncirclement(context, lock, true, false, tile.ownerId);
    if (relocation !== undefined) context.relocateSettlementForPlayer(tile.ownerId, lock.commandId, relocation);
    context.respawnIfEliminated(tile.ownerId, lock.commandId);
    const defender = context.players.get(tile.ownerId);
    if (defender && !defender.isAi) context.emitPlayerStateUpdate({ commandId: lock.commandId, playerId: defender.id });
    captured.push({ x: tile.x, y: tile.y, ownerId: award.ownerId });
  }
  if (!captured.length) return;
  // Both sides see the surrender effect; it is presentation only and carries nothing their map does not already show.
  const payload = JSON.stringify({ type: "AFC_BREAKTHROUGH", attackerId: attacker.id, fromX: primary.targetX, fromY: primary.targetY, tiles: captured.map(({ x, y }) => ({ x, y })) });
  for (const playerId of new Set([attacker.id, ...captured.map(tile => tile.ownerId)])) {
    if (context.players.get(playerId)?.isAi) continue;
    context.emitEvent({ eventType: "PLAYER_MESSAGE", commandId: `${primary.commandId}:breakthrough-fx`, playerId, messageType: "AFC_BREAKTHROUGH", payloadJson: payload });
  }
}

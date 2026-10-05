// Barbarian walk/multiply resolution, split out of runtime-combat-support.ts
// (Stage 6 god-class breakup follow-up) to keep that file under the repo's
// 500-line cap.
import type { DomainTileState } from "@border-empires/game-domain";
import { BARBARIAN_MULTIPLY_THRESHOLD, MAX_BARBARIAN_TILES } from "@border-empires/shared";
import type { LockRecord } from "./runtime-types.js";
import type { RuntimeCombatSupportContext } from "./runtime-combat-support.js";

export const barbarianProgressGain = (target: DomainTileState | undefined): number => {
  if (!target?.ownerId || target.ownerId === "barbarian-1") return 0;
  return target.resource || target.town || target.fort || target.siegeOutpost || target.dockId ? 2 : 1;
};

export type BarbarianWalkContext = Pick<
  RuntimeCombatSupportContext,
  "barbarianTileProgress" | "summaryForPlayer" | "emitEvent" | "tiles" | "replaceTileState" | "tileDeltaFromState"
>;

/** A barbarian tile stripped back to neutral land (keeps the world features it sits on). */
export const releasedBarbarianTile = (tile: DomainTileState): DomainTileState => ({
  x: tile.x,
  y: tile.y,
  terrain: tile.terrain,
  ...(tile.resource ? { resource: tile.resource } : {}),
  ...(tile.dockId ? { dockId: tile.dockId } : {}),
  ...(tile.town ? { town: tile.town } : {}),
  ...(tile.shardSite ? { shardSite: tile.shardSite } : {}),
  ...(tile.naturalWonder ? { naturalWonder: tile.naturalWonder } : {}),
  ...(tile.watchtower ? { watchtower: tile.watchtower } : {}),
  ...(tile.economicStructure ? { economicStructure: tile.economicStructure } : {})
});

export type BarbarianLaunchContext = Pick<BarbarianWalkContext, "tiles" | "replaceTileState" | "tileDeltaFromState" | "emitEvent" | "barbarianTileProgress">;

/**
 * A barbarian ATTACK leaves its origin tile the moment it starts: the origin is
 * released to neutral now, not when the attack resolves. Otherwise a player who
 * defeats the attacker's launch tile mid-fight would still watch the barbarian
 * walk onto their tile and survive. Returns the progress the origin carried,
 * which releasing the tile would otherwise discard (see LockRecord.barbarianLaunch).
 */
export const launchBarbarianAttack = (ctx: BarbarianLaunchContext, lock: LockRecord): { progress: number } => {
  const progress = ctx.barbarianTileProgress.get(lock.originKey) ?? 0;
  const origin = ctx.tiles.get(lock.originKey);
  if (origin?.ownerId === "barbarian-1") {
    const released = releasedBarbarianTile(origin);
    ctx.replaceTileState(lock.originKey, released, lock.commandId);
    ctx.emitEvent({ eventType: "TILE_DELTA_BATCH", commandId: lock.commandId, playerId: lock.playerId, tileDeltas: [ctx.tileDeltaFromState(released)] });
  }
  return { progress };
};

export const applyBarbarianWalkOrMultiply = (ctx: BarbarianWalkContext, lock: LockRecord, previousTarget: DomainTileState | undefined): void => {
  const gain = barbarianProgressGain(previousTarget);
  const sourceProgress = lock.barbarianLaunch?.progress ?? ctx.barbarianTileProgress.get(lock.originKey) ?? 0;
  const newProgress = sourceProgress + gain;
  const barbTileCount = ctx.summaryForPlayer("barbarian-1").territoryTileKeys.size;

  // At the territory cap a win never multiplies: the barbarian walks instead
  // (progress is kept, so it multiplies once it is back under the cap).
  if (newProgress >= BARBARIAN_MULTIPLY_THRESHOLD && barbTileCount < MAX_BARBARIAN_TILES) {
    ctx.emitEvent({
      eventType: "BARB_MULTIPLIED",
      commandId: lock.commandId,
      playerId: "barbarian-1",
      originKey: lock.originKey,
      targetKey: lock.targetKey,
      eatenOwnerId: previousTarget?.ownerId ?? null,
      eatenResource: previousTarget?.resource ?? null,
      eatenHasTown: !!previousTarget?.town,
      gain,
      sourceProgress,
      barbTileCount: barbTileCount + 1
    });
    // Progress restarts from zero; an absent entry means zero, so don't store one.
    ctx.barbarianTileProgress.delete(lock.originKey);
    ctx.barbarianTileProgress.delete(lock.targetKey);
    // Multiplying keeps the origin as well as taking the target: put the tile the
    // barbarian launched from back, unless someone has claimed it in the meantime.
    const launchedFrom = lock.barbarianLaunch ? ctx.tiles.get(lock.originKey) : undefined;
    if (launchedFrom && !launchedFrom.ownerId && launchedFrom.terrain === "LAND") {
      const restored: DomainTileState = { ...launchedFrom, ownerId: "barbarian-1", ownershipState: "SETTLED" };
      ctx.replaceTileState(lock.originKey, restored, lock.commandId);
      ctx.emitEvent({ eventType: "TILE_DELTA_BATCH", commandId: lock.commandId, playerId: lock.playerId, tileDeltas: [ctx.tileDeltaFromState(restored)] });
    }
    return;
  }

  if (gain > 0) {
    ctx.emitEvent({
      eventType: "BARB_ATE_TILE",
      commandId: lock.commandId,
      playerId: "barbarian-1",
      originKey: lock.originKey,
      targetKey: lock.targetKey,
      eatenOwnerId: previousTarget!.ownerId!,
      eatenResource: previousTarget?.resource ?? null,
      eatenHasTown: !!previousTarget?.town,
      gain,
      sourceProgress,
      newProgress,
      capBlocked: newProgress >= BARBARIAN_MULTIPLY_THRESHOLD // reached the threshold but the cap forced a walk
    });
  }
  ctx.barbarianTileProgress.delete(lock.originKey);
  ctx.barbarianTileProgress.set(lock.targetKey, newProgress);
  const previousOrigin = ctx.tiles.get(lock.originKey);
  if (!previousOrigin || previousOrigin.ownerId !== "barbarian-1") return;
  const releasedOrigin = releasedBarbarianTile(previousOrigin);
  ctx.replaceTileState(lock.originKey, releasedOrigin);
  ctx.emitEvent({
    eventType: "TILE_DELTA_BATCH",
    commandId: lock.commandId,
    playerId: lock.playerId,
    tileDeltas: [ctx.tileDeltaFromState(releasedOrigin)]
  });
};

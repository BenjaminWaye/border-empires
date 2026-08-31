// Barbarian walk/multiply resolution, split out of runtime-combat-support.ts
// (Stage 6 god-class breakup follow-up) to keep that file under the repo's
// 500-line cap.
import type { DomainTileState } from "@border-empires/game-domain";
import { BARBARIAN_MULTIPLY_THRESHOLD } from "@border-empires/shared";
import type { LockRecord } from "./runtime-types.js";
import type { RuntimeCombatSupportContext } from "./runtime-combat-support.js";

export const barbarianProgressGain = (target: DomainTileState | undefined): number => {
  if (!target?.ownerId || target.ownerId === "barbarian-1") return 0;
  return target.resource || target.town || target.fort || target.siegeOutpost || target.dockId ? 2 : 1;
};

export const applyBarbarianWalkOrMultiply = (ctx: RuntimeCombatSupportContext, lock: LockRecord, previousTarget: DomainTileState | undefined): void => {
  const gain = barbarianProgressGain(previousTarget);
  const sourceProgress = ctx.barbarianTileProgress.get(lock.originKey) ?? 0;
  const newProgress = sourceProgress + gain;
  const barbTileCount = ctx.summaryForPlayer("barbarian-1").territoryTileKeys.size;

  if (newProgress >= BARBARIAN_MULTIPLY_THRESHOLD) {
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
    ctx.barbarianTileProgress.set(lock.originKey, 0);
    ctx.barbarianTileProgress.set(lock.targetKey, 0);
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
      capBlocked: newProgress >= BARBARIAN_MULTIPLY_THRESHOLD
    });
  }
  ctx.barbarianTileProgress.delete(lock.originKey);
  ctx.barbarianTileProgress.set(lock.targetKey, newProgress);
  const previousOrigin = ctx.tiles.get(lock.originKey);
  if (!previousOrigin || previousOrigin.ownerId !== "barbarian-1") return;
  const releasedOrigin: DomainTileState = {
    x: previousOrigin.x,
    y: previousOrigin.y,
    terrain: previousOrigin.terrain,
    ...(previousOrigin.resource ? { resource: previousOrigin.resource } : {}),
    ...(previousOrigin.dockId ? { dockId: previousOrigin.dockId } : {}),
    ...(previousOrigin.town ? { town: previousOrigin.town } : {}),
    ...(previousOrigin.shardSite ? { shardSite: previousOrigin.shardSite } : {}),
    ...(previousOrigin.naturalWonder ? { naturalWonder: previousOrigin.naturalWonder } : {}),
    ...(previousOrigin.watchtower ? { watchtower: previousOrigin.watchtower } : {}),
    ...(previousOrigin.economicStructure ? { economicStructure: previousOrigin.economicStructure } : {})
  };
  ctx.replaceTileState(lock.originKey, releasedOrigin);
  ctx.emitEvent({
    eventType: "TILE_DELTA_BATCH",
    commandId: lock.commandId,
    playerId: lock.playerId,
    tileDeltas: [ctx.tileDeltaFromState(releasedOrigin)]
  });
};

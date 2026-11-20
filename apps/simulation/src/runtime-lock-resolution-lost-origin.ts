import type { DomainTileState } from "@border-empires/game-domain";
import { razedWreckFieldsOnCapture } from "@border-empires/shared";
import { capturedStructureFields } from "./capture-structures/capture-structures.js";
import { FORT_PATROL_GRACE_MS } from "./territory-automation/territory-automation.js";
import { flipFeatures } from "./territory-flip-log/territory-flip-features.js";
import { recordDockChangeImpacts } from "./personal-impact-log/dock-change-impacts.js";
import { applyMusterFlagCapture } from "./muster-capture/muster-capture.js";
import { isPlanetaryDefenseOwner, planetaryDefenseCaptureFields } from "./planetary-defense-camps/camp-rules.js";
import type { LockRecord, SimulationTileWireDelta } from "./runtime-types.js";
import type { RuntimeLockResolutionContext } from "./runtime-lock-resolution.js";

// Split out of runtime-lock-resolution.ts (kept that file under the 500-line
// cap) -- an attacker who lost their ATTACK also loses the origin tile they
// launched from, and this hands it to the defender. A Planetary Defense
// defender stays where it is and takes the origin into the defending tile's
// camp (a town or dock founds a new camp, camp-rules.ts). Only called from
// resolveLock's `originLost` branch.
export function resolveLostOrigin(context: RuntimeLockResolutionContext, lock: LockRecord, previousOwnerId: string): void {
  const previousOrigin = context.tiles.get(lock.originKey);
  if (!previousOrigin) return;
  const campFields = isPlanetaryDefenseOwner(previousOwnerId)
    ? planetaryDefenseCaptureFields({
        targetKey: lock.originKey,
        previousTarget: previousOrigin,
        sourceCampId: context.tiles.get(lock.targetKey)?.campId,
        campCount: context.planetaryDefenseCampCount()
      })
    : undefined;
  const originOwnershipState = campFields?.ownershipState ?? "FRONTIER";
  const { muster: _discardMuster, ...strippedOrigin } = previousOrigin;
  const resolvedOrigin: DomainTileState = {
    ...strippedOrigin,
    ...(campFields?.campId ? { campId: campFields.campId } : {}),
    ownerId: previousOwnerId,
    ownershipState: originOwnershipState,
    frontierDecayAt: undefined,
    frontierDecayKind: undefined,
    ...capturedStructureFields(previousOrigin, previousOwnerId, context.now()),
    ...razedWreckFieldsOnCapture(previousOrigin, context.now())
  };
  context.replaceTileState(lock.originKey, resolvedOrigin, lock.commandId);
  if (previousOrigin.ownerId !== resolvedOrigin.ownerId) {
    context.recordTileFlip?.({
      tileId: lock.originKey,
      x: previousOrigin.x,
      y: previousOrigin.y,
      fromOwner: previousOrigin.ownerId,
      toOwner: resolvedOrigin.ownerId,
      at: context.now(),
      ...flipFeatures(previousOrigin)
    });
    recordDockChangeImpacts(context, previousOrigin, resolvedOrigin.ownerId, lock.commandId);
  }
  if (originOwnershipState === "FRONTIER") context.extendFortPatrolGrace(lock.originKey, context.now() + FORT_PATROL_GRACE_MS);
  else context.clearFortPatrolGrace(lock.originKey);
  // Force visible to the attacker even if losing this tile dropped their
  // fog coverage of it in the same instant. See forceVisibleForPlayerId's doc.
  const originDelta = context.tileDeltaFromState(resolvedOrigin);
  originDelta.forceVisibleForPlayerId = lock.playerId;
  const tileDeltas = [originDelta];

  // The origin's muster flag (already stripped via `_discardMuster` above) is
  // taken by the player who reclaimed the tile: its unreserved manpower moves
  // to their pool (capped), never back to the attacker who lost it -- see
  // muster-capture/muster-capture.ts. previousOrigin is read live, after this
  // lock's own cost was spent from the flag (consumeOriginMuster); manpower
  // still reserved by the attacker's other in-flight attacks is excluded.
  const hadMuster = Boolean(previousOrigin.muster);
  if (previousOrigin.muster) {
    const reserved = context.musterReservedByKey.get(lock.originKey) ?? 0;
    applyMusterFlagCapture(context, {
      commandId: lock.commandId,
      captorId: previousOwnerId,
      x: previousOrigin.x,
      y: previousOrigin.y,
      muster: { ...previousOrigin.muster, amount: Math.max(0, previousOrigin.muster.amount - reserved) }
    });
  }

  context.emitEvent({ eventType: "TILE_DELTA_BATCH", commandId: lock.commandId, playerId: lock.playerId, tileDeltas });

  if (hadMuster) {
    // Same rationale as originDelta above -- force past the visibility
    // filter for both the attacker and the reclaiming defender, or this
    // delta is silently dropped and the attacker's client keeps showing the
    // pre-flip owner until an unrelated reselect forces a refetch.
    const broadcastMusterClearDelta: SimulationTileWireDelta = {
      x: previousOrigin.x, y: previousOrigin.y,
      ownerId: resolvedOrigin.ownerId, ownershipState: resolvedOrigin.ownershipState,
      musterJson: "", forceVisibleForPlayerId: [lock.playerId, previousOwnerId]
    };
    context.emitEvent({ eventType: "TILE_DELTA_BATCH", commandId: `${lock.commandId}:bc`, playerId: "__broadcast__", tileDeltas: [broadcastMusterClearDelta] });
  }
}

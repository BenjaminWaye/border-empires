import type { DomainTileState } from "@border-empires/game-domain";
import { capturedStructureFields } from "./capture-structures/capture-structures.js";
import { FORT_PATROL_GRACE_MS } from "./territory-automation/territory-automation.js";
import type { LockRecord, SimulationTileWireDelta } from "./runtime-types.js";
import type { RuntimeLockResolutionContext } from "./runtime-lock-resolution.js";

// Split out of runtime-lock-resolution.ts (kept that file under the 500-line
// cap) -- an attacker who lost their ATTACK also loses the origin tile they
// launched from, and this reverts it to the previous owner (or releases a
// barbarian-held defender tile back to neutral if the previous owner was the
// barbarian faction). Only called from resolveLock's `originLost` branch.
export function resolveLostOrigin(context: RuntimeLockResolutionContext, lock: LockRecord, previousOwnerId: string): void {
  const previousOrigin = context.tiles.get(lock.originKey);
  if (!previousOrigin) return;
  const originOwnershipState = previousOwnerId === "barbarian-1" ? "SETTLED" : "FRONTIER";
  const { muster: _discardMuster, ...strippedOrigin } = previousOrigin;
  const resolvedOrigin: DomainTileState = {
    ...strippedOrigin,
    ownerId: previousOwnerId,
    ownershipState: originOwnershipState,
    frontierDecayAt: undefined,
    frontierDecayKind: undefined,
    ...capturedStructureFields(previousOrigin, previousOwnerId, context.now())
  };
  context.replaceTileState(lock.originKey, resolvedOrigin, lock.commandId);
  if (previousOrigin.ownerId !== resolvedOrigin.ownerId) {
    context.recordTileFlip?.({
      tileId: lock.originKey,
      x: previousOrigin.x,
      y: previousOrigin.y,
      fromOwner: previousOrigin.ownerId,
      toOwner: resolvedOrigin.ownerId,
      at: context.now()
    });
  }
  if (originOwnershipState === "FRONTIER") context.extendFortPatrolGrace(lock.originKey, context.now() + FORT_PATROL_GRACE_MS);
  else context.clearFortPatrolGrace(lock.originKey);
  // Force visible to the attacker even if losing this tile dropped their
  // fog coverage of it in the same instant. See forceVisibleForPlayerId's doc.
  const originDelta = context.tileDeltaFromState(resolvedOrigin);
  originDelta.forceVisibleForPlayerId = lock.playerId;
  const tileDeltas = [originDelta];

  // The origin's muster flag (already stripped via `_discardMuster` above) is
  // destroyed along with its staged manpower — no refund to the player who
  // just lost the tile.
  const hadMuster = Boolean(previousOrigin.muster);

  if (previousOwnerId === "barbarian-1") {
    const defenderTile = context.tiles.get(lock.targetKey);
    if (defenderTile?.ownerId === "barbarian-1" && !context.locksByTile.has(lock.targetKey)) {
      const releasedDefender: DomainTileState = {
        x: defenderTile.x,
        y: defenderTile.y,
        terrain: defenderTile.terrain,
        ...(defenderTile.resource ? { resource: defenderTile.resource } : {}),
        ...(defenderTile.dockId ? { dockId: defenderTile.dockId } : {}),
        ...(defenderTile.town ? { town: defenderTile.town } : {}),
        ...(defenderTile.shardSite ? { shardSite: defenderTile.shardSite } : {}),
        ...(defenderTile.naturalWonder ? { naturalWonder: defenderTile.naturalWonder } : {}),
        ...(defenderTile.watchtower ? { watchtower: defenderTile.watchtower } : {}),
        ...(defenderTile.economicStructure ? { economicStructure: defenderTile.economicStructure } : {})
      };
      context.replaceTileState(lock.targetKey, releasedDefender, lock.commandId);
      context.barbarianTileProgress.delete(lock.targetKey);
      tileDeltas.push(context.tileDeltaFromState(releasedDefender));
    }
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

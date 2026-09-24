// SIPHON_TILE / CANCEL_SIPHON / PURGE_SIPHON — docs/game-mechanics.md "Siphon".
//
// Siphon locks one of the caster's Aether Towers (Observatories) into siphon
// mode and drains the enemy town/resource tiles in a 3x3 around the target:
// towns produce nothing, and resource tiles' slots count toward the caster's
// slot supply instead of the owner's (siphon-mode/siphon-slot-transfer.ts).
// There is no timer — see siphon-mode/siphon-mode-lifecycle.ts for every way
// a siphon ends.
import type { CommandEnvelope } from "@border-empires/sim-protocol";
import type { DomainPlayer, DomainTileState } from "@border-empires/game-domain";
import { SIPHON_SHARE } from "@border-empires/game-domain";
import { SIPHON_UNTIL_CANCELLED_ENDS_AT, WORLD_HEIGHT, WORLD_WIDTH, wrapX, wrapY } from "@border-empires/shared";
import { parseTilePayload } from "./runtime-command-parsers.js";
import { isAlliedOrTruced } from "./runtime-player-factory.js";
import { simulationTileKey } from "./seed-state/seed-state.js";
import { isCoveredByOwnersActiveObservatory } from "./siphon-mode/siphon-mode-lifecycle.js";
import type { RuntimeAbilityCommandContext } from "./runtime-ability-command-handlers.js";

function rejectCommand(
  context: RuntimeAbilityCommandContext,
  command: CommandEnvelope,
  code: string,
  message: string
): void {
  context.emitEvent({
    eventType: "COMMAND_REJECTED",
    commandId: command.commandId,
    playerId: command.playerId,
    code,
    message
  });
}

function isActiveSiphon(tile: DomainTileState, now: number): boolean {
  return Boolean(tile.sabotage && tile.sabotage.endsAt > now);
}

function siphonableTileForActor(
  tile: DomainTileState | undefined,
  actor: DomainPlayer,
  now: number
): tile is DomainTileState {
  if (!tile || tile.terrain !== "LAND" || !tile.ownerId || tile.ownerId === actor.id || isAlliedOrTruced(actor, tile.ownerId)) {
    return false;
  }
  if (!tile.town && !tile.resource) return false;
  return !isActiveSiphon(tile, now);
}

// A tile its owner already covers with an active Aether Tower would end the
// siphon the moment it started (the victim-Observatory rule), so it is never
// eligible in the first place.
function drainableTileForActor(
  context: RuntimeAbilityCommandContext,
  tile: DomainTileState | undefined,
  actor: DomainPlayer,
  now: number
): tile is DomainTileState {
  return siphonableTileForActor(tile, actor, now) && !isCoveredByOwnersActiveObservatory(context.tiles, tile.ownerId!, tile.x, tile.y);
}

export function handleSiphonTileCommand(context: RuntimeAbilityCommandContext, command: CommandEnvelope): void {
  const actor = context.players.get(command.playerId);
  const payload = parseTilePayload(command.payloadJson);
  if (!actor || !payload) {
    rejectCommand(context, command, "BAD_COMMAND", "invalid command payload");
    return;
  }
  const targetKey = simulationTileKey(payload.x, payload.y);
  const target = context.tiles.get(targetKey);
  if (!actor.techIds.has("logistics")) {
    rejectCommand(context, command, "SIPHON_INVALID", "requires Logistics");
    return;
  }
  const siphonNow = context.now();
  if (!siphonableTileForActor(target, actor, siphonNow)) {
    rejectCommand(context, command, "SIPHON_INVALID", "target enemy-controlled town or resource tile");
    return;
  }
  if (!drainableTileForActor(context, target, actor, siphonNow)) {
    rejectCommand(context, command, "SIPHON_INVALID", "target is protected by its owner's Aether Tower");
    return;
  }
  // pickReadyOwnedObservatoryForTarget already skips towers in siphon mode.
  const siphonObservatoryKey = context.pickReadyOwnedObservatoryForTarget(actor.id, target.x, target.y, siphonNow);
  const observatoryTile = siphonObservatoryKey ? context.tiles.get(siphonObservatoryKey) : undefined;
  if (!siphonObservatoryKey || !observatoryTile?.observatory) {
    rejectCommand(context, command, "SIPHON_INVALID", "no ready Aether Tower in range of target");
    return;
  }
  const affectedTiles: DomainTileState[] = [];
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      const candidate = context.tiles.get(simulationTileKey(wrapX(target.x + dx, WORLD_WIDTH), wrapY(target.y + dy, WORLD_HEIGHT)));
      if (drainableTileForActor(context, candidate, actor, siphonNow)) affectedTiles.push(candidate);
    }
  }
  const tileKeys = affectedTiles.map((tile) => simulationTileKey(tile.x, tile.y));
  const updatedTiles = affectedTiles.map((tile): DomainTileState => ({
    ...tile,
    sabotage: {
      ownerId: actor.id,
      endsAt: SIPHON_UNTIL_CANCELLED_ENDS_AT,
      outputMultiplier: 1 - SIPHON_SHARE,
      observatoryTileKey: siphonObservatoryKey
    }
  }));
  const lockedTower: DomainTileState = {
    ...observatoryTile,
    observatory: {
      ...observatoryTile.observatory,
      siphon: { targetX: target.x, targetY: target.y, tileKeys, startedAt: siphonNow }
    }
  };
  for (const updatedTile of updatedTiles) context.replaceTileState(simulationTileKey(updatedTile.x, updatedTile.y), updatedTile, command.commandId);
  context.replaceTileState(siphonObservatoryKey, lockedTower, command.commandId);
  context.emitEvent({
    eventType: "TILE_DELTA_BATCH",
    commandId: command.commandId,
    playerId: command.playerId,
    tileDeltas: [...updatedTiles, lockedTower].map((updatedTile) => context.tileDeltaFromState(updatedTile))
  });
  context.siphonModeLifecycle.emitSlotTransferUpdates(command.commandId, [
    actor.id,
    ...affectedTiles.flatMap((tile) => (tile.ownerId ? [tile.ownerId] : []))
  ]);
  context.emitEvent({ eventType: "COMMAND_RESOLVED", commandId: command.commandId, playerId: command.playerId });
}

/** CANCEL_SIPHON: x/y is the caster's own tower in siphon mode. */
export function handleCancelSiphonCommand(context: RuntimeAbilityCommandContext, command: CommandEnvelope): void {
  const actor = context.players.get(command.playerId);
  const payload = parseTilePayload(command.payloadJson);
  if (!actor || !payload) {
    rejectCommand(context, command, "BAD_COMMAND", "invalid command payload");
    return;
  }
  const observatoryKey = simulationTileKey(payload.x, payload.y);
  const tower = context.tiles.get(observatoryKey);
  const siphon = tower?.observatory?.siphon;
  if (!tower?.observatory || !siphon || tower.observatory.ownerId !== actor.id || tower.ownerId !== actor.id) {
    rejectCommand(context, command, "CANCEL_SIPHON_INVALID", "no Aether Tower of yours in siphon mode on that tile");
    return;
  }
  context.siphonModeLifecycle.endSiphon(
    { observatoryKey, casterId: actor.id, tileKeys: siphon.tileKeys, reason: "cancelled" },
    command.commandId
  );
  context.emitEvent({ eventType: "COMMAND_RESOLVED", commandId: command.commandId, playerId: command.playerId });
}

// Kept rejecting (it already did before siphon mode): the victim's counter is
// now to activate an Aether Tower covering the drained tiles, which ends the
// siphon for good — a free purge on top of that would make Siphon pointless.
export function handlePurgeSiphonCommand(context: RuntimeAbilityCommandContext, command: CommandEnvelope): void {
  rejectCommand(context, command, "PURGE_SIPHON_INVALID", "siphons cannot be purged; activate an Aether Tower covering the siphoned tiles to end it");
}

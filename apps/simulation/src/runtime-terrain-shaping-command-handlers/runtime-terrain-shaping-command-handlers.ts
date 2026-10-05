// CREATE_MOUNTAIN / REMOVE_MOUNTAIN (Terrain Shaping), extracted from
// runtime-map-command-handlers.ts (500-line cap). Both are cast from one of
// the actor's ready Aether Towers and, like Aether Purge, are refused when a
// hostile player's Aether Tower protects the target tile — checked against
// full world state here, so a tower the caster can't see still blocks it.
import type { CommandEnvelope } from "@border-empires/sim-protocol";
import type { DomainPlayer, DomainTileState } from "@border-empires/game-domain";
import { TERRAIN_SHAPING_COOLDOWN_MS } from "@border-empires/game-domain";
import { isTileShieldedByEnemyObservatory } from "../runtime-ability-helpers.js";
import { parseTilePayload } from "../runtime-command-parsers.js";
import type { RuntimeMapCommandContext } from "../runtime-map-command-handlers.js";
import { isAlliedOrTruced } from "../runtime-player-factory.js";
import { simulationTileKey } from "../seed-state/seed-state.js";

function rejectCommand(context: RuntimeMapCommandContext, command: CommandEnvelope, code: string, message: string): void {
  context.emitEvent({ eventType: "COMMAND_REJECTED", commandId: command.commandId, playerId: command.playerId, code, message });
}

// A hostile (not allied/truced) owner's active Aether Tower shields their own
// tiles only; unowned land and the actor's own land are never shielded.
function isTargetShieldedByHostileAetherTower(context: RuntimeMapCommandContext, actor: DomainPlayer, target: DomainTileState): boolean {
  if (!target.ownerId || isAlliedOrTruced(actor, target.ownerId)) return false;
  return isTileShieldedByEnemyObservatory(context.tiles, context.isStructureDormant, actor.id, target.x, target.y, context.now());
}

export function handleCreateMountainCommand(context: RuntimeMapCommandContext, command: CommandEnvelope): void {
  const actor = context.players.get(command.playerId);
  const payload = parseTilePayload(command.payloadJson);
  if (!actor || !payload) {
    rejectCommand(context, command, "BAD_COMMAND", "invalid command payload");
    return;
  }
  const targetKey = simulationTileKey(payload.x, payload.y);
  const target = context.tiles.get(targetKey);
  if (!actor.techIds.has("terrain-engineering")) {
    rejectCommand(context, command, "CREATE_MOUNTAIN_INVALID", "requires Geoform Engine Module");
    return;
  }
  if (
    !target ||
    target.terrain !== "LAND" ||
    target.town ||
    target.dockId ||
    target.fort ||
    target.observatory ||
    target.siegeOutpost ||
    target.economicStructure
  ) {
    rejectCommand(context, command, "CREATE_MOUNTAIN_INVALID", "cannot create mountain on this tile");
    return;
  }
  if (!context.ownedLandWithinRange(actor.id, target.x, target.y, 2)) {
    rejectCommand(context, command, "CREATE_MOUNTAIN_INVALID", "target must be within 2 tiles of your land");
    return;
  }
  if (isTargetShieldedByHostileAetherTower(context, actor, target)) {
    rejectCommand(context, command, "CREATE_MOUNTAIN_INVALID", "blocked by an Aether Tower");
    return;
  }
  const now = context.now();
  const observatoryKey = context.pickReadyOwnedObservatoryForTarget(actor.id, target.x, target.y, now);
  if (!observatoryKey) {
    rejectCommand(context, command, "CREATE_MOUNTAIN_INVALID", "no ready observatory in range");
    return;
  }
  context.stampObservatoryCooldown(observatoryKey, TERRAIN_SHAPING_COOLDOWN_MS, now, command.commandId, command.playerId);
  const hadMuster = Boolean(target.muster);
  const updatedTile: DomainTileState = {
    ...target,
    terrain: "MOUNTAIN",
    ownerId: undefined,
    ownershipState: undefined,
    sabotage: undefined,
    fort: undefined,
    observatory: undefined,
    naturalWonder: undefined,
    siegeOutpost: undefined,
    economicStructure: undefined,
    muster: undefined // mirrors bombardment/capture/shed: ownership loss destroys a staged muster flag
  };
  context.replaceTileState(targetKey, updatedTile);
  context.bumpTerrainEpoch();
  context.emitEvent({ eventType: "TILE_DELTA_BATCH", commandId: command.commandId, playerId: command.playerId, tileDeltas: [context.tileDeltaFromState(updatedTile)] });
  if (hadMuster) {
    context.emitEvent({ eventType: "TILE_DELTA_BATCH", commandId: `${command.commandId}:bc`, playerId: "__broadcast__", tileDeltas: [{ x: updatedTile.x, y: updatedTile.y, ownerId: "", ownershipState: "", musterJson: "" }] });
  }
  // A mountain can strand the previous owner's frontier tiles that hung off this tile.
  if (target.ownerId) context.applyEncirclement([targetKey], target.ownerId, command.commandId, { bfsCap: 2000 });
  context.emitEvent({ eventType: "COMMAND_RESOLVED", commandId: command.commandId, playerId: command.playerId });
}

export function handleRemoveMountainCommand(context: RuntimeMapCommandContext, command: CommandEnvelope): void {
  const actor = context.players.get(command.playerId);
  const payload = parseTilePayload(command.payloadJson);
  if (!actor || !payload) {
    rejectCommand(context, command, "BAD_COMMAND", "invalid command payload");
    return;
  }
  const targetKey = simulationTileKey(payload.x, payload.y);
  const target = context.tiles.get(targetKey);
  if (!actor.techIds.has("terrain-engineering")) {
    rejectCommand(context, command, "REMOVE_MOUNTAIN_INVALID", "requires Geoform Engine Module");
    return;
  }
  if (!target || target.terrain !== "MOUNTAIN") {
    rejectCommand(context, command, "REMOVE_MOUNTAIN_INVALID", "target must be mountain");
    return;
  }
  if (isTargetShieldedByHostileAetherTower(context, actor, target)) {
    rejectCommand(context, command, "REMOVE_MOUNTAIN_INVALID", "blocked by an Aether Tower");
    return;
  }
  const now = context.now();
  const observatoryKey = context.pickReadyOwnedObservatoryForTarget(actor.id, target.x, target.y, now);
  if (!observatoryKey) {
    rejectCommand(context, command, "REMOVE_MOUNTAIN_INVALID", "no ready observatory in range");
    return;
  }
  context.stampObservatoryCooldown(observatoryKey, TERRAIN_SHAPING_COOLDOWN_MS, now, command.commandId, command.playerId);
  const updatedTile: DomainTileState = { ...target, terrain: "LAND" };
  context.replaceTileState(targetKey, updatedTile);
  context.bumpTerrainEpoch();
  context.emitEvent({
    eventType: "TILE_DELTA_BATCH",
    commandId: command.commandId,
    playerId: command.playerId,
    tileDeltas: [context.tileDeltaFromState(updatedTile)]
  });
  context.emitEvent({ eventType: "COMMAND_RESOLVED", commandId: command.commandId, playerId: command.playerId });
}

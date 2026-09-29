import type { CommandEnvelope } from "@border-empires/sim-protocol";
import type { DomainTileState } from "@border-empires/game-domain";
import { playerHasAbilityTech, RETORT_RECAST_COOLDOWN_MS } from "@border-empires/game-domain";
import { retortResourceClassForTarget, retortResourceClassForTile } from "@border-empires/shared";
import { rejectCommand, type RuntimeMapCommandContext } from "./runtime-map-command-handlers.js";
import { parseRetortRecastPayload } from "./runtime-command-parsers.js";
import { simulationTileKey } from "./seed-state/seed-state.js";

// §7 item 9: rewrites a resource tile's kind into a different industrial
// class (food/titanium/crystal/umbrite). Mirrors handleCreateMountainCommand's
// shape (single owned-tile mutation, observatory-range + cooldown gated) --
// see docs/manifest-retort-recast-plan.md for the design this implements.
export function handleRetortRecastCommand(context: RuntimeMapCommandContext, command: CommandEnvelope): void {
  const actor = context.players.get(command.playerId);
  const payload = parseRetortRecastPayload(command.payloadJson);
  if (!actor || !payload) {
    rejectCommand(context, command, "BAD_COMMAND", "invalid command payload");
    return;
  }
  if (!playerHasAbilityTech(actor.techIds, "retort_recast")) {
    rejectCommand(context, command, "RETORT_RECAST_INVALID", "requires Matterwright Retort Module");
    return;
  }
  const targetKey = simulationTileKey(payload.x, payload.y);
  const target = context.tiles.get(targetKey);
  if (!target || target.ownerId !== actor.id) {
    rejectCommand(context, command, "RETORT_RECAST_INVALID", "target must be a tile you own");
    return;
  }
  if (target.town || target.dockId || target.fort || target.siegeOutpost || target.observatory || target.economicStructure) {
    rejectCommand(context, command, "RETORT_RECAST_INVALID", "cannot recast this tile");
    return;
  }
  const currentClass = retortResourceClassForTile(target.resource);
  if (!currentClass) {
    rejectCommand(context, command, "RETORT_RECAST_INVALID", "tile has no resource to recast");
    return;
  }
  if (currentClass === retortResourceClassForTarget(payload.targetResource)) {
    rejectCommand(context, command, "RETORT_RECAST_INVALID", "already that resource class");
    return;
  }
  const now = context.now();
  const observatoryKey = context.pickReadyOwnedObservatoryForTarget(actor.id, target.x, target.y, now);
  if (!observatoryKey) {
    rejectCommand(context, command, "RETORT_RECAST_INVALID", "no ready observatory in range");
    return;
  }
  context.stampObservatoryCooldown(observatoryKey, RETORT_RECAST_COOLDOWN_MS, now, command.commandId, command.playerId);
  const updatedTile: DomainTileState = { ...target, resource: payload.targetResource };
  context.replaceTileState(targetKey, updatedTile, command.commandId);
  context.emitEvent({
    eventType: "TILE_DELTA_BATCH",
    commandId: command.commandId,
    playerId: command.playerId,
    tileDeltas: [context.tileDeltaFromState(updatedTile)]
  });
  context.emitEvent({ eventType: "COMMAND_RESOLVED", commandId: command.commandId, playerId: command.playerId });
}

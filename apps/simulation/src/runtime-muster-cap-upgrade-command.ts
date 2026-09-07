import type { CommandEnvelope } from "@border-empires/sim-protocol";
import type { DomainTileState } from "@border-empires/game-domain";
import { simulationTileKey } from "./seed-state/seed-state.js";
import { parseUpgradeMusterCapPayload } from "./runtime-command-parsers.js";
import type { RuntimeStructureCommandContext } from "./runtime-structure-command-handlers.js";

function rejectCommand(context: RuntimeStructureCommandContext, command: CommandEnvelope, code: string, message: string): void {
  context.emitEvent({ eventType: "COMMAND_REJECTED", commandId: command.commandId, playerId: command.playerId, code, message });
}

function resolveCommand(context: RuntimeStructureCommandContext, command: CommandEnvelope): void {
  context.emitEvent({ eventType: "COMMAND_RESOLVED", commandId: command.commandId, playerId: command.playerId });
}

/**
 * "Expand Capacity" — bumps one muster flag's capLevel by 1, adding another
 * MUSTER_FLAG_CAP_MANPOWER_FRACTION share of the player's manpower cap to
 * that flag's cap (see musterFlagCap and the headroom calc in
 * runtime-muster-tick.ts).
 *
 * Currently free (no manpower/resource cost) — deliberately temporary. The
 * intended cost is a FOOD resource-slot occupation (the same
 * supply/demand-slot mechanic Forts/Siege Outposts/Observatories use, see
 * resource-slot-view.ts), which is a real design task of its own, not yet
 * done. Land that FOOD-slot cost here when it's ready rather than
 * reintroducing a flat manpower charge — a one-off payment doesn't carry
 * the ongoing "you gave something up to keep this" stake a slot does.
 */
export function handleUpgradeMusterCapCommand(context: RuntimeStructureCommandContext, command: CommandEnvelope): void {
  const actor = context.players.get(command.playerId);
  const payload = parseUpgradeMusterCapPayload(command.payloadJson);
  if (!actor || !payload) {
    rejectCommand(context, command, "BAD_COMMAND", "invalid command payload");
    return;
  }
  const targetKey = simulationTileKey(payload.x, payload.y);
  const target = context.tiles.get(targetKey);
  if (!target || target.ownerId !== command.playerId || !target.muster || target.muster.ownerId !== command.playerId) {
    rejectCommand(context, command, "MUSTER_INVALID", "no muster flag on owned tile");
    return;
  }
  const updatedTile: DomainTileState = {
    ...target,
    muster: { ...target.muster, capLevel: (target.muster.capLevel ?? 0) + 1 }
  };
  context.replaceTileState(targetKey, updatedTile, command.commandId);
  context.emitEvent({
    eventType: "TILE_DELTA_BATCH",
    commandId: command.commandId,
    playerId: command.playerId,
    tileDeltas: [context.tileDeltaFromState(updatedTile)]
  });
  resolveCommand(context, command);
}

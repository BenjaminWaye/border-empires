import type { CommandEnvelope } from "@border-empires/sim-protocol";
import type { DomainTileState } from "@border-empires/game-domain";
import { MUSTER_FLAG_CAP_UPGRADE_COST } from "@border-empires/shared";
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
 * "Expand Capacity" — pays MUSTER_FLAG_CAP_UPGRADE_COST manpower to raise one
 * muster flag's cap by MUSTER_FLAG_CAP_PER_UPGRADE (see the headroom calc in
 * runtime-muster-tick.ts). A deliberate, costed choice each time, the same
 * way training another unit costs resources rather than the army growing on
 * its own — so a flag's cap only ever grows because the player chose to
 * spend on it, not passively.
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
  if (actor.manpower < MUSTER_FLAG_CAP_UPGRADE_COST) {
    rejectCommand(
      context,
      command,
      "MUSTER_CAP_UPGRADE_UNAFFORDABLE",
      `need ${MUSTER_FLAG_CAP_UPGRADE_COST} manpower to expand this flag's capacity`
    );
    return;
  }
  actor.manpower -= MUSTER_FLAG_CAP_UPGRADE_COST;
  const updatedTile: DomainTileState = {
    ...target,
    muster: { ...target.muster, capLevel: (target.muster.capLevel ?? 0) + 1 }
  };
  context.replaceTileState(targetKey, updatedTile, command.commandId);
  context.emitEvent({
    eventType: "TILE_DELTA_BATCH",
    commandId: command.commandId,
    playerId: command.playerId,
    playerManpower: actor.manpower,
    tileDeltas: [context.tileDeltaFromState(updatedTile)]
  });
  context.emitPlayerStateUpdate(command);
  resolveCommand(context, command);
}

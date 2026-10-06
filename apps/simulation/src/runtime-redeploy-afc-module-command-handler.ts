import type { CommandEnvelope } from "@border-empires/sim-protocol";
import { techEntryById } from "./tech-domain-bridge/tech-domain-bridge.js";
import { parseRedeployAfcModulePayload } from "./runtime-command-parsers.js";
import type { RuntimeStructureCommandContext } from "./runtime-structure-command-handlers.js";
import { rejectCommand } from "./runtime-structure-command-handlers-reject.js";
import { simulationTileKey } from "./seed-state/seed-state.js";
import { callDownAfcModules, type AfcModuleDeliveryContext } from "./afc-module-delivery/afc-module-delivery.js";

/** Calls the single researched House copy of an AFC module down to an owned
 * AFC; it lands after AFC_MODULE_CALL_DOWN_MS (afc-module-delivery.ts).
 * Captured copies are intentionally not removed: they are earned duplicates. */
export const handleRedeployAfcModuleCommand = (context: RuntimeStructureCommandContext, command: CommandEnvelope): void => {
  const actor = context.players.get(command.playerId);
  const payload = parseRedeployAfcModulePayload(command.payloadJson);
  if (!actor || !payload || techEntryById.get(payload.techId)?.manifestCategory !== "AFC_MODULE" || !actor.techIds.has(payload.techId)) {
    rejectCommand(context, command, "BAD_COMMAND", "unknown AFC module");
    return;
  }
  const targetKey = simulationTileKey(payload.x, payload.y);
  const target = context.tiles.get(targetKey);
  if (!target?.afc || target.ownerId !== actor.id || target.ownershipState !== "SETTLED" || target.afc.status !== "active") {
    rejectCommand(context, command, "BUILD_INVALID", "target must be an active AFC you control");
    return;
  }
  callDownAfcModules(afcModuleDeliveryContextFor(context), actor.id, targetKey, [payload.techId], command.commandId);
};

/** Adapts the structure command context; it carries no player summary, so owned AFCs come from a tile scan. */
export const afcModuleDeliveryContextFor = (context: RuntimeStructureCommandContext): AfcModuleDeliveryContext => ({
  tiles: context.tiles,
  now: context.now,
  ownedAfcTileKeys: (playerId) =>
    context.summaryForPlayer?.(playerId).ownedAfcTileKeys ??
    [...context.tiles].filter(([, tile]) => tile.afc && tile.ownerId === playerId).map(([tileKey]) => tileKey),
  replaceTileState: context.replaceTileState,
  tileDeltaFromState: context.tileDeltaFromState,
  emitEvent: context.emitEvent,
  emitPlayerStateUpdate: (command) => context.emitPlayerStateUpdate(command),
  scheduleAfter: context.scheduleAfter
});

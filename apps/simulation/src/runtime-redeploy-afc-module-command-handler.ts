import type { CommandEnvelope } from "@border-empires/sim-protocol";
import { techEntryById } from "./tech-domain-bridge/tech-domain-bridge.js";
import { parseRedeployAfcModulePayload } from "./runtime-command-parsers.js";
import type { RuntimeStructureCommandContext } from "./runtime-structure-command-handlers.js";
import { rejectCommand } from "./runtime-structure-command-handlers-reject.js";
import { simulationTileKey } from "./seed-state/seed-state.js";

/** Moves the single researched House copy of an AFC module between owned AFCs.
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
  const changed = [];
  for (const tileKey of context.summaryForPlayer(actor.id).ownedAfcTileKeys) {
    const tile = context.tiles.get(tileKey);
    if (!tile?.afc || tile.ownerId !== actor.id || tileKey === targetKey || !tile.afc.modules?.includes(payload.techId)) continue;
    const next = { ...tile, afc: { ...tile.afc, modules: tile.afc.modules.filter((techId) => techId !== payload.techId) } };
    context.replaceTileState(tileKey, next, command.commandId);
    changed.push(next);
  }
  if (!target.afc.modules?.includes(payload.techId)) {
    const next = { ...target, afc: { ...target.afc, modules: [...(target.afc.modules ?? []), payload.techId] } };
    context.replaceTileState(targetKey, next, command.commandId);
    changed.push(next);
  }
  context.emitEvent({ eventType: "TILE_DELTA_BATCH", commandId: command.commandId, playerId: actor.id, tileDeltas: changed.map((tile) => context.tileDeltaFromState(tile)) });
  context.emitPlayerStateUpdate(command);
};

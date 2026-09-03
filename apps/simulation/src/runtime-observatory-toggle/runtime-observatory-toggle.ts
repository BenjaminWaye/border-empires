/**
 * Aether Tower (Observatory) manual on/off switch — the Observatory twin of
 * handleSetConverterStructureEnabledCommand in
 * runtime-economic-structure-command-handlers.ts.
 *
 * Why it exists: an Observatory occupies CRYSTAL slots for as long as it
 * stands, and progressively more of them per tower owned
 * (applyObservatoryProgressiveCost in resource-slot-view.ts). Without a
 * toggle the only way out of that bill was demolishing the tower and eating
 * the build cost, while every economic structure could just be switched off.
 *
 * Disabling sets status "inactive", which every Observatory effect already
 * keys off: vision (runtime-observatory-vision.ts's isPresent), crystal
 * casting and Sky Dock powering (activeObservatoriesByOwner, maintained by
 * isObservatoryActive), and the CRYSTAL slot demand itself
 * (resource-slot-view.ts). Nothing else in the runtime writes "inactive" to
 * an observatory, so that status means "manually disabled" and needs no
 * inactiveReason discriminator the way economicStructure does (whose
 * "inactive" is also reachable from a gold-upkeep shutdown).
 */

import type { DomainTileState } from "@border-empires/game-domain";
import type { CommandEnvelope } from "@border-empires/sim-protocol";
import { parseConverterTogglePayload } from "../runtime-command-parsers.js";
import type { RuntimeEconomicStructureCommandContext } from "../runtime-economic-structure-command-handlers.js";
import { simulationTileKey } from "../seed-state/seed-state.js";

export function handleSetObservatoryEnabledCommand(
  context: RuntimeEconomicStructureCommandContext,
  command: CommandEnvelope
): void {
  const actor = context.players.get(command.playerId);
  const payload = parseConverterTogglePayload(command.payloadJson);
  if (!actor || !payload) { context.rejectCommand(command, "BAD_COMMAND", "invalid command payload"); return; }
  const targetKey = simulationTileKey(payload.x, payload.y);
  const target = context.tiles.get(targetKey);
  const observatory = target?.observatory;
  // Both the structure record AND the tile have to be yours: an abandoned tile
  // keeps its structures (abandonedStructureFields), and those records still
  // carry the former owner's id, so ownership of the land is what decides who
  // may switch a tower on or off.
  if (!target || !observatory || observatory.ownerId !== command.playerId || target.ownerId !== command.playerId) {
    context.rejectCommand(command, "OBSERVATORY_TOGGLE_INVALID", "no owned Aether Tower on tile"); return;
  }
  if (observatory.status !== "active" && observatory.status !== "inactive") {
    context.rejectCommand(command, "OBSERVATORY_TOGGLE_INVALID", "Aether Tower is not ready"); return;
  }
  // The Watchtower Engine's own tower is owned by the wonder, not the player:
  // syncWatchtowerObservatory (runtime-natural-wonders.ts) re-stamps it
  // "active" from tile ownership, so a toggle here would silently undo
  // itself. It costs no CRYSTAL either, so there is nothing to switch off.
  if (target.naturalWonder?.type === "WATCHTOWER_ENGINE") {
    context.rejectCommand(command, "OBSERVATORY_TOGGLE_INVALID", "the Watchtower Engine's tower cannot be switched off"); return;
  }
  if (payload.enabled && target.ownershipState !== "SETTLED") {
    context.rejectCommand(command, "OBSERVATORY_TOGGLE_INVALID", "Aether Tower requires settled owned tile"); return;
  }
  if ((observatory.status === "active") === payload.enabled) {
    // Already in the requested state — resolve without emitting a tile delta.
    context.emitEvent({ eventType: "COMMAND_RESOLVED", commandId: command.commandId, playerId: command.playerId });
    return;
  }

  const updatedTile: DomainTileState = {
    ...target,
    observatory: {
      ...observatory,
      status: payload.enabled ? "active" : "inactive",
      // Re-enabling re-dates the tower for the §5.4 dormancy tie-break and
      // the progressive CRYSTAL ladder (both order by activatedAt, earliest
      // first), so parking a tower off-line can't preserve a cheap slot in
      // the ladder while newer towers pay for it.
      ...(payload.enabled ? { activatedAt: context.now() } : {})
    }
  };
  context.replaceTileState(targetKey, updatedTile);
  context.emitEvent({
    eventType: "TILE_DELTA_BATCH",
    commandId: command.commandId,
    playerId: command.playerId,
    tileDeltas: [context.tileDeltaFromState(updatedTile)]
  });
  context.emitPlayerStateUpdate(command);
  context.emitEvent({ eventType: "COMMAND_RESOLVED", commandId: command.commandId, playerId: command.playerId });
}

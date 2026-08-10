import type { CommandEnvelope } from "@border-empires/sim-protocol";
import { TITANIUM_LEVY_MANPOWER_CONVERSION_RATIO, TITANIUM_LEVY_REGEN_FREEZE_MS } from "@border-empires/game-domain";
import { parseTitaniumLevyMusterPayload } from "./runtime-command-parsers.js";
import { simulationTileKey } from "./seed-state/seed-state.js";
import { rejectCommand, type RuntimeMapCommandContext } from "./runtime-map-command-handlers.js";

// Ability cooldown key used to gate the empire-wide manpower-regen freeze —
// read back by playerManpowerRegenPerMinute (runtime.ts) via the same
// getAbilityCooldownUntil store every other ability cooldown uses.
export const TITANIUM_LEVY_REGEN_FREEZE_KEY = "titanium_levy_regen_freeze";

// The Titanium Levy monument: converts TITANIUM_LEVY_MANPOWER_CONVERSION_RATIO
// (50%) of the caster's currently-banked manpower into an instant one-time
// army staged at the anchor tile (the same `muster` tile field SET_MUSTER
// commands use, so the army can be marched/attacked from immediately), then
// freezes the caster's empire-wide manpower regen for TITANIUM_LEVY_REGEN_FREEZE_MS.
//
// Split into its own file (not runtime-map-command-handlers.ts, already over
// the repo's 500-line soft cap — see scripts/check-file-line-limits.mjs),
// same pattern as runtime-imperial-exchange-levy-command.ts.
export function handleTitaniumLevyMusterCommand(context: RuntimeMapCommandContext, command: CommandEnvelope): void {
  const actor = context.players.get(command.playerId);
  const payload = parseTitaniumLevyMusterPayload(command.payloadJson);
  if (!actor || !payload) {
    rejectCommand(context, command, "BAD_COMMAND", "invalid command payload");
    return;
  }
  const anchorKey = simulationTileKey(payload.fromX, payload.fromY);
  const anchor = context.tiles.get(anchorKey);
  if (
    !anchor ||
    anchor.ownerId !== actor.id ||
    anchor.economicStructure?.ownerId !== actor.id ||
    anchor.economicStructure.type !== "TITANIUM_LEVY" ||
    anchor.economicStructure.status !== "active"
  ) {
    rejectCommand(context, command, "TITANIUM_LEVY_MUSTER_INVALID", "select an active Titanium Levy");
    return;
  }
  if (!context.isStructurePowered(actor.id, anchorKey, "TITANIUM_LEVY")) {
    rejectCommand(context, command, "TITANIUM_LEVY_MUSTER_INVALID", "Titanium Levy requires a nearby Aether Tower");
    return;
  }
  if (context.isStructureDormant(actor.id, anchorKey, "economicStructure")) {
    rejectCommand(context, command, "TITANIUM_LEVY_MUSTER_INVALID", "Titanium Levy has no free resource slot");
    return;
  }
  const now = context.now();
  if (context.getAbilityCooldownUntil(actor.id, TITANIUM_LEVY_REGEN_FREEZE_KEY) > now) {
    rejectCommand(context, command, "TITANIUM_LEVY_MUSTER_INVALID", "manpower regen is still frozen from the last levy");
    return;
  }
  const convertedManpower = Math.floor(Math.max(0, actor.manpower) * TITANIUM_LEVY_MANPOWER_CONVERSION_RATIO);
  if (convertedManpower <= 0) {
    rejectCommand(context, command, "TITANIUM_LEVY_MUSTER_INVALID", "not enough banked manpower to levy");
    return;
  }
  actor.manpower = Math.max(0, actor.manpower - convertedManpower);
  const updatedAnchor = {
    ...anchor,
    muster: {
      ownerId: actor.id,
      amount: (anchor.muster?.ownerId === actor.id ? anchor.muster.amount : 0) + convertedManpower,
      mode: "HOLD" as const,
      setAt: (anchor.muster?.ownerId === actor.id ? anchor.muster.setAt : undefined) ?? now,
      updatedAt: now
    }
  };
  context.replaceTileState(anchorKey, updatedAnchor, command.commandId);
  context.setAbilityCooldownUntil(actor.id, TITANIUM_LEVY_REGEN_FREEZE_KEY, now + TITANIUM_LEVY_REGEN_FREEZE_MS);
  context.emitEvent({
    eventType: "TILE_DELTA_BATCH",
    commandId: command.commandId,
    playerId: command.playerId,
    tileDeltas: [context.tileDeltaFromState(updatedAnchor)]
  });
  context.emitEvent({ eventType: "COMMAND_RESOLVED", commandId: command.commandId, playerId: command.playerId });
}

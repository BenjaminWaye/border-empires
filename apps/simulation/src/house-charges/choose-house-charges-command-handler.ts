// CHOOSE_HOUSE_CHARGES: a House picks which of its offered charges to keep,
// within a day of the deal (shared houseChargeChoiceError). The new kept
// charges are evaluated at once and the House gets its updated
// HOUSE_CHARGES list straight away.
import type { CommandEnvelope } from "@border-empires/sim-protocol";
import { houseChargeChoiceError } from "@border-empires/shared";
import { rejectCommand, type RuntimeMapCommandContext } from "../runtime-map-command-handlers.js";
import { refreshPlayerHouseCharges } from "./house-charges-ticker.js";
import { houseChargesPayloadFor } from "./house-charges-view.js";

export function handleChooseHouseChargesCommand(context: RuntimeMapCommandContext, command: CommandEnvelope): void {
  const actor = context.players.get(command.playerId);
  if (!actor) {
    rejectCommand(context, command, "UNKNOWN_PLAYER", "player not found");
    return;
  }
  let payload: { keptIds?: unknown } | undefined;
  try {
    payload = JSON.parse(command.payloadJson) as typeof payload;
  } catch {
    payload = undefined;
  }
  const keptIds = payload?.keptIds;
  if (!Array.isArray(keptIds) || !keptIds.every((id): id is string => typeof id === "string")) {
    rejectCommand(context, command, "BAD_COMMAND", "invalid House Charges choice");
    return;
  }
  const state = actor.houseCharges;
  if (!state) {
    rejectCommand(context, command, "HOUSE_CHARGES_NOT_DEALT", "your House has no charges yet");
    return;
  }
  const error = houseChargeChoiceError(state, keptIds, context.now());
  if (error) {
    rejectCommand(context, command, "HOUSE_CHARGES_CHOICE_INVALID", error);
    return;
  }
  // Keep offer order so the panel lists kept charges in a stable order.
  state.keptIds = state.offered.map((charge) => charge.id).filter((id) => keptIds.includes(id));
  if (state.completeSince) {
    for (const id of Object.keys(state.completeSince)) if (!state.keptIds.includes(id)) delete state.completeSince[id];
  }
  refreshPlayerHouseCharges(actor, context.tiles, context.players, context.now());
  const view = houseChargesPayloadFor(actor, context.tiles);
  if (view) context.emitPlayerMessage(command, view);
  context.emitEvent({ eventType: "COMMAND_RESOLVED", commandId: command.commandId, playerId: command.playerId });
}

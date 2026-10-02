import type { CommandEnvelope } from "@border-empires/sim-protocol";
import { isAutoSettlePrefsValue } from "@border-empires/shared";
import { rejectCommand, type RuntimeMapCommandContext } from "./runtime-map-command-handlers.js";

// SET_AUTO_SETTLE_PREFS: the join prompt / settings toggles. Replaces the
// player's per-category auto-settle opt-in and marks the prompt answered
// ("Not now" is just this command with everything false). Newly-allowed
// categories start settling immediately by draining the queue the eligibility
// module kept filling while they were off.
export function handleSetAutoSettlePrefsCommand(context: RuntimeMapCommandContext, command: CommandEnvelope): void {
  const actor = context.players.get(command.playerId);
  if (!actor) {
    rejectCommand(context, command, "UNKNOWN_PLAYER", "player not found");
    return;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(command.payloadJson);
  } catch {
    parsed = undefined;
  }
  if (!isAutoSettlePrefsValue(parsed)) {
    rejectCommand(context, command, "BAD_COMMAND", "invalid auto-settle preferences");
    return;
  }
  actor.autoSettle = { answered: true, towns: parsed.towns, food: parsed.food, resources: parsed.resources };
  context.emitPlayerMessage(command, { type: "PLAYER_UPDATE", autoSettle: actor.autoSettle });
  context.emitEvent({ eventType: "COMMAND_RESOLVED", commandId: command.commandId, playerId: command.playerId });
  context.drainAutoSettleForOwner?.(actor.id);
}

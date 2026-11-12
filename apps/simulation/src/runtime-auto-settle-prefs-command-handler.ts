import type { CommandEnvelope } from "@border-empires/sim-protocol";
import { AUTO_SETTLE_CATEGORIES, NO_AUTO_IMPROVE, parseAutoImprovePrefs, parseAutoSettleCategoryPrefs } from "@border-empires/shared";
import { rejectCommand, type RuntimeMapCommandContext } from "./runtime-map-command-handlers.js";

// SET_AUTO_SETTLE_PREFS: the join prompt / settings toggles. Replaces the
// player's per-category auto-settle opt-in and marks the prompt answered
// ("Not now" is just this command with everything false). Queued tiles in a
// category switched off are dropped; switching a category on rescans the
// frontier (tiles in an off category are never queued) and starts settling
// right away. The O(frontier) rescan only runs on an off->on change. An
// optional `improve` object sets the auto-improve switches too.
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
  const categories = parseAutoSettleCategoryPrefs(parsed);
  if (!categories) {
    rejectCommand(context, command, "BAD_COMMAND", "invalid auto-garrison preferences");
    return;
  }
  const sentImprove = (parsed as { improve?: unknown }).improve;
  const improve = sentImprove === undefined ? undefined : parseAutoImprovePrefs(sentImprove);
  if (sentImprove !== undefined && !improve) {
    rejectCommand(context, command, "BAD_COMMAND", "invalid auto-improve preferences");
    return;
  }
  const previous = actor.autoSettle;
  const switchedOn = AUTO_SETTLE_CATEGORIES.some((category) => categories[category] && !previous?.[category]);
  // Auto-improve switches ride along when sent; otherwise the stored ones stay. The next
  // territory-automation tick picks up a switch turned on (runtime-auto-improve.ts).
  actor.autoSettle = { answered: true, ...categories, improve: improve ?? { ...(previous?.improve ?? NO_AUTO_IMPROVE) } };
  context.emitPlayerMessage(command, { type: "PLAYER_UPDATE", autoSettle: actor.autoSettle });
  context.emitEvent({ eventType: "COMMAND_RESOLVED", commandId: command.commandId, playerId: command.playerId });
  context.onAutoSettlePrefsChanged?.(actor.id, switchedOn);
}

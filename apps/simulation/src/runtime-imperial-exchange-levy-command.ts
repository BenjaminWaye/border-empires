import type { CommandEnvelope } from "@border-empires/sim-protocol";
import { IMPERIAL_EXCHANGE_LEVY_COOLDOWN_MS } from "@border-empires/game-domain";
import { parseImperialExchangeLevyPayload } from "./runtime-command-parsers.js";
import { simulationTileKey } from "./seed-state/seed-state.js";
import { rejectCommand, type RuntimeMapCommandContext } from "./runtime-map-command-handlers.js";

// §15: Imperial Exchange Levy, finalized design. Single target chosen by the
// caster (payload.toX/toY identifies a rival-owned tile, same origin->target
// shape as World Engine Strike/Airport Bombard), takes 100% of the target's
// GOLD (not a strategic-resource stockpile — those no longer exist as
// spendable quantities under the resource-slots pillar, §5), 24hr cooldown,
// free activation (§17 — no CRYSTAL cost). The offline notification is the
// important part: the target sees what happened next time they log in via
// the same PLAYER_MESSAGE plumbing shard rain already uses, just addressed
// to the target's playerId instead of the caster's.
//
// Split out of runtime-map-command-handlers.ts (already over the repo's
// 500-line soft cap) so this rewrite doesn't grow that file further — see
// scripts/check-file-line-limits.mjs.
export function handleImperialExchangeLevyCommand(context: RuntimeMapCommandContext, command: CommandEnvelope): void {
  const actor = context.players.get(command.playerId);
  const payload = parseImperialExchangeLevyPayload(command.payloadJson);
  if (!actor || !payload) {
    rejectCommand(context, command, "BAD_COMMAND", "invalid command payload");
    return;
  }
  const tileKey = simulationTileKey(payload.fromX, payload.fromY);
  const tile = context.tiles.get(tileKey);
  if (
    !tile ||
    tile.ownerId !== actor.id ||
    tile.economicStructure?.ownerId !== actor.id ||
    tile.economicStructure.type !== "IMPERIAL_EXCHANGE" ||
    tile.economicStructure.status !== "active"
  ) {
    rejectCommand(context, command, "IMPERIAL_EXCHANGE_LEVY_INVALID", "select an active Imperial Exchange");
    return;
  }
  // Exchange Levy Writs (tech "exchange-levy") was cut — the levy ability is
  // now inherent to the Imperial Exchange monument itself, gated only by
  // owning an active, powered monument (checked above/below).
  if (!context.isStructurePowered(actor.id, tileKey, "IMPERIAL_EXCHANGE")) {
    rejectCommand(context, command, "IMPERIAL_EXCHANGE_LEVY_INVALID", "Imperial Exchange requires a nearby Aether Tower");
    return;
  }
  if (context.isStructureDormant(actor.id, tileKey, "economicStructure")) {
    rejectCommand(context, command, "IMPERIAL_EXCHANGE_LEVY_INVALID", "Imperial Exchange has no free resource slot");
    return;
  }
  const targetTile = context.tiles.get(simulationTileKey(payload.toX, payload.toY));
  const target = targetTile?.ownerId ? context.players.get(targetTile.ownerId) : undefined;
  if (!target || target.id === actor.id || actor.allies.has(target.id) || actor.truces?.has(target.id)) {
    rejectCommand(context, command, "IMPERIAL_EXCHANGE_LEVY_INVALID", "select a valid rival target");
    return;
  }
  const now = context.now();
  if (context.getAbilityCooldownUntil(actor.id, "imperial_exchange_levy") > now) {
    rejectCommand(context, command, "IMPERIAL_EXCHANGE_LEVY_INVALID", "ability on cooldown");
    return;
  }
  const goldTaken = Math.max(0, Math.floor(target.points));
  if (goldTaken > 0) {
    target.points -= goldTaken;
    actor.points += goldTaken;
  }
  context.setAbilityCooldownUntil(actor.id, "imperial_exchange_levy", now + IMPERIAL_EXCHANGE_LEVY_COOLDOWN_MS);
  context.emitEvent({
    eventType: "PLAYER_MESSAGE",
    commandId: command.commandId,
    playerId: target.id,
    messageType: "IMPERIAL_EXCHANGE_LEVY_EVENT",
    payloadJson: JSON.stringify({ type: "IMPERIAL_EXCHANGE_LEVY_EVENT", byPlayerId: actor.id, byPlayerName: actor.name, goldLost: goldTaken })
  });
  // §20: both sides of the interaction get their own durable log entry —
  // the victim's is the important one (the offline PLAYER_MESSAGE above
  // covers the live-toast case, but this is what they see if they log in
  // hours later and never caught that toast); the caster's is a milder
  // confirmation entry, per the plan's own event-log design.
  context.appendPlayerEventLogEntry(target, {
    type: "IMPERIAL_EXCHANGE_LEVY_HIT",
    text: `You were hit by an Imperial Exchange Levy by ${actor.name ?? actor.id} — lost ${goldTaken} gold.`,
    occurredAt: now,
    x: payload.toX,
    y: payload.toY
  });
  context.appendPlayerEventLogEntry(actor, {
    type: "IMPERIAL_EXCHANGE_LEVY_CAST",
    text: `You levied ${target.name ?? target.id} for ${goldTaken} gold.`,
    occurredAt: now,
    x: payload.fromX,
    y: payload.fromY
  });
  context.emitEvent({ eventType: "COMMAND_RESOLVED", commandId: command.commandId, playerId: command.playerId });
}

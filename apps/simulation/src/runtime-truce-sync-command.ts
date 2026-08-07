import type { CommandEnvelope, SimulationEvent } from "@border-empires/sim-protocol";
import type { DomainPlayer } from "@border-empires/game-domain";
import { parseTruceSyncPayload } from "./runtime-command-parsers.js";

export type RuntimeTruceSyncCommandContext = {
  players: Map<string, DomainPlayer>;
  emitEvent: (event: SimulationEvent) => void;
  emitPlayerMessage: (command: Pick<CommandEnvelope, "commandId" | "playerId">, payload: Record<string, unknown>) => void;
};

// Truces don't grant shared vision (unlike alliances via
// visibilityCoverage.syncAllianceChange) — this only gates combat/observatory
// actions server-side (see isAlliedOrTruced in runtime-player-factory.ts).
export function handleSyncTruceCommand(context: RuntimeTruceSyncCommandContext, command: CommandEnvelope): void {
  const actor = context.players.get(command.playerId);
  const payload = parseTruceSyncPayload(command.payloadJson);
  const target = payload ? context.players.get(payload.targetPlayerId) : undefined;
  if (!actor || !payload || !target || target.id === actor.id) {
    context.emitEvent({
      eventType: "COMMAND_REJECTED",
      commandId: command.commandId,
      playerId: command.playerId,
      code: "BAD_COMMAND",
      message: "invalid truce sync payload"
    });
    return;
  }

  if (payload.truced) {
    (actor.truces ??= new Set<string>()).add(target.id);
    (target.truces ??= new Set<string>()).add(actor.id);
  } else {
    actor.truces?.delete(target.id);
    target.truces?.delete(actor.id);
  }

  context.emitPlayerMessage(
    { commandId: command.commandId, playerId: actor.id },
    { type: "SOCIAL_STATE_SYNCED", playerId: actor.id, targetPlayerId: target.id, truced: payload.truced }
  );
  context.emitEvent({ eventType: "COMMAND_RESOLVED", commandId: command.commandId, playerId: command.playerId });
}

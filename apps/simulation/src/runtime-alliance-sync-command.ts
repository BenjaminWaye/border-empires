import type { CommandEnvelope, SimulationEvent } from "@border-empires/sim-protocol";
import type { DomainPlayer } from "@border-empires/game-domain";
import { parseAllianceSyncPayload } from "./runtime-command-parsers.js";
import type { VisibilityCoverageTracker, VisibilityTransitionCallbacks } from "./visibility-coverage-cache.js";

export type RuntimeAllianceSyncCommandContext = {
  players: Map<string, DomainPlayer>;
  visibilityCoverage: VisibilityCoverageTracker;
  visionTransitionCallbacks: VisibilityTransitionCallbacks;
  emitEvent: (event: SimulationEvent) => void;
  emitPlayerMessage: (command: Pick<CommandEnvelope, "commandId" | "playerId">, payload: Record<string, unknown>) => void;
};

export function handleSyncAllianceCommand(context: RuntimeAllianceSyncCommandContext, command: CommandEnvelope): void {
  const actor = context.players.get(command.playerId);
  const payload = parseAllianceSyncPayload(command.payloadJson);
  const target = payload ? context.players.get(payload.targetPlayerId) : undefined;
  if (!actor || !payload || !target || target.id === actor.id) {
    context.emitEvent({
      eventType: "COMMAND_REJECTED",
      commandId: command.commandId,
      playerId: command.playerId,
      code: "BAD_COMMAND",
      message: "invalid alliance sync payload"
    });
    return;
  }

  const wasAllied = actor.allies.has(target.id); // SYNC_ALLIANCE skips clientSeq dedup; syncAllianceChange isn't idempotent like allies.add/delete.
  if (payload.allied) {
    actor.allies.add(target.id);
    target.allies.add(actor.id);
  } else {
    actor.allies.delete(target.id);
    target.allies.delete(actor.id);
  }
  if (wasAllied !== payload.allied) {
    context.visibilityCoverage.syncAllianceChange(actor.id, target.id, payload.allied, context.visionTransitionCallbacks);
    // syncAllianceChange only records vision transitions; it doesn't mutate
    // any tile itself. Those transitions are only ever drained by
    // simulation-service.ts's TILE_DELTA_BATCH handler, so without an event
    // here, allying/unallying grants or revokes vision over the other
    // player's whole territory but the reveal/fog delta for those tiles
    // silently waits on the next UNRELATED tile mutation anywhere in the
    // world to happen to fire a TILE_DELTA_BATCH and drain it -- on a quiet
    // shard that can take a long time, during which an ally's (or ex-ally's)
    // already-built structures just don't appear on (or fog on) the map. An
    // empty tileDeltas batch is enough: the fanout loop drains vision
    // transitions for every subscribed player on every TILE_DELTA_BATCH,
    // regardless of what (if anything) the batch's own tileDeltas contain.
    context.emitEvent({ eventType: "TILE_DELTA_BATCH", commandId: command.commandId, playerId: actor.id, tileDeltas: [] });
  }

  context.emitPlayerMessage(
    { commandId: command.commandId, playerId: actor.id },
    { type: "SOCIAL_STATE_SYNCED", playerId: actor.id, targetPlayerId: target.id, allied: payload.allied }
  );
  context.emitEvent({ eventType: "COMMAND_RESOLVED", commandId: command.commandId, playerId: command.playerId });
}

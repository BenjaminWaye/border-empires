import type { CommandEnvelope, SimulationEvent } from "@border-empires/sim-protocol";
import type { DomainPlayer } from "@border-empires/game-domain";
import { parseTruceSyncPayload } from "./runtime-command-parsers.js";

/** Records (or clears) when a player's truce with partnerId ends; drops the map once empty. */
export const setTruceEndsAt = (player: Pick<DomainPlayer, "truceEndsAt">, partnerId: string, endsAt: number | undefined): void => {
  if (endsAt === undefined) {
    player.truceEndsAt?.delete(partnerId);
    if (player.truceEndsAt?.size === 0) delete player.truceEndsAt;
  } else (player.truceEndsAt ??= new Map<string, number>()).set(partnerId, endsAt);
};

export type RuntimeTruceSyncCommandContext = {
  players: Map<string, DomainPlayer>;
  emitEvent: (event: SimulationEvent) => void;
  emitPlayerMessage: (command: Pick<CommandEnvelope, "commandId" | "playerId">, payload: Record<string, unknown>) => void;
  // Envoy Accreditation pays per active truce: settle income at the old rate first, then refresh the HUD.
  settleEconomy?: (at: number, playerIds: readonly string[]) => void;
  emitEconomyUpdate?: (command: CommandEnvelope, playerId: string) => void;
  now?: () => number;
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

  const changed = Boolean(actor.truces?.has(target.id)) !== payload.truced;
  if (changed) context.settleEconomy?.(context.now?.() ?? Date.now(), [actor.id, target.id]);
  if (payload.truced) {
    (actor.truces ??= new Set<string>()).add(target.id);
    (target.truces ??= new Set<string>()).add(actor.id);
  } else {
    actor.truces?.delete(target.id);
    target.truces?.delete(actor.id);
  }
  setTruceEndsAt(actor, target.id, payload.truced ? payload.endsAt : undefined);
  setTruceEndsAt(target, actor.id, payload.truced ? payload.endsAt : undefined);

  if (changed) for (const player of [actor, target]) if (!player.isAi) context.emitEconomyUpdate?.(command, player.id);
  context.emitPlayerMessage(
    { commandId: command.commandId, playerId: actor.id },
    // endsAt rides along so event recovery (event-recovery-diplomacy.ts) restores it after a restart.
    { type: "SOCIAL_STATE_SYNCED", playerId: actor.id, targetPlayerId: target.id, truced: payload.truced, ...(payload.truced && payload.endsAt !== undefined ? { endsAt: payload.endsAt } : {}) }
  );
  context.emitEvent({ eventType: "COMMAND_RESOLVED", commandId: command.commandId, playerId: command.playerId });
}

import type { CommandEnvelope, SimulationEvent } from "@border-empires/sim-protocol";
import type { DomainPlayer } from "@border-empires/game-domain";
import { MANPOWER_EPSILON, SHARD_MOBILIZE_SHARD_COST } from "@border-empires/shared";
import { TITANIUM_LEVY_REGEN_FREEZE_KEY } from "../runtime-titanium-levy-command.js";
import type { StrategicResourceKey } from "../runtime-types.js";

export const SHARD_MOBILIZE_INVALID = "SHARD_MOBILIZE_INVALID";

export interface ShardMobilizeCommandContext {
  readonly players: ReadonlyMap<string, DomainPlayer>;
  now(): number;
  /** Brings the player's economy and manpower up to `now` so the cap and pool are current before the refill. */
  settleManpower(player: DomainPlayer): void;
  playerManpowerCap(player: DomainPlayer): number;
  getAbilityCooldownUntil(playerId: string, abilityKey: string): number;
  spendStrategicResource(player: DomainPlayer, resource: StrategicResourceKey, amount: number): boolean;
  invalidateEconomySnapshot(playerId: string): void;
  emitEvent(event: SimulationEvent): void;
  emitPlayerStateUpdate(command: Pick<CommandEnvelope, "commandId" | "playerId">): void;
}

const reject = (context: ShardMobilizeCommandContext, command: CommandEnvelope, code: string, message: string): void => {
  context.emitEvent({ eventType: "COMMAND_REJECTED", commandId: command.commandId, playerId: command.playerId, code, message });
};

// SHARD_MOBILIZE (player-facing: Imperial delivery): spends
// SHARD_MOBILIZE_SHARD_COST Shards, donated to the Court, to refill the
// caster's manpower to the cap at once (see packages/shared/src/shard-mobilize.ts).
// No anchor tile: it is a per-player action, like ACTIVATE_IMPERIAL_WARD.
export function handleShardMobilizeCommand(context: ShardMobilizeCommandContext, command: CommandEnvelope): void {
  const actor = context.players.get(command.playerId);
  if (!actor) {
    reject(context, command, "UNKNOWN_PLAYER", "player not found");
    return;
  }
  // The Titanium Levy turns half the pool into an army *because* regen is
  // frozen afterwards; refilling through the freeze would make it free.
  if (context.getAbilityCooldownUntil(actor.id, TITANIUM_LEVY_REGEN_FREEZE_KEY) > context.now()) {
    reject(context, command, SHARD_MOBILIZE_INVALID, "manpower is frozen by your Titanium Levy");
    return;
  }
  context.settleManpower(actor);
  const cap = context.playerManpowerCap(actor);
  if (actor.manpower + MANPOWER_EPSILON >= cap) {
    reject(context, command, SHARD_MOBILIZE_INVALID, "manpower is already full");
    return;
  }
  if (!context.spendStrategicResource(actor, "SHARD", SHARD_MOBILIZE_SHARD_COST)) {
    reject(context, command, SHARD_MOBILIZE_INVALID, `needs ${SHARD_MOBILIZE_SHARD_COST} Shard`);
    return;
  }
  actor.manpower = cap;
  // The bank only holds regen still owed below the cap; a full pool owes none.
  delete actor.manpowerBanked;
  context.invalidateEconomySnapshot(actor.id);
  context.emitPlayerStateUpdate(command);
  context.emitEvent({ eventType: "COMMAND_RESOLVED", commandId: command.commandId, playerId: command.playerId });
}

import type { CommandEnvelope } from "@border-empires/sim-protocol";
import { MANPOWER_EPSILON, SHARD_MOBILIZE_SHARD_COST } from "@border-empires/shared";
import { TITANIUM_LEVY_REGEN_FREEZE_KEY } from "../runtime-titanium-levy-command.js";
import type { RuntimeProgressionCommandContext } from "../runtime-progression-command-handlers.js";
import type { DomainPlayer } from "@border-empires/game-domain";
import type { StrategicResourceKey } from "../runtime-types.js";

export const SHARD_MOBILIZE_INVALID = "SHARD_MOBILIZE_INVALID";

/**
 * The progression context (players, settle, caches, events) plus the
 * manpower, cooldown and Shard-spend accessors only Mobilization needs.
 */
export type ShardMobilizeCommandContext = Pick<
  RuntimeProgressionCommandContext,
  "players" | "invalidateEconomySnapshot" | "emitEvent" | "emitPlayerStateUpdate"
> &
  Required<Pick<RuntimeProgressionCommandContext, "now" | "settleEconomyBeforeUpgrade">> & {
  playerManpowerCap(player: DomainPlayer): number;
  getAbilityCooldownUntil(playerId: string, abilityKey: string): number;
  spendStrategicResource(player: DomainPlayer, resource: StrategicResourceKey, amount: number): boolean;
  emitPlayerMessage(command: Pick<CommandEnvelope, "commandId" | "playerId">, payload: { type: "SHARD_MOBILIZED"; delivered: number }): void;
};

type ShardMobilizeAccessors = Pick<
  ShardMobilizeCommandContext,
  "playerManpowerCap" | "getAbilityCooldownUntil" | "spendStrategicResource" | "emitPlayerMessage"
>;

/** Builds the context from the runtime's progression context, which must carry `now` and the economy settle. */
export const buildShardMobilizeCommandContext = (
  progression: RuntimeProgressionCommandContext,
  accessors: ShardMobilizeAccessors
): ShardMobilizeCommandContext => {
  const { now, settleEconomyBeforeUpgrade } = progression;
  if (!now || !settleEconomyBeforeUpgrade) throw new Error("SHARD_MOBILIZE needs a progression context with now and settleEconomyBeforeUpgrade");
  return { ...progression, now, settleEconomyBeforeUpgrade, ...accessors };
};

const reject = (context: ShardMobilizeCommandContext, command: CommandEnvelope, code: string, message: string): void => {
  context.emitEvent({ eventType: "COMMAND_REJECTED", commandId: command.commandId, playerId: command.playerId, code, message });
};

// SHARD_MOBILIZE: donates SHARD_MOBILIZE_SHARD_COST Shards to the Court for an
// Imperial delivery that refills the caster's manpower to the cap at once (see packages/shared/src/shard-mobilize.ts).
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
  context.settleEconomyBeforeUpgrade(actor);
  const cap = context.playerManpowerCap(actor);
  if (actor.manpower + MANPOWER_EPSILON >= cap) {
    reject(context, command, SHARD_MOBILIZE_INVALID, "manpower is already full");
    return;
  }
  if (!context.spendStrategicResource(actor, "SHARD", SHARD_MOBILIZE_SHARD_COST)) {
    reject(context, command, SHARD_MOBILIZE_INVALID, `needs ${SHARD_MOBILIZE_SHARD_COST} Shard`);
    return;
  }
  const delivered = Math.floor(cap - actor.manpower);
  actor.manpower = cap;
  // The bank only holds regen still owed below the cap; a full pool owes none.
  delete actor.manpowerBanked;
  context.invalidateEconomySnapshot(actor.id);
  context.emitPlayerStateUpdate(command);
  // One-off confirmation so the client can announce the Imperial delivery;
  // the new pool and Shard count arrive through the player update above.
  context.emitPlayerMessage(command, { type: "SHARD_MOBILIZED", delivered });
  context.emitEvent({ eventType: "COMMAND_RESOLVED", commandId: command.commandId, playerId: command.playerId });
}

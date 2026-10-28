import { DiplomacySettlementPayloadSchema, type DiplomacySettlementPayload } from "@border-empires/sim-protocol";
import { hasResourceSupplyOffer, type DiplomacyGoods, type ResourceSupplyAgreement } from "@border-empires/shared";
import type { SupplyLedgerResult } from "./resource-supply-trades/resource-supply-ledger.js";
import type { DomainPlayer } from "@border-empires/game-domain";
import type { CommandEnvelope, SimulationEvent } from "@border-empires/sim-protocol";

// SETTLE_DIPLOMACY_TERMS: moves the coin/Shards a truce or alliance deal
// promised, in one step, before the gateway records the agreement. The
// gateway waits for this command's COMMAND_RESOLVED / COMMAND_REJECTED, so
// the simulation stays the authority on whether both sides could pay.

export type RuntimeDiplomacySettlementContext = {
  players: Map<string, DomainPlayer>;
  now?: () => number;
  emitEconomyUpdate?: (command: CommandEnvelope, playerId: string) => void;
  settleEconomy?: (at: number, playerIds: readonly string[]) => void;
  resourceSupply?: {
    readonly create: (agreement: ResourceSupplyAgreement) => SupplyLedgerResult;
    readonly cancel?: (id:string, actorId:string) => SupplyLedgerResult;
    readonly cancelRefunded: (id: string, proposerId: string, targetId: string) => void;
  };
  emitEvent: (event: SimulationEvent) => void;
  emitPlayerMessage: (command: Pick<CommandEnvelope, "commandId" | "playerId">, payload: Record<string, unknown>) => void;
};

type Goods = DiplomacyGoods;
export const parseDiplomacySettlementPayload = (payloadJson: string): DiplomacySettlementPayload | undefined => {
  try {
    const parsed = DiplomacySettlementPayloadSchema.safeParse(JSON.parse(payloadJson));
    return parsed.success ? parsed.data : undefined;
  } catch { return undefined; }
};

const shardsOf = (player: DomainPlayer): number => player.strategicResources?.SHARD ?? 0;

const missingFor = (player: DomainPlayer, pays: Goods): string | undefined => {
  const parts: string[] = [];
  if (player.points < pays.gold) parts.push(`${pays.gold} coin`);
  if (shardsOf(player) < pays.shard) parts.push(`${pays.shard} Shards`);
  return parts.length > 0 ? `${player.name ?? player.id} no longer has ${parts.join(" and ")}` : undefined;
};

const transfer = (from: DomainPlayer, to: DomainPlayer, goods: Goods): void => {
  from.points -= goods.gold;
  to.points += goods.gold;
  if (goods.shard > 0) {
    from.strategicResources = { ...(from.strategicResources ?? {}), SHARD: shardsOf(from) - goods.shard };
    to.strategicResources = { ...(to.strategicResources ?? {}), SHARD: shardsOf(to) + goods.shard };
  }
};

export function handleDiplomacySettlementCommand(context: RuntimeDiplomacySettlementContext, command: CommandEnvelope): void {
  const reject = (code: string, message: string): void =>
    context.emitEvent({ eventType: "COMMAND_REJECTED", commandId: command.commandId, playerId: command.playerId, code, message });
  const payload = parseDiplomacySettlementPayload(command.payloadJson);
  if (!payload) return reject("BAD_COMMAND", "invalid diplomacy settlement payload");
  const proposer = context.players.get(payload.proposerId);
  const target = context.players.get(payload.targetId);
  if (!proposer || !target) return reject("DIPLOMACY_SETTLEMENT_PLAYER", "a player in this deal no longer exists");
  const at = context.now?.() ?? Date.now();
  context.settleEconomy?.(at, [proposer.id, target.id]);
  const supplies = hasResourceSupplyOffer(payload.proposerPays.resources) || hasResourceSupplyOffer(payload.targetPays.resources);
  if (supplies && !context.resourceSupply) return reject("RESOURCE_TRADING_UNAVAILABLE", "Resource trading is unavailable in this world.");
  // A failed gateway agreement must release its original supply promise, even
  // if an already-spent currency payment requires separate recovery.
  if (payload.refundOf && supplies) context.resourceSupply!.cancelRefunded(payload.refundOf, proposer.id, target.id);
  // Validate both sides before moving anything, so a deal never half-applies.
  const missing = missingFor(proposer, payload.proposerPays) ?? missingFor(target, payload.targetPays);
  if (missing) return reject("DIPLOMACY_SETTLEMENT_INSUFFICIENT", missing);

  if (supplies && !payload.refundOf) {
    const result = context.resourceSupply!.create({
      id: command.commandId, proposerId: proposer.id, targetId: target.id,
      proposerGives: payload.proposerPays.resources ?? {}, targetGives: payload.targetPays.resources ?? {},
      startedAt: at
    });
    if (!result.ok) return reject("DIPLOMACY_SETTLEMENT_RESOURCE_SUPPLY", result.message);
  }
  transfer(proposer, target, payload.proposerPays);
  transfer(target, proposer, payload.targetPays);
  for (const player of [proposer, target]) {
    context.emitEconomyUpdate?.(command, player.id);
    context.emitPlayerMessage(
      { commandId: command.commandId, playerId: player.id },
      { type: "PLAYER_UPDATE", points: player.points, strategicResources: player.strategicResources }
    );
  }
  context.emitEvent({ eventType: "COMMAND_RESOLVED", commandId: command.commandId, playerId: command.playerId });
}

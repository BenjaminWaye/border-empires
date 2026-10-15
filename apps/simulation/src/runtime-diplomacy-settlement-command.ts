import type { DomainPlayer } from "@border-empires/game-domain";
import type { CommandEnvelope, SimulationEvent } from "@border-empires/sim-protocol";

// SETTLE_DIPLOMACY_TERMS: moves the coin/Shards a truce or alliance deal
// promised, in one step, before the gateway records the agreement. The
// gateway waits for this command's COMMAND_RESOLVED / COMMAND_REJECTED, so
// the simulation stays the authority on whether both sides could pay.

export type RuntimeDiplomacySettlementContext = {
  players: Map<string, DomainPlayer>;
  emitEvent: (event: SimulationEvent) => void;
  emitPlayerMessage: (command: Pick<CommandEnvelope, "commandId" | "playerId">, payload: Record<string, unknown>) => void;
};

type Goods = { gold: number; shard: number };
type SettlementPayload = { proposerId: string; targetId: string; proposerPays: Goods; targetPays: Goods };

const MAX_AMOUNT = 1_000_000;

const parseGoods = (value: unknown): Goods | undefined => {
  if (!value || typeof value !== "object") return undefined;
  const { gold, shard } = value as { gold?: unknown; shard?: unknown };
  const valid = (amount: unknown): amount is number => typeof amount === "number" && Number.isInteger(amount) && amount >= 0 && amount <= MAX_AMOUNT;
  return valid(gold) && valid(shard) ? { gold, shard } : undefined;
};

export const parseDiplomacySettlementPayload = (payloadJson: string): SettlementPayload | undefined => {
  try {
    const raw = JSON.parse(payloadJson) as Record<string, unknown>;
    const proposerPays = parseGoods(raw.proposerPays);
    const targetPays = parseGoods(raw.targetPays);
    if (typeof raw.proposerId !== "string" || typeof raw.targetId !== "string" || !proposerPays || !targetPays) return undefined;
    if (raw.proposerId === raw.targetId) return undefined;
    return { proposerId: raw.proposerId, targetId: raw.targetId, proposerPays, targetPays };
  } catch {
    return undefined;
  }
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
  // Validate both sides before moving anything, so a deal never half-applies.
  const missing = missingFor(proposer, payload.proposerPays) ?? missingFor(target, payload.targetPays);
  if (missing) return reject("DIPLOMACY_SETTLEMENT_INSUFFICIENT", missing);

  transfer(proposer, target, payload.proposerPays);
  transfer(target, proposer, payload.targetPays);
  for (const player of [proposer, target]) {
    context.emitPlayerMessage(
      { commandId: command.commandId, playerId: player.id },
      { type: "PLAYER_UPDATE", points: player.points, strategicResources: player.strategicResources }
    );
  }
  context.emitEvent({ eventType: "COMMAND_RESOLVED", commandId: command.commandId, playerId: command.playerId });
}

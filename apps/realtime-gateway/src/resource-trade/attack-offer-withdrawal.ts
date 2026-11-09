// Attacking a House ends every resource supply trade between the two (the
// simulation cancels the agreements when the ATTACK is accepted). Pending
// independent offers between the pair go too, so neither side can accept a
// peacetime supply deal in the middle of the fight.
import { combatFromSimulationEvent } from "../ai-diplomacy-memory/ai-diplomacy-memory.js";

export type AttackPairEvent = Parameters<typeof combatFromSimulationEvent>[0] & { actionType?: string };
export type AttackPair = { attackerId: string; defenderId: string };

/** The House pair behind an accepted ATTACK or a resolved combat; barbarians are exempt. */
export const attackPairFromSimulationEvent = (event: AttackPairEvent): AttackPair | undefined => {
  if (event.eventType === "COMMAND_ACCEPTED" && event.actionType === "ATTACK" && event.playerId) {
    const defenderId = event.combatResult?.defenderOwnerId;
    if (!defenderId || defenderId === event.playerId || defenderId.startsWith("barbarian") || event.playerId.startsWith("barbarian")) return undefined;
    return { attackerId: event.playerId, defenderId };
  }
  const combat = combatFromSimulationEvent(event);
  return combat && !combat.attackerId.startsWith("barbarian") ? { attackerId: combat.attackerId, defenderId: combat.defenderId } : undefined;
};

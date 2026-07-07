import type { RuntimePlayer } from "./runtime-types.js";
import { createAiRuntimePlayer, createHumanRuntimePlayer, isAiPlayerId } from "./runtime-player-factory.js";

export type GrossIncomeRepairContext = {
  players: Map<string, RuntimePlayer>;
  hasTerritory: (playerId: string) => boolean;
  ensureGrossIncomeSettlementForPlayer: (playerId: string, commandId: string) => boolean;
};

export type GrossIncomeRepairResult = {
  repaired: number;
  /** AI ids (see isAiPlayerId) confirmed present with isAi: true after this pass. */
  aiPlayerIds: string[];
};

// Restores player records that own territory but are missing — or were
// previously mis-repaired — from the runtime's live player map. Two distinct
// failure modes land here:
//   1. A player record is entirely missing (e.g. dropped from a recovered
//      roster) while its tiles still carry an ownerId — reconstruct it.
//   2. A player record already exists but was created by an earlier pass of
//      this same repair that (prior to this fix) always defaulted to
//      isAi: false regardless of the "ai-<n>" id convention — self-heal it
//      back to isAi: true in place, without resetting its accumulated state.
// Both cases are keyed off isAiPlayerId (the "ai-<n>" worldgen naming
// convention), so genuine human ids (Firebase uids, etc.) are never
// misclassified as AI.
export const repairZeroGrossIncomeSettlements = (
  ctx: GrossIncomeRepairContext,
  playerIds: Iterable<string>
): GrossIncomeRepairResult => {
  let repaired = 0;
  const aiPlayerIds: string[] = [];
  for (const playerId of new Set(playerIds)) {
    const isAiId = isAiPlayerId(playerId);
    let player = ctx.players.get(playerId);
    if (!player) {
      if (!ctx.hasTerritory(playerId)) continue;
      player = isAiId ? createAiRuntimePlayer(playerId) : createHumanRuntimePlayer(playerId);
      ctx.players.set(playerId, player);
    } else if (isAiId && !player.isAi) {
      player = { ...player, isAi: true };
      ctx.players.set(playerId, player);
    }
    if (ctx.ensureGrossIncomeSettlementForPlayer(playerId, `startup-gross-income-settlement:${playerId}`)) {
      repaired += 1;
    }
    if (isAiId && player.isAi) aiPlayerIds.push(playerId);
  }
  return { repaired, aiPlayerIds };
};

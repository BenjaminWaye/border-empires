import {
  addPendingSettlementToSummary,
  removePendingSettlementFromSummary,
  type PendingSettlementRecord,
  type PlayerRuntimeSummary
} from "./player-runtime-summary.js";

export const addPendingSettlement = (input: {
  pendingSettlementsByTile: Map<string, PendingSettlementRecord>;
  record: PendingSettlementRecord;
  summaryForPlayer: (playerId: string) => PlayerRuntimeSummary;
  markPlannerPlayerTileCollectionDirty: (playerId: string) => void;
}): void => {
  input.pendingSettlementsByTile.set(input.record.tileKey, input.record);
  addPendingSettlementToSummary(input.summaryForPlayer(input.record.ownerId), input.record);
  input.markPlannerPlayerTileCollectionDirty(input.record.ownerId);
};

export const removePendingSettlement = (input: {
  pendingSettlementsByTile: Map<string, PendingSettlementRecord>;
  tileKey: string;
  summaryForPlayer: (playerId: string) => PlayerRuntimeSummary;
  markPlannerPlayerTileCollectionDirty: (playerId: string) => void;
}): PendingSettlementRecord | undefined => {
  const record = input.pendingSettlementsByTile.get(input.tileKey);
  if (!record) return undefined;
  input.pendingSettlementsByTile.delete(input.tileKey);
  removePendingSettlementFromSummary(input.summaryForPlayer(record.ownerId), input.tileKey);
  input.markPlannerPlayerTileCollectionDirty(record.ownerId);
  return record;
};

export const pendingSettlementMatches = (
  record: PendingSettlementRecord | undefined,
  expected: PendingSettlementRecord
): boolean =>
  Boolean(
    record &&
      record.ownerId === expected.ownerId &&
      record.tileKey === expected.tileKey &&
      record.startedAt === expected.startedAt &&
      record.resolvesAt === expected.resolvesAt &&
      record.goldCost === expected.goldCost
  );

export const cancelPendingSettlementIfOwnerChanged = (input: {
  pendingSettlementsByTile: Map<string, PendingSettlementRecord>;
  tileKey: string;
  nextOwnerId: string | undefined;
  commandId: string;
  summaryForPlayer: (playerId: string) => PlayerRuntimeSummary;
  markPlannerPlayerTileCollectionDirty: (playerId: string) => void;
  emitPlayerStateUpdate: (command: { commandId: string; playerId: string }) => void;
}): PendingSettlementRecord | undefined => {
  const pendingSettlement = input.pendingSettlementsByTile.get(input.tileKey);
  if (!pendingSettlement || pendingSettlement.ownerId === input.nextOwnerId) return undefined;
  removePendingSettlement(input);
  input.emitPlayerStateUpdate({ commandId: input.commandId, playerId: pendingSettlement.ownerId });
  return pendingSettlement;
};

export const pendingSettlementsSnapshotForPlayer = (
  summary: PlayerRuntimeSummary
): Array<{ x: number; y: number; startedAt: number; resolvesAt: number }> =>
  [...summary.pendingSettlementsByTile.values()]
    .map((settlement) => {
      const [rawX, rawY] = settlement.tileKey.split(",");
      const x = Number(rawX);
      const y = Number(rawY);
      return Number.isFinite(x) && Number.isFinite(y) ? { x, y, startedAt: settlement.startedAt, resolvesAt: settlement.resolvesAt } : undefined;
    })
    .filter((settlement): settlement is NonNullable<typeof settlement> => Boolean(settlement))
    .sort((left, right) => (left.resolvesAt - right.resolvesAt) || (left.x - right.x) || (left.y - right.y));

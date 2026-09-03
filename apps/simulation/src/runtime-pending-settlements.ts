import type { DomainTileState } from "@border-empires/game-domain";
import type { SimulationEvent } from "@border-empires/sim-protocol";
import {
  addPendingSettlementToSummary,
  removePendingSettlementFromSummary,
  type PendingSettlementRecord,
  type PlayerRuntimeSummary
} from "./player-runtime-summary.js";
import type { SimulationTileWireDelta } from "./runtime-types.js";
import { tryDrainClaimContinuationBuildTail, resolveTileAfterBuildTail } from "./runtime-claim-continuation-command-handlers.js";
import type { RuntimeDevQueueCommandContext } from "./runtime-dev-queue-command-handlers.js";

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

export type RecoveredSettlementContext = {
  now: () => number;
  scheduleAfter: (delayMs: number, task: () => void) => void;
  tiles: Map<string, DomainTileState>;
  pendingSettlementsByTile: Map<string, PendingSettlementRecord>;
  addPendingSettlement: (record: PendingSettlementRecord) => void;
  removePendingSettlement: (tileKey: string) => PendingSettlementRecord | undefined;
  setTileYieldCollectedAt: (commandId: string, playerId: string, tileKey: string, collectedAt: number) => void;
  replaceTileState: (tileKey: string, tile: DomainTileState) => void;
  devQueueCommandContext: () => RuntimeDevQueueCommandContext;
  emitEvent: (event: SimulationEvent) => void;
  emitAutoFillForSettlement: (settledTile: DomainTileState, ownerId: string, tileKey: string) => void;
  emitPlayerStateUpdate: (command: { commandId: string; playerId: string }) => void;
  tileDeltaFromState: (tile: DomainTileState) => SimulationTileWireDelta;
};

/**
 * Re-schedules completion for any SETTLE still pending when the process last
 * restarted (the setTimeout that would have completed it died with the
 * previous process; the record itself survives via initialState.pendingSettlements).
 * Extracted out of the SimulationRuntime constructor to keep runtime.ts
 * (already over the 500-line cap) from growing.
 *
 * Mirrors resolvePendingSettlement's own completion logic (runtime.ts), which
 * this originally duplicated without the claim-continuation build-tail call
 * below -- so a restart mid-"Settle and Build X" would complete the SETTLE
 * but silently drop the queued BUILD step, leaving the tile SETTLED with
 * nothing built. tryDrainClaimContinuationBuildTail + resolveTileAfterBuildTail
 * close that gap the same way resolvePendingSettlement does: drain the build
 * tail right after the tile is replaced, then re-read live tile state before
 * building the emitted delta, so a synchronous BUILD dispatch is reflected
 * instead of raced by a stale pre-build-tail snapshot.
 */
export const scheduleRecoveredPendingSettlements = (
  context: RecoveredSettlementContext,
  pendingSettlements: readonly PendingSettlementRecord[]
): void => {
  for (const pendingSettlement of pendingSettlements) {
    const pendingTile = context.tiles.get(pendingSettlement.tileKey);
    if (!pendingTile || pendingTile.ownerId !== pendingSettlement.ownerId || pendingTile.ownershipState !== "FRONTIER") continue;
    context.addPendingSettlement({ ...pendingSettlement });
    const delayMs = Math.max(0, pendingSettlement.resolvesAt - context.now());
    context.scheduleAfter(delayMs, () => {
      const currentSettlement = context.pendingSettlementsByTile.get(pendingSettlement.tileKey);
      if (!pendingSettlementMatches(currentSettlement, pendingSettlement)) return;
      context.removePendingSettlement(pendingSettlement.tileKey);
      const latest = context.tiles.get(pendingSettlement.tileKey);
      if (!latest || latest.ownerId !== pendingSettlement.ownerId) {
        context.emitPlayerStateUpdate({ commandId: `recovered-settle:${pendingSettlement.tileKey}`, playerId: pendingSettlement.ownerId });
        return;
      }
      const settledTile: DomainTileState = {
        ...latest,
        ownerId: pendingSettlement.ownerId,
        ownershipState: "SETTLED",
        ...(latest.town ? { town: latest.town } : {})
      };
      const recoveredSettleCommandId = `recovered-settle:${pendingSettlement.tileKey}`;
      context.setTileYieldCollectedAt(recoveredSettleCommandId, pendingSettlement.ownerId, pendingSettlement.tileKey, context.now());
      context.replaceTileState(pendingSettlement.tileKey, settledTile);
      tryDrainClaimContinuationBuildTail(context.devQueueCommandContext(), pendingSettlement.ownerId, pendingSettlement.tileKey, settledTile.x, settledTile.y);
      const tileAfterBuildTail = resolveTileAfterBuildTail(context.tiles, pendingSettlement.tileKey, settledTile);
      context.emitEvent({
        eventType: "TILE_DELTA_BATCH",
        commandId: recoveredSettleCommandId,
        playerId: pendingSettlement.ownerId,
        // ownerId/ownershipState forced regardless of the sparse-diff cache:
        // a FRONTIER->SETTLED transition must never omit identity fields,
        // since any subscriber whose local copy doesn't already have them
        // (e.g. after a stale bootstrap resync) would never learn this
        // tile is owned — sparse-diffing assumes "unchanged" is safe to
        // drop, which isn't true across a full client resync.
        tileDeltas: [{ ...context.tileDeltaFromState(tileAfterBuildTail), ownerId: tileAfterBuildTail.ownerId ?? undefined, ownershipState: tileAfterBuildTail.ownershipState ?? undefined }]
      });
      context.emitAutoFillForSettlement(settledTile, pendingSettlement.ownerId, pendingSettlement.tileKey);
      context.emitPlayerStateUpdate({ commandId: recoveredSettleCommandId, playerId: pendingSettlement.ownerId });
      context.emitEvent({ eventType: "COMMAND_RESOLVED", commandId: recoveredSettleCommandId, playerId: pendingSettlement.ownerId });
    });
  }
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

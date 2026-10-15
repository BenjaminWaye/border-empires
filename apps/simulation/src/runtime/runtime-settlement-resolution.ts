import { appendOccupationSurveyReports, type DomainPlayer, type DomainTileState } from "@border-empires/game-domain";
import type { CommandEnvelope, SimulationEvent } from "@border-empires/sim-protocol";
import type { SimulationTileWireDelta } from "../runtime-types.js";
import { SETTLE_COST } from "@border-empires/shared";
import { pendingSettlementMatches, type PendingSettlementRecord } from "../player-runtime-summary.js";
import { resolveTileAfterBuildTail } from "../runtime-claim-continuation-command-handlers.js";

export type SettlementResolutionInput = Omit<PendingSettlementRecord, "goldCost">;

export interface SettlementResolutionContext {
  pendingSettlementsByTile: ReadonlyMap<string, PendingSettlementRecord>;
  tiles: ReadonlyMap<string, DomainTileState>;
  players: ReadonlyMap<string, DomainPlayer>;
  removePendingSettlement(tileKey: string): void;
  drainDevQueue(ownerId: string): void;
  retireQueuedSettlement(ownerId: string, tileKey: string): void;
  drainAutoSettle(ownerId: string): number;
  drainBuildTail(ownerId: string, tileKey: string, x: number, y: number): void;
  emitPlayerStateUpdate(command: Pick<CommandEnvelope, "commandId" | "playerId">): void;
  now(): number;
  replaceTileState(tileKey: string, tile: DomainTileState): void;
  tileDeltaFromState(tile: DomainTileState): SimulationTileWireDelta;
  emitEvent(event: SimulationEvent): void;
  emitAutoFillForSettlement(tile: DomainTileState, ownerId: string, tileKey: string): void;
}

export const resolvePendingSettlement = (context: SettlementResolutionContext, input: SettlementResolutionInput): void => {
  const expectedSettlement = {
    ownerId: input.ownerId,
    tileKey: input.tileKey,
    startedAt: input.startedAt,
    resolvesAt: input.resolvesAt,
    goldCost: SETTLE_COST,
    commandId: input.commandId
  };
  const currentSettlement = context.pendingSettlementsByTile.get(input.tileKey);
  if (!pendingSettlementMatches(currentSettlement, expectedSettlement)) return;
  context.removePendingSettlement(input.tileKey);
  const latest = context.tiles.get(input.tileKey);
  if (
    !latest ||
    latest.ownerId !== input.ownerId ||
    latest.ownershipState !== "FRONTIER"
  ) {
    context.drainDevQueue(input.ownerId);
    context.emitPlayerStateUpdate({ commandId: input.commandId, playerId: input.ownerId });
    // Slot-freed drain (Design §5) even when the settlement itself didn't
    // land (tile lost FRONTIER/ownership before this fired) -- the dev
    // slot is still freed either way.
    context.drainAutoSettle(input.ownerId);
    return;
  }
  const settledTile: DomainTileState = {
    ...latest,
    ownerId: input.ownerId,
    ownershipState: "SETTLED",
    ...(latest.town ? { town: latest.town } : {})
  };
  context.replaceTileState(input.tileKey, settledTile);
  context.retireQueuedSettlement(input.ownerId, input.tileKey);
  // Commit ownership before a freed slot can dispatch another queued action.
  context.drainDevQueue(input.ownerId);
  // Slot-freed drain (Design §5): replaceTileState above already removed
  // this now-SETTLED tile from eligibleFrontierByOwner (it's no longer
  // FRONTIER), so draining here can't immediately re-consume the slot it
  // just freed by re-settling the SAME tile -- the next QUEUED eligible
  // tile starts this same tick instead of waiting for the next 30s pass.
  context.drainAutoSettle(input.ownerId);
  context.drainBuildTail(input.ownerId, input.tileKey, settledTile.x, settledTile.y);
  const tileAfterBuildTail = resolveTileAfterBuildTail(context.tiles, input.tileKey, settledTile); // see doc comment at definition
  context.emitEvent({ eventType: "TILE_DELTA_BATCH",
    commandId: input.commandId,
    playerId: input.ownerId,
    // ownerId/ownershipState forced regardless of the sparse-diff cache; see
    // the recovered-settle path above for why "unchanged" isn't safe to drop here.
    tileDeltas: [{ ...context.tileDeltaFromState(tileAfterBuildTail), ownerId: tileAfterBuildTail.ownerId ?? undefined, ownershipState: tileAfterBuildTail.ownershipState ?? undefined }]
  });
  context.emitAutoFillForSettlement(settledTile, input.ownerId, input.tileKey);
  // Garrisoning a neutral town surveys the land around it: any resource clue
  // within a few tiles becomes a standing "<Resource> likely <bearing> of this
  // town" report until you research that resource's reveal Manifest. Towns
  // taken from another empire (marked by populationBeforeCapture) don't
  // count -- the survey rewards peaceful expansion into unclaimed towns.
  const owner = context.players.get(input.ownerId);
  if (owner && settledTile.town && settledTile.town.populationBeforeCapture === undefined) {
    appendOccupationSurveyReports(owner, context.tiles, settledTile.x, settledTile.y, context.now());
  }
  context.emitPlayerStateUpdate({ commandId: input.commandId, playerId: input.ownerId });
  context.emitEvent({ eventType: "COMMAND_RESOLVED", commandId: input.commandId, playerId: input.ownerId });
};

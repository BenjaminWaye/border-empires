import type { DomainPlayer, DomainTileState } from "@border-empires/game-domain";
import { structureBuildManpowerCost, type BuildableStructureType, type MonumentalStructureType } from "@border-empires/shared";
import { monumentClaimOwnerId, monumentPartTypeForBaseType, otherPlayersMonumentPartOwners } from "./monument-uniqueness.js";
import { displayNameForOwnershipChange } from "./runtime/runtime-ownership-change-sample.js";
import { applyStructureCancelRefund, economicOrObservatoryCancelRefund } from "./runtime-structure-lifecycle-command-handlers.js";
import { structureLabel, type RuntimeStructureCommandContext } from "./runtime-structure-command-handlers.js";

// §16: the moment a monument assembly completes, the type is claimed for the
// rest of the season (handleBuildStructureCommand's monumentClaimOwnerId
// gate blocks every further part/assembly of this type from here on). Every
// human/AI player hears about it, and any OTHER player who'd sunk manpower
// into that same monument's parts gets it back — a lost race costs the time
// and the queued slot, not the manpower itself.
export function announceMonumentClaim(
  context: RuntimeStructureCommandContext,
  baseType: MonumentalStructureType,
  winnerId: string,
  commandId: string
): void {
  const winnerName = displayNameForOwnershipChange(winnerId, context.players);
  const label = structureLabel(baseType).replace(/\b\w/g, (c) => c.toUpperCase());
  const partType = monumentPartTypeForBaseType(baseType);
  const refundAmount = structureBuildManpowerCost(partType as BuildableStructureType);
  const loserIds = new Set(otherPlayersMonumentPartOwners(context.tiles, partType, winnerId));

  for (const player of context.players.values()) {
    if (player.id === winnerId) {
      appendEntry(context, player, "MONUMENT_CLAIMED", `Your ${label} is complete — claimed for the season. No other empire may build one.`, context.now());
      continue;
    }
    if (loserIds.has(player.id)) {
      // Refund always applies, AI included — this is a real economic
      // correction, not just a display notice.
      player.manpower = Math.min(context.playerManpowerCap(player), player.manpower + refundAmount);
      context.emitPlayerStateUpdate({ commandId, playerId: player.id });
      appendEntry(
        context,
        player,
        "MONUMENT_LOST_TO_RIVAL",
        `${winnerName} completed the ${label} first. Your invested manpower (${refundAmount.toFixed(0)}) has been refunded.`,
        context.now()
      );
      continue;
    }
    appendEntry(context, player, "MONUMENT_CLAIMED", `${winnerName} has completed the ${label} — it is now claimed for the season.`, context.now());
  }
}

// §16: two players can each have an assembly "under_construction" at the
// same time (handleBuildStructureCommand's reject gate only sees an already
// ACTIVE assembly, so both submissions can be accepted before either build
// timer fires) — completeStructureBuild calls this for whichever one loses
// that race instead of letting a second instance go active. Refunds exactly
// what the assembly build charged (mirrors handleCancelStructureBuildCommand's
// own refund path) and clears the tile back to empty.
export function resolveLostMonumentAssemblyRace(
  context: RuntimeStructureCommandContext,
  targetKey: string,
  latest: DomainTileState,
  ownerId: string,
  baseType: MonumentalStructureType,
  commandId: string
): void {
  const winnerId = monumentClaimOwnerId(context.tiles, baseType);
  const winnerName = displayNameForOwnershipChange(winnerId, context.players);
  const label = structureLabel(baseType).replace(/\b\w/g, (c) => c.toUpperCase());
  const actor = context.players.get(ownerId);
  if (actor) {
    applyStructureCancelRefund(context, actor, economicOrObservatoryCancelRefund(context, ownerId, baseType as BuildableStructureType));
    appendEntry(
      context,
      actor,
      "MONUMENT_LOST_TO_RIVAL",
      `${winnerName} completed the ${label} moments before yours finished. Your investment has been refunded.`,
      context.now()
    );
  }
  const { economicStructure: _drop, ...tileWithoutMonument } = latest;
  const clearedTile = { ...tileWithoutMonument } as DomainTileState;
  context.replaceTileState(targetKey, clearedTile);
  context.emitEvent({ eventType: "TILE_DELTA_BATCH", commandId, playerId: ownerId, tileDeltas: [context.tileDeltaFromState(clearedTile)] });
  context.emitPlayerStateUpdate({ commandId, playerId: ownerId });
  context.emitEvent({ eventType: "COMMAND_RESOLVED", commandId, playerId: ownerId });
}

function appendEntry(
  context: RuntimeStructureCommandContext,
  player: DomainPlayer,
  type: "MONUMENT_CLAIMED" | "MONUMENT_LOST_TO_RIVAL",
  text: string,
  occurredAt: number
): void {
  if (player.id.startsWith("barbarian-") || player.isAi) return;
  context.appendPlayerEventLogEntry(player, { type, text, occurredAt });
}

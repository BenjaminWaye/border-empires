import type { DomainPlayer } from "@border-empires/game-domain";
import { structureBuildManpowerCost, type BuildableStructureType, type MonumentalStructureType } from "@border-empires/shared";
import { monumentPartTypeForBaseType, otherPlayersMonumentPartOwners } from "./monument-uniqueness.js";
import { displayNameForOwnershipChange } from "./runtime/runtime-ownership-change-sample.js";
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
      player.manpower = Math.min(context.playerManpowerCap(player), player.manpower + refundAmount);
      appendEntry(
        context,
        player,
        "MONUMENT_LOST_TO_RIVAL",
        `${winnerName} completed the ${label} first. Your invested manpower (${refundAmount.toFixed(0)}) has been refunded.`,
        context.now()
      );
      context.emitPlayerStateUpdate({ commandId, playerId: player.id });
      continue;
    }
    appendEntry(context, player, "MONUMENT_CLAIMED", `${winnerName} has completed the ${label} — it is now claimed for the season.`, context.now());
  }
}

function appendEntry(
  context: RuntimeStructureCommandContext,
  player: DomainPlayer,
  type: "MONUMENT_CLAIMED" | "MONUMENT_LOST_TO_RIVAL",
  text: string,
  occurredAt: number
): void {
  if (player.id.startsWith("barbarian-")) return;
  context.appendPlayerEventLogEntry(player, { type, text, occurredAt });
}

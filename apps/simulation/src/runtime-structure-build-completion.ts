import type { DomainTileState } from "@border-empires/game-domain";
import { MINTWORKS_INSTANT_GOLD_BONUS } from "@border-empires/game-domain";
import { GRANARY_INSTANT_POPULATION_BURST, STRUCTURE_REGISTRY, type MonumentalStructureType } from "@border-empires/shared";
import type { SimulationTileWireDelta } from "./runtime-types.js";
import type { RuntimeStructureCommandContext } from "./runtime-structure-command-handlers.js";
import { isMonumentBaseType, monumentClaimOwnerId, monumentPartTypesForBaseType } from "./monument-uniqueness.js";
import { announceMonumentClaim, resolveLostMonumentAssemblyRace } from "./runtime-monument-claim.js";

// Extracted out of runtime-structure-command-handlers.ts so that file stays
// net-smaller (500-line budget, AGENTS.md). Build-completion helpers and the
// completion handler itself: the Granary instant population burst and
// completeStructureBuild.
//
// Converters used to start mode-locked on build completion (converterBuildModeLockFields,
// removed) so that "build in cheap mode, flip immediately" wasn't a cheaper path to the
// expensive mode. That lock isn't needed: a freshly built converter already defaults to
// SYNTHESIZE unlocked, and handleSetConverterStructureModeCommand
// (runtime-economic-structure-command-handlers.ts) re-locks on every successful flip
// regardless of direction — so at most one flip is ever free, same as before.

// Consumes (removes) every one of the owner's active components for the
// monument that just completed — a completed monument no longer needs the
// staging structures that assembled it, and its own CRYSTAL slot cost was
// raised by 3 (the total the 3 components occupied) specifically to account
// for this.
export function consumeMonumentParts(
  context: RuntimeStructureCommandContext,
  ownerId: string,
  baseType: MonumentalStructureType,
  commandId: string
): void {
  const partTypes = new Set(monumentPartTypesForBaseType(baseType));
  const matchingKeys: string[] = [];
  for (const [tileKey, tile] of context.tiles) {
    if (tile.economicStructure?.ownerId === ownerId && tile.economicStructure.status === "active" && partTypes.has(tile.economicStructure.type)) {
      matchingKeys.push(tileKey);
    }
  }
  if (matchingKeys.length === 0) return;
  const tileDeltas: SimulationTileWireDelta[] = [];
  for (const tileKey of matchingKeys) {
    const tile = context.tiles.get(tileKey);
    if (!tile) continue;
    const clearedTile = { ...tile, economicStructure: undefined } as DomainTileState;
    context.replaceTileState(tileKey, clearedTile, commandId);
    tileDeltas.push(context.tileDeltaFromState(clearedTile));
  }
  if (tileDeltas.length > 0) {
    context.emitEvent({ eventType: "TILE_DELTA_BATCH", commandId, playerId: ownerId, tileDeltas });
    context.emitPlayerStateUpdate({ commandId, playerId: ownerId });
  }
}

export function grantGranaryPopulationBurst(
  context: RuntimeStructureCommandContext,
  ownerId: string,
  x: number,
  y: number,
  commandId: string
): void {
  const townKey = context.assignedTownKeyForSupportTile(ownerId, x, y);
  if (!townKey) return;
  const townTile = context.tiles.get(townKey);
  if (!townTile?.town || townTile.ownerId !== ownerId) return;
  const updatedTownTile: DomainTileState = {
    ...townTile,
    town: {
      ...townTile.town,
      population: (townTile.town.population ?? 0) + GRANARY_INSTANT_POPULATION_BURST,
      maxPopulation: (townTile.town.maxPopulation ?? 0) + GRANARY_INSTANT_POPULATION_BURST
    }
  };
  context.replaceTileState(townKey, updatedTownTile, commandId);
  context.emitEvent({
    eventType: "TILE_DELTA_BATCH",
    commandId,
    playerId: ownerId,
    tileDeltas: [context.tileDeltaFromState(updatedTownTile)]
  });
}

export function grantMintworksInstantGoldBonus(
  context: RuntimeStructureCommandContext,
  ownerId: string
): void {
  const owner = context.players.get(ownerId);
  if (!owner) return;
  owner.points += MINTWORKS_INSTANT_GOLD_BONUS;
}

export function completeStructureBuild(context: RuntimeStructureCommandContext, targetKey: string, ownerId: string, structureType: string, commandId: string): void {
  const spec = STRUCTURE_REGISTRY[structureType];
  if (!spec) return;
  const latest = context.tiles.get(targetKey);
  if (!latest || latest.ownerId !== ownerId) return;
  const structure = latest[spec.tileField];
  if (!structure || structure.ownerId !== ownerId || structure.status !== "under_construction") return;
  if (spec.tileField === "economicStructure" && latest.economicStructure?.type !== structureType) return;

  // §16: two players' assemblies can both be "under_construction" at once (the reject gate only sees an already-ACTIVE one) — the completion race's loser must not also go active.
  if (isMonumentBaseType(structureType)) {
    const claimedBy = monumentClaimOwnerId(context.tiles, structureType);
    if (claimedBy && claimedBy !== ownerId) {
      resolveLostMonumentAssemblyRace(context, targetKey, latest, ownerId, structureType, commandId);
      return;
    }
  }

  const { completesAt: _, ...activeStructure } = structure;
  const clearingWoodenFort =
    spec.tileField === "fort" &&
    latest.economicStructure?.type === "WOODEN_FORT" &&
    latest.economicStructure?.ownerId === ownerId;

  const completedTile = {
    ...latest,
    ...(clearingWoodenFort ? { economicStructure: undefined } : {}),
    [spec.tileField]: {
      ...activeStructure,
      status: "active",
      activatedAt: context.now()
    }
  } as DomainTileState;

  context.replaceTileState(targetKey, completedTile);
  context.emitEvent({ eventType: "TILE_DELTA_BATCH", commandId, playerId: ownerId, tileDeltas: [context.tileDeltaFromState(completedTile)] });
  // Mintworks rebalance (structure-detail-screen task): instant one-time gold
  // grant on completion, on top of its ongoing flat/percentage gold bonuses.
  // Credited before the single emitPlayerStateUpdate call below so that
  // broadcast carries the post-bonus gold total rather than a stale value
  // followed by a second, redundant PLAYER_UPDATE.
  if (structureType === "MINTWORKS") {
    grantMintworksInstantGoldBonus(context, ownerId);
  }
  context.emitPlayerStateUpdate({ commandId, playerId: ownerId });
  context.emitEvent({ eventType: "COMMAND_RESOLVED", commandId, playerId: ownerId });
  // Relay Beacon's vision bonus (and, once active, a Siege Outpost's own)
  // is applied by reconcileOutpostVisionBonus via the replaceTileState call
  // above — runtime-outpost-vision.ts.
  if (isMonumentBaseType(structureType)) {
    announceMonumentClaim(context, structureType, ownerId, commandId, completedTile.x, completedTile.y);
    consumeMonumentParts(context, ownerId, structureType, commandId);
  }
  // Incubation Engine (Granary, tech-tree redesign): instant one-time
  // +10,000 population burst on build completion, applied to both the
  // town's current population AND its cap (a burst that gets silently
  // absorbed into existing headroom wouldn't read as a "burst" at all).
  if (structureType === "GRANARY") {
    grantGranaryPopulationBurst(context, ownerId, completedTile.x, completedTile.y, commandId);
  }
  // Relay Beacon (and other reach-anchor) activations happened synchronously
  // inside replaceTileState above, but this completion itself runs off a
  // scheduleAfter timer rather than queueCommandForProcessing, so the border
  // change must be flushed explicitly here or it sits dirty until some other
  // command happens to trigger a flush.
  context.flushReachUpdates(`reach-update:${commandId}`);
}
